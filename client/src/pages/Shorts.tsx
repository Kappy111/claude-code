import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Music2, Play, Volume2, VolumeX, Plus, Check, ArrowLeft } from 'lucide-react';
import { posts as postsApi, users as usersApi, errMsg } from '../api';
import { Avatar } from '../components/ui';
import { CommentsPanel } from '../components/CommentsPanel';
import { useVisible } from '../hooks/useInfiniteScroll';
import { formatCount } from '../lib/util';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { Post } from '../types';

function ShortItem({ post: initial, muted, onToggleMute, onComment }: {
  post: Post; muted: boolean; onToggleMute: () => void; onComment: () => void;
}) {
  const [post, setPost] = useState(initial);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { user } = useAuth();
  const { show } = useToast();

  const ref = useVisible<HTMLDivElement>((visible) => {
    const v = videoRef.current;
    if (!v) return;
    if (visible) { v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); v.currentTime = 0; }
  });

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const like = async () => {
    if (!user) { show('Sign in to like.', 'info'); return; }
    const opt = { ...post, liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) };
    setPost(opt);
    try { setPost(post.liked ? await postsApi.unlike(post.id) : await postsApi.like(post.id)); }
    catch (e) { setPost(post); show(errMsg(e), 'error'); }
  };

  const follow = async () => {
    if (!user) { show('Sign in to follow.', 'info'); return; }
    try {
      const u = post.author.isFollowing ? await usersApi.unfollow(post.author.username) : await usersApi.follow(post.author.username);
      setPost((p) => ({ ...p, author: u }));
    } catch (e) { show(errMsg(e), 'error'); }
  };

  const share = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); show('Link copied', 'success'); } } catch { /* */ }
  };

  const ActionBtn = ({ icon: Icon, label, onClick, active, fill }: any) => (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group">
      <span className={`w-12 h-12 rounded-full bg-black/40 backdrop-blur grid place-items-center transition group-active:scale-90 ${active ? 'text-accent-pink' : 'text-white'}`}>
        <Icon size={26} className={fill ? 'fill-current' : ''} />
      </span>
      {label != null && <span className="text-xs text-white font-medium drop-shadow">{label}</span>}
    </button>
  );

  return (
    <div ref={ref} className="relative h-full w-full snap-start grid place-items-center bg-black">
      <video
        ref={videoRef}
        src={post.media[0]?.url}
        poster={post.thumbnailUrl || undefined}
        loop playsInline muted={muted}
        onClick={togglePlay}
        className="h-full w-full object-contain max-w-[500px]"
      />
      {!playing && <button onClick={togglePlay} className="absolute inset-0 grid place-items-center"><Play size={64} className="text-white/80 fill-white/80" /></button>}

      {/* mute toggle */}
      <button onClick={onToggleMute} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur grid place-items-center text-white z-10">
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* right action rail */}
      <div className="absolute right-3 bottom-28 md:bottom-10 flex flex-col items-center gap-4 z-10">
        <Link to={`/u/${post.author.username}`} className="relative mb-1">
          <Avatar user={post.author} size={48} ring />
          {!post.author.isSelf && !post.author.isFollowing && (
            <span onClick={(e) => { e.preventDefault(); follow(); }} className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-accent-pink grid place-items-center">
              <Plus size={13} className="text-white" />
            </span>
          )}
          {post.author.isFollowing && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-brand grid place-items-center"><Check size={12} className="text-white" /></span>
          )}
        </Link>
        <ActionBtn icon={Heart} label={formatCount(post.likeCount)} onClick={like} active={post.liked} fill={post.liked} />
        <ActionBtn icon={MessageCircle} label={formatCount(post.commentCount)} onClick={onComment} />
        <ActionBtn icon={Share2} label="Share" onClick={share} />
        <div className="w-10 h-10 rounded-lg bg-ink-700 overflow-hidden animate-[spin_4s_linear_infinite]">
          <img src={post.author.profileImage || ''} className="w-full h-full object-cover" alt="" />
        </div>
      </div>

      {/* bottom info */}
      <div className="absolute left-4 right-20 bottom-24 md:bottom-8 z-10 text-white">
        <Link to={`/u/${post.author.username}`} className="font-bold text-lg drop-shadow hover:underline">@{post.author.username}</Link>
        {post.caption && <p className="mt-1.5 text-sm drop-shadow line-clamp-3">{post.caption}</p>}
        {post.hashtags.length > 0 && (
          <p className="mt-1 text-sm font-medium drop-shadow">{post.hashtags.map((h) => <Link key={h} to={`/tag/${h}`} className="mr-1.5 hover:underline">#{h}</Link>)}</p>
        )}
        {post.audioInfo && (
          <div className="mt-2.5 flex items-center gap-2 text-sm">
            <Music2 size={15} className="shrink-0" />
            <span className="truncate max-w-[200px] inline-block">{post.audioInfo}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Shorts() {
  const location = useLocation();
  const navigate = useNavigate();
  const [list, setList] = useState<Post[]>([]);
  const [muted, setMuted] = useState(true);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const offset = useRef(0);
  const startId = (location.state as any)?.startId as string | undefined;

  useEffect(() => {
    postsApi.shorts(0).then(({ posts }) => {
      let ordered = posts;
      if (startId) {
        const idx = posts.findIndex((p) => p.id === startId);
        if (idx > 0) ordered = [posts[idx], ...posts.slice(0, idx), ...posts.slice(idx + 1)];
      }
      setList(ordered);
      offset.current = posts.length;
    }).finally(() => setLoading(false));
  }, [startId]);

  const loadMore = useCallback(async () => {
    const { posts } = await postsApi.shorts(offset.current);
    setList((l) => { const seen = new Set(l.map((p) => p.id)); return [...l, ...posts.filter((p) => !seen.has(p.id))]; });
    offset.current += posts.length;
  }, []);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight) loadMore();
  };

  if (loading) return <div className="h-screen grid place-items-center bg-black"><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>;

  return (
    <div className="fixed inset-0 md:left-[84px] xl:left-64 bg-black">
      <button onClick={() => navigate(-1)} className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur grid place-items-center text-white md:hidden">
        <ArrowLeft size={20} />
      </button>
      <div onScroll={onScroll} className="h-full overflow-y-scroll snap-y-mandatory no-scrollbar">
        {list.map((p) => (
          <div key={p.id} className="h-full w-full">
            <ShortItem post={p} muted={muted} onToggleMute={() => setMuted((m) => !m)} onComment={() => setCommentFor(p.id)} />
          </div>
        ))}
        {list.length === 0 && <div className="h-full grid place-items-center text-white/60">No shorts yet.</div>}
      </div>
      {commentFor && <CommentsPanel postId={commentFor} onClose={() => setCommentFor(null)} />}
    </div>
  );
}
