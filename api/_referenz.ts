// Built-in, verified service intervals for common engines (leading underscore:
// not deployed as its own function). Used by api/wartung-lookup before the AI
// provider is asked, so these vehicles work without any Gemini quota.
//
// No guessing: every entry is copied from a named source page and was checked
// against that page's own text (not a summary). Only add entries the same way:
// exact engine code + model range, source URL, interval exactly as published.
// Items the source doesn't list (e.g. timing chain) are left out and go to the
// normal lookup.

export interface ReferenzPosition {
  key: string;
  intervallKm?: number;
  intervallMonate?: number;
  hinweis: string;
}

export interface Referenz {
  /** Lower-case make. */
  marke: string;
  /** Model test on the lower-case model name. */
  modell: RegExp;
  /** Normalised engine codes (A–Z, 0–9). */
  motorcodes: string[];
  /** First and last year of the 1. Inverkehrsetzung the source covers. */
  jahre: [number, number];
  quelleTyp: 'hersteller' | 'fachdaten';
  quelleText: string;
  quelleUrl: string;
  positionen: ReferenzPosition[];
}

export const REFERENZEN: Referenz[] = [
  {
    // Haynes "Audi A5 2007-2017 Maintenance Plans", section "1.8 TFSI Petrol (CABD)",
    // time/distance dependent service (Europe except Ukraine; Canada; Japan; South Korea; New Zealand).
    // Checked 2026-11-24 against the page text: engine oil + oil filter marked at every
    // 15,000 km/12 months column; additional operations as quoted below.
    marke: 'audi',
    modell: /^a5\b/,
    motorcodes: ['CABD'],
    jahre: [2007, 2017],
    quelleTyp: 'fachdaten',
    quelleText: 'Haynes Wartungsplan Audi A5 2007–2017, 1.8 TFSI (CABD)',
    quelleUrl: 'https://uk.haynes.com/pages/maintenance-plans-car-audi-a5-2007-2017',
    positionen: [
      { key: 'oel', intervallKm: 15_000, intervallMonate: 12, hinweis: 'Motoröl und Ölfilter bei jedem Service (15\'000 km / 12 Mt., zeit-/wegabhängiger Service Europa).' },
      { key: 'luftfilter', intervallKm: 90_000, hinweis: '"Renew the air filter every 90,000 km" – kein Zeitintervall angegeben.' },
      { key: 'innenraumfilter', intervallKm: 30_000, intervallMonate: 24, hinweis: '"Renew the dust and pollen filter every 30,000 km/24 months".' },
      { key: 'zuendkerzen', intervallKm: 60_000, intervallMonate: 72, hinweis: '"Renew the spark plugs every 60,000 km/72 months".' },
      { key: 'bremsfluessigkeit', intervallMonate: 24, hinweis: 'Erster Wechsel nach 36 Mt., danach alle 24 Mt.' },
    ],
  },
];

const norm = (s?: string) => (s ?? '').trim().toLowerCase();
/** The reference for this vehicle, if one matches make, model, engine code and year exactly. */
export function referenzFuer(f: { marke?: string; modell?: string; motorcode?: string; erstzulassung?: string }): Referenz | null {
  // "CABD (EA888)" → "CABD": the engine code is the first token of the field.
  const code = (f.motorcode ?? '').match(/[A-Za-z0-9]+/)?.[0]?.toUpperCase() ?? '';
  const jahr = parseInt((f.erstzulassung ?? '').match(/\b(19|20)\d{2}\b/)?.[0] ?? '', 10);
  if (!code) return null;
  return REFERENZEN.find((r) => norm(f.marke) === r.marke && r.modell.test(norm(f.modell)) && r.motorcodes.includes(code)
    && (Number.isNaN(jahr) || (jahr >= r.jahre[0] && jahr <= r.jahre[1]))) ?? null;
}
