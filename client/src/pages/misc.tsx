import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Bookmark, History as HistoryIcon, Hash, Mail, Play, Eye } from 'lucide-react';
import { posts as postsApi, search as searchApi } from '../api';
import { PostCard } from '../components/PostCard';
import { Avatar, Spinner, EmptyState } from '../components/ui';
import { formatCount, timeAgo } from '../lib/util';
import type { Post } from '../types';

export function Bookmarks() {
  const [list, setList] = useState<Post[] | null>(null);
  useEffect(() => { postsApi.bookmarks().then(setList).catch(() => setList([])); }, []);
  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><Bookmark className="text-brand-300" /> Bookmarks</h1>
      {!list ? <div className="flex justify-center py-12"><Spinner /></div>
        : list.length === 0 ? <EmptyState icon={Bookmark} title="No bookmarks yet" subtitle="Posts you save will appear here for easy access." />
        : <div className="space-y-4">{list.map((p) => <PostCard key={p.id} post={p} onDelete={(id) => setList((l) => l!.filter((x) => x.id !== id))} />)}</div>}
    </div>
  );
}

export function WatchHistory() {
  const [list, setList] = useState<Post[] | null>(null);
  useEffect(() => { postsApi.history().then(setList).catch(() => setList([])); }, []);
  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><HistoryIcon className="text-accent-amber" /> Watch history</h1>
      {!list ? <div className="flex justify-center py-12"><Spinner /></div>
        : list.length === 0 ? <EmptyState icon={HistoryIcon} title="Nothing watched yet" subtitle="Videos you watch will show up here so you can pick up where you left off." />
        : (
          <div className="space-y-3">
            {list.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="flex gap-3 card bg-ink-850 hover:bg-ink-800 p-2.5 transition group">
                <div className="relative w-40 aspect-video rounded-lg overflow-hidden bg-ink-900 shrink-0">
                  {p.thumbnailUrl ? <img src={p.thumbnailUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full grid place-items-center text-txt-muted"><Play size={24} /></div>}
                  {p.progress != null && p.progress > 0 && <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50"><div className="h-full bg-accent-pink" style={{ width: `${Math.min(100, p.progress * 100)}%` }} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-brand-300 transition">{p.title}</h3>
                  <p className="text-xs text-txt-muted mt-1">{p.author.displayName}</p>
                  <p className="text-xs text-txt-muted flex items-center gap-1"><Eye size={11} /> {formatCount(p.viewCount)} views</p>
                  {p.lastWatchedAt && <p className="text-xs text-txt-muted mt-1">Watched {timeAgo(p.lastWatchedAt)} ago</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}

export function Hashtag() {
  const { tag } = useParams();
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(() => { setPosts(null); searchApi.hashtag(tag!).then((d) => setPosts(d.posts)).catch(() => setPosts([])); }, [tag]);
  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-accent-pink grid place-items-center"><Hash size={28} className="text-white" /></div>
        <div><h1 className="text-2xl font-bold">#{tag}</h1><p className="text-txt-muted text-sm">{posts ? `${posts.length} posts` : 'Loading…'}</p></div>
      </div>
      {!posts ? <div className="flex justify-center py-12"><Spinner /></div>
        : posts.length === 0 ? <EmptyState icon={Hash} title="No posts yet" subtitle={`Be the first to post with #${tag}.`} />
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {posts.map((p) => {
              const isVideo = p.type === 'short' || p.type === 'video';
              const thumb = p.thumbnailUrl || p.media[0]?.url;
              return (
                <Link key={p.id} to={p.type === 'short' ? '/shorts' : `/p/${p.id}`} state={p.type === 'short' ? { startId: p.id } : undefined}
                  className={`relative bg-ink-900 overflow-hidden rounded-lg group ${p.type === 'video' ? 'aspect-video' : 'aspect-square'}`}>
                  {thumb ? (isVideo && !p.thumbnailUrl ? <video src={thumb} muted playsInline className="w-full h-full object-cover" /> : <img src={thumb} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" alt="" />)
                    : <div className="w-full h-full grid place-items-center p-3 text-center text-sm text-txt-secondary">{p.text || p.title}</div>}
                  {isVideo && <span className="absolute top-2 right-2 text-white"><Play size={15} className="fill-white" /></span>}
                </Link>
              );
            })}
          </div>
        )}
    </div>
  );
}

