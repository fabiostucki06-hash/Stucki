import { jsPDF } from 'jspdf';
import type { ArbeitPosition, Customer, Order } from '../types';

const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

const dateCH = (iso?: string) => iso ? new Date(iso).toLocaleDateString('de-CH') : '';
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

// ── Layout: A4 = 210 × 297 mm ─────────────────────────────────────────────────
const PW = 210;
const ML = 15;
const TL = ML, TR = PW - ML, TW = TR - TL; // 15 … 195, width = 180

const RH   = 5;    // data row height mm
const RH_H = 6.5;  // table header row
const RH_S = 6;    // section row (vehicle, std.satz)
const RH_T = 7;    // total row
const PAD  = 2;    // horizontal cell padding
const BL   = 0.68; // text baseline inside row (from top)
const VL   = 55;   // vehicle-info label column width

// Table columns – Arbeiten | ZE
const wArb = 150, wZE = TW - wArb; // 30

const x0 = TL;           // 15  – Arbeiten left
const x1 = x0 + wArb;   // 165 – ZE left / column divider
// TR = 195

function drawDoc(doc: jsPDF, order: Order, customer: Customer | undefined) {
  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';

  const bItems = (order.beanstandungen ?? []).filter(
    b => b && !b.trim().toLowerCase().startsWith('offerte'),
  );
  const oItems = (order.offertItems ?? []).map(i => i.text).filter(Boolean);
  const aPos   = (order.positionen ?? []).filter(p => p.typ === 'arbeit') as ArbeitPosition[];

  const allRows: { text: string; ze: string }[] = aPos.length > 0
    ? [...bItems.map(t => ({ text: t, ze: '' })), ...aPos.map(p => ({ text: p.beschreibung, ze: p.ze || '' }))]
    : [...bItems.map(t => ({ text: t, ze: '' })), ...oItems.map(t => ({ text: t, ze: '' }))];

  const zeTotal     = aPos.reduce((s, p) => s + fN(p.ze), 0);
  const beginDatum  = dateCH(order.createdAt);
  const fertigDatum = order.status === 'abgeschlossen' ? dateCH(order.statusChangedAt) : '';

  const norm  = () => doc.setFont('helvetica', 'normal');
  const bold  = () => doc.setFont('helvetica', 'bold');
  const fs    = (s: number) => doc.setFontSize(s);
  const rgb   = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const drgb  = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b);
  const frgb  = (r: number, g: number, b: number) => doc.setFillColor(r, g, b);
  const lw    = (w: number) => doc.setLineWidth(w);

  const hLine = (y: number, xa = TL, xb = TR, w = 0.15) => {
    lw(w); drgb(180, 180, 180); doc.line(xa, y, xb, y); drgb(0, 0, 0);
  };
  const vLine = (x: number, y1: number, y2: number, w = 0.15) => {
    lw(w); drgb(180, 180, 180); doc.line(x, y1, x, y2); drgb(0, 0, 0);
  };
  const tL = (t: string, x: number, y: number) => doc.text(String(t), x, y);
  const tR = (t: string, x: number, y: number) => doc.text(String(t), x, y, { align: 'right' });
  const clip = (t: string, maxW: number): string => {
    const s = String(t);
    if (doc.getTextWidth(s) <= maxW) return s;
    let r = s;
    while (r.length > 1 && doc.getTextWidth(r + '…') > maxW) r = r.slice(0, -1);
    return r + '…';
  };

  let y = 12;

  // ── HEADER ────────────────────────────────────────────────────────────────
  bold(); fs(15); rgb(0, 0, 0);
  tL('Kundenauftrag', TL, y + 7);

  norm(); fs(8); rgb(120, 120, 120);
  tL('Auftragsnummer', TL, y + 13);
  bold(); fs(8.5); rgb(0, 0, 0);
  tL(String(order.orderNumber ?? ''), TL + 37, y + 13);
  norm();

  bold(); fs(9); rgb(0, 0, 0);
  tR(CO_NAME,  TR, y + 6);
  norm(); fs(7.5); rgb(90, 90, 90);
  tR(CO_ADDR,  TR, y + 11);
  tR(CO_CITY,  TR, y + 16);
  tR(CO_PHONE, TR, y + 21);
  rgb(0, 0, 0);

  y += 26;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);

  // ── VEHICLE INFO ──────────────────────────────────────────────────────────
  const vRows: [string, string][] = [
    ['Fahrzeug',          vehicle || '–'],
    ['1. Inv.-Setzung',   ''],
    ['Kennzeichen',       customer?.kennzeichen ?? '–'],
    ['Chassis-Nr.',       ''],
    ['Km-Stand',          customer?.km ? String(customer.km) + ' km' : '–'],
    ['Fahrzeugbesitzer',  owner || '–'],
  ];
  norm(); fs(8.5);
  for (const [lbl, val] of vRows) {
    const ty = y + RH_S * BL;
    rgb(100, 100, 100); tL(lbl, TL + PAD, ty);
    rgb(0, 0, 0);       bold(); tL(val, TL + VL, ty); norm();
    hLine(y + RH_S, TL, TR, 0.1);
    y += RH_S;
  }

  // ── STD.SATZ ──────────────────────────────────────────────────────────────
  frgb(247, 247, 247); doc.rect(TL, y, TW, RH_S, 'F');
  const ssY = y + RH_S * BL;
  fs(8.5); rgb(100, 100, 100); tL('Std.Satz', TL + PAD, ssY);
  bold(); rgb(0, 0, 0); tL('CHF ' + STD_SATZ, TL + VL, ssY); norm();
  y += RH_S;
  lw(0.4); drgb(0, 0, 0); doc.line(TL, y, TR, y);

  // ── TABLE HEADER: Arbeiten | ZE ───────────────────────────────────────────
  frgb(22, 22, 22); doc.rect(TL, y, TW, RH_H, 'F');
  const thY = y + RH_H * BL;
  bold(); fs(8.5); rgb(255, 255, 255);
  tL('Arbeiten', x0 + PAD, thY);
  tR('ZE',       TR - PAD, thY);
  rgb(0, 0, 0);
  y += RH_H;

  // ── WORK ROWS (min 15) ────────────────────────────────────────────────────
  const posY0 = y;
  norm(); fs(8.5);

  for (const row of allRows) {
    const ty = y + RH * BL;
    rgb(0, 0, 0);
    tL(clip(row.text, wArb - PAD * 2), x0 + PAD, ty);
    if (row.ze) { rgb(50, 50, 50); tR(row.ze, TR - PAD, ty); rgb(0, 0, 0); }
    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }
  for (let i = allRows.length; i < 15; i++) {
    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }

  // column divider spanning header + rows
  vLine(x1, posY0 - RH_H, y, 0.15);

  // ── ZE-TOTAL ──────────────────────────────────────────────────────────────
  lw(0.3); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  frgb(22, 22, 22); doc.rect(TL, y, TW, RH_T, 'F');
  const totY = y + RH_T * BL;
  bold(); fs(9); rgb(255, 255, 255);
  tL('ZE-Total', x0 + PAD, totY);
  if (zeTotal > 0) tR(zeTotal.toFixed(1), TR - PAD, totY);
  rgb(0, 0, 0);
  y += RH_T;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  norm();

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 6;
  fs(7.5); rgb(130, 130, 130);
  tL('* ZE basieren auf einer reibungslosen Reparatur', TL, y);
  if (order.notizen) {
    y += 6;
    bold(); fs(8.5); rgb(0, 0, 0); tL('Notizen:', TL, y); norm(); y += 4;
    const lines = doc.splitTextToSize(order.notizen, TW);
    for (const line of lines as string[]) { tL(line, TL, y); y += 4; }
  }
  rgb(0, 0, 0);

  // ── DATES ─────────────────────────────────────────────────────────────────
  y += 10;
  const col2 = TL + VL;
  fs(8.5);
  rgb(100, 100, 100); tL('Beginndatum',     TL, y); bold(); rgb(0, 0, 0); tL(beginDatum,  col2, y); norm(); y += 7;
  rgb(100, 100, 100); tL('Fertigstelldatum', TL, y); bold(); rgb(0, 0, 0); tL(fertigDatum, col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Ort',              TL, y); bold(); rgb(0, 0, 0); tL(CO_LOC,      col2, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 10;
  rgb(100, 100, 100); tL('Zahlungskonditionen', TL, y); bold(); rgb(0, 0, 0); tL('10 Tage netto', col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Rechnungstellung',    TL, y); norm(); rgb(0, 0, 0);
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
