import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { presentUser, presentPost, getUserById } from '../lib/present.js';
import { notify, removeNotification } from '../lib/notify.js';

const router = Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const findByUsername = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');

// --- Get a profile by username ---
router.get('/:username', (req, res) => {
  const row = findByUsername.get(req.params.username);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: presentUser(row, req.user?.id || null) });
});

// --- A user's posts by type (for profile tabs) ---
router.get('/:username/posts', (req, res) => {
  const row = findByUsername.get(req.params.username);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  const { type: qtype, limit = 30, offset = 0 } = req.query;
  const allowed = ['thought', 'snap', 'short', 'video'];
  const viewerId = req.user?.id || null;

  // Private-account gate
  if (row.is_private && viewerId !== row.id) {
    const follows = viewerId && db.prepare(
      `SELECT 1 FROM follows WHERE follower_id=? AND following_id=? AND status='active'`
    ).get(viewerId, row.id);
    if (!follows) return res.json({ posts: [], locked: true });
  }

  let sql = `SELECT * FROM posts WHERE user_id = ? AND parent_post_id IS NULL AND repost_of IS NULL`;
  const params = [row.id];
  if (qtype && allowed.includes(qtype)) { sql += ` AND post_type = ?`; params.push(qtype); }
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));

  const posts = db.prepare(sql).all(...params).map((p) => presentPost(p, viewerId));
  res.json({ posts });
});

// --- Followers / Following lists ---
router.get('/:username/followers', (req, res) => {
  const row = findByUsername.get(req.params.username);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  const rows = db.prepare(`
    SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = ? AND f.status='active' ORDER BY f.created_at DESC
  `).all(row.id);
  res.json({ users: rows.map((u) => presentUser(u, req.user?.id || null)) });
});

router.get('/:username/following', (req, res) => {
  const row = findByUsername.get(req.params.username);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  const rows = db.prepare(`
    SELECT u.* FROM follows f JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = ? AND f.status='active' ORDER BY f.created_at DESC
  `).all(row.id);
  res.json({ users: rows.map((u) => presentUser(u, req.user?.id || null)) });
});

// --- Follow / Unfollow ---
const getEdge = db.prepare('SELECT * FROM follows WHERE follower_id=? AND following_id=?');
const insertFollow = db.prepare(
  'INSERT INTO follows (follower_id, following_id, status) VALUES (?, ?, ?)'
);
const deleteFollow = db.prepare('DELETE FROM follows WHERE follower_id=? AND following_id=?');

router.post('/:username/follow', requireAuth, (req, res) => {
  const target = findByUsername.get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't follow yourself." });

  const existing = getEdge.get(req.user.id, target.id);
  if (existing) return res.json({ user: presentUser(target, req.user.id) });

  const status = target.is_private ? 'pending' : 'active';
  insertFollow.run(req.user.id, target.id, status);
  notify({
    recipientId: target.id,
    senderId: req.user.id,
    type: status === 'pending' ? 'follow_request' : 'follow',
  });
  res.json({ user: presentUser(getUserById(target.id), req.user.id) });
});

router.delete('/:username/follow', requireAuth, (req, res) => {
  const target = findByUsername.get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  deleteFollow.run(req.user.id, target.id);
  removeNotification.run({
    recipient_id: target.id, sender_id: req.user.id,
    notification_type: 'follow', post_id: null,
  });
  res.json({ user: presentUser(getUserById(target.id), req.user.id) });
});

// Accept / reject a pending follow request (private accounts)
router.post('/follow-requests/:followerId/:action', requireAuth, (req, res) => {
  const { followerId, action } = req.params;
  const edge = getEdge.get(followerId, req.user.id);
  if (!edge || edge.status !== 'pending') return res.status(404).json({ error: 'No pending request.' });
  if (action === 'accept') {
    db.prepare('UPDATE follows SET status=\'active\' WHERE follower_id=? AND following_id=?')
      .run(followerId, req.user.id);
    notify({ recipientId: followerId, senderId: req.user.id, type: 'follow' });
  } else {
    deleteFollow.run(followerId, req.user.id);
  }
  res.json({ ok: true });
});

// --- Edit own profile / settings ---
const updateProfile = db.prepare(`
  UPDATE users SET display_name=@display_name, bio=@bio, profile_image=@profile_image,
    is_private=@is_private, who_can_comment=@who_can_comment, notify_prefs=@notify_prefs
  WHERE id=@id
`);

router.patch('/me/profile', requireAuth, (req, res) => {
  const u = req.user;
  const b = req.body || {};
  const displayName = b.displayName != null ? String(b.displayName).trim() : u.display_name;
  if (!displayName) return res.status(400).json({ error: 'Display name cannot be empty.' });
  updateProfile.run({
    id: u.id,
    display_name: displayName,
    bio: b.bio != null ? String(b.bio).slice(0, 300) : u.bio,
    profile_image: b.profileImage !== undefined ? b.profileImage : u.profile_image,
    is_private: b.isPrivate != null ? (b.isPrivate ? 1 : 0) : u.is_private,
    who_can_comment: b.whoCanComment || u.who_can_comment,
    notify_prefs: b.notifyPrefs != null ? JSON.stringify(b.notifyPrefs) : u.notify_prefs,
  });
  res.json({ user: presentUser(getUserById(u.id), u.id) });
});

router.patch('/me/username', requireAuth, (req, res) => {
  const newName = String(req.body?.username || '');
  if (!USERNAME_RE.test(newName))
    return res.status(400).json({ error: 'Username must be 3–20 characters: letters, numbers, underscores.' });
  const taken = findByUsername.get(newName);
  if (taken && taken.id !== req.user.id)
    return res.status(409).json({ error: 'Username already taken.' });
  db.prepare('UPDATE users SET username=? WHERE id=?').run(newName, req.user.id);
  res.json({ user: presentUser(getUserById(req.user.id), req.user.id) });
});

router.patch('/me/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (req.user.password_hash && !bcrypt.compareSync(currentPassword || '', req.user.password_hash))
    return res.status(401).json({ error: 'Current password is incorrect.' });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ ok: true });
});

export default router;
