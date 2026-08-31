export const SUPA_URL = 'https://xpggpkmqwescbcrnnpod.supabase.co';

const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ2dwa21xd2VzY2Jjcm5ucG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjIxMjIsImV4cCI6MjA5NjEzODEyMn0.egPJ4OYOegRKIBV6PHUz_VfRib8g7sVIcNNy_7bFxjg';

export const ASSETS = {
  wallpaper:  `${SUPA_URL}/storage/v1/object/public/wallpaper/mac_wallpaper.png`,
  wallpaper1: `${SUPA_URL}/storage/v1/object/public/wallpaper/mac_wallpaper_1.png`,
  wallpaper2: `${SUPA_URL}/storage/v1/object/public/wallpaper/mac_wallpaper_2.png`,
  wallpaper3: `${SUPA_URL}/storage/v1/object/public/wallpaper/${encodeURIComponent('wallpaper 3 (1).jpg')}`,
  logo:       `${SUPA_URL}/storage/v1/object/public/logo/Gemini_Generated_Image_.png`,
  iconImage:  `${SUPA_URL}/storage/v1/object/public/assets/icon_image.jpg`,
};

const h = (token?: string | null): Record<string, string> => ({
  'Content-Type': 'application/json',
  apikey: SUPA_KEY,
  Authorization: `Bearer ${token ?? SUPA_KEY}`,
});

export const auth = {
  async signIn(email: string, password: string) {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },
  async signOut(token: string) {
    await fetch(`${SUPA_URL}/auth/v1/logout`, { method: 'POST', headers: h(token) });
  },
  async getUser(token: string) {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: h(token) });
    return r.json();
  },
  async refresh(refreshToken: string) {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return r.json();
  },
};

/* ── Session auto-refresh ──
   Every db.* call runs through authedFetch(), which (1) proactively refreshes
   the access token if it's about to expire, and (2) on a 401 "JWT expired"
   response retries once with a freshly refreshed token. Only if refresh
   itself fails (refresh token missing/expired) do we surface a session-expired
   state via onSessionExpired, instead of throwing straight to the UI. */

type AuthHandlers = {
  onTokenRefreshed?: (token: string) => void;
  onSessionExpired?: () => void;
};
let handlers: AuthHandlers = {};

export function setAuthHandlers(h: AuthHandlers) {
  handlers = h;
}

function decodeExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

function isExpiringSoon(token: string, marginSec = 30): boolean {
  const exp = decodeExp(token);
  if (exp == null) return false;
  return Date.now() / 1000 >= exp - marginSec;
}

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = localStorage.getItem('garage_refresh');
      if (!rt) return null;
      try {
        const res = await auth.refresh(rt);
        if (res.access_token) {
          localStorage.setItem('garage_token', res.access_token);
          if (res.refresh_token) localStorage.setItem('garage_refresh', res.refresh_token);
          handlers.onTokenRefreshed?.(res.access_token);
          return res.access_token as string;
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

function isJwtExpiredBody(body: unknown): boolean {
  const msg = ((body as Record<string, string>)?.message || (body as Record<string, string>)?.msg || '').toLowerCase();
  return msg.includes('jwt') || msg.includes('expired');
}

async function authedFetch(url: string, init: RequestInit, token: string, extraHeaders?: Record<string, string>): Promise<Response> {
  let activeToken = token;
  if (isExpiringSoon(activeToken)) {
    const fresh = await doRefresh();
    if (fresh) activeToken = fresh;
  }

  let res = await fetch(url, { ...init, headers: { ...h(activeToken), ...extraHeaders } });

  if (res.status === 401) {
    const body = await res.clone().json().catch(() => ({}));
    if (isJwtExpiredBody(body)) {
      const fresh = await doRefresh();
      if (fresh) {
        res = await fetch(url, { ...init, headers: { ...h(fresh), ...extraHeaders } });
      } else {
        handlers.onSessionExpired?.();
      }
    }
  }

  return res;
}

export const db = {
  async get(table: string, token: string) {
    const r = await authedFetch(`${SUPA_URL}/rest/v1/${table}?select=*`, {}, token);
    const j = await r.json();
    if (!r.ok) console.error(`[Supabase] get("${table}") HTTP ${r.status}:`, j);
    return j;
  },
  async upsert(table: string, obj: Record<string, unknown>, token: string) {
    const r = await authedFetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST',
      body: JSON.stringify(obj),
    }, token, { Prefer: 'resolution=merge-duplicates' });
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as Record<string, string>));
      console.error(`[Supabase] upsert("${table}") HTTP ${r.status}:`, e);
      throw new Error(e.message || e.hint || `HTTP ${r.status}${e.code ? ' (' + e.code + ')' : ''}`);
    }
  },
  async delete(table: string, id: string, token: string) {
    const r = await authedFetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }, token);
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as Record<string, string>));
      throw new Error(e.message || e.hint || `HTTP ${r.status}`);
    }
  },
  async getCounter(token: string): Promise<number> {
    const r = await authedFetch(`${SUPA_URL}/rest/v1/counters?id=eq.orderNum&select=value`, {}, token);
    const d = await r.json();
    return d[0]?.value ?? 0;
  },
  async setCounter(val: number, token: string) {
    await authedFetch(`${SUPA_URL}/rest/v1/counters?id=eq.orderNum`, {
      method: 'PATCH',
      body: JSON.stringify({ value: val }),
    }, token);
  },
};
