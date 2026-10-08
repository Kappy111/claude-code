import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, RotateCcw } from 'lucide-react';
import { formatDuration } from '../lib/util';
import type { Post } from '../types';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const QUALITIES = ['Auto', '1080p', '720p', '480p'];

export function VideoPlayer({ post, onProgress }: { post: Post; onProgress?: (p: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState('Auto');
  const [menu, setMenu] = useState<null | 'speed' | 'quality'>(null);
  const [showControls, setShowControls] = useState(true);
  const [ended, setEnded] = useState(false);
  const hideTimer = useRef<any>(null);
  const src = post.media[0]?.url;

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play(); setEnded(false); } else v.pause();
  }, []);

  const revealControls = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (!ref.current?.paused) setShowControls(false); }, 2600);
  };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = speed;
  }, [speed]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = ref.current;
    if (!v || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
  };

  const fullscreen = () => {
    const el = ref.current?.parentElement;
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div
      className="relative bg-black rounded-xl overflow-hidden group aspect-video"
      onMouseMove={revealControls}
      onMouseLeave={() => { if (!ref.current?.paused) setShowControls(false); }}
    >
      <video
        ref={ref}
        src={src}
        poster={post.thumbnailUrl || undefined}
        className="w-full h-full object-contain bg-black"
        playsInline
        preload="metadata"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (v.duration) onProgress?.(v.currentTime / v.duration);
        }}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => { setEnded(true); setPlaying(false); }}
      />

      {/* Center play / replay */}
      {(!playing) && (
        <button
          onClick={toggle}
          className="absolute inset-0 grid place-items-center bg-black/20"
          aria-label={ended ? 'Replay' : 'Play'}
        >
          <span className="w-16 h-16 rounded-full bg-black/60 backdrop-blur grid place-items-center">
            {ended ? <RotateCcw size={28} className="text-white" /> : <Play size={30} className="text-white ml-1" />}
          </span>
        </button>
      )}

      {/* Chapter markers */}
      {dur > 0 && post.chapters.length > 0 && (
        <div className={`absolute left-4 bottom-16 flex flex-wrap gap-1.5 transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          {post.chapters.map((c) => (
            <button
              key={c.time}
              onClick={() => { if (ref.current) ref.current.currentTime = c.time; }}
              className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-xs hover:bg-brand/80 transition"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Controls bar */}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-10 px-3 pb-2.5 transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* progress */}
        <div className="relative h-4 flex items-center cursor-pointer mb-1 group/bar" onClick={seek}>
          <div className="absolute inset-x-0 h-1 bg-white/25 rounded-full">
            {post.chapters.map((c) => dur ? (
              <span key={c.time} className="absolute top-0 w-0.5 h-1 bg-white/60" style={{ left: `${(c.time / dur) * 100}%` }} />
            ) : null)}
            <div className="h-full bg-brand rounded-full relative" style={{ width: `${pct}%` }}>
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover/bar:scale-100 transition" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-white">
          <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <div className="flex items-center gap-1.5 group/vol">
            <button onClick={() => { const v = ref.current!; v.muted = !v.muted; setMuted(v.muted); }} aria-label="Mute">
              {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVolume(val); setMuted(val === 0);
                if (ref.current) { ref.current.volume = val; ref.current.muted = val === 0; }
              }}
              className="w-0 group-hover/vol:w-16 transition-all accent-brand cursor-pointer"
              aria-label="Volume"
            />
          </div>
          <span className="text-xs tabular-nums text-white/90">{formatDuration(time)} / {formatDuration(dur)}</span>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setMenu(menu ? null : 'speed')} aria-label="Settings"><Settings size={19} /></button>
              {menu && (
                <div className="absolute bottom-8 right-0 card bg-ink-900/95 backdrop-blur p-1 w-40 shadow-card animate-scale-in">
                  <div className="flex text-xs border-b border-line mb-1">
                    <button className={`flex-1 py-1.5 rounded ${menu === 'speed' ? 'text-brand-300' : 'text-txt-secondary'}`} onClick={() => setMenu('speed')}>Speed</button>
                    <button className={`flex-1 py-1.5 rounded ${menu === 'quality' ? 'text-brand-300' : 'text-txt-secondary'}`} onClick={() => setMenu('quality')}>Quality</button>
                  </div>
                  {menu === 'speed' && SPEEDS.map((s) => (
                    <button key={s} onClick={() => { setSpeed(s); setMenu(null); }}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm hover:bg-ink-700 ${speed === s ? 'text-brand-300 font-semibold' : ''}`}>
                      {s === 1 ? 'Normal' : `${s}×`}
                    </button>
                  ))}
                  {menu === 'quality' && QUALITIES.map((q) => (
                    <button key={q} onClick={() => { setQuality(q); setMenu(null); }}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm hover:bg-ink-700 ${quality === q ? 'text-brand-300 font-semibold' : ''}`}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={fullscreen} aria-label="Fullscreen"><Maximize size={19} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
