import { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { auth, db, setAuthHandlers, tokenUserId } from '../lib/supabase';
import { startSettingsSync, whenSettingsLoaded } from '../lib/settingsSync';
import { showToast } from '../components/ui/Toast';
import { offerteNr } from '../lib/offerte-docs';
import { alsReineMaterialofferte, mitGetrenntenTotals } from '../lib/ze';
import { hoechsteRechnungNr, rechnungArt, rechnungDocName } from '../lib/rechnung-totals';
import { hatFahrzeugDaten, kundeMitFahrzeug, legacyFahrzeug, sortiereFahrzeuge, splitFahrzeug } from '../lib/vehicles';
import { mitWartungsplan, profilSignatur } from '../lib/wartung';
import type { Customer, FahrzeugFelder, Order, Offerte, Rechnung, RechnungArt, MaterialCatalogItem, SyncStatus, Vehicle } from '../types';

/** Anything that belongs to a customer's vehicle: Auftrag, Offerte, Rechnung. */
type FahrzeugDok = { customerId: string; vehicleId?: string };

interface AppContextValue {
  /** Customers with the fields of their first vehicle mirrored in (lists, search, selects). */
  customers: Customer[];
  vehicles: Vehicle[];
  /** A customer's vehicles, the main (oldest) one first. */
  vehiclesOf: (customerId: string) => Vehicle[];
  /** The vehicle a document is for: its vehicleId, else the customer's first one. */
  docVehicle: (doc: FahrzeugDok) => Vehicle | undefined;
  /** The document's customer with that vehicle's fields: for PDFs and detail views. */
  docKunde: (doc: FahrzeugDok) => Customer | undefined;
  addVehicle: (customerId: string, data: FahrzeugFelder) => Promise<Vehicle>;
  updateVehicle: (v: Vehicle) => Promise<void>;
  deleteVehicle: (v: Vehicle) => Promise<void>;
  orders: Order[];
  offerten: Offerte[];
  rechnungen: Rechnung[];
  orderNum: number;
  offertNum: number;
  /** Highest number handed out per Rechnung type; each type has its own sequence. */
  rechnungNum: Record<RechnungArt, number>;
  loading: boolean;
  syncStatus: SyncStatus;
  token: string | null;
  userEmail: string | null;
  authChecked: boolean;
  sessionExpired: boolean;
  updateToken: (token: string) => void;
  addCustomer: (data: Omit<Customer, 'id' | 'createdAt'>) => Promise<string>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addOrder: (data: Pick<Order, 'customerId' | 'vehicleId' | 'beanstandungen' | 'notizen' | 'positionen' | 'offertId'>) => Promise<void>;
  updateOrder: (upd: Order, cp: Partial<Customer> | null) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addOfferte: (data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>, opts?: { offertNumber?: number }) => Promise<Offerte>;
  updateOfferte: (upd: Offerte) => Promise<Offerte>;
  deleteOfferte: (id: string) => Promise<void>;
  addRechnung: (data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>, opts?: { rechnungNumber?: number }) => Promise<Rechnung | undefined>;
  updateRechnung: (upd: Rechnung) => Promise<void>;
  deleteRechnung: (id: string) => Promise<void>;
  addMaterial: (data: Omit<MaterialCatalogItem, 'id' | 'createdAt'>) => Promise<void>;
  handleLogin: (token: string, email: string) => void;
  handleLogout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Min gap between focus/visibility-triggered refetches (focus + visibilitychange often fire together). */
const REVALIDATE_MIN_MS = 10_000;
/** Background poll while the tab is visible, so parts a Shortcut appends server-side show up in an open Offerte. */
const POLL_MS = 30_000;

function parseRows(arr: unknown[]) {
  return arr.map((r: unknown) => {
    if (!r || typeof r !== 'object') return null;
    const row = r as Record<string, unknown>;
    return (row.data as Customer | Order | Offerte | Rechnung | Vehicle) ?? (row.id ? r : null);
  }).filter(Boolean);
}

/** First row of an upsert's return=representation body, unwrapped to its payload. */
function pickRow<T>(rows: unknown): T | null {
  const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
  if (!row || typeof row !== 'object') return null;
  return (row.data as T) ?? (row.id ? (row as T) : null);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('garage_token'));
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem('garage_email'));
  const [authChecked, setAuthChecked] = useState(false);
  /* Customer rows as stored. Rows written before the vehicles table (or by an
     outdated client) may still carry vehicle fields; see legacyFahrzeug. */
  const [kunden, setKunden] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [offerten, setOfferten] = useState<Offerte[]>([]);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [orderNum, setOrderNum] = useState(0);
  const [offertNum, setOffertNum] = useState(0);
  const [rechnungNum, setRechnungNum] = useState<Record<RechnungArt, number>>({ standard: 0, anzahlung: 0, schluss: 0 });
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastSyncAt = useRef(0);
  const writesInFlight = useRef(0);
  const writeSeq = useRef(0);

  function updateToken(t: string) {
    localStorage.setItem('garage_token', t);
    setToken(t);
    setSessionExpired(false);
  }

  useEffect(() => {
    setAuthHandlers({
      onTokenRefreshed: (t) => { setToken(t); setSessionExpired(false); },
      onSessionExpired: () => setSessionExpired(true),
    });
    return () => setAuthHandlers({});
  }, []);

  useEffect(() => {
    if (!token) { setAuthChecked(true); return; }
    auth.getUser(token).then((u) => {
      if (u.error || !u.email) {
        localStorage.removeItem('garage_token'); localStorage.removeItem('garage_email');
        setToken(null); setUserEmail(null);
      }
      setAuthChecked(true);
    });
  }, []);

  /* Settings (background, active Offerte, …) live in the user's database row
     and follow them across devices. Keyed on the user id, not the token, so an
     hourly token refresh doesn't tear the realtime connection down. Declared
     before the data load below, which waits for the first settings read. */
  const userId = token ? tokenUserId(token) : null;
  useEffect(() => {
    if (!userId || !authChecked) return;
    return startSettingsSync(userId);
  }, [userId, authChecked]);

  /* Load on open/login, then silently revalidate whenever the tab regains
     focus or becomes visible again (throttled), so data edited on another
     device shows up without a manual reload. */
  useEffect(() => {
    if (!token || !authChecked) return;
    let cancelled = false;

    const sync = async () => {
      lastSyncAt.current = Date.now();
      const seq = writeSeq.current;
      const [cr, vr, or, cnt, offr, rechr] = await Promise.all([
        db.get('customers', token),
        db.get('vehicles', token).catch((e) => { console.error('[Supabase] get(vehicles):', e); return null; }),
        db.get('orders', token),
        db.getCounter(token),
        db.get('offerten', token).catch((e) => { console.error('[Supabase] get(offerten):', e); return null; }),
        db.get('rechnungen', token).catch((e) => { console.error('[Supabase] get(rechnungen):', e); return null; }),
      ]);
      // A save overlapped this fetch: the response may predate it and would revert local state.
      if (cancelled || writesInFlight.current > 0 || seq !== writeSeq.current) return;
      // db.get resolves with an error object on HTTP errors; never let that wipe good data.
      if (Array.isArray(cr)) setKunden(parseRows(cr) as Customer[]);
      if (Array.isArray(vr)) setVehicles(parseRows(vr) as Vehicle[]);
      if (Array.isArray(or)) setOrders((parseRows(or) as Order[]).map(mitGetrenntenTotals));
      setOrderNum((p) => Math.max(p, cnt));
      if (Array.isArray(offr)) {
        const offs = (parseRows(offr) as Offerte[]).map((o) => (o.art === 'material' ? alsReineMaterialofferte(o) : mitGetrenntenTotals(o)));
        setOfferten(offs);
        setOffertNum((p) => Math.max(p, ...offs.map((o) => o.offertNumber ?? 0)));
      }
      if (Array.isArray(rechr)) {
        const rechns = (parseRows(rechr) as Rechnung[]).map(mitGetrenntenTotals);
        setRechnungen(rechns);
        setRechnungNum((p) => ({
          standard: Math.max(p.standard, hoechsteRechnungNr(rechns, 'standard')),
          anzahlung: Math.max(p.anzahlung, hoechsteRechnungNr(rechns, 'anzahlung')),
          schluss: Math.max(p.schluss, hoechsteRechnungNr(rechns, 'schluss')),
        }));
      }
    };

    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSyncAt.current < REVALIDATE_MIN_MS) return;
      sync().catch((e) => console.warn('[Supabase] background refresh failed:', e));
    };

    (async () => {
      try { await Promise.all([sync(), whenSettingsLoaded()]); } catch (e) { console.error(e); }
      if (!cancelled) setLoading(false);
    })();

    const poll = window.setInterval(onWake, POLL_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [token, authChecked]);

  // fn may resolve with a value (db.upsert echoes the stored row); it's ignored here.
  async function syncOk(fn: () => Promise<unknown>) {
    setSyncStatus('saving');
    writesInFlight.current++;
    try {
      await fn();
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 2200);
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      const msg = e instanceof Error ? e.message : '';
      if (msg.toLowerCase().includes('jwt') || msg.toLowerCase().includes('expired')) {
        // Session-expired dialog already prompts re-login; skip the redundant toast.
        setSessionExpired(true);
      } else {
        showToast('Speichern fehlgeschlagen: ' + (msg || 'Unbekannter Fehler'), 'error');
      }
      throw e;
    } finally {
      writesInFlight.current--;
      writeSeq.current++;
    }
  }

  /* ── Vehicles ── */
  const vehiclesOf = useMemo(() => {
    const by = new Map<string, Vehicle[]>();
    for (const v of vehicles) by.set(v.customerId, [...(by.get(v.customerId) ?? []), v]);
    const legacy = new Map(kunden.map((c) => [c.id, legacyFahrzeug(c)]));
    return (customerId: string): Vehicle[] => {
      const own = by.get(customerId);
      if (own?.length) return sortiereFahrzeuge(own);
      const l = legacy.get(customerId);
      return l ? [l] : [];
    };
  }, [vehicles, kunden]);

  const customers = useMemo(() => kunden.map((c) => kundeMitFahrzeug(c, vehiclesOf(c.id)[0])), [kunden, vehiclesOf]);

  function docVehicle(doc: FahrzeugDok): Vehicle | undefined {
    const vs = vehiclesOf(doc.customerId);
    return vs.find((v) => v.id === doc.vehicleId) ?? vs[0];
  }

  function docKunde(doc: FahrzeugDok): Customer | undefined {
    const c = kunden.find((x) => x.id === doc.customerId);
    return c && kundeMitFahrzeug(c, docVehicle(doc));
  }

  const legacyMigriert = useRef(new Set<string>());
  const upsertVehicle = (v: Vehicle) => db.upsert('vehicles', { id: v.id, customer_id: v.customerId, data: v }, token!);

  /** A customer row still holding vehicle fields gets its vehicle stored and the
      fields removed, before anything else changes that customer's vehicles.
      Returns the vehicle it stored, if any. */
  async function migrateLegacy(customerId: string): Promise<Vehicle | null> {
    const c = kunden.find((x) => x.id === customerId);
    const legacy = c && legacyFahrzeug(c);
    // Chained calls within one action still see the state from before the migration.
    if (!c || !legacy || legacyMigriert.current.has(customerId)) return null;
    const stored = vehicles.some((v) => v.customerId === customerId);
    const bereinigt = splitFahrzeug(c).kunde as Customer;
    await syncOk(async () => {
      if (!stored) await upsertVehicle(legacy);
      await db.upsert('customers', { id: c.id, data: bereinigt }, token!);
    });
    legacyMigriert.current.add(customerId);
    if (!stored) setVehicles((p) => (p.some((x) => x.id === legacy.id) ? p : [...p, legacy]));
    setKunden((p) => p.map((x) => (x.id === customerId ? bereinigt : x)));
    return stored ? null : legacy;
  }

  async function addVehicle(customerId: string, data: FahrzeugFelder): Promise<Vehicle> {
    await migrateLegacy(customerId);
    const v = mitWartungsplan({ ...data, id: `v_${Date.now()}`, customerId, createdAt: new Date().toISOString() });
    await syncOk(() => upsertVehicle(v));
    setVehicles((p) => [...p, v]);
    return v;
  }

  async function updateVehicle(neu: Vehicle) {
    const vorher = vehiclesOf(neu.customerId).find((x) => x.id === neu.id);
    await migrateLegacy(neu.customerId);
    // Changed technical data (Marke, Modell, Antrieb, Getriebe, VIN, …): the
    // Wartungsplan is matched to the vehicle's new profile.
    const v = vorher && profilSignatur(vorher) !== profilSignatur(neu) ? mitWartungsplan(neu, vorher) : neu;
    await syncOk(() => upsertVehicle(v));
    setVehicles((p) => (p.some((x) => x.id === v.id) ? p.map((x) => (x.id === v.id ? v : x)) : [...p, v]));
  }

  async function deleteVehicle(v: Vehicle) {
    await migrateLegacy(v.customerId);
    await syncOk(() => db.delete('vehicles', v.id, token!));
    setVehicles((p) => p.filter((x) => x.id !== v.id));
  }

  /* ── Customers ── */
  // Vehicle fields in `data` (new-customer form, PDF import) become the first vehicle.
  async function addCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<string> {
    const id = `c_${Date.now()}`;
    const { kunde, fahrzeug } = splitFahrzeug(data);
    const newC = { id, ...kunde, createdAt: new Date().toISOString() } as Customer;
    await syncOk(() => db.upsert('customers', { id, data: newC }, token!));
    setKunden((p) => [...p, newC]);
    if (fahrzeug && hatFahrzeugDaten(fahrzeug)) {
      const v = mitWartungsplan({ ...fahrzeug, id: `v_${Date.now()}`, customerId: id, createdAt: newC.createdAt });
      await syncOk(() => upsertVehicle(v));
      setVehicles((p) => [...p, v]);
    }
    return id;
  }

  // Vehicle fields in `data` update the customer's first vehicle (or create it).
  async function updateCustomer(id: string, data: Partial<Customer>) {
    const { kunde, fahrzeug } = splitFahrzeug(data);
    const migrated = await migrateLegacy(id);
    const updated = { ...splitFahrzeug(kunden.find((c) => c.id === id)!).kunde, ...kunde } as Customer;
    await syncOk(() => db.upsert('customers', { id, data: updated }, token!));
    setKunden((p) => p.map((c) => (c.id === id ? updated : c)));
    if (!fahrzeug) return;
    const first = migrated ?? sortiereFahrzeuge(vehicles.filter((v) => v.customerId === id))[0];
    if (first) await updateVehicle({ ...first, ...fahrzeug });
    else if (hatFahrzeugDaten(fahrzeug)) await addVehicle(id, fahrzeug);
  }

  async function deleteCustomer(id: string) {
    // Its vehicles go with it (on delete cascade).
    await syncOk(() => db.delete('customers', id, token!));
    setKunden((p) => p.filter((c) => c.id !== id));
    setVehicles((p) => p.filter((v) => v.customerId !== id));
  }

  async function addOrder(data: Pick<Order, 'customerId' | 'vehicleId' | 'beanstandungen' | 'notizen' | 'positionen' | 'offertId'>) {
    const num = orderNum + 1;
    const newO: Order = { id: `o_${Date.now()}`, orderNumber: num, status: 'aufnahme', statusChangedAt: new Date().toISOString(), createdAt: new Date().toISOString(), ...data };
    await syncOk(async () => { await db.upsert('orders', { id: newO.id, data: newO }, token!); await db.setCounter(num, token!); });
    setOrders((p) => [...p, newO]); setOrderNum(num);
  }

  async function updateOrder(upd: Order, cp: Partial<Customer> | null) {
    await syncOk(() => db.upsert('orders', { id: upd.id, data: upd }, token!));
    setOrders((p) => p.map((o) => (o.id === upd.id ? upd : o)));
    if (!cp) return;
    // Vehicle fields edited in the Auftrag belong to the Auftrag's vehicle.
    const { kunde, fahrzeug } = splitFahrzeug(cp);
    if (Object.keys(kunde).length) await updateCustomer(upd.customerId, kunde);
    if (!fahrzeug) return;
    const v = docVehicle(upd);
    if (v) await updateVehicle({ ...v, ...fahrzeug });
    else if (hatFahrzeugDaten(fahrzeug)) await addVehicle(upd.customerId, fahrzeug);
  }

  async function deleteOrder(id: string) {
    await syncOk(() => db.delete('orders', id, token!));
    setOrders((p) => p.filter((o) => o.id !== id));
  }

  // opts.offertNumber reuses an existing number for a new version (e.g. "12_2").
  async function addOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>, opts?: { offertNumber?: number }): Promise<Offerte> {
    // offertNum can lag behind the loaded rows (e.g. the offerten fetch failed on
    // startup), which would hand out a number that already exists — take both maxima.
    const num = opts?.offertNumber ?? Math.max(offertNum, ...offerten.map((o) => o.offertNumber ?? 0)) + 1;
    const newOff: Offerte = { id: `off_${Date.now()}`, offertNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    let saved = newOff;
    await syncOk(async () => {
      const rows = await db.upsert('offerten', { id: newOff.id, data: newOff }, token!);
      saved = pickRow<Offerte>(rows) ?? newOff;
    });
    setOfferten((p) => [...p, saved]); setOffertNum((p) => Math.max(p, saved.offertNumber ?? num));
    showToast(`Offerte #${offerteNr(saved)} gespeichert`, 'success');
    return saved;
  }

  // Returns the row as the database stored it, so callers re-point their local
  // snapshots at the persisted object instead of the optimistic payload.
  async function updateOfferte(upd: Offerte): Promise<Offerte> {
    let saved = upd;
    await syncOk(async () => {
      const rows = await db.upsert('offerten', { id: upd.id, data: upd }, token!);
      saved = pickRow<Offerte>(rows) ?? upd;
    });
    setOfferten((p) => p.map((o) => (o.id === saved.id ? saved : o)));
    // A manually raised number moves the sequence on, so the next one stays unique.
    setOffertNum((p) => Math.max(p, saved.offertNumber ?? 0));
    return saved;
  }

  async function deleteOfferte(id: string) {
    await syncOk(() => db.delete('offerten', id, token!));
    setOfferten((p) => p.filter((o) => o.id !== id));
  }

  async function addRechnung(data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>, opts?: { rechnungNumber?: number }): Promise<Rechnung | undefined> {
    // Each type (Rechnung / Anzahlungs- / Schlussrechnung) counts on its own. Like
    // addOfferte: take both maxima in case the counter lags behind the loaded rows.
    const art = rechnungArt(data);
    const num = opts?.rechnungNumber ?? Math.max(rechnungNum[art], hoechsteRechnungNr(rechnungen, art)) + 1;
    const newR: Rechnung = { id: `r_${Date.now()}`, rechnungNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    try {
      await syncOk(() => db.upsert('rechnungen', { id: newR.id, data: newR }, token!));
    } catch { return; }
    setRechnungen((p) => [...p, newR]); setRechnungNum((p) => ({ ...p, [art]: Math.max(p[art], num) }));
    showToast(`${rechnungDocName(newR)} #${num} gespeichert`, 'success');
    return newR;
  }

  async function updateRechnung(upd: Rechnung) {
    await syncOk(() => db.upsert('rechnungen', { id: upd.id, data: upd }, token!));
    setRechnungen((p) => p.map((r) => (r.id === upd.id ? upd : r)));
    const art = rechnungArt(upd);
    setRechnungNum((p) => ({ ...p, [art]: Math.max(p[art], upd.rechnungNumber ?? 0) }));
  }

  async function deleteRechnung(id: string) {
    await syncOk(() => db.delete('rechnungen', id, token!));
    setRechnungen((p) => p.filter((r) => r.id !== id));
  }

  async function addMaterial(data: Omit<MaterialCatalogItem, 'id' | 'createdAt'>) {
    const newM: MaterialCatalogItem = { id: `mat_${Date.now()}`, createdAt: new Date().toISOString(), ...data };
    await syncOk(() => db.upsert('materials', { id: newM.id, data: newM }, token!));
    showToast(`"${newM.beschreibung}" im Materialkatalog gespeichert`, 'success');
  }

  function handleLogin(t: string, e: string) {
    setToken(t); setUserEmail(e); setLoading(true);
  }

  async function handleLogout() {
    if (!window.confirm('Abmelden?')) return;
    await auth.signOut(token!);
    localStorage.removeItem('garage_token'); localStorage.removeItem('garage_email');
    setToken(null); setUserEmail(null); setKunden([]); setVehicles([]); setOrders([]);
  }

  return (
    <AppContext.Provider value={{ customers, vehicles, vehiclesOf, docVehicle, docKunde, addVehicle, updateVehicle, deleteVehicle, orders, offerten, rechnungen, orderNum, offertNum, rechnungNum, loading, syncStatus, token, userEmail, authChecked, sessionExpired, updateToken, addCustomer, updateCustomer, deleteCustomer, addOrder, updateOrder, deleteOrder, addOfferte, updateOfferte, deleteOfferte, addRechnung, updateRechnung, deleteRechnung, addMaterial, handleLogin, handleLogout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
