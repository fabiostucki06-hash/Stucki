import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import type { ArbeitPosition, Customer, MaterialPosition, Offerte } from '../types';

const BLUE   = '#007AFF';
const ORANGE = '#FF9500';
const DARK   = '#1C1C1E';
const GRAY   = '#6E6E73';
const LIGHT  = '#F2F2F7';
const BORDER = '#D1D1D6';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: DARK,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 45,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  garageName:  { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  garageTagline: { fontSize: 8.5, color: GRAY, marginTop: 2 },
  docLabel: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: ORANGE, letterSpacing: 1.5 },

  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  metaRow:  { flexDirection: 'row', marginBottom: 4 },
  metaLbl:  { fontSize: 7.5, color: GRAY, width: 82 },
  metaVal:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', flex: 1 },
  sectionCaption: {
    fontSize: 7,
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 7,
  },

  badge: {
    backgroundColor: ORANGE,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeCaption: { fontSize: 7, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', marginBottom: 2 },
  badgeNumber:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: ORANGE,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 1,
  },
  thCell: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: LIGHT },
  tdCell: { fontSize: 8.5, color: DARK },
  tdBold: { fontFamily: 'Helvetica-Bold' },

  cBez:    { flex: 1 },
  cMenge:  { width: 42, textAlign: 'right' },
  cStkPrz: { width: 54, textAlign: 'right' },
  cZE:     { width: 32, textAlign: 'right' },
  cPreis:  { width: 64, textAlign: 'right' },

  totalsWrap: { alignItems: 'flex-end', marginTop: 6, marginBottom: 20 },
  totalRow: { flexDirection: 'row', width: 200, paddingVertical: 3 },
  totalLbl: { flex: 1, fontSize: 8.5, color: GRAY },
  totalVal: { width: 80, fontSize: 8.5, textAlign: 'right' },
  grandRow: {
    flexDirection: 'row',
    width: 200,
    paddingVertical: 7,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: ORANGE,
    borderTopStyle: 'solid',
  },
  grandLbl: { flex: 1, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  grandVal: { width: 80, fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: ORANGE },

  infoBox: {
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
  },
  infoRow: { flexDirection: 'row', marginBottom: 4 },
  infoLbl: { fontSize: 8.5, color: GRAY, width: 90 },
  infoVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', flex: 1 },

  notesBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF9500',
    borderLeftStyle: 'solid',
    paddingLeft: 10,
    paddingVertical: 8,
    paddingRight: 8,
    marginBottom: 14,
    backgroundColor: '#FFFBF0',
    borderRadius: 4,
  },
  notesCaption: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#FF9500', textTransform: 'uppercase', marginBottom: 4 },
  notesText: { fontSize: 8.5, color: GRAY },

  footer: {
    position: 'absolute',
    bottom: 22,
    left: 45,
    right: 45,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    borderTopStyle: 'solid',
    paddingTop: 6,
  },
  footerTxt: { fontSize: 7, color: GRAY },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLbl}>{label}</Text>
      <Text style={s.metaVal}>{value}</Text>
    </View>
  );
}

function RowRight({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 4, justifyContent: 'flex-end' }}>
      <Text style={{ fontSize: 8, color: GRAY, marginRight: 5 }}>{label}:</Text>
      <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>{value}</Text>
    </View>
  );
}

interface Props { offerte: Offerte; customer: Customer | undefined }

const OffertePDF: React.FC<Props> = ({ offerte, customer }) => {
  const positionen = offerte.positionen ?? [];
  const todayCH   = new Date().toLocaleDateString('de-CH');
  const vehicle   = [customer?.marke, customer?.modell].filter(Boolean).join(' ') || '—';
  const owner     = customer ? `${customer.vorname} ${customer.nachname}` : '—';

  const gueltigBisCH = offerte.gueltigBis
    ? new Date(offerte.gueltigBis).toLocaleDateString('de-CH')
    : null;

  const fCHF = (n: number) => `CHF ${n.toFixed(2)}`;
  const fN   = (s?: string) => parseFloat(s || '0');

  const totalArbeit   = fN(offerte.totalArbeit);
  const totalMaterial = fN(offerte.totalMaterial);
  const totalBetrag   = fN(offerte.totalBetrag);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.header}>
          <View>
            <Text style={s.garageName}>GarageOS</Text>
            <Text style={s.garageTagline}>Werkstatt &amp; Service</Text>
          </View>
          <Text style={s.docLabel}>OFFERTE</Text>
        </View>

        <View style={s.meta}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={s.sectionCaption}>Kunde / Fahrzeugdaten</Text>
            <Row label="Fahrzeugbesitzer" value={owner} />
            {customer?.telefon && <Row label="Telefon"      value={customer.telefon} />}
            {customer?.email   && <Row label="E-Mail"       value={customer.email}   />}
            <Row label="Fahrzeug" value={vehicle} />
            {customer?.kennzeichen && <Row label="Kennzeichen" value={customer.kennzeichen} />}
            {customer?.km          && <Row label="Km-Stand"    value={`${customer.km} km`} />}
          </View>

          <View style={{ width: 170 }}>
            <View style={s.badge}>
              <Text style={s.badgeCaption}>Offertennummer</Text>
              <Text style={s.badgeNumber}>#{offerte.offertNumber}</Text>
            </View>
            <RowRight label="Datum"       value={todayCH} />
            {gueltigBisCH && <RowRight label="Gültig bis" value={gueltigBisCH} />}
            {offerte.titel && <RowRight label="Titel"      value={offerte.titel} />}
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.thCell, s.cBez]}>Bezeichnung</Text>
          <Text style={[s.thCell, s.cMenge]}>Menge</Text>
          <Text style={[s.thCell, s.cStkPrz]}>Stk.Preis</Text>
          <Text style={[s.thCell, s.cZE]}>ZE</Text>
          <Text style={[s.thCell, s.cPreis]}>Preis (CHF)</Text>
        </View>

        {positionen.map((pos, i) => {
          const mp = pos.typ === 'material' ? (pos as MaterialPosition) : null;
          const ap = pos.typ === 'arbeit'   ? (pos as ArbeitPosition)   : null;
          return (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tdCell, s.cBez]}>{pos.beschreibung || '—'}</Text>
              <Text style={[s.tdCell, s.cMenge]}>
                {mp ? (parseFloat(mp.menge || '0') || '—') : '—'}
              </Text>
              <Text style={[s.tdCell, s.cStkPrz]}>
                {mp ? parseFloat(mp.stueckpreis || '0').toFixed(2) : '—'}
              </Text>
              <Text style={[s.tdCell, s.cZE]}>
                {ap ? (ap.ze || '—') : '—'}
              </Text>
              <Text style={[s.tdCell, s.tdBold, s.cPreis]}>
                {parseFloat(pos.preis || '0').toFixed(2)}
              </Text>
            </View>
          );
        })}

        <View style={s.totalsWrap}>
          {totalArbeit > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLbl}>Arbeitskosten</Text>
              <Text style={s.totalVal}>{fCHF(totalArbeit)}</Text>
            </View>
          )}
          {totalMaterial > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLbl}>Materialkosten</Text>
              <Text style={s.totalVal}>{fCHF(totalMaterial)}</Text>
            </View>
          )}
          <View style={s.grandRow}>
            <Text style={s.grandLbl}>Total</Text>
            <Text style={s.grandVal}>{fCHF(totalBetrag)}</Text>
          </View>
        </View>

        <View style={s.infoBox}>
          <Text style={[s.sectionCaption, { marginBottom: 6 }]}>Konditionen</Text>
          <View style={s.infoRow}>
            <Text style={s.infoLbl}>Zahlungsziel</Text>
            <Text style={s.infoVal}>30 Tage netto</Text>
          </View>
          {gueltigBisCH && (
            <View style={s.infoRow}>
              <Text style={s.infoLbl}>Offerte gültig bis</Text>
              <Text style={s.infoVal}>{gueltigBisCH}</Text>
            </View>
          )}
        </View>

        {offerte.notizen && (
          <View style={s.notesBox}>
            <Text style={s.notesCaption}>Notizen</Text>
            <Text style={s.notesText}>{offerte.notizen}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>GarageOS · Werkstatt &amp; Service</Text>
          <Text style={s.footerTxt}>Offerte #{offerte.offertNumber} · {todayCH}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
};

export async function exportOffertePDF(offerte: Offerte, customer: Customer | undefined) {
  try {
    const blob = await pdf(<OffertePDF offerte={offerte} customer={customer} />).toBlob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `Offerte_${offerte.offertNumber}_${customer?.nachname ?? 'Kunde'}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`PDF-Export fehlgeschlagen:\n${err instanceof Error ? err.message : String(err)}`);
  }
}
