import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '../types';

export function Carousel({ media, rounded = true }: { media: MediaItem[]; rounded?: boolean }) {
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const n = media.length;
  const go = (d: number) => setI((p) => (p + d + n) % n);

  if (n === 0) return null;

  return (
    <div className={`relative bg-ink-900 ${rounded ? 'rounded-xl' : ''} overflow-hidden select-none group`}>
      <div className="relative w-full" style={{ aspectRatio: '4 / 5', maxHeight: '70vh' }}>
        {!loaded[i] && <div className="absolute inset-0 shimmer bg-ink-800" />}
        <img
          src={media[i].url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded((l) => ({ ...l, [i]: true }))}
          className="w-full h-full object-contain bg-ink-950"
        />
      </div>

      {n > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-ink-950/70 backdrop-blur grid place-items-center opacity-0 group-hover:opacity-100 transition disabled:hidden"
            aria-label="Previous image"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-ink-950/70 backdrop-blur grid place-items-center opacity-0 group-hover:opacity-100 transition"
            aria-label="Next image"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-ink-950/70 backdrop-blur text-xs font-medium">
            {i + 1}/{n}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {media.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`}
                aria-label={`Go to image ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
