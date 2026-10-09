import { Router } from 'express';
import { db } from '../db.js';
import { presentUser, presentPost } from '../lib/present.js';

const router = Router();

// Unified search: users, posts, hashtags
router.get('/', async (req, res) => {
  const viewerId = req.user?.id || null;
  const q = String(req.query.q || '').trim();
  const category = req.query.category || 'all';
  if (!q) return res.json({ users: [], posts: [], hashtags: [] });

  const like = `%${q}%`;
  const tag = q.replace(/^#/, '').toLowerCase();

  const users = (category === 'all' || category === 'people')
    ? await Promise.all((await db.prepare(`
        SELECT * FROM users WHERE username ILIKE ? OR display_name ILIKE ?
        ORDER BY (SELECT COUNT(*) FROM follows WHERE following_id=users.id) DESC LIMIT 20
      `).all(like, like)).map((u) => presentUser(u, viewerId)))
    : [];

  const typeMap = { snaps: 'snap', thoughts: 'thought', shorts: 'short', videos: 'video' };
  let postSql = `
    SELECT * FROM posts WHERE visibility='public' AND repost_of IS NULL AND (
      text ILIKE ? OR caption ILIKE ? OR title ILIKE ? OR description ILIKE ? OR hashtags ILIKE ?
    )`;
  const params = [like, like, like, like, `%${tag}%`];
  if (typeMap[category]) { postSql += ` AND post_type=?`; params.push(typeMap[category]); }
  postSql += ` ORDER BY created_at DESC LIMIT 40`;
  const posts = await Promise.all((await db.prepare(postSql).all(...params)).map((p) => presentPost(p, viewerId)));

  const tagRows = await db.prepare(`SELECT hashtags FROM posts WHERE hashtags ILIKE ?`).all(`%${tag}%`);
  const counts = {};
  for (const r of tagRows) {
    try {
      for (const h of JSON.parse(r.hashtags)) if (h.includes(tag)) counts[h] = (counts[h] || 0) + 1;
    } catch { /* skip */ }
  }
  const hashtags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));

  res.json({ users, posts, hashtags });
});

// Explore / trending
router.get('/trending', async (req, res) => {
  const viewerId = req.user?.id || null;

  const rows = await db.prepare(`SELECT hashtags FROM posts ORDER BY created_at DESC LIMIT 1000`).all();
  const counts = {};
  for (const r of rows) {
    try { for (const h of JSON.parse(r.hashtags)) counts[h] = (counts[h] || 0) + 1; } catch { /* skip */ }
  }
  const hashtags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }));

  const popularBy = async (type) => Promise.all((await db.prepare(`
    SELECT * FROM posts WHERE post_type=? AND visibility='public' AND repost_of IS NULL
    ORDER BY ((SELECT COUNT(*) FROM likes l WHERE l.post_id=posts.id)*2
      + (SELECT COUNT(*) FROM comments c WHERE c.post_id=posts.id) + view_count) DESC,
      created_at DESC LIMIT 12
  `).all(type)).map((p) => presentPost(p, viewerId)));

  const creators = await Promise.all((await db.prepare(`
    SELECT * FROM users ORDER BY (SELECT COUNT(*) FROM follows WHERE following_id=users.id) DESC LIMIT 10
  `).all()).map((u) => presentUser(u, viewerId)));

  const [snaps, shorts, videos, thoughts] = await Promise.all([
    popularBy('snap'), popularBy('short'), popularBy('video'), popularBy('thought'),
  ]);

  res.json({ hashtags, snaps, shorts, videos, thoughts, creators });
});

// A hashtag's posts
router.get('/hashtag/:tag', async (req, res) => {
  const viewerId = req.user?.id || null;
  const tag = req.params.tag.toLowerCase();
  const rows = await db.prepare(`
    SELECT * FROM posts WHERE visibility='public' AND repost_of IS NULL AND hashtags ILIKE ?
    ORDER BY created_at DESC LIMIT 60
  `).all(`%"${tag}"%`);
  res.json({ tag, posts: await Promise.all(rows.map((p) => presentPost(p, viewerId))) });
});

export default router;
