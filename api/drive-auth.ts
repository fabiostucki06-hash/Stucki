// Vercel Node serverless function (not part of the Vite app bundle / tsc -b build).
// Google Drive OAuth per user. All calls: Authorization: Bearer <Supabase access token>
//   POST /api/drive-auth { action: 'status' }           → { configured, missing, connected, account }
//   POST /api/drive-auth { action: 'start' }            → { url } (Google consent page)
//   POST /api/drive-auth { action: 'finish', code, state } → { account }
//   POST /api/drive-auth { action: 'disconnect' }       → revokes the grant, deletes the row
// Google redirects to <origin>/drive-callback; the app posts code + state back here,
// so the token exchange runs with the user's session and the secret stays on the server.

import type { VercelLikeRequest, VercelLikeResponse } from './import-part.js';
import {
  DRIVE_SCOPE, TOKEN_URL, bearer, clientId, clientSecret, decryptToken, deleteConnection, encryptToken,
  getConnection, header, missingEnv, saveConnection, signState, supabaseUserId, verifyState,
} from './_drive.js';

/** Must be registered as an authorized redirect URI of the OAuth client. */
function redirectUri(req: VercelLikeRequest): string {
  const host = (header(req, 'x-forwarded-host') ?? header(req, 'host') ?? '').split(',')[0].trim();
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
  return `${proto}://${host}/drive-callback`;
}

async function finish(req: VercelLikeRequest, token: string, userId: string, code: string): Promise<string> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google-Anmeldung fehlgeschlagen (${j.error ?? r.status})`);
  if (!j.scope?.split(' ').includes(DRIVE_SCOPE)) throw new Error('Drive-Zugriff wurde nicht erlaubt – bitte das Häkchen bei Google Drive setzen');
  if (!j.refresh_token) throw new Error('Google hat keinen Refresh-Token geliefert – bitte erneut verbinden');

  const about = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { Authorization: `Bearer ${j.access_token}` },
  });
  if (!about.ok) throw new Error(about.status === 403 ? 'Google Drive API ist im Google-Cloud-Projekt nicht aktiviert' : `Google Drive ${about.status}`);
  const email = ((await about.json()) as { user?: { emailAddress?: string } }).user?.emailAddress ?? '';

  await saveConnection(token, userId, await encryptToken(j.refresh_token, userId), email);
  return email;
}

async function disconnect(token: string, userId: string): Promise<void> {
  const row = await getConnection(token, userId);
  if (row) {
    // Best effort: the local row goes either way, so the app stops uploading.
    try {
      const refresh = await decryptToken(row.refresh_token_enc, userId);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refresh }).toString(),
      });
    } catch { /* already invalid */ }
  }
  await deleteConnection(token, userId);
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Nur POST' });

  const token = bearer(req);
  const userId = token ? await supabaseUserId(token) : null;
  if (!token || !userId) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });

  let body: { action?: unknown; code?: unknown; state?: unknown };
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as typeof body;
  } catch {
    return res.status(400).json({ ok: false, error: 'Ungültiges JSON' });
  }

  const missing = missingEnv();
  try {
    if (body.action === 'status') {
      const row = await getConnection(token, userId);
      return res.status(200).json({
        ok: true, configured: missing.length === 0, missing,
        connected: !!row && missing.length === 0, account: row?.account_email ?? '',
        redirectUri: redirectUri(req),
      });
    }
    if (body.action === 'disconnect') {
      await disconnect(token, userId);
      return res.status(200).json({ ok: true });
    }
    if (missing.length) {
      return res.status(501).json({ ok: false, configured: false, missing, error: `In Vercel fehlen: ${missing.join(', ')}` });
    }
    if (body.action === 'start') {
      const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(req),
        response_type: 'code',
        scope: DRIVE_SCOPE,
        access_type: 'offline',
        prompt: 'consent', // Google only returns a refresh token on consent
        state: await signState(userId),
      });
      return res.status(200).json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (body.action === 'finish') {
      if (typeof body.code !== 'string' || typeof body.state !== 'string') return res.status(400).json({ ok: false, error: 'code und state erforderlich' });
      if (!(await verifyState(body.state, userId))) return res.status(400).json({ ok: false, error: 'Anmeldung abgelaufen oder ungültig – bitte erneut verbinden' });
      return res.status(200).json({ ok: true, account: await finish(req, token, userId, body.code) });
    }
    return res.status(400).json({ ok: false, error: 'Unbekannte Aktion' });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
