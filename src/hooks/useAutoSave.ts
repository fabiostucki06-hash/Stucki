import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutoSave {
  status: AutoSaveStatus;
  /** Saves a pending change right away; resolves false when that save failed. */
  flush: () => Promise<boolean>;
  /** Tries the failed save again. */
  retry: () => void;
}

/** Debounced background save of `value`. `null` means "nothing to save right now"
    (incomplete or blocked) and cancels a pending save. The value the hook starts
    with counts as already stored, unless `unsaved` is set (a new document that
    opens prefilled); a hook that starts with `null` saves its first non-null value.

    Saves never overlap: a change made while one is in flight is saved right
    after it, with the latest value. A change still pending on unmount (sheet
    closed) is saved anyway, so closing never loses input. */
export function useAutoSave<T>(value: T | null, save: (v: T) => Promise<void>, { delay = 800, unsaved = false } = {}): AutoSave {
  const key = value == null ? null : JSON.stringify(value);
  const [status, setStatus] = useState<AutoSaveStatus>('idle');

  const saveRef = useRef(save);
  saveRef.current = save;
  const latest = useRef({ value, key });
  latest.current = { value, key };
  const savedKey = useRef<string | null>(unsaved ? null : key);
  const timer = useRef<number | undefined>(undefined);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const mounted = useRef(true);

  const run = useCallback((): Promise<boolean> => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    // Chained, so a save never overtakes the one still in flight.
    chain.current = chain.current.then(async () => {
      const { value: v, key: k } = latest.current;
      if (v == null || k == null || k === savedKey.current) return true;
      if (mounted.current) setStatus('saving');
      try {
        await saveRef.current(v);
        savedKey.current = k;
        if (mounted.current) setStatus(latest.current.key === k || latest.current.key == null ? 'saved' : 'pending');
        return true;
      } catch (e) {
        console.error('[AutoSave] save failed:', e);
        if (mounted.current) setStatus('error');
        return false;
      }
    });
    return chain.current;
  }, []);

  useEffect(() => {
    if (key == null || key === savedKey.current) {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        timer.current = undefined;
        // Typed back to what's stored: nothing left to save.
        setStatus((s) => (s === 'pending' ? (key == null ? 'idle' : 'saved') : s));
      }
      return;
    }
    setStatus('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void run(); }, delay);
  }, [key, delay, run]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (latest.current.key != null && latest.current.key !== savedKey.current) void run();
      else window.clearTimeout(timer.current);
    };
  }, [run]);

  const retry = useCallback(() => { void run(); }, [run]);

  return { status, flush: run, retry };
}
