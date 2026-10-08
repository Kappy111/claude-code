import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Heart, MessageCircle, UserPlus, Repeat2, CornerDownRight, Check, X } from 'lucide-react';
import { notifications as notifApi, users as usersApi } from '../api';
import { Avatar, Spinner, EmptyState } from '../components/ui';
import { timeAgo } from '../lib/util';
import type { NotificationGroup, User } from '../types';

const ICONS: Record<string, any> = { like: Heart, comment: MessageCircle, reply: CornerDownRight, follow: UserPlus, follow_request: UserPlus, repost: Repeat2 };
const COLORS: Record<string, string> = { like: 'text-accent-pink', comment: 'text-brand-300', reply: 'text-brand-300', follow: 'text-accent-teal', follow_request: 'text-accent-amber', repost: 'text-accent-teal' };

function actionText(g: NotificationGroup): string {
  const n = g.actors.length;
  const others = n > 1 ? ` and ${n - 1} other${n > 2 ? 's' : ''}` : '';
  const who = g.actors[0].displayName + others;
  switch (g.type) {
    case 'like': return `${who} liked your post`;
    case 'comment': return `${who} commented on your post`;
    case 'reply': return `${who} replied to you`;
    case 'follow': return `${who} started following you`;
    case 'repost': return `${who} reposted your Thought`;
    default: return `${who} interacted with your content`;
  }
}

export function Notifications() {
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [requests, setRequests] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([notifApi.list(), notifApi.followRequests()])
      .then(([n, r]) => { setGroups(n.notifications); setRequests(r); })
      .finally(() => { setLoading(false); notifApi.markRead().catch(() => {}); });
  }, []);

  const resolve = async (u: User, action: 'accept' | 'reject') => {
    await usersApi.resolveRequest(u.id, action);
    setRequests((r) => r.filter((x) => x.id !== u.id));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-4">Notifications</h1>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : groups.length === 0 && requests.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" subtitle="New likes, comments and follows will appear here." />
      ) : (
        <div className="space-y-4">
          {requests.length > 0 && (
            <section className="card p-3">
              <h3 className="text-sm font-semibold text-txt-secondary px-1 mb-2">Follow requests</h3>
              <div className="space-y-1">
                {requests.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-1.5">
                    <Link to={`/u/${u.username}`}><Avatar user={u} size={42} /></Link>
                    <Link to={`/u/${u.username}`} className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{u.displayName}</div>
                      <div className="text-xs text-txt-muted truncate">@{u.username}</div>
                    </Link>
                    <button onClick={() => resolve(u, 'accept')} className="btn-brand w-9 h-9 !p-0"><Check size={17} /></button>
                    <button onClick={() => resolve(u, 'reject')} className="btn-ghost w-9 h-9 !p-0"><X size={17} /></button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="space-y-1">
            {groups.map((g) => {
              const Icon = ICONS[g.type] || Bell;
              const inner = (
                <div className={`flex items-center gap-3 p-3 rounded-xl transition hover:bg-ink-850 ${g.read ? '' : 'bg-brand/5'}`}>
                  <div className="relative shrink-0">
                    <Avatar user={g.actors[0]} size={46} />
                    <span className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-ink-800 border-2 border-ink-950 grid place-items-center ${COLORS[g.type]}`}>
                      <Icon size={13} className={g.type === 'like' ? 'fill-current' : ''} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug"><b>{g.actors[0].displayName}</b>{actionText(g).replace(g.actors[0].displayName, '')}</p>
                    <span className="text-xs text-txt-muted">{timeAgo(g.createdAt)}</span>
                  </div>
                  {g.post && (g.post.thumbnailUrl || g.post.media[0]) && (
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-ink-900 shrink-0">
                      <img src={g.post.thumbnailUrl || g.post.media[0]?.url} className="w-full h-full object-cover" alt="" />
                    </div>
                  )}
                </div>
              );
              return g.type === 'follow'
                ? <Link key={g.id} to={`/u/${g.actors[0].username}`}>{inner}</Link>
                : g.post ? <Link key={g.id} to={g.post.type === 'short' ? '/shorts' : `/p/${g.postId}`} state={g.post.type === 'short' ? { startId: g.postId } : undefined}>{inner}</Link>
                : <div key={g.id}>{inner}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
