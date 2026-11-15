import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { q, db } from './db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession,
  userFromToken, parseCookies, cookieOptions, requireAuth,
} from './auth.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use((req, _res, next) => { req.cookies = parseCookies(req.headers.cookie); next(); });
app.use(express.static(path.resolve('public')));

// ---------- helpers ----------
const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;
const now = () => Date.now();

function conversationsFor(userId) {
  return q(`
    SELECT c.id, c.is_group, c.name,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.id > me.last_read_id AND m.sender_id != ?) AS unread,
      (SELECT json_object('body', m.body, 'created_at', m.created_at, 'sender_id', m.sender_id)
         FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT MAX(m.id) FROM messages m WHERE m.conversation_id = c.id) AS last_id
    FROM conversations c
    JOIN members me ON me.conversation_id = c.id AND me.user_id = ?
    ORDER BY COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC
  `).all(userId, userId).map((c) => ({
    ...c,
    is_group: !!c.is_group,
    last_message: c.last_message ? JSON.parse(c.last_message) : null,
    members: membersOf(c.id),
  }));
}

function membersOf(convId) {
  return q(`SELECT u.id, u.username, u.display_name, m.last_read_id
            FROM members m JOIN users u ON u.id = m.user_id
            WHERE m.conversation_id = ?`).all(convId);
}

function isMember(convId, userId) {
  return !!q('SELECT 1 FROM members WHERE conversation_id = ? AND user_id = ?').get(convId, userId);
}

// ---------- auth routes ----------
app.post('/api/register', (req, res) => {
  const { username = '', password = '', displayName = '' } = req.body || {};
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username must be 3-24 letters, digits or underscores' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (q('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'Username is taken' });
  const info = q('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(username, displayName.trim() || username, hashPassword(password), now());
  const token = createSession(Number(info.lastInsertRowid));
  res.cookie('session', token, cookieOptions());
  res.json({ user: { id: Number(info.lastInsertRowid), username, display_name: displayName.trim() || username } });
});

app.post('/api/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const row = q('SELECT id, username, display_name, password_hash FROM users WHERE username = ?').get(username);
  if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'Wrong username or password' });
  const token = createSession(row.id);
  res.cookie('session', token, cookieOptions());
  res.json({ user: { id: row.id, username: row.username, display_name: row.display_name } });
});

app.post('/api/logout', (req, res) => {
  if (req.cookies.session) destroySession(req.cookies.session);
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

// ---------- data routes ----------
app.get('/api/users', requireAuth, (req, res) => {
  const term = `%${String(req.query.q || '').replace(/[%_]/g, '')}%`;
  const rows = q(`SELECT id, username, display_name FROM users
                  WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20`)
    .all(term, term, req.user.id);
  res.json({ users: rows });
});

app.get('/api/conversations', requireAuth, (req, res) => {
  res.json({ conversations: conversationsFor(req.user.id) });
});

app.post('/api/conversations', requireAuth, (req, res) => {
  const { username, name, usernames } = req.body || {};
  const t = now();

  if (username) {
    const other = q('SELECT id FROM users WHERE username = ?').get(username);
    if (!other) return res.status(404).json({ error: 'No such user' });
    if (other.id === req.user.id) return res.status(400).json({ error: 'That is you' });
    const key = [req.user.id, other.id].sort((a, b) => a - b).join(':');
    let conv = q('SELECT id FROM conversations WHERE dm_key = ?').get(key);
    if (!conv) {
      const info = q('INSERT INTO conversations (is_group, dm_key, created_by, created_at) VALUES (0, ?, ?, ?)').run(key, req.user.id, t);
      conv = { id: Number(info.lastInsertRowid) };
      const add = q('INSERT INTO members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
      add.run(conv.id, req.user.id, t);
      add.run(conv.id, other.id, t);
      notifyUsers([other.id], { type: 'conversation', conversation: conversationsFor(other.id).find((c) => c.id === conv.id) });
    }
    return res.json({ conversation: conversationsFor(req.user.id).find((c) => c.id === conv.id) });
  }

  if (Array.isArray(usernames)) {
    const groupName = String(name || '').trim().slice(0, 60);
    if (!groupName) return res.status(400).json({ error: 'Group needs a name' });
    const others = usernames.map((u) => q('SELECT id FROM users WHERE username = ?').get(u)).filter(Boolean);
    const ids = [...new Set([req.user.id, ...others.map((o) => o.id)])];
    if (ids.length < 2) return res.status(400).json({ error: 'Add at least one other person' });
    const info = q('INSERT INTO conversations (is_group, name, created_by, created_at) VALUES (1, ?, ?, ?)').run(groupName, req.user.id, t);
    const convId = Number(info.lastInsertRowid);
    const add = q('INSERT INTO members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
    for (const id of ids) add.run(convId, id, t);
    for (const id of ids.filter((i) => i !== req.user.id)) {
      notifyUsers([id], { type: 'conversation', conversation: conversationsFor(id).find((c) => c.id === convId) });
    }
    return res.json({ conversation: conversationsFor(req.user.id).find((c) => c.id === convId) });
  }
  res.status(400).json({ error: 'Provide username or usernames' });
});

app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const convId = Number(req.params.id);
  if (!isMember(convId, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = q(`SELECT id, conversation_id, sender_id, body, created_at FROM messages
                  WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT 50`).all(convId, before).reverse();
  res.json({ messages: rows });
});

app.post('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const convId = Number(req.params.id);
  if (!isMember(convId, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Empty message' });
  if (body.length > 4000) return res.status(400).json({ error: 'Message too long' });
  const t = now();
  const info = q('INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)').run(convId, req.user.id, body, t);
  const message = { id: Number(info.lastInsertRowid), conversation_id: convId, sender_id: req.user.id, body, created_at: t };
  q('UPDATE members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?').run(message.id, convId, req.user.id);
  broadcastToConversation(convId, { type: 'message', message });
  res.json({ message });
});

app.post('/api/conversations/:id/read', requireAuth, (req, res) => {
  const convId = Number(req.params.id);
  if (!isMember(convId, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  const lastId = Number(req.body?.lastId) || 0;
  q('UPDATE members SET last_read_id = MAX(last_read_id, ?) WHERE conversation_id = ? AND user_id = ?').run(lastId, convId, req.user.id);
  broadcastToConversation(convId, { type: 'read', conversation_id: convId, user_id: req.user.id, last_read_id: lastId });
  res.json({ ok: true });
});

app.get('*', (_req, res) => res.sendFile(path.resolve('public/index.html')));

// ---------- websockets ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const socketsByUser = new Map(); // userId -> Set<ws>

function send(ws, payload) { if (ws.readyState === 1) ws.send(JSON.stringify(payload)); }
function notifyUsers(userIds, payload) {
  for (const id of userIds) for (const ws of socketsByUser.get(id) || []) send(ws, payload);
}
function broadcastToConversation(convId, payload) {
  notifyUsers(membersOf(convId).map((m) => m.id), payload);
}
function contactsOf(userId) {
  return q(`SELECT DISTINCT m2.user_id AS id FROM members m1
            JOIN members m2 ON m2.conversation_id = m1.conversation_id
            WHERE m1.user_id = ? AND m2.user_id != ?`).all(userId, userId).map((r) => r.id);
}
function presenceUpdate(userId) {
  const online = (socketsByUser.get(userId)?.size || 0) > 0;
  notifyUsers(contactsOf(userId), { type: 'presence', user_id: userId, online });
}

wss.on('connection', (ws, req) => {
  const user = userFromToken(parseCookies(req.headers.cookie).session);
  if (!user) { ws.close(4001, 'unauthorized'); return; }
  if (!socketsByUser.has(user.id)) socketsByUser.set(user.id, new Set());
  socketsByUser.get(user.id).add(ws);
  const onlineContacts = contactsOf(user.id).filter((id) => socketsByUser.get(id)?.size);
  send(ws, { type: 'hello', user, online: onlineContacts });
  presenceUpdate(user.id);

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'typing' && isMember(Number(msg.conversation_id), user.id)) {
      const others = membersOf(Number(msg.conversation_id)).map((m) => m.id).filter((id) => id !== user.id);
      notifyUsers(others, { type: 'typing', conversation_id: Number(msg.conversation_id), user_id: user.id });
    }
    if (msg.type === 'ping') send(ws, { type: 'pong' });
  });

  ws.on('close', () => {
    const set = socketsByUser.get(user.id);
    set?.delete(ws);
    if (set && set.size === 0) socketsByUser.delete(user.id);
    presenceUpdate(user.id);
  });
});

// purge expired sessions hourly
setInterval(() => q('DELETE FROM sessions WHERE expires_at < ?').run(now()), 3600 * 1000).unref();

server.listen(PORT, () => console.log(`Messenger listening on http://localhost:${PORT}`));
process.on('SIGTERM', () => { db.close(); process.exit(0); });
