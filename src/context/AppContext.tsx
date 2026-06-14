import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, db } from '../lib/supabase';
import { showToast } from '../components/ui/Toast';
import type { Customer, Order, Offerte, SyncStatus } from '../types';

interface AppContextValue {
  customers: Customer[];
  orders: Order[];
  offerten: Offerte[];
  orderNum: number;
  offertNum: number;
  loading: boolean;
  syncStatus: SyncStatus;
  token: string | null;
  userEmail: string | null;
  authChecked: boolean;
  addCustomer: (data: Omit<Customer, 'id' | 'createdAt'>) => Promise<string>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  addOrder: (data: Pick<Order, 'customerId' | 'beanstandungen' | 'notizen'>) => Promise<void>;
  updateOrder: (upd: Order, cp: Partial<Customer> | null) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addOfferte: (data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>) => Promise<void>;
  updateOfferte: (upd: Offerte) => Promise<void>;
  deleteOfferte: (id: string) => Promise<void>;
  handleLogin: (token: string, email: string) => void;
  handleLogout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('garage_token'));
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem('garage_email'));
  const [authChecked, setAuthChecked] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [offerten, setOfferten] = useState<Offerte[]>([]);
  const [orderNum, setOrderNum] = useState(0);
  const [offertNum, setOffertNum] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

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

  useEffect(() => {
    if (!token || !authChecked) return;
    (async () => {
      try {
        const [cr, or, cnt, offr] = await Promise.all([
          db.get('customers', token),
          db.get('orders', token),
          db.getCounter(token),
          db.get('offerte', token).catch((e) => { console.error('[Supabase] get(offerte):', e); return []; }),
        ]);
        const parseRows = (arr: unknown[]) =>
          (Array.isArray(arr) ? arr : []).map((r: unknown) => {
            if (!r || typeof r !== 'object') return null;
            const row = r as Record<string, unknown>;
            return (row.data as Customer | Order | Offerte) ?? (row.id ? r : null);
          }).filter(Boolean);
        setCustomers(parseRows(cr) as Customer[]);
        setOrders(parseRows(or) as Order[]);
        setOrderNum(cnt);
        const offs = parseRows(offr) as Offerte[];
        setOfferten(offs);
        if (offs.length) setOffertNum(Math.max(...offs.map((o) => o.offertNumber ?? 0)));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [token, authChecked]);

  async function syncOk(fn: () => Promise<void>) {
    setSyncStatus('saving');
    try {
      await fn();
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus('idle'), 2200);
    } catch (e) {
      console.error(e);
      setSyncStatus('error');
      showToast('Speichern fehlgeschlagen: ' + ((e instanceof Error ? e.message : '') || 'Unbekannter Fehler'), 'error');
      throw e;
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

  async function addOrder(data: Pick<Order, 'customerId' | 'beanstandungen' | 'notizen'>) {
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

  async function addOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>) {
    const num = offertNum + 1;
    const newOff: Offerte = { id: `off_${Date.now()}`, offertNumber: num, status: 'entwurf', createdAt: new Date().toISOString(), ...data };
    try {
      await syncOk(() => db.upsert('offerte', { id: newOff.id, data: newOff }, token!));
    } catch { return; }
    setOfferten((p) => [...p, newOff]); setOffertNum(num);
    showToast(`Offerte #${num} gespeichert`, 'success');
  }

  async function updateOfferte(upd: Offerte) {
    await syncOk(() => db.upsert('offerte', { id: upd.id, data: upd }, token!));
    setOfferten((p) => p.map((o) => (o.id === upd.id ? upd : o)));
  }

  async function deleteOfferte(id: string) {
    await syncOk(() => db.delete('offerte', id, token!));
    setOfferten((p) => p.filter((o) => o.id !== id));
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
    <AppContext.Provider value={{ customers, orders, offerten, orderNum, offertNum, loading, syncStatus, token, userEmail, authChecked, addCustomer, updateCustomer, addOrder, updateOrder, deleteOrder, addOfferte, updateOfferte, deleteOfferte, handleLogin, handleLogout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
