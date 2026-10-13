import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings, type Settings } from '../lib/settings';

/** The user's settings; re-renders when they change here, in another tab or on
    another device of the same account (see settingsSync). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
