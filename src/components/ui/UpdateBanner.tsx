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
        background: 'rgba(28,32,50,0.86)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20), 0 8px 24px rgba(0,0,0,0.30)',
        color: '#fff',
        animation: 'fade-in 0.2s ease',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500 }}>Neue Version verfügbar</span>
      <button
        onClick={hardReload}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'linear-gradient(to bottom, #54a4ff 0%, #007aff 50%, #0056b3 100%)',
          boxShadow: 'inset 0 1px 0px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.2), 0 4px 6px rgba(0,0,0,0.15)',
          border: '1px solid #004fb0',
          textShadow: '0 -1px 0 rgba(0,0,0,0.3)',
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
