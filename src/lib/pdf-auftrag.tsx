import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { ArbeitPosition, Customer, Order } from '../types';

// ── Company constants (match template) ───────────────────────────────────────
const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

// ── Helpers ───────────────────────────────────────────────────────────────────
const dateCH = (iso?: string) => iso ? new Date(iso).toLocaleDateString('de-CH') : '';
const fN     = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
    paddingTop: 35,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },

  // Header outside the box
  hdr:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  hdrLeft:  {},
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  numRow:   { flexDirection: 'row', marginTop: 3 },
  numLbl:   { fontSize: 9, width: 90 },
  numVal:   { fontSize: 9 },
  hdrRight: { alignItems: 'flex-end' },
  coLine:   { fontSize: 8.5 },

  // Outer border box
  box: {
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: 10,
  },

  // Vehicle block
  vRow: { flexDirection: 'row', marginBottom: 2 },
  vLbl: { fontSize: 9, width: 100 },
  vVal: { fontSize: 9, flex: 1 },

  // Std.Satz row
  stdRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
    marginTop: 8,
  },
  stdLbl: { fontSize: 9, width: 50 },
  stdCHF: { fontSize: 9, width: 30 },
  stdVal: { fontSize: 9 },

  // Work items table — two columns: Arbeiten + ZE
  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
  },
  th: { fontSize: 9 },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: '#999',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
    minHeight: 15,
  },
  td: { fontSize: 9 },

  // Columns
  cArbeiten: { flex: 1 },
  cZE:       { width: 52, textAlign: 'right' },

  // ZE-Total rows
  zeBlankRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    paddingVertical: 3,
  },
  zeTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderTopStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    paddingVertical: 3,
  },
  zeTotalLbl: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  zeTotalVal: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: 52, textAlign: 'right' },

  // Notes
  notesWrap: { marginTop: 12 },
  noteLine:  { fontSize: 9, marginBottom: 2 },

  // Dates section (centered)
  dateSection: { alignItems: 'center', marginTop: 16 },
  datePair:    { flexDirection: 'row', marginBottom: 3 },
  dateLbl:     { fontSize: 9, width: 80, textAlign: 'right' },
  dateVal:     { fontSize: 9, width: 120, paddingLeft: 8, fontFamily: 'Helvetica-Bold' },

  // Payment terms
  payRow:    { flexDirection: 'row', marginTop: 14 },
  payLbl:    { fontSize: 9 },
  paySub:    { fontSize: 9 },
  payVal:    { fontSize: 9, fontFamily: 'Helvetica-Bold', paddingLeft: 10 },
});

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { order: Order; customer: Customer | undefined }

const AuftragPDF: React.FC<Props> = ({ order, customer }) => {
  const vehicle   = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner     = customer ? `${customer.vorname} ${customer.nachname}` : '';

  // Build work item rows: beanstandungen first, then offertItems, then ArbeitPosition items
  const bItems = (order.beanstandungen ?? []).filter(Boolean);
  const oItems = (order.offertItems ?? []).map(i => i.text).filter(Boolean);

  // ArbeitPosition items from positionen provide ZE values
  const aPos = (order.positionen ?? []).filter(p => p.typ === 'arbeit') as ArbeitPosition[];

  const hasPosi = aPos.length > 0;

  interface WorkRow { text: string; ze: string }
  const allRows: WorkRow[] = hasPosi
    ? [
        ...bItems.map(t => ({ text: t, ze: '' })),
        ...aPos.map(p => ({ text: p.beschreibung, ze: p.ze || '' })),
      ]
    : [
        ...bItems.map(t => ({ text: t, ze: '' })),
        ...oItems.map(t => ({ text: t, ze: '' })),
      ];

  const zeTotal = aPos.reduce((sum, p) => sum + fN(p.ze), 0);

  const beginDatum  = dateCH(order.createdAt);
  const fertigDatum = order.status === 'abgeschlossen' ? dateCH(order.statusChangedAt) : '';

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── HEADER ────────────────────────────────────────────────────── */}
        <View style={s.hdr}>
          <View style={s.hdrLeft}>
            <Text style={s.docTitle}>Kundenauftrag</Text>
            <View style={s.numRow}>
              <Text style={s.numLbl}>Auftragsnummer</Text>
              <Text style={s.numVal}>{order.orderNumber}</Text>
            </View>
          </View>
          <View style={s.hdrRight}>
            <Text style={s.coLine}>{CO_NAME}</Text>
            <Text style={s.coLine}>{CO_ADDR}</Text>
            <Text style={s.coLine}>{CO_CITY}</Text>
            <Text style={s.coLine}>{CO_PHONE}</Text>
          </View>
        </View>

        {/* ── MAIN BORDER BOX ───────────────────────────────────────────── */}
        <View style={s.box}>

          {/* Vehicle block */}
          <View style={s.vRow}><Text style={s.vLbl}>Fahrzeug</Text><Text style={s.vVal}>{vehicle}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>1. Inv.-Setzung</Text><Text style={s.vVal}></Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Kennzeichen</Text><Text style={s.vVal}>{customer?.kennzeichen ?? ''}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Chassis-Nr.</Text><Text style={s.vVal}></Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Km Stand</Text><Text style={s.vVal}>{customer?.km ?? ''}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Fahrzeugbesitzer</Text><Text style={s.vVal}>{owner}</Text></View>

          {/* Std.Satz row */}
          <View style={s.stdRow}>
            <Text style={s.stdLbl}>Std.Satz:</Text>
            <Text style={s.stdCHF}>CHF</Text>
            <Text style={s.stdVal}>{STD_SATZ}</Text>
          </View>

          {/* Table header: Arbeiten | ZE */}
          <View style={s.tHead}>
            <Text style={[s.th, s.cArbeiten]}>Arbeiten</Text>
            <Text style={[s.th, s.cZE]}>ZE</Text>
          </View>

          {/* Work item rows */}
          {allRows.map((row, i) => (
            <View key={i} style={s.tRow}>
              <Text style={[s.td, s.cArbeiten]}>{row.text}</Text>
              <Text style={[s.td, s.cZE]}>{row.ze}</Text>
            </View>
          ))}

          {/* Blank separator before ZE-Total (matching template spacing) */}
          <View style={s.zeBlankRow}>
            <Text style={[s.td, s.cArbeiten]}></Text>
            <Text style={[s.td, s.cZE]}></Text>
          </View>

          {/* ZE-Total row (bold) */}
          <View style={s.zeTotalRow}>
            <Text style={s.zeTotalLbl}>ZE-Total</Text>
            <Text style={s.zeTotalVal}>{zeTotal > 0 ? zeTotal.toFixed(1) : ''}</Text>
          </View>

          {/* Notes */}
          <View style={s.notesWrap}>
            <Text style={s.noteLine}>ZE basieren auf einer reibungslosen Reparatur</Text>
            {order.notizen ? <Text style={[s.noteLine, { marginTop: 4 }]}>{order.notizen}</Text> : null}
          </View>

          {/* Dates (centered) */}
          <View style={s.dateSection}>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Beginndatum</Text>
              <Text style={s.dateVal}>{beginDatum}</Text>
            </View>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Fertigstelldatum</Text>
              <Text style={s.dateVal}>{fertigDatum}</Text>
            </View>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Ort</Text>
              <Text style={s.dateVal}>{CO_LOC}</Text>
            </View>
          </View>

          {/* Payment terms */}
          <View style={s.payRow}>
            <View>
              <Text style={s.payLbl}>Zahlungskonditionen bei</Text>
              <Text style={s.paySub}>Rechnungstellung</Text>
            </View>
            <Text style={s.payVal}>10 Tage netto</Text>
          </View>

        </View>
      </Page>
    </Document>
  );
};

// ── Export function ───────────────────────────────────────────────────────────

export async function exportOrderPDF(order: Order, customer: Customer | undefined) {
  try {
    const blob = await pdf(<AuftragPDF order={order} customer={customer} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `Auftrag_${order.orderNumber}_${customer?.nachname ?? 'Kunde'}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
