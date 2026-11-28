/* Currency handling for imported part prices (bookmarklet, share sheet,
   Shortcut, pasted links). Shared by the app and the Vercel functions in api/.

   Strict "no guessing" policy:
   - A price only counts as CHF when the page says so (code, "Fr.", or a
     structured priceCurrency). Nothing unrecognised is ever assumed to be CHF.
   - Foreign prices are converted with the ECB reference rate from the free,
     key-less Frankfurter API. If that lookup fails, no rate is made up: the
     price stays unconfirmed and the UI asks for the CHF price by hand. */

/** ISO 4217 code ("CHF", "EUR", …). */
export type Currency = string;

export interface DetectedPrice {
  /** Amount as "0.00", or '' when no number was found. */
  amount: string;
  /** ISO code, or null when the currency is unknown or ambiguous. */
  currency: Currency | null;
}

export interface FxInfo {
  /** Original amount and currency as read from the shop. */
  amount: string;
  currency: Currency;
  /** CHF per 1 unit of `currency` (ECB reference rate). */
  rate: number;
  /** Rate date (YYYY-MM-DD) as published by the ECB. */
  date: string;
}

export type ChfPrice =
  /** EK in CHF, ready to use. `fx` is set when it was converted. */
  | { status: 'ok'; ek: string; fx?: FxInfo }
  /** A number was found but its currency couldn't be identified. */
  | { status: 'unknown_currency'; amount: string }
  /** Foreign currency recognised, but no exchange rate could be fetched. */
  | { status: 'rate_failed'; amount: string; currency: Currency }
  /** No price at all. */
  | { status: 'none' };

// Symbols and codes read from shop text. A bare "$" counts as USD only when
// no letter sits right before it (C$, A$, AU$, HK$ … are other dollars).
const TOKENS: { cur: Currency; re: RegExp }[] = [
  { cur: 'CHF', re: /\bCHF\b|\bS?Fr\.|\bSFr\b/i },
  { cur: 'EUR', re: /\bEUR\b|€/i },
  { cur: 'GBP', re: /\bGBP\b|£/i },
  { cur: 'USD', re: /\bUSD\b|\bUS\s?\$|(?:^|[^A-Za-z])\$/i },
];

// "29.90", "1'234.50", "1.234,50", "1,234.50", "1 234,50", "45,-", and
// AUTODOC's "CHF 69. 99" (Rappen in a superscript, a space before them)
const AMOUNT_RE = /\d+(?:[.,'’   ]\d{3})*(?:[.,](?:\d{1,2}|[  ]\d{2}(?!\d)))?/g;

function currencyOf(s: string): Currency | null {
  const found = TOKENS.filter((t) => t.re.test(s)).map((t) => t.cur);
  if (found.length !== 1) return null;
  // "AU $", "C $", "NZ$" … are not US dollars.
  if (found[0] === 'USD' && !/\bUSD\b|\bUS\s?\$/i.test(s) && /\b(?:AU?|CA?|NZ|HK|SG?|MX)\s?\$/i.test(s)) return null;
  return found[0];
}

/** "1.234,50" / "1,234.50" / "1'234.5" -> "1234.50"; '' if not a number. */
export function normalizeAmount(raw: string): string {
  const s = raw.replace(/['’\s  ]/g, '');
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  let n: number;
  if (last >= 0 && s.length - last - 1 <= 2) {
    n = parseFloat(`${s.slice(0, last).replace(/[.,]/g, '')}.${s.slice(last + 1)}`);
  } else {
    n = parseFloat(s.replace(/[.,]/g, ''));
  }
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
}

/** Valid-looking ISO code from structured data (JSON-LD priceCurrency, meta tags). */
export function cleanCurrencyCode(v?: string | null): Currency | null {
  const c = v?.trim().toUpperCase();
  return c && /^[A-Z]{3}$/.test(c) ? c : null;
}

/** Reads amount and currency from a price text like "EUR 45,00",
    "29.90 CHF", "US $12.99 (ca. CHF 11.20)". The currency written right next
    to the amount wins; otherwise only a single, unambiguous currency anywhere
    in the text counts. `hint` is a structured code from the page (meta /
    JSON-LD); if it contradicts the text, the currency is treated as unknown. */
export function detectPrice(text?: string | null, hint?: string | null): DetectedPrice {
  const t = (text ?? '').trim();
  const hintCode = cleanCurrencyCode(hint);
  let amount = '';
  let textCur: Currency | null = null;

  for (const m of t.matchAll(AMOUNT_RE)) {
    const a = normalizeAmount(m[0]);
    if (!a) continue;
    const before = t.slice(Math.max(0, m.index! - 6), m.index!);
    const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 6);
    // Only whitespace may separate the amount from its currency.
    // The whole short window before, so "AU $" is still seen as not-USD.
    const adj = (/(?:CHF|EUR|USD|GBP|Fr\.|SFr|[$€£])\s*$/i.test(before) ? currencyOf(before) : null)
      ?? currencyOf(after.match(/^\s*(\S+)/)?.[1] ?? '');
    if (!amount) amount = a;
    if (adj) { amount = a; textCur = adj; break; }
  }
  if (!textCur) textCur = currencyOf(t);

  let currency: Currency | null = textCur ?? hintCode;
  if (textCur && hintCode && textCur !== hintCode) currency = null;
  return { amount, currency };
}

const rateCache = new Map<Currency, { rate: number; date: string }>();

/** CHF per 1 `currency`, ECB reference rate via Frankfurter. Throws on any
    failure — callers must not substitute a rate. */
export async function fetchChfRate(currency: Currency, timeoutMs = 6000): Promise<{ rate: number; date: string }> {
  const cached = rateCache.get(currency);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(currency)}&symbols=CHF`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Frankfurter HTTP ${r.status}`);
    const data = (await r.json()) as { date?: string; rates?: Record<string, number> };
    const rate = data.rates?.CHF;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error('Frankfurter: kein CHF-Kurs');
    const out = { rate, date: data.date ?? '' };
    rateCache.set(currency, out);
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** The EK in CHF for a detected price, converting foreign currencies. Never
    guesses: unknown currency or a failed rate lookup come back flagged. */
export async function resolveChfPrice(p: DetectedPrice): Promise<ChfPrice> {
  if (!p.amount) return { status: 'none' };
  if (!p.currency) return { status: 'unknown_currency', amount: p.amount };
  if (p.currency === 'CHF') return { status: 'ok', ek: p.amount };
  try {
    const { rate, date } = await fetchChfRate(p.currency);
    const chf = Math.round(parseFloat(p.amount) * rate * 100) / 100;
    if (!(chf > 0)) throw new Error('Umrechnung ergab 0');
    return { status: 'ok', ek: chf.toFixed(2), fx: { amount: p.amount, currency: p.currency, rate, date } };
  } catch (e) {
    console.warn('[currency] exchange rate lookup failed:', p.currency, e);
    return { status: 'rate_failed', amount: p.amount, currency: p.currency };
  }
}

const fmtDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

/** Internal note for a converted EK: "EUR 45.00 × 0.9186 (EZB 23.11.2026)". */
export const fxHinweis = (fx: FxInfo): string =>
  `${fx.currency} ${fx.amount} × ${fx.rate} (EZB${fx.date ? ` ${fmtDate(fx.date)}` : ''})`;

/** German warning for a price that needs a manual CHF entry, or null. */
export function preisWarnung(p: ChfPrice): string | null {
  if (p.status === 'unknown_currency') return `Währung nicht erkannt (Betrag ${p.amount}) – bitte CHF-Einkaufspreis prüfen und manuell eintragen.`;
  if (p.status === 'rate_failed') return `Wechselkurs für ${p.currency} nicht abrufbar (Betrag ${p.currency} ${p.amount}) – bitte CHF-Einkaufspreis manuell eintragen.`;
  return null;
}
