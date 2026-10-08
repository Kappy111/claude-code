import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Trash2, Play, Eye, Volume2, Link2 } from 'lucide-react';
import { Avatar, UserName } from './ui';
import { EngagementBar } from './EngagementBar';
import { CommentsPanel } from './CommentsPanel';
import { timeAgo, formatCount, typeLabel, formatDuration } from '../lib/util';
import { Carousel } from './Carousel';
import { posts as postsApi, errMsg } from '../api';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { Post } from '../types';

function HashtagText({ text }: { text: string }) {
  const parts = text.split(/(#\w+|https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('#')) return <Link key={i} to={`/tag/${p.slice(1).toLowerCase()}`} className="text-brand-300 hover:underline">{p}</Link>;
        if (p.startsWith('http')) return <a key={i} href={p} target="_blank" rel="noreferrer" className="text-brand-300 hover:underline break-all">{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function PostCard({ post: initial, onDelete }: { post: Post; onDelete?: (id: string) => void }) {
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(false);
  const [menu, setMenu] = useState(false);
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();

  const del = async () => {
    try { await postsApi.remove(post.id); onDelete?.(post.id); show('Post deleted', 'success'); }
    catch (e) { show(errMsg(e), 'error'); }
  };

  const Header = (
    <div className="flex items-center gap-3">
      <Link to={`/u/${post.author.username}`}><Avatar user={post.author} size={42} /></Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <UserName user={post.author} />
          <span className="text-xs text-txt-muted">· {timeAgo(post.createdAt)}</span>
        </div>
        <div className="text-xs text-txt-muted flex items-center gap-1.5">
          <span>@{post.author.username}</span>
          <span className="text-[10px] px-1.5 py-px rounded-full bg-ink-800 border border-line uppercase tracking-wide">{typeLabel[post.type]}</span>
        </div>
      </div>
      {user?.id === post.author.id && (
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="icon-btn w-8 h-8 text-txt-muted"><MoreHorizontal size={20} /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-20 card bg-ink-800 p-1 w-36 shadow-card animate-scale-in">
                <button onClick={del} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-accent-pink hover:bg-ink-700">
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <article className="card p-4 animate-fade-in">
      {Header}

      {/* Body by type */}
      <div className="mt-3">
        {post.type === 'thought' && (
          <div>
            {post.text && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words"><HashtagText text={post.text} /></p>}
            {post.linkUrl && (
              <a href={post.linkUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 card bg-ink-800 px-3 py-2.5 text-sm text-brand-300 hover:bg-ink-700">
                <Link2 size={16} /> <span className="truncate">{post.linkUrl}</span>
              </a>
            )}
            {post.media.length > 0 && <div className="mt-3"><Carousel media={post.media} /></div>}
          </div>
        )}

        {post.type === 'snap' && (
          <div>
            <Carousel media={post.media} />
            {post.caption && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words"><HashtagText text={post.caption} /></p>}
          </div>
        )}

        {post.type === 'short' && (
          <button onClick={() => navigate('/shorts', { state: { startId: post.id } })} className="relative block w-full max-w-[280px] mx-auto rounded-xl overflow-hidden bg-ink-900 group" style={{ aspectRatio: '9 / 16' }}>
            <video src={post.media[0]?.url} poster={post.thumbnailUrl || undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 flex flex-col justify-between p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold self-start px-2 py-1 rounded-full bg-black/50 backdrop-blur"><Play size={12} className="fill-white" /> Short</div>
              <div className="text-left">
                {post.caption && <p className="text-sm text-white line-clamp-2 drop-shadow">{post.caption}</p>}
                {post.audioInfo && <p className="text-xs text-white/80 flex items-center gap-1 mt-1"><Volume2 size={11} /> {post.audioInfo}</p>}
              </div>
            </div>
            <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition">
              <span className="w-14 h-14 rounded-full bg-black/50 backdrop-blur grid place-items-center"><Play size={26} className="fill-white ml-1" /></span>
            </div>
          </button>
        )}

        {post.type === 'video' && (
          <Link to={`/p/${post.id}`} className="block group">
            <div className="relative rounded-xl overflow-hidden bg-ink-900 aspect-video">
              {post.thumbnailUrl ? <img src={post.thumbnailUrl} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition" alt="" /> : <div className="w-full h-full grid place-items-center text-txt-muted"><Play size={40} /></div>}
              <div className="absolute inset-0 grid place-items-center bg-black/10 group-hover:bg-black/30 transition">
                <span className="w-14 h-14 rounded-full bg-black/60 backdrop-blur grid place-items-center"><Play size={26} className="fill-white ml-1" /></span>
              </div>
              {post.duration > 0 && <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-semibold text-white tabular-nums">{formatDuration(post.duration)}</span>}
            </div>
            <h3 className="mt-2.5 font-semibold text-[15px] leading-snug line-clamp-2 group-hover:text-brand-300 transition">{post.title}</h3>
            <p className="text-xs text-txt-muted mt-1 flex items-center gap-1"><Eye size={13} /> {formatCount(post.viewCount)} views · {timeAgo(post.createdAt)}</p>
          </Link>
        )}
      </div>

      {/* Hashtag chips for media posts */}
      {(post.type === 'snap' || post.type === 'video') && post.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {post.hashtags.slice(0, 6).map((h) => (
            <Link key={h} to={`/tag/${h}`} className="text-xs text-brand-300 hover:underline">#{h}</Link>
          ))}
        </div>
      )}

      <div className="mt-4 pt-1">
        <EngagementBar post={post} onChange={setPost} onComment={() => setShowComments(true)} showRepost={post.type === 'thought'} />
      </div>

      {showComments && (
        <CommentsPanel postId={post.id} onClose={() => setShowComments(false)} onCountChange={(n) => setPost((p) => ({ ...p, commentCount: n }))} />
      )}
    </article>
  );
}
