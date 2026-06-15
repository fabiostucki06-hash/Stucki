import { useState } from 'react';
import type { Order, Offerte, Customer } from '../../types';

interface Props {
  orders: Order[];
  offerten: Offerte[];
  customers: Customer[];
}

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

const fCHF = (n: number) => "CHF " + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

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

const LockIcon = () => (
  <svg width={14} height={14} viewBox="0 0 18 18" fill="none" style={{ color: 'var(--label3)' }}>
    <rect x={2.5} y={8} width={13} height={9} rx={2} stroke="currentColor" strokeWidth={1.4}/>
    <path d="M5.5 8V5.5a3.5 3.5 0 017 0V8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"/>
    <circle cx={9} cy={12.5} r={1} fill="currentColor"/>
  </svg>
);

export default function StatistikDashboard({ orders, offerten, customers }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const prevYear  = viewMonth === 0 ? viewYear - 1 : viewYear;

  const inMonth = (dateStr: string, y: number, m: number) => {
    const d = new Date(dateStr);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  const orderRevenue = (y: number, m: number) =>
    orders
      .filter((o) => (o.status === 'zahlung_erhalten' || o.status === 'abgeschlossen') && inMonth(o.createdAt, y, m))
      .reduce((s, o) => s + (parseFloat(o.rechnungsBetrag ?? '0') || 0), 0);

  const offerteRevenue = (y: number, m: number) =>
    offerten
      .filter((o) => o.status === 'angenommen' && inMonth(o.createdAt, y, m))
      .reduce((s, o) => s + (parseFloat(o.totalBetrag ?? '0') || 0), 0);

  const curOrderRev   = orderRevenue(viewYear, viewMonth);
  const curOfferteRev = offerteRevenue(viewYear, viewMonth);
  const curTotal      = curOrderRev + curOfferteRev;

  const prevOrderRev   = orderRevenue(prevYear, prevMonth);
  const prevOfferteRev = offerteRevenue(prevYear, prevMonth);
  const prevTotal      = prevOrderRev + prevOfferteRev;

  const delta = prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : null;

  const monthOrders      = orders.filter((o) => inMonth(o.createdAt, viewYear, viewMonth));
  const doneOrders       = monthOrders.filter((o) => o.status === 'abgeschlossen' || o.status === 'zahlung_erhalten');
  const newCustomers     = customers.filter((c) => inMonth(c.createdAt, viewYear, viewMonth));
  const monthOfferten    = offerten.filter((o) => inMonth(o.createdAt, viewYear, viewMonth));
  const acceptedOfferten = monthOfferten.filter((o) => o.status === 'angenommen');

  // Build service breakdown from all-time data
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
  const serviceEntries = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxCount = serviceEntries[0]?.[1] ?? 1;

  function navMonth(dir: -1 | 1) {
    if (dir === 1 && isCurrentMonth) return;
    let nm = viewMonth + dir;
    let ny = viewYear;
    if (nm < 0)  { nm = 11; ny--; }
    if (nm > 11) { nm = 0;  ny++; }
    setViewMonth(nm); setViewYear(ny);
  }

  const BAR_COLORS = ['var(--blue)','var(--teal)','var(--green)','var(--orange)','var(--purple)','var(--indigo)','var(--red)','var(--yellow)'];

  const miniLabel = { fontSize: 11, fontWeight: 600 as const, color: 'var(--label2)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ padding: '16px 16px 0', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <LockIcon />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--label3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Chef-Blick</span>
        </div>
        <h1 className="sf-title1" style={{ paddingTop: 2 }}>Statistiken</h1>
      </div>

      <div style={{ padding: '12px 16px 0' }}>

        {/* ── Monatsnavigation ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.60)', borderRadius: 12, padding: '10px 16px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70), 0 4px 12px rgba(0,0,0,0.06)' }}>
          <button onClick={() => navMonth(-1)} style={{ width: 32, height: 32, background: 'rgba(0,122,255,0.10)', border: 'none', borderRadius: 8, color: 'var(--blue)', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.4px', color: 'var(--label)' }}>{MONTHS_DE[viewMonth]} {viewYear}</div>
            {isCurrentMonth && <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 1 }}>Aktueller Monat</div>}
          </div>
          <button onClick={() => navMonth(1)} disabled={isCurrentMonth} style={{ width: 32, height: 32, background: isCurrentMonth ? 'transparent' : 'rgba(0,122,255,0.10)', border: 'none', borderRadius: 8, color: isCurrentMonth ? 'var(--label4)' : 'var(--blue)', cursor: isCurrentMonth ? 'default' : 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        {/* ── Umsatz ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          {/* Current month */}
          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={miniLabel}>Dieser Monat</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue)', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 6 }}>{fCHF(curTotal)}</div>
            {delta !== null ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs. Vormonat
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--label3)' }}>Kein Vormonat</div>
            )}
            <div style={{ position: 'absolute', right: -8, bottom: -10, fontSize: 48, opacity: 0.06 }}>💰</div>
          </div>
          {/* Previous month */}
          <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={miniLabel}>{MONTHS_DE[prevMonth]}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--label2)', letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 6 }}>{fCHF(prevTotal)}</div>
            <div style={{ fontSize: 12, color: 'var(--label3)' }}>Vormonat</div>
            <div style={{ position: 'absolute', right: -8, bottom: -10, fontSize: 48, opacity: 0.06 }}>📊</div>
          </div>
        </div>

        {/* Umsatz Aufschlüsselung */}
        <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>Erledigte Aufträge</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', letterSpacing: '-0.3px' }}>{fCHF(curOrderRev)}</span>
          </div>
          <div style={{ height: '0.5px', background: 'var(--sep)', marginBottom: 10 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--label2)' }}>Offerten angenommen</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.3px' }}>{fCHF(curOfferteRev)}</span>
          </div>
        </div>

        {/* ── Aktivität ── */}
        <p className="section-header" style={{ paddingLeft: 0 }}>Aktivität</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Aufträge',   value: monthOrders.length,      icon: '🔧', color: 'var(--blue)'   },
            { label: 'Erledigt',   value: doneOrders.length,       icon: '✅', color: 'var(--green)'  },
            { label: 'Neu Kunden', value: newCustomers.length,     icon: '👤', color: 'var(--purple)' },
            { label: 'Offerten',   value: monthOfferten.length,    icon: '📄', color: 'var(--orange)' },
            { label: 'Angenommen', value: acceptedOfferten.length, icon: '🤝', color: 'var(--teal)'   },
          ].map((s) => (
            <div key={s.label} className="glass-panel" style={{ padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, letterSpacing: '-0.4px', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--label2)', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Beliebteste Arbeiten ── */}
        <p className="section-header" style={{ paddingLeft: 0 }}>Beliebteste Arbeiten</p>
        {serviceEntries.length === 0 ? (
          <div className="glass-panel" style={{ padding: 28, textAlign: 'center', color: 'var(--label3)', fontSize: 15, marginBottom: 20 }}>
            Noch keine Daten vorhanden.
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '18px 16px', marginBottom: 20 }}>
            {serviceEntries.map(([label, count], idx) => {
              const pct = Math.round((count / maxCount) * 100);
              const color = BAR_COLORS[idx % BAR_COLORS.length];
              return (
                <div key={label} style={{ marginBottom: idx < serviceEntries.length - 1 ? 14 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--label)', letterSpacing: '-0.2px' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginLeft: 8 }}>{Math.floor(count)}</span>
                  </div>
                  <div style={{ height: 7, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
