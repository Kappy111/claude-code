import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, LogOut, Lock, Bell, UserCog, ShieldCheck } from 'lucide-react';
import { users as usersApi, uploadFiles, errMsg } from '../api';
import { Avatar, Spinner } from '../components/ui';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';

function Section({ title, icon: Icon, children }: any) {
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold mb-4"><Icon size={18} className="text-brand-300" /> {title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({ label, children }: any) {
  return <label className="block"><span className="text-sm text-txt-secondary mb-1.5 block">{label}</span>{children}</label>;
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`w-11 h-6 rounded-full transition relative shrink-0 ${on ? 'bg-brand' : 'bg-ink-600'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Settings() {
  const { user, setUser, logout } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  if (!user) return null;

  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [username, setUsername] = useState(user.username);
  const [profileImage, setProfileImage] = useState(user.profileImage);
  const [isPrivate, setIsPrivate] = useState(user.isPrivate);
  const [whoCanComment, setWhoCanComment] = useState(user.whoCanComment);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ likes: true, comments: true, follows: true, ...(user.notifyPrefs || {}) });
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickAvatar = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setUploading(true);
    try { const m = await uploadFiles([files[0]]); setProfileImage(m[0].url); }
    catch (e) { show(errMsg(e, 'Upload failed.'), 'error'); } finally { setUploading(false); }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const u = await usersApi.updateProfile({ displayName, bio, profileImage, isPrivate, whoCanComment, notifyPrefs: prefs });
      setUser(u); show('Profile updated', 'success');
    } catch (e) { show(errMsg(e), 'error'); } finally { setSavingProfile(false); }
  };

  const saveUsername = async () => {
    if (username === user.username) return;
    setSavingName(true);
    try { setUser(await usersApi.changeUsername(username)); show('Username changed', 'success'); }
    catch (e) { show(errMsg(e), 'error'); setUsername(user.username); } finally { setSavingName(false); }
  };

  const savePassword = async () => {
    setSavingPw(true);
    try { await usersApi.changePassword(curPw, newPw); setCurPw(''); setNewPw(''); show('Password changed', 'success'); }
    catch (e) { show(errMsg(e), 'error'); } finally { setSavingPw(false); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Section title="Profile" icon={UserCog}>
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer group">
            <Avatar user={{ profileImage, displayName }} size={72} />
            <span className="absolute inset-0 rounded-full bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition">{uploading ? <Spinner /> : <Camera size={20} />}</span>
            <input type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files)} />
          </label>
          <div className="text-sm text-txt-secondary">Tap your avatar to change your profile picture.</div>
        </div>
        <Field label="Display name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" /></Field>
        <Field label="Bio"><textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} rows={3} className="input resize-none" /><span className="text-xs text-txt-muted">{bio.length}/300</span></Field>
        <button onClick={saveProfile} disabled={savingProfile} className="btn-brand px-5 py-2.5">{savingProfile ? <Spinner className="!border-white/40 !border-t-white" /> : 'Save profile'}</button>
      </Section>

      <Section title="Username" icon={UserCog}>
        <Field label="Username">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted">@</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input pl-7" />
            </div>
            <button onClick={saveUsername} disabled={savingName || username === user.username} className="btn-ghost px-5">{savingName ? <Spinner /> : 'Update'}</button>
          </div>
          <span className="text-xs text-txt-muted">Must be unique · 3–20 characters</span>
        </Field>
      </Section>

      <Section title="Privacy" icon={ShieldCheck}>
        <div className="flex items-center justify-between">
          <div><div className="font-medium flex items-center gap-1.5"><Lock size={15} /> Private account</div><div className="text-sm text-txt-muted">New followers must be approved.</div></div>
          <Toggle on={isPrivate} onChange={setIsPrivate} />
        </div>
        <Field label="Who can comment on your posts">
          <div className="flex gap-2">
            {(['everyone', 'following', 'nobody'] as const).map((v) => (
              <button key={v} onClick={() => setWhoCanComment(v)} className={`chip capitalize ${whoCanComment === v ? 'chip-active' : 'chip-idle'}`}>{v}</button>
            ))}
          </div>
        </Field>
        <button onClick={saveProfile} disabled={savingProfile} className="btn-brand px-5 py-2.5">Save privacy</button>
      </Section>

      <Section title="Notifications" icon={Bell}>
        {[['likes', 'Likes on your posts'], ['comments', 'Comments & replies'], ['follows', 'New followers']].map(([key, label]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm">{label}</span>
            <Toggle on={prefs[key] ?? true} onChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))} />
          </div>
        ))}
        <button onClick={saveProfile} disabled={savingProfile} className="btn-ghost px-5 py-2.5">Save preferences</button>
      </Section>

      <Section title="Change password" icon={Lock}>
        <Field label="Current password"><input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} className="input" /></Field>
        <Field label="New password"><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input" /></Field>
        <button onClick={savePassword} disabled={savingPw || !newPw} className="btn-brand px-5 py-2.5">{savingPw ? <Spinner className="!border-white/40 !border-t-white" /> : 'Update password'}</button>
      </Section>

      <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost w-full py-3 !text-accent-pink"><LogOut size={18} /> Log out</button>
    </div>
  );
}
