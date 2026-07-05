const IBAN_KEY = 'garage_iban';

export const getIban = (): string => localStorage.getItem(IBAN_KEY) ?? '';
export const setIban = (iban: string): void => localStorage.setItem(IBAN_KEY, iban);
