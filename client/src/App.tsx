import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './store/auth';
import { ToastProvider } from './store/toast';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { Auth } from './pages/Auth';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { Shorts } from './pages/Shorts';
import { Profile } from './pages/Profile';
import { PostView } from './pages/PostView';
import { Notifications } from './pages/Notifications';
import { Settings } from './pages/Settings';
import { Videos } from './pages/Videos';
import { Photos, Thoughts } from './pages/FormatFeed';
import { Bookmarks, WatchHistory, Hashtag } from './pages/misc';
import { Messages } from './pages/Messages';
import { Contact } from './pages/Contact';
import { VersionWatcher } from './components/VersionWatcher';

function Loading() {
  return <div className="min-h-screen grid place-items-center"><Spinner className="!w-8 !h-8" /></div>;
}

// Routes that need auth; redirects to the landing page otherwise.
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return <Layout>{children}</Layout>;
}

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/home" replace />;
  return <Auth />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/home" element={<Protected><Home /></Protected>} />
      <Route path="/explore" element={<Protected><Explore /></Protected>} />
      <Route path="/shorts" element={<Protected><Shorts /></Protected>} />
      <Route path="/photos" element={<Protected><Photos /></Protected>} />
      <Route path="/thoughts" element={<Protected><Thoughts /></Protected>} />
      <Route path="/videos" element={<Protected><Videos /></Protected>} />
      <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
      <Route path="/messages" element={<Protected><Messages /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/contact" element={<Protected><Contact /></Protected>} />
      <Route path="/bookmarks" element={<Protected><Bookmarks /></Protected>} />
      <Route path="/history" element={<Protected><WatchHistory /></Protected>} />
      <Route path="/u/:username" element={<Protected><Profile /></Protected>} />
      <Route path="/p/:id" element={<Protected><PostView /></Protected>} />
      <Route path="/tag/:tag" element={<Protected><Hashtag /></Protected>} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <VersionWatcher />
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
