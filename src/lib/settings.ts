const IBAN_KEY = 'garage_iban';
const MARGIN_KEY = 'garage_margin';
const BG_MODE_KEY = 'garage_bg_mode';
const BG_COLOR_KEY = 'garage_bg_color';
const ACTIVE_OFFERTE_KEY = 'garage_active_offerte';

export const getIban = (): string => localStorage.getItem(IBAN_KEY) ?? '';
export const setIban = (iban: string): void => localStorage.setItem(IBAN_KEY, iban);

/** Offerte being worked on: the one last opened, edited, created or picked
    in the nav-bar pill. Imported parts (bookmarklet / share sheet)
    go straight into it. Kept in localStorage so the tab a bookmarklet opens
    sees it too. */
export const getActiveOfferteId = (): string => localStorage.getItem(ACTIVE_OFFERTE_KEY) ?? '';
const activeOfferteListeners = new Set<() => void>();
/** Pass '' to deselect. */
export const setActiveOfferteId = (id: string): void => {
  if (id === getActiveOfferteId()) return;
  if (id) localStorage.setItem(ACTIVE_OFFERTE_KEY, id);
  else localStorage.removeItem(ACTIVE_OFFERTE_KEY);
  activeOfferteListeners.forEach((l) => l());
};
/** For `useSyncExternalStore`; also fires when another tab changes it. */
export function subscribeActiveOfferteId(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === ACTIVE_OFFERTE_KEY) listener(); };
  activeOfferteListeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    activeOfferteListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Default retail margin (%) applied to imported part purchase prices (EK -> VK). */
export const getMargin = (): number => {
  const v = parseFloat(localStorage.getItem(MARGIN_KEY) ?? '');
  return Number.isFinite(v) ? v : 30;
};
export const setMargin = (pct: number): void => localStorage.setItem(MARGIN_KEY, String(pct));

export type BgMode = 'image' | 'color';

/** Whether the background is a photo wallpaper or a flat solid color. Defaults to
    'image' so existing users (who only ever had a wallpaper) see no change. */
export const getBgMode = (): BgMode => (localStorage.getItem(BG_MODE_KEY) === 'color' ? 'color' : 'image');
export const setBgMode = (mode: BgMode): void => localStorage.setItem(BG_MODE_KEY, mode);

export const getBgColor = (): string => localStorage.getItem(BG_COLOR_KEY) || '#1C1C1E';
export const setBgColor = (hex: string): void => localStorage.setItem(BG_COLOR_KEY, hex);
