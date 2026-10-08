import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, Lock, Settings, Grid3x3, Type, Film, Video, Play, Heart, ImageOff, X } from 'lucide-react';
import { users as usersApi, errMsg } from '../api';
import { Avatar, Spinner, EmptyState, GridSkeleton } from '../components/ui';
import { PostCard } from '../components/PostCard';
import { formatCount } from '../lib/util';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { User, Post } from '../types';

const TABS = [
  { key: 'snap', label: 'Snaps', icon: Grid3x3 },
  { key: 'thought', label: 'Thoughts', icon: Type },
  { key: 'short', label: 'Shorts', icon: Film },
  { key: 'video', label: 'Videos', icon: Video },
];

export function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: me, setUser } = useAuth();
  const { show } = useToast();
  const [profile, setProfile] = useState<User | null>(null);
  const [tab, setTab] = useState('snap');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [listModal, setListModal] = useState<null | 'followers' | 'following'>(null);
  const [notFound, setNotFound] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true); setNotFound(false);
    try { setProfile(await usersApi.get(username!)); }
    catch { setNotFound(true); } finally { setLoading(false); }
  }, [username]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => {
    if (!profile) return;
    setTabLoading(true);
    usersApi.posts(profile.username, tab)
      .then(({ posts, locked }) => { setPosts(posts); setLocked(!!locked); })
      .finally(() => setTabLoading(false));
  }, [profile, tab]);

  const toggleFollow = async () => {
    if (!me) { show('Sign in to follow.', 'info'); return; }
    if (!profile || followBusy) return;
    setFollowBusy(true);
    try {
      const updated = profile.isFollowing ? await usersApi.unfollow(profile.username) : await usersApi.follow(profile.username);
      setProfile(updated);
    } catch (e) { show(errMsg(e), 'error'); } finally { setFollowBusy(false); }
  };

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-10 flex justify-center"><Spinner /></div>;
  if (notFound || !profile) return (
    <div className="max-w-3xl mx-auto px-4">
      <EmptyState icon={ImageOff} title="User not found" subtitle="This account doesn't exist or was removed."
        action={<Link to="/home" className="btn-brand px-5 py-2.5">Back home</Link>} />
    </div>
  );

  const isSelf = me?.id === profile.id;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Cover */}
      <div className="h-28 md:h-40 bg-gradient-to-br from-brand-800/50 via-ink-900 to-accent-pink/20 md:rounded-b-2xl" />

      <div className="px-4">
        <div className="flex items-end justify-between -mt-12 md:-mt-14">
          <div className="rounded-full ring-4 ring-ink-950">
            <Avatar user={profile} size={104} />
          </div>
          <div className="flex gap-2 mb-2">
            {isSelf ? (
              <button onClick={() => navigate('/settings')} className="btn-ghost px-4 py-2 text-sm"><Settings size={16} /> Edit profile</button>
            ) : (
              <button onClick={toggleFollow} disabled={followBusy}
                className={`px-6 py-2 text-sm ${profile.isFollowing ? 'btn-ghost' : profile.followRequested ? 'btn-outline' : 'btn-brand'}`}>
                {followBusy ? <Spinner className="!w-4 !h-4" /> : profile.isFollowing ? 'Following' : profile.followRequested ? 'Requested' : 'Follow'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{profile.displayName}</h1>
            {profile.verified && <BadgeCheck size={20} className="text-brand-300" />}
            {profile.isPrivate && <Lock size={15} className="text-txt-muted" />}
          </div>
          <p className="text-txt-muted">@{profile.username}</p>
          {profile.bio && <p className="mt-3 text-[15px] whitespace-pre-wrap leading-relaxed">{profile.bio}</p>}

          <div className="flex items-center gap-5 mt-4 text-sm">
            <span><b className="text-txt-primary">{formatCount(profile.postCount)}</b> <span className="text-txt-muted">posts</span></span>
            <button onClick={() => setListModal('followers')} className="hover:underline"><b>{formatCount(profile.followerCount)}</b> <span className="text-txt-muted">followers</span></button>
            <button onClick={() => setListModal('following')} className="hover:underline"><b>{formatCount(profile.followingCount)}</b> <span className="text-txt-muted">following</span></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex mt-6 border-b border-line sticky top-0 bg-ink-950/80 backdrop-blur z-10">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold border-b-2 -mb-px transition ${tab === t.key ? 'border-brand text-txt-primary' : 'border-transparent text-txt-muted hover:text-txt-secondary'}`}>
              <t.icon size={17} /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 py-4">
        {tabLoading ? (
          (tab === 'snap' || tab === 'short' || tab === 'video') ? <GridSkeleton /> : <div className="flex justify-center py-8"><Spinner /></div>
        ) : locked ? (
          <EmptyState icon={Lock} title="This account is private" subtitle="Follow this account to see their content." />
        ) : posts.length === 0 ? (
          <EmptyState icon={TABS.find((t) => t.key === tab)!.icon}
            title={isSelf ? `No ${tab}s yet` : "This creator hasn't posted anything yet."}
            subtitle={isSelf ? 'Content you create will show up here.' : undefined} />
        ) : tab === 'thought' ? (
          <div className="space-y-4 max-w-2xl mx-auto">{posts.map((p) => <PostCard key={p.id} post={p} onDelete={(id) => setPosts((l) => l.filter((x) => x.id !== id))} />)}</div>
        ) : (
          <MediaGrid posts={posts} />
        )}
      </div>

      {listModal && <FollowListModal username={profile.username} kind={listModal} onClose={() => setListModal(null)} />}
    </div>
  );
}

function MediaGrid({ posts }: { posts: Post[] }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {posts.map((p) => {
        const isVideo = p.type === 'short' || p.type === 'video';
        const thumb = p.thumbnailUrl || p.media[0]?.url;
        return (
          <Link key={p.id} to={p.type === 'short' ? '/shorts' : `/p/${p.id}`} state={p.type === 'short' ? { startId: p.id } : undefined}
            className="relative aspect-square bg-ink-900 overflow-hidden group rounded-md">
            {thumb ? (
              isVideo && !p.thumbnailUrl
                ? <video src={thumb} muted playsInline className="w-full h-full object-cover" />
                : <img src={thumb} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" alt="" />
            ) : <div className="w-full h-full grid place-items-center text-txt-muted text-xs p-2 text-center">{p.title}</div>}
            {isVideo && <span className="absolute top-2 right-2 text-white drop-shadow"><Play size={16} className="fill-white" /></span>}
            {p.type === 'snap' && p.media.length > 1 && <span className="absolute top-2 right-2 text-white text-xs font-bold drop-shadow">▦</span>}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition grid place-items-center opacity-0 group-hover:opacity-100">
              <span className="flex items-center gap-1.5 text-white font-semibold text-sm"><Heart size={16} className="fill-white" /> {formatCount(p.likeCount)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FollowListModal({ username, kind, onClose }: { username: string; kind: 'followers' | 'following'; onClose: () => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  useEffect(() => {
    (kind === 'followers' ? usersApi.followers(username) : usersApi.following(username)).then(setUsers).catch(() => setUsers([]));
  }, [username, kind]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-sm max-h-[70vh] flex flex-col animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="font-semibold capitalize">{kind}</h3>
          <button onClick={onClose} className="icon-btn w-8 h-8"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-2">
          {!users ? <div className="flex justify-center py-8"><Spinner /></div>
            : users.length === 0 ? <p className="text-center text-txt-muted py-8 text-sm">No {kind} yet.</p>
            : users.map((u) => (
              <Link key={u.id} to={`/u/${u.username}`} onClick={onClose} className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-800 transition">
                <Avatar user={u} size={42} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-1 truncate">{u.displayName} {u.verified && <BadgeCheck size={14} className="text-brand-300" />}</div>
                  <div className="text-xs text-txt-muted truncate">@{u.username}</div>
                </div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
