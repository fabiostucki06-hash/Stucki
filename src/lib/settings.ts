const IBAN_KEY = 'garage_iban';
const MARGIN_KEY = 'garage_margin';

export const getIban = (): string => localStorage.getItem(IBAN_KEY) ?? '';
export const setIban = (iban: string): void => localStorage.setItem(IBAN_KEY, iban);

/** Default retail margin (%) applied to imported part purchase prices (EK -> VK). */
export const getMargin = (): number => {
  const v = parseFloat(localStorage.getItem(MARGIN_KEY) ?? '');
  return Number.isFinite(v) ? v : 30;
};
export const setMargin = (pct: number): void => localStorage.setItem(MARGIN_KEY, String(pct));
