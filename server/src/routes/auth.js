import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { presentUser, getUserById } from '../lib/present.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const findByUsername = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
const findByEmail = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');

const insertUser = db.prepare(`
  INSERT INTO users (id, username, display_name, email, password_hash, auth_provider, profile_image, bio)
  VALUES (@id, @username, @display_name, @email, @password_hash, @auth_provider, @profile_image, @bio)
`);

router.post('/signup', async (req, res) => {
  const { email, password, username, displayName, profileImage, bio } = req.body || {};

  if (!username || !USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Username must be 3–20 characters: letters, numbers, underscores.' });
  if (!email || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!displayName || !displayName.trim())
    return res.status(400).json({ error: 'Display name is required.' });

  if (await findByUsername.get(username)) return res.status(409).json({ error: 'Username already taken.' });
  if (await findByEmail.get(email)) return res.status(409).json({ error: 'An account with that email already exists.' });

  const id = nanoid();
  await insertUser.run({
    id,
    username,
    display_name: displayName.trim(),
    email,
    password_hash: bcrypt.hashSync(password, 10),
    auth_provider: 'email',
    profile_image: profileImage || null,
    bio: (bio || '').slice(0, 300),
  });

  // Auto-verify the owner account the moment it's created.
  const owner = process.env.OMNIFEED_OWNER_USERNAME;
  if (owner && username.toLowerCase() === owner.toLowerCase())
    await db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(id);

  const token = signToken(id);
  res.status(201).json({ token, user: await presentUser(await getUserById(id), id) });
});

router.post('/login', async (req, res) => {
  const { identifier, email, username, password } = req.body || {};
  const id = identifier || email || username;
  if (!id || !password) return res.status(400).json({ error: 'Enter your username/email and password.' });

  const row = id.includes('@') ? await findByEmail.get(id) : await findByUsername.get(id);
  if (!row || !row.password_hash || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: 'Invalid login. Check your credentials and try again.' });

  const token = signToken(row.id);
  res.json({ token, user: await presentUser(row, row.id) });
});

router.post('/oauth/:provider', async (req, res) => {
  const provider = req.params.provider;
  if (!['google', 'apple'].includes(provider))
    return res.status(400).json({ error: 'Unsupported provider.' });
  const { email, displayName, profileImage } = req.body || {};
  if (!email || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'A valid email is required for social login.' });

  let row = await findByEmail.get(email);
  if (!row) {
    let base = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';
    let candidate = base;
    let n = 0;
    while (await findByUsername.get(candidate)) { n += 1; candidate = `${base}${n}`.slice(0, 20); }
    const id = nanoid();
    await insertUser.run({
      id,
      username: candidate,
      display_name: (displayName || base).trim(),
      email,
      password_hash: null,
      auth_provider: provider,
      profile_image: profileImage || null,
      bio: '',
    });
    row = await getUserById(id);
  }
  const token = signToken(row.id);
  res.json({ token, user: await presentUser(row, row.id) });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await presentUser(req.user, req.user.id) });
});

router.get('/check-username', async (req, res) => {
  const u = String(req.query.username || '');
  if (!USERNAME_RE.test(u)) return res.json({ available: false, reason: 'invalid' });
  res.json({ available: !(await findByUsername.get(u)) });
});

export default router;
