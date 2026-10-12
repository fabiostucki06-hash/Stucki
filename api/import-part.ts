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
const PRICE_RE = /(?:CHF|EUR|€|Fr\.?)\s?([\d]{1,3}(?:[.'\s]\d{3})*(?:[.,]\d{2})?)/i;
const ARTNR_RE = /(?:Art(?:ikel)?\.?-?Nr\.?|Artikelnummer|SKU|MPN)[:\s]*([A-Za-z0-9\-/]{3,})/i;

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
  const ogPrice = html.match(/<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i);
  if (ogPrice) return normalizePrice(ogPrice[1]);
  const itemprop = html.match(/itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i);
  if (itemprop) return normalizePrice(itemprop[1]);
  const m = html.match(PRICE_RE);
  if (m) return normalizePrice(m[1]);
  return '';
}

function extractArtNr(html: string): string {
  const meta = html.match(/itemprop=["'](?:sku|mpn)["'][^>]*content=["']([^"']+)["']/i);
  if (meta) return meta[1].trim();
  const m = html.match(ARTNR_RE);
  return m ? m[1].trim() : '';
}

async function parseUrl(url: string): Promise<Partial<ImportResult>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GarageOS-Import/1.0)' },
    });
    const html = await res.text();
    const ld = extractFromJsonLd(html);
    return {
      title: ld.title?.trim() || extractTitle(html),
      ek: (ld.price && normalizePrice(ld.price)) || extractPrice(html),
      artikelnummer: extractArtNr(html),
      quelle: url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseText(text: string): Partial<ImportResult> {
  const firstLine = text.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  const priceMatch = text.match(PRICE_RE);
  const artMatch = text.match(ARTNR_RE);
  return {
    title: firstLine.replace(PRICE_RE, '').trim(),
    ek: priceMatch ? normalizePrice(priceMatch[1]) : '',
    artikelnummer: artMatch ? artMatch[1].trim() : '',
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
  const linkInText = !rawUrl && rawText ? rawText.match(URL_RE)?.[0] : undefined;
  const targetUrl = rawUrl || linkInText;

  try {
    if (targetUrl) {
      const fromUrl = await parseUrl(targetUrl);
      const fallback = rawText ? parseText(rawText) : {};
      res.status(200).json({
        ok: true,
        title: fromUrl.title || fallback.title || '',
        ek: fromUrl.ek || fallback.ek || '',
        artikelnummer: fromUrl.artikelnummer || fallback.artikelnummer || '',
        quelle: targetUrl,
      });
      return;
    }

    if (rawText) {
      const fromText = parseText(rawText);
      res.status(200).json({
        ok: true,
        title: fromText.title || '',
        ek: fromText.ek || '',
        artikelnummer: fromText.artikelnummer || '',
        quelle: '',
      });
      return;
    }

    res.status(400).json({ ok: false, title: '', ek: '', artikelnummer: '', quelle: '', error: 'Weder url noch text übergeben' });
  } catch (e) {
    // Parsing failed (unreachable page, blocked fetch, …) — the client falls back
    // to a blank, manually-filled form, so this is a soft failure, not a 500.
    res.status(200).json({
      ok: false,
      title: '',
      ek: '',
      artikelnummer: '',
      quelle: targetUrl ?? '',
      error: e instanceof Error ? e.message : 'Unbekannter Fehler',
    });
  }
}
