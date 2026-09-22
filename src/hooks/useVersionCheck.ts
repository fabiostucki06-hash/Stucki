import { useEffect, useRef, useState } from 'react';

/** Throttle so focus + visibilitychange (which often fire together) don't double-check. */
const CHECK_MIN_GAP_MS = 60_000;
const POLL_INTERVAL_MS = 5 * 60_000;
const INITIAL_DELAY_MS = 15_000;

/** Polls the never-cached /version.json (written at build time, see vite.config.ts)
 *  and flags true once its buildTime no longer matches the build this tab is running. */
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const lastCheckAt = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const now = Date.now();
      if (now - lastCheckAt.current < CHECK_MIN_GAP_MS) return;
      lastCheckAt.current = now;
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && typeof j.buildTime === 'string' && j.buildTime !== __BUILD_TIME__) {
          setUpdateAvailable(true);
        }
      } catch {
        // offline / blocked request — silently retry on the next trigger
      }
    }

    const onWake = () => {
      if (document.visibilityState === 'visible') check();
    };

    const initialTimer = setTimeout(check, INITIAL_DELAY_MS);
    const interval = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, []);

  return updateAvailable;
}
