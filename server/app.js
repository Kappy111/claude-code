import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, one, num, ready } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  parseCookies, cookieOptions, requireAuth,
} from './auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use((req, _res, next) => { req.cookies = parseCookies(req.headers.cookie); ready().then(() => next(), next); });
app.use(express.static(path.join(root, 'public')));

const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;
const now = () => Date.now();
const ONLINE_WINDOW = 25_000;
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---------- helpers ----------
async function membersOf(convId) {
  return (await query(`SELECT u.id, u.username, u.display_name, m.last_read_id
                       FROM members m JOIN users u ON u.id = m.user_id
                       WHERE m.conversation_id = $1 ORDER BY u.id`, [convId])).map(num);
}

async function conversationsFor(userId, onlyId = null) {
  const rows = await query(`
    SELECT c.id, c.is_group, c.name,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.id > me.last_read_id AND m.sender_id <> $1) AS unread,
      lm.body AS lm_body, lm.created_at AS lm_created_at, lm.sender_id AS lm_sender_id,
      COALESCE(lm.created_at, c.created_at) AS sort_at
    FROM conversations c
    JOIN members me ON me.conversation_id = c.id AND me.user_id = $1
    LEFT JOIN LATERAL (SELECT body, created_at, sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) lm ON TRUE
    WHERE ($2::bigint IS NULL OR c.id = $2)
    ORDER BY sort_at DESC`, [userId, onlyId]);
  return Promise.all(rows.map(async (r) => ({
    id: Number(r.id), is_group: !!r.is_group, name: r.name, unread: Number(r.unread),
    last_message: r.lm_body == null ? null : { body: r.lm_body, created_at: Number(r.lm_created_at), sender_id: Number(r.lm_sender_id) },
    members: await membersOf(Number(r.id)),
  })));
}

const isMember = async (convId, userId) =>
  !!(await one('SELECT 1 FROM members WHERE conversation_id = $1 AND user_id = $2', [convId, userId]));

async function emit(userIds, type, payload) {
  const t = now(), body = JSON.stringify(payload);
  for (const id of userIds) await query('INSERT INTO events (user_id, type, payload, created_at) VALUES ($1, $2, $3, $4)', [id, type, body, t]);
}
async function emitToConversation(convId, type, payload, except = null) {
  const ids = (await membersOf(convId)).map((m) => m.id).filter((id) => id !== except);
  await emit(ids, type, payload);
}

// ---------- auth ----------
app.post('/api/register', wrap(async (req, res) => {
  const { username = '', password = '', displayName = '' } = req.body || {};
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-24 letters, digits or underscores' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const uname = username.toLowerCase();
  if (await one('SELECT 1 FROM users WHERE username = $1', [uname])) return res.status(409).json({ error: 'Username is taken' });
  const display = displayName.trim().slice(0, 40) || username;
  const row = await one('INSERT INTO users (username, display_name, password_hash, created_at, last_seen) VALUES ($1, $2, $3, $4, $4) RETURNING id',
    [uname, display, hashPassword(password), now()]);
  const id = Number(row.id);
  res.cookie('session', await createSession(id), cookieOptions());
  res.json({ user: { id, username: uname, display_name: display } });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const row = num(await one('SELECT id, username, display_name, password_hash FROM users WHERE username = $1', [String(username).toLowerCase()]));
  if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'Wrong username or password' });
  res.cookie('session', await createSession(row.id), cookieOptions());
  res.json({ user: { id: row.id, username: row.username, display_name: row.display_name } });
}));

app.post('/api/logout', wrap(async (req, res) => {
  if (req.cookies.session) await destroySession(req.cookies.session);
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

// ---------- data ----------
app.get('/api/users', requireAuth, wrap(async (req, res) => {
  const term = `%${String(req.query.q || '').replace(/[%_\\]/g, '')}%`;
  const rows = await query(`SELECT id, username, display_name FROM users
                            WHERE (username ILIKE $1 OR display_name ILIKE $1) AND id <> $2 ORDER BY username LIMIT 20`, [term, req.user.id]);
  res.json({ users: rows.map(num) });
}));

app.get('/api/conversations', requireAuth, wrap(async (req, res) => {
  res.json({ conversations: await conversationsFor(req.user.id) });
}));

app.post('/api/conversations', requireAuth, wrap(async (req, res) => {
  const { username, name, usernames } = req.body || {};
  const t = now();

  if (username) {
    const other = num(await one('SELECT id FROM users WHERE username = $1', [String(username).toLowerCase()]));
    if (!other) return res.status(404).json({ error: 'No such user' });
    if (other.id === req.user.id) return res.status(400).json({ error: 'That is you' });
    const key = [req.user.id, other.id].sort((a, b) => a - b).join(':');
    let conv = num(await one('SELECT id FROM conversations WHERE dm_key = $1', [key]));
    if (!conv) {
      conv = num(await one('INSERT INTO conversations (is_group, dm_key, created_by, created_at) VALUES (FALSE, $1, $2, $3) RETURNING id', [key, req.user.id, t]));
      for (const id of [req.user.id, other.id]) await query('INSERT INTO members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3)', [conv.id, id, t]);
      await emit([other.id], 'conversation', { conversation: (await conversationsFor(other.id, conv.id))[0] });
    }
    return res.json({ conversation: (await conversationsFor(req.user.id, conv.id))[0] });
  }

  if (Array.isArray(usernames)) {
    const groupName = String(name || '').trim().slice(0, 60);
    if (!groupName) return res.status(400).json({ error: 'Group needs a name' });
    const ids = new Set([req.user.id]);
    for (const u of usernames.slice(0, 50)) {
      const row = num(await one('SELECT id FROM users WHERE username = $1', [String(u).toLowerCase()]));
      if (row) ids.add(row.id);
    }
    if (ids.size < 2) return res.status(400).json({ error: 'Add at least one other person' });
    const conv = num(await one('INSERT INTO conversations (is_group, name, created_by, created_at) VALUES (TRUE, $1, $2, $3) RETURNING id', [groupName, req.user.id, t]));
    for (const id of ids) await query('INSERT INTO members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3)', [conv.id, id, t]);
    for (const id of ids) if (id !== req.user.id) await emit([id], 'conversation', { conversation: (await conversationsFor(id, conv.id))[0] });
    return res.json({ conversation: (await conversationsFor(req.user.id, conv.id))[0] });
  }
  res.status(400).json({ error: 'Provide username or usernames' });
}));

app.get('/api/conversations/:id/messages', requireAuth, wrap(async (req, res) => {
  const convId = Number(req.params.id);
  if (!(await isMember(convId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = await query(`SELECT id, conversation_id, sender_id, body, created_at FROM messages
                            WHERE conversation_id = $1 AND id < $2 ORDER BY id DESC LIMIT 50`, [convId, before]);
  res.json({ messages: rows.map(num).reverse() });
}));

app.post('/api/conversations/:id/messages', requireAuth, wrap(async (req, res) => {
  const convId = Number(req.params.id);
  if (!(await isMember(convId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Empty message' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });
  const t = now();
  const row = await one('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id', [convId, req.user.id, body, t]);
  const message = { id: Number(row.id), conversation_id: convId, sender_id: req.user.id, body, created_at: t };
  await query('UPDATE members SET last_read_id = $1, typing_until = 0 WHERE conversation_id = $2 AND user_id = $3', [message.id, convId, req.user.id]);
  await emitToConversation(convId, 'message', { message }, req.user.id);
  res.json({ message });
}));

app.post('/api/conversations/:id/read', requireAuth, wrap(async (req, res) => {
  const convId = Number(req.params.id);
  if (!(await isMember(convId, req.user.id))) return res.status(403).json({ error: 'Not a member' });
  const lastId = Number(req.body?.lastId) || 0;
  await query('UPDATE members SET last_read_id = GREATEST(last_read_id, $1) WHERE conversation_id = $2 AND user_id = $3', [lastId, convId, req.user.id]);
  await emitToConversation(convId, 'read', { conversation_id: convId, user_id: req.user.id, last_read_id: lastId }, req.user.id);
  res.json({ ok: true });
}));

app.post('/api/conversations/:id/typing', requireAuth, wrap(async (req, res) => {
  const convId = Number(req.params.id);
  await query('UPDATE members SET typing_until = $1 WHERE conversation_id = $2 AND user_id = $3', [now() + 4000, convId, req.user.id]);
  res.json({ ok: true });
}));

// The client polls this. It returns queued events, who is online, and who is typing in the open chat.
app.get('/api/sync', requireAuth, wrap(async (req, res) => {
  const since = Number(req.query.since) || 0;
  const conv = Number(req.query.conv) || 0;
  const t = now();
  await query('UPDATE users SET last_seen = $1 WHERE id = $2', [t, req.user.id]);
  const events = (await query('SELECT id, type, payload FROM events WHERE user_id = $1 AND id > $2 ORDER BY id LIMIT 200', [req.user.id, since]))
    .map((e) => ({ id: Number(e.id), type: e.type, ...JSON.parse(e.payload) }));
  const online = (await query(`SELECT DISTINCT u.id FROM members m1
                               JOIN members m2 ON m2.conversation_id = m1.conversation_id AND m2.user_id <> $1
                               JOIN users u ON u.id = m2.user_id
                               WHERE m1.user_id = $1 AND u.last_seen > $2`, [req.user.id, t - ONLINE_WINDOW])).map((r) => Number(r.id));
  const typing = conv ? (await query('SELECT user_id FROM members WHERE conversation_id = $1 AND user_id <> $2 AND typing_until > $3', [conv, req.user.id, t])).map((r) => Number(r.user_id)) : [];
  const cursor = events.length ? events[events.length - 1].id : since || Number((await one('SELECT COALESCE(MAX(id), 0) AS id FROM events')).id);
  if (Math.random() < 0.02) await query('DELETE FROM events WHERE created_at < $1', [t - 86_400_000]);
  res.json({ cursor, events, online, typing, now: t });
}));

app.get('*', (_req, res) => res.sendFile(path.join(root, 'public/index.html')));
app.use((err, _req, res, _next) => { console.error(err); res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' }); });

export default app;
