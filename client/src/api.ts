import axios from 'axios';
import type { Post, User, Comment, NotificationGroup, MediaItem, Conversation, DMMessage } from './types';

const TOKEN_KEY = 'omnifeed_token';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};
export const getToken = () => localStorage.getItem(TOKEN_KEY);

// Turn axios errors into readable messages for toasts / inline errors.
export function errMsg(e: any, fallback = 'Something went wrong. Please try again.'): string {
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.message === 'Network Error') return 'Network connection lost. Check your connection and retry.';
  return fallback;
}

// ---- Auth ----
export const auth = {
  signup: (d: any) => api.post('/auth/signup', d).then((r) => r.data),
  login: (identifier: string, password: string) =>
    api.post('/auth/login', { identifier, password }).then((r) => r.data),
  oauth: (provider: string, d: any) => api.post(`/auth/oauth/${provider}`, d).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user as User),
  checkUsername: (username: string) =>
    api.get('/auth/check-username', { params: { username } }).then((r) => r.data.available as boolean),
};

// ---- Users ----
export const users = {
  get: (username: string) => api.get(`/users/${username}`).then((r) => r.data.user as User),
  posts: (username: string, type?: string) =>
    api.get(`/users/${username}/posts`, { params: { type } }).then((r) => r.data as { posts: Post[]; locked?: boolean }),
  followers: (username: string) => api.get(`/users/${username}/followers`).then((r) => r.data.users as User[]),
  following: (username: string) => api.get(`/users/${username}/following`).then((r) => r.data.users as User[]),
  follow: (username: string) => api.post(`/users/${username}/follow`).then((r) => r.data.user as User),
  unfollow: (username: string) => api.delete(`/users/${username}/follow`).then((r) => r.data.user as User),
  resolveRequest: (followerId: string, action: 'accept' | 'reject') =>
    api.post(`/users/follow-requests/${followerId}/${action}`).then((r) => r.data),
  updateProfile: (d: any) => api.patch('/users/me/profile', d).then((r) => r.data.user as User),
  changeUsername: (username: string) => api.patch('/users/me/username', { username }).then((r) => r.data.user as User),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/users/me/password', { currentPassword, newPassword }).then((r) => r.data),
};

// ---- Posts ----
export const posts = {
  create: (d: any) => api.post('/posts', d).then((r) => r.data.post as Post),
  createThread: (parts: string[]) => api.post('/posts/thread', { parts }).then((r) => r.data.post as Post),
  feed: (mode: string, source: string, offset = 0) =>
    api.get('/posts/feed', { params: { mode, source, offset, limit: 15 } })
      .then((r) => r.data as { posts: Post[]; hasMore: boolean }),
  shorts: (offset = 0) =>
    api.get('/posts/shorts/feed', { params: { offset, limit: 8 } })
      .then((r) => r.data as { posts: Post[]; hasMore: boolean }),
  get: (id: string) =>
    api.get(`/posts/${id}`).then((r) => r.data as { post: Post; ancestors: Post[]; replies: Post[] }),
  related: (id: string) => api.get(`/posts/${id}/related`).then((r) => r.data.posts as Post[]),
  remove: (id: string) => api.delete(`/posts/${id}`).then((r) => r.data),
  like: (id: string) => api.post(`/posts/${id}/like`).then((r) => r.data.post as Post),
  unlike: (id: string) => api.delete(`/posts/${id}/like`).then((r) => r.data.post as Post),
  bookmark: (id: string) => api.post(`/posts/${id}/bookmark`).then((r) => r.data.post as Post),
  unbookmark: (id: string) => api.delete(`/posts/${id}/bookmark`).then((r) => r.data.post as Post),
  repost: (id: string) => api.post(`/posts/${id}/repost`).then((r) => r.data),
  bookmarks: () => api.get('/posts/me/bookmarks').then((r) => r.data.posts as Post[]),
  watch: (id: string, progress: number) => api.post(`/posts/${id}/watch`, { progress }).then((r) => r.data),
  history: () => api.get('/posts/me/history').then((r) => r.data.posts as Post[]),
};

// ---- Comments ----
export const comments = {
  list: (postId: string) =>
    api.get(`/comments/post/${postId}`).then((r) => r.data as { comments: Comment[]; count: number }),
  add: (postId: string, text: string, parentCommentId?: string) =>
    api.post(`/comments/post/${postId}`, { text, parentCommentId }).then((r) => r.data.comment as Comment),
  like: (id: string) => api.post(`/comments/${id}/like`).then((r) => r.data.comment as Comment),
  unlike: (id: string) => api.delete(`/comments/${id}/like`).then((r) => r.data.comment as Comment),
  remove: (id: string) => api.delete(`/comments/${id}`).then((r) => r.data),
};

// ---- Notifications ----
export const notifications = {
  list: () => api.get('/notifications').then((r) => r.data as { notifications: NotificationGroup[]; unread: number }),
  unreadCount: () => api.get('/notifications/unread-count').then((r) => r.data.count as number),
  markRead: () => api.post('/notifications/read').then((r) => r.data),
  followRequests: () => api.get('/notifications/follow-requests').then((r) => r.data.users as User[]),
};

// ---- Search ----
export const search = {
  query: (q: string, category = 'all') =>
    api.get('/search', { params: { q, category } })
      .then((r) => r.data as { users: User[]; posts: Post[]; hashtags: { tag: string; count: number }[] }),
  trending: () => api.get('/search/trending').then((r) => r.data),
  hashtag: (tag: string) => api.get(`/search/hashtag/${tag}`).then((r) => r.data as { tag: string; posts: Post[] }),
};

// ---- Messages (DMs) ----
export const messages = {
  conversations: () => api.get('/messages').then((r) => r.data.conversations as Conversation[]),
  unreadCount: () => api.get('/messages/unread-count').then((r) => r.data.count as number),
  thread: (username: string) =>
    api.get(`/messages/thread/${username}`).then((r) => r.data as { user: User; messages: DMMessage[] }),
  send: (username: string, text: string) =>
    api.post(`/messages/${username}`, { text }).then((r) => r.data.message as DMMessage),
};

// ---- Upload ----
export async function uploadFiles(files: File[], onProgress?: (pct: number) => void): Promise<MediaItem[]> {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const r = await api.post('/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100)); },
  });
  return r.data.files as MediaItem[];
}
