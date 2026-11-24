import { SFHouse, SFWrench, SFDoc, SFBox, SFDocCheck, SFReceipt, SFReceiptHalf, SFReceiptCheck, SFPerson, SFChart, SFXmark, SFGear } from './Icons';
import type { TabId } from '../types';
import { BUILD_LABEL } from '../lib/buildInfo';

/** `tile` is kept for markup stability; tiles render neutral (see .icon-tile in globals.css). */
const SIDEBAR_ITEMS: { id: TabId; icon: React.ReactNode; label: string; tile: string }[] = [
  { id: 'dashboard',              icon: <SFHouse />,        label: 'Home',                  tile: 'blue'   },
  { id: 'auftraege',              icon: <SFWrench />,       label: 'Aufträge',              tile: 'orange' },
  { id: 'offerten',               icon: <SFDoc />,          label: 'Offerten',              tile: 'indigo' },
  { id: 'materialofferten',       icon: <SFBox />,          label: 'Materialofferten',      tile: 'brown'  },
  { id: 'auftragsbestaetigungen', icon: <SFDocCheck />,     label: 'Auftragsbestätigungen', tile: 'green'  },
  { id: 'rechnungen',             icon: <SFReceipt />,      label: 'Rechnungen',            tile: 'purple' },
  { id: 'anzahlungsrechnungen',   icon: <SFReceiptHalf />,  label: 'Anzahlungsrechnungen',  tile: 'pink'   },
  { id: 'schlussrechnungen',      icon: <SFReceiptCheck />, label: 'Schlussrechnungen',     tile: 'mint'   },
  { id: 'kunden',                 icon: <SFPerson />,       label: 'Kunden',                tile: 'teal'   },
  { id: 'statistiken',            icon: <SFChart />,        label: 'Statistik',             tile: 'red'    },
  { id: 'einstellungen',          icon: <SFGear />,         label: 'Einstellungen',         tile: 'gray'   },
];

interface SidebarProps {
  open: boolean;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onClose: () => void;
  onLogout: () => void;
  /** Desktop: permanently visible next to the content, no backdrop or close button. */
  docked?: boolean;
}

export default function Sidebar({ open: openProp, activeTab, onTabChange, onClose, onLogout, docked }: SidebarProps) {
  const open = docked || openProp;
  return (
    <>
      {!docked && <div className={`sb-backdrop${open ? ' open' : ''}`} onClick={onClose} />}

      <div className={`sb no-print${docked ? ' sb-docked sidebar-docked' : ''}${open ? ' open' : ''}`}>
        {/* Header (overlay only; the docked sidebar sits under the nav bar) */}
        {!docked && (
          <div className="sb-head">
            <span className="sb-title">Menü</span>
            <button onClick={onClose} className="bar-btn" aria-label="Menü schliessen" style={{ color: 'var(--label2)' }}>
              <SFXmark />
            </button>
          </div>
        )}

        <nav className="sb-nav">
          {SIDEBAR_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                className={`sidebar-item sb-item${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => { onTabChange(item.id); onClose(); }}
              >
                <span className={`sb-icon icon-tile tile-${item.tile}`}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sb-foot">
          <button onClick={onLogout} className="sb-item sb-logout">Abmelden</button>
          <div className="sb-build" title={__BUILD_TIME__}>{BUILD_LABEL}</div>
        </div>
      </div>
    </>
  );
}
