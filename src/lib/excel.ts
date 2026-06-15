import ExcelJS from 'exceljs';
import { storage } from './supabase';
import type { ArbeitPosition, Customer, MaterialPosition, Offerte, Order } from '../types';

// ── cell-text extraction ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCellText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r: { text: string }) => r.text).join('').trim();
    if ('formula' in value || 'sharedFormula' in value) return String(value.result ?? '').trim();
    if ('text' in value) return String(value.text).trim();
  }
  return '';
}

// ── label-search helpers ──────────────────────────────────────────────────────

type XSheet = ExcelJS.Worksheet;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XCell = any;

/** Returns the cell immediately to the right of the first cell whose text equals `label`. */
function rightOf(sheet: XSheet, label: string): XCell | null {
  let result: XCell = null;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (result) return;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (result) return;
      if (getCellText(cell.value) === label) {
        result = sheet.getCell(cell.row, (cell as XCell).col + 1);
      }
    });
  });
  return result;
}

/** Sets a cell value without touching its style. */
function write(cell: XCell | null, value: string | number | null) {
  if (!cell || value === null) return;
  cell.value = value;
}

const todayCH = () => new Date().toLocaleDateString('de-CH');

// ── line-items table locator ───────────────────────────────────────────────────

interface ColMap { bez: number; menge: number; stkPreis: number; preis: number; ze: number }
interface TableInfo { headerRow: number; cols: ColMap }

function findTable(sheet: XSheet, headerLabel: string): TableInfo | null {
  let found: TableInfo | null = null;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (found) return;
    const map: Partial<ColMap> = {};
    let isTarget = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = getCellText(cell.value);
      if (t === headerLabel)      { isTarget = true; map.bez = (cell as XCell).col; }
      else if (t === 'Menge')     map.menge    = (cell as XCell).col;
      else if (t === 'Stk.Preis') map.stkPreis = (cell as XCell).col;
      else if (t === 'Preis (CHF)') map.preis  = (cell as XCell).col;
      else if (t === 'ZE')        map.ze        = (cell as XCell).col;
    });
    if (isTarget) {
      found = {
        headerRow: row.number,
        cols: { bez: map.bez ?? 1, menge: map.menge ?? 2, stkPreis: map.stkPreis ?? 3, preis: map.preis ?? 4, ze: map.ze ?? 5 },
      };
    }
  });
  return found;
}

// ── shared-formula fix ───────────────────────────────────────────────────────
// ExcelJS clones shared formulas via { sharedFormula: 'masterAddr', result }
// When we modify the sheet and re-serialize, the clone→master relationship can
// be violated ("master must exist above and or left of clone").  Strip it out
// by converting every clone to either a standalone formula (if a formula string
// is available) or a plain value (using the cached result).
function unshareFormulas(sheet: XSheet) {
  sheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = cell.value as any;
      if (v && typeof v === 'object' && 'sharedFormula' in v) {
        if (v.formula) {
          cell.value = { formula: v.formula, result: v.result };
        } else {
          cell.value = v.result ?? null;
        }
      }
    });
  });
}

// ── vehicle/customer block ────────────────────────────────────────────────────

function fillVehicleBlock(sheet: XSheet, customer: Customer | undefined) {
  const fahrzeug = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  write(rightOf(sheet, 'Fahrzeug'),         fahrzeug);
  write(rightOf(sheet, '1. Inv.-Setzung'),  '');
  write(rightOf(sheet, 'Kennzeichen'),      customer?.kennzeichen ?? '');
  write(rightOf(sheet, 'Chassis-Nr.'),      '');
  write(rightOf(sheet, 'Km Stand'),         customer?.km ?? '');
  write(rightOf(sheet, 'Fahrzeugbesitzer'), customer ? `${customer.vorname} ${customer.nachname}` : '');
}

// ── browser download helper ───────────────────────────────────────────────────

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Offerte export ────────────────────────────────────────────────────────────

export async function exportOfferteExcel(offerte: Offerte, customer: Customer | undefined) {
  try {
    const buffer = await storage.fetchTemplate('Offerte_Vorlage');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    unshareFormulas(sheet);

    write(rightOf(sheet, 'Offertennummer'), offerte.offertNumber ?? '');
    fillVehicleBlock(sheet, customer);

    const positionen = offerte.positionen ?? [];
    const table = findTable(sheet, 'Bezeichnung');
    if (table) {
      positionen.forEach((pos, i) => {
        const row = sheet.getRow(table.headerRow + 1 + i);
        row.getCell(table.cols.bez).value = pos.beschreibung ?? '';
        if (pos.typ === 'material') {
          const mp = pos as MaterialPosition;
          row.getCell(table.cols.menge).value    = parseFloat(mp.menge) || '';
          row.getCell(table.cols.stkPreis).value = parseFloat(mp.stueckpreis) || '';
        }
        row.getCell(table.cols.preis).value = parseFloat(pos.preis) || '';
        if (pos.typ === 'arbeit') {
          row.getCell(table.cols.ze).value = parseFloat((pos as ArbeitPosition).ze) || '';
        }
      });
    }

    write(rightOf(sheet, 'Datum'), todayCH());

    await downloadWorkbook(wb, `Offerte_${offerte.offertNumber}_${customer?.nachname ?? 'Kunde'}.xlsx`);
  } catch (err) {
    alert(`Excel-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Auftrag export ─────────────────────────────────────────────────────────────

export async function exportOrderExcel(order: Order, customer: Customer | undefined) {
  try {
    const buffer = await storage.fetchTemplate('Auftrag_Vorlage');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    unshareFormulas(sheet);

    write(rightOf(sheet, 'Auftragsnummer'), order.orderNumber ?? '');
    fillVehicleBlock(sheet, customer);

    const workItems = [
      ...(order.beanstandungen ?? []),
      ...(order.offertItems ?? []).map(i => i.text),
    ].filter(Boolean);

    const table = findTable(sheet, 'Bezeichnung') ?? findTable(sheet, 'Arbeiten');
    if (table) {
      workItems.forEach((text, i) => {
        const row = sheet.getRow(table.headerRow + 1 + i);
        row.getCell(table.cols.bez).value = text;
      });
    }

    write(rightOf(sheet, 'Datum'), todayCH());

    await downloadWorkbook(wb, `Auftrag_${order.orderNumber}_${customer?.nachname ?? 'Kunde'}.xlsx`);
  } catch (err) {
    alert(`Excel-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
