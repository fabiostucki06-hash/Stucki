// Shared by api/drive-auth.ts and api/drive-upload.ts (the leading underscore
// keeps Vercel from deploying this file as its own function).
// Each user connects their own Google account with the drive.file scope: the
// app only sees files and folders it created itself. The refresh token is
// stored AES-GCM encrypted in public.drive_connections, under the user's RLS.
// Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

import type { VercelLikeRequest } from './import-part.js';

declare const process: { env: Record<string, string | undefined> };

export const SUPA_URL = 'https://xpggpkmqwescbcrnnpod.supabase.co';
// Public anon key (same as in src/lib/supabase.ts).
export const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ2dwa21xd2VzY2Jjcm5ucG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjIxMjIsImV4cCI6MjA5NjEzODEyMn0.egPJ4OYOegRKIBV6PHUz_VfRib8g7sVIcNNy_7bFxjg';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
export const missingEnv = (): string[] => REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
export const clientId = (): string => process.env.GOOGLE_CLIENT_ID?.trim() ?? '';
export const clientSecret = (): string => process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '';

export const header = (req: VercelLikeRequest, name: string): string | undefined => {
  const v = req.headers?.[name];
  return (Array.isArray(v) ? v[0] : v) || undefined;
};

export const bearer = (req: VercelLikeRequest): string | undefined =>
  header(req, 'authorization')?.replace(/^Bearer\s+/i, '') || undefined;

/** The signed-in Supabase user's id, checked against Supabase; null when invalid. */
export async function supabaseUserId(token: string): Promise<string | null> {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return ((await r.json()) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

/* ── Crypto ── */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Separate keys for token encryption and state signing, both derived from the client secret. */
async function deriveKey(purpose: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(clientSecret()), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('garageos-drive'), info: enc.encode(purpose) },
    base, algorithm, false, usages,
  );
}

const aesKey = () => deriveKey('refresh-token', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
const hmacKey = () => deriveKey('oauth-state', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify']);

/** The user id is authenticated data: a ciphertext can't be moved to another account. */
export async function encryptToken(plain: string, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(userId) }, await aesKey(), enc.encode(plain));
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function decryptToken(stored: string, userId: string): Promise<string> {
  const [v, iv, ct] = stored.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Unbekanntes Token-Format');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv), additionalData: enc.encode(userId) }, await aesKey(), fromB64url(ct));
  return dec.decode(plain);
}

const STATE_TTL_MS = 10 * 60 * 1000;

/** OAuth state: signed, short-lived and bound to the user who started the flow. */
export async function signState(userId: string): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = b64url(enc.encode(JSON.stringify({ u: userId, e: Date.now() + STATE_TTL_MS, n: nonce })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyState(state: string, userId: string): Promise<boolean> {
  const [payload, sig] = state.split('.');
  if (!payload || !sig) return false;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(payload)))) return false;
    const p = JSON.parse(dec.decode(fromB64url(payload))) as { u?: string; e?: number };
    return p.u === userId && typeof p.e === 'number' && p.e > Date.now();
  } catch {
    return false;
  }
}

/* ── drive_connections (always with the user's own JWT, so RLS applies) ── */

export interface DriveConnection {
  refresh_token_enc: string;
  account_email: string | null;
}

const rest = (token: string, extra: Record<string, string> = {}) => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${token}`,
  ...extra,
});
const rowUrl = (userId: string) => `${SUPA_URL}/rest/v1/drive_connections?user_id=eq.${encodeURIComponent(userId)}`;

export async function getConnection(token: string, userId: string): Promise<DriveConnection | null> {
  const r = await fetch(`${rowUrl(userId)}&select=refresh_token_enc,account_email`, { headers: rest(token) });
  // Reported instead of read as "not connected", which would hide a broken setup.
  if (r.status === 404) throw new Error('Datenbank-Tabelle drive_connections fehlt – Migration ausführen');
  if (!r.ok) throw new Error(`Verbindung konnte nicht gelesen werden (${r.status})`);
  return ((await r.json()) as DriveConnection[])[0] ?? null;
}

export async function saveConnection(token: string, userId: string, refreshTokenEnc: string, email: string): Promise<void> {
  const r = await fetch(`${SUPA_URL}/rest/v1/drive_connections?on_conflict=user_id`, {
    method: 'POST',
    headers: rest(token, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: userId, refresh_token_enc: refreshTokenEnc, account_email: email, connected_at: new Date().toISOString() }),
  });
  if (r.status === 404) throw new Error('Datenbank-Tabelle drive_connections fehlt – Migration ausführen');
  if (!r.ok) throw new Error(`Verbindung konnte nicht gespeichert werden (${r.status})`);
}

export async function deleteConnection(token: string, userId: string): Promise<void> {
  const r = await fetch(rowUrl(userId), { method: 'DELETE', headers: rest(token, { Prefer: 'return=minimal' }) });
  if (!r.ok && r.status !== 404) throw new Error(`Verbindung konnte nicht entfernt werden (${r.status})`);
}

/* ── Google ── */

/** The stored grant no longer works (revoked, expired): the user has to connect again.
    keepConnection: the row may still be valid (e.g. a mistyped secret), so it isn't deleted. */
export class ReconnectError extends Error {
  constructor(message: string, readonly keepConnection = false) {
    super(message);
  }
}

/** A temporary Google or network problem: the whole upload can safely run again. */
export class TransientDriveError extends Error {}

const GOOGLE_TIMEOUT_MS = 15_000;

/** fetch with a timeout; network failures become retryable errors. */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  } catch {
    throw new TransientDriveError('Google Drive nicht erreichbar');
  }
}

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const r = await googleFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (r.ok && j.access_token) return j.access_token;
  if (j.error === 'invalid_grant') throw new ReconnectError('Google-Zugriff abgelaufen oder widerrufen – bitte neu verbinden');
  if (j.error === 'invalid_client') throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET stimmen nicht');
  const message = `Google-Anmeldung fehlgeschlagen (${j.error ?? r.status})`;
  throw r.status === 429 || r.status >= 500 ? new TransientDriveError(message) : new Error(message);
}

/** Readable reason for a failed Drive API call. */
export async function driveError(r: Response): Promise<Error> {
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
  const reason = j.error?.errors?.[0]?.reason ?? '';
  const msg = j.error?.message ?? '';
  // A just-issued access token was refused: retry with a new one, the grant itself is fine.
  if (r.status === 401) return new TransientDriveError('Google-Zugriff vorübergehend abgelehnt – später erneut exportieren');
  if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(msg))
    return new Error('Google Drive API ist im Google-Cloud-Projekt nicht aktiviert');
  if (reason === 'insufficientPermissions' || /insufficient.*scope/i.test(msg))
    return new ReconnectError('Drive-Berechtigung fehlt – bitte neu verbinden und Zugriff erlauben');
  if (reason === 'storageQuotaExceeded') return new Error('Google-Drive-Speicher voll');
  if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded' || r.status === 429)
    return new TransientDriveError('Google Drive ist gerade ausgelastet – später erneut exportieren');
  const message = `Google Drive ${r.status}${msg ? `: ${msg}` : ''}`;
  return r.status >= 500 ? new TransientDriveError(message) : new Error(message);
}
