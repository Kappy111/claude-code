import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Home, Compass, Film, Image as ImageIcon, Type, Video, Bell, Mail,
  Plus, User as UserIcon, Search, LogOut, Settings, Bookmark, History,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { notifications as notifApi } from '../api';
import { Avatar } from './ui';
import { CreateModal } from './CreateModal';
import type { PostType } from '../types';

const CreateCtx = createContext<(t?: PostType) => void>(() => {});
export const useCreate = () => useContext(CreateCtx);

const Logo = () => (
  <Link to="/home" className="flex items-center gap-2.5 px-2">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand via-accent-pink to-accent-amber grid place-items-center font-extrabold text-white text-lg shadow-glow">O</div>
    <span className="text-xl font-extrabold tracking-tight hidden xl:block">OmniFeed</span>
  </Link>
);

const DESKTOP_NAV = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/shorts', label: 'Shorts', icon: Film },
  { to: '/photos', label: 'Photos', icon: ImageIcon },
  { to: '/thoughts', label: 'Thoughts', icon: Type },
  { to: '/videos', label: 'Videos', icon: Video },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: true },
  { to: '/messages', label: 'Messages', icon: Mail },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [createType, setCreateType] = useState<PostType | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const openCreate = useCallback((t?: PostType) => { setCreateType(t); setShowCreate(true); }, []);

  const loadUnread = useCallback(() => {
    if (!user) return;
    notifApi.unreadCount().then(setUnread).catch(() => {});
  }, [user]);

  useEffect(() => { loadUnread(); }, [loadUnread, location.pathname]);
  useEffect(() => {
    const id = setInterval(loadUnread, 30000);
    return () => clearInterval(id);
  }, [loadUnread]);

  // Shorts is a full-bleed immersive page
  const immersive = location.pathname.startsWith('/shorts');

  return (
    <CreateCtx.Provider value={openCreate}>
      <div className="min-h-screen md:flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[84px] xl:w-64 border-r border-line bg-ink-900/60 backdrop-blur z-30 px-3 py-5">
          <div className="mb-6"><Logo /></div>
          <nav className="flex-1 space-y-1">
            {DESKTOP_NAV.map((item) => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) => `relative flex items-center gap-4 px-3 py-2.5 rounded-xl font-medium transition-colors ${isActive ? 'bg-ink-800 text-txt-primary' : 'text-txt-secondary hover:bg-ink-850 hover:text-txt-primary'}`}>
                <span className="relative">
                  <item.icon size={24} />
                  {item.badge && unread > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent-pink text-[10px] font-bold grid place-items-center text-white">{unread > 9 ? '9+' : unread}</span>}
                </span>
                <span className="hidden xl:block">{item.label}</span>
              </NavLink>
            ))}
            <button onClick={() => openCreate()}
              className="w-full flex items-center gap-4 px-3 py-2.5 rounded-xl font-semibold text-brand-300 hover:bg-ink-850 transition-colors">
              <Plus size={24} /><span className="hidden xl:block">Create</span>
            </button>
            {user && (
              <NavLink to={`/u/${user.username}`}
                className={({ isActive }) => `flex items-center gap-4 px-3 py-2.5 rounded-xl font-medium transition-colors ${isActive ? 'bg-ink-800 text-txt-primary' : 'text-txt-secondary hover:bg-ink-850 hover:text-txt-primary'}`}>
                <UserIcon size={24} /><span className="hidden xl:block">Profile</span>
              </NavLink>
            )}
          </nav>

          <button onClick={() => openCreate()} className="btn-brand w-full py-3 mt-3 hidden xl:flex"><Plus size={20} /> Create</button>

          {user && (
            <div className="relative mt-3">
              <button onClick={() => setMenuOpen((m) => !m)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-ink-850 transition">
                <Avatar user={user} size={36} />
                <div className="hidden xl:block text-left min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{user.displayName}</div>
                  <div className="text-xs text-txt-muted truncate">@{user.username}</div>
                </div>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute bottom-full mb-2 left-0 w-56 card bg-ink-800 p-1.5 shadow-card z-20 animate-scale-in">
                    <MenuItem icon={UserIcon} label="Profile" onClick={() => { navigate(`/u/${user.username}`); setMenuOpen(false); }} />
                    <MenuItem icon={Bookmark} label="Bookmarks" onClick={() => { navigate('/bookmarks'); setMenuOpen(false); }} />
                    <MenuItem icon={History} label="Watch history" onClick={() => { navigate('/history'); setMenuOpen(false); }} />
                    <MenuItem icon={Settings} label="Settings" onClick={() => { navigate('/settings'); setMenuOpen(false); }} />
                    <div className="h-px bg-line my-1" />
                    <MenuItem icon={LogOut} label="Log out" danger onClick={() => { logout(); navigate('/'); }} />
                  </div>
                </>
              )}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className={`flex-1 md:ml-[84px] xl:ml-64 min-h-screen ${immersive ? '' : 'pb-20 md:pb-8'}`}>
          {children}
        </main>

        {/* Mobile bottom nav */}
        {!immersive && (
          <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-ink-900/90 backdrop-blur border-t border-line px-2 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-around h-16">
              <BottomLink to="/home" icon={Home} label="Home" />
              <BottomLink to="/explore" icon={Compass} label="Explore" />
              <button onClick={() => openCreate()} className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-accent-pink grid place-items-center shadow-glow -mt-1 active:scale-95 transition">
                <Plus size={26} className="text-white" />
              </button>
              <BottomLink to="/notifications" icon={Bell} label="Alerts" badge={unread} />
              <BottomLink to={user ? `/u/${user.username}` : '/'} icon={UserIcon} label="Profile" />
            </div>
          </nav>
        )}
      </div>

      {showCreate && <CreateModal initialType={createType} onClose={() => setShowCreate(false)} onCreated={loadUnread} />}
    </CreateCtx.Provider>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-ink-700 transition ${danger ? 'text-accent-pink' : ''}`}>
      <Icon size={17} /> {label}
    </button>
  );
}

function BottomLink({ to, icon: Icon, label, badge }: { to: string; icon: any; label: string; badge?: number }) {
  return (
    <NavLink to={to} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 w-14 py-1 ${isActive ? 'text-txt-primary' : 'text-txt-muted'}`}>
      <span className="relative">
        <Icon size={23} />
        {badge ? <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-accent-pink text-[9px] font-bold grid place-items-center text-white">{badge > 9 ? '9+' : badge}</span> : null}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  );
}
