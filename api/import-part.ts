// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Parses a shared URL or plain-text payload (e.g. forwarded from the Autodoc iPhone
// app via an iOS Shortcut, see Settings -> Teile-Import) into part metadata, so the
// mobile import view can prefill title / purchase price / article number.

import { runShortcutImport } from './import-shortcut.js';
import { partNameFromUrl } from '../src/lib/partTitle.js';
import { detectPrice, cleanCurrencyCode, resolveChfPrice, fxHinweis, preisWarnung, type FxInfo } from '../src/lib/currency.js';

export interface ImportRequestBody {
  url?: string;
  text?: string;
  /** Already read on the device (bookmarklet, or a Shortcut running JavaScript
      on the Safari page): used as-is, and the shop isn't fetched when title and
      price are both present. Shops behind a bot challenge (auto-doc.ch) can't
      be read server-side at all. */
  title?: string;
  price?: string;
  /** ISO code read from the page's structured data (bookmarklet), if any. */
  currency?: string;
  artnr?: string;
}

export interface ImportResult {
  ok: boolean;
  title: string;
  /** Purchase price in CHF — converted when the shop priced in another
      currency, '' when the price couldn't be confirmed (see preisStatus). */
  ek: string;
  /** Set when `ek` was converted from a foreign currency. */
  fx?: FxInfo;
  /** Internal note on the conversion ("EUR 45.00 × 0.9186 (EZB …)"). */
  ekHinweis?: string;
  /** A price was found but not confirmed in CHF: unknown currency or no
      exchange rate. `ek` is then empty and `preisWarnung` says why. */
  preisStatus?: 'unknown_currency' | 'rate_failed';
  preisWarnung?: string;
  artikelnummer: string;
  quelle: string;
  /** Shop responded but looks bot-blocked (403/429/503 or a challenge page) —
      distinct from "nothing matched", so the UI can say something more useful. */
  blocked?: boolean;
  error?: string;
}

export interface VercelLikeRequest {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

export interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  json(body: unknown): void;
}

const URL_RE = /https?:\/\/[^\s"'<>]+/i;
// Some share-sheet strings drop the scheme entirely ("autodoc.ch/de/part/123" or
// "www.autodoc.ch/..."); still recognizable as a link by the domain.tld/path shape.
const BARE_DOMAIN_RE = /\b((?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}\/[^\s"'<>]*)/i;

function extractLink(text: string): string | undefined {
  return text.match(URL_RE)?.[0] ?? text.match(BARE_DOMAIN_RE)?.[1];
}

// Currency before the amount ("CHF 29.90", "€12,50", "US $9.99") OR after it
// ("29.90 CHF", "12,50 €") — Autodoc's site and its app's share text use
// different orders. Which currency it was is read by detectPrice().
const CUR = String.raw`(?:CHF|EUR|USD|GBP|US\s?\$|€|£|\$|Fr\.?)`;
const PRICE_RE = new RegExp(String.raw`(?:${CUR}\s?(\d{1,3}(?:[.,'\s]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,'\s]\d{3})*[.,]\d{2})\s?${CUR})`, 'i');
const ARTNR_RE = /(?:Art(?:ikel)?\.?-?Nr\.?|Artikelnummer|OE[\s-]?Nr\.?|OEM|SKU|MPN)[:\s#]*([A-Za-z0-9\-/]{3,})/i;
// Common share-sheet lead-ins ("Schau dir diesen Artikel an:", "Check this out:",
// "Guarda questo:"…) are noise, not part of the product title.
const WRAPPER_RE = /^(schau\s*(dir)?[^:]*an|sieh\s*dir[^:]*an|check\s*(this|it)\s*out|look\s*at\s*this|guarda\s*questo)[:\s-]+/i;

/** Undoes accidental double-encoding from some iOS Shortcuts "URL öffnen" actions
    (which can re-encode a value that's already URL-encoded), up to a small cap
    so a malformed "%" sequence can't throw or loop forever. */
function decodeMaybeDouble(v: string): string {
  let out = v;
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(out); i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}
const BLOCK_SIGNATURE_RE = /attention required|access denied|just a moment|captcha|are you a human|cloudflare|request blocked|bot detection/i;

/** Amount plus currency (null = not identified) as read from one source. */
interface RawPrice { amount: string; cur: string | null }

/** Internal parse result: the price keeps its currency until extractPart()
    turns it into a CHF EK at the very end. */
type Partial2 = Partial<Omit<ImportResult, 'ek'>> & { price?: RawPrice };

/** A PRICE_RE match (amount with its currency next to it). */
function priceFromMatch(m: RegExpMatchArray | null, hint?: string | null): RawPrice | undefined {
  if (!m) return undefined;
  const d = detectPrice(m[0], hint);
  return d.amount ? { amount: d.amount, cur: d.currency } : undefined;
}

/** An amount whose text may lack a currency, plus a structured hint. */
function priceFromValue(v: string, hint?: string | null): RawPrice | undefined {
  const d = detectPrice(v, hint);
  return d.amount ? { amount: d.amount, cur: d.currency } : undefined;
}

/** Best-effort: not every absolute-looking link the Autodoc app shares has a
    scheme (some share-sheet strings drop it), and stray trailing punctuation
    from the surrounding sentence often rides along. */
function sanitizeUrl(raw: string): string {
  let u = raw.trim().replace(/[)\].,;!?'"]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function extractFromJsonLd(html: string): { title?: string; price?: string; currency?: string } {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const jsonText = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(jsonText);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const candidates = node['@graph'] ? node['@graph'] : [node];
        for (const c of candidates) {
          const offers = Array.isArray(c?.offers) ? c.offers[0] : c?.offers;
          const price = offers?.price ?? offers?.priceSpecification?.price ?? offers?.lowPrice ?? c?.lowPrice;
          const currency = offers?.priceCurrency ?? offers?.priceSpecification?.priceCurrency ?? c?.priceCurrency;
          if (c?.name || price != null) {
            return { title: c?.name, price: price != null ? String(price) : undefined, currency: typeof currency === 'string' ? currency : undefined };
          }
        }
      }
    } catch {
      // not valid JSON-LD, skip
    }
  }
  return {};
}

function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1].trim();
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return h1[1].replace(/\s+/g, ' ').trim();
  const t = html.match(/<title>([^<]+)<\/title>/i);
  if (t) return t[1].replace(/\s+/g, ' ').trim();
  return '';
}

// Meta tags carry content/property or content/name attributes in either order
// ("<meta property=... content=...>" or "<meta content=... property=...>").
function metaContent(html: string, key: 'property' | 'name', value: string): string | undefined {
  const forward = html.match(new RegExp(`<meta[^>]+${key}=["']${value}["'][^>]+content=["']([^"']+)["']`, 'i'));
  if (forward) return forward[1];
  const backward = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${key}=["']${value}["']`, 'i'));
  return backward?.[1];
}

/** Page-level currency from structured metadata (og/product meta, microdata). */
function pageCurrency(html: string): string | null {
  const v =
    metaContent(html, 'property', 'og:price:currency') ??
    metaContent(html, 'property', 'product:price:currency') ??
    html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/content=["']([A-Za-z]{3})["'][^>]*itemprop=["']priceCurrency["']/i)?.[1];
  return cleanCurrencyCode(v);
}

function extractPrice(html: string): RawPrice | undefined {
  const hint = pageCurrency(html);
  const metaPrice =
    metaContent(html, 'property', 'og:price:amount') ??
    metaContent(html, 'property', 'product:price:amount') ??
    metaContent(html, 'property', 'g:price') ??
    metaContent(html, 'name', 'g:price') ??
    metaContent(html, 'name', 'twitter:data1');
  if (metaPrice) {
    const p = priceFromMatch(metaPrice.match(PRICE_RE), hint) ?? priceFromValue(metaPrice, hint);
    if (p) return p;
  }
  const itemprop = html.match(/itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i);
  if (itemprop) {
    const p = priceFromValue(itemprop[1], hint);
    if (p) return p;
  }
  // Autodoc/eBay-style price containers: <span class="product-price">29.90 CHF</span>,
  // data-price="29.90", class="price-value" etc. — not structured metadata, so
  // only trust them if a plausible price pattern is actually inside.
  const cssSelectors = [
    /class=["'][^"']*x-price-primary[^"']*["'][^>]*>(?:\s*<[^>]+>)*\s*([^<]+)</i,
    /class=["'][^"']*product-price[^"']*["'][^>]*>([^<]+)</i,
    /class=["'][^"']*price-value[^"']*["'][^>]*>([^<]+)</i,
    /<span[^>]+data-price=["']([^"']+)["']/i,
  ];
  for (const re of cssSelectors) {
    const match = html.match(re);
    if (match) {
      const p = priceFromMatch(match[1].match(PRICE_RE), hint)
        ?? (/\d{1,3}(?:[.,'\s]\d{3})*[.,]\d{2}/.test(match[1]) ? priceFromValue(match[1], hint) : undefined);
      if (p) return p;
    }
  }
  return priceFromMatch(html.match(PRICE_RE), hint);
}

function extractArtNr(html: string): string {
  const meta = html.match(/itemprop=["'](?:sku|mpn)["'][^>]*content=["']([^"']+)["']/i);
  if (meta) return meta[1].trim();
  const m = html.match(ARTNR_RE);
  return m ? m[1].trim() : '';
}

/** A redirect/share link ("autodoc.app.link/...") sometimes resolves via a
    client-side `<meta http-equiv="refresh">` or canonical link rather than a
    real HTTP 3xx, which plain `fetch` redirect-following won't catch. */
function extractIndirectRedirect(html: string): string | undefined {
  const refresh = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]*;\s*url=([^"'>]+)["']/i);
  if (refresh) return refresh[1];
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonical) return canonical[1];
  return undefined;
}

// Full navigation header set of iOS Safari. Helps with shops that only check
// headers; a Cloudflare JS challenge (auto-doc.ch) still blocks any server fetch.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de-DE;q=0.9,de;q=0.8,en;q=0.6',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

async function fetchHtml(url: string, signal: AbortSignal): Promise<{ html: string; status: number }> {
  const res = await fetch(url, { signal, headers: BROWSER_HEADERS });
  return { html: await res.text(), status: res.status };
}

async function parseUrl(rawUrl: string): Promise<Partial2> {
  const url = sanitizeUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    let { html, status } = await fetchHtml(url, controller.signal);
    let finalUrl = url;

    // Only chase a refresh/canonical link when this page has no product data:
    // re-requesting a page we can already read just risks a rate-limit block.
    const redirect = !extractFromJsonLd(html).price && !metaContent(html, 'property', 'og:title') ? extractIndirectRedirect(html) : undefined;
    if (redirect) {
      try {
        const resolved = new URL(redirect, url).toString();
        if (resolved === url) throw new Error('same page');
        const next = await fetchHtml(resolved, controller.signal);
        html = next.html; status = next.status; finalUrl = resolved;
      } catch {
        // indirect redirect target unreachable — keep parsing the page we already have
      }
    }

    const blocked = status === 403 || status === 429 || status === 503 || BLOCK_SIGNATURE_RE.test(html.slice(0, 2000));
    const ld = extractFromJsonLd(html);
    // A challenge/block page has no real product markup, so a loose <title>/text
    // regex fallback on it only ever picks up junk ("Attention Required! |
    // Cloudflare") — worse than leaving the field empty for manual entry. Only
    // trust structured data (JSON-LD/OG meta) here, which a block page won't have.
    const ldPrice = ld.price ? priceFromValue(ld.price, cleanCurrencyCode(ld.currency) ?? pageCurrency(html)) : undefined;
    return {
      title: ld.title?.trim() || (!blocked ? extractTitle(html) : ''),
      price: ldPrice ?? (!blocked ? extractPrice(html) : undefined),
      artikelnummer: !blocked ? extractArtNr(html) : '',
      quelle: finalUrl,
      blocked: blocked || undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseText(rawText: string): Partial2 {
  const text = rawText.replace(WRAPPER_RE, '');
  const link = extractLink(text);
  const withoutLink = link ? text.replace(link, ' ') : text;
  const priceMatch = withoutLink.match(PRICE_RE);
  const artMatch = withoutLink.match(ARTNR_RE);

  // Share-sheet text is usually one line ("<title> – 29.90 CHF"); strip the
  // matched price/art-nr and leftover separators to leave just the title.
  let title = withoutLink.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  if (priceMatch) title = title.replace(priceMatch[0], ' ');
  if (artMatch) title = title.replace(artMatch[0], ' ');
  title = title.replace(/\s{2,}/g, ' ').trim().replace(/[-–|,:]+$/, '').trim();

  return {
    title,
    price: priceFromMatch(priceMatch),
    artikelnummer: artMatch ? artMatch[1].trim() : '',
  };
}

function merge(a: Partial2, b: Partial2): Partial2 & { title: string; artikelnummer: string; quelle: string } {
  return {
    title: a.title || b.title || '',
    // Amount and currency always come from the same source.
    price: a.price ?? b.price,
    artikelnummer: a.artikelnummer || b.artikelnummer || '',
    quelle: a.quelle || b.quelle || '',
    blocked: a.blocked || b.blocked || undefined,
  };
}

/** Scrapes/parses a shared link or text into part metadata. Shared with
    import-shortcut.ts, which writes the result straight into an Offerte. */
export async function extractPart(body: ImportRequestBody | undefined): Promise<ImportResult> {
  // Defense in depth: the client already decodes query params (see App.tsx's
  // decodeMaybeDouble), but decode again here too in case this endpoint is ever
  // called directly with a still-encoded value.
  const isPlaceholder = (v?: string) => !!v && /^\[.*\]$/.test(v.trim());
  let rawUrl = body?.url?.trim() ? decodeMaybeDouble(body.url.trim()) : undefined;
  let rawText = body?.text?.trim() ? decodeMaybeDouble(body.text.trim()) : undefined;
  // An unresolved Shortcuts variable placeholder (literal "[Textausgabe
  // (URL-codiert)]" instead of the actual shared value) means the Shortcut
  // itself is misconfigured, not that there's anything here to parse.
  const sawPlaceholder = isPlaceholder(rawUrl) || isPlaceholder(rawText);
  if (isPlaceholder(rawUrl)) rawUrl = undefined;
  if (isPlaceholder(rawText)) rawText = undefined;
  // A Shortcut often passes the whole share-sheet text as import_url
  // ("Bremsscheibe – 29.90 CHF https://…"): pull the link out of it and keep
  // the full string as text so title/price can still be read from it.
  if (rawUrl && !/^https?:\/\/\S+$/i.test(rawUrl)) {
    const link = extractLink(rawUrl);
    if (link || /\s/.test(rawUrl)) {
      rawText ??= rawUrl;
      rawUrl = link;
    }
  }
  const linkInText = !rawUrl && rawText ? extractLink(rawText) : undefined;
  const targetUrl = rawUrl || linkInText;

  // Always compute the text-only fallback up front: if fetching the shop page
  // fails outright (blocked, timed out, unreachable redirect target, …) the
  // regex read of the shared text itself is still the best data we have,
  // rather than discarding it and reporting nothing found.
  const textResult = rawText ? parseText(rawText) : {};
  const provided: Partial2 = {
    title: body?.title?.trim() || undefined,
    price: body?.price?.trim() ? priceFromValue(body.price.trim(), body.currency) : undefined,
    artikelnummer: body?.artnr?.trim() || undefined,
  };

  let fetchResult: Partial2 = {};
  let fetchError: string | undefined;
  if (targetUrl && !(provided.title && provided.price)) {
    try {
      fetchResult = await parseUrl(targetUrl);
    } catch (e) {
      fetchError = e instanceof Error ? e.message : 'Unbekannter Fehler';
    }
  }

  const merged = merge(provided, merge(fetchResult, textResult));
  if (!merged.quelle && targetUrl) merged.quelle = sanitizeUrl(targetUrl);
  // Blocked or unreadable page: the URL slug often still names the part
  // ("…/autoteile/bremsscheibe-10132" -> "Bremsscheibe"), better than nothing.
  if (!merged.title && merged.quelle) merged.title = partNameFromUrl(merged.quelle) ?? '';
  const found = Boolean(merged.title || merged.price || merged.artikelnummer);

  // Into CHF: converted at the ECB rate, or left empty and flagged — never guessed.
  const chf = await resolveChfPrice({ amount: merged.price?.amount ?? '', currency: merged.price?.cur ?? null });
  const { price: _price, ...rest } = merged;
  const priceFields: Pick<ImportResult, 'ek' | 'fx' | 'ekHinweis' | 'preisStatus' | 'preisWarnung'> =
    chf.status === 'ok'
      ? { ek: chf.ek, fx: chf.fx, ekHinweis: chf.fx ? fxHinweis(chf.fx) : undefined }
      : chf.status === 'none'
        ? { ek: '' }
        : { ek: '', preisStatus: chf.status, preisWarnung: preisWarnung(chf) ?? undefined };

  if (sawPlaceholder) {
    console.warn('[import-part] received an unresolved Shortcuts placeholder instead of real data:', { url: body?.url, text: body?.text });
  }

  return {
    ok: found,
    ...rest,
    ...priceFields,
    error: !found ? (sawPlaceholder ? 'Shortcut-Variable wurde nicht ersetzt (Platzhalter erhalten statt echtem Wert)' : fetchError) : undefined,
  };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  // GET ?import_url=… (no key needed) is a Shortcut's background import ("Inhalte von
  // URL abrufen" defaults to GET): parse AND save into the active Offerte.
  // POST stays the app's parse-only lookup for the import sheet.
  if (req.method === 'GET') {
    const { status, json } = await runShortcutImport(req);
    res.status(status).json(json);
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, title: '', ek: '', artikelnummer: '', quelle: '', error: 'Method not allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ImportRequestBody | undefined;
  res.status(200).json(await extractPart(body));
}
