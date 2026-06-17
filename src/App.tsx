import { useState, useEffect, useRef } from 'react';
import { useApp } from './context/AppContext';
import { ASSETS } from './lib/supabase';
import { needsAttention } from './lib/utils';

import Spinner from './components/ui/Spinner';
import Sheet from './components/ui/Sheet';
import LoginPage from './components/LoginPage';
import NavBar from './components/NavBar';
import TabBar from './components/TabBar';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { SFPerson, SFWrench, SFDoc, SFReceipt } from './components/Icons';
import CustomerList from './components/kunden/CustomerList';
import CustomerForm from './components/kunden/CustomerForm';
import CustomerDetail from './components/kunden/CustomerDetail';
import OrderList from './components/auftraege/OrderList';
import OrderForm from './components/auftraege/OrderForm';
import OrderDetail from './components/auftraege/OrderDetail';
import OfferteList from './components/offerten/OfferteList';
import OfferteForm from './components/offerten/OfferteForm';
import OfferteDetail from './components/offerten/OfferteDetail';
import StatistikDashboard from './components/statistiken/StatistikDashboard';
import SettingsView from './components/einstellungen/SettingsView';
import RechnungenList from './components/rechnungen/RechnungenList';
import RechnungForm from './components/rechnungen/RechnungForm';
import RechnungDetail from './components/rechnungen/RechnungDetail';

import type { Customer, Order, Offerte, Rechnung, TabId } from './types';

export default function App() {
  const {
    customers, orders, offerten, rechnungen,
    syncStatus, token, authChecked, loading,
    handleLogin, handleLogout,
    addCustomer, updateCustomer,
    addOrder, updateOrder, deleteOrder,
    addOfferte, updateOfferte, deleteOfferte,
    addRechnung, updateRechnung, deleteRechnung,
  } = useApp();

  const [tab, setTab] = useState<TabId>('dashboard');
  const [fabOpen, setFabOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState<string>(
    () => localStorage.getItem('garage_wallpaper') || ASSETS.wallpaper
  );
  const [bgSrc, setBgSrc] = useState(wallpaper);
  const prevBlobRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    fetch(wallpaper, { cache: 'no-cache' })
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = url;
        setBgSrc(url);
      })
      .catch(() => { if (!cancelled) setBgSrc(wallpaper); });
    return () => { cancelled = true; };
  }, [wallpaper]);

  function handleWallpaperChange(url: string) {
    setWallpaper(url);
    localStorage.setItem('garage_wallpaper', url);
  }

  const [showNC,   setShowNC]   = useState(false);
  const [showNO,   setShowNO]   = useState(false);
  const [showNOff, setShowNOff] = useState(false);
  const [showNR,   setShowNR]   = useState(false);
  const [newOCid,  setNewOCid]  = useState<string | null>(null);
  const [afterSave, setAfterSave] = useState<string | null>(null);

  const [selC,     setSelC]     = useState<Customer | null>(null);
  const [editC,    setEditC]    = useState<Customer | null>(null);
  const [selO,     setSelO]     = useState<Order | null>(null);
  const [selOInEdit, setSelOInEdit] = useState(false);
  const [selOff,   setSelOff]   = useState<Offerte | null>(null);
  const [editOff,  setEditOff]  = useState<Offerte | null>(null);
  const [selR,     setSelR]     = useState<Rechnung | null>(null);
  const [editR,    setEditR]    = useState<Rechnung | null>(null);

  const todos = orders.filter(needsAttention);

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (!token) return <LoginPage onLogin={handleLogin} />;

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Spinner size={36} />
        <span className="sf-subhead" style={{ fontSize: 15, color: 'var(--label2)' }}>Wird geladen…</span>
      </div>
    );
  }

  /* ── Customer handlers ── */
  async function handleAddCustomer(data: Omit<Customer, 'id' | 'createdAt'>) {
    const id = await addCustomer(data);
    setShowNC(false); setAfterSave(id);
  }

  /* ── Order handlers ── */
  async function handleAddOrder(data: Pick<Order, 'customerId' | 'beanstandungen' | 'notizen'>) {
    await addOrder(data);
    setShowNO(false); setNewOCid(null);
  }
  async function handleUpdateOrder(upd: Order, cp: Partial<Customer> | null) {
    await updateOrder(upd, cp); setSelO(upd); setSelOInEdit(false);
  }
  async function handleDeleteOrder(id: string) {
    await deleteOrder(id); setSelO(null); setSelOInEdit(false);
  }

  /* ── Offerte handlers ── */
  async function handleAddOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>) {
    await addOfferte(data); setShowNOff(false); setTab('offerten');
  }
  async function handleUpdateOfferte(upd: Offerte) {
    await updateOfferte(upd); setSelOff(upd);
  }
  async function handleSaveEditOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'status' | 'createdAt'>) {
    if (!editOff) return;
    const updated: Offerte = { ...editOff, ...data };
    await updateOfferte(updated);
    setEditOff(null); setSelOff(updated);
  }
  async function handleDeleteOfferte(id: string) {
    await deleteOfferte(id); setSelOff(null);
  }

  /* ── Rechnung handlers ── */
  async function handleAddRechnung(data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>) {
    await addRechnung(data); setShowNR(false); setTab('rechnungen');
  }
  async function handleUpdateRechnung(upd: Rechnung) {
    await updateRechnung(upd); setSelR(upd);
  }
  async function handleSaveEditRechnung(data: Omit<Rechnung, 'id' | 'rechnungNumber' | 'status' | 'createdAt'>) {
    if (!editR) return;
    const updated: Rechnung = { ...editR, ...data };
    await updateRechnung(updated);
    setEditR(null); setSelR(updated);
  }
  async function handleDeleteRechnung(id: string) {
    await deleteRechnung(id); setSelR(null);
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 'calc(55px + env(safe-area-inset-bottom))' }}>
      {/* Background */}
      <div className="bg">
        <img
          src={bgSrc}
          alt=""
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = '/mac_wallpaper.png'; }
          }}
        />
      </div>

      <NavBar syncStatus={syncStatus} todosCount={todos.length} onMenuToggle={() => setSidebarOpen((p) => !p)} onLogoClick={() => setTab('dashboard')} />

      <Sidebar
        open={sidebarOpen}
        activeTab={tab}
        onTabChange={setTab}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 8px' }}>
        {tab === 'dashboard'   && <Dashboard customers={customers} orders={orders} onOrderClick={(o) => { setSelOInEdit(false); setSelO(o); }} />}
        {tab === 'auftraege'   && <OrderList orders={orders} customers={customers} onOrderClick={(o) => { setSelOInEdit(false); setSelO(o); }} onEditClick={(o) => { setSelOInEdit(true); setSelO(o); }} />}
        {tab === 'offerten'    && <OfferteList offerten={offerten} customers={customers} onOfferteClick={setSelOff} onEdit={(off) => setEditOff(off)} onNew={() => setShowNOff(true)} />}
        {tab === 'rechnungen'  && <RechnungenList rechnungen={rechnungen} customers={customers} onRechnungClick={setSelR} onEdit={(r) => setEditR(r)} onNew={() => setShowNR(true)} />}
        {tab === 'kunden'      && <CustomerList customers={customers} orders={orders} onCustomerClick={setSelC} />}
        {tab === 'statistiken'   && <StatistikDashboard orders={orders} offerten={offerten} customers={customers} />}
        {tab === 'einstellungen' && <SettingsView currentWallpaper={wallpaper} onWallpaperChange={handleWallpaperChange} />}
      </div>

      {/* FAB context menu backdrop */}
      {fabOpen && <div onClick={() => setFabOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 498 }} />}
      {fabOpen && (
        <div className="context-menu" style={{ bottom: 'calc(68px + env(safe-area-inset-bottom))', right: 16 }}>
          <button className="context-item" onClick={() => { setShowNC(true); setFabOpen(false); }}>
            <span>Neuer Kunde</span><span className="context-item-icon"><SFPerson /></span>
          </button>
          <button className="context-item" onClick={() => { setNewOCid(null); setShowNO(true); setFabOpen(false); }}>
            <span>Neuer Auftrag</span><span className="context-item-icon"><SFWrench /></span>
          </button>
          <button className="context-item" onClick={() => { setShowNOff(true); setFabOpen(false); }}>
            <span>Neue Offerte</span><span className="context-item-icon"><SFDoc /></span>
          </button>
          <button className="context-item" onClick={() => { setShowNR(true); setFabOpen(false); }}>
            <span>Neue Rechnung</span><span className="context-item-icon"><SFReceipt /></span>
          </button>
        </div>
      )}

      <TabBar activeTab={tab} onTabChange={setTab} fabOpen={fabOpen} onFabToggle={() => setFabOpen((p) => !p)} />

      {/* ── Sheets ── */}
      {afterSave && !showNO && (() => {
        const c = customers.find((x) => x.id === afterSave);
        return (
          <Sheet title="Kunde gespeichert" onClose={() => setAfterSave(null)}>
            <div style={{ textAlign: 'center', padding: '12px 0 24px' }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
              <p className="sf-body" style={{ color: 'var(--label2)', marginBottom: 24 }}>
                Möchtest du direkt einen Auftrag für {c?.vorname ?? ''} {c?.nachname ?? ''} erstellen?
              </p>
            </div>
            <button onClick={() => { setNewOCid(afterSave); setShowNO(true); }} className="btn-system" style={{ marginBottom: 12 }}>Auftrag erstellen</button>
            <button onClick={() => setAfterSave(null)} className="btn-system btn-secondary">Später</button>
          </Sheet>
        );
      })()}

      {showNO && (
        <Sheet title="Neuer Auftrag" onClose={() => { setShowNO(false); setNewOCid(null); }}
          barRight={<button onClick={() => { setShowNO(false); setNewOCid(null); }} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <OrderForm customers={customers} customerId={newOCid ?? undefined} onSave={handleAddOrder} onCancel={() => { setShowNO(false); setNewOCid(null); }} />
        </Sheet>
      )}

      {showNC && (
        <Sheet title="Neuer Kunde" onClose={() => setShowNC(false)}
          barRight={<button onClick={() => setShowNC(false)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <CustomerForm onSave={handleAddCustomer} onCancel={() => setShowNC(false)} />
        </Sheet>
      )}

      {showNOff && (
        <Sheet title="Neue Offerte" onClose={() => setShowNOff(false)} full
          barRight={<button onClick={() => setShowNOff(false)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <OfferteForm customers={customers} onSave={handleAddOfferte} onCancel={() => setShowNOff(false)} />
        </Sheet>
      )}

      {showNR && (
        <Sheet title="Neue Rechnung" onClose={() => setShowNR(false)} full
          barRight={<button onClick={() => setShowNR(false)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <RechnungForm customers={customers} offerten={offerten} onSave={handleAddRechnung} onCancel={() => setShowNR(false)} />
        </Sheet>
      )}

      {selOff && (
        <OfferteDetail
          offerte={selOff}
          customer={customers.find((c) => c.id === selOff.customerId)}
          onClose={() => setSelOff(null)}
          onUpdate={handleUpdateOfferte}
          onDelete={handleDeleteOfferte}
          onEdit={(off) => { setSelOff(null); setEditOff(off); }}
        />
      )}

      {editOff && (
        <Sheet title={`Offerte #${editOff.offertNumber} bearbeiten`} onClose={() => setEditOff(null)} full
          barRight={<button onClick={() => setEditOff(null)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <OfferteForm customers={customers} initial={editOff} onSave={handleSaveEditOfferte} onCancel={() => setEditOff(null)} />
        </Sheet>
      )}

      {selR && (
        <RechnungDetail
          rechnung={selR}
          customer={customers.find((c) => c.id === selR.customerId)}
          onClose={() => setSelR(null)}
          onUpdate={handleUpdateRechnung}
          onDelete={handleDeleteRechnung}
          onEdit={(r) => { setSelR(null); setEditR(r); }}
        />
      )}

      {editR && (
        <Sheet title={`Rechnung #${editR.rechnungNumber} bearbeiten`} onClose={() => setEditR(null)} full
          barRight={<button onClick={() => setEditR(null)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <RechnungForm customers={customers} offerten={offerten} initial={editR} onSave={handleSaveEditRechnung} onCancel={() => setEditR(null)} />
        </Sheet>
      )}

      {selC && !selO && (
        <CustomerDetail
          customer={selC} orders={orders}
          onClose={() => setSelC(null)}
          onEdit={() => setEditC(selC)}
          onNewOrder={() => { setNewOCid(selC.id); setShowNO(true); setSelC(null); }}
          onOrderClick={(o) => { setSelO(o); setSelC(null); }}
        />
      )}

      {editC && (
        <Sheet title="Kunde bearbeiten" onClose={() => setEditC(null)}
          barRight={<button onClick={() => setEditC(null)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <CustomerForm
            initial={editC}
            onSave={async (data) => { await updateCustomer(editC.id, data); setEditC(null); }}
            onCancel={() => setEditC(null)}
          />
        </Sheet>
      )}

      {selO && (
        <OrderDetail
          order={selO}
          customer={customers.find((c) => c.id === selO.customerId)}
          onClose={() => { setSelO(null); setSelOInEdit(false); }}
          onUpdate={handleUpdateOrder}
          onDelete={handleDeleteOrder}
          defaultEdit={selOInEdit}
        />
      )}

      {/* Build timestamp */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(60px + env(safe-area-inset-bottom))',
        left: 10,
        background: 'rgba(255,255,255,0.15)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 7,
        padding: '2px 7px',
        fontSize: 10,
        fontFamily: 'var(--font-system, system-ui)',
        color: 'rgba(255,255,255,0.60)',
        letterSpacing: '0.02em',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 10,
      }}>
        {`Build: ${new Date(__BUILD_TIME__).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' })}`}
      </div>
    </div>
  );
}
