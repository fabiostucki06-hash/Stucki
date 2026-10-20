import type { MaterialPosition } from '../types';
import { getMargin } from './settings';

/* Margin on material positions: `ek` (purchase price) + `marge` (%) give the
   Stückpreis (VK) the customer sees. EK and Marge are internal and never
   printed; documents only carry the resulting VK. */

const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

/** VK per piece from EK and margin %, rounded to Rappen, as "0.00". */
export function vkAusEk(ek: number, marge: number): string {
  // toPrecision strips float noise first (10 × 1.15 = 11.4999…).
  const rappen = parseFloat((ek * (1 + marge / 100) * 100).toPrecision(12));
  return (Math.round(rappen) / 100).toFixed(2);
}

/** Margin % implied by EK and VK, to one decimal ("15", "-4.2"). */
export const margeAusPreisen = (ek: number, vk: number): string =>
  String(Math.round((vk / ek - 1) * 1000) / 10);

/** The position's own margin, else the default from the settings. */
export const margeVon = (p: Pick<MaterialPosition, 'marge'>): number =>
  p.marge?.trim() ? fN(p.marge) : getMargin();

/** Sets one field of a material position and keeps EK, Marge and VK in step:
    a new EK or Marge recalculates the VK (an EK without own Marge takes the
    default), a VK typed by hand recalculates the Marge. `preis` is left to
    the caller. */
export function setMaterialFeld<P extends MaterialPosition>(p: P, key: string, value: string): P {
  const n = { ...p, [key]: value };
  const ek = fN(n.ek);
  if ((key === 'ek' || key === 'marge') && ek > 0) {
    if (key === 'ek' && !n.marge?.trim()) n.marge = String(getMargin());
    n.stueckpreis = vkAusEk(ek, margeVon(n));
  } else if (key === 'stueckpreis' && ek > 0 && fN(value) > 0) {
    n.marge = margeAusPreisen(ek, fN(value));
  }
  return n;
}
