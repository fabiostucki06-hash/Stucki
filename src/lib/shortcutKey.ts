import { db, getFreshToken, tokenUserId } from './supabase';

/** Creates a new Kurzbefehl key for the background import (/api/import-shortcut)
    and stores only its SHA-256 hash in the user's user_settings row; any older
    key stops working. The plain key is returned once, to paste into the Shortcut. */
export async function generateShortcutKey(): Promise<string> {
  const token = await getFreshToken();
  const userId = token && tokenUserId(token);
  if (!token || !userId) throw new Error('Nicht angemeldet.');
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  await db.upsert('user_settings', { user_id: userId, import_token_hash: hash, updated_at: new Date().toISOString() }, token);
  return key;
}
