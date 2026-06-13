import { useState, useEffect, ReactNode } from 'react';

interface ToastItem {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'info';
  icon: string;
  out: boolean;
}

let _toastId = 0;
let _setter: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null;

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  if (!_setter) return;
  const id = ++_toastId;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  setTimeout(() => {
    _setter!((ts) => [...ts, { id, msg, type, icon: icons[type], out: false }]);
    setTimeout(() => {
      _setter!((ts) => ts.map((t) => (t.id === id ? { ...t, out: true } : t)));
      setTimeout(() => _setter!((ts) => ts.filter((t) => t.id !== id)), 260);
    }, 3600);
  }, 0);
}

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
            className={`toast toast-${t.type}${t.out ? ' toast-out' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="toast-icon">{t.icon}</span>
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Schließen">✕</button>
          </div>
        ))}
      </div>
    </>
  );
}
