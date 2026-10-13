import { RealtimeClient } from '@supabase/realtime-js';
import { SUPA_URL, SUPA_KEY, db, getFreshToken } from './supabase';
import { getSettings, applyRemoteSettings, onLocalSettingsChange, resetSettings, type Settings } from './settings';

/* ── Cross-device settings sync ──
   Keeps the local settings store (settings.ts) and the user's row in
   `user_settings` identical:
   - local change  -> debounced upsert of just the changed columns
   - remote change -> Supabase Realtime (postgres_changes) pushes the new row,
                      which is applied to the store and re-renders the UI
   Realtime sockets get suspended (iOS Safari in the background, flaky
   networks), so the row is also re-read whenever the tab wakes up, the socket
   (re)joins, and on a slow poll while the socket is down. */

const TABLE = 'user_settings';
/** Which account the localStorage cache belongs to. */
const OWNER_KEY = 'garage_settings_uid';
/** Text fields (IBAN, hex color) change per keystroke; write once typing pauses. */
const PUSH_DEBOUNCE_MS = 400;
const POLL_MS = 20_000;

type Row = Record<string, unknown>;

function toRow(p: Partial<Settings>): Row {
  const row: Row = {};
  if (p.wallpaper !== undefined) row.wallpaper = p.wallpaper;
  if (p.bgMode !== undefined) row.bg_mode = p.bgMode;
  if (p.bgColor !== undefined) row.bg_color = p.bgColor;
  if (p.activeOfferteId !== undefined) row.active_offerte_id = p.activeOfferteId;
  if (p.iban !== undefined) row.iban = p.iban;
  if (p.margin !== undefined) row.margin = p.margin;
  return row;
}

/** A null column means "never set on any device": the local value stays. */
function fromRow(row: Row): Partial<Settings> {
  const p: Partial<Settings> = {};
  if (typeof row.wallpaper === 'string' && row.wallpaper) p.wallpaper = row.wallpaper;
  if (row.bg_mode === 'image' || row.bg_mode === 'color') p.bgMode = row.bg_mode;
  if (typeof row.bg_color === 'string' && row.bg_color) p.bgColor = row.bg_color;
  if (typeof row.active_offerte_id === 'string') p.activeOfferteId = row.active_offerte_id;
  if (typeof row.iban === 'string') p.iban = row.iban;
  if (row.margin != null && Number.isFinite(Number(row.margin))) p.margin = Number(row.margin);
  return p;
}

let loaded: Promise<void> = Promise.resolve();
/** Resolves once the settings of the signed-in user were read from the
    database (or that read failed), i.e. once the store is as fresh as it gets. */
export const whenSettingsLoaded = (): Promise<void> => loaded;

/** Starts syncing for the signed-in user; returns the stop function. */
export function startSettingsSync(userId: string): () => void {
  // The cache is from another account: don't show (or upload) its values.
  const owner = localStorage.getItem(OWNER_KEY);
  if (owner && owner !== userId) resetSettings();
  localStorage.setItem(OWNER_KEY, userId);

  let stopped = false;
  let pending: Partial<Settings> = {};
  let timer: number | undefined;
  let inFlight = 0;
  let pulling: Promise<void> | null = null;
  let live = false;

  // While a local change is still on its way to the database, an incoming row
  // may predate it and would revert what the user just did.
  const dirty = () => timer !== undefined || inFlight > 0 || Object.keys(pending).length > 0;

  function pull(): Promise<void> {
    pulling ??= (async () => {
      try {
        const token = await getFreshToken();
        if (!token) return;
        const rows = await db.get(TABLE, token);
        if (stopped || !Array.isArray(rows) || dirty()) return;
        if (rows[0]) applyRemoteSettings(fromRow(rows[0] as Row));
        // First device of this account: its local settings become the synced ones.
        else queue(getSettings());
      } catch (e) {
        console.warn('[Settings] sync read failed:', e);
      } finally {
        pulling = null;
      }
    })();
    return pulling;
  }

  async function flush() {
    window.clearTimeout(timer);
    timer = undefined;
    const patch = pending;
    pending = {};
    if (!Object.keys(patch).length) return;
    inFlight++;
    try {
      const token = await getFreshToken();
      if (!token) throw new Error('no session');
      await db.upsert(TABLE, { user_id: userId, ...toRow(patch), updated_at: new Date().toISOString() }, token);
    } catch (e) {
      // Keep it for the next attempt (wake-up / poll); newer local changes win.
      pending = { ...patch, ...pending };
      console.warn('[Settings] sync write failed, will retry:', e);
    } finally {
      inFlight--;
    }
    // Catch up on anything another device changed while this write was underway.
    if (!stopped && !dirty()) pull();
  }

  function queue(patch: Partial<Settings>) {
    Object.assign(pending, patch);
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, PUSH_DEBOUNCE_MS);
  }

  /** Retry a failed write, otherwise re-read the row. */
  function resync() {
    if (stopped) return;
    if (dirty()) { if (timer === undefined && inFlight === 0) flush(); }
    else pull();
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') resync();
    // Going to the background: the debounce timer may never fire, write now.
    else if (timer !== undefined) flush();
  };
  const poll = window.setInterval(() => {
    if (!live && document.visibilityState === 'visible') resync();
  }, POLL_MS);

  onLocalSettingsChange(queue);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', resync);
  window.addEventListener('online', resync);

  const client = new RealtimeClient(`${SUPA_URL.replace(/^http/, 'ws')}/realtime/v1`, {
    params: { apikey: SUPA_KEY },
    // Asked on connect and on every heartbeat, so the socket outlives the 1h access token.
    accessToken: getFreshToken,
  });
  const channel = client
    .channel(`${TABLE}:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` }, (payload) => {
      if (!stopped && !dirty()) applyRemoteSettings(fromRow(payload.new as Row));
    })
    .subscribe((status) => {
      live = status === 'SUBSCRIBED';
      // (Re)joined: changes made while the socket was down were not delivered.
      if (live) resync();
    });

  loaded = pull();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.clearInterval(poll);
    onLocalSettingsChange(null);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', resync);
    window.removeEventListener('online', resync);
    client.removeChannel(channel);
    client.disconnect();
  };
}
