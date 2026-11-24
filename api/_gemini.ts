// Shared Google Gemini client for the api/ functions (REST, no SDK).
// Environment variables: GEMINI_API_KEY (primary AI provider), GEMINI_MODEL
// (optional override). ANTHROPIC_API_KEY stays an optional fallback in the
// endpoints that use this.

declare const process: { env: Record<string, string | undefined> };

/** Lightweight Flash model with the high free-tier quota. */
export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash';
/** Used once if the pinned model is no longer offered (404): the alias always points at the current Flash. */
const GEMINI_MODEL_ALIAS = 'gemini-flash-latest';
/** Separate free-tier quota bucket: tried once when the main model's quota is used up (only without GEMINI_MODEL). */
const GEMINI_MODEL_LITE = 'gemini-2.5-flash-lite';
/** Wait before the one automatic retry after a per-minute rate limit (429). */
const RETRY_429_MS = 2500;

// Trimmed: a key pasted into Vercel with a trailing newline would fail authentication.
export const geminiKey = (): string => process.env.GEMINI_API_KEY?.trim() ?? '';
export const anthropicKey = (): string => process.env.ANTHROPIC_API_KEY?.trim() ?? '';
export const geminiModel = (): string => process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL_DEFAULT;

export const NOT_CONFIGURED = 'Kein KI-Schlüssel in Vercel konfiguriert (Umgebungsvariable GEMINI_API_KEY fehlt).';

/** Which quota a 429 hit, from Google's QuotaFailure details. */
export type QuotaArt = 'minute' | 'tag' | 'suche' | 'kein_kontingent' | 'unbekannt';

/** A failed Gemini call; `code` = the key itself is the cause, `status` = HTTP status for the client,
    `quota` / `detail` = the exact upstream reason of a rate limit. */
export class GeminiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: 'invalid_key' | 'quota',
    readonly quota?: QuotaArt, readonly detail?: string) { super(message); }
}

type GoogleFehler = {
  message?: string; status?: string;
  details?: { '@type'?: string; reason?: string; retryDelay?: string;
    violations?: { quotaId?: string; quotaMetric?: string; quotaValue?: string }[] }[];
};

/** Classifies a 429: per-minute limit, daily quota, Search-grounding quota, or no free quota at all (limit 0). */
function quotaAus(e: GoogleFehler | undefined): { art: QuotaArt; detail: string; wartenS?: number } {
  const v = (e?.details ?? []).flatMap((d) => d.violations ?? []);
  const ids = v.map((x) => `${x.quotaId ?? ''} ${x.quotaMetric ?? ''}`).join(' ');
  const retry = (e?.details ?? []).find((d) => d.retryDelay)?.retryDelay;
  const wartenS = retry ? Math.ceil(parseFloat(retry)) : undefined;
  const msg = e?.message ?? '';
  const art: QuotaArt =
    /search|grounding/i.test(ids) ? 'suche'
      : /limit:\s*0(?!\d)/i.test(msg) || v.some((x) => x.quotaValue === '0') ? 'kein_kontingent'
        : /PerDay/i.test(ids) ? 'tag'
          : /PerMinute/i.test(ids) ? 'minute'
            : 'unbekannt';
  const detail = [v.map((x) => x.quotaId).filter(Boolean).join(', '), wartenS ? `retry in ${wartenS}s` : '', msg.split('\n')[0]]
    .filter(Boolean).join(' | ').slice(0, 400);
  return { art, detail, wartenS };
}

const QUOTA_TEXT: Record<QuotaArt, string> = {
  minute: 'Gemini-Limit pro Minute erreicht – bitte in einer Minute erneut versuchen.',
  tag: 'Tageskontingent der Gemini API (Free Tier) aufgebraucht – morgen wieder verfügbar oder Abrechnung im Google AI Studio aktivieren.',
  suche: 'Kontingent für die Google-Suche (Grounding) der Gemini API aufgebraucht – später erneut versuchen oder Abrechnung aktivieren.',
  kein_kontingent: 'Dieses Gemini-Modell hat im Free Tier kein Kontingent (Limit 0) – GEMINI_MODEL ändern oder Abrechnung aktivieren.',
  unbekannt: 'Zu viele Anfragen an Gemini – bitte kurz warten und erneut versuchen.',
};

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface GeminiRequest {
  system?: string;
  parts: GeminiPart[];
  /** Grounding with Google Search. */
  search?: boolean;
  /** JSON output following this (JSON Schema subset) schema. */
  schema?: Record<string, unknown>;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface GeminiAntwort {
  text: string;
  finishReason?: string;
  /** Pages the Google Search grounding used (Google redirect links). */
  quellen: { uri: string; title?: string }[];
}

/** JSON Schema → Gemini responseSchema (OpenAPI subset): upper-case types, no additionalProperties. */
function geminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === 'additionalProperties') continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, x]) => [p, geminiSchema(x)]));
    } else out[k] = geminiSchema(v);
  }
  return out;
}

export async function geminiGenerate(req: GeminiRequest): Promise<GeminiAntwort> {
  const key = geminiKey();
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: req.parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: req.maxOutputTokens ?? 16000,
      ...(req.schema ? { responseMimeType: 'application/json', responseSchema: geminiSchema(req.schema) } : {}),
    },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.search) body.tools = [{ google_search: {} }];

  const senden = async (model: string): Promise<Response> => {
    try {
      return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? 110_000),
      });
    } catch (e) {
      throw new GeminiError((e as Error)?.name === 'TimeoutError' ? 'KI-Dienst antwortet nicht (Zeitüberschreitung)' : 'KI-Dienst nicht erreichbar (Netzwerk)', 502);
    }
  };
  type Json = {
    error?: GoogleFehler;
    promptFeedback?: { blockReason?: string };
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string;
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  } | null;
  const eigenesModell = !!process.env.GEMINI_MODEL?.trim();
  let model = geminiModel();
  let r = await senden(model);
  // Pinned default retired by Google: fall back to the Flash alias (an explicit GEMINI_MODEL stays as set).
  if (r.status === 404 && !eigenesModell) r = await senden((model = GEMINI_MODEL_ALIAS));
  let json = (await r.json().catch(() => null)) as Json;
  if (r.status === 429) {
    let q = quotaAus(json?.error);
    console.error(`[gemini] 429 ${model}: ${q.art} – ${q.detail}`);
    // Per-minute limit: wait briefly and retry exactly once. A daily / zero quota won't clear in seconds.
    if (q.art === 'minute' || q.art === 'unbekannt') {
      await new Promise((ok) => setTimeout(ok, Math.min(Math.max(RETRY_429_MS, (q.wartenS ?? 0) * 1000), 6000)));
      r = await senden(model);
      json = (await r.json().catch(() => null)) as Json;
      if (r.status === 429) { q = quotaAus(json?.error); console.error(`[gemini] 429 retry ${model}: ${q.art} – ${q.detail}`); }
    }
    // Still limited: Flash-Lite has its own free-tier quota (not when GEMINI_MODEL is set on purpose).
    if (r.status === 429 && !eigenesModell && model !== GEMINI_MODEL_LITE && q.art !== 'suche') {
      r = await senden((model = GEMINI_MODEL_LITE));
      json = (await r.json().catch(() => null)) as Json;
      if (r.status === 429) { q = quotaAus(json?.error); console.error(`[gemini] 429 ${model}: ${q.art} – ${q.detail}`); }
    }
    if (r.status === 429) throw new GeminiError(QUOTA_TEXT[q.art], 429, 'quota', q.art, `${model}: ${q.detail}`);
  }

  if (!r.ok) {
    const msg = json?.error?.message ?? '';
    console.error(`[gemini] ${r.status} ${model}: ${json?.error?.status ?? ''} ${msg.slice(0, 300)}`);
    const schluessel = r.status === 401 || r.status === 403 || json?.error?.details?.some((d) => d.reason === 'API_KEY_INVALID') || /api key/i.test(msg);
    if (schluessel) throw new GeminiError('Der Gemini API Key in Vercel ist ungültig oder hat keinen Zugriff auf die Gemini API.', 502, 'invalid_key');
    if (r.status === 404) throw new GeminiError(`Gemini-Modell "${model}" nicht verfügbar (GEMINI_MODEL prüfen)`, 502);
    if (r.status === 400) throw new GeminiError(`Anfrage wurde abgelehnt: ${msg || 'ungültige Anfrage'}`, 422);
    throw new GeminiError(`KI-Dienst nicht erreichbar (${r.status})`, 502);
  }
  if (json?.promptFeedback?.blockReason) throw new GeminiError('Die Anfrage wurde vom KI-Dienst blockiert', 422);
  const c = json?.candidates?.[0];
  return {
    text: (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''),
    finishReason: c?.finishReason,
    quellen: (c?.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web?.uri ? [{ uri: g.web.uri, title: g.web.title }] : [])),
  };
}

/** The page behind a Google grounding redirect link (null when it can't be resolved). */
export async function zielUrl(uri: string): Promise<string | null> {
  if (!/^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//.test(uri)) return uri;
  try {
    const r = await fetch(uri, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return r.headers.get('location');
  } catch { return null; }
}

/** First JSON object in a model's text answer (tolerates ```json fences / prose around it). */
export function jsonAusText<T>(text: string): T | null {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { return null; }
}
