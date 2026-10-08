import { useState, useRef } from 'react';
import { X, Image as ImageIcon, Video, Type, Film, Plus, Trash2, Link2, ArrowLeft, Upload } from 'lucide-react';
import { uploadFiles, posts as postsApi, errMsg } from '../api';
import { Spinner, Avatar } from './ui';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import type { PostType, MediaItem } from '../types';

const TYPES: { key: PostType; label: string; desc: string; icon: any; color: string }[] = [
  { key: 'thought', label: 'Thought', desc: 'A text post or thread', icon: Type, color: 'text-accent-teal' },
  { key: 'snap', label: 'Snap', desc: 'One or more photos', icon: ImageIcon, color: 'text-accent-pink' },
  { key: 'short', label: 'Short', desc: 'A vertical short video', icon: Film, color: 'text-brand-300' },
  { key: 'video', label: 'Video', desc: 'A long-form video', icon: Video, color: 'text-accent-amber' },
];

function MediaUploader({ accept, multiple, onUploaded, children }: {
  accept: string; multiple?: boolean; onUploaded: (m: MediaItem[]) => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { show } = useToast();
  const [uploading, setUploading] = useState(false);
  const handle = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try { onUploaded(await uploadFiles(Array.from(files))); }
    catch (e) { show(errMsg(e, 'Upload failed. Please try again.'), 'error'); }
    finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <>
      <input ref={ref} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => handle(e.target.files)} />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading} className="w-full">
        {uploading ? <span className="flex items-center justify-center gap-2 text-txt-secondary py-8"><Spinner /> Uploading…</span> : children}
      </button>
    </>
  );
}

export function CreateModal({ initialType, onClose, onCreated }: {
  initialType?: PostType; onClose: () => void; onCreated?: () => void;
}) {
  const { user } = useAuth();
  const { show } = useToast();
  const [type, setType] = useState<PostType | null>(initialType || null);
  const [posting, setPosting] = useState(false);

  // shared fields
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');

  // thought
  const [threadParts, setThreadParts] = useState<string[]>(['']);
  const [linkUrl, setLinkUrl] = useState('');

  // short
  const [audioInfo, setAudioInfo] = useState('');
  const [duration, setDuration] = useState(0);

  // video
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumb, setThumb] = useState<MediaItem | null>(null);
  const [chapters, setChapters] = useState<{ time: number; label: string }[]>([]);
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');

  const parseTags = (s: string) => s.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);

  const reset = () => {
    setMedia([]); setCaption(''); setHashtags(''); setThreadParts(['']); setLinkUrl('');
    setAudioInfo(''); setTitle(''); setDescription(''); setThumb(null); setChapters([]); setTags(''); setDuration(0);
  };

  const submit = async () => {
    if (posting) return;
    setPosting(true);
    try {
      if (type === 'thought') {
        const parts = threadParts.map((t) => t.trim()).filter(Boolean);
        if (parts.length === 0) { show('Write something first.', 'error'); setPosting(false); return; }
        if (parts.length > 1) await postsApi.createThread(parts);
        else await postsApi.create({ type: 'thought', text: parts[0], linkUrl: linkUrl || undefined, media, hashtags: parseTags(hashtags) });
      } else if (type === 'snap') {
        if (!media.length) { show('Add at least one photo.', 'error'); setPosting(false); return; }
        await postsApi.create({ type: 'snap', caption, media, hashtags: parseTags(hashtags) });
      } else if (type === 'short') {
        if (!media.length) { show('Upload a video.', 'error'); setPosting(false); return; }
        await postsApi.create({ type: 'short', caption, media, audioInfo, thumbnailUrl: thumb?.url, duration, hashtags: parseTags(hashtags) });
      } else if (type === 'video') {
        if (!media.length) { show('Upload a video file.', 'error'); setPosting(false); return; }
        if (!title.trim()) { show('Give your video a title.', 'error'); setPosting(false); return; }
        await postsApi.create({ type: 'video', title, description, media, thumbnailUrl: thumb?.url, duration, chapters, tags: parseTags(tags), visibility });
      }
      show('Posted! 🎉', 'success');
      reset();
      onCreated?.();
      onClose();
    } catch (e) { show(errMsg(e), 'error'); } finally { setPosting(false); }
  };

  const count = type === 'thought' ? threadParts[threadParts.length - 1].length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-full md:w-[520px] md:max-h-[88vh] h-[90vh] md:h-auto card rounded-t-2xl md:rounded-2xl flex flex-col animate-slide-up overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line shrink-0">
          {type && <button onClick={() => { setType(null); reset(); }} className="icon-btn w-9 h-9 -ml-1"><ArrowLeft size={20} /></button>}
          <h3 className="font-semibold text-lg flex-1">{type ? `New ${type}` : 'Create'}</h3>
          <button onClick={onClose} className="icon-btn w-9 h-9 -mr-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!type && (
            <div className="grid gap-3">
              {TYPES.map((t) => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className="flex items-center gap-4 card bg-ink-800 hover:bg-ink-700 p-4 text-left transition group">
                  <div className={`w-12 h-12 rounded-xl bg-ink-900 grid place-items-center ${t.color} group-hover:scale-105 transition`}><t.icon size={24} /></div>
                  <div className="flex-1">
                    <div className="font-semibold">{t.label}</div>
                    <div className="text-sm text-txt-secondary">{t.desc}</div>
                  </div>
                  <Plus size={18} className="text-txt-muted" />
                </button>
              ))}
            </div>
          )}

          {type === 'thought' && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <Avatar user={user} size={40} />
                <div className="flex-1 space-y-3">
                  {threadParts.map((part, i) => (
                    <div key={i} className="relative">
                      {i > 0 && <div className="absolute -top-3 left-5 w-px h-3 bg-line" />}
                      <textarea
                        value={part}
                        onChange={(e) => setThreadParts((p) => p.map((x, j) => (j === i ? e.target.value.slice(0, 280) : x)))}
                        placeholder={i === 0 ? "What's on your mind?" : 'Add to thread…'}
                        rows={i === 0 ? 4 : 3}
                        className="input resize-none"
                      />
                      {threadParts.length > 1 && (
                        <button onClick={() => setThreadParts((p) => p.filter((_, j) => j !== i))} className="absolute top-2 right-2 text-txt-muted hover:text-accent-pink"><Trash2 size={15} /></button>
                      )}
                      <div className="flex justify-end mt-1">
                        <CharCounter value={part.length} max={280} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {media.length > 0 && <MediaPreview media={media} onRemove={(idx) => setMedia((m) => m.filter((_, j) => j !== idx))} />}

              <div className="flex items-center gap-2 flex-wrap">
                <MediaUploader accept="image/*" multiple onUploaded={(m) => setMedia((p) => [...p, ...m].slice(0, 4))}>
                  <span className="btn-ghost text-sm px-3 py-2"><ImageIcon size={16} /> Image</span>
                </MediaUploader>
                <button onClick={() => setThreadParts((p) => [...p, ''])} className="btn-ghost text-sm px-3 py-2"><Plus size={16} /> Add to thread</button>
              </div>

              <div className="relative">
                <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Attach a link (optional)" className="input pl-9" />
              </div>
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags (optional)" className="input" />
            </div>
          )}

          {type === 'snap' && (
            <div className="space-y-3">
              {media.length === 0 ? (
                <MediaUploader accept="image/*" multiple onUploaded={(m) => setMedia(m.slice(0, 10))}>
                  <div className="border-2 border-dashed border-ink-600 rounded-xl py-12 grid place-items-center text-txt-secondary hover:border-brand hover:text-txt-primary transition">
                    <Upload size={32} className="mb-2" />
                    <span className="font-medium">Upload photos</span>
                    <span className="text-xs text-txt-muted mt-1">Up to 10 · JPEG, PNG, WebP, GIF</span>
                  </div>
                </MediaUploader>
              ) : (
                <>
                  <MediaPreview media={media} onRemove={(idx) => setMedia((m) => m.filter((_, j) => j !== idx))} carousel />
                  {media.length < 10 && (
                    <MediaUploader accept="image/*" multiple onUploaded={(m) => setMedia((p) => [...p, ...m].slice(0, 10))}>
                      <span className="btn-ghost text-sm px-3 py-2"><Plus size={16} /> Add more</span>
                    </MediaUploader>
                  )}
                </>
              )}
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption…" rows={3} className="input resize-none" />
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags (optional)" className="input" />
            </div>
          )}

          {type === 'short' && (
            <div className="space-y-3">
              {media.length === 0 ? (
                <MediaUploader accept="video/*" onUploaded={(m) => setMedia(m.slice(0, 1))}>
                  <div className="border-2 border-dashed border-ink-600 rounded-xl py-12 grid place-items-center text-txt-secondary hover:border-brand hover:text-txt-primary transition">
                    <Film size={32} className="mb-2" />
                    <span className="font-medium">Upload a vertical video</span>
                    <span className="text-xs text-txt-muted mt-1">MP4 or WebM · up to 100 MB</span>
                  </div>
                </MediaUploader>
              ) : (
                <div className="relative mx-auto rounded-xl overflow-hidden bg-black max-w-[220px]" style={{ aspectRatio: '9/16' }}>
                  <video src={media[0].url} controls playsInline onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} className="w-full h-full object-contain" />
                  <button onClick={() => { setMedia([]); setThumb(null); }} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 grid place-items-center"><Trash2 size={15} /></button>
                </div>
              )}
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" rows={2} className="input resize-none" />
              <input value={audioInfo} onChange={(e) => setAudioInfo(e.target.value)} placeholder="Sound / audio name (e.g. original sound)" className="input" />
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags (optional)" className="input" />
            </div>
          )}

          {type === 'video' && (
            <div className="space-y-3">
              {media.length === 0 ? (
                <MediaUploader accept="video/*" onUploaded={(m) => setMedia(m.slice(0, 1))}>
                  <div className="border-2 border-dashed border-ink-600 rounded-xl py-12 grid place-items-center text-txt-secondary hover:border-brand hover:text-txt-primary transition">
                    <Video size={32} className="mb-2" />
                    <span className="font-medium">Upload a video</span>
                    <span className="text-xs text-txt-muted mt-1">MP4 or WebM · up to 100 MB</span>
                  </div>
                </MediaUploader>
              ) : (
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video src={media[0].url} controls onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} className="w-full h-full object-contain" />
                  <button onClick={() => setMedia([])} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 grid place-items-center"><Trash2 size={15} /></button>
                </div>
              )}

              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input font-medium" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} className="input resize-none" />

              <div>
                <label className="text-sm text-txt-secondary mb-1.5 block">Thumbnail (optional)</label>
                {thumb ? (
                  <div className="relative rounded-lg overflow-hidden aspect-video w-40">
                    <img src={thumb.url} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => setThumb(null)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 grid place-items-center"><X size={13} /></button>
                  </div>
                ) : (
                  <MediaUploader accept="image/*" onUploaded={(m) => setThumb(m[0])}>
                    <span className="btn-ghost text-sm px-3 py-2"><ImageIcon size={16} /> Upload thumbnail</span>
                  </MediaUploader>
                )}
              </div>

              <ChaptersEditor chapters={chapters} onChange={setChapters} />

              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma separated)" className="input" />
              <div className="flex gap-2">
                {(['public', 'private'] as const).map((v) => (
                  <button key={v} onClick={() => setVisibility(v)} className={`chip ${visibility === v ? 'chip-active' : 'chip-idle'} capitalize`}>{v}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {type && (
          <div className="border-t border-line p-3 shrink-0 flex items-center gap-3">
            {type === 'thought' && <CharCounter value={count} max={280} />}
            <button onClick={submit} disabled={posting} className="btn-brand px-6 py-2.5 ml-auto">
              {posting ? <Spinner className="!border-white/40 !border-t-white" /> : type === 'video' ? 'Publish' : 'Post'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CharCounter({ value, max }: { value: number; max: number }) {
  const left = max - value;
  const color = left < 0 ? 'text-accent-pink' : left < 20 ? 'text-accent-amber' : 'text-txt-muted';
  return <span className={`text-xs tabular-nums font-medium ${color}`}>{left}</span>;
}

function MediaPreview({ media, onRemove, carousel }: { media: MediaItem[]; onRemove: (i: number) => void; carousel?: boolean }) {
  return (
    <div className={carousel ? 'flex gap-2 overflow-x-auto no-scrollbar pb-1' : 'grid grid-cols-2 gap-2'}>
      {media.map((m, i) => (
        <div key={i} className={`relative rounded-lg overflow-hidden bg-ink-900 ${carousel ? 'w-28 h-28 shrink-0' : 'aspect-square'}`}>
          <img src={m.url} className="w-full h-full object-cover" alt="" />
          <button onClick={() => onRemove(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 grid place-items-center"><X size={13} /></button>
          {carousel && <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-px rounded bg-black/60">{i + 1}</span>}
        </div>
      ))}
    </div>
  );
}

function ChaptersEditor({ chapters, onChange }: { chapters: { time: number; label: string }[]; onChange: (c: any[]) => void }) {
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('');
  const add = () => {
    const t = Number(time);
    if (!label.trim() || isNaN(t)) return;
    onChange([...chapters, { time: t, label: label.trim() }].sort((a, b) => a.time - b.time));
    setTime(''); setLabel('');
  };
  return (
    <div>
      <label className="text-sm text-txt-secondary mb-1.5 block">Chapters (optional)</label>
      {chapters.length > 0 && (
        <div className="space-y-1 mb-2">
          {chapters.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm bg-ink-800 rounded-lg px-3 py-1.5">
              <span className="tabular-nums text-txt-muted">{Math.floor(c.time / 60)}:{String(c.time % 60).padStart(2, '0')}</span>
              <span className="flex-1">{c.label}</span>
              <button onClick={() => onChange(chapters.filter((_, j) => j !== i))} className="text-txt-muted hover:text-accent-pink"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="Sec" type="number" className="input w-20" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Chapter title" className="input flex-1" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button onClick={add} className="btn-ghost px-3"><Plus size={16} /></button>
      </div>
    </div>
  );
}
