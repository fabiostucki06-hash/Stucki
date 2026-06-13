import { ASSETS } from '../lib/supabase';
import { SFCloud } from './Icons';
import type { SyncStatus } from '../types';

interface NavBarProps {
  syncStatus: SyncStatus;
  todosCount: number;
  onLogout: () => void;
}

export default function NavBar({ syncStatus, todosCount, onLogout }: NavBarProps) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <div className={cloudClass} title={cloudTitle} style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', borderRadius: 8, cursor: 'default' }}>
            <SFCloud />
          </div>
          {todosCount > 0 && (
            <div style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '2px 8px', fontSize: 13, fontWeight: 600 }}>
              {todosCount}
            </div>
          )}
          <button onClick={onLogout} className="btn-plain" style={{ fontSize: 15 }}>Abmelden</button>
        </div>
      </div>
    </div>
  );
}
