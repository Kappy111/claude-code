import { useEffect, useRef } from 'react';
import { system } from '../api';
import { useToast } from '../store/toast';

// Polls the server's deployed build id. When it changes (a new deploy went out),
// every open browser shows a brief notice and reloads onto the latest version.
export function VersionWatcher() {
  const { show } = useToast();
  const baseline = useRef<string | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const v = await system.version();
        if (!active) return;
        if (baseline.current == null) { baseline.current = v; return; }
        if (v !== baseline.current && !reloading.current) {
          reloading.current = true;
          show('A new version is available — updating…', 'info');
          setTimeout(() => window.location.reload(), 2500);
        }
      } catch {
        /* server waking or offline — just try again on the next tick */
      }
    };

    check();
    const id = setInterval(check, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [show]);

  return null;
}
