import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, TrendingUp, BadgeCheck, Hash, SearchX, Play, Flame } from 'lucide-react';
import { search as searchApi, users as usersApi, errMsg } from '../api';
import { Avatar, Spinner, EmptyState } from '../components/ui';
import { formatCount } from '../lib/util';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { User, Post } from '../types';

const CATS = ['All', 'People', 'Snaps', 'Thoughts', 'Shorts', 'Videos'];

export function Explore() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [results, setResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [trending, setTrending] = useState<any>(null);
  const debounce = useRef<any>(null);

  useEffect(() => { searchApi.trending().then(setTrending).catch(() => {}); }, []);

  const runSearch = useCallback((query: string, category: string) => {
    if (!query.trim()) { setResults(null); return; }
    setSearching(true);
    searchApi.query(query, category.toLowerCase()).then(setResults).finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!q.trim()) { setResults(null); return; }
    debounce.current = setTimeout(() => runSearch(q, cat), 300);
    return () => clearTimeout(debounce.current);
  }, [q, cat, runSearch]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="sticky top-0 z-20 bg-ink-950/80 backdrop-blur pb-3 -mx-4 px-4 pt-1">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, posts, hashtags…" className="input !rounded-full pl-11 pr-10 py-3" autoFocus />
          {q && <button onClick={() => setQ('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary"><X size={18} /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3">
          {CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`chip ${cat === c ? 'chip-active' : 'chip-idle'}`}>{c}</button>)}
        </div>
      </div>

      {q.trim() ? (
        <SearchResults results={results} searching={searching} cat={cat} />
      ) : (
        <TrendingView trending={trending} />
      )}
    </div>
  );
}

function FollowBtn({ user: u }: { user: User }) {
  const { user: me } = useAuth();
  const { show } = useToast();
  const [state, setState] = useState(u);
  if (me?.id === u.id) return null;
  const toggle = async () => {
    if (!me) { show('Sign in to follow.', 'info'); return; }
    const prev = state;
    setState({ ...state, isFollowing: !state.isFollowing });
    try { setState(state.isFollowing ? await usersApi.unfollow(u.username) : await usersApi.follow(u.username)); }
    catch (e) { setState(prev); show(errMsg(e), 'error'); }
  };
  return (
    <button onClick={toggle} className={`px-4 py-1.5 text-sm shrink-0 ${state.isFollowing ? 'btn-ghost' : 'btn-brand'}`}>
      {state.isFollowing ? 'Following' : state.followRequested ? 'Requested' : 'Follow'}
    </button>
  );
}

function UserRow({ user: u }: { user: User }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-ink-850 transition">
      <Link to={`/u/${u.username}`}><Avatar user={u} size={48} /></Link>
      <Link to={`/u/${u.username}`} className="flex-1 min-w-0">
        <div className="font-semibold flex items-center gap-1 truncate">{u.displayName} {u.verified && <BadgeCheck size={14} className="text-brand-300" />}</div>
        <div className="text-xs text-txt-muted truncate">@{u.username} · {formatCount(u.followerCount)} followers</div>
      </Link>
      <FollowBtn user={u} />
    </div>
  );
}

function PostTile({ post }: { post: Post }) {
  const isVideo = post.type === 'short' || post.type === 'video';
  const thumb = post.thumbnailUrl || post.media[0]?.url;
  return (
    <Link to={post.type === 'short' ? '/shorts' : `/p/${post.id}`} state={post.type === 'short' ? { startId: post.id } : undefined}
      className={`relative bg-ink-900 overflow-hidden group rounded-lg ${post.type === 'video' ? 'aspect-video' : 'aspect-square'}`}>
      {thumb ? (
        isVideo && !post.thumbnailUrl ? <video src={thumb} muted playsInline className="w-full h-full object-cover" />
          : <img src={thumb} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" alt="" />
      ) : (
        <div className="w-full h-full grid place-items-center p-3 text-center text-sm text-txt-secondary">{post.text || post.title}</div>
      )}
      {isVideo && <span className="absolute top-2 right-2 text-white drop-shadow"><Play size={16} className="fill-white" /></span>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
        <span className="text-xs text-white font-medium">♥ {formatCount(post.likeCount)}</span>
      </div>
    </Link>
  );
}

function SearchResults({ results, searching, cat }: { results: any; searching: boolean; cat: string }) {
  if (searching && !results) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!results) return null;
  const empty = (!results.users?.length && !results.posts?.length && !results.hashtags?.length);
  if (empty) return <EmptyState icon={SearchX} title="No results" subtitle="We couldn't find anything matching your search." />;

  return (
    <div className="space-y-6 mt-2">
      {results.hashtags?.length > 0 && (cat === 'All') && (
        <section>
          <div className="flex flex-wrap gap-2">
            {results.hashtags.map((h: any) => (
              <Link key={h.tag} to={`/tag/${h.tag}`} className="chip chip-idle flex items-center gap-1"><Hash size={13} />{h.tag} <span className="text-txt-muted">· {formatCount(h.count)}</span></Link>
            ))}
          </div>
        </section>
      )}
      {results.users?.length > 0 && (
        <section>
          {cat === 'All' && <h3 className="font-semibold mb-2 text-txt-secondary text-sm">People</h3>}
          <div className="space-y-1">{results.users.map((u: User) => <UserRow key={u.id} user={u} />)}</div>
        </section>
      )}
      {results.posts?.length > 0 && (
        <section>
          {cat === 'All' && <h3 className="font-semibold mb-2 text-txt-secondary text-sm">Posts</h3>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{results.posts.map((p: Post) => <PostTile key={p.id} post={p} />)}</div>
        </section>
      )}
    </div>
  );
}

function TrendingView({ trending }: { trending: any }) {
  if (!trending) return <div className="flex justify-center py-12"><Spinner /></div>;
  const Section = ({ title, icon: Icon, children }: any) => (
    <section className="mt-6">
      <h3 className="flex items-center gap-2 font-bold mb-3"><Icon size={18} className="text-brand-300" /> {title}</h3>
      {children}
    </section>
  );
  return (
    <div className="animate-fade-in">
      <Section title="Trending hashtags" icon={TrendingUp}>
        <div className="flex flex-wrap gap-2">
          {trending.hashtags.map((h: any, i: number) => (
            <Link key={h.tag} to={`/tag/${h.tag}`} className="card bg-ink-850 hover:bg-ink-800 px-4 py-2.5 transition">
              <div className="text-xs text-txt-muted">#{i + 1} trending</div>
              <div className="font-semibold flex items-center gap-1"><Hash size={14} className="text-brand-300" />{h.tag}</div>
              <div className="text-xs text-txt-muted">{formatCount(h.count)} posts</div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Popular creators" icon={Flame}>
        <div className="space-y-1">{trending.creators.slice(0, 6).map((u: User) => <UserRow key={u.id} user={u} />)}</div>
      </Section>

      {trending.videos?.length > 0 && (
        <Section title="Popular videos" icon={Play}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{trending.videos.slice(0, 6).map((p: Post) => <PostTile key={p.id} post={p} />)}</div>
        </Section>
      )}
      {trending.shorts?.length > 0 && (
        <Section title="Popular shorts" icon={Play}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{trending.shorts.slice(0, 8).map((p: Post) => <PostTile key={p.id} post={p} />)}</div>
        </Section>
      )}
      {trending.snaps?.length > 0 && (
        <Section title="Popular snaps" icon={TrendingUp}>
          <div className="grid grid-cols-3 gap-2">{trending.snaps.slice(0, 9).map((p: Post) => <PostTile key={p.id} post={p} />)}</div>
        </Section>
      )}
    </div>
  );
}
