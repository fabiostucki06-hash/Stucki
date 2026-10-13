import { useRef, useState, useSyncExternalStore } from 'react';
import Spinner from '../ui/Spinner';
import { showToast } from '../ui/Toast';
import { getMargin, getActiveOfferteId, setActiveOfferteId, subscribeActiveOfferteId } from '../../lib/settings';
import { parsePartLink } from '../../lib/utils';
import { cleanPartTitle } from '../../lib/partTitle';
import type { Customer, MaterialPosition, Offerte } from '../../types';

interface QuickAddPartProps {
  /** Offerten that can still take positions (Entwurf / Versendet). */
  offerten: Offerte[];
  customers: Customer[];
  onAdd: (offerteId: string, position: MaterialPosition) => Promise<void>;
}

/** One-line part entry on the Offerten tab: pick the Offerte being worked on
    once, then keep adding parts to it. The text field takes either a plain
    description or a pasted shop link — a link is resolved to the product
    title (and, if no price was typed, to EK + margin) via /api/import-part. */
export default function QuickAddPart({ offerten, customers, onAdd }: QuickAddPartProps) {
  const selected = useSyncExternalStore(subscribeActiveOfferteId, getActiveOfferteId);
  const [text, setText] = useState('');
  const [preis, setPreis] = useState('');
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);

  if (!offerten.length) return null;
  // The remembered Offerte may have been accepted or deleted in the meantime.
  const active = offerten.find((o) => o.id === selected) ?? offerten[0];

  async function add() {
    if (busy) return;
    const raw = text.trim();
    if (!raw) { showToast('Bitte Artikelbezeichnung oder Link eingeben', 'error'); return; }

    const link = /^(https?:\/\/|www\.)\S+$/i.test(raw) ? parsePartLink(raw) : null;
    let beschreibung = raw;
    let vk = parseFloat(preis);

    setBusy(true);
    try {
      if (link) {
        beschreibung = `Teil von ${link.host}`;
        try {
          const r = await fetch('/api/import-part', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: link.href }),
          });
          const data: { title?: string; ek?: string } = await r.json();
          if (data.title) beschreibung = cleanPartTitle(data.title);
          const ek = parseFloat(data.ek ?? '');
          if (!Number.isFinite(vk) && Number.isFinite(ek)) vk = ek * (1 + getMargin() / 100);
        } catch (e) {
          // Shop unreachable / blocked: the part is still added under the
          // placeholder name, with its link, and can be renamed in the Offerte.
          console.warn('[QuickAdd] could not resolve link:', e);
        }
      }

      const hasPreis = Number.isFinite(vk) && vk > 0;
      const stueckpreis = hasPreis ? vk.toFixed(2) : '0.00';
      await onAdd(active.id, { typ: 'material', beschreibung, menge: '1', stueckpreis, preis: stueckpreis, link: link?.href });
      if (!hasPreis) showToast('Ohne Preis hinzugefügt – bitte in der Offerte ergänzen', 'info');
      else if (link && beschreibung.startsWith('Teil von ')) showToast('Bezeichnung nicht erkannt – bitte in der Offerte anpassen', 'info');
      setText('');
      setPreis('');
      textRef.current?.focus();
    } catch (e) {
      console.error('[QuickAdd] add failed:', e);
    } finally {
      setBusy(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };

  return (
    <section className="df-card qa">
      <div className="df-card-hdr">
        <span className="df-title">Teil schnell hinzufügen</span>
        <span className="df-hint">Bezeichnung oder Autodoc-Link</span>
      </div>
      <div className="cf-field" style={{ marginBottom: 12 }}>
        <label className="cf-label" htmlFor="qa-offerte">Aktive Offerte</label>
        <select id="qa-offerte" className="cf-select" value={active.id} onChange={(e) => setActiveOfferteId(e.target.value)}>
          {offerten.map((o) => {
            const c = customers.find((x) => x.id === o.customerId);
            return (
              <option key={o.id} value={o.id}>
                #{o.offertNumber} – {c ? `${c.vorname} ${c.nachname}` : 'Kein Kunde'}{o.titel ? ` · ${o.titel}` : ''} ({o.status === 'entwurf' ? 'Entwurf' : 'Versendet'})
              </option>
            );
          })}
        </select>
      </div>
      <div className="qa-row">
        <input
          ref={textRef} className="df-inp qa-text"
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter}
          placeholder="Artikelbezeichnung oder Autodoc-Link…" aria-label="Artikelbezeichnung oder Autodoc-Link"
          autoCapitalize="sentences" disabled={busy}
        />
        <input
          className="df-inp num" type="number" inputMode="decimal" step="0.05" min={0}
          value={preis} onChange={(e) => setPreis(e.target.value)} onKeyDown={onEnter}
          placeholder="Preis CHF" aria-label="Preis CHF" disabled={busy}
        />
        <button type="button" className="mf-btn-save qa-btn" onClick={add} disabled={busy}>
          {busy
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner size={12} /> Wird hinzugefügt…</span>
            : `Zu #${active.offertNumber} hinzufügen`}
        </button>
      </div>
    </section>
  );
}
