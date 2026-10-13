import { useEffect, useRef, useState } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { getMargin } from '../../lib/settings';
import { cleanPartTitle } from '../../lib/partTitle';
import type { Customer, MaterialPosition, Offerte, MaterialCatalogItem } from '../../types';

export interface ImportPayload {
  url?: string;
  text?: string;
  /** Already extracted client-side (e.g. by the desktop bookmarklet, which has
      direct DOM access to the product page) — skips the server-side re-fetch. */
  title?: string;
  price?: string;
  artikelnummer?: string;
  /** Pre-decode raw query values, kept only for the failure-path debug hint
      below (see "what was received vs. decoded"). */
  _rawUrl?: string;
  _rawText?: string;
}

interface ImportPartSheetProps {
  payload: ImportPayload;
  customers: Customer[];
  offerten: Offerte[];
  onClose: () => void;
  onAddToOfferte: (offerteId: string, position: MaterialPosition) => Promise<void>;
  onStartNewOfferte: (position: MaterialPosition, customerId?: string) => void;
  onSaveToCatalog: (item: Omit<MaterialCatalogItem, 'id' | 'createdAt'>) => Promise<void>;
}

interface ParsedPart {
  ok: boolean;
  title: string;
  ek: string;
  artikelnummer: string;
  quelle: string;
  blocked?: boolean;
}

const round2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '');

export default function ImportPartSheet({ payload, customers, offerten, onClose, onAddToOfferte, onStartNewOfferte, onSaveToCatalog }: ImportPartSheetProps) {
  const [loading, setLoading] = useState(true);
  const [beschreibung, setBeschreibung] = useState('');
  const [ek, setEk] = useState('');
  const [stueckpreis, setStueckpreis] = useState('');
  const [menge, setMenge] = useState('1');
  const [artikelnummer, setArtikelnummer] = useState('');
  const [quelle, setQuelle] = useState(payload.url ?? '');
  const [margin] = useState(getMargin());
  const [cid, setCid] = useState('');
  const [targetOfferteId, setTargetOfferteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ raw: string; decoded: string } | null>(null);
  const ekInputRef = useRef<HTMLInputElement>(null);

  const openDrafts = offerten.filter((o) => o.status === 'entwurf' || o.status === 'versendet');

  useEffect(() => {
    // Bookmarklet path: title/price already extracted client-side from the live,
    // JS-rendered product page — more reliable than a server-side re-fetch (which
    // sees raw HTML and can hit anti-bot blocks), so use it directly.
    if (payload.title || payload.price) {
      setBeschreibung(cleanPartTitle(payload.title || ''));
      setEk(payload.price || '');
      setArtikelnummer(payload.artikelnummer || '');
      if (payload.price) setStueckpreis(round2(parseFloat(payload.price) * (1 + margin / 100)));
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/import-part', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data: ParsedPart = await r.json();
        if (cancelled) return;
        setBeschreibung(cleanPartTitle(data.title || ''));
        setEk(data.ek || '');
        setArtikelnummer(data.artikelnummer || '');
        if (data.quelle) setQuelle(data.quelle);
        if (data.ek) setStueckpreis(round2(parseFloat(data.ek) * (1 + margin / 100)));
        if (!data.ok) {
          const raw = payload._rawUrl || payload._rawText || '';
          const decoded = payload.url || payload.text || '';
          console.warn('[Import] auto-detection failed — received vs. decoded:', { raw, decoded, response: data });
          setDebugInfo({ raw, decoded });
          showToast(
            data.blocked
              ? 'Shop blockiert automatische Anfragen – bitte Daten manuell eintragen'
              : 'Konnte nichts automatisch erkennen – bitte manuell ausfüllen',
            'error',
          );
        } else if (data.blocked) {
          showToast('Shop evtl. blockiert – Angaben bitte prüfen', 'error');
        }
      } catch (e) {
        if (!cancelled) {
          const raw = payload._rawUrl || payload._rawText || '';
          const decoded = payload.url || payload.text || '';
          console.warn('[Import] request failed — received vs. decoded:', { raw, decoded, error: e });
          setDebugInfo({ raw, decoded });
          showToast('Import fehlgeschlagen – bitte manuell ausfüllen', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && !ek) ekInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const mengeNum = parseFloat(menge) || 1;
  const ekTotal = (parseFloat(ek) || 0) * mengeNum;
  const vkTotal = (parseFloat(stueckpreis) || 0) * mengeNum;

  function handleEkChange(v: string) {
    setEk(v);
    const n = parseFloat(v);
    if (Number.isFinite(n)) setStueckpreis(round2(n * (1 + margin / 100)));
  }

  function buildPosition(): MaterialPosition | null {
    const sp = parseFloat(stueckpreis) || 0;
    const mg = parseFloat(menge) || 1;
    if (!beschreibung.trim() || !sp) return null;
    return { typ: 'material', beschreibung: beschreibung.trim(), menge: String(mg), stueckpreis: stueckpreis, preis: (sp * mg).toFixed(2), link: quelle || undefined };
  }

  async function handleAddToOfferte() {
    const pos = buildPosition();
    if (!pos) { showToast('Bezeichnung und Verkaufspreis erforderlich', 'error'); return; }
    if (!targetOfferteId) { showToast('Bitte eine Offerte auswählen', 'error'); return; }
    setBusy(true);
    try {
      await onAddToOfferte(targetOfferteId, pos);
      onClose();
    } catch (e) {
      console.error('[Import] add to offerte failed:', e);
    } finally {
      setBusy(false);
    }
  }

  function handleNewOfferte() {
    const pos = buildPosition();
    if (!pos) { showToast('Bezeichnung und Verkaufspreis erforderlich', 'error'); return; }
    onStartNewOfferte(pos, cid || undefined);
  }

  async function handleSaveToCatalog() {
    if (!beschreibung.trim() || !stueckpreis) { showToast('Bezeichnung und Verkaufspreis erforderlich', 'error'); return; }
    setBusy(true);
    try {
      await onSaveToCatalog({ beschreibung: beschreibung.trim(), ek: ek || undefined, stueckpreis, artikelnummer: artikelnummer || undefined, quelle: quelle || undefined });
      onClose();
    } catch (e) {
      console.error('[Import] save to catalog failed:', e);
    } finally {
      setBusy(false);
    }
  }

  const gc: React.CSSProperties = {
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(64px) saturate(240%)',
    WebkitBackdropFilter: 'blur(64px) saturate(240%)',
    border: '1px solid rgba(255,255,255,0.20)',
    borderRadius: 18,
    padding: '10px 12px',
    marginBottom: 16,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), 0 4px 24px rgba(0,0,0,0.06)',
  };
  const gcHdr: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--label2)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    marginBottom: 9, display: 'block',
    textShadow: '0 1px 3px rgba(0,0,0,0.30)',
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
        <Spinner size={28} />
        <span className="sf-subhead" style={{ color: 'var(--label2)' }}>Teil wird erkannt…</span>
      </div>
    );
  }

  return (
    <div>
      {quelle && (
        <div style={{ fontSize: 12, color: 'var(--label3)', marginBottom: 12, wordBreak: 'break-all' }}>
          Quelle: {quelle}
        </div>
      )}

      {debugInfo && (
        <div style={{ fontSize: 11, color: 'var(--label3)', marginBottom: 12, wordBreak: 'break-all', background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 10, padding: '8px 10px' }}>
          <strong style={{ color: 'var(--red)' }}>Debug – automatische Erkennung fehlgeschlagen</strong><br />
          Erhalten: {debugInfo.raw || '(leer)'}<br />
          Entschlüsselt: {debugInfo.decoded || '(leer)'}
        </div>
      )}

      <div style={gc}>
        <span style={gcHdr}>Teil</span>
        <div className="cf-field" style={{ marginBottom: 10 }}>
          <label className="cf-label">Bezeichnung *</label>
          <input className="cf-input" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Ersatzteil…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="cf-field">
            <label className="cf-label">Einkaufspreis (EK)</label>
            <input ref={ekInputRef} className="cf-input" type="number" value={ek} onChange={(e) => handleEkChange(e.target.value)} placeholder="0.00" />
          </div>
          <div className="cf-field">
            <label className="cf-label">Verkaufspreis (VK) *</label>
            <input className="cf-input" type="number" value={stueckpreis} onChange={(e) => setStueckpreis(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="cf-field">
            <label className="cf-label">Menge</label>
            <input className="cf-input" type="number" min={1} value={menge} onChange={(e) => setMenge(e.target.value)} />
          </div>
          <div className="cf-field">
            <label className="cf-label">Artikelnummer</label>
            <input className="cf-input" value={artikelnummer} onChange={(e) => setArtikelnummer(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div className="cf-field">
            <label className="cf-label">EK Gesamt</label>
            <div className="cf-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--label2)' }}>
              {ekTotal ? `CHF ${round2(ekTotal)}` : '–'}
            </div>
          </div>
          <div className="cf-field">
            <label className="cf-label">VK Gesamt</label>
            <div className="cf-input" style={{ display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              {vkTotal ? `CHF ${round2(vkTotal)}` : '–'}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--label3)', marginTop: 8, marginBottom: 0 }}>
          VK = EK + {margin}% Marge (einstellbar unter Einstellungen → Teile-Import).
        </p>
      </div>

      <div style={gc}>
        <span style={gcHdr}>Zu Offerte hinzufügen</span>
        {openDrafts.length > 0 ? (
          <>
            <div className="cf-field" style={{ marginBottom: 10 }}>
              <label className="cf-label">Offene Offerte</label>
              <select className="cf-select" value={targetOfferteId} onChange={(e) => setTargetOfferteId(e.target.value)}>
                <option value="">Auswählen…</option>
                {openDrafts.map((o) => {
                  const c = customers.find((x) => x.id === o.customerId);
                  const statusLabel = o.status === 'entwurf' ? 'Entwurf' : 'Versendet';
                  return <option key={o.id} value={o.id}>#{o.offertNumber} – {o.titel || (c ? `${c.vorname} ${c.nachname}` : 'Offerte')} ({statusLabel})</option>;
                })}
              </select>
            </div>
            <button className="mf-btn-save" style={{ width: '100%' }} onClick={handleAddToOfferte} disabled={busy}>
              {busy ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner size={12} /> Wird hinzugefügt…</span> : 'Zu Offerte hinzufügen'}
            </button>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--label3)', margin: 0 }}>Keine offene Offerte im Entwurf.</p>
        )}
      </div>

      <div style={gc}>
        <span style={gcHdr}>Oder</span>
        <div className="cf-field" style={{ marginBottom: 10 }}>
          <label className="cf-label">Kunde (für neue Offerte)</label>
          <select className="cf-select" value={cid} onChange={(e) => setCid(e.target.value)}>
            <option value="">Später auswählen…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.vorname} {c.nachname} – {c.kennzeichen}</option>)}
          </select>
        </div>
        <button className="btn-system btn-secondary" style={{ marginBottom: 10 }} onClick={handleNewOfferte}>Neue Offerte mit diesem Teil erstellen</button>
        <button className="btn-system btn-secondary" onClick={handleSaveToCatalog} disabled={busy}>Nur im Materialkatalog speichern</button>
      </div>

      <button className="mf-btn-cancel" style={{ width: '100%' }} onClick={onClose}>Abbrechen</button>
    </div>
  );
}
