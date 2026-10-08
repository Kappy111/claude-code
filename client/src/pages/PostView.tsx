import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Eye, BadgeCheck, ChevronDown, ThumbsUp, ThumbsDown, Share2, Bookmark, Repeat2, Play } from 'lucide-react';
import { posts as postsApi, users as usersApi, comments as commentsApi, errMsg } from '../api';
import { Avatar, Spinner, EmptyState, UserName } from '../components/ui';
import { VideoPlayer } from '../components/VideoPlayer';
import { Carousel } from '../components/Carousel';
import { EngagementBar } from '../components/EngagementBar';
import { CommentsPanel } from '../components/CommentsPanel';
import { PostCard } from '../components/PostCard';
import { formatCount, timeAgo, fullDate, formatDuration } from '../lib/util';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { Post, Comment } from '../types';

export function PostView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { show } = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [ancestors, setAncestors] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const watchSent = useRef(0);

  const load = useCallback(async () => {
    setLoading(true); setNotFound(false);
    try {
      const data = await postsApi.get(id!);
      if (data.post.type === 'short') { navigate('/shorts', { replace: true, state: { startId: data.post.id } }); return; }
      setPost(data.post); setAncestors(data.ancestors); setReplies(data.replies);
    } catch { setNotFound(true); } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const onProgress = (p: number) => {
    const now = Date.now();
    if (post?.type === 'video' && user && now - watchSent.current > 5000) {
      watchSent.current = now;
      postsApi.watch(post.id, p).catch(() => {});
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-10 flex justify-center"><Spinner /></div>;
  if (notFound || !post) return (
    <div className="max-w-2xl mx-auto px-4">
      <EmptyState icon={ArrowLeft} title="Post not found" subtitle="It may have been deleted."
        action={<Link to="/home" className="btn-brand px-5 py-2.5">Back home</Link>} />
    </div>
  );

  // ---- VIDEO (YouTube-style watch page) ----
  if (post.type === 'video') return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_402px] lg:gap-6">
      <div className="min-w-0">
        <div className="lg:rounded-xl overflow-hidden">
          <VideoPlayer post={post} onProgress={onProgress} />
        </div>
        <h1 className="text-xl font-bold mt-3 leading-snug">{post.title}</h1>

        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <CreatorRow post={post} onUpdate={(a) => setPost({ ...post, author: a })} />
          <VideoActions post={post} onChange={setPost} onComment={() => setShowComments(true)} />
        </div>

        <DescriptionBox post={post} />

        <InlineComments postId={post.id} />
      </div>

      <aside className="mt-6 lg:mt-0">
        <RelatedVideos postId={post.id} />
      </aside>

      {showComments && <CommentsPanel postId={post.id} onClose={() => setShowComments(false)} onCountChange={(n) => setPost({ ...post, commentCount: n })} />}
    </div>
  );

  // ---- THOUGHT (thread) / SNAP ----
  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-txt-secondary hover:text-txt-primary mb-4"><ArrowLeft size={18} /> Back</button>

      {ancestors.length > 0 && (
        <div className="space-y-3 mb-3 relative">
          <div className="absolute left-[25px] top-10 bottom-0 w-px bg-line" />
          {ancestors.map((a) => <ThreadPost key={a.id} post={a} />)}
        </div>
      )}

      {post.type === 'snap' ? (
        <SnapView post={post} onChange={setPost} onComment={() => setShowComments(true)} />
      ) : (
        <ThreadPost post={post} large onComment={() => setShowComments(true)} onChange={setPost} />
      )}

      {replies.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold text-sm text-txt-secondary mb-2 px-1">Replies</h3>
          <div className="space-y-3">{replies.map((r) => <PostCard key={r.id} post={r} />)}</div>
        </div>
      )}

      <InlineComments postId={post.id} />
      {showComments && <CommentsPanel postId={post.id} onClose={() => setShowComments(false)} onCountChange={(n) => setPost({ ...post, commentCount: n })} />}
    </div>
  );
}

function CreatorRow({ post, onUpdate }: { post: Post; onUpdate: (a: any) => void }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const follow = async () => {
    if (!user) { show('Sign in to subscribe.', 'info'); return; }
    setBusy(true);
    try { onUpdate(post.author.isFollowing ? await usersApi.unfollow(post.author.username) : await usersApi.follow(post.author.username)); }
    catch (e) { show(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3">
      <Link to={`/u/${post.author.username}`}><Avatar user={post.author} size={44} /></Link>
      <div>
        <Link to={`/u/${post.author.username}`} className="font-semibold flex items-center gap-1 hover:underline">{post.author.displayName}{post.author.verified && <BadgeCheck size={15} className="text-brand-300" />}</Link>
        <div className="text-xs text-txt-muted">{formatCount(post.author.followerCount)} followers</div>
      </div>
      {!post.author.isSelf && (
        <button onClick={follow} disabled={busy} className={`ml-2 px-5 py-2 text-sm ${post.author.isFollowing ? 'btn-ghost' : 'btn-brand'}`}>
          {post.author.isFollowing ? 'Subscribed' : 'Subscribe'}
        </button>
      )}
    </div>
  );
}

// YouTube-style action cluster: like/dislike pill + share + save + repost-equivalent.
function VideoActions({ post, onChange, onComment }: { post: Post; onChange: (p: Post) => void; onComment: () => void }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [disliked, setDisliked] = useState(false); // dislikes aren't public on YT; kept client-side

  const like = async () => {
    if (!user) { show('Sign in to like.', 'info'); return; }
    if (disliked) setDisliked(false);
    const opt = { ...post, liked: !post.liked, likeCount: post.likeCount + (post.liked ? -1 : 1) };
    onChange(opt);
    try { onChange(post.liked ? await postsApi.unlike(post.id) : await postsApi.like(post.id)); }
    catch (e) { onChange(post); show(errMsg(e), 'error'); }
  };
  const bookmark = async () => {
    if (!user) { show('Sign in to save.', 'info'); return; }
    try { const u = post.bookmarked ? await postsApi.unbookmark(post.id) : await postsApi.bookmark(post.id); onChange(u); show(u.bookmarked ? 'Saved' : 'Removed from saved', 'success'); }
    catch (e) { show(errMsg(e), 'error'); }
  };
  const share = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); show('Link copied', 'success'); } } catch { /* */ }
  };

  const Pill = ({ children }: any) => <div className="flex items-center bg-ink-800 rounded-full overflow-hidden">{children}</div>;
  const PillBtn = ({ icon: Icon, label, onClick, active, fill }: any) => (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium hover:bg-ink-700 transition ${active ? 'text-brand-300' : ''}`}>
      <Icon size={18} className={fill ? 'fill-current' : ''} /> {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Pill>
        <PillBtn icon={ThumbsUp} label={formatCount(post.likeCount)} onClick={like} active={post.liked} fill={post.liked} />
        <span className="w-px h-6 bg-line" />
        <button onClick={() => { if (!user) { show('Sign in first.', 'info'); return; } setDisliked((d) => !d); if (post.liked) like(); }}
          className={`px-4 py-2 hover:bg-ink-700 transition ${disliked ? 'text-accent-pink' : ''}`}>
          <ThumbsDown size={18} className={disliked ? 'fill-current' : ''} />
        </button>
      </Pill>
      <Pill><PillBtn icon={Repeat2} label={formatCount(post.repostCount)} onClick={async () => {
        if (!user) { show('Sign in first.', 'info'); return; }
        try { const r = await postsApi.repost(post.id); onChange({ ...post, repostCount: post.repostCount + (r.reposted ? 1 : -1) }); show(r.reposted ? 'Reposted' : 'Repost removed', 'success'); } catch (e) { show(errMsg(e), 'error'); }
      }} /></Pill>
      <Pill><PillBtn icon={Share2} label="Share" onClick={share} /></Pill>
      <Pill><PillBtn icon={Bookmark} label="Save" onClick={bookmark} active={post.bookmarked} fill={post.bookmarked} /></Pill>
    </div>
  );
}

function DescriptionBox({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  const hasBody = post.description || post.chapters.length > 0 || post.tags.length > 0;
  return (
    <div className="card bg-ink-850 p-3.5 mt-3 text-sm">
      <div className="font-semibold flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1"><Eye size={14} /> {formatCount(post.viewCount)} views</span>
        <span>{fullDate(post.createdAt)}</span>
        {post.tags.slice(0, 3).map((t) => <span key={t} className="text-brand-300">#{t.replace(/\s+/g, '')}</span>)}
      </div>
      {post.description && <p className={`whitespace-pre-wrap leading-relaxed mt-2 ${open ? '' : 'line-clamp-2'}`}>{post.description}</p>}
      {open && post.chapters.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-semibold text-txt-secondary">Chapters</div>
          {post.chapters.map((c) => (
            <div key={c.time} className="text-brand-300">{formatDuration(c.time)} — {c.label}</div>
          ))}
        </div>
      )}
      {open && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">{post.tags.map((t) => <span key={t} className="chip chip-idle text-xs">{t}</span>)}</div>
      )}
      {hasBody && (
        <button onClick={() => setOpen((o) => !o)} className="font-semibold text-txt-secondary mt-2 flex items-center gap-1">
          {open ? 'Show less' : 'Show more'} <ChevronDown size={15} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
      )}
    </div>
  );
}

function RelatedVideos({ postId }: { postId: string }) {
  const [list, setList] = useState<Post[] | null>(null);
  useEffect(() => { setList(null); postsApi.related(postId).then(setList).catch(() => setList([])); }, [postId]);
  if (!list) return <div className="flex justify-center py-6"><Spinner /></div>;
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm text-txt-secondary mb-1">Up next</h3>
      {list.map((p) => (
        <Link key={p.id} to={`/p/${p.id}`} className="flex gap-2 group">
          <div className="relative w-40 shrink-0 aspect-video rounded-lg overflow-hidden bg-ink-900">
            {p.thumbnailUrl ? <img src={p.thumbnailUrl} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" alt="" /> : <div className="w-full h-full grid place-items-center text-txt-muted"><Play size={20} /></div>}
            {p.duration > 0 && <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[10px] font-semibold text-white tabular-nums">{formatDuration(p.duration)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-brand-300 transition">{p.title}</h4>
            <p className="text-xs text-txt-muted mt-1 truncate">{p.author.displayName}</p>
            <p className="text-xs text-txt-muted">{formatCount(p.viewCount)} views · {timeAgo(p.createdAt)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ThreadPost({ post, large, onComment, onChange }: { post: Post; large?: boolean; onComment?: () => void; onChange?: (p: Post) => void }) {
  const [local, setLocal] = useState(post);
  useEffect(() => setLocal(post), [post]);
  const update = (p: Post) => { setLocal(p); onChange?.(p); };
  return (
    <div className={`relative ${large ? 'card p-4' : 'pl-0'}`}>
      <div className="flex gap-3">
        <Link to={`/u/${local.author.username}`} className="relative z-10"><Avatar user={local.author} size={large ? 46 : 40} /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <UserName user={local.author} />
            <span className="text-xs text-txt-muted">@{local.author.username} · {timeAgo(local.createdAt)}</span>
          </div>
          {local.text && <p className={`mt-1 whitespace-pre-wrap break-words ${large ? 'text-lg' : 'text-[15px]'}`}>{local.text}</p>}
          {local.media.length > 0 && <div className="mt-3"><Carousel media={local.media} /></div>}
          {(large || onComment) && <div className="mt-3"><EngagementBar post={local} onChange={update} onComment={onComment} /></div>}
        </div>
      </div>
    </div>
  );
}

function SnapView({ post, onChange, onComment }: { post: Post; onChange: (p: Post) => void; onComment: () => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 p-3 border-b border-line">
        <Link to={`/u/${post.author.username}`}><Avatar user={post.author} size={40} /></Link>
        <div><UserName user={post.author} /><div className="text-xs text-txt-muted">{timeAgo(post.createdAt)}</div></div>
      </div>
      <Carousel media={post.media} rounded={false} />
      <div className="p-4">
        {post.caption && <p className="text-[15px] whitespace-pre-wrap break-words mb-3">{post.caption}</p>}
        <EngagementBar post={post} onChange={onChange} onComment={onComment} showRepost={false} />
      </div>
    </div>
  );
}

// Compact inline comment list under the post (desktop convenience)
function InlineComments({ postId }: { postId: string }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);
  const load = () => commentsApi.list(postId).then((d) => { setList(d.comments); setCount(d.count); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [postId]);
  const submit = async () => {
    if (!user) { show('Sign in to comment.', 'info'); return; }
    if (!text.trim()) return;
    try { await commentsApi.add(postId, text.trim()); setText(''); load(); } catch (e) { show(errMsg(e), 'error'); }
  };
  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-3">{count} comment{count === 1 ? '' : 's'}</h3>
      <div className="flex items-center gap-2 mb-4">
        <Avatar user={user} size={36} />
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Add a comment…" className="input flex-1" />
        <button onClick={submit} disabled={!text.trim()} className="btn-brand px-4 py-2.5">Post</button>
      </div>
      <div className="space-y-4">
        {list.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Link to={`/u/${c.author.username}`}><Avatar user={c.author} size={36} /></Link>
            <div>
              <div className="text-sm"><Link to={`/u/${c.author.username}`} className="font-semibold hover:underline">@{c.author.username}</Link> <span className="text-xs text-txt-muted">{timeAgo(c.createdAt)}</span></div>
              <p className="text-sm text-txt-primary mt-0.5 whitespace-pre-wrap">{c.text}</p>
              {c.replies?.map((r) => (
                <div key={r.id} className="flex gap-2 mt-2 ml-2">
                  <Avatar user={r.author} size={28} />
                  <div><span className="text-xs font-semibold">@{r.author.username}</span> <p className="text-sm">{r.text}</p></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
