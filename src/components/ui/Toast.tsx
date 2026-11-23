import { useState, useEffect, ReactNode } from 'react';
import { SFCheckmark } from '../Icons';

interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
  icon: string;
  out: boolean;
  /** Plays the short "saved" animation on the icon. */
  saved: boolean;
}

let _toastId = 0;
let _setter: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null;

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info', durationMs = 3600, saved = false) {
  if (!_setter) return;
  const id = ++_toastId;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  setTimeout(() => {
    _setter!((ts) => [...ts, { id, msg, type, icon: icons[type], out: false, saved }]);
    setTimeout(() => {
      _setter!((ts) => ts.map((t) => (t.id === id ? { ...t, out: true } : t)));
      setTimeout(() => _setter!((ts) => ts.filter((t) => t.id !== id)), 260);
    }, durationMs);
  }, 0);
}

/** Success toast for a file that safely reached its cloud destination. */
export const showSavedToast = (msg: string) => showToast(msg, 'success', undefined, true);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    _setter = setToasts;
    return () => { _setter = null; };
  }, []);

  function dismiss(id: number) {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 260);
  }

  return (
    <>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}${t.saved ? ' toast-saved' : ''}${t.out ? ' toast-out' : ''}`}
            role="status"
            aria-live="polite"
          >
            {t.saved
              ? <span className="toast-icon toast-saved-icon" aria-hidden="true"><SFCheckmark /></span>
              : <span className="toast-icon">{t.icon}</span>}
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Schließen">✕</button>
          </div>
        ))}
      </div>
    </>
  );
}
