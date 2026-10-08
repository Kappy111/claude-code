import { Router } from 'express';
import { db } from '../db.js';
import { presentUser, presentPost } from '../lib/present.js';

const router = Router();

// Unified search: users, posts, hashtags
router.get('/', (req, res) => {
  const viewerId = req.user?.id || null;
  const q = String(req.query.q || '').trim();
  const category = req.query.category || 'all'; // all | people | snaps | thoughts | shorts | videos
  if (!q) return res.json({ users: [], posts: [], hashtags: [] });

  const like = `%${q}%`;
  const tag = q.replace(/^#/, '').toLowerCase();

  const users = (category === 'all' || category === 'people')
    ? db.prepare(`
        SELECT * FROM users WHERE username LIKE ? OR display_name LIKE ?
        ORDER BY (SELECT COUNT(*) FROM follows WHERE following_id=users.id) DESC LIMIT 20
      `).all(like, like).map((u) => presentUser(u, viewerId))
    : [];

  const typeMap = { snaps: 'snap', thoughts: 'thought', shorts: 'short', videos: 'video' };
  let postSql = `
    SELECT * FROM posts WHERE visibility='public' AND repost_of IS NULL AND (
      text LIKE ? OR caption LIKE ? OR title LIKE ? OR description LIKE ? OR hashtags LIKE ?
    )`;
  const params = [like, like, like, like, `%${tag}%`];
  if (typeMap[category]) { postSql += ` AND post_type=?`; params.push(typeMap[category]); }
  postSql += ` ORDER BY created_at DESC LIMIT 40`;
  const posts = db.prepare(postSql).all(...params).map((p) => presentPost(p, viewerId));

  // Matching hashtags with counts
  const tagRows = db.prepare(`SELECT hashtags FROM posts WHERE hashtags LIKE ?`).all(`%${tag}%`);
  const counts = {};
  for (const r of tagRows) {
    try {
      for (const h of JSON.parse(r.hashtags)) if (h.includes(tag)) counts[h] = (counts[h] || 0) + 1;
    } catch { /* skip */ }
  }
  const hashtags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  res.json({ users, posts, hashtags });
});

// Explore / trending
router.get('/trending', (req, res) => {
  const viewerId = req.user?.id || null;

  // Trending hashtags (last 1000 posts)
  const rows = db.prepare(`SELECT hashtags FROM posts ORDER BY created_at DESC LIMIT 1000`).all();
  const counts = {};
  for (const r of rows) {
    try { for (const h of JSON.parse(r.hashtags)) counts[h] = (counts[h] || 0) + 1; } catch { /* skip */ }
  }
  const hashtags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));

  const popularBy = (type) => db.prepare(`
    SELECT * FROM posts WHERE post_type=? AND visibility='public' AND repost_of IS NULL
    ORDER BY (SELECT COUNT(*) FROM likes l WHERE l.post_id=posts.id)*2
      + (SELECT COUNT(*) FROM comments c WHERE c.post_id=posts.id) + view_count DESC,
      created_at DESC LIMIT 12
  `).all(type).map((p) => presentPost(p, viewerId));

  const creators = db.prepare(`
    SELECT * FROM users ORDER BY (SELECT COUNT(*) FROM follows WHERE following_id=users.id) DESC LIMIT 10
  `).all().map((u) => presentUser(u, viewerId));

  res.json({
    hashtags,
    snaps: popularBy('snap'),
    shorts: popularBy('short'),
    videos: popularBy('video'),
    thoughts: popularBy('thought'),
    creators,
  });
});

// A hashtag's posts
router.get('/hashtag/:tag', (req, res) => {
  const viewerId = req.user?.id || null;
  const tag = req.params.tag.toLowerCase();
  const rows = db.prepare(`
    SELECT * FROM posts WHERE visibility='public' AND repost_of IS NULL AND hashtags LIKE ?
    ORDER BY created_at DESC LIMIT 60
  `).all(`%"${tag}"%`).map((p) => presentPost(p, viewerId));
  res.json({ tag, posts: rows });
});

export default router;
