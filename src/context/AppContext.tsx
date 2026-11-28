import { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { auth, db, setAuthHandlers, tokenUserId, type DocTable } from '../lib/supabase';
import { naechsteNr, kleinsteFreieNr, neueDokId } from '../lib/nummern';
import { startSettingsSync, whenSettingsLoaded } from '../lib/settingsSync';
import { showToast } from '../components/ui/Toast';
import { offerteNr } from '../lib/offerte-docs';
import { alsReineMaterialofferte, mitGetrenntenTotals } from '../lib/ze';
import { hoechsteRechnungNr, rechnungArt, rechnungDocName } from '../lib/rechnung-totals';
import { hatFahrzeugDaten, kundeMitFahrzeug, legacyFahrzeug, sortiereFahrzeuge, splitFahrzeug } from '../lib/vehicles';
import { inspektionWieOel, mitWartungsplan, profilSignatur } from '../lib/wartung';
import { ohneInspektionIntervall, teileAusOfferte, teilKey } from '../lib/wartung-teile';
import { zeLernen, type ZeQuelle } from '../lib/ze-memory';
import type { Customer, FahrzeugFelder, Order, Offerte, Rechnung, RechnungArt, MaterialCatalogItem, SyncStatus, Vehicle, WartungSpec, WartungTeile, ZeEintrag, Position } from '../types';

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
  /** Intervals checked against the OEM schedule, per Motorkennbuchstabe (lib/wartung). */
  wartungSpecs: WartungSpec[];
  saveWartungSpec: (s: WartungSpec) => Promise<void>;
  /** Positions entered per Wartungsplan item (lib/wartung-teile); stored
      automatically when an Offerte from the Wartungsplan is saved. */
  wartungTeile: WartungTeile[];
  /** Stores (or with `null` removes) the parts of one vehicle's Wartungsplan
      item, entered directly in the Wartungsplan. Rejects when the write failed. */
  wartungTeileSetzen: (id: string, t: WartungTeile | null) => Promise<void>;
  /** ZE entered for a task on a vehicle configuration (lib/ze-memory); learned
      automatically whenever an Offerte, Rechnung or the Wartungsplan is saved. */
  zeEintraege: ZeEintrag[];
  orders: Order[];
  offerten: Offerte[];
  rechnungen: Rechnung[];
  /** Next free number (MAX + 1) from the database; Rechnung types count separately. */
  naechsteNummer: (table: DocTable, art?: RechnungArt) => Promise<number>;
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
  const [wartungSpecs, setWartungSpecs] = useState<WartungSpec[]>([]);
  const [wartungTeile, setWartungTeile] = useState<WartungTeile[]>([]);
  // Latest rows for the comparison in teileMerken (called from save chains that may hold an old render).
  const teileRef = useRef<WartungTeile[]>([]);
  teileRef.current = wartungTeile;
  const [zeEintraege, setZeEintraege] = useState<ZeEintrag[]>([]);
  const zeRef = useRef<ZeEintrag[]>([]);
  zeRef.current = zeEintraege;
  const zeFehlerGemeldet = useRef(false);
  const zeTabelleFehlt = useRef(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [offerten, setOfferten] = useState<Offerte[]>([]);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
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
      const [cr, vr, or, offr, rechr, specr, teiler, zer] = await Promise.all([
        db.get('customers', token),
        db.get('vehicles', token).catch((e) => { console.error('[Supabase] get(vehicles):', e); return null; }),
        db.get('orders', token),
        db.get('offerten', token).catch((e) => { console.error('[Supabase] get(offerten):', e); return null; }),
        db.get('rechnungen', token).catch((e) => { console.error('[Supabase] get(rechnungen):', e); return null; }),
        db.get('maintenance_specs', token).catch((e) => { console.error('[Supabase] get(maintenance_specs):', e); return null; }),
        db.get('maintenance_parts', token).catch((e) => { console.error('[Supabase] get(maintenance_parts):', e); return null; }),
        db.get('ze_memory', token).catch((e) => { console.error('[Supabase] get(ze_memory):', e); return null; }),
      ]);
      // A save overlapped this fetch: the response may predate it and would revert local state.
      if (cancelled || writesInFlight.current > 0 || seq !== writeSeq.current) return;
      // db.get resolves with an error object on HTTP errors; never let that wipe good data.
      if (Array.isArray(cr)) setKunden(parseRows(cr) as Customer[]);
      // Every plan shows its Inspektion with the oil change's interval; stored with the next save.
      if (Array.isArray(vr)) setVehicles((parseRows(vr) as Vehicle[]).map((v) => (v.service?.length ? { ...v, service: inspektionWieOel(v.service) } : v)));
      if (Array.isArray(specr)) setWartungSpecs(parseRows(specr) as unknown as WartungSpec[]);
      // Per-vehicle rows only (lib/wartung-teile): parts never move to another vehicle.
      if (Array.isArray(teiler)) setWartungTeile((parseRows(teiler) as unknown as WartungTeile[]).filter((t) => t.id.startsWith('fz:')));
      if (Array.isArray(zer)) setZeEintraege((parseRows(zer) as unknown as ZeEintrag[]).filter((e) => e?.id?.startsWith('ze|') && e.fz));
      if (Array.isArray(or)) setOrders((parseRows(or) as Order[]).map(mitGetrenntenTotals));
      if (Array.isArray(offr)) {
        setOfferten((parseRows(offr) as Offerte[]).map((o) => ohneInspektionIntervall(o.art === 'material' ? alsReineMaterialofferte(o) : mitGetrenntenTotals(o))));
      }
      if (Array.isArray(rechr)) setRechnungen((parseRows(rechr) as Rechnung[]).map(mitGetrenntenTotals));
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
    const v = mitWartungsplan({ ...data, id: `v_${Date.now()}`, customerId, createdAt: new Date().toISOString() }, undefined, wartungSpecs);
    await syncOk(() => upsertVehicle(v));
    setVehicles((p) => [...p, v]);
    return v;
  }

  async function updateVehicle(neu: Vehicle) {
    const vorher = vehiclesOf(neu.customerId).find((x) => x.id === neu.id);
    await migrateLegacy(neu.customerId);
    // Changed technical data (Marke, Modell, Antrieb, Getriebe, VIN, …): the
    // Wartungsplan is matched to the vehicle's new profile.
    const m = vorher && profilSignatur(vorher, wartungSpecs) !== profilSignatur(neu, wartungSpecs) ? mitWartungsplan(neu, vorher, wartungSpecs) : neu;
    // A changed oil-change interval (by hand, check, research) carries over to the Inspektion.
    const v = m.service?.length ? { ...m, service: inspektionWieOel(m.service) } : m;
    await syncOk(() => upsertVehicle(v));
    setVehicles((p) => (p.some((x) => x.id === v.id) ? p.map((x) => (x.id === v.id ? v : x)) : [...p, v]));
    // The Inspektion's ZE set in the Wartungsplan: offered for the same vehicle configuration.
    const inspektion: Position[] = (v.service ?? [])
      .filter((it) => teilKey(it) === 'inspektion' && it.arbeitZe)
      .map((it) => ({ typ: 'arbeit', beschreibung: it.name, ze: it.arbeitZe!, stundenansatz: '', preis: '' }));
    void zeMerken(inspektion, v, { art: 'wartungsplan' });
  }

  async function deleteVehicle(v: Vehicle) {
    await migrateLegacy(v.customerId);
    await syncOk(() => db.delete('vehicles', v.id, token!));
    setVehicles((p) => p.filter((x) => x.id !== v.id));
  }

  /** Stores an interval checked for an engine; vehicles with that
      Motorkennbuchstabe pick it up when their plan is matched. */
  async function saveWartungSpec(spec: WartungSpec) {
    const s: WartungSpec = { ...spec, geprueftVon: spec.geprueftVon ?? userEmail ?? undefined };
    await syncOk(() => db.upsert('maintenance_specs', { id: s.id, data: s, updated_at: new Date().toISOString() }, token!));
    setWartungSpecs((p) => [...p.filter((x) => x.id !== s.id), s]);
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
      const v = mitWartungsplan({ ...fahrzeug, id: `v_${Date.now()}`, customerId: id, createdAt: newC.createdAt }, undefined, wartungSpecs);
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
    const newO: Order = { id: neueDokId('o'), orderNumber: naechsteNr(orders.map((o) => o.orderNumber)), status: 'aufnahme', statusChangedAt: new Date().toISOString(), createdAt: new Date().toISOString(), ...data };
    let saved = newO;
    await syncOk(async () => { saved = await db.createDocument('orders', newO.id, newO, true, token!); });
    setOrders((p) => [...p, saved]);
  }

  const naechsteNummer = (table: DocTable, art: RechnungArt = 'standard') => db.nextNumber(table, art, token!);

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

  // opts.offertNumber keeps that number (manual entry, or a new version like "12_2");
  // without it the database assigns the next one.
  async function addOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>, opts?: { offertNumber?: number }): Promise<Offerte> {
    const num = opts?.offertNumber ?? kleinsteFreieNr(offerten.map((o) => o.offertNumber));
    const newOff: Offerte = { id: neueDokId('off'), offertNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    let saved = newOff;
    await syncOk(async () => {
      saved = await db.createDocument('offerten', newOff.id, newOff, opts?.offertNumber == null, token!);
    });
    setOfferten((p) => [...p, saved]);
    showToast(`Offerte #${offerteNr(saved)} gespeichert`, 'success');
    void zeAusDokument(saved, 'offerte');
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
    void teileMerken(saved);
    void zeAusDokument(saved, 'offerte');
    return saved;
  }

  /** Offerte from the Wartungsplan saved: the positions entered per item are
      stored for the next one of the same vehicle (only rows that changed);
      items whose stored lines were removed in it are cleared. The Offerte is
      saved already, so a failure here is reported but doesn't fail the save. */
  async function teileMerken(o: Offerte) {
    if (!o.wartung) return;
    const v = vehicles.find((x) => x.id === o.wartung!.vehicleId);
    const { speichern, loeschen } = teileAusOfferte(o, v, teileRef.current, userEmail ?? undefined);
    if (!speichern.length && !loeschen.length) return;
    const vorher = teileRef.current;
    teileRef.current = [...vorher.filter((t) => !loeschen.includes(t.id) && !speichern.some((r) => r.id === t.id)), ...speichern];
    setWartungTeile(teileRef.current);
    try {
      for (const r of speichern) await db.upsert('maintenance_parts', { id: r.id, data: r, updated_at: r.updatedAt }, token!);
      for (const id of loeschen) await db.delete('maintenance_parts', id, token!);
    } catch (e) {
      console.error('[Supabase] maintenance_parts:', e);
      // Back to the stored rows, so the next save of the Offerte tries again.
      teileRef.current = vorher;
      setWartungTeile(vorher);
      showToast('Teile für den Wartungsplan nicht gespeichert', 'error');
    }
  }

  /** Learns the ZE entered in a document's lines for its vehicle. A Materialofferte carries no ZE. */
  function zeAusDokument(d: Offerte | Rechnung, art: 'offerte' | 'rechnung') {
    if ((d as Offerte).art === 'material' || !d.positionen?.length) return;
    const nr = art === 'offerte' ? `Offerte #${offerteNr(d as Offerte)}` : `${rechnungDocName(d as Rechnung)} #${(d as Rechnung).rechnungNumber}`;
    return zeMerken(d.positionen, docVehicle(d), { art, id: d.id, nr });
  }

  /** Stores new / changed ZE entries (lib/ze-memory). The document itself is
      saved already: a failure is reported once and retried with the next save. */
  async function zeMerken(positionen: Position[], v: Vehicle | undefined, quelle: ZeQuelle) {
    const neu = zeLernen(positionen, v, zeRef.current, quelle, userEmail ?? undefined);
    if (!neu.length || !token || zeTabelleFehlt.current) return;
    const vorher = zeRef.current;
    zeRef.current = [...vorher.filter((e) => !neu.some((n) => n.id === e.id)), ...neu];
    setZeEintraege(zeRef.current);
    try {
      for (const e of neu) await db.upsert('ze_memory', { id: e.id, data: e, updated_at: e.updatedAt }, token);
    } catch (e) {
      zeRef.current = vorher;
      setZeEintraege(vorher);
      // Table not created yet (migration 20261128100000): ZE stay unlearned, no error per save.
      if (/ze_memory|schema cache|PGRST205|42P01/i.test(String(e))) {
        console.warn('[Supabase] table ze_memory missing – ZE are not learned until the migration is applied.');
        zeTabelleFehlt.current = true;
        return;
      }
      console.error('[Supabase] ze_memory:', e);
      if (!zeFehlerGemeldet.current) showToast('ZE für spätere Offerten nicht gespeichert', 'error');
      zeFehlerGemeldet.current = true;
    }
  }

  async function wartungTeileSetzen(id: string, t: WartungTeile | null) {
    // Only vehicle-scoped rows: `fz:<vehicleId>:<key>` of exactly that vehicle.
    if (!id.startsWith('fz:') || (t && (t.id !== id || id !== `fz:${t.vehicleId}:${t.key}`))) throw new Error('ungültige Teile-ID');
    const vorher = teileRef.current;
    teileRef.current = [...vorher.filter((x) => x.id !== id), ...(t ? [t] : [])];
    setWartungTeile(teileRef.current);
    try {
      if (t) await db.upsert('maintenance_parts', { id, data: t, updated_at: t.updatedAt }, token!);
      else if (vorher.some((x) => x.id === id)) await db.delete('maintenance_parts', id, token!);
    } catch (e) {
      console.error('[Supabase] maintenance_parts:', e);
      teileRef.current = vorher;
      setWartungTeile(vorher);
      showToast('Material für den Wartungsplan nicht gespeichert', 'error');
      throw e;
    }
    // Material with its ZE entered on the vehicle: offered for the same configuration.
    if (t) void zeMerken(t.positionen.filter((p) => p.typ === 'material'), vehicles.find((x) => x.id === t.vehicleId), { art: 'wartungsplan' });
  }

  async function deleteOfferte(id: string) {
    await syncOk(() => db.delete('offerten', id, token!));
    setOfferten((p) => p.filter((o) => o.id !== id));
  }

  async function addRechnung(data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>, opts?: { rechnungNumber?: number }): Promise<Rechnung | undefined> {
    // Each type (Rechnung / Anzahlungs- / Schlussrechnung) counts on its own.
    const num = opts?.rechnungNumber ?? hoechsteRechnungNr(rechnungen, rechnungArt(data)) + 1;
    const newR: Rechnung = { id: neueDokId('r'), rechnungNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    let saved = newR;
    try {
      await syncOk(async () => {
        saved = await db.createDocument('rechnungen', newR.id, newR, opts?.rechnungNumber == null, token!);
      });
    } catch { return; }
    setRechnungen((p) => [...p, saved]);
    void zeAusDokument(saved, 'rechnung');
    showToast(`${rechnungDocName(saved)} #${saved.rechnungNumber} gespeichert`, 'success');
    return saved;
  }

  async function updateRechnung(upd: Rechnung) {
    await syncOk(() => db.upsert('rechnungen', { id: upd.id, data: upd }, token!));
    setRechnungen((p) => p.map((r) => (r.id === upd.id ? upd : r)));
    void zeAusDokument(upd, 'rechnung');
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
    setToken(null); setUserEmail(null); setKunden([]); setVehicles([]); setOrders([]); setZeEintraege([]);
  }

  return (
    <AppContext.Provider value={{ customers, vehicles, vehiclesOf, docVehicle, docKunde, addVehicle, updateVehicle, deleteVehicle, wartungSpecs, saveWartungSpec, wartungTeile, wartungTeileSetzen, zeEintraege, orders, offerten, rechnungen, naechsteNummer, loading, syncStatus, token, userEmail, authChecked, sessionExpired, updateToken, addCustomer, updateCustomer, deleteCustomer, addOrder, updateOrder, deleteOrder, addOfferte, updateOfferte, deleteOfferte, addRechnung, updateRechnung, deleteRechnung, addMaterial, handleLogin, handleLogout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
