-- OmniFeed database schema (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name    TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT,
  auth_provider   TEXT NOT NULL DEFAULT 'email',   -- email | google | apple
  profile_image   TEXT,
  bio             TEXT NOT NULL DEFAULT '',
  verified        INTEGER NOT NULL DEFAULT 0,
  is_private      INTEGER NOT NULL DEFAULT 0,
  who_can_comment TEXT NOT NULL DEFAULT 'everyone', -- everyone | following | nobody
  notify_prefs    TEXT NOT NULL DEFAULT '{}',       -- JSON blob of notification toggles
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_type     TEXT NOT NULL,                      -- thought | snap | short | video
  text          TEXT,                               -- thought body
  caption       TEXT,                               -- snap/short caption
  title         TEXT,                               -- video title
  description   TEXT,                               -- video description
  media         TEXT NOT NULL DEFAULT '[]',         -- JSON array of media urls (snaps carousel / video / short)
  thumbnail_url TEXT,
  hashtags      TEXT NOT NULL DEFAULT '[]',         -- JSON array of hashtag strings (no #)
  link_url      TEXT,                               -- optional attached link (thought)
  audio_info    TEXT,                               -- short sound/audio label
  chapters      TEXT NOT NULL DEFAULT '[]',         -- JSON array {time,label} for videos
  tags          TEXT NOT NULL DEFAULT '[]',         -- JSON array for videos
  parent_post_id TEXT REFERENCES posts(id) ON DELETE CASCADE, -- thread continuation
  repost_of     TEXT REFERENCES posts(id) ON DELETE SET NULL,
  visibility    TEXT NOT NULL DEFAULT 'public',     -- public | private
  view_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);

CREATE TABLE IF NOT EXISTS comments (
  id                TEXT PRIMARY KEY,
  post_id           TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  text              TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);

CREATE TABLE IF NOT EXISTS likes (
  id         TEXT PRIMARY KEY,
  post_id    TEXT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Prevent duplicate likes (per post OR per comment, per user)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_like_post ON likes(user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_like_comment ON likes(user_id, comment_id) WHERE comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookmarks (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookmark ON bookmarks(user_id, post_id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active',   -- active | pending (for private accounts)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY,
  recipient_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,   -- follow | follow_request | like | comment | reply | repost | bookmark
  post_id           TEXT REFERENCES posts(id) ON DELETE CASCADE,
  comment_id        TEXT REFERENCES comments(id) ON DELETE CASCADE,
  read_status       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id, created_at);

CREATE TABLE IF NOT EXISTS watch_history (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  progress       REAL NOT NULL DEFAULT 0,  -- 0..1 fraction watched
  last_watched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_history(user_id, last_watched_at);
