// Shared Google Gemini client for the api/ functions (REST, no SDK).
// Environment variables: GEMINI_API_KEY (primary AI provider), GEMINI_MODEL
// (optional override). ANTHROPIC_API_KEY stays an optional fallback in the
// endpoints that use this.

declare const process: { env: Record<string, string | undefined> };

/** Fast, low-cost Flash model; the alias always points at the current one. */
export const GEMINI_MODEL_DEFAULT = 'gemini-flash-latest';

// Trimmed: a key pasted into Vercel with a trailing newline would fail authentication.
export const geminiKey = (): string => process.env.GEMINI_API_KEY?.trim() ?? '';
export const anthropicKey = (): string => process.env.ANTHROPIC_API_KEY?.trim() ?? '';
export const geminiModel = (): string => process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL_DEFAULT;

export const NOT_CONFIGURED = 'Kein KI-Schlüssel in Vercel konfiguriert (Umgebungsvariable GEMINI_API_KEY fehlt).';

/** A failed Gemini call; `code` = the key itself is the cause, `status` = HTTP status for the client. */
export class GeminiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: 'invalid_key') { super(message); }
}

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

  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(req.timeoutMs ?? 110_000),
    });
  } catch (e) {
    throw new GeminiError((e as Error)?.name === 'TimeoutError' ? 'KI-Dienst antwortet nicht (Zeitüberschreitung)' : 'KI-Dienst nicht erreichbar (Netzwerk)', 502);
  }
  const json = (await r.json().catch(() => null)) as {
    error?: { message?: string; status?: string; details?: { reason?: string }[] };
    promptFeedback?: { blockReason?: string };
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string;
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  } | null;

  if (!r.ok) {
    const msg = json?.error?.message ?? '';
    const schluessel = r.status === 401 || r.status === 403 || json?.error?.details?.some((d) => d.reason === 'API_KEY_INVALID') || /api key/i.test(msg);
    if (schluessel) throw new GeminiError('Der Gemini API Key in Vercel ist ungültig oder hat keinen Zugriff auf die Gemini API.', 502, 'invalid_key');
    if (r.status === 429) throw new GeminiError('Zu viele Anfragen – bitte kurz warten und erneut versuchen', 429);
    if (r.status === 404) throw new GeminiError(`Gemini-Modell "${geminiModel()}" nicht verfügbar (GEMINI_MODEL prüfen)`, 502);
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
