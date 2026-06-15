import { SFHouse, SFWrench, SFPlus } from './Icons';
import type { TabId } from '../types';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  fabOpen: boolean;
  onFabToggle: () => void;
}

const LEFT_TAB  = { id: 'dashboard' as TabId, icon: <SFHouse />,  label: 'Übersicht' };
const RIGHT_TAB = { id: 'auftraege' as TabId, icon: <SFWrench />, label: 'Aufträge'  };

export default function TabBar({ activeTab, onTabChange, fabOpen, onFabToggle }: TabBarProps) {
  const renderTab = (item: typeof LEFT_TAB) => {
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        className="tab-item"
        onClick={() => onTabChange(item.id)}
        style={{ color: active ? 'var(--blue)' : 'var(--label2)' }}
      >
        <div className="tab-icon">{item.icon}</div>
        <span className="tab-label" style={{ fontWeight: active ? 600 : 400 }}>{item.label}</span>
      </button>
    );
  };

  return (
    <div className="tab-bar">
      {renderTab(LEFT_TAB)}

      {/* FAB – centred between the two tabs */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 2 }}>
        <button
          onClick={onFabToggle}
          style={{
            width: 52, height: 52, borderRadius: 26,
            background: 'rgba(0,122,255,0.30)',
            backdropFilter: 'blur(24px) saturate(200%)',
            WebkitBackdropFilter: 'blur(24px) saturate(200%)',
            color: '#fff',
            border: '1px solid rgba(140,200,255,0.40)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.55),inset 0 -1px 2px rgba(0,20,80,0.12),0 6px 20px rgba(0,100,255,0.28)',
            transform: fabOpen ? 'rotate(45deg)' : 'rotate(0)',
            transition: 'transform 0.22s cubic-bezier(.34,1.56,.64,1)',
          }}
          aria-label="Neu erstellen"
        >
          <SFPlus size={22} />
        </button>
      </div>

      {renderTab(RIGHT_TAB)}
    </div>
  );
}
