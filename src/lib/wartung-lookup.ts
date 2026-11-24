import { faelligAus, kmZahl } from './vehicles';
import { konfigSchluessel, unberuehrt, vorlageVon, type VorlageKey } from './wartung';
import type { ServiceItem, Vehicle } from '../types';

/* ── Interval lookup (api/wartung-lookup) ──
   Researches the manufacturer's intervals for the vehicle's exact
   configuration. The server only marks an interval 'belegt' when a
   manufacturer / technical-data source the web search really returned names
   it; everything else stays the item's Richtwert / Standardwert. */

export interface LookupPosition {
  key: VorlageKey;
  status: 'belegt' | 'unbelegt';
  anwendbar: 'ja' | 'nein' | 'unklar';
  intervallKm?: number;
  intervallMonate?: number;
  quelleTyp: 'hersteller' | 'fachdaten' | 'keine';
  quelleText: string;
  quelleUrl: string;
  hinweis: string;
}
export interface LookupResult { positionen: LookupPosition[]; hinweis: string }

export class LookupError extends Error {
  constructor(message: string, readonly code?: 'not_configured' | 'invalid_key') { super(message); }
}

let konfiguriert: Promise<boolean | null> | undefined;
/** Whether ANTHROPIC_API_KEY is set on the server (asked once); null when the check failed. */
export function lookupKonfiguriert(): Promise<boolean | null> {
  konfiguriert ??= fetch('/api/wartung-lookup')
    .then((r) => r.json() as Promise<{ configured?: boolean }>)
    .then((j) => (typeof j.configured === 'boolean' ? j.configured : null))
    .catch(() => null);
  return konfiguriert;
}

const FELDER = ['marke', 'modell', 'erstzulassung', 'motor', 'motorcode', 'antrieb', 'achsantrieb', 'getriebe', 'steuertrieb', 'km'] as const;

export async function intervalleRecherchieren(v: Vehicle, items: ServiceItem[], token: string): Promise<LookupResult> {
  const fahrzeug = Object.fromEntries(FELDER.filter((k) => v[k]).map((k) => [k, String(v[k])]));
  const positionen = items.flatMap((i) => { const key = vorlageVon(i); return key ? [{ key, name: i.name }] : []; });
  const r = await fetch('/api/wartung-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fahrzeug, positionen }),
  });
  const json = (await r.json().catch(() => null)) as { ok?: boolean; result?: LookupResult; error?: string; code?: string } | null;
  if (!r.ok || !json?.ok || !json.result) {
    const code = json?.code === 'not_configured' || json?.code === 'invalid_key' ? json.code : undefined;
    throw new LookupError(json?.error || `Recherche fehlgeschlagen (${r.status})`, code);
  }
  return json.result;
}

/** What the lookup did, by item name. */
export interface LookupBericht {
  /** Interval taken from a found source. */
  belegt: string[];
  /** A found source says the item doesn't apply: removed (never done / edited). */
  entfernt: string[];
  /** A found source says it doesn't apply, but the item carries records: kept, to check. */
  entfaelltPruefen: string[];
  /** No reliable source: Richtwert / Standardwert stays. */
  offen: string[];
  /** Checked by the workshop or set by hand: not touched. */
  behalten: string[];
}

/** Applies a lookup to the plan. Never touches recorded services, intervals
    set by hand or checked by the workshop; due values set by hand stay, due
    values that followed from the old interval move to the new one. */
export function rechercheAnwenden(items: ServiceItem[], r: LookupResult, v: Vehicle): { items: ServiceItem[]; bericht: LookupBericht } {
  const fuer = konfigSchluessel(v);
  const nach = new Map(r.positionen.map((p) => [p.key, p]));
  const b: LookupBericht = { belegt: [], entfernt: [], entfaelltPruefen: [], offen: [], behalten: [] };
  const out: ServiceItem[] = [];
  for (const i of items) {
    const key = vorlageVon(i);
    const p = key && nach.get(key);
    if (!p) { out.push(i); continue; }
    if (i.intervallManuell || i.quelle === 'geprueft') { b.behalten.push(i.name); out.push(i); continue; }
    if (p.status !== 'belegt') { b.offen.push(i.name); out.push(i); continue; }
    if (p.anwendbar === 'nein') {
      if (unberuehrt(i)) b.entfernt.push(i.name);
      else { b.entfaelltPruefen.push(i.name); out.push(i); }
      continue;
    }
    const n: ServiceItem = {
      ...i, intervallKm: p.intervallKm, intervallMonate: p.intervallMonate, quelle: 'recherchiert',
      quelleText: [p.quelleText || (p.quelleTyp === 'hersteller' ? 'Herstellerangabe' : 'Technische Daten'), p.hinweis].filter(Boolean).join(' · '),
      quelleUrl: p.quelleUrl, rechercheFuer: fuer,
    };
    delete n.geprueftAm;
    const vorher = faelligAus(i, i.letztesDatum, i.letzteKm), nachher = faelligAus(n, i.letztesDatum, i.letzteKm);
    if (i.faelligDatum && i.faelligDatum === vorher.faelligDatum) n.faelligDatum = nachher.faelligDatum;
    if (i.faelligKm && kmZahl(i.faelligKm) === kmZahl(vorher.faelligKm)) n.faelligKm = nachher.faelligKm;
    b.belegt.push(i.name);
    out.push(n);
  }
  return { items: out, bericht: b };
}
