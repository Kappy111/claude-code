import { db } from '../db.js';

const parse = (v, fallback) => {
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};

// ---- Users ----
const countFollowers = db.prepare(
  `SELECT COUNT(*) n FROM follows WHERE following_id = ? AND status = 'active'`
);
const countFollowing = db.prepare(
  `SELECT COUNT(*) n FROM follows WHERE follower_id = ? AND status = 'active'`
);
const countPosts = db.prepare(
  `SELECT COUNT(*) n FROM posts WHERE user_id = ? AND parent_post_id IS NULL`
);
const followEdge = db.prepare(
  `SELECT status FROM follows WHERE follower_id = ? AND following_id = ?`
);

export function presentUser(row, viewerId = null) {
  if (!row) return null;
  const followState = viewerId && viewerId !== row.id
    ? (followEdge.get(viewerId, row.id)?.status || null)
    : null;
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
    followerCount: countFollowers.get(row.id).n,
    followingCount: countFollowing.get(row.id).n,
    postCount: countPosts.get(row.id).n,
    isFollowing: followState === 'active',
    followRequested: followState === 'pending',
    isSelf: viewerId === row.id,
  };
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ---- Posts ----
const countPostLikes = db.prepare(`SELECT COUNT(*) n FROM likes WHERE post_id = ?`);
const countPostComments = db.prepare(`SELECT COUNT(*) n FROM comments WHERE post_id = ?`);
const countReposts = db.prepare(`SELECT COUNT(*) n FROM posts WHERE repost_of = ?`);
const countReplies = db.prepare(`SELECT COUNT(*) n FROM posts WHERE parent_post_id = ?`);
const viewerLiked = db.prepare(`SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?`);
const viewerBookmarked = db.prepare(`SELECT 1 FROM bookmarks WHERE post_id = ? AND user_id = ?`);

export function presentPost(row, viewerId = null, { withAuthor = true } = {}) {
  if (!row) return null;
  const author = withAuthor ? presentUser(getUserById(row.user_id), viewerId) : undefined;
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
    likeCount: countPostLikes.get(row.id).n,
    commentCount: countPostComments.get(row.id).n,
    repostCount: countReposts.get(row.id).n,
    replyCount: countReplies.get(row.id).n,
    liked: viewerId ? !!viewerLiked.get(row.id, viewerId) : false,
    bookmarked: viewerId ? !!viewerBookmarked.get(row.id, viewerId) : false,
  };
}

// ---- Comments ----
const countCommentLikes = db.prepare(`SELECT COUNT(*) n FROM likes WHERE comment_id = ?`);
const viewerLikedComment = db.prepare(`SELECT 1 FROM likes WHERE comment_id = ? AND user_id = ?`);

export function presentComment(row, viewerId = null) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    parentCommentId: row.parent_comment_id || null,
    text: row.text,
    createdAt: row.created_at,
    author: presentUser(getUserById(row.user_id), viewerId),
    likeCount: countCommentLikes.get(row.id).n,
    liked: viewerId ? !!viewerLikedComment.get(row.id, viewerId) : false,
    isOwn: viewerId === row.user_id,
  };
}

export { parse };
