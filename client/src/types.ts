export type PostType = 'thought' | 'snap' | 'short' | 'video';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  profileImage: string | null;
  bio: string;
  verified: boolean;
  isPrivate: boolean;
  whoCanComment: 'everyone' | 'following' | 'nobody';
  notifyPrefs?: Record<string, boolean>;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
  followRequested: boolean;
  isSelf: boolean;
}

export interface MediaItem { url: string; type: 'image' | 'video'; size?: number; }

export interface Post {
  id: string;
  type: PostType;
  text: string | null;
  caption: string | null;
  title: string | null;
  description: string | null;
  media: MediaItem[];
  thumbnailUrl: string | null;
  hashtags: string[];
  linkUrl: string | null;
  audioInfo: string | null;
  chapters: { time: number; label: string }[];
  tags: string[];
  parentPostId: string | null;
  repostOf: string | null;
  visibility: 'public' | 'private';
  viewCount: number;
  duration: number;
  createdAt: string;
  author: User;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  replyCount: number;
  liked: boolean;
  bookmarked: boolean;
  progress?: number;
  lastWatchedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  parentCommentId: string | null;
  text: string;
  createdAt: string;
  author: User;
  likeCount: number;
  liked: boolean;
  isOwn: boolean;
  replies: Comment[];
}

export interface DMMessage { id: string; text: string; mine: boolean; createdAt: string; }
export interface Conversation {
  user: User;
  lastMessage: string;
  lastFromMe: boolean;
  lastAt: string;
  unread: number;
}

export interface NotificationGroup {
  id: string;
  type: 'follow' | 'follow_request' | 'like' | 'comment' | 'reply' | 'repost' | 'bookmark';
  postId: string | null;
  commentId: string | null;
  post: Post | null;
  actors: User[];
  read: boolean;
  createdAt: string;
}
