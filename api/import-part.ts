// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Parses a shared URL or plain-text payload (e.g. forwarded from the Autodoc iPhone
// app via an iOS Shortcut, see Settings -> Teile-Import) into part metadata, so the
// mobile import view can prefill title / purchase price / article number.

interface ImportRequestBody {
  url?: string;
  text?: string;
}

interface ImportResult {
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

interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}

interface VercelLikeResponse {
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
          const price = offers?.price ?? offers?.priceSpecification?.price;
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

function extractPrice(html: string): string {
  const metaPrice = html.match(/<meta[^>]+property=["'](?:og:price:amount|product:price:amount)["'][^>]+content=["']([^"']+)["']/i);
  if (metaPrice) return normalizePrice(metaPrice[1]);
  const itemprop = html.match(/itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i);
  if (itemprop) return normalizePrice(itemprop[1]);
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

function parseText(text: string): Partial<ImportResult> {
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

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, title: '', ek: '', artikelnummer: '', quelle: '', error: 'Method not allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ImportRequestBody | undefined;
  const rawUrl = body?.url?.trim();
  const rawText = body?.text?.trim();
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

  res.status(200).json({
    ok: found,
    ...merged,
    error: !found ? fetchError : undefined,
  });
}
