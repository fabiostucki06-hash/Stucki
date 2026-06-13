import * as XLSX from 'xlsx';
import type { Customer, Offerte, Order } from '../types';

export function exportOfferteExcel(offerte: Offerte, customer: Customer | undefined) {
  const wb = XLSX.utils.book_new();
  const ws: Record<string, unknown> = {};
  const addr = (c: number, r: number) => XLSX.utils.encode_cell({ c, r });
  type Style = Record<string, unknown>;
  const set = (c: number, r: number, v: string | number, s: Style = {}) => {
    ws[addr(c, r)] = { v, t: typeof v === 'number' ? 'n' : 's', s };
  };
  const num = (c: number, r: number, v: number, s: Style = {}) => {
    ws[addr(c, r)] = { v: isNaN(v) ? 0 : v, t: 'n', s };
  };

  const BLK = '000000', YEL = 'FFFF00';
  const bThin = { style: 'thin', color: { rgb: BLK } };
  const bAll = { top: bThin, bottom: bThin, left: bThin, right: bThin };
  const fB = (sz = 10) => ({ bold: true, sz, name: 'Calibri', color: { rgb: BLK } });
  const fN = (sz = 10) => ({ sz, name: 'Calibri', color: { rgb: BLK } });
  const fillY = { patternType: 'solid', fgColor: { rgb: YEL } };
  const alL = { horizontal: 'left', vertical: 'center' };
  const alR = { horizontal: 'right', vertical: 'center' };
  const alC = { horizontal: 'center', vertical: 'center' };

  const datum = new Date(offerte.createdAt || Date.now()).toLocaleDateString('de-CH');
  const fahrzeug = customer ? [customer.marke, customer.modell].filter(Boolean).join(' ') : '';
  const positionen = offerte.positionen || [];
  const totalB = parseFloat(offerte.totalBetrag || '0');
  let r = 0;

  set(0, r, 'Budget Offerte', { font: fB(14), alignment: alL });
  set(4, r, 'Fabio Stucki', { font: fN(9), alignment: alR }); r++;
  set(0, r, 'Offertennummer', { font: fB(), fill: fillY, border: bAll, alignment: alL });
  set(1, r, String(offerte.offertNumber || '–'), { font: fB(), fill: fillY, border: bAll, alignment: alL });
  set(2, r, '', { fill: fillY, border: bAll }); set(3, r, '', { fill: fillY, border: bAll });
  set(4, r, 'Polenstrasse 245', { font: fN(9), alignment: alR }); r++;
  set(4, r, '5112 Thalheim AG', { font: fN(9), alignment: alR }); r++;
  set(4, r, '079 850 18 63', { font: fN(9), alignment: alR }); r++; r++;

  const infoRows: [string, string][] = [
    ['Fahrzeug', fahrzeug],
    ['1. Inv.-Setzung', ''],
    ['Kennzeichen', customer?.kennzeichen || ''],
    ['Chassis-Nr.', ''],
    ['Km Stand', String(customer?.km || '')],
    ['Fahrzeugbesitzer', customer ? `${customer.vorname} ${customer.nachname}` : ''],
  ];
  infoRows.forEach(([l, v]) => {
    set(0, r, l, { font: fN(), border: bAll, alignment: alL });
    set(1, r, v, { font: fN(), border: bAll, alignment: alL });
    [2, 3, 4].forEach((c) => set(c, r, '', { border: bAll })); r++;
  });

  set(0, r, 'Std.Satz:', { font: fN(), border: bAll, alignment: alL });
  set(1, r, 'CHF', { font: fN(), border: bAll, alignment: alC });
  set(2, r, '80.00', { font: fN(), border: bAll, alignment: alL });
  [3, 4].forEach((c) => set(c, r, '', { border: bAll })); r++;

  set(0, r, 'Bezeichnung', { font: fB(), border: bAll, alignment: alL });
  set(1, r, 'Menge', { font: fB(), border: bAll, alignment: alC });
  set(2, r, 'Stk.Preis', { font: fB(), border: bAll, alignment: alC });
  set(3, r, 'Preis (CHF)', { font: fB(), border: bAll, alignment: alC });
  set(4, r, 'ZE', { font: fB(), border: bAll, alignment: alC }); r++;

  const MIN = 10;
  positionen.forEach((pos) => {
    const mat = pos.typ === 'material';
    const rS = { font: fN(9), border: bAll, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } };
    set(0, r, pos.beschreibung || '', rS);
    mat ? num(1, r, parseFloat((pos as { menge: string }).menge) || 1, { font: fN(9), border: bAll, alignment: alC })
        : set(1, r, '', { font: fN(9), border: bAll, alignment: alC });
    mat ? num(2, r, parseFloat((pos as { stueckpreis: string }).stueckpreis) || 0, { font: fN(9), border: bAll, alignment: alR })
        : set(2, r, '', { font: fN(9), border: bAll, alignment: alR });
    num(3, r, parseFloat(pos.preis) || 0, { font: fN(9), border: bAll, alignment: alR });
    set(4, r, !mat && (pos as { ze: string }).ze ? String(parseFloat((pos as { ze: string }).ze)) : '', { font: fN(9), border: bAll, alignment: alC });
    r++;
  });
  for (let i = positionen.length; i < MIN; i++) { [0, 1, 2, 3, 4].forEach((c) => set(c, r, '', { border: bAll })); r++; }

  set(0, r, 'Summe', { font: fN(), border: bAll, alignment: alL });
  [1, 2].forEach((c) => set(c, r, '', { border: bAll }));
  set(3, r, 'CHF', { font: fN(), border: bAll, alignment: alL });
  num(4, r, totalB, { font: fN(), border: bAll, alignment: alR }); r++;
  [0, 1, 2].forEach((c) => set(c, r, '', { border: { top: bThin, bottom: bThin } }));
  set(3, r, 'CHF', { font: fN(9), border: bAll, alignment: alL });
  num(4, r, 0, { font: fN(9), border: bAll, alignment: alR }); r++;
  set(0, r, 'Offertentotal', { font: fB(), border: bAll, alignment: alL });
  [1, 2].forEach((c) => set(c, r, '', { border: bAll }));
  set(3, r, 'CHF', { font: fB(), border: bAll, alignment: alL });
  num(4, r, totalB, { font: fB(), border: bAll, alignment: alR }); r++; r++;

  set(0, r, 'ZE basieren auf einer reibungslosen Reparatur', { font: fN(9), alignment: alL }); r++;
  set(0, r, 'Kleinmaterial-Pauschale wird bei <100 ZE hinzugefügt', { font: fN(9), alignment: alL }); r++; r++; r++;
  set(0, r, 'Datum', { font: fN(), alignment: alR });
  set(1, r, datum, { font: fN(), fill: fillY, border: bAll, alignment: alL }); r++;
  set(0, r, 'Ort', { font: fN(), alignment: alR });
  set(1, r, 'Thalheim AG', { font: fN(), alignment: alL }); r++; r++;
  set(0, r, 'Zahlungskontitionen bei', { font: fN(), alignment: alL });
  set(2, r, '10 Tage netto', { font: fN(), alignment: alL }); r++;
  set(0, r, 'Rechnungstellung', { font: fN(), alignment: alL });

  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }];
  ws['!cols'] = [{ wch: 34 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 1, c: 4 } });
  XLSX.utils.book_append_sheet(wb, ws, 'Offerte');
  XLSX.writeFile(wb, `Offerte_${offerte.offertNumber}_${customer?.nachname ?? 'Kunde'}.xlsx`);
}

export function exportOrderExcel(order: Order, customer: Customer | undefined) {
  const wb = XLSX.utils.book_new();
  const ws: Record<string, unknown> = {};
  const addr = (c: number, r: number) => XLSX.utils.encode_cell({ c, r });
  type Style = Record<string, unknown>;
  const set = (c: number, r: number, v: string | number, s: Style = {}) => {
    ws[addr(c, r)] = { v, t: typeof v === 'number' ? 'n' : 's', s };
  };

  const BLK = '000000', YEL = 'FFFF00';
  const bThin = { style: 'thin', color: { rgb: BLK } };
  const bAll = { top: bThin, bottom: bThin, left: bThin, right: bThin };
  const bB = { bottom: bThin }; const bT = { top: bThin };
  const fB = (sz = 10) => ({ bold: true, sz, name: 'Calibri', color: { rgb: BLK } });
  const fN = (sz = 10) => ({ sz, name: 'Calibri', color: { rgb: BLK } });
  const fillY = { patternType: 'solid', fgColor: { rgb: YEL } };
  const alL = { horizontal: 'left', vertical: 'center' };
  const alR = { horizontal: 'right', vertical: 'center' };
  const alC = { horizontal: 'center', vertical: 'center' };

  const datum = new Date(order.createdAt || Date.now()).toLocaleDateString('de-CH');
  const fahrzeug = customer ? [customer.marke, customer.modell].filter(Boolean).join(' ') : '';
  let r = 0;

  set(0, r, 'Kundenauftrag', { font: fB(14), alignment: alL });
  set(3, r, 'Fabio Stucki', { font: fN(9), alignment: alR }); r++;
  set(0, r, 'Auftragsnummer', { font: fB(), fill: fillY, border: bAll, alignment: alL });
  set(1, r, String(order.orderNumber || '–'), { font: fB(), fill: fillY, border: bAll, alignment: alL });
  set(2, r, '', { fill: fillY, border: bAll });
  set(3, r, 'Polenstrasse 245', { font: fN(9), alignment: alR }); r++;
  set(3, r, '5112 Thalheim AG', { font: fN(9), alignment: alR }); r++;
  set(3, r, '079 850 18 63', { font: fN(9), alignment: alR }); r++; r++;

  const infoRows: [string, string][] = [
    ['Fahrzeug', fahrzeug],
    ['1. Inv.-Setzung', ''],
    ['Kennzeichen', customer?.kennzeichen || ''],
    ['Chassis-Nr.', ''],
    ['Km Stand', String(customer?.km || '')],
    ['Fahrzeugbesitzer', customer ? `${customer.vorname} ${customer.nachname}` : ''],
  ];
  infoRows.forEach(([l, v]) => {
    set(0, r, l, { font: fN(), border: bAll, alignment: alL });
    set(1, r, v, { font: fN(), border: bAll, alignment: alL });
    [2, 3].forEach((c) => set(c, r, '', { border: bAll })); r++;
  });
  [0, 1, 2, 3].forEach((c) => set(c, r, '', { border: bAll })); r++;
  set(0, r, 'Std.Satz:', { font: fN(), border: bAll, alignment: alL });
  set(1, r, 'CHF', { font: fN(), border: bAll, alignment: alC });
  set(2, r, '80.00', { font: fN(), border: bAll, alignment: alL });
  set(3, r, '', { border: bAll }); r++;

  set(0, r, 'Arbeiten', { font: fN(), border: bAll, alignment: alL });
  [1, 2].forEach((c) => set(c, r, '', { border: bAll }));
  set(3, r, 'ZE', { font: fN(), border: bAll, alignment: alC }); r++;

  const workItems = [
    ...(order.beanstandungen || []),
    ...(order.offertItems || []).map((i) => i.text),
  ].filter(Boolean);
  const MIN = 10;
  workItems.forEach((text) => {
    set(0, r, text, { font: fN(9), border: bAll, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
    [1, 2, 3].forEach((c) => set(c, r, '', { border: bAll })); r++;
  });
  for (let i = workItems.length; i < MIN; i++) { [0, 1, 2, 3].forEach((c) => set(c, r, '', { border: bAll })); r++; }

  [0, 1, 2, 3].forEach((c) => set(c, r, '', { border: bB })); r++;
  [0, 1, 2, 3].forEach((c) => set(c, r, '', { border: bT })); r++;
  set(0, r, 'ZE-Total', { font: fB(), border: bAll, alignment: alL });
  [1, 2, 3].forEach((c) => set(c, r, '', { border: bAll })); r++; r++;
  set(0, r, 'ZE basieren auf einer reibungslosen Reparatur', { font: fN(9), alignment: alL }); r++; r++; r++;
  set(0, r, 'Beginndatum', { font: fN(), alignment: alR });
  set(1, r, datum, { font: fN(), fill: fillY, border: bAll, alignment: alL }); r++;
  set(0, r, 'Fertigstelldatum', { font: fN(), alignment: alR });
  set(1, r, '', { font: fN(), fill: fillY, border: bAll, alignment: alL }); r++;
  set(0, r, 'Ort', { font: fN(), alignment: alR });
  set(1, r, 'Thalheim AG', { font: fN(), alignment: alL }); r++; r++;
  set(0, r, 'Zahlungskontitionen bei', { font: fN(), alignment: alL });
  set(2, r, '10 Tage netto', { font: fN(), alignment: alL }); r++;
  set(0, r, 'Rechnungstellung', { font: fN(), alignment: alL });

  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }];
  ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 1, c: 3 } });
  XLSX.utils.book_append_sheet(wb, ws, 'Auftrag');
  XLSX.writeFile(wb, `Auftrag_${order.orderNumber}_${customer?.nachname ?? 'Kunde'}.xlsx`);
}
