import { SFHouse, SFWrench, SFDoc, SFPerson, SFChart, SFXmark } from './Icons';
import type { TabId } from '../types';

const SIDEBAR_ITEMS: { id: TabId; icon: React.ReactNode; label: string }[] = [
  { id: 'dashboard',   icon: <SFHouse />,  label: 'Home'      },
  { id: 'auftraege',   icon: <SFWrench />, label: 'Aufträge'  },
  { id: 'offerten',    icon: <SFDoc />,    label: 'Offerten'  },
  { id: 'kunden',      icon: <SFPerson />, label: 'Kunden'    },
  { id: 'statistiken', icon: <SFChart />,  label: 'Statistik' },
];

interface SidebarProps {
  open: boolean;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function Sidebar({ open, activeTab, onTabChange, onClose, onLogout }: SidebarProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          background: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Sidebar Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 272,
          zIndex: 400,
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          borderRight: '1px solid rgba(255,255,255,0.65)',
          boxShadow: open ? '6px 0 40px rgba(0,0,0,0.16), inset -1px 0 0 rgba(255,255,255,0.55)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.30s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Header */}
        <div style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 20, letterSpacing: -0.3, color: 'var(--label)', flex: 1 }}>
            Menü
          </span>
          <button
            onClick={onClose}
            className="bar-btn"
            style={{ color: 'var(--label2)', width: 36, height: 36, minWidth: 36, minHeight: 36, borderRadius: 10, background: 'rgba(120,120,128,0.10)' }}
          >
            <SFXmark />
          </button>
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {SIDEBAR_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onTabChange(item.id); onClose(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: active ? '1px solid rgba(0,122,255,0.18)' : '1px solid transparent',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  background: active
                    ? 'rgba(0,122,255,0.10)'
                    : 'transparent',
                  color: active ? 'var(--blue)' : 'var(--label)',
                  fontWeight: active ? 600 : 400,
                  fontSize: 17,
                  letterSpacing: -0.4,
                  transition: 'all 0.15s ease',
                  boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.70)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: active ? 'rgba(0,122,255,0.14)' : 'rgba(120,120,128,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: active ? 'var(--blue)' : 'var(--label2)',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}>
                  {item.icon}
                </div>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '8px 10px',
          borderTop: '1px solid rgba(0,0,0,0.07)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}>
          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '11px 14px',
              borderRadius: 12,
              border: '1px solid transparent',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              color: 'var(--red)',
              fontWeight: 500,
              fontSize: 16,
              letterSpacing: -0.3,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,59,48,0.07)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            Abmelden
          </button>
        </div>
      </div>
    </>
  );
}
