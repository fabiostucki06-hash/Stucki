import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { auth, db, setAuthHandlers } from '../lib/supabase';
import { showToast } from '../components/ui/Toast';
import type { Customer, Order, Offerte, Rechnung, SyncStatus } from '../types';

interface AppContextValue {
  customers: Customer[];
  orders: Order[];
  offerten: Offerte[];
  rechnungen: Rechnung[];
  orderNum: number;
  offertNum: number;
  rechnungNum: number;
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
  addOrder: (data: Pick<Order, 'customerId' | 'beanstandungen' | 'notizen' | 'positionen' | 'offertId'>) => Promise<void>;
  updateOrder: (upd: Order, cp: Partial<Customer> | null) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addOfferte: (data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>) => Promise<Offerte>;
  updateOfferte: (upd: Offerte) => Promise<void>;
  deleteOfferte: (id: string) => Promise<void>;
  addRechnung: (data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>) => Promise<void>;
  updateRechnung: (upd: Rechnung) => Promise<void>;
  deleteRechnung: (id: string) => Promise<void>;
  handleLogin: (token: string, email: string) => void;
  handleLogout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Min gap between focus/visibility-triggered refetches (focus + visibilitychange often fire together). */
const REVALIDATE_MIN_MS = 10_000;

function parseRows(arr: unknown[]) {
  return arr.map((r: unknown) => {
    if (!r || typeof r !== 'object') return null;
    const row = r as Record<string, unknown>;
    return (row.data as Customer | Order | Offerte | Rechnung) ?? (row.id ? r : null);
  }).filter(Boolean);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('garage_token'));
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem('garage_email'));
  const [authChecked, setAuthChecked] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [offerten, setOfferten] = useState<Offerte[]>([]);
  const [rechnungen, setRechnungen] = useState<Rechnung[]>([]);
  const [orderNum, setOrderNum] = useState(0);
  const [offertNum, setOffertNum] = useState(0);
  const [rechnungNum, setRechnungNum] = useState(0);
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

  /* Load on open/login, then silently revalidate whenever the tab regains
     focus or becomes visible again (throttled), so data edited on another
     device shows up without a manual reload. */
  useEffect(() => {
    if (!token || !authChecked) return;
    let cancelled = false;

    const sync = async () => {
      lastSyncAt.current = Date.now();
      const seq = writeSeq.current;
      const [cr, or, cnt, offr, rechr] = await Promise.all([
        db.get('customers', token),
        db.get('orders', token),
        db.getCounter(token),
        db.get('offerten', token).catch((e) => { console.error('[Supabase] get(offerten):', e); return null; }),
        db.get('rechnungen', token).catch((e) => { console.error('[Supabase] get(rechnungen):', e); return null; }),
      ]);
      // A save overlapped this fetch: the response may predate it and would revert local state.
      if (cancelled || writesInFlight.current > 0 || seq !== writeSeq.current) return;
      // db.get resolves with an error object on HTTP errors; never let that wipe good data.
      if (Array.isArray(cr)) setCustomers(parseRows(cr) as Customer[]);
      if (Array.isArray(or)) setOrders(parseRows(or) as Order[]);
      setOrderNum((p) => Math.max(p, cnt));
      if (Array.isArray(offr)) {
        const offs = parseRows(offr) as Offerte[];
        setOfferten(offs);
        setOffertNum((p) => Math.max(p, ...offs.map((o) => o.offertNumber ?? 0)));
      }
      if (Array.isArray(rechr)) {
        const rechns = parseRows(rechr) as Rechnung[];
        setRechnungen(rechns);
        setRechnungNum((p) => Math.max(p, ...rechns.map((r) => r.rechnungNumber ?? 0)));
      }
    };

    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSyncAt.current < REVALIDATE_MIN_MS) return;
      sync().catch((e) => console.warn('[Supabase] background refresh failed:', e));
    };

    (async () => {
      try { await sync(); } catch (e) { console.error(e); }
      if (!cancelled) setLoading(false);
    })();

    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [token, authChecked]);

  async function syncOk(fn: () => Promise<void>) {
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

  async function addCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<string> {
    const id = `c_${Date.now()}`;
    const newC: Customer = { id, ...data, createdAt: new Date().toISOString() };
    await syncOk(() => db.upsert('customers', { id, data: newC }, token!));
    setCustomers((p) => [...p, newC]);
    return id;
  }

  async function updateCustomer(id: string, data: Partial<Customer>) {
    const updated = { ...customers.find((c) => c.id === id)!, ...data };
    await syncOk(() => db.upsert('customers', { id, data: updated }, token!));
    setCustomers((p) => p.map((c) => (c.id === id ? updated : c)));
  }

  async function deleteCustomer(id: string) {
    await syncOk(() => db.delete('customers', id, token!));
    setCustomers((p) => p.filter((c) => c.id !== id));
  }

  async function addOrder(data: Pick<Order, 'customerId' | 'beanstandungen' | 'notizen' | 'positionen' | 'offertId'>) {
    const num = orderNum + 1;
    const newO: Order = { id: `o_${Date.now()}`, orderNumber: num, status: 'aufnahme', statusChangedAt: new Date().toISOString(), createdAt: new Date().toISOString(), ...data };
    await syncOk(async () => { await db.upsert('orders', { id: newO.id, data: newO }, token!); await db.setCounter(num, token!); });
    setOrders((p) => [...p, newO]); setOrderNum(num);
  }

  async function updateOrder(upd: Order, cp: Partial<Customer> | null) {
    await syncOk(() => db.upsert('orders', { id: upd.id, data: upd }, token!));
    setOrders((p) => p.map((o) => (o.id === upd.id ? upd : o)));
    if (cp) await updateCustomer(upd.customerId, cp);
  }

  async function deleteOrder(id: string) {
    await syncOk(() => db.delete('orders', id, token!));
    setOrders((p) => p.filter((o) => o.id !== id));
  }

  async function addOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>): Promise<Offerte> {
    const num = offertNum + 1;
    const newOff: Offerte = { id: `off_${Date.now()}`, offertNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    await syncOk(() => db.upsert('offerten', { id: newOff.id, data: newOff }, token!));
    setOfferten((p) => [...p, newOff]); setOffertNum(num);
    showToast(`Offerte #${num} gespeichert`, 'success');
    return newOff;
  }

  async function updateOfferte(upd: Offerte) {
    await syncOk(() => db.upsert('offerten', { id: upd.id, data: upd }, token!));
    setOfferten((p) => p.map((o) => (o.id === upd.id ? upd : o)));
  }

  async function deleteOfferte(id: string) {
    await syncOk(() => db.delete('offerten', id, token!));
    setOfferten((p) => p.filter((o) => o.id !== id));
  }

  async function addRechnung(data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>) {
    const num = rechnungNum + 1;
    const newR: Rechnung = { id: `r_${Date.now()}`, rechnungNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    try {
      await syncOk(() => db.upsert('rechnungen', { id: newR.id, data: newR }, token!));
    } catch { return; }
    setRechnungen((p) => [...p, newR]); setRechnungNum(num);
    showToast(`Rechnung #${num} gespeichert`, 'success');
  }

  async function updateRechnung(upd: Rechnung) {
    await syncOk(() => db.upsert('rechnungen', { id: upd.id, data: upd }, token!));
    setRechnungen((p) => p.map((r) => (r.id === upd.id ? upd : r)));
  }

  async function deleteRechnung(id: string) {
    await syncOk(() => db.delete('rechnungen', id, token!));
    setRechnungen((p) => p.filter((r) => r.id !== id));
  }

  function handleLogin(t: string, e: string) {
    setToken(t); setUserEmail(e); setLoading(true);
  }

  async function handleLogout() {
    if (!window.confirm('Abmelden?')) return;
    await auth.signOut(token!);
    localStorage.removeItem('garage_token'); localStorage.removeItem('garage_email');
    setToken(null); setUserEmail(null); setCustomers([]); setOrders([]);
  }

  return (
    <AppContext.Provider value={{ customers, orders, offerten, rechnungen, orderNum, offertNum, rechnungNum, loading, syncStatus, token, userEmail, authChecked, sessionExpired, updateToken, addCustomer, updateCustomer, deleteCustomer, addOrder, updateOrder, deleteOrder, addOfferte, updateOfferte, deleteOfferte, addRechnung, updateRechnung, deleteRechnung, handleLogin, handleLogout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
