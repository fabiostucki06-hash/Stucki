import { ASSETS } from '../lib/supabase';
import { SFCloud, SFMenu } from './Icons';
import type { SyncStatus } from '../types';

interface NavBarProps {
  syncStatus: SyncStatus;
  todosCount: number;
  onMenuToggle: () => void;
  onLogoClick: () => void;
}

export default function NavBar({ syncStatus, todosCount, onMenuToggle, onLogoClick }: NavBarProps) {
  const cloudClass = [
    'cloud-idle',
    syncStatus === 'saving' && 'cloud-saving',
    syncStatus === 'ok' && 'cloud-ok',
    syncStatus === 'error' && 'cloud-error',
  ].filter(Boolean).join(' ');

  const cloudTitle = syncStatus === 'saving' ? 'Synchronisiert mit Cloud…'
    : syncStatus === 'ok' ? 'Gespeichert ✓'
    : syncStatus === 'error' ? 'Sync-Fehler'
    : 'Cloud-Sync';

  return (
    <div className="nav-bar">
      <div className="nav-bar-inner">
        {/* Hamburger */}
        <button
          onClick={onMenuToggle}
          className="bar-btn"
          style={{ color: 'var(--label)', marginRight: 8 }}
          aria-label="Menü öffnen"
        >
          <SFMenu />
        </button>

        {/* Logo */}
        <button onClick={onLogoClick} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <img
            src={ASSETS.logo}
            alt="Werkstatt"
            className="werkstatt-logo"
            style={{ maxHeight: 48, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.18))' }}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = '/icon_image.jpg'; }
            }}
          />
        </button>

        {/* Right side: sync indicator + todo badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <div className={cloudClass} title={cloudTitle} style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', borderRadius: 8, cursor: 'default' }}>
            <SFCloud />
          </div>
          {todosCount > 0 && (
            <div style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 13, fontWeight: 600 }}>
              {todosCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
