import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { presentUser, presentPost } from '../lib/present.js';

const router = Router();

// List notifications, grouped intelligently (same type + same target collapse together)
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE recipient_id=? ORDER BY created_at DESC LIMIT 200
  `).all(req.user.id);

  const groups = [];
  const index = {};
  for (const n of rows) {
    const key = `${n.notification_type}:${n.post_id || ''}:${n.comment_id || ''}`;
    const sender = db.prepare('SELECT * FROM users WHERE id=?').get(n.sender_id);
    if (!sender) continue;
    if (index[key] == null) {
      index[key] = groups.length;
      groups.push({
        id: n.id,
        type: n.notification_type,
        postId: n.post_id,
        commentId: n.comment_id,
        post: n.post_id ? presentPost(db.prepare('SELECT * FROM posts WHERE id=?').get(n.post_id), req.user.id) : null,
        actors: [presentUser(sender, req.user.id)],
        read: !!n.read_status,
        createdAt: n.created_at,
      });
    } else {
      const g = groups[index[key]];
      if (!g.actors.find((a) => a.id === sender.id) && g.actors.length < 8)
        g.actors.push(presentUser(sender, req.user.id));
      g.read = g.read && !!n.read_status;
    }
  }
  const unread = rows.filter((n) => !n.read_status).length;
  res.json({ notifications: groups, unread });
});

router.get('/unread-count', requireAuth, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) n FROM notifications WHERE recipient_id=? AND read_status=0')
    .get(req.user.id);
  res.json({ count: row.n });
});

router.post('/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read_status=1 WHERE recipient_id=?').run(req.user.id);
  res.json({ ok: true });
});

// Pending follow requests (for private accounts)
router.get('/follow-requests', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.* FROM follows f JOIN users u ON u.id=f.follower_id
    WHERE f.following_id=? AND f.status='pending' ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json({ users: rows.map((u) => presentUser(u, req.user.id)) });
});

export default router;
