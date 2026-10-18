import { ASSETS } from './supabase';

export type BgMode = 'image' | 'color';

/** Per-user settings. The source of truth is the user's `user_settings` row in
    Supabase (see settingsSync.ts), so every device of the same account shows
    the same values. localStorage is only the local cache: it gives an instant
    first paint, works offline and is what a second tab (e.g. the one a
    bookmarklet opens) reads before the network answers. */
export interface Settings {
  /** Photo wallpaper URL. */
  wallpaper: string;
  /** Whether the background is a photo wallpaper or a flat solid color. */
  bgMode: BgMode;
  bgColor: string;
  /** Offerte the user explicitly marked as active (nav-bar pill, list toggle
      or the banner in its detail / edit sheet); '' when none. Opening one never
      changes it. Imported parts (bookmarklet / share sheet) go straight into it. */
  activeOfferteId: string;
  iban: string;
  /** Default retail margin (%) applied to imported part purchase prices (EK -> VK). */
  margin: number;
  /** Own signature as PNG data URL (transparent background), stored once and
      placed on every Auftragsbestätigung; '' when none. */
  signature: string;
}

const KEYS: Record<keyof Settings, string> = {
  wallpaper: 'garage_wallpaper',
  bgMode: 'garage_bg_mode',
  bgColor: 'garage_bg_color',
  activeOfferteId: 'garage_active_offerte',
  iban: 'garage_iban',
  margin: 'garage_margin',
  signature: 'garage_signature',
};
const SETTING_NAMES = Object.keys(KEYS) as (keyof Settings)[];

function readLocal(): Settings {
  const margin = parseFloat(localStorage.getItem(KEYS.margin) ?? '');
  return {
    wallpaper: localStorage.getItem(KEYS.wallpaper) || ASSETS.wallpaper,
    // Defaults to 'image' so existing users (who only ever had a wallpaper) see no change.
    bgMode: localStorage.getItem(KEYS.bgMode) === 'color' ? 'color' : 'image',
    bgColor: localStorage.getItem(KEYS.bgColor) || '#1C1C1E',
    activeOfferteId: localStorage.getItem(KEYS.activeOfferteId) ?? '',
    iban: localStorage.getItem(KEYS.iban) ?? '',
    margin: Number.isFinite(margin) ? margin : 30,
    signature: localStorage.getItem(KEYS.signature) ?? '',
  };
}

let state = readLocal();
const listeners = new Set<() => void>();
let localChangeHandler: ((patch: Partial<Settings>) => void) | null = null;

function commit(patch: Partial<Settings>, fromRemote: boolean) {
  const changed: Partial<Settings> = {};
  for (const k of SETTING_NAMES) {
    const v = patch[k];
    if (v === undefined || v === state[k]) continue;
    (changed as Record<string, unknown>)[k] = v;
    if (v === '') localStorage.removeItem(KEYS[k]);
    else localStorage.setItem(KEYS[k], String(v));
  }
  if (!Object.keys(changed).length) return;
  state = { ...state, ...changed };
  listeners.forEach((l) => l());
  if (!fromRemote) localChangeHandler?.(changed);
}

/** Current settings; the same object until something changes (safe for `useSyncExternalStore`). */
export const getSettings = (): Settings => state;
/** Change settings on this device; settingsSync pushes the change to the user's other devices. */
export const updateSettings = (patch: Partial<Settings>): void => commit(patch, false);
/** Adopt values that arrived from the database (never echoed back to it). */
export const applyRemoteSettings = (patch: Partial<Settings>): void => commit(patch, true);
/** Registers the single consumer of local changes (settingsSync). */
export function onLocalSettingsChange(handler: ((patch: Partial<Settings>) => void) | null): void {
  localChangeHandler = handler;
}
/** Drop the cached values (another account signed in on this device). */
export function resetSettings(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  state = readLocal();
  listeners.forEach((l) => l());
}

// Another tab of this browser changed the cache: adopt it. That tab also does the push.
window.addEventListener('storage', (e) => {
  if (e.key !== null && !Object.values(KEYS).includes(e.key)) return;
  state = readLocal();
  listeners.forEach((l) => l());
});

/** For `useSyncExternalStore`; fires on local changes, on changes from another
    tab and on changes synced in from another device. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const getIban = (): string => state.iban;
export const setIban = (iban: string): void => updateSettings({ iban });

export const getActiveOfferteId = (): string => state.activeOfferteId;
/** Pass '' to deselect. */
export const setActiveOfferteId = (id: string): void => updateSettings({ activeOfferteId: id });
export const subscribeActiveOfferteId = subscribeSettings;

export const getMargin = (): number => state.margin;
export const setMargin = (pct: number): void => updateSettings({ margin: pct });

/** Pass '' to remove the stored signature. */
export const setSignature = (dataUrl: string): void => updateSettings({ signature: dataUrl });
