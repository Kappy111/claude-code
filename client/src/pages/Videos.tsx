import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Video as VideoIcon, Eye, Play } from 'lucide-react';
import { posts as postsApi } from '../api';
import { Avatar, Spinner, EmptyState, Skeleton } from '../components/ui';
import { formatCount, timeAgo, formatDuration } from '../lib/util';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import type { Post } from '../types';

export function Videos() {
  const [list, setList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [cat, setCat] = useState('All');
  const offset = useRef(0);

  useEffect(() => {
    postsApi.feed('videos', 'mixed', 0).then(({ posts, hasMore }) => {
      setList(posts); setHasMore(hasMore); offset.current = posts.length;
    }).finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(async () => {
    const { posts, hasMore } = await postsApi.feed('videos', 'mixed', offset.current);
    setList((l) => { const seen = new Set(l.map((p) => p.id)); return [...l, ...posts.filter((p) => !seen.has(p.id))]; });
    setHasMore(hasMore); offset.current += posts.length;
  }, []);

  const sentinel = useInfiniteScroll(loadMore, !loading && hasMore);

  // Category chips derived from video tags/hashtags (YouTube-style filter row).
  const cats = ['All', ...Array.from(new Set(list.flatMap((p) => [...p.tags, ...p.hashtags]))).slice(0, 12)];
  const shown = cat === 'All' ? list : list.filter((p) => [...p.tags, ...p.hashtags].includes(cat));

  return (
    <div className="max-w-6xl mx-auto px-4 py-4">
      <div className="sticky top-0 z-20 bg-ink-950/85 backdrop-blur -mx-4 px-4 pb-3 pt-1">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`chip capitalize ${cat === c ? 'chip-active' : 'chip-idle'}`}>{c}</button>)}
        </div>
      </div>
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <div key={i}><Skeleton className="aspect-video rounded-xl mb-3" /><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></div>)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={VideoIcon} title="No videos yet" subtitle="Long-form videos will appear here." />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-6">
            {shown.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="group">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-ink-900">
                  {p.thumbnailUrl ? <img src={p.thumbnailUrl} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition" alt="" /> : <div className="w-full h-full grid place-items-center text-txt-muted"><Play size={36} /></div>}
                  <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 bg-black/20 transition"><span className="w-12 h-12 rounded-full bg-black/60 grid place-items-center"><Play size={22} className="fill-white ml-0.5" /></span></div>
                  {p.duration > 0 && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-semibold text-white tabular-nums">{formatDuration(p.duration)}</span>}
                </div>
                <div className="flex gap-3 mt-3">
                  <Avatar user={p.author} size={36} />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 group-hover:text-brand-300 transition">{p.title}</h3>
                    <p className="text-xs text-txt-muted mt-1">{p.author.displayName}</p>
                    <p className="text-xs text-txt-muted flex items-center gap-1"><Eye size={12} /> {formatCount(p.viewCount)} views · {timeAgo(p.createdAt)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div ref={sentinel} className="h-1" />
        </>
      )}
    </div>
  );
}
