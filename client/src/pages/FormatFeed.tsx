import { useState, useEffect, useCallback, useRef } from 'react';
import { Image as ImageIcon, Type } from 'lucide-react';
import { posts as postsApi } from '../api';
import { PostCard } from '../components/PostCard';
import { FeedSkeleton, EmptyState, Spinner } from '../components/ui';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useCreate } from '../components/Layout';
import type { Post, PostType } from '../types';

// Generic single-format feed, used for /photos (snaps) and /thoughts.
export function FormatFeed({ mode, title, icon, createType }: { mode: string; title: string; icon: any; createType: PostType }) {
  const [list, setList] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);
  const openCreate = useCreate();

  const reset = useCallback(() => {
    setLoading(true); offset.current = 0;
    postsApi.feed(mode, 'mixed', 0).then(({ posts, hasMore }) => {
      setList(posts); setHasMore(hasMore); offset.current = posts.length;
    }).finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => { reset(); }, [reset]);

  const loadMore = useCallback(async () => {
    const { posts, hasMore } = await postsApi.feed(mode, 'mixed', offset.current);
    setList((l) => { const seen = new Set(l.map((p) => p.id)); return [...l, ...posts.filter((p) => !seen.has(p.id))]; });
    setHasMore(hasMore); offset.current += posts.length;
  }, [mode]);

  const sentinel = useInfiniteScroll(loadMore, !loading && hasMore);
  const Icon = icon;
  const noun = createType === 'snap' ? 'Snap' : 'Thought';

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><Icon className="text-brand-300" /> {title}</h1>
      {loading ? <FeedSkeleton /> : list.length === 0 ? (
        <EmptyState icon={Icon} title={`Be the first to post a ${noun}`} subtitle={`No ${title.toLowerCase()} yet — share the first one and start the feed.`}
          action={<button onClick={() => openCreate(createType)} className="btn-brand px-5 py-2.5">Post a {noun}</button>} />
      ) : (
        <div className="space-y-4">
          {list.map((p) => <PostCard key={p.id} post={p} onDelete={(id) => setList((l) => l.filter((x) => x.id !== id))} />)}
          <div ref={sentinel} className="h-1" />
          {!hasMore && <p className="text-center text-sm text-txt-muted py-6">That's everything ✦</p>}
        </div>
      )}
    </div>
  );
}

export const Photos = () => <FormatFeed mode="snaps" title="Photos" icon={ImageIcon} createType="snap" />;
export const Thoughts = () => <FormatFeed mode="thoughts" title="Thoughts" icon={Type} createType="thought" />;
