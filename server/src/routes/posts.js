import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { presentPost } from '../lib/present.js';
import { notify, removeNotification } from '../lib/notify.js';

const router = Router();
const TYPES = ['thought', 'snap', 'short', 'video'];

const insertPost = db.prepare(`
  INSERT INTO posts (id, user_id, post_type, text, caption, title, description, media,
    thumbnail_url, hashtags, link_url, audio_info, chapters, tags, parent_post_id, repost_of, visibility, duration)
  VALUES (@id, @user_id, @post_type, @text, @caption, @title, @description, @media,
    @thumbnail_url, @hashtags, @link_url, @audio_info, @chapters, @tags, @parent_post_id, @repost_of, @visibility, @duration)
`);

function extractHashtags(...texts) {
  const set = new Set();
  for (const t of texts) {
    if (!t) continue;
    for (const m of String(t).matchAll(/#(\w+)/g)) set.add(m[1].toLowerCase());
  }
  return [...set];
}

// --- Create a post (any of the 4 types) ---
router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  const type = b.type;
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Invalid content type.' });

  const media = Array.isArray(b.media) ? b.media.filter(Boolean) : [];

  // Type-specific validation
  if (type === 'thought') {
    if (!b.text || !b.text.trim()) return res.status(400).json({ error: 'Your thought needs some text.' });
    if (b.text.length > 280) return res.status(400).json({ error: 'Thoughts are limited to 280 characters.' });
  }
  if (type === 'snap' && media.length === 0)
    return res.status(400).json({ error: 'Add at least one photo to your snap.' });
  if ((type === 'short' || type === 'video') && media.length === 0)
    return res.status(400).json({ error: 'A video file is required.' });
  if (type === 'video' && (!b.title || !b.title.trim()))
    return res.status(400).json({ error: 'Give your video a title.' });

  const explicit = Array.isArray(b.hashtags) ? b.hashtags.map((h) => String(h).replace(/^#/, '').toLowerCase()) : [];
  const hashtags = [...new Set([...explicit, ...extractHashtags(b.text, b.caption, b.description)])];

  const id = nanoid();
  insertPost.run({
    id,
    user_id: req.user.id,
    post_type: type,
    text: b.text || null,
    caption: b.caption || null,
    title: b.title || null,
    description: b.description || null,
    media: JSON.stringify(media),
    thumbnail_url: b.thumbnailUrl || ((type === 'short' || type === 'video') ? (media[0]?.url || null) : null),
    hashtags: JSON.stringify(hashtags),
    link_url: b.linkUrl || null,
    audio_info: b.audioInfo || null,
    chapters: JSON.stringify(Array.isArray(b.chapters) ? b.chapters : []),
    tags: JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
    parent_post_id: b.parentPostId || null,
    repost_of: null,
    visibility: b.visibility === 'private' ? 'private' : 'public',
    duration: Number(b.duration) || 0,
  });

  // Thread reply → notify the parent author
  if (b.parentPostId) {
    const parent = db.prepare('SELECT user_id FROM posts WHERE id=?').get(b.parentPostId);
    if (parent) notify({ recipientId: parent.user_id, senderId: req.user.id, type: 'reply', postId: id });
  }

  res.status(201).json({ post: presentPost(db.prepare('SELECT * FROM posts WHERE id=?').get(id), req.user.id) });
});

// --- Create a thread (array of thought texts) ---
router.post('/thread', requireAuth, (req, res) => {
  const parts = (req.body?.parts || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (parts.length === 0) return res.status(400).json({ error: 'A thread needs at least one post.' });
  if (parts.some((t) => t.length > 280)) return res.status(400).json({ error: 'Each post is limited to 280 characters.' });

  const ids = [];
  const tx = db.transaction(() => {
    let parent = null;
    for (const text of parts) {
      const id = nanoid();
      insertPost.run({
        id, user_id: req.user.id, post_type: 'thought', text, caption: null, title: null,
        description: null, media: '[]', thumbnail_url: null,
        hashtags: JSON.stringify(extractHashtags(text)), link_url: null, audio_info: null,
        chapters: '[]', tags: '[]', parent_post_id: parent, repost_of: null, visibility: 'public', duration: 0,
      });
      ids.push(id);
      parent = id;
    }
  });
  tx();
  const root = db.prepare('SELECT * FROM posts WHERE id=?').get(ids[0]);
  res.status(201).json({ post: presentPost(root, req.user.id), threadIds: ids });
});

// --- The home feed ---
// mode: all | shorts | snaps | thoughts | videos  (content filter)
// source: following | recommended | mixed(default)
router.get('/feed', requireAuth, (req, res) => {
  const viewerId = req.user.id;
  const { mode = 'all', source = 'mixed', limit = 20, offset = 0 } = req.query;
  const typeMap = { shorts: 'short', snaps: 'snap', thoughts: 'thought', videos: 'video' };

  const following = db.prepare(
    `SELECT following_id FROM follows WHERE follower_id=? AND status='active'`
  ).all(viewerId).map((r) => r.following_id);
  const circle = [...following, viewerId];

  let where = `p.visibility='public' AND p.parent_post_id IS NULL AND p.repost_of IS NULL`;
  const params = [];

  if (source === 'following') {
    const ph = circle.map(() => '?').join(',') || "''";
    where += ` AND p.user_id IN (${ph})`;
    params.push(...circle);
  } else if (source === 'recommended') {
    // public content NOT from people you follow, ranked by engagement
    const ph = circle.map(() => '?').join(',') || "''";
    where += ` AND p.user_id NOT IN (${ph})`;
    params.push(...circle);
  }

  if (typeMap[mode]) { where += ` AND p.post_type = ?`; params.push(typeMap[mode]); }

  // Engagement-aware ordering: recency + likes + comments + views
  const order = source === 'recommended'
    ? `(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id)*3
       + (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id)*2
       + p.view_count DESC, p.created_at DESC`
    : `p.created_at DESC`;

  const rows = db.prepare(
    `SELECT p.* FROM posts p WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...params, Number(limit), Number(offset));

  let posts = rows.map((p) => presentPost(p, viewerId));

  // In mixed/all mode, interleave formats so the feed feels varied rather than clumped.
  if (mode === 'all' && posts.length > 3) posts = interleaveByType(posts);

  res.json({ posts, hasMore: rows.length === Number(limit) });
});

function interleaveByType(posts) {
  const buckets = {};
  for (const p of posts) (buckets[p.type] ||= []).push(p);
  const order = ['snap', 'thought', 'short', 'video'];
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const t of order) {
      if (buckets[t] && buckets[t].length) { out.push(buckets[t].shift()); added = true; }
    }
  }
  return out;
}

// --- Dedicated shorts feed (TikTok-style) ---
router.get('/shorts/feed', (req, res) => {
  const viewerId = req.user?.id || null;
  const { limit = 10, offset = 0 } = req.query;
  const rows = db.prepare(`
    SELECT * FROM posts WHERE post_type='short' AND visibility='public' AND parent_post_id IS NULL
    ORDER BY (SELECT COUNT(*) FROM likes l WHERE l.post_id=posts.id) DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit), Number(offset));
  res.json({ posts: rows.map((p) => presentPost(p, viewerId)), hasMore: rows.length === Number(limit) });
});

// --- Related videos (YouTube-style watch sidebar) ---
router.get('/:id/related', (req, res) => {
  const viewerId = req.user?.id || null;
  const base = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!base) return res.json({ posts: [] });
  let tags = [];
  try { tags = [...JSON.parse(base.hashtags || '[]'), ...JSON.parse(base.tags || '[]')]; } catch { /* */ }

  // Rank other videos by shared tags, then same creator, then engagement.
  const rows = db.prepare(`
    SELECT * FROM posts WHERE post_type='video' AND visibility='public' AND id != ? AND repost_of IS NULL
    ORDER BY (SELECT COUNT(*) FROM likes l WHERE l.post_id=posts.id) + view_count DESC, created_at DESC LIMIT 40
  `).all(base.id);

  const score = (p) => {
    let s = 0;
    try {
      const pt = [...JSON.parse(p.hashtags || '[]'), ...JSON.parse(p.tags || '[]')];
      s += pt.filter((t) => tags.includes(t)).length * 5;
    } catch { /* */ }
    if (p.user_id === base.user_id) s += 2;
    return s;
  };
  rows.sort((a, b) => score(b) - score(a));
  res.json({ posts: rows.slice(0, 12).map((p) => presentPost(p, viewerId)) });
});

// --- Single post (increments view count) + thread ---
router.get('/:id', (req, res) => {
  const viewerId = req.user?.id || null;
  const row = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Post not found.' });

  db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id=?').run(row.id);

  // Build the thread chain (ancestors) and direct replies
  const ancestors = [];
  let cur = row;
  while (cur.parent_post_id) {
    cur = db.prepare('SELECT * FROM posts WHERE id=?').get(cur.parent_post_id);
    if (!cur) break;
    ancestors.unshift(presentPost(cur, viewerId));
  }
  const replies = db.prepare(
    'SELECT * FROM posts WHERE parent_post_id=? ORDER BY created_at ASC'
  ).all(row.id).map((p) => presentPost(p, viewerId));

  res.json({ post: presentPost({ ...row, view_count: row.view_count + 1 }, viewerId), ancestors, replies });
});

// --- Delete own post ---
router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Post not found.' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: "You can only delete your own posts." });
  db.prepare('DELETE FROM posts WHERE id=?').run(row.id);
  res.json({ ok: true });
});

// --- Like / Unlike ---
router.post('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  try {
    db.prepare('INSERT INTO likes (id, post_id, user_id) VALUES (?,?,?)')
      .run(nanoid(), post.id, req.user.id);
    notify({ recipientId: post.user_id, senderId: req.user.id, type: 'like', postId: post.id });
  } catch { /* duplicate like ignored (unique index) */ }
  res.json({ post: presentPost(db.prepare('SELECT * FROM posts WHERE id=?').get(post.id), req.user.id) });
});

router.delete('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  db.prepare('DELETE FROM likes WHERE post_id=? AND user_id=?').run(post.id, req.user.id);
  removeNotification.run({
    recipient_id: post.user_id, sender_id: req.user.id, notification_type: 'like', post_id: post.id,
  });
  res.json({ post: presentPost(db.prepare('SELECT * FROM posts WHERE id=?').get(post.id), req.user.id) });
});

// --- Bookmark / Unbookmark ---
router.post('/:id/bookmark', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  try {
    db.prepare('INSERT INTO bookmarks (id, post_id, user_id) VALUES (?,?,?)')
      .run(nanoid(), post.id, req.user.id);
  } catch { /* duplicate */ }
  res.json({ post: presentPost(post, req.user.id) });
});

router.delete('/:id/bookmark', requireAuth, (req, res) => {
  db.prepare('DELETE FROM bookmarks WHERE post_id=? AND user_id=?').run(req.params.id, req.user.id);
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  res.json({ post: post ? presentPost(post, req.user.id) : null });
});

router.get('/me/bookmarks', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.* FROM bookmarks b JOIN posts p ON p.id=b.post_id
    WHERE b.user_id=? ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json({ posts: rows.map((p) => presentPost(p, req.user.id)) });
});

// --- Repost (Thought) ---
router.post('/:id/repost', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const existing = db.prepare('SELECT id FROM posts WHERE repost_of=? AND user_id=?')
    .get(post.id, req.user.id);
  if (existing) {
    db.prepare('DELETE FROM posts WHERE id=?').run(existing.id);
    return res.json({ post: presentPost(post, req.user.id), reposted: false });
  }
  const id = nanoid();
  insertPost.run({
    id, user_id: req.user.id, post_type: post.post_type, text: null, caption: null, title: null,
    description: null, media: '[]', thumbnail_url: null, hashtags: '[]', link_url: null,
    audio_info: null, chapters: '[]', tags: '[]', parent_post_id: null, repost_of: post.id, visibility: 'public', duration: 0,
  });
  notify({ recipientId: post.user_id, senderId: req.user.id, type: 'repost', postId: post.id });
  res.json({ post: presentPost(post, req.user.id), reposted: true });
});

// --- Record a video view with progress (watch history) ---
router.post('/:id/watch', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id=? AND post_type=\'video\'').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Video not found.' });
  const progress = Math.max(0, Math.min(1, Number(req.body?.progress) || 0));
  db.prepare(`
    INSERT INTO watch_history (user_id, video_id, progress, last_watched_at)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(user_id, video_id) DO UPDATE SET progress=excluded.progress, last_watched_at=datetime('now')
  `).run(req.user.id, post.id, progress);
  res.json({ ok: true });
});

router.get('/me/history', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, w.progress, w.last_watched_at FROM watch_history w
    JOIN posts p ON p.id=w.video_id WHERE w.user_id=? ORDER BY w.last_watched_at DESC LIMIT 50
  `).all(req.user.id);
  res.json({
    posts: rows.map((r) => ({ ...presentPost(r, req.user.id), progress: r.progress, lastWatchedAt: r.last_watched_at })),
  });
});

export default router;
