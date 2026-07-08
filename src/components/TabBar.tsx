import type { TabId } from '../types';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  fabOpen: boolean;
  onFabToggle: () => void;
}

export default function TabBar(_props: TabBarProps) {
  return <div className="tab-bar" style={{ justifyContent: 'center' }} />;
}
