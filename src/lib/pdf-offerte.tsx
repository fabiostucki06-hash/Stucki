import { jsPDF } from 'jspdf';
import { formatDateCH, buildDocumentFilename, materialZuerst } from './utils';
import { CO_NAME, CO_ADDR, CO_CITY, CO_PHONE, CO_LOC, STD_SATZ } from './company';
import { PAGE_TOP, PAGE_BOTTOM, addPageNumbers } from './pdf-paging';
import { offerteNr, offerteZahlungszeilen, offerteNotizen, anzahlungErforderlich, anzahlungAufteilung, ANZAHLUNG_PROZENT } from './offerte-docs';
import { archiveToDrive } from './drive';
import type { ArbeitPosition, Customer, MaterialPosition, Offerte } from '../types';

const todayCH = () => formatDateCH(new Date());
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => n === 0 ? 'CHF –' : `CHF ${n.toFixed(2)}`;

// ── Layout: A4 = 210 × 297 mm ─────────────────────────────────────────────────
const PW = 210;
const ML = 15;
const TL = ML, TR = PW - ML, TW = TR - TL; // 15 … 195, width = 180

const RH   = 5;    // data row height mm
const RH_H = 6.5;  // table header row
const RH_S = 6;    // section row (vehicle, std.satz, subtotals)
const RH_T = 7;    // total row
const PAD  = 2;    // horizontal cell padding
const BL   = 0.68; // text baseline inside row (from top)
const VL   = 55;   // vehicle-info label column width

// Table columns – Bezeichnung | Menge | Stk.Preis | Preis (CHF) | ZE
const wBez = 75, wMen = 20, wStk = 30, wPre = 30; // 25

const x0 = TL;           // 15  – Bezeichnung left
const x1 = x0 + wBez;   // 90  – Menge left   / column divider
const x2 = x1 + wMen;   // 110 – Stk.Preis left
const x3 = x2 + wStk;   // 140 – Preis left
const x4 = x3 + wPre;   // 170 – ZE left
// TR = 195 = x4 + wZE

/** 'ab' renders the same document as Auftragsbestätigung with completion date and signature block. */
type DocMode = 'offerte' | 'ab';

function drawDoc(doc: jsPDF, offerte: Offerte, customer: Customer | undefined, mode: DocMode, ownSignature?: string) {
  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';
  const isAB    = mode === 'ab';
  const ab      = offerte.ab ?? {};
  const date    = isAB && ab.datum ? formatDateCH(ab.datum) : todayCH();
  const title   = isAB ? 'Auftragsbestätigung' : offerte.art === 'material' ? 'Materialofferte' : 'Budget Offerte';

  const allPos       = offerte.positionen ?? [];
  const kleinteilPos = allPos.find(
    (p): p is MaterialPosition =>
      p.typ === 'material' && p.beschreibung === 'Kleinteil Pauschale',
  );
  const kleinteilAmt = fN(kleinteilPos?.preis);
  const filteredPos  = materialZuerst(allPos.filter(
    p => !(p.typ === 'material' && (p as MaterialPosition).beschreibung === 'Kleinteil Pauschale'),
  ));
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
  const fits = (h: number) => y + h <= PAGE_BOTTOM;
  const newPage = () => { doc.addPage('a4', 'portrait'); y = PAGE_TOP; };

  // ── HEADER ────────────────────────────────────────────────────────────────
  bold(); fs(15); rgb(0, 0, 0);
  tL(title, TL, y + 7);

  norm(); fs(8); rgb(120, 120, 120);
  tL(isAB ? 'Gemäss Offerte' : 'Offertennummer', TL, y + 13);
  bold(); fs(8.5); rgb(0, 0, 0);
  tL(offerteNr(offerte), TL + 37, y + 13);
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
    ['1. Inv.-Setzung',   customer?.erstzulassung ? formatDateCH(customer.erstzulassung) : '–'],
    ['Kennzeichen',       customer?.kennzeichen ?? '–'],
    ['Chassis-Nr.',       customer?.chassisnummer ?? '–'],
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

  // ── TABLE HEADER (repeated on every page the table continues on) ─────────
  const tableHeader = () => {
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
    norm(); fs(8.5);
  };
  // vertical column dividers spanning header + rows of the current page
  let segTop = y;
  const dividers = (bottom: number) => {
    vLine(x1, segTop, bottom, 0.15);
    vLine(x2, segTop, bottom, 0.15);
    vLine(x3, segTop, bottom, 0.15);
    vLine(x4, segTop, bottom, 0.15);
  };
  tableHeader();

  // ── POSITION ROWS (min 15) ────────────────────────────────────────────────
  for (const p of filteredPos) {
    if (!fits(RH)) { dividers(y); newPage(); segTop = y; tableHeader(); }
    const mp = p.typ === 'material' ? (p as MaterialPosition) : null;
    const ap = p.typ === 'arbeit'   ? (p as ArbeitPosition)   : null;
    const ty = y + RH * BL;

    rgb(0, 0, 0);
    tL(clip(p.beschreibung, wBez - PAD * 2), x0 + PAD, ty);
    rgb(50, 50, 50);
    if (mp && fN(mp.menge))       tR(String(fN(mp.menge)),            x2 - PAD, ty);
    if (mp && fN(mp.stueckpreis)) tR(fN(mp.stueckpreis).toFixed(2),   x3 - PAD, ty);
    if (fN(p.preis))              tR(fN(p.preis).toFixed(2),           x4 - PAD, ty);
    // ZE column: Arbeit time, or the time billed with a material position.
    const zeWert = fN(ap?.ze ?? mp?.ze);
    if (zeWert)                   tR(String(zeWert),                   TR - PAD,  ty);
    rgb(0, 0, 0);

    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }
  for (let i = filteredPos.length; i < 15 && fits(RH); i++) {
    hLine(y + RH, TL, TR, 0.1);
    y += RH;
  }
  dividers(y);

  // ── ZWISCHENSUMMEN: Material, Arbeit, Kleinteil Pauschale ────────────────
  // One right-aligned row each, so the split between parts and labour shows at
  // a glance; a type without positions (e.g. Materialofferte: no Arbeit) is left
  // out. Subtotals, Total and Anzahlung stay together on one page.
  const hatMaterial = filteredPos.some((p) => p.typ === 'material') || pureMatTotal > 0;
  const hatArbeit   = filteredPos.some((p) => p.typ === 'arbeit')   || totalArb > 0;
  const subRows: [string, number][] = [
    ...(hatMaterial || !hatArbeit ? [['Material Total', pureMatTotal] as [string, number]] : []),
    ...(hatArbeit || !hatMaterial ? [['Arbeit Total', totalArb] as [string, number]] : []),
    ...(kleinteilAmt > 0 ? [['Kleinteil Pauschale', kleinteilAmt] as [string, number]] : []),
  ];
  const mitAnzahlung = anzahlungErforderlich(offerte);
  if (!fits(RH_S * subRows.length + RH_T + (mitAnzahlung ? RH_S * 2 : 0))) newPage();
  lw(0.3); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  subRows.forEach(([label, betrag], i) => {
    frgb(247, 247, 247); doc.rect(TL, y, TW, RH_S, 'F');
    if (i > 0) hLine(y, TL, TR, 0.1);
    const subY = y + RH_S * BL;
    norm(); fs(8.5); rgb(80, 80, 80); tL(label, x0 + PAD, subY);
    bold(); rgb(0, 0, 0); tR(chf(betrag), TR - PAD, subY);
    norm();
    y += RH_S;
  });

  // ── TOTAL ─────────────────────────────────────────────────────────────────
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  frgb(22, 22, 22); doc.rect(TL, y, TW, RH_T, 'F');
  const totY = y + RH_T * BL;
  bold(); fs(9); rgb(255, 255, 255);
  tL(isAB ? 'Auftragstotal' : 'Offertentotal', x0 + PAD, totY);
  tR(chf(totalBetrag), TR - PAD, totY);
  rgb(0, 0, 0);
  y += RH_T;
  lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  norm();

  // ── ANZAHLUNG: only when the Offerte asks for it ─────────────────────────
  if (mitAnzahlung) {
    const { anzahlung, rest } = anzahlungAufteilung(totalBetrag);
    const anzY = y + RH_S * BL;
    frgb(235, 243, 255); doc.rect(TL, y, TW, RH_S, 'F');
    bold(); fs(8.5); rgb(0, 0, 0);
    // Only a Materialofferte carries the Anzahlung: the parts are ordered once it's paid.
    tL(`Fällige Anzahlung (${ANZAHLUNG_PROZENT}%) – zahlbar vor Materialbestellung`, x0 + PAD, anzY);
    tR(chf(anzahlung), TR - PAD, anzY);
    norm();
    y += RH_S;
    hLine(y, TL, TR, 0.1);
    const restY = y + RH_S * BL;
    rgb(100, 100, 100);
    tL(`Restbetrag ${100 - ANZAHLUNG_PROZENT}% – mit der Schlussrechnung`, x0 + PAD, restY);
    tR(chf(rest), TR - PAD, restY);
    rgb(0, 0, 0);
    y += RH_S;
    lw(0.5); drgb(0, 0, 0); doc.line(TL, y, TR, y);
  }

  // ── NOTES ─────────────────────────────────────────────────────────────────
  y += 6;
  if (!fits(4)) newPage();
  fs(7.5); rgb(130, 130, 130);
  if (allPos.some((p) => p.typ === 'arbeit')) {
    tL('* ZE basieren auf einer reibungslosen Reparatur', TL, y);
    y += 4;
    tL('* Kleinmaterial-Pauschale wird bei über 100 ZE automatisch hinzugefügt', TL, y);
  } else {
    tL('* Materialpreise gemäss aktuellem Lieferantenpreis', TL, y);
  }
  const notizen = offerteNotizen(offerte.notizen, anzahlungErforderlich(offerte));
  if (notizen) {
    y += 6;
    if (!fits(8)) newPage();
    bold(); fs(8.5); rgb(0, 0, 0); tL('Notizen:', TL, y); norm(); y += 4;
    const lines = doc.splitTextToSize(notizen, TW);
    for (const line of lines as string[]) {
      if (!fits(0)) { newPage(); norm(); fs(8.5); rgb(0, 0, 0); }
      tL(line, TL, y); y += 4;
    }
  }
  rgb(0, 0, 0);

  // ── DATE / LOCATION ───────────────────────────────────────────────────────
  const col2 = TL + VL;
  fs(8.5);
  const payLines = offerteZahlungszeilen(offerte)
    .flatMap((l) => doc.splitTextToSize(l, TR - col2) as string[]);
  // Date, location and payment terms stay together.
  if (!fits(10 + 5 + 10 + payLines.length * 4.5 + 5)) newPage();
  y += 10;
  rgb(100, 100, 100); tL('Datum', TL, y); bold(); rgb(0, 0, 0); tL(date,   col2, y); norm(); y += 5;
  rgb(100, 100, 100); tL('Ort',   TL, y); bold(); rgb(0, 0, 0); tL(isAB && ab.ort ? ab.ort : CO_LOC, col2, y); norm();

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  y += 10;
  rgb(100, 100, 100); tL('Zahlungskonditionen', TL, y);
  bold(); rgb(0, 0, 0);
  payLines.forEach((l, i) => { if (i > 0) y += 4.5; tL(l, col2, y); });
  norm(); y += 5;
  rgb(100, 100, 100); tL('Rechnungstellung',    TL, y); norm(); rgb(0, 0, 0);

  if (!isAB) return;

  // ── AB: FERTIGSTELLUNG + UNTERSCHRIFT ─────────────────────────────────────
  // The whole block stays on one page.
  // Two equal signature blocks side by side: Werkstatt (Ort, Datum, Name and
  // own signature from the settings) left, Kunde right with every field
  // all blank: Ort, Datum, Name and Unterschrift are lines for the customer.
  const SIG_H = 18, SIG_W = 80;
  const colK = TL + TW / 2 + 5;
  if (!fits(10 + 10 + 5 + 13.5 + 3 + SIG_H + 5)) newPage();
  y += 10;
  rgb(100, 100, 100); tL('Ungefähre Fertigstellung', TL, y);
  bold(); rgb(0, 0, 0); tL(ab.fertigstellung?.trim() || '–', col2, y); norm();

  y += 10;
  bold(); fs(8.5); tL('Auftrag bestätigt', TL, y); norm(); y += 5;

  const sigBox = (x: number, role: string, ort: string, datum: string, name: string, img: string | undefined) => {
    fs(7.5); bold(); rgb(100, 100, 100); tL(role.toUpperCase(), x, y); norm();
    fs(8.5); rgb(100, 100, 100); tL('Ort, Datum', x, y + 4.5);
    const ortDatum = [ort, datum].filter(Boolean).join(', ');
    if (ortDatum) { rgb(0, 0, 0); tL(clip(ortDatum, SIG_W - 20), x + 20, y + 4.5); }
    else hLine(y + 5.5, x + 20, x + SIG_W, 0.3);
    rgb(100, 100, 100); tL('Name', x, y + 9);
    if (name) { bold(); rgb(0, 0, 0); tL(clip(name, SIG_W - 20), x + 20, y + 9); norm(); }
    else hLine(y + 10, x + 20, x + SIG_W, 0.3);
    const top = y + 12;
    if (img?.startsWith('data:image/png')) {
      try { doc.addImage(img, 'PNG', x, top, SIG_H * 3, SIG_H); } catch { /* unreadable image: leave the line blank */ }
    }
    hLine(top + SIG_H, x, x + SIG_W, 0.3);
    fs(7.5); rgb(100, 100, 100); tL(`Unterschrift ${role.split(' / ').pop()}`, x, top + SIG_H + 4);
  };
  sigBox(TL, 'Auftragnehmer / Werkstatt', ab.ort || CO_LOC, date, CO_NAME, ownSignature);
  sigBox(colK, 'Auftraggeber / Kunde', '', '', '', undefined);
  fs(8.5); rgb(0, 0, 0);
}

function exportDoc(offerte: Offerte, customer: Customer | undefined, mode: DocMode, ownSignature?: string) {
  const docType = mode === 'ab' ? 'Auftragsbestätigung' : offerte.art === 'material' ? 'Materialofferte' : 'Offerte';
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    drawDoc(doc, offerte, customer, mode, ownSignature);
    addPageNumbers(doc, TR);
    const filename = buildDocumentFilename(customer, docType, offerteNr(offerte));
    doc.save(`${filename}.pdf`);
    void archiveToDrive(doc, mode === 'ab' ? 'Auftragsbestätigungen' : offerte.art === 'material' ? 'Materialofferten' : 'Offerten', filename);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function exportOffertePDF(offerte: Offerte, customer: Customer | undefined) {
  exportDoc(offerte, customer, 'offerte');
}

/** ownSignature: the Auftragnehmer signature stored once in the settings. */
export async function exportAuftragsbestaetigungPDF(offerte: Offerte, customer: Customer | undefined, ownSignature?: string) {
  exportDoc(offerte, customer, 'ab', ownSignature);
}
