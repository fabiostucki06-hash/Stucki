import { useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { showToast } from '../ui/Toast';
import { getActiveOfferteId, setActiveOfferteId, subscribeActiveOfferteId } from '../../lib/settings';
import { isOpenOfferte, useActiveOfferte } from '../../hooks/useActiveOfferte';
import type { Customer, Offerte } from '../../types';

const customerName = (c: Customer | undefined) => (c ? `${c.vorname} ${c.nachname}` : 'Kein Kunde');

/** Small "Aktiv" chip for the active Offerte's row. */
export function ActiveOfferteBadge() {
  return <span className="ao-badge">Aktiv</span>;
}

/** The only way an Offerte becomes (or stops being) the active one: an
    explicit click. Merely opening or editing an Offerte never changes it. */
function toggleActive(offerte: Offerte, isActive: boolean) {
  setActiveOfferteId(isActive ? '' : offerte.id);
  showToast(isActive ? `Offerte #${offerte.offertNumber} abgewählt` : `Offerte #${offerte.offertNumber} ist jetzt aktiv`, isActive ? 'info' : 'success');
}

/** Compact activate/deactivate button for an Offerte's row in the list.
    Renders nothing for Offerten that can't take positions any more. */
export function ActiveOfferteToggle({ offerte }: { offerte: Offerte }) {
  const activeId = useSyncExternalStore(subscribeActiveOfferteId, getActiveOfferteId);
  if (!isOpenOfferte(offerte)) return null;
  const isActive = activeId === offerte.id;
  const label = isActive ? 'Aktive Offerte abwählen' : 'Als aktive Offerte setzen';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleActive(offerte, isActive); }}
      className={`ao-toggle${isActive ? ' on' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
    >
      <span aria-hidden="true">🎯</span>
    </button>
  );
}

interface ActiveOfferteBannerProps {
  offerte: Offerte;
  customer: Customer | undefined;
}

/** Status bar at the top of an Offerte's detail / edit sheet: shows whether
    this Offerte is the active one and lets the user switch that. Renders
    nothing for Offerten that can't take positions any more. */
export function ActiveOfferteBanner({ offerte, customer }: ActiveOfferteBannerProps) {
  const activeId = useSyncExternalStore(subscribeActiveOfferteId, getActiveOfferteId);
  if (!isOpenOfferte(offerte)) return null;
  const isActive = activeId === offerte.id;
  return (
    <div className={`ao-banner no-print${isActive ? '' : ' off'}`} role="status">
      <span aria-hidden="true">🎯</span>
      {isActive ? (
        <span className="ao-banner-txt">
          Aktive Offerte: <strong>#{offerte.offertNumber} – {customerName(customer)}</strong>
          <span className="ao-banner-hint">Importierte Teile landen hier</span>
        </span>
      ) : (
        <span className="ao-banner-txt">
          Nicht aktiv
          <span className="ao-banner-hint">Importierte Teile landen nicht in dieser Offerte</span>
        </span>
      )}
      <button type="button" className={`ao-btn${isActive ? ' off' : ''}`} onClick={() => toggleActive(offerte, isActive)}>
        {isActive ? 'Abwählen' : 'Für Import auswählen'}
      </button>
    </div>
  );
}

interface ActiveOffertePillProps {
  offerten: Offerte[];
  customers: Customer[];
}

/** Persistent top-bar indicator of the active Offerte. Tapping it opens a
    menu to switch to another open Offerte or to deselect, which is what the
    part import (bookmarklet / share sheet) reads next. */
export function ActiveOffertePill({ offerten, customers }: ActiveOffertePillProps) {
  const active = useActiveOfferte(offerten);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const open = offerten
    .filter(isOpenOfferte)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!open.length) return null;

  function toggleMenu() {
    if (menuPos) { setMenuPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenuPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }
  const pick = (id: string) => { setActiveOfferteId(id); setMenuPos(null); };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        className={`ao-pill${active ? '' : ' none'}`}
        title={active ? 'Aktive Offerte wechseln oder abwählen' : 'Aktive Offerte wählen'}
        aria-haspopup="menu"
        aria-expanded={!!menuPos}
      >
        <span aria-hidden="true">🎯</span>
        {active
          ? <span><span className="ao-long">Offerte </span>#{active.offertNumber}<span className="ao-long"> aktiv</span></span>
          : <span>Keine<span className="ao-long"> Offerte aktiv</span></span>}
      </button>

      {/* Portalled: the nav bar's backdrop-filter would otherwise become the
          containing block for these fixed-position layers. */}
      {menuPos && createPortal(
        <>
          <div onClick={() => setMenuPos(null)} style={{ position: 'fixed', inset: 0, zIndex: 498 }} />
          <div className="context-menu ao-menu" role="menu" style={{ top: menuPos.top, right: menuPos.right }}>
            <div className="ao-menu-hdr">Aktive Offerte für den Teile-Import</div>
            {open.map((o) => (
              <button
                key={o.id}
                role="menuitemradio"
                aria-checked={o.id === active?.id}
                className={`context-item${o.id === active?.id ? ' ao-current' : ''}`}
                onClick={() => pick(o.id)}
              >
                <span className="ao-menu-lbl">#{o.offertNumber} – {customerName(customers.find((c) => c.id === o.customerId))}</span>
                {o.id === active?.id && <ActiveOfferteBadge />}
              </button>
            ))}
            {active && (
              <button role="menuitem" className="context-item" style={{ color: 'var(--red)' }} onClick={() => pick('')}>
                <span>Abwählen</span><span className="context-item-icon" aria-hidden="true">✕</span>
              </button>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
