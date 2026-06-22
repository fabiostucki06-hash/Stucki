import { jsPDF } from 'jspdf';
import type { ArbeitPosition, Customer, MaterialPosition, Offerte } from '../types';

const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

const todayCH = () => new Date().toLocaleDateString('de-CH');
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => n === 0 ? 'CHF –' : `CHF ${n.toFixed(2)}`;

// ── Layout: A4 = 210 × 297 mm ─────────────────────────────────────────────────
const PW = 210;
const ML = 15;
const TL = ML, TR = PW - ML, TW = TR - TL; // 15 … 195, width = 180

const RH   = 5;    // data row height mm
const RH_H = 6.5;  // table header row
const RH_S = 6;    // section row (vehicle, std.satz, summe)
const RH_T = 7;    // total row
const PAD  = 2;    // horizontal cell padding
const BL   = 0.68; // text baseline inside row (from top)
const VL   = 55;   // vehicle-info label column width

// Table columns – Bezeichnung | Menge | Stk.Preis | Preis (CHF) | ZE
const wBez = 75, wMen = 20, wStk = 30, wPre = 30, wZE = TW - wBez - wMen - wStk - wPre; // 25

const x0 = TL;           // 15  – Bezeichnung left
const x1 = x0 + wBez;   // 90  – Menge left   / column divider
const x2 = x1 + wMen;   // 110 – Stk.Preis left
const x3 = x2 + wStk;   // 140 – Preis left
const x4 = x3 + wPre;   // 170 – ZE left
// TR = 195 = x4 + wZE

function drawDoc(doc: jsPDF, offerte: Offerte, customer: Customer | undefined) {
  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';
  const date    = todayCH();

  const allPos       = offerte.positionen ?? [];
  const kleinteilPos = allPos.find(
    (p): p is MaterialPosition =>
      p.typ === 'material' && p.beschreibung === 'Kleinteil Pauschale',
  );
  const kleinteilAmt = fN(kleinteilPos?.preis);
  const filteredPos  = allPos.filter(
    p => !(p.typ === 'material' && (p as MaterialPosition).beschreibung === 'Kleinteil Pauschale'),
  );
  const pureMatTotal = fN(offerte.totalMaterial) - kleinteilAmt;
  const totalArb     = fN(offerte.totalArbeit);
  const totalBetrag  = fN(offerte.totalBetrag);

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
  tL('Budget Offerte', TL, y + 7);

  norm(); fs(8); rgb(120, 120, 120);
  tL('Offertennummer', TL, y + 13);
  bold(); fs(8.5); rgb(0, 0, 0);
  tL(String(offerte.offertNumber ?? ''), TL + 37, y + 13);
  norm();

  bold(); fs(9); rgb(0, 0, 0);
  tR(CO_NAME,  TR, y + 6);
  norm(); fs(7.5); rgb(90, 90, 90);
  tR(CO_ADDR,  TR, y + 11);
  tR(CO_CITY,  TR, y + 16);
  tR(CO_PHONE, TR, y + 21);
  rgb(0, 0, 0);

  y += 26;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y); // strong separator

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

  // ── TABLE HEADER ──────────────────────────────────────────────────────────
  frgb(22, 22, 22); doc.rect(TL, y, TW, RH_H, 'F');
  const thY = y + RH_H * BL;
  bold(); fs(8.5); rgb(255, 255, 255);
  tL('Bezeichnung',   x0 + PAD,  thY);
  tR('Menge',         x2 - PAD,  thY);
  tR('Stk.Preis',     x3 - PAD,  thY);
  tR('Preis (CHF)',   x4 - PAD,  thY);
  tR('ZE',            TR - PAD,  thY);
  rgb(0, 0, 0);
  y += RH_H;

  // ── POSITION ROWS (min 15) ────────────────────────────────────────────────
  const posY0 = y;
  norm(); fs(8.5);

  for (const p of filteredPos) {
    const mp = p.typ === 'material' ? (p as MaterialPosition) : null;
    const ap = p.typ === 'arbeit'   ? (p as ArbeitPosition)   : null;
    const ty = y + RH * BL;

    rgb(0, 0, 0);
    tL(clip(p.beschreibung, wBez - PAD * 2), x0 + PAD, ty);
    rgb(50, 50, 50);
    if (mp && fN(mp.menge))       tR(String(fN(mp.menge)),            x2 - PAD, ty);
    if (mp && fN(mp.stueckpreis)) tR(fN(mp.stueckpreis).toFixed(2),   x3 - PAD, ty);
    if (fN(p.preis))              tR(fN(p.preis).toFixed(2),           x4 - PAD, ty);
    if (ap?.ze)                   tR(String(ap.ze),                    TR - PAD,  ty);
    rgb(0, 0, 0);

    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }
  for (let i = filteredPos.length; i < 15; i++) {
    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }

  // vertical column dividers spanning header + rows
  const tableBottom = y;
  vLine(x1, posY0 - RH_H, tableBottom, 0.15);
  vLine(x2, posY0 - RH_H, tableBottom, 0.15);
  vLine(x3, posY0 - RH_H, tableBottom, 0.15);
  vLine(x4, posY0 - RH_H, tableBottom, 0.15);

  // ── SUMME ─────────────────────────────────────────────────────────────────
  lw(0.3); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  frgb(247, 247, 247); doc.rect(TL, y, TW, RH_S, 'F');
  const sumY = y + RH_S * BL;
  norm(); fs(8.5); rgb(80, 80, 80); tL('Summe', x0 + PAD, sumY);
  bold(); rgb(0, 0, 0);
  if (pureMatTotal > 0) tR(pureMatTotal.toFixed(2), x4 - PAD, sumY);
  if (totalArb > 0)     tR(totalArb.toFixed(2),      TR - PAD,  sumY);
  norm();
  y += RH_S;

  if (kleinteilAmt > 0) {
    const subH = 4;
    fs(7.5); rgb(110, 110, 110);
    tL('Kleinteil Pauschale', x0 + PAD, y + subH * BL);
    tR(kleinteilAmt.toFixed(2), x4 - PAD, y + subH * BL);
    rgb(0, 0, 0);
    y += subH;
  }

  // ── TOTAL ─────────────────────────────────────────────────────────────────
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  frgb(22, 22, 22); doc.rect(TL, y, TW, RH_T, 'F');
  const totY = y + RH_T * BL;
  bold(); fs(9); rgb(255, 255, 255);
  tL('Offertentotal', x0 + PAD, totY);
  tR(chf(totalBetrag), TR - PAD, totY);
  rgb(0, 0, 0);
  y += RH_T;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  norm();

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 6;
  fs(7.5); rgb(130, 130, 130);
  tL('* ZE basieren auf einer reibungslosen Reparatur', TL, y);
  y += 4;
  tL('* Kleinmaterial-Pauschale wird bei über 100 ZE automatisch hinzugefügt', TL, y);
  if (offerte.notizen) {
    y += 6;
    bold(); fs(8.5); rgb(0, 0, 0); tL('Notizen:', TL, y); norm(); y += 4;
    const lines = doc.splitTextToSize(offerte.notizen, TW);
    for (const line of lines as string[]) { tL(line, TL, y); y += 4; }
  }
  rgb(0, 0, 0);

  // ── DATE / LOCATION ───────────────────────────────────────────────────────
  y += 10;
  const col2 = TL + VL;
  fs(8.5);
  rgb(100, 100, 100); tL('Datum', TL, y); bold(); rgb(0, 0, 0); tL(date,   col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Ort',   TL, y); bold(); rgb(0, 0, 0); tL(CO_LOC, col2, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 10;
  rgb(100, 100, 100); tL('Zahlungskonditionen', TL, y); bold(); rgb(0, 0, 0); tL('10 Tage netto', col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Rechnungstellung',    TL, y); norm(); rgb(0, 0, 0);
}

export async function exportOffertePDF(offerte: Offerte, customer: Customer | undefined) {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    drawDoc(doc, offerte, customer);
    doc.save(`Offerte_${offerte.offertNumber}_${customer?.nachname ?? 'Kunde'}.pdf`);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
