import { useEffect, useRef, useCallback } from 'react';

// Calls `onLoadMore` when the sentinel scrolls into view.
export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean) {
  const sentinel = useRef<HTMLDivElement>(null);
  const cb = useRef(onLoadMore);
  cb.current = onLoadMore;

  useEffect(() => {
    if (!enabled || !sentinel.current) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) cb.current();
    }, { rootMargin: '600px' });
    obs.observe(sentinel.current);
    return () => obs.disconnect();
  }, [enabled]);

  return sentinel;
}

// Lazy "play when visible" observer for media elements.
export function useVisible<T extends HTMLElement>(onChange: (visible: boolean) => void, threshold = 0.6) {
  const ref = useRef<T>(null);
  const cb = useCallback(onChange, [onChange]);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver((entries) => cb(entries[0].isIntersecting && entries[0].intersectionRatio >= threshold), { threshold: [0, threshold, 1] });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [cb, threshold]);
  return ref;
}
