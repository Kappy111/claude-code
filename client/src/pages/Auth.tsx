import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import { uploadFiles, errMsg, auth as authApi } from '../api';
import { Spinner, Avatar } from '../components/ui';

const FORMATS = [
  { emoji: '📸', label: 'Snaps', desc: 'Photos & carousels' },
  { emoji: '💭', label: 'Thoughts', desc: 'Text posts & threads' },
  { emoji: '🎬', label: 'Shorts', desc: 'Vertical short videos' },
  { emoji: '▶️', label: 'Videos', desc: 'Long-form content' },
];

export function Auth() {
  const { login, signup, oauth } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // fields
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [usernameOk, setUsernameOk] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(identifier.trim(), password);
      } else {
        await signup({ email: email.trim(), password, username: username.trim(), displayName: displayName.trim(), profileImage });
      }
      navigate('/home');
    } catch (err) { show(errMsg(err), 'error'); } finally { setBusy(false); }
  };

  const doOauth = async (provider: 'google' | 'apple') => {
    setBusy(true);
    try {
      // Simulated OAuth identity for the demo
      const rand = Math.floor(Math.random() * 10000);
      await oauth(provider, { email: `${provider}user${rand}@example.com`, displayName: `${provider[0].toUpperCase()}${provider.slice(1)} User` });
      navigate('/home');
    } catch (err) { show(errMsg(err), 'error'); } finally { setBusy(false); }
  };

  const checkUsername = async (v: string) => {
    setUsername(v);
    setUsernameOk(null);
    if (/^[a-zA-Z0-9_]{3,20}$/.test(v)) {
      try { setUsernameOk(await authApi.checkUsername(v)); } catch { /* ignore */ }
    }
  };

  const pickAvatar = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setUploading(true);
    try { const m = await uploadFiles([files[0]]); setProfileImage(m[0].url); }
    catch (err) { show(errMsg(err, 'Upload failed.'), 'error'); } finally { setUploading(false); }
  };

  const useDemo = () => { setMode('login'); setIdentifier('aria'); setPassword('password'); };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-ink-900 via-ink-950 to-brand-900/30 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute bottom-10 -left-10 w-72 h-72 rounded-full bg-accent-pink/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand via-accent-pink to-accent-amber grid place-items-center font-extrabold text-white text-2xl shadow-glow">O</div>
            <span className="text-3xl font-extrabold tracking-tight">OmniFeed</span>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight">One feed.<br /><span className="gradient-text">Every format.</span></h1>
          <p className="text-txt-secondary mt-4 text-lg">Photos, thoughts, shorts and long-form video — all from a single account. Stop switching apps.</p>
          <div className="grid grid-cols-2 gap-3 mt-8">
            {FORMATS.map((f) => (
              <div key={f.label} className="card bg-ink-850/60 p-4">
                <div className="text-2xl mb-1">{f.emoji}</div>
                <div className="font-semibold">{f.label}</div>
                <div className="text-sm text-txt-muted">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-txt-muted text-sm">Discover → Watch/Read → Interact → Follow → Create</p>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 min-h-screen">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand via-accent-pink to-accent-amber grid place-items-center font-extrabold text-white text-lg">O</div>
            <span className="text-2xl font-extrabold">OmniFeed</span>
          </div>

          <h2 className="text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="text-txt-secondary mt-1 mb-6">{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Join OmniFeed in a few seconds.'}</p>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div className="flex items-center gap-4 mb-1">
                <label className="relative cursor-pointer group">
                  <Avatar user={{ profileImage, displayName }} size={64} />
                  <span className="absolute inset-0 rounded-full bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition">
                    {uploading ? <Spinner /> : <Camera size={20} />}
                  </span>
                  <input type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files)} />
                </label>
                <div className="text-sm text-txt-secondary">Add a profile picture<br /><span className="text-txt-muted text-xs">Optional, but recommended</span></div>
              </div>
            )}

            {mode === 'login' ? (
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Username or email" className="input" autoFocus />
            ) : (
              <>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="input" />
                <div>
                  <div className="relative">
                    <input value={username} onChange={(e) => checkUsername(e.target.value)} placeholder="Username" className="input" />
                    {usernameOk !== null && (
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${usernameOk ? 'text-accent-teal' : 'text-accent-pink'}`}>
                        {usernameOk ? 'available' : 'taken'}
                      </span>
                    )}
                  </div>
                </div>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="input" />
              </>
            )}

            <div className="relative">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPw ? 'text' : 'password'} placeholder="Password" className="input pr-11" />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted hover:text-txt-primary">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" disabled={busy} className="btn-brand w-full py-3">
              {busy ? <Spinner className="!border-white/40 !border-t-white" /> : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-line flex-1" />
            <span className="text-xs text-txt-muted">or continue with</span>
            <div className="h-px bg-line flex-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => doOauth('google')} disabled={busy} className="btn-outline py-2.5 gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/></svg>
              Google
            </button>
            <button onClick={() => doOauth('apple')} disabled={busy} className="btn-outline py-2.5 gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.54c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.64ZM14.77 5.6c.64-.78 1.07-1.85.95-2.93-.92.04-2.03.61-2.69 1.38-.59.69-1.11 1.79-.97 2.84 1.02.08 2.07-.52 2.71-1.29Z"/></svg>
              Apple
            </button>
          </div>

          <p className="text-center text-sm text-txt-secondary mt-6">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); }} className="text-brand-300 font-semibold hover:underline">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>

          <button onClick={useDemo} className="w-full mt-4 text-center text-xs text-txt-muted hover:text-txt-secondary transition">
            Try the demo account → aria / password
          </button>
        </div>
      </div>
    </div>
  );
}
