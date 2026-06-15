import { SFPlus } from './Icons';
import type { TabId } from '../types';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  fabOpen: boolean;
  onFabToggle: () => void;
}

export default function TabBar({ fabOpen, onFabToggle }: TabBarProps) {
  return (
    <div className="tab-bar" style={{ justifyContent: 'center' }}>
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
  );
}
