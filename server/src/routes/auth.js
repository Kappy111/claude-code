import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { presentUser, getUserById } from '../lib/present.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const findByUsername = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
const findByEmail = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');

const insertUser = db.prepare(`
  INSERT INTO users (id, username, display_name, email, password_hash, auth_provider, profile_image, bio)
  VALUES (@id, @username, @display_name, @email, @password_hash, @auth_provider, @profile_image, @bio)
`);

router.post('/signup', (req, res) => {
  const { email, password, username, displayName, profileImage, bio } = req.body || {};

  if (!username || !USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Username must be 3–20 characters: letters, numbers, underscores.' });
  if (!email || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!displayName || !displayName.trim())
    return res.status(400).json({ error: 'Display name is required.' });

  if (findByUsername.get(username)) return res.status(409).json({ error: 'Username already taken.' });
  if (findByEmail.get(email)) return res.status(409).json({ error: 'An account with that email already exists.' });

  const id = nanoid();
  insertUser.run({
    id,
    username,
    display_name: displayName.trim(),
    email,
    password_hash: bcrypt.hashSync(password, 10),
    auth_provider: 'email',
    profile_image: profileImage || null,
    bio: (bio || '').slice(0, 300),
  });

  const token = signToken(id);
  res.status(201).json({ token, user: presentUser(getUserById(id), id) });
});

router.post('/login', (req, res) => {
  const { identifier, email, username, password } = req.body || {};
  const id = identifier || email || username;
  if (!id || !password) return res.status(400).json({ error: 'Enter your username/email and password.' });

  const row = id.includes('@') ? findByEmail.get(id) : findByUsername.get(id);
  if (!row || !row.password_hash || !bcrypt.compareSync(password, row.password_hash))
    return res.status(401).json({ error: 'Invalid login. Check your credentials and try again.' });

  const token = signToken(row.id);
  res.json({ token, user: presentUser(row, row.id) });
});

// Simulated OAuth: creates (or logs into) an account tied to a provider identity.
router.post('/oauth/:provider', (req, res) => {
  const provider = req.params.provider;
  if (!['google', 'apple'].includes(provider))
    return res.status(400).json({ error: 'Unsupported provider.' });
  const { email, displayName, profileImage } = req.body || {};
  if (!email || !EMAIL_RE.test(email))
    return res.status(400).json({ error: 'A valid email is required for social login.' });

  let row = findByEmail.get(email);
  if (!row) {
    // auto-provision a unique username from the email handle
    let base = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user';
    let candidate = base;
    let n = 0;
    while (findByUsername.get(candidate)) { n += 1; candidate = `${base}${n}`.slice(0, 20); }
    const id = nanoid();
    insertUser.run({
      id,
      username: candidate,
      display_name: (displayName || base).trim(),
      email,
      password_hash: null,
      auth_provider: provider,
      profile_image: profileImage || null,
      bio: '',
    });
    row = getUserById(id);
  }
  const token = signToken(row.id);
  res.json({ token, user: presentUser(row, row.id) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: presentUser(req.user, req.user.id) });
});

// Username availability check (used during signup / settings)
router.get('/check-username', (req, res) => {
  const u = String(req.query.username || '');
  if (!USERNAME_RE.test(u)) return res.json({ available: false, reason: 'invalid' });
  res.json({ available: !findByUsername.get(u) });
});

export default router;
