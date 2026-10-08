import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { presentComment } from '../lib/present.js';
import { notify } from '../lib/notify.js';

const router = Router();

// List comments for a post (threaded: top-level with nested replies)
router.get('/post/:postId', (req, res) => {
  const viewerId = req.user?.id || null;
  const all = db.prepare('SELECT * FROM comments WHERE post_id=? ORDER BY created_at ASC')
    .all(req.params.postId);
  const byParent = {};
  for (const c of all) (byParent[c.parent_comment_id || 'root'] ||= []).push(c);
  const build = (c) => ({
    ...presentComment(c, viewerId),
    replies: (byParent[c.id] || []).map(build),
  });
  const tree = (byParent.root || []).map(build);
  res.json({ comments: tree, count: all.length });
});

// Add a comment or reply
router.post('/post/:postId', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  // Respect who-can-comment setting of the post author
  const author = db.prepare('SELECT who_can_comment, is_private FROM users WHERE id=?').get(post.user_id);
  if (author?.who_can_comment === 'nobody' && post.user_id !== req.user.id)
    return res.status(403).json({ error: 'Comments are turned off for this post.' });
  if (author?.who_can_comment === 'following' && post.user_id !== req.user.id) {
    const follows = db.prepare(
      `SELECT 1 FROM follows WHERE follower_id=? AND following_id=? AND status='active'`
    ).get(post.user_id, req.user.id);
    if (!follows) return res.status(403).json({ error: 'Only people the creator follows can comment.' });
  }

  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty.' });
  const parentId = req.body?.parentCommentId || null;

  const id = nanoid();
  db.prepare('INSERT INTO comments (id, post_id, user_id, parent_comment_id, text) VALUES (?,?,?,?,?)')
    .run(id, post.id, req.user.id, parentId, text);

  // Notify post author (comment) and parent-comment author (reply)
  notify({ recipientId: post.user_id, senderId: req.user.id, type: 'comment', postId: post.id, commentId: id });
  if (parentId) {
    const parent = db.prepare('SELECT user_id FROM comments WHERE id=?').get(parentId);
    if (parent) notify({ recipientId: parent.user_id, senderId: req.user.id, type: 'reply', postId: post.id, commentId: id });
  }

  res.status(201).json({ comment: { ...presentComment(db.prepare('SELECT * FROM comments WHERE id=?').get(id), req.user.id), replies: [] } });
});

// Like / unlike a comment
router.post('/:id/like', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found.' });
  try {
    db.prepare('INSERT INTO likes (id, comment_id, user_id) VALUES (?,?,?)')
      .run(nanoid(), c.id, req.user.id);
  } catch { /* duplicate */ }
  res.json({ comment: presentComment(c, req.user.id) });
});

router.delete('/:id/like', requireAuth, (req, res) => {
  db.prepare('DELETE FROM likes WHERE comment_id=? AND user_id=?').run(req.params.id, req.user.id);
  const c = db.prepare('SELECT * FROM comments WHERE id=?').get(req.params.id);
  res.json({ comment: c ? presentComment(c, req.user.id) : null });
});

// Delete own comment
router.delete('/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found.' });
  if (c.user_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own comments.' });
  db.prepare('DELETE FROM comments WHERE id=?').run(c.id);
  res.json({ ok: true });
});

export default router;
