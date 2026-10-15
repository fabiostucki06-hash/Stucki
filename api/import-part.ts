// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Parses a shared URL or plain-text payload (e.g. forwarded from the Autodoc iPhone
// app via an iOS Shortcut, see Settings -> Teile-Import) into part metadata, so the
// mobile import view can prefill title / purchase price / article number.

import { runShortcutImport } from './import-shortcut.js';

export interface ImportRequestBody {
  url?: string;
  text?: string;
}

export interface ImportResult {
  ok: boolean;
  title: string;
  ek: string;
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

// Currency before the amount ("CHF 29.90", "€12,50") OR after it ("29.90 CHF",
// "12,50 €") — Autodoc's site and its app's share text use different orders.
const PRICE_RE = /(?:(?:CHF|EUR|€|Fr\.?)\s?(\d{1,3}(?:[.,'\s]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,'\s]\d{3})*[.,]\d{2})\s?(?:CHF|EUR|€|Fr\.?))/i;
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

function priceMatchValue(m: RegExpMatchArray | null): string | undefined {
  return m ? (m[1] ?? m[2]) : undefined;
}

function normalizePrice(raw: string): string {
  // "1'234.50" / "1.234,50" / "49,90" -> "1234.50" / "49.90"
  const cleaned = raw.replace(/['\s]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** Best-effort: not every absolute-looking link the Autodoc app shares has a
    scheme (some share-sheet strings drop it), and stray trailing punctuation
    from the surrounding sentence often rides along. */
function sanitizeUrl(raw: string): string {
  let u = raw.trim().replace(/[)\].,;!?'"]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

function extractFromJsonLd(html: string): { title?: string; price?: string } {
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
          if (c?.name || price != null) {
            return { title: c?.name, price: price != null ? String(price) : undefined };
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

function extractPrice(html: string): string {
  const metaPrice =
    metaContent(html, 'property', 'og:price:amount') ??
    metaContent(html, 'property', 'product:price:amount') ??
    metaContent(html, 'property', 'g:price') ??
    metaContent(html, 'name', 'g:price') ??
    metaContent(html, 'name', 'twitter:data1');
  if (metaPrice) {
    const m = priceMatchValue(metaPrice.match(PRICE_RE)) ?? metaPrice.match(/\d{1,3}(?:[.,'\s]\d{3})*(?:[.,]\d{2})?/)?.[0];
    if (m) return normalizePrice(m);
  }
  const itemprop = html.match(/itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i);
  if (itemprop) return normalizePrice(itemprop[1]);
  // Autodoc-style price containers: <span class="product-price">29.90 CHF</span>,
  // data-price="29.90", class="price-value" etc. — not structured metadata, so
  // only trust them if a plausible price pattern is actually inside.
  const cssSelectors = [
    /class=["'][^"']*product-price[^"']*["'][^>]*>([^<]+)</i,
    /class=["'][^"']*price-value[^"']*["'][^>]*>([^<]+)</i,
    /<span[^>]+data-price=["']([^"']+)["']/i,
  ];
  for (const re of cssSelectors) {
    const match = html.match(re);
    if (match) {
      const m = priceMatchValue(match[1].match(PRICE_RE)) ?? match[1].match(/\d{1,3}(?:[.,'\s]\d{3})*[.,]\d{2}/)?.[0];
      if (m) return normalizePrice(m);
    }
  }
  const m = priceMatchValue(html.match(PRICE_RE));
  return m ? normalizePrice(m) : '';
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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
};

async function fetchHtml(url: string, signal: AbortSignal): Promise<{ html: string; status: number }> {
  const res = await fetch(url, { signal, headers: BROWSER_HEADERS });
  return { html: await res.text(), status: res.status };
}

async function parseUrl(rawUrl: string): Promise<Partial<ImportResult>> {
  const url = sanitizeUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    let { html, status } = await fetchHtml(url, controller.signal);
    let finalUrl = url;

    const redirect = extractIndirectRedirect(html);
    if (redirect) {
      try {
        const resolved = new URL(redirect, url).toString();
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
    return {
      title: ld.title?.trim() || (!blocked ? extractTitle(html) : ''),
      ek: (ld.price && normalizePrice(ld.price)) || (!blocked ? extractPrice(html) : ''),
      artikelnummer: !blocked ? extractArtNr(html) : '',
      quelle: finalUrl,
      blocked: blocked || undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseText(rawText: string): Partial<ImportResult> {
  const text = rawText.replace(WRAPPER_RE, '');
  const link = extractLink(text);
  const withoutLink = link ? text.replace(link, ' ') : text;
  const priceMatch = withoutLink.match(PRICE_RE);
  const priceRaw = priceMatchValue(priceMatch);
  const artMatch = withoutLink.match(ARTNR_RE);

  // Share-sheet text is usually one line ("<title> – 29.90 CHF"); strip the
  // matched price/art-nr and leftover separators to leave just the title.
  let title = withoutLink.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  if (priceMatch) title = title.replace(priceMatch[0], ' ');
  if (artMatch) title = title.replace(artMatch[0], ' ');
  title = title.replace(/\s{2,}/g, ' ').trim().replace(/[-–|,:]+$/, '').trim();

  return {
    title,
    ek: priceRaw ? normalizePrice(priceRaw) : '',
    artikelnummer: artMatch ? artMatch[1].trim() : '',
  };
}

function merge(a: Partial<ImportResult>, b: Partial<ImportResult>): Omit<ImportResult, 'ok'> {
  return {
    title: a.title || b.title || '',
    ek: a.ek || b.ek || '',
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

  let fetchResult: Partial<ImportResult> = {};
  let fetchError: string | undefined;
  if (targetUrl) {
    try {
      fetchResult = await parseUrl(targetUrl);
    } catch (e) {
      fetchError = e instanceof Error ? e.message : 'Unbekannter Fehler';
    }
  }

  const merged = merge(fetchResult, textResult);
  if (!merged.quelle && targetUrl) merged.quelle = targetUrl;
  const found = Boolean(merged.title || merged.ek || merged.artikelnummer);

  if (sawPlaceholder) {
    console.warn('[import-part] received an unresolved Shortcuts placeholder instead of real data:', { url: body?.url, text: body?.text });
  }

  return {
    ok: found,
    ...merged,
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
