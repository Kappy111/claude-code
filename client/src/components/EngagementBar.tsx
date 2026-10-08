import { useState } from 'react';
import { Heart, MessageCircle, Repeat2, Bookmark, Share2 } from 'lucide-react';
import { posts as postsApi, errMsg } from '../api';
import { formatCount } from '../lib/util';
import { useToast } from '../store/toast';
import { useAuth } from '../store/auth';
import type { Post } from '../types';

interface Props {
  post: Post;
  onChange?: (p: Post) => void;
  onComment?: () => void;
  compact?: boolean;
  showRepost?: boolean;
}

export function EngagementBar({ post, onChange, onComment, compact = false, showRepost = true }: Props) {
  const { show } = useToast();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const requireLogin = () => {
    if (!user) { show('Sign in to interact with posts.', 'info'); return true; }
    return false;
  };

  const toggleLike = async () => {
    if (requireLogin() || busy) return;
    setBusy(true);
    const optimistic = { ...post, liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) };
    onChange?.(optimistic);
    try {
      const updated = post.liked ? await postsApi.unlike(post.id) : await postsApi.like(post.id);
      onChange?.(updated);
    } catch (e) {
      onChange?.(post);
      show(errMsg(e), 'error');
    } finally { setBusy(false); }
  };

  const toggleBookmark = async () => {
    if (requireLogin()) return;
    const optimistic = { ...post, bookmarked: !post.bookmarked };
    onChange?.(optimistic);
    try {
      const updated = post.bookmarked ? await postsApi.unbookmark(post.id) : await postsApi.bookmark(post.id);
      onChange?.(updated);
      show(updated.bookmarked ? 'Saved to bookmarks' : 'Removed from bookmarks', 'success');
    } catch (e) { onChange?.(post); show(errMsg(e), 'error'); }
  };

  const repost = async () => {
    if (requireLogin()) return;
    try {
      const res = await postsApi.repost(post.id);
      onChange?.({ ...post, repostCount: post.repostCount + (res.reposted ? 1 : -1) });
      show(res.reposted ? 'Reposted to your profile' : 'Repost removed', 'success');
    } catch (e) { show(errMsg(e), 'error'); }
  };

  const share = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'OmniFeed', url });
      else { await navigator.clipboard.writeText(url); show('Link copied to clipboard', 'success'); }
    } catch { /* user cancelled */ }
  };

  const sz = compact ? 20 : 22;
  const btn = 'flex items-center gap-1.5 text-txt-secondary hover:text-txt-primary transition-colors group';

  return (
    <div className={`flex items-center ${compact ? 'gap-5' : 'justify-between'} text-sm`}>
      <button onClick={toggleLike} className={`${btn} ${post.liked ? '!text-accent-pink' : ''}`} aria-label="Like">
        <Heart size={sz} className={post.liked ? 'fill-accent-pink animate-pop' : 'group-hover:scale-110 transition'} />
        {post.likeCount > 0 && <span className="tabular-nums">{formatCount(post.likeCount)}</span>}
      </button>

      <button onClick={onComment} className={btn} aria-label="Comment">
        <MessageCircle size={sz} className="group-hover:scale-110 transition" />
        {post.commentCount > 0 && <span className="tabular-nums">{formatCount(post.commentCount)}</span>}
      </button>

      {showRepost && (
        <button onClick={repost} className={`${btn} hover:!text-accent-teal`} aria-label="Repost">
          <Repeat2 size={sz} className="group-hover:scale-110 transition" />
          {post.repostCount > 0 && <span className="tabular-nums">{formatCount(post.repostCount)}</span>}
        </button>
      )}

      <button onClick={share} className={btn} aria-label="Share">
        <Share2 size={sz} className="group-hover:scale-110 transition" />
      </button>

      <button onClick={toggleBookmark} className={`${btn} ${post.bookmarked ? '!text-brand-300' : ''}`} aria-label="Bookmark">
        <Bookmark size={sz} className={post.bookmarked ? 'fill-brand-300' : 'group-hover:scale-110 transition'} />
      </button>
    </div>
  );
}
