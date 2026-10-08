import { Link } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import type { User } from '../types';

export function Avatar({ user, size = 40, ring = false }: { user?: Partial<User> | null; size?: number; ring?: boolean }) {
  const initial = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  return (
    <div
      className={`relative shrink-0 rounded-full overflow-hidden bg-ink-700 grid place-items-center ${ring ? 'ring-2 ring-brand ring-offset-2 ring-offset-ink-950' : ''}`}
      style={{ width: size, height: size }}
    >
      {user?.profileImage ? (
        <img src={user.profileImage} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <span className="font-semibold text-txt-secondary" style={{ fontSize: size * 0.4 }}>{initial}</span>
      )}
    </div>
  );
}

export function UserName({ user, className = '', showAt = false }: { user: User; className?: string; showAt?: boolean }) {
  return (
    <Link to={`/u/${user.username}`} className={`inline-flex items-center gap-1 hover:underline ${className}`}>
      <span className="font-semibold truncate">{showAt ? `@${user.username}` : user.displayName}</span>
      {user.verified && <BadgeCheck size={15} className="text-brand-300 shrink-0" />}
    </Link>
  );
}

export function EmptyState({ icon: Icon, title, subtitle, action }: {
  icon: any; title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-ink-800 border border-line grid place-items-center mb-4">
        <Icon size={28} className="text-txt-muted" />
      </div>
      <h3 className="text-lg font-semibold text-txt-primary">{title}</h3>
      {subtitle && <p className="text-txt-secondary mt-1 max-w-xs">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-block w-5 h-5 border-2 border-ink-600 border-t-brand rounded-full animate-spin ${className}`} />
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-ink-800 rounded-lg shimmer ${className}`} />;
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-4">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-11 h-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-4" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}
    </div>
  );
}
