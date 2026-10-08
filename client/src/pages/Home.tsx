import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, Users, Flame, PenLine } from 'lucide-react';
import { posts as postsApi } from '../api';
import { PostCard } from '../components/PostCard';
import { FeedSkeleton, EmptyState, Spinner } from '../components/ui';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useCreate } from '../components/Layout';
import type { Post } from '../types';

const MODES = [
  { key: 'all', label: 'All' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'snaps', label: 'Snaps' },
  { key: 'thoughts', label: 'Thoughts' },
  { key: 'videos', label: 'Videos' },
];
const SOURCES = [
  { key: 'mixed', label: 'For you', icon: Sparkles },
  { key: 'following', label: 'Following', icon: Users },
  { key: 'recommended', label: 'Discover', icon: Flame },
];

export function Home() {
  const [mode, setMode] = useState('all');
  const [source, setSource] = useState('mixed');
  const [list, setList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);
  const openCreate = useCreate();

  const reload = useCallback(async () => {
    setLoading(true);
    offset.current = 0;
    try {
      const { posts, hasMore } = await postsApi.feed(mode, source, 0);
      setList(posts);
      setHasMore(hasMore);
      offset.current = posts.length;
    } finally { setLoading(false); }
  }, [mode, source]);

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { posts, hasMore: more } = await postsApi.feed(mode, source, offset.current);
      setList((l) => {
        const seen = new Set(l.map((p) => p.id));
        return [...l, ...posts.filter((p) => !seen.has(p.id))];
      });
      setHasMore(more);
      offset.current += posts.length;
    } finally { setLoadingMore(false); }
  }, [mode, source, hasMore, loadingMore]);

  const sentinel = useInfiniteScroll(loadMore, !loading && hasMore);

  return (
    <div>
      {/* Sticky header: source + format switchers */}
      <header className="sticky top-0 z-20 bg-ink-950/80 backdrop-blur border-b border-line">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center gap-1 pt-3">
            {SOURCES.map((s) => (
              <button key={s.key} onClick={() => setSource(s.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg font-semibold text-sm border-b-2 transition ${source === s.key ? 'border-brand text-txt-primary' : 'border-transparent text-txt-muted hover:text-txt-secondary'}`}>
                <s.icon size={16} /> {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-3">
            {MODES.map((m) => (
              <button key={m.key} onClick={() => setMode(m.key)} className={`chip ${mode === m.key ? 'chip-active' : 'chip-idle'}`}>{m.label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <FeedSkeleton />
        ) : list.length === 0 ? (
          <EmptyState
            icon={source === 'following' ? Users : PenLine}
            title={source === 'following' ? 'Your following feed is quiet' : 'Nothing here yet'}
            subtitle={source === 'following' ? 'Follow some creators from Explore to fill this feed.' : 'Be the first to post something in this format.'}
            action={<button onClick={() => openCreate()} className="btn-brand px-5 py-2.5">Create a post</button>}
          />
        ) : (
          <>
            {list.map((p) => <PostCard key={p.id} post={p} onDelete={(id) => setList((l) => l.filter((x) => x.id !== id))} />)}
            {loadingMore && <div className="flex justify-center py-6"><Spinner /></div>}
            {!hasMore && <p className="text-center text-sm text-txt-muted py-8">You're all caught up ✦</p>}
            <div ref={sentinel} className="h-1" />
          </>
        )}
      </div>
    </div>
  );
}
