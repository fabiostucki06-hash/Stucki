import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { ArbeitPosition, Customer, MaterialPosition, Rechnung } from '../types';

const CO_NAME  = 'Fabio Stucki';
const CO_ADDR  = 'Polenstrasse 245';
const CO_CITY  = '5112 Thalheim AG';
const CO_PHONE = '079 850 18 63';
const CO_LOC   = 'Thalheim AG';
const STD_SATZ = '80.00';

const todayCH = () => new Date().toLocaleDateString('de-CH');
const fN = (v?: string | number) => parseFloat(String(v ?? '0')) || 0;
const chf = (n: number) => n === 0 ? 'CHF –' : `CHF ${n.toFixed(2)}`;

// A4 inner: 495pt. Excel col proportions C:D:E:F:G = 144:108:69:90:75 (≈486 total, scale to 495)
// Scaled: cBez≈149, cMenge=110, cStkP=70, cPreis=92, cZE=74
const COL_MENGE  = 110;
const COL_STKP   = 70;
const COL_PREIS  = 92;
const COL_ZE     = 74;
const COL_SPACER = COL_MENGE + COL_STKP + COL_PREIS; // 272
const COL_BEZ_W  = 149;

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
  vLbl: { fontSize: 9, width: COL_BEZ_W },
  vVal: { fontSize: 9, flex: 1 },

  stdRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid',
    borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid',
    paddingVertical: 3,
    marginTop: 8,
  },
  stdLbl: { fontSize: 9, width: COL_BEZ_W },
  stdVal: { fontSize: 9 },

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

  cBez:   { flex: 1 },
  cMenge: { width: COL_MENGE, textAlign: 'right' },
  cStkP:  { width: COL_STKP,  textAlign: 'right' },
  cPreis: { width: COL_PREIS, textAlign: 'right' },
  cZE:    { width: COL_ZE,    textAlign: 'right' },

  sumRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid',
    paddingVertical: 3,
  },
  subRow: { flexDirection: 'row', paddingVertical: 2 },
  grandRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid',
    borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid',
    paddingVertical: 3,
  },
  grandLbl: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  grandVal: { fontFamily: 'Helvetica-Bold', fontSize: 9, width: COL_ZE, textAlign: 'right' },

  notesWrap: { marginTop: 14 },
  noteLine:  { fontSize: 9, marginBottom: 2 },

  dateSection: { marginTop: 40 },
  datePair:    { flexDirection: 'row', marginBottom: 4 },
  dateLbl:     { fontSize: 9, width: COL_BEZ_W },
  dateVal:     { fontSize: 9, flex: 1, fontFamily: 'Helvetica-Bold', paddingLeft: 8 },

  payRow: { flexDirection: 'row', marginTop: 28, alignItems: 'flex-start' },
  payLbl: { fontSize: 9 },
  paySub: { fontSize: 9 },
  payVal: { fontSize: 9, fontFamily: 'Helvetica-Bold', paddingLeft: 12 },
});

interface Props { rechnung: Rechnung; customer: Customer | undefined }

const RechnungPDF: React.FC<Props> = ({ rechnung, customer }) => {
  const allPos      = rechnung.positionen ?? [];
  const vehicle     = [customer?.marke, customer?.modell].filter(Boolean).join(' ');
  const owner       = customer ? `${customer.vorname} ${customer.nachname}` : '';
  const totalArb    = fN(rechnung.totalArbeit);
  const totalBetrag = fN(rechnung.totalBetrag);
  const date        = todayCH();

  const kleinteilPos = allPos.find(
    (p): p is MaterialPosition =>
      p.typ === 'material' && p.beschreibung === 'Kleinteil Pauschale',
  );
  const kleinteilAmt = fN(kleinteilPos?.preis);
  const filteredPos  = allPos.filter(
    p => !(p.typ === 'material' && (p as MaterialPosition).beschreibung === 'Kleinteil Pauschale'),
  );
  const pureMatTotal = fN(rechnung.totalMaterial) - kleinteilAmt;

  const faelligCH = rechnung.faelligAm
    ? new Date(rechnung.faelligAm).toLocaleDateString('de-CH')
    : rechnung.zahlungsFrist
      ? (() => { const d = new Date(); d.setDate(d.getDate() + parseInt(rechnung.zahlungsFrist!)); return d.toLocaleDateString('de-CH'); })()
      : '';
  const payTage = rechnung.zahlungsFrist ? `${rechnung.zahlungsFrist} Tage netto` : '10 Tage netto';

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.hdr}>
          <View>
            <Text style={s.docTitle}>Rechnung</Text>
            <View style={s.numRow}>
              <Text style={s.numLbl}>Rechnungsnummer</Text>
              <Text style={s.numVal}>{rechnung.rechnungNumber}</Text>
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
            <Text style={[s.th, s.cBez]}>Bezeichnung</Text>
            <Text style={[s.th, s.cMenge]}>Menge</Text>
            <Text style={[s.th, s.cStkP]}>Stk.Preis</Text>
            <Text style={[s.th, s.cPreis]}>Preis (CHF)</Text>
            <Text style={[s.th, s.cZE]}>ZE</Text>
          </View>

          <View style={{ minHeight: 225 }}>
            {filteredPos.map((p, i) => {
              const mp = p.typ === 'material' ? (p as MaterialPosition) : null;
              const ap = p.typ === 'arbeit'   ? (p as ArbeitPosition)   : null;
              return (
                <View key={i} style={s.tRow}>
                  <Text style={[s.td, s.cBez]}>{p.beschreibung}</Text>
                  <Text style={[s.td, s.cMenge]}>{mp ? (parseFloat(mp.menge || '0') || '') : ''}</Text>
                  <Text style={[s.td, s.cStkP]}>{mp ? (parseFloat(mp.stueckpreis || '0') || '') : ''}</Text>
                  <Text style={[s.td, s.cPreis]}>{fN(p.preis) ? fN(p.preis).toFixed(2) : ''}</Text>
                  <Text style={[s.td, s.cZE]}>{ap ? (ap.ze || '') : ''}</Text>
                </View>
              );
            })}
          </View>

          <View style={s.sumRow}>
            <Text style={[s.td, s.cBez]}>Summe</Text>
            <Text style={[s.td, s.cMenge]}></Text>
            <Text style={[s.td, s.cStkP]}></Text>
            <Text style={[s.td, s.cPreis]}>{chf(pureMatTotal)}</Text>
            <Text style={[s.td, s.cZE]}>{chf(totalArb)}</Text>
          </View>

          <View style={s.subRow}>
            <Text style={[s.td, s.cBez]}></Text>
            <Text style={[s.td, s.cMenge]}></Text>
            <Text style={[s.td, s.cStkP]}></Text>
            <Text style={[s.td, s.cPreis]}></Text>
            <Text style={[s.td, s.cZE]}>{chf(kleinteilAmt)}</Text>
          </View>

          <View style={s.grandRow}>
            <Text style={s.grandLbl}>Rechnungstotal</Text>
            <Text style={{ ...s.td, width: COL_SPACER }}></Text>
            <Text style={s.grandVal}>{chf(totalBetrag)}</Text>
          </View>

          <View style={s.notesWrap}>
            <Text style={s.noteLine}>ZE basieren auf einer reibungslosen Reparatur</Text>
            <Text style={s.noteLine}>Kleinmaterial-Pauschale wird bei &lt;100 ZE hinzugefügt</Text>
            {rechnung.notizen ? <Text style={[s.noteLine, { marginTop: 4 }]}>{rechnung.notizen}</Text> : null}
          </View>

          <View style={s.dateSection}>
            <View style={s.datePair}>
              <Text style={s.dateLbl}>Datum</Text>
              <Text style={s.dateVal}>{date}</Text>
            </View>
            {faelligCH ? (
              <View style={s.datePair}>
                <Text style={s.dateLbl}>Zahlbar bis</Text>
                <Text style={s.dateVal}>{faelligCH}</Text>
              </View>
            ) : null}
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
            <Text style={s.payVal}>{payTage}</Text>
          </View>

        </View>
      </Page>
    </Document>
  );
};

export async function exportRechnungPDF(rechnung: Rechnung, customer: Customer | undefined) {
  try {
    const blob = await pdf(<RechnungPDF rechnung={rechnung} customer={customer} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `Rechnung_${rechnung.rechnungNumber}_${customer?.nachname ?? 'Kunde'}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
