import { useState } from 'react';
import type { Order, Offerte, Rechnung, Customer } from '../../types';
import { SFChevron } from '../Icons';
import { summeGewinn, zaehltFuerGewinn } from '../../lib/statistik';

interface Props {
  orders: Order[];
  offerten: Offerte[];
  rechnungen: Rechnung[];
  customers: Customer[];
}

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

const fBetrag = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
const fCHF = (n: number) => `CHF ${fBetrag(n)}`;

const SERVICE_RULES: [string, RegExp][] = [
  ['Inspektion / Service', /inspektion|service|wartung|pickerl/i],
  ['Ölwechsel',            /öl|ölwechsel|oel\b|oilchange/i],
  ['Reifen / Pneu',        /reifen|pneu|radwechsel/i],
  ['Bremsen',              /bremse|bremsen|bremsbelag|bremssattel|bremscheibe/i],
  ['MFK-Vorbereitung',     /mfk|motorfahrzeug|hauptuntersuchung/i],
  ['Klimaanlage',          /klima/i],
  ['Diagnose',             /diagnose|fehlersuche|fehlercode|obd/i],
  ['Getriebe',             /getriebe/i],
  ['Kupplung',             /kupplung/i],
  ['Batterie / Elektrik',  /batterie|elektrik|anlasser|generator/i],
  ['Zahnriemen',           /zahnriemen|steuerriemen/i],
  ['Karosserie',           /lack|karosserie|delle|unfall|kratzer/i],
];

function categorizeText(text: string): string | null {
  for (const [label, re] of SERVICE_RULES) if (re.test(text)) return label;
  return null;
}

const inMonth = (dateStr: string, y: number, m: number) => {
  const d = new Date(dateStr);
  return d.getFullYear() === y && d.getMonth() === m;
};

export default function StatistikDashboard({ orders, offerten, rechnungen, customers }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const prevDate = new Date(viewYear, viewMonth - 1, 1);

  const gewinnIn = (y: number, m: number) =>
    summeGewinn(rechnungen.filter((r) => zaehltFuerGewinn(r) && inMonth(r.createdAt, y, m)));

  const cur = gewinnIn(viewYear, viewMonth);
  const prev = gewinnIn(prevDate.getFullYear(), prevDate.getMonth());
  const delta = prev.gewinn > 0 ? ((cur.gewinn - prev.gewinn) / prev.gewinn) * 100 : null;
  const marge = cur.umsatz > 0 ? (cur.gewinn / cur.umsatz) * 100 : null;
  const paidCount = rechnungen.filter((r) => zaehltFuerGewinn(r) && inMonth(r.createdAt, viewYear, viewMonth)).length;
  const offen = rechnungen.filter((r) => r.status === 'versendet');
  const offenSumme = offen.reduce((s, r) => s + (parseFloat(r.totalBetrag ?? '0') || 0), 0);

  // 12 months up to today; an older selected month moves the window back.
  const monthsBack = (now.getFullYear() - viewYear) * 12 + now.getMonth() - viewMonth;
  const windowEnd = monthsBack < 12 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(viewYear, viewMonth, 1);
  const verlauf = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(windowEnd.getFullYear(), windowEnd.getMonth() - 11 + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), gewinn: gewinnIn(d.getFullYear(), d.getMonth()).gewinn };
  });
  const maxGewinn = Math.max(...verlauf.map((v) => v.gewinn), 1);

  const monthOrders      = orders.filter((o) => inMonth(o.createdAt, viewYear, viewMonth));
  const doneOrders       = monthOrders.filter((o) => o.status === 'abgeschlossen' || o.status === 'zahlung_erhalten');
  const newCustomers     = customers.filter((c) => inMonth(c.createdAt, viewYear, viewMonth));
  const monthOfferten    = offerten.filter((o) => inMonth(o.createdAt, viewYear, viewMonth));
  const acceptedOfferten = monthOfferten.filter((o) => o.status === 'angenommen');

  // Service breakdown from all-time data
  const serviceCounts: Record<string, number> = {};
  for (const o of orders) {
    for (const b of (o.beanstandungen ?? [])) {
      const cat = categorizeText(b);
      if (cat) serviceCounts[cat] = (serviceCounts[cat] ?? 0) + 1;
    }
  }
  for (const off of offerten) {
    for (const pos of (off.positionen ?? [])) {
      const cat = categorizeText(pos.beschreibung);
      if (cat) serviceCounts[cat] = (serviceCounts[cat] ?? 0) + 0.5;
    }
  }
  const serviceEntries = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCount = serviceEntries[0]?.[1] ?? 1;

  function navMonth(dir: -1 | 1) {
    if (dir === 1 && isCurrentMonth) return;
    const d = new Date(viewYear, viewMonth + dir, 1);
    setViewMonth(d.getMonth()); setViewYear(d.getFullYear());
  }

  const teile = [
    { key: 'arbeit', label: 'Arbeit', hint: 'Gewinn', value: cur.arbeit },
    { key: 'pauschalen', label: 'Pauschalen', hint: '100% Gewinn', value: cur.pauschalen },
    { key: 'material', label: 'Material & Versand', hint: 'kein Gewinn', value: cur.material },
  ];

  return (
    <div className="stx">
      <header className="stx-head">
        <div>
          <h1 className="sf-title1">Statistiken</h1>
        </div>
        <div className="stx-stepper">
          <button onClick={() => navMonth(-1)} aria-label="Vorheriger Monat"><span className="stx-flip"><SFChevron size={14} /></span></button>
          <span className="stx-month">{MONTHS_DE[viewMonth]} {viewYear}</span>
          <button onClick={() => navMonth(1)} disabled={isCurrentMonth} aria-label="Nächster Monat"><SFChevron size={14} /></button>
        </div>
      </header>

      <section className="stx-kpis">
        <div className="stx-card stx-hero">
          <span className="stx-kpi-label">Reiner Gewinn</span>
          <span className="stx-hero-value">{fCHF(cur.gewinn)}</span>
          <span className="stx-kpi-sub">
            {delta !== null && (
              <span className={`stx-delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%</span>
            )}
            {delta !== null ? `vs. ${MONTHS_DE[prevDate.getMonth()]} (${fCHF(prev.gewinn)})` : 'Kein Vergleich zum Vormonat'}
          </span>
        </div>
        <div className="stx-card">
          <span className="stx-kpi-label">Umsatz</span>
          <span className="stx-kpi-value">{fCHF(cur.umsatz)}</span>
          <span className="stx-kpi-sub">{paidCount} bezahlte {paidCount === 1 ? 'Rechnung' : 'Rechnungen'}</span>
        </div>
        <div className="stx-card">
          <span className="stx-kpi-label">Gewinnanteil</span>
          <span className="stx-kpi-value">{marge !== null ? `${marge.toFixed(1)}%` : '–'}</span>
          <span className="stx-kpi-sub">vom Umsatz</span>
        </div>
        <div className="stx-card">
          <span className="stx-kpi-label">Offene Rechnungen</span>
          <span className="stx-kpi-value">{fCHF(offenSumme)}</span>
          <span className="stx-kpi-sub">{offen.length} versendet, alle Monate</span>
        </div>
      </section>

      <div className="stx-columns">
        <section>
          <p className="section-header stx-section">Gewinn, letzte 12 Monate</p>
          <div className="stx-card stx-chart" role="group" aria-label="Gewinn pro Monat">
            {verlauf.map((v) => {
              const selected = v.y === viewYear && v.m === viewMonth;
              const label = `${MONTHS_DE[v.m]} ${v.y}: ${fCHF(v.gewinn)}`;
              return (
                <button key={`${v.y}-${v.m}`} className={`stx-bar${selected ? ' selected' : ''}`} onClick={() => { setViewYear(v.y); setViewMonth(v.m); }} aria-label={label} aria-pressed={selected}>
                  <span className="stx-tip">{label}</span>
                  <span className="stx-bar-track">
                    <span className="stx-bar-fill" style={{ height: v.gewinn > 0 ? `max(3px, ${(v.gewinn / maxGewinn) * 100}%)` : 0 }} />
                  </span>
                  <span className="stx-bar-label">{MONTHS_DE[v.m].slice(0, 3)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="section-header stx-section">Umsatz nach Herkunft</p>
          <div className="stx-card">
            {cur.umsatz > 0 && (
              <div className="stx-stack" role="img" aria-label={teile.map((t) => `${t.label} ${fCHF(t.value)}`).join(', ')}>
                {teile.filter((t) => t.value > 0).map((t) => (
                  <span key={t.key} className={`stx-seg ${t.key}`} style={{ flexGrow: t.value }} title={`${t.label}: ${fCHF(t.value)}`} />
                ))}
              </div>
            )}
            {teile.map((t) => (
              <div key={t.key} className="stx-row">
                <span className={`stx-swatch ${t.key}`} />
                <span className="stx-row-label">{t.label}<small>{t.hint}</small></span>
                <span className="stx-row-pct">{cur.umsatz > 0 ? `${Math.round((t.value / cur.umsatz) * 100)}%` : '–'}</span>
                <span className="stx-row-value">{fBetrag(t.value)}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="section-header stx-section">Aktivität im Monat</p>
          <div className="stx-card stx-activity">
            {[
              ['Aufträge', monthOrders.length],
              ['Erledigt', doneOrders.length],
              ['Neue Kunden', newCustomers.length],
              ['Offerten', monthOfferten.length],
              ['Angenommen', acceptedOfferten.length],
            ].map(([label, value]) => (
              <div key={label} className="stx-activity-item">
                <span className="stx-activity-value">{value}</span>
                <span className="stx-kpi-sub">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="section-header stx-section">Beliebteste Arbeiten</p>
          <div className="stx-card">
            {serviceEntries.length === 0 ? (
              <p className="stx-empty">Noch keine Daten vorhanden.</p>
            ) : serviceEntries.map(([label, count]) => (
              <div key={label} className="stx-service">
                <span className="stx-service-label">{label}</span>
                <span className="stx-service-track"><span style={{ width: `${(count / maxCount) * 100}%` }} /></span>
                <span className="stx-service-count">{Math.floor(count)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
