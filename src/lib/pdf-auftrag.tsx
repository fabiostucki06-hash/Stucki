// Uses jsPDF coordinate-based drawing — no @react-pdf/renderer
import { jsPDF } from 'jspdf';
import type { ArbeitPosition, Customer, Order } from '../types';

// ── Company ───────────────────────────────────────────────────────────────────
const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

// ── Helpers ───────────────────────────────────────────────────────────────────
const dateCH = (iso?: string) => iso ? new Date(iso).toLocaleDateString('de-CH') : '';
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

// ── Layout (mm, A4 = 210 × 297) ──────────────────────────────────────────────
const PW = 210;
const ML = 14;
const BPX = 3;
const TL = ML + BPX;      // 17
const TR = PW - ML - BPX; // 193
const TW = TR - TL;       // 176

// Excel Auftrag: Arbeiten = cols C+D+E (wch 24.57+18.14+10.71=53.42),
//                ZE = col F (wch 13.57).  Total = 66.99
const wArb = Math.round(TW * 53.42 / 66.99); // 140
const wZE  = TW - wArb;                        // 36

const rZE = TR; // right edge of ZE column

function drawDoc(doc: jsPDF, order: Order, customer: Customer | undefined) {
  const PAD = 1;

  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';

  const bItems  = (order.beanstandungen ?? []).filter((b) => b && !b.trim().toLowerCase().startsWith('offerte'));
  const oItems  = (order.offertItems ?? []).map(i => i.text).filter(Boolean);
  const aPos    = (order.positionen ?? []).filter(p => p.typ === 'arbeit') as ArbeitPosition[];
  const hasPosi = aPos.length > 0;

  const allRows: { text: string; ze: string }[] = hasPosi
    ? [...bItems.map(t => ({ text: t, ze: '' })), ...aPos.map(p => ({ text: p.beschreibung, ze: p.ze || '' }))]
    : [...bItems.map(t => ({ text: t, ze: '' })), ...oItems.map(t => ({ text: t, ze: '' }))];

  const zeTotal     = aPos.reduce((s, p) => s + fN(p.ze), 0);
  const beginDatum  = dateCH(order.createdAt);
  const fertigDatum = order.status === 'abgeschlossen' ? dateCH(order.statusChangedAt) : '';

  const norm = () => doc.setFont('helvetica', 'normal');
  const bold = () => doc.setFont('helvetica', 'bold');
  const fs   = (s: number) => doc.setFontSize(s);
  const hLine = (y: number, lw = 0.25) => { doc.setLineWidth(lw); doc.line(ML, y, PW - ML, y); };
  const tL = (t: string, x: number, y: number) => doc.text(String(t), x, y);
  const tR = (t: string, x: number, y: number) => doc.text(String(t), x, y, { align: 'right' });

  let y = 14;

  // ── HEADER ────────────────────────────────────────────────────────────────
  bold(); fs(14);
  tL('Kundenauftrag', ML, y + 5);

  norm(); fs(9);
  tL('Auftragsnummer', ML, y + 11);
  tL(String(order.orderNumber ?? ''), ML + 38, y + 11);

  tR(CO_NAME,  PW - ML, y + 4);
  tR(CO_ADDR,  PW - ML, y + 8.5);
  tR(CO_CITY,  PW - ML, y + 13);
  tR(CO_PHONE, PW - ML, y + 17.5);

  y += 20;
  const boxTop = y;
  y += 2.5;

  // ── VEHICLE BLOCK ─────────────────────────────────────────────────────────
  const RH = 4.5;
  const vRows: [string, string][] = [
    ['Fahrzeug', vehicle],
    ['1. Inv.-Setzung', ''],
    ['Kennzeichen', customer?.kennzeichen ?? ''],
    ['Chassis-Nr.', ''],
    ['Km Stand', customer?.km ?? ''],
    ['Fahrzeugbesitzer', owner],
  ];
  norm(); fs(9);
  for (const [lbl, val] of vRows) {
    tL(lbl, TL + PAD, y + RH * 0.65);
    tL(val, TL + wArb + PAD, y + RH * 0.65);
    y += RH;
  }

  // ── STD.SATZ ROW ──────────────────────────────────────────────────────────
  const RH_S = 6;
  hLine(y);
  norm(); fs(9);
  tL('Std.Satz:', TL + PAD, y + RH_S * 0.62);
  tL('CHF ' + STD_SATZ, TL + wArb + PAD, y + RH_S * 0.62);
  y += RH_S;
  hLine(y);

  // ── TABLE HEADER: Arbeiten | ZE ───────────────────────────────────────────
  const RH_H = 6.5;
  const thY = y + RH_H * 0.65;
  bold(); fs(9);
  tL('Arbeiten', TL + PAD, thY);
  tR('ZE', rZE - PAD, thY);
  y += RH_H;
  hLine(y);

  // ── WORK ROWS (min 15 rows) ───────────────────────────────────────────────
  const posY0 = y;
  norm(); fs(9);
  for (const row of allRows) {
    const bY = y + RH * 0.65;
    tL(row.text, TL + PAD, bY);
    if (row.ze) tR(row.ze, rZE - PAD, bY);
    doc.setLineWidth(0.1);
    doc.line(ML, y + RH, PW - ML, y + RH);
    y += RH;
  }
  if (y - posY0 < 15 * RH) y = posY0 + 15 * RH;

  // ── BLANK SEPARATOR ───────────────────────────────────────────────────────
  hLine(y);
  y += RH;

  // ── ZE-TOTAL ROW ──────────────────────────────────────────────────────────
  const RH_T = 6;
  hLine(y);
  const totY = y + RH_T * 0.62;
  bold(); fs(9);
  tL('ZE-Total', TL + PAD, totY);
  if (zeTotal > 0) tR(zeTotal.toFixed(1), rZE - PAD, totY);
  y += RH_T;
  hLine(y);
  norm();

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 5;
  fs(9);
  tL('ZE basieren auf einer reibungslosen Reparatur', TL + PAD, y);
  if (order.notizen) { y += 4.5; tL(order.notizen, TL + PAD, y); }

  // ── DATES ─────────────────────────────────────────────────────────────────
  y += 13;
  norm(); fs(9);
  tL('Beginndatum', TL + PAD, y);
  bold(); tL(beginDatum, TL + wArb + PAD, y); norm();

  // Extra gap between Beginndatum and Fertigstelldatum (blank row in Excel)
  y += RH + 3;
  tL('Fertigstelldatum', TL + PAD, y);
  bold(); tL(fertigDatum, TL + wArb + PAD, y); norm();
  y += RH;
  tL('Ort', TL + PAD, y);
  bold(); tL(CO_LOC, TL + wArb + PAD, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 14;
  fs(9);
  tL('Zahlungskontitionen bei', TL + PAD, y);
  bold(); tL('10 Tage netto', TL + wArb + PAD, y); norm();
  y += RH;
  tL('Rechnungstellung', TL + PAD, y);

  // ── BOX ───────────────────────────────────────────────────────────────────
  const boxBottom = y + 4;
  doc.setLineWidth(0.3);
  doc.rect(ML, boxTop, PW - 2 * ML, boxBottom - boxTop, 'S');
}

export async function exportOrderPDF(order: Order, customer: Customer | undefined) {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    drawDoc(doc, order, customer);
    doc.save(`Auftrag_${order.orderNumber}_${customer?.nachname ?? 'Kunde'}.pdf`);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
