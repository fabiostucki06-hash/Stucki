export const SUPA_URL = 'https://xpggpkmqwescbcrnnpod.supabase.co';

const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwZ2dwa21xd2VzY2Jjcm5ucG9kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NjIxMjIsImV4cCI6MjA5NjEzODEyMn0.egPJ4OYOegRKIBV6PHUz_VfRib8g7sVIcNNy_7bFxjg';

export const ASSETS = {
  wallpaper:  `${SUPA_URL}/storage/v1/object/public/wallpaper/mac_wallpaper.png`,
  wallpaper1: `${SUPA_URL}/storage/v1/object/public/wallpaper/mac_wallpaper_1.png`,
  wallpaper2: `${SUPA_URL}/storage/v1/object/public/wallpaper/mac_wallpaper_2.png`,
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
};

type StorageItem = { name: string; id?: string | null };

async function listBucket(bucket: string, prefix: string): Promise<StorageItem[]> {
  const r = await fetch(`${SUPA_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: h(),
    body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
  });
  if (!r.ok) return [];
  return r.json();
}

export const storage = {
  /** Lists the bucket (and one level of subfolders) and returns the first file found. */
  async fetchTemplate(bucket: string): Promise<ArrayBuffer> {
    const rootItems = await listBucket(bucket, '');

    const isRealFile = (f: StorageItem) => f.id != null && f.name.endsWith('.xlsx');

    // real files have a non-null id; folders have id === null
    let file = rootItems.find(isRealFile);

    // if nothing at root, check inside each subfolder
    if (!file) {
      for (const folder of rootItems.filter(f => f.id == null)) {
        const subItems = await listBucket(bucket, folder.name + '/');
        file = subItems.find(isRealFile);
        if (file) { file = { ...file, name: folder.name + '/' + file.name }; break; }
      }
    }

    if (!file) throw new Error(`Keine Excel-Vorlage in Bucket "${bucket}" gefunden`);

    const encodedPath = file.name.split('/').map(encodeURIComponent).join('/');
    const fileRes = await fetch(`${SUPA_URL}/storage/v1/object/public/${bucket}/${encodedPath}`);
    if (!fileRes.ok) throw new Error(`Vorlage "${file.name}" konnte nicht geladen werden (HTTP ${fileRes.status})`);
    return fileRes.arrayBuffer();
  },
};

export const db = {
  async get(table: string, token: string) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*`, { headers: h(token) });
    const j = await r.json();
    if (!r.ok) console.error(`[Supabase] get("${table}") HTTP ${r.status}:`, j);
    return j;
  },
  async upsert(table: string, obj: Record<string, unknown>, token: string) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...h(token), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(obj),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as Record<string, string>));
      console.error(`[Supabase] upsert("${table}") HTTP ${r.status}:`, e);
      throw new Error(e.message || e.hint || `HTTP ${r.status}${e.code ? ' (' + e.code + ')' : ''}`);
    }
  },
  async delete(table: string, id: string, token: string) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: h(token),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({} as Record<string, string>));
      throw new Error(e.message || e.hint || `HTTP ${r.status}`);
    }
  },
  async getCounter(token: string): Promise<number> {
    const r = await fetch(`${SUPA_URL}/rest/v1/counters?id=eq.orderNum&select=value`, { headers: h(token) });
    const d = await r.json();
    return d[0]?.value ?? 0;
  },
  async setCounter(val: number, token: string) {
    await fetch(`${SUPA_URL}/rest/v1/counters?id=eq.orderNum`, {
      method: 'PATCH',
      headers: h(token),
      body: JSON.stringify({ value: val }),
    });
  },
};
