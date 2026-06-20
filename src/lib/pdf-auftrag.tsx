import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { ArbeitPosition, Customer, Order } from '../types';

const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

const dateCH = (iso?: string) => iso ? new Date(iso).toLocaleDateString('de-CH') : '';
const fN     = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;

// A4 inner: 495pt. Excel Auftrag: Arbeiten = cols C+D+E (177+132+80=389px), ZE = col F (100px)
// Proportion: Arbeiten=79.6%, ZE=20.4%  → cZE=100, cArbeiten=flex:1(≈395)
const COL_ZE    = 100;
// Label column (col C only) width for vehicle / date alignment
const COL_LBL   = 120;

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
    paddingTop: 35,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },

  hdr:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  numRow:   { flexDirection: 'row', marginTop: 3 },
  numLbl:   { fontSize: 9, width: 96 },
  numVal:   { fontSize: 9 },
  hdrRight: { alignItems: 'flex-end' },
  coLine:   { fontSize: 8.5 },

  box: {
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
    padding: 10,
  },

  vRow: { flexDirection: 'row', marginBottom: 2 },
  vLbl: { fontSize: 9, width: COL_LBL },
  vVal: { fontSize: 9, flex: 1 },

  stdRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid',
    borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid',
    paddingVertical: 3,
    marginTop: 8,
  },
  stdLbl: { fontSize: 9, width: COL_LBL },
  stdVal: { fontSize: 9 },

  // 2-column table: Arbeiten (flex:1) | ZE (100pt)
  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid',
    paddingVertical: 6,
  },
  th: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.25, borderBottomColor: '#aaa', borderBottomStyle: 'solid',
    minHeight: 15,
    paddingVertical: 3,
  },
  td: { fontSize: 9 },

  cArbeiten: { flex: 1 },
  cZE:       { width: COL_ZE, textAlign: 'right' },

  zeBlankRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid',
    paddingVertical: 3,
  },
  zeTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid',
    borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid',
    paddingVertical: 3,
  },
  zeTotalLbl: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  zeTotalVal: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: COL_ZE, textAlign: 'right' },

  notesWrap: { marginTop: 14 },
  noteLine:  { fontSize: 9, marginBottom: 2 },

  // Dates — left-aligned, label column = COL_LBL
  dateSection: { marginTop: 40 },
  datePair:    { flexDirection: 'row', marginBottom: 4 },
  dateLbl:     { fontSize: 9, width: COL_LBL },
  dateVal:     { fontSize: 9, flex: 1, fontFamily: 'Helvetica-Bold', paddingLeft: 8 },

  payRow: { flexDirection: 'row', marginTop: 42, alignItems: 'flex-start' },
  payLbl: { fontSize: 9 },
  paySub: { fontSize: 9 },
  payVal: { fontSize: 9, fontFamily: 'Helvetica-Bold', paddingLeft: 12 },
});

interface Props { order: Order; customer: Customer | undefined }

const AuftragPDF: React.FC<Props> = ({ order, customer }) => {
  const vehicle = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner   = customer ? `${customer.vorname} ${customer.nachname}` : '';

  const bItems = (order.beanstandungen ?? []).filter(Boolean);
  const oItems = (order.offertItems ?? []).map(i => i.text).filter(Boolean);
  const aPos   = (order.positionen ?? []).filter(p => p.typ === 'arbeit') as ArbeitPosition[];
  const hasPosi = aPos.length > 0;

  interface WorkRow { text: string; ze: string }
  const allRows: WorkRow[] = hasPosi
    ? [...bItems.map(t => ({ text: t, ze: '' })), ...aPos.map(p => ({ text: p.beschreibung, ze: p.ze || '' }))]
    : [...bItems.map(t => ({ text: t, ze: '' })), ...oItems.map(t => ({ text: t, ze: '' }))];

  const zeTotal     = aPos.reduce((sum, p) => sum + fN(p.ze), 0);
  const beginDatum  = dateCH(order.createdAt);
  const fertigDatum = order.status === 'abgeschlossen' ? dateCH(order.statusChangedAt) : '';

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.hdr}>
          <View>
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

        <View style={s.box}>

          <View style={s.vRow}><Text style={s.vLbl}>Fahrzeug</Text><Text style={s.vVal}>{vehicle}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>1. Inv.-Setzung</Text><Text style={s.vVal}></Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Kennzeichen</Text><Text style={s.vVal}>{customer?.kennzeichen ?? ''}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Chassis-Nr.</Text><Text style={s.vVal}></Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Km Stand</Text><Text style={s.vVal}>{customer?.km ?? ''}</Text></View>
          <View style={s.vRow}><Text style={s.vLbl}>Fahrzeugbesitzer</Text><Text style={s.vVal}>{owner}</Text></View>

          <View style={s.stdRow}>
            <Text style={s.stdLbl}>Std.Satz:</Text>
            <Text style={s.stdVal}>CHF {STD_SATZ}</Text>
          </View>

          <View style={s.tHead}>
            <Text style={[s.th, s.cArbeiten]}>Arbeiten</Text>
            <Text style={[s.th, s.cZE]}>ZE</Text>
          </View>

          {/* Work rows — min 15 rows to match Excel template spacing */}
          <View style={{ minHeight: 225 }}>
            {allRows.map((row, i) => (
              <View key={i} style={s.tRow}>
                <Text style={[s.td, s.cArbeiten]}>{row.text}</Text>
                <Text style={[s.td, s.cZE]}>{row.ze}</Text>
              </View>
            ))}
          </View>

          <View style={s.zeBlankRow}>
            <Text style={[s.td, s.cArbeiten]}></Text>
            <Text style={[s.td, s.cZE]}></Text>
          </View>

          <View style={s.zeTotalRow}>
            <Text style={s.zeTotalLbl}>ZE-Total</Text>
            <Text style={s.zeTotalVal}>{zeTotal > 0 ? zeTotal.toFixed(1) : ''}</Text>
          </View>

          <View style={s.notesWrap}>
            <Text style={s.noteLine}>ZE basieren auf einer reibungslosen Reparatur</Text>
            {order.notizen ? <Text style={[s.noteLine, { marginTop: 4 }]}>{order.notizen}</Text> : null}
          </View>

          <View style={s.dateSection}>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Beginndatum</Text>
              <Text style={s.dateVal}>{beginDatum}</Text>
            </View>
            {/* Extra gap between Beginndatum and Fertigstelldatum matching blank Excel row */}
            <View style={[s.datePair, { marginTop: 8 }]}>
              <Text style={s.dateLbl}>Fertigstelldatum</Text>
              <Text style={s.dateVal}>{fertigDatum}</Text>
            </View>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Ort</Text>
              <Text style={s.dateVal}>{CO_LOC}</Text>
            </View>
          </View>

          <View style={s.payRow}>
            <View>
              <Text style={s.payLbl}>Zahlungskontitionen bei</Text>
              <Text style={s.paySub}>Rechnungstellung</Text>
            </View>
            <Text style={s.payVal}>10 Tage netto</Text>
          </View>

        </View>
      </Page>
    </Document>
  );
};

export async function exportOrderPDF(order: Order, customer: Customer | undefined) {
  try {
    const blob = await pdf(<AuftragPDF order={order} customer={customer} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `Auftrag_${order.orderNumber}_${customer?.nachname ?? 'Kunde'}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
