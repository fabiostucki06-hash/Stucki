import { useState, useEffect, useRef } from 'react';
import { useApp } from './context/AppContext';
import { showToast } from './components/ui/Toast';
import { ASSETS } from './lib/supabase';
import { needsAttention, decodeMaybeDouble } from './lib/utils';
import { sampleImageColor, applyBgTheme, hexToRgb, type WallpaperThemeId } from './lib/theme';
import { updateSettings, getActiveOfferteId, setActiveOfferteId, getMargin } from './lib/settings';
import { useSettings } from './hooks/useSettings';
import { cleanPartTitle } from './lib/partTitle';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useIsDesktop } from './hooks/useIsDesktop';
import { offerteNr, nextVersion, sumPositions, roundToRappen, VORKASSE_BEDINGUNG, SCHLUSSRECHNUNG_NOTIZ, ANZAHLUNG_BEDINGUNG, ANZAHLUNG_PROZENT, mitMaterialHinweis, ohneMaterialHinweis } from './lib/offerte-docs';
import { hardReload } from './lib/reload';
import { computeRechnungTotals, withOffertePositionen, migrateAnzahlungEntwurf, findQuellOfferte } from './lib/rechnung-totals';

import Spinner from './components/ui/Spinner';
import Sheet from './components/ui/Sheet';
import ReauthModal from './components/ui/ReauthModal';
import UpdateBanner from './components/ui/UpdateBanner';
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
import { ActiveOfferteBanner } from './components/offerten/ActiveOfferte';
import { isOpenOfferte } from './hooks/useActiveOfferte';
import ImportPartSheet, { type ImportPayload } from './components/offerten/ImportPartSheet';
import StatistikDashboard from './components/statistiken/StatistikDashboard';
import SettingsView from './components/einstellungen/SettingsView';
import RechnungenList from './components/rechnungen/RechnungenList';
import RechnungForm from './components/rechnungen/RechnungForm';
import RechnungDetail from './components/rechnungen/RechnungDetail';

import type { ArbeitPosition, MaterialPosition, Customer, Order, Offerte, Position, Rechnung, TabId } from './types';

export default function App() {
  const {
    customers, orders, offerten, rechnungen,
    syncStatus, token, authChecked, loading,
    userEmail, sessionExpired, updateToken,
    handleLogin, handleLogout,
    addCustomer, updateCustomer, deleteCustomer,
    addOrder, updateOrder, deleteOrder,
    addOfferte, updateOfferte, deleteOfferte,
    addRechnung, updateRechnung, deleteRechnung,
    addMaterial,
  } = useApp();

  const updateAvailable = useVersionCheck();
  // A Shortcut may open /offerten?import_url=… instead of the root; land on that tab.
  const [tab, setTab] = useState<TabId>(() => (window.location.pathname.replace(/\/+$/, '') === '/offerten' ? 'offerten' : 'dashboard'));
  const [fabOpen, setFabOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Laptop / desktop: docked sidebar, centered dialogs, table lists (see globals.css).
  const isDesktop = useIsDesktop();

  /* Keyboard: clickable list rows are focusable (tabIndex); Enter or Space on a
     focused row opens it like a click. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target as HTMLElement | null;
      if (!el?.classList?.contains('list-row') || el.tabIndex < 0) return;
      e.preventDefault();
      el.click();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Synced per user: a change on another device re-renders the background here.
  const { wallpaper, bgMode, bgColor } = useSettings();
  const [bgSrc, setBgSrc] = useState(wallpaper);
  const prevBlobRef = useRef<string>('');

  useEffect(() => {
    if (bgMode !== 'image') return;
    let cancelled = false;
    const themeId: WallpaperThemeId =
      wallpaper === ASSETS.wallpaper2 ? 'wallpaper-2' :
      wallpaper === ASSETS.wallpaper3 ? 'wallpaper-3' :
      'wallpaper-1'; // default asset + wallpaper1 both use the classic-blue theme
    fetch(wallpaper, { cache: 'no-cache' })
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = url;
        setBgSrc(url);
        // Sample the local blob (same-origin, won't taint the canvas) so text/card
        // tokens adapt to how bright the chosen wallpaper actually is, while the
        // accent hue itself comes from the curated per-wallpaper palette.
        sampleImageColor(url).then((c) => applyBgTheme(c, themeId)).catch(() => {});
      })
      .catch(() => { if (!cancelled) setBgSrc(wallpaper); });
    return () => { cancelled = true; };
  }, [wallpaper, bgMode]);

  // Flat color mode: no photo to sample, the chosen color itself drives the
  // text/card/accent theme derivation (same function the wallpaper path uses).
  useEffect(() => {
    if (bgMode !== 'color') return;
    applyBgTheme(hexToRgb(bgColor));
  }, [bgMode, bgColor]);

  function handleWallpaperChange(url: string) {
    updateSettings({ wallpaper: url, bgMode: 'image' });
  }

  function handleBgColorChange(hex: string) {
    updateSettings({ bgColor: hex, bgMode: 'color' });
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

  const [importPayload, setImportPayload] = useState<ImportPayload | null>(null);
  const [importTargetId, setImportTargetId] = useState<string | undefined>(undefined);
  const [pendingImport, setPendingImport] = useState<{ payload: ImportPayload; offerteId?: string; fromBookmarklet: boolean } | null>(null);
  const [prefillMat, setPrefillMat] = useState<MaterialPosition | null>(null);
  const [prefillCid, setPrefillCid] = useState<string | undefined>(undefined);

  // Entry point for the iOS-Shortcut / share-sheet / desktop-bookmarklet part
  // import: a Shortcut or bookmarklet opens https://<app>/?import_url=<link>
  // (plus, from the bookmarklet, import_title/import_price/import_artnr already
  // extracted client-side). Captured once on mount (independent of login state,
  // since this component never remounts across the login transition) and
  // stripped from the URL so a reload doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawUrl = params.get('import_url');
    const rawText = params.get('import_text');
    const rawTitle = params.get('import_title');
    const rawPrice = params.get('import_price');
    const rawArtnr = params.get('import_artnr');
    if (rawUrl || rawText) {
      // URLSearchParams.get() already undoes one layer of percent-encoding; some
      // iOS Shortcuts "URL öffnen" actions re-encode a value that was already
      // encoded, so undo any further layers too (see decodeMaybeDouble).
      const url = rawUrl ? decodeMaybeDouble(rawUrl) : undefined;
      const text = rawText ? decodeMaybeDouble(rawText) : undefined;
      const title = rawTitle ? decodeMaybeDouble(rawTitle) : undefined;
      const price = rawPrice ? decodeMaybeDouble(rawPrice) : undefined;
      const artnr = rawArtnr ? decodeMaybeDouble(rawArtnr) : undefined;

      // An unresolved Shortcuts variable placeholder (e.g. the literal text
      // "[Textausgabe (URL-codiert)]" instead of the actual shared value) looks
      // nothing like a URL/price/title — surface it loudly instead of silently
      // failing, since it means the Shortcut itself is misconfigured.
      const looksLikePlaceholder = (v?: string) => !!v && /^\[.*\]$/.test(v.trim());
      if (looksLikePlaceholder(url) || looksLikePlaceholder(text)) {
        console.warn('[Import] received an unresolved Shortcuts placeholder instead of real data.', { rawUrl, rawText, decodedUrl: url, decodedText: text });
      }

      setPendingImport({
        payload: { url, text, title, price, artikelnummer: artnr, _rawUrl: rawUrl ?? undefined, _rawText: rawText ?? undefined },
        offerteId: params.get('offerte_id') || undefined,
        fromBookmarklet: params.get('import_src') === 'bookmarklet',
      });
      params.delete('import_url'); params.delete('import_text');
      params.delete('import_title'); params.delete('import_price'); params.delete('import_artnr');
      params.delete('offerte_id'); params.delete('import_src');
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

  // Once the data is loaded, a captured import goes straight into the active
  // Offerte (or the one named by ?offerte_id=) when the part is fully known:
  // The active Offerte is only ever set by an explicit user choice (nav-bar
  // pill, list toggle, banner button), never by opening or saving one.
  // title plus EK. Without such an Offerte, or with anything missing, the
  // import sheet opens instead so the user can complete and place it by hand.
  const importStarted = useRef(false);
  useEffect(() => {
    if (!pendingImport || !token || loading || importStarted.current) return;
    importStarted.current = true;
    const { payload, offerteId, fromBookmarklet } = pendingImport;
    const wanted = offerteId || getActiveOfferteId();
    const target = offerten.find((o) => o.id === wanted && isOpenOfferte(o));
    const openSheet = (p: ImportPayload) => {
      setImportTargetId(target?.id);
      setImportPayload(p);
      setPendingImport(null);
      importStarted.current = false;
    };
    if (!target) { openSheet(payload); return; }

    (async () => {
      let part = { title: payload.title, ek: payload.price, artikelnummer: payload.artikelnummer, link: payload.url };
      try {
        // Share-sheet path: nothing extracted client-side yet.
        if (!part.title && !part.ek) {
          const r = await fetch('/api/import-part', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data: { title?: string; ek?: string; artikelnummer?: string; quelle?: string } = await r.json();
          part = { title: data.title, ek: data.ek, artikelnummer: data.artikelnummer, link: data.quelle || payload.url };
        }
        const beschreibung = cleanPartTitle(part.title ?? '');
        const ek = parseFloat(part.ek ?? '');
        if (!beschreibung || !(ek > 0)) {
          openSheet({ ...payload, title: part.title, price: part.ek, artikelnummer: part.artikelnummer });
          return;
        }
        const vk = (ek * (1 + getMargin() / 100)).toFixed(2);
        await handleAddImportedPartToOfferte(target.id, {
          typ: 'material', beschreibung, menge: '1', stueckpreis: vk, preis: vk,
          link: part.link || undefined, ek: part.ek, artikelnummer: part.artikelnummer || undefined,
        });
        setPendingImport(null);
        importStarted.current = false;
        setTab('offerten');
        // The bookmarklet opened this tab just for the import: hand the user
        // back to the shop page once the toast was readable. Never closes a
        // tab that has been navigated in.
        if (fromBookmarklet && window.history.length <= 1) setTimeout(() => window.close(), 1800);
      } catch (e) {
        console.warn('[Import] direct import failed, falling back to the import sheet:', e);
        openSheet(payload);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport, token, loading]);

  // Open detail sheets hold a snapshot; re-point them at fresh rows after a background refresh.
  // Keep the old snapshot if the row vanished (deleted elsewhere) so the sheet doesn't blank out mid-view.
  useEffect(() => { setSelC((p) => (p && customers.find((x) => x.id === p.id)) || p); }, [customers]);
  useEffect(() => { setSelO((p) => (p && orders.find((x) => x.id === p.id)) || p); }, [orders]);
  useEffect(() => { setSelOff((p) => (p && offerten.find((x) => x.id === p.id)) || p); }, [offerten]);
  useEffect(() => { setSelR((p) => (p && rechnungen.find((x) => x.id === p.id)) || p); }, [rechnungen]);

  // Old single-line Anzahlungsrechnung drafts are rewritten once with every Offerte position.
  const migratedAnz = useRef(new Set<string>());
  useEffect(() => {
    if (loading) return;
    for (const r of rechnungen) {
      if (migratedAnz.current.has(r.id)) continue;
      const upd = migrateAnzahlungEntwurf(r, offerten);
      if (!upd) continue;
      migratedAnz.current.add(r.id);
      void updateRechnung(upd).catch(() => migratedAnz.current.delete(r.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rechnungen, offerten]);

  const todos = orders.filter(needsAttention);

  // Any open sheet/detail can hold unsaved local edits (Offerte positions, inline
  // status changes, a half-filled new-customer form, …) — force-reloading through
  // one would silently discard it, same failure mode as the offerten save bug.
  // So: reload the instant it's safe (nothing open), and the instant it becomes
  // safe again if a new version lands while something is.
  const anySheetOpen = showNC || showNO || showNOff || showNR || !!afterSave
    || !!selC || !!editC || !!selO || !!selOff || !!editOff || !!selR || !!editR || !!importPayload || !!pendingImport;
  const reloadTriggered = useRef(false);
  useEffect(() => {
    if (!updateAvailable || anySheetOpen || reloadTriggered.current) return;
    reloadTriggered.current = true;
    hardReload();
  }, [updateAvailable, anySheetOpen]);

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
  async function handleDeleteCustomer(id: string) {
    await deleteCustomer(id); setSelC(null);
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
    const saved = await updateOfferte(upd); setSelOff(saved);
  }
  async function handleSaveEditOfferte(data: Omit<Offerte, 'id' | 'offertNumber' | 'createdAt'>) {
    if (!editOff) return;
    const updated: Offerte = { ...editOff, ...data };
    // Close the sheet only once the write is confirmed; a throw propagates to the
    // form, which keeps the edit on screen instead of discarding it.
    const saved = await updateOfferte(updated);
    setEditOff(null); setSelOff(saved);
  }
  async function handleDeleteOfferte(id: string) {
    await deleteOfferte(id); setSelOff(null);
    if (getActiveOfferteId() === id) setActiveOfferteId('');
  }
  async function handleDuplicateOfferte(offerte: Offerte) {
    // A copy based on an existing Offerte is its next version ("12_2"),
    // same number; status, AB and material order state are not carried over.
    const { id, offertNumber, status, createdAt, ab, materialStatus, ...rest } = offerte;
    const dup = await addOfferte({
      ...rest,
      version: nextVersion(offerte, offerten),
      basisOffertId: offerte.id,
    }, { offertNumber: offerte.offertNumber });
    setSelOff(dup);
  }
  async function handleCreateMaterialofferte(offerte: Offerte, positionen: Position[]) {
    // Reine Materialofferte: same offertNumber, next version, only the material
    // positions, and the 50% Vorkasse terms as default remarks.
    const mat = positionen
      .filter((p): p is MaterialPosition => p.typ === 'material')
      .map(({ bestellt, ...p }) => p);
    const t = sumPositions(mat);
    const { id, offertNumber, status, createdAt, ab, materialStatus, ...rest } = offerte;
    const baseTitel = (offerte.titel ?? '').replace(/^Materialofferte( – )?/, '');
    const created = await addOfferte({
      ...rest,
      art: 'material',
      version: nextVersion(offerte, offerten),
      basisOffertId: offerte.id,
      titel: baseTitel ? `Materialofferte – ${baseTitel}` : 'Materialofferte',
      notizen: mitMaterialHinweis(offerte.notizen),
      positionen: mat,
      totalArbeit: '0.00',
      totalMaterial: t.totalMaterial.toFixed(2),
      totalBetrag: t.total.toFixed(2),
      totalZE: 0,
      zahlungsbedingung: VORKASSE_BEDINGUNG,
      zusatznotiz: SCHLUSSRECHNUNG_NOTIZ,
    }, { offertNumber: offerte.offertNumber });
    setSelOff(created);
  }
  /* The Anzahlungsrechnung lists every accepted position of the Offerte; the
     amount due is ANZAHLUNG_PROZENT of their sum (see computeRechnungTotals). */
  async function handleCreateAnzahlung(offerte: Offerte, positionen: Position[]) {
    const nr = offerteNr(offerte);
    const pos = positionen.map((p) => (p.typ === 'material' ? (({ bestellt, ...m }) => m)(p) : p));
    const t = sumPositions(pos);
    const betrag = roundToRappen(t.total * ANZAHLUNG_PROZENT / 100).toFixed(2);
    await addRechnung({
      customerId: offerte.customerId,
      offertId: offerte.id,
      art: 'anzahlung',
      anzahlungProzent: ANZAHLUNG_PROZENT,
      titel: `Anzahlungsrechnung – Offerte #${nr}`,
      positionen: pos,
      // Gesamtbetrag, Anzahlung and Restbetrag are shown in the totals section.
      notizen: mitMaterialHinweis(`Positionen gemäss Offerte / Auftragsbestätigung Nr. ${nr}.`),
      // Vorkasse: due before work starts, so no "Tage netto" due date.
      zahlungsFrist: '0',
      zahlungsbedingung: ANZAHLUNG_BEDINGUNG,
      kleinteilManuell: false,
      totalBetrag: betrag,
      totalArbeit: t.totalArbeit.toFixed(2),
      totalMaterial: t.totalMaterial.toFixed(2),
      totalZE: t.totalZE,
    });
    setSelOff(null);
    setTab('anzahlungsrechnungen');
  }
  /* Schlussrechnung: every position of the Offerte (as listed on the
     Anzahlungsrechnung) minus the Anzahlung already billed; the amount due is the
     Restbetrag shown on the Anzahlungsrechnung. */
  async function handleCreateSchlussrechnung(anz: Rechnung) {
    const off = findQuellOfferte(anz, offerten);
    // Older Anzahlungsrechnungen carry a single amount line instead of the positions.
    const source = anz.anzahlungProzent ? anz.positionen : off?.positionen;
    if (!source?.length) { showToast('Keine Positionen für die Schlussrechnung gefunden', 'error'); return; }
    const pos = source.map((p) => (p.typ === 'material' ? (({ bestellt, ...m }) => m)(p) : p));
    const nr = off ? offerteNr(off) : undefined;
    const anzBetrag = parseFloat(anz.totalBetrag ?? '') || 0;
    const t = computeRechnungTotals(pos, undefined, false, undefined, anzBetrag);
    await addRechnung({
      customerId: anz.customerId,
      offertId: anz.offertId,
      art: 'schluss',
      anzahlungRechnungId: anz.id,
      anzahlungRechnungNumber: anz.rechnungNumber,
      anzahlungBetrag: anzBetrag.toFixed(2),
      offertNr: nr,
      titel: nr ? `Schlussrechnung – Offerte #${nr}` : 'Schlussrechnung',
      positionen: pos,
      notizen: `Positionen gemäss Offerte / Auftragsbestätigung${nr ? ` Nr. ${nr}` : ''}. Die Anzahlung gemäss Anzahlungsrechnung #${anz.rechnungNumber} ist abgezogen.`,
      zahlungsFrist: '10',
      // Same basis as the Anzahlungsrechnung, so the Restbetrag matches exactly.
      kleinteilManuell: false,
      totalBetrag: t.rechnungstotal.toFixed(2),
      totalArbeit: t.totalArbeit.toFixed(2),
      totalMaterial: t.totalMaterial.toFixed(2),
      totalZE: t.totalZE,
    });
    setSelOff(null);
    setSelR(null);
    setTab('rechnungen');
  }
  /** Active (not cancelled) Anzahlungsrechnungen of an Offerte, newest first. */
  const anzahlungenFor = (offertId: string) => rechnungen
    .filter((r) => r.art === 'anzahlung' && r.offertId === offertId && r.status !== 'storniert')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const schlussrechnungFor = (anzId: string) =>
    rechnungen.find((r) => r.art === 'schluss' && r.anzahlungRechnungId === anzId && r.status !== 'storniert');
  async function handleCreateAuftragFromOfferte(offerte: Offerte, acceptedIndices: number[]) {
    // Copy every accepted position individually — no grouping or merging
    const positions = (offerte.positionen ?? []).filter((_, i) => acceptedIndices.includes(i));
    const offerteLabel = offerte.titel
      ? `Offerte #${offerteNr(offerte)}: ${offerte.titel}`
      : `Offerte #${offerteNr(offerte)}`;
    // Each accepted arbeit description becomes its own beanstandung entry
    const arbeitBeans = positions
      .filter((p) => p.typ === 'arbeit')
      .map((p) => p.beschreibung)
      .filter(Boolean);
    await addOrder({
      customerId: offerte.customerId,
      beanstandungen: [offerteLabel, ...arbeitBeans],
      notizen: ohneMaterialHinweis(offerte.notizen),
      positionen: positions,
      offertId: offerte.id,
    });
    setSelOff(null);
    setTab('auftraege');
  }

  async function handleCreateRechnungFromOfferte(offerte: Offerte, acceptedIndices: number[]) {
    // Copy every accepted position individually — no grouping or merging
    const positions = (offerte.positionen ?? []).filter((_, i) => acceptedIndices.includes(i));
    const totalArbeit = positions
      .filter((p) => p.typ === 'arbeit')
      .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
    const totalMaterial = positions
      .filter((p) => p.typ === 'material')
      .reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
    const totalZE = positions
      .filter((p) => p.typ === 'arbeit')
      .reduce((s, p) => s + (parseFloat((p as ArbeitPosition).ze || '0') || 0), 0);
    const faelligDate = new Date();
    faelligDate.setDate(faelligDate.getDate() + 10);
    await addRechnung({
      customerId: offerte.customerId,
      titel: offerte.titel,
      positionen: positions,
      notizen: ohneMaterialHinweis(offerte.notizen),
      zahlungsFrist: '10',
      faelligAm: faelligDate.toISOString(),
      totalBetrag: (totalArbeit + totalMaterial).toFixed(2),
      totalArbeit: totalArbeit.toFixed(2),
      totalMaterial: totalMaterial.toFixed(2),
      totalZE,
    });
    setSelOff(null);
    setTab('rechnungen');
  }

  /* ── Teile-Import handlers ── */
  async function handleAddImportedPartToOfferte(offerteId: string, position: MaterialPosition) {
    const off = offerten.find((o) => o.id === offerteId);
    if (!off) return;
    const positionen = [...(off.positionen ?? []), position];
    const totalArbeit = positionen.filter((p) => p.typ === 'arbeit').reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
    const totalMaterial = positionen.filter((p) => p.typ === 'material').reduce((s, p) => s + (parseFloat(p.preis || '0') || 0), 0);
    await updateOfferte({ ...off, positionen, totalArbeit: totalArbeit.toFixed(2), totalMaterial: totalMaterial.toFixed(2), totalBetrag: (totalArbeit + totalMaterial).toFixed(2) });
    showToast(`Teil erfolgreich zu Offerte #${offerteNr(off)} hinzugefügt!`, 'success');
  }
  function handleStartNewOfferteFromImport(position: MaterialPosition, customerId?: string) {
    setPrefillMat(position);
    setPrefillCid(customerId);
    setImportPayload(null);
    setShowNOff(true);
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
    <div className={`app-shell${isDesktop ? ' is-desktop' : ''}`} style={{ minHeight: '100dvh', paddingBottom: 'calc(55px + env(safe-area-inset-bottom))' }}>
      {sessionExpired && <ReauthModal email={userEmail} onResolved={updateToken} />}

      {/* Background */}
      <div className={`bg${bgMode === 'color' ? ' flat' : ''}`} style={bgMode === 'color' ? { backgroundColor: bgColor } : undefined}>
        {bgMode === 'image' && (
          <img
            src={bgSrc}
            alt=""
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = '/mac_wallpaper.png'; }
            }}
          />
        )}
      </div>

      <NavBar syncStatus={syncStatus} todosCount={todos.length} offerten={offerten} customers={customers} onMenuToggle={isDesktop ? undefined : () => setSidebarOpen((p) => !p)} onLogoClick={() => setTab('dashboard')} />

      <Sidebar
        open={sidebarOpen}
        docked={isDesktop}
        activeTab={tab}
        onTabChange={setTab}
        onClose={() => setSidebarOpen(false)}
        onLogout={handleLogout}
      />

      <main className="app-main">
        {tab === 'dashboard'   && <Dashboard customers={customers} orders={orders} onOrderClick={(o) => { setSelOInEdit(false); setSelO(o); }} />}
        {tab === 'auftraege'   && <OrderList orders={orders} customers={customers} onOrderClick={(o) => { setSelOInEdit(false); setSelO(o); }} onEditClick={(o) => { setSelOInEdit(true); setSelO(o); }} onNew={() => { setNewOCid(null); setShowNO(true); }} />}
        {tab === 'offerten'    && <OfferteList offerten={offerten} customers={customers} onOfferteClick={setSelOff} onEdit={(off) => setEditOff(off)} onNew={() => setShowNOff(true)} />}
        {tab === 'materialofferten'       && <OfferteList key="material" variant="material" offerten={offerten} customers={customers} onOfferteClick={setSelOff} onEdit={(off) => setEditOff(off)} onNew={() => setShowNOff(true)} />}
        {tab === 'auftragsbestaetigungen' && <OfferteList key="ab" variant="ab" offerten={offerten} customers={customers} onOfferteClick={setSelOff} onEdit={(off) => setEditOff(off)} onNew={() => setShowNOff(true)} />}
        {tab === 'rechnungen'  && <RechnungenList rechnungen={rechnungen} customers={customers} onRechnungClick={setSelR} onEdit={(r) => setEditR(r)} onNew={() => setShowNR(true)} />}
        {tab === 'anzahlungsrechnungen' && <RechnungenList key="anzahlung" variant="anzahlung" rechnungen={rechnungen.map((r) => withOffertePositionen(r, offerten))} customers={customers} onRechnungClick={setSelR} onEdit={(r) => setEditR(r)} />}
        {tab === 'kunden'      && <CustomerList customers={customers} orders={orders} onCustomerClick={setSelC} onNew={() => setShowNC(true)} />}
        {tab === 'statistiken'   && <StatistikDashboard orders={orders} offerten={offerten} rechnungen={rechnungen} customers={customers} />}
        {tab === 'einstellungen' && (
          <SettingsView
            currentWallpaper={wallpaper}
            onWallpaperChange={handleWallpaperChange}
            bgMode={bgMode}
            bgColor={bgColor}
            onBgColorChange={handleBgColorChange}
            syncStatus={syncStatus}
            userEmail={userEmail}
          />
        )}
      </main>

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

      {showNOff && (() => {
        const closeNOff = () => { setShowNOff(false); setPrefillMat(null); setPrefillCid(undefined); };
        return (
          <Sheet title="Neue Offerte" onClose={closeNOff} full
            barRight={<button onClick={closeNOff} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
            <OfferteForm
              customers={customers}
              onSave={async (data) => { await handleAddOfferte(data); setPrefillMat(null); setPrefillCid(undefined); }}
              onCancel={closeNOff}
              prefillMaterial={prefillMat ?? undefined}
              prefillCustomerId={prefillCid}
            />
          </Sheet>
        );
      })()}

      {importPayload && (
        <Sheet title="Teil importieren" onClose={() => setImportPayload(null)}
          barRight={<button onClick={() => setImportPayload(null)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <ImportPartSheet
            payload={importPayload}
            customers={customers}
            offerten={offerten}
            defaultOfferteId={importTargetId}
            onClose={() => setImportPayload(null)}
            onAddToOfferte={handleAddImportedPartToOfferte}
            onStartNewOfferte={handleStartNewOfferteFromImport}
            onSaveToCatalog={addMaterial}
          />
        </Sheet>
      )}

      {showNR && (
        <Sheet title="Neue Rechnung" onClose={() => setShowNR(false)} full
          barRight={<button onClick={() => setShowNR(false)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <RechnungForm customers={customers} orders={orders} offerten={offerten} onSave={handleAddRechnung} onCancel={() => setShowNR(false)} />
        </Sheet>
      )}

      {selOff && (
        <OfferteDetail
          key={selOff.id}
          offerte={selOff}
          customer={customers.find((c) => c.id === selOff.customerId)}
          onClose={() => setSelOff(null)}
          onUpdate={handleUpdateOfferte}
          onDelete={handleDeleteOfferte}
          onEdit={(off) => { setSelOff(null); setEditOff(off); }}
          onDuplicate={handleDuplicateOfferte}
          onCreateAuftrag={handleCreateAuftragFromOfferte}
          onCreateRechnung={handleCreateRechnungFromOfferte}
          onCreateMaterialofferte={handleCreateMaterialofferte}
          onCreateAnzahlung={handleCreateAnzahlung}
          anzahlung={anzahlungenFor(selOff.id)[0]}
          schlussrechnungNumber={(() => { const a = anzahlungenFor(selOff.id)[0]; return a ? schlussrechnungFor(a.id)?.rechnungNumber : undefined; })()}
          onCreateSchlussrechnung={handleCreateSchlussrechnung}
          view={tab === 'auftragsbestaetigungen' ? 'ab' : undefined}
        />
      )}

      {editOff && (
        <Sheet title={`Offerte #${offerteNr(editOff)} bearbeiten`} onClose={() => setEditOff(null)} full
          barRight={<button onClick={() => setEditOff(null)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <ActiveOfferteBanner offerte={editOff} customer={customers.find((c) => c.id === editOff.customerId)} />
          <OfferteForm key={editOff.id} customers={customers} initial={editOff} onSave={handleSaveEditOfferte} onCancel={() => setEditOff(null)} />
        </Sheet>
      )}

      {selR && (
        <RechnungDetail
          rechnung={withOffertePositionen(selR, offerten)}
          customer={customers.find((c) => c.id === selR.customerId)}
          onClose={() => setSelR(null)}
          onUpdate={handleUpdateRechnung}
          onDelete={handleDeleteRechnung}
          onEdit={(r) => { setSelR(null); setEditR(r); }}
          onCreateSchlussrechnung={handleCreateSchlussrechnung}
          schlussrechnungNumber={schlussrechnungFor(selR.id)?.rechnungNumber}
        />
      )}

      {editR && (
        <Sheet title={`Rechnung #${editR.rechnungNumber} bearbeiten`} onClose={() => setEditR(null)} full
          barRight={<button onClick={() => setEditR(null)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <RechnungForm customers={customers} orders={orders} offerten={offerten} initial={editR} onSave={handleSaveEditRechnung} onCancel={() => setEditR(null)} />
        </Sheet>
      )}

      {selC && !selO && (
        <CustomerDetail
          customer={selC} orders={orders}
          onClose={() => setSelC(null)}
          onEdit={() => setEditC(selC)}
          onNewOrder={() => { setNewOCid(selC.id); setShowNO(true); setSelC(null); }}
          onOrderClick={(o) => { setSelO(o); setSelC(null); }}
          onDelete={() => handleDeleteCustomer(selC.id)}
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

      {updateAvailable && <UpdateBanner />}
    </div>
  );
}
