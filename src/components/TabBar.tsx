import type { TabId } from '../types';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  fabOpen: boolean;
  onFabToggle: () => void;
}

/* Navigation lives in the sidebar (hamburger on phones). The bottom bar used to
   be an empty glass strip; it no longer takes screen space. */
export default function TabBar(_props: TabBarProps) {
  return null;
}
