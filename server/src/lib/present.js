import { db } from '../db.js';

const parse = (v, fallback) => {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

// ---- Users ----
const countFollowers = db.prepare(`SELECT COUNT(*)::int n FROM follows WHERE following_id = ? AND status = 'active'`);
const countFollowing = db.prepare(`SELECT COUNT(*)::int n FROM follows WHERE follower_id = ? AND status = 'active'`);
const countPosts = db.prepare(`SELECT COUNT(*)::int n FROM posts WHERE user_id = ? AND parent_post_id IS NULL`);
const followEdge = db.prepare(`SELECT status FROM follows WHERE follower_id = ? AND following_id = ?`);

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export async function presentUser(row, viewerId = null) {
  if (!row) return null;
  const [followers, following, posts, edge] = await Promise.all([
    countFollowers.get(row.id),
    countFollowing.get(row.id),
    countPosts.get(row.id),
    viewerId && viewerId !== row.id ? followEdge.get(viewerId, row.id) : Promise.resolve(null),
  ]);
  const followState = edge?.status || null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: viewerId === row.id ? row.email : undefined,
    profileImage: row.profile_image || null,
    bio: row.bio || '',
    verified: !!row.verified,
    isPrivate: !!row.is_private,
    whoCanComment: row.who_can_comment,
    notifyPrefs: viewerId === row.id ? parse(row.notify_prefs, {}) : undefined,
    createdAt: row.created_at,
    followerCount: followers.n,
    followingCount: following.n,
    postCount: posts.n,
    isFollowing: followState === 'active',
    followRequested: followState === 'pending',
    isSelf: viewerId === row.id,
  };
}

// ---- Posts ----
const countPostLikes = db.prepare(`SELECT COUNT(*)::int n FROM likes WHERE post_id = ?`);
const countPostComments = db.prepare(`SELECT COUNT(*)::int n FROM comments WHERE post_id = ?`);
const countReposts = db.prepare(`SELECT COUNT(*)::int n FROM posts WHERE repost_of = ?`);
const countReplies = db.prepare(`SELECT COUNT(*)::int n FROM posts WHERE parent_post_id = ?`);
const viewerLiked = db.prepare(`SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?`);
const viewerBookmarked = db.prepare(`SELECT 1 FROM bookmarks WHERE post_id = ? AND user_id = ?`);

export async function presentPost(row, viewerId = null, { withAuthor = true } = {}) {
  if (!row) return null;
  const [author, likes, comments, reposts, replies, liked, bookmarked] = await Promise.all([
    withAuthor ? getUserById(row.user_id).then((u) => presentUser(u, viewerId)) : Promise.resolve(undefined),
    countPostLikes.get(row.id),
    countPostComments.get(row.id),
    countReposts.get(row.id),
    countReplies.get(row.id),
    viewerId ? viewerLiked.get(row.id, viewerId) : Promise.resolve(null),
    viewerId ? viewerBookmarked.get(row.id, viewerId) : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    type: row.post_type,
    text: row.text,
    caption: row.caption,
    title: row.title,
    description: row.description,
    media: parse(row.media, []),
    thumbnailUrl: row.thumbnail_url || null,
    hashtags: parse(row.hashtags, []),
    linkUrl: row.link_url || null,
    audioInfo: row.audio_info || null,
    chapters: parse(row.chapters, []),
    tags: parse(row.tags, []),
    parentPostId: row.parent_post_id || null,
    repostOf: row.repost_of || null,
    visibility: row.visibility,
    viewCount: row.view_count,
    duration: row.duration || 0,
    createdAt: row.created_at,
    author,
    likeCount: likes.n,
    commentCount: comments.n,
    repostCount: reposts.n,
    replyCount: replies.n,
    liked: !!liked,
    bookmarked: !!bookmarked,
  };
}

// ---- Comments ----
const countCommentLikes = db.prepare(`SELECT COUNT(*)::int n FROM likes WHERE comment_id = ?`);
const viewerLikedComment = db.prepare(`SELECT 1 FROM likes WHERE comment_id = ? AND user_id = ?`);

export async function presentComment(row, viewerId = null) {
  if (!row) return null;
  const [author, likes, liked] = await Promise.all([
    getUserById(row.user_id).then((u) => presentUser(u, viewerId)),
    countCommentLikes.get(row.id),
    viewerId ? viewerLikedComment.get(row.id, viewerId) : Promise.resolve(null),
  ]);
  return {
    id: row.id,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id || null,
    text: row.text,
    createdAt: row.created_at,
    author,
    likeCount: likes.n,
    liked: !!liked,
    isOwn: viewerId === row.user_id,
  };
}

export { parse };
