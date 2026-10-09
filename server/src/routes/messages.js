import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { presentUser, getUserById } from '../lib/present.js';

const router = Router();
const findByUsername = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');

// --- Conversation list (latest message per other party + unread count) ---
router.get('/', requireAuth, async (req, res) => {
  const me = req.user.id;
  const rows = await db.prepare(`
    SELECT * FROM messages WHERE sender_id = ? OR recipient_id = ? ORDER BY created_at DESC
  `).all(me, me);

  const seen = new Set();
  const conversations = [];
  for (const m of rows) {
    const other = m.sender_id === me ? m.recipient_id : m.sender_id;
    if (seen.has(other)) continue;
    seen.add(other);
    const user = await getUserById(other);
    if (!user) continue;
    const unread = (await db.prepare(
      'SELECT COUNT(*)::int n FROM messages WHERE sender_id = ? AND recipient_id = ? AND read_status = 0'
    ).get(other, me)).n;
    conversations.push({
      user: await presentUser(user, me),
      lastMessage: m.text,
      lastFromMe: m.sender_id === me,
      lastAt: m.created_at,
      unread,
    });
  }
  res.json({ conversations });
});

router.get('/unread-count', requireAuth, async (req, res) => {
  const row = await db.prepare('SELECT COUNT(*)::int n FROM messages WHERE recipient_id = ? AND read_status = 0')
    .get(req.user.id);
  res.json({ count: row.n });
});

// --- Thread with one user (marks their messages to me as read) ---
router.get('/thread/:username', requireAuth, async (req, res) => {
  const other = await findByUsername.get(req.params.username);
  if (!other) return res.status(404).json({ error: 'User not found.' });
  const me = req.user.id;

  await db.prepare('UPDATE messages SET read_status = 1 WHERE sender_id = ? AND recipient_id = ?').run(other.id, me);

  const rows = await db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY created_at ASC LIMIT 500
  `).all(me, other.id, other.id, me);

  res.json({
    user: await presentUser(other, me),
    messages: rows.map((m) => ({ id: m.id, text: m.text, mine: m.sender_id === me, createdAt: m.created_at })),
  });
});

// --- Send a message ---
router.post('/:username', requireAuth, async (req, res) => {
  const other = await findByUsername.get(req.params.username);
  if (!other) return res.status(404).json({ error: 'User not found.' });
  if (other.id === req.user.id) return res.status(400).json({ error: "You can't message yourself." });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (text.length > 2000) return res.status(400).json({ error: 'Message is too long (2000 characters max).' });

  const id = nanoid();
  await db.prepare('INSERT INTO messages (id, sender_id, recipient_id, text) VALUES (?,?,?,?)')
    .run(id, req.user.id, other.id, text);
  res.status(201).json({ message: { id, text, mine: true, createdAt: new Date().toISOString() } });
});

export default router;
