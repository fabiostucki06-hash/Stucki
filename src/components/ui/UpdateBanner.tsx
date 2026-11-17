import { hardReload } from '../../lib/reload';
import { SFRefresh } from '../Icons';

export default function UpdateBanner() {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(76px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px 10px 16px',
        borderRadius: 14,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
        color: '#fff',
        animation: 'fade-in 0.2s ease',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500 }}>Neue Version verfügbar</span>
      <button
        onClick={hardReload}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--accent)',
          border: '1px solid #004fb0',
          color: '#fff', fontSize: 13, fontWeight: 600,
          padding: '6px 12px', borderRadius: 9, cursor: 'pointer',
        }}
      >
        <SFRefresh />
        Neu laden
      </button>
    </div>
  );
}
