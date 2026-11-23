import { useEffect, useRef, useState } from 'react';
import Spinner from '../ui/Spinner';
import { ausweisAuswerten, ausweisLesen, type ScanFeld, type ScanWerte } from '../../lib/fahrzeugausweis';
import { ANTRIEBE, GETRIEBE, labelVon } from '../../lib/wartung';
import { vinGueltig } from '../../lib/vin';

const LABEL: Record<ScanFeld, string> = {
  vorname: 'Vorname', nachname: 'Nachname', chassisnummer: 'VIN', kennzeichen: 'Kontrollschild', marke: 'Marke', modell: 'Modell',
  erstzulassung: '1. Inv. Setzung', antrieb: 'Antrieb', getriebe: 'Getriebe', motor: 'Motor', motorcode: 'Motorkennbuchstabe', steuertrieb: 'Steuertrieb', km: 'KM-Stand',
};
const FAHRZEUG_OFFEN: ScanFeld[] = ['chassisnummer', 'kennzeichen', 'marke', 'modell', 'erstzulassung', 'antrieb', 'getriebe', 'motor', 'motorcode', 'steuertrieb', 'km'];

function anzeige(k: ScanFeld, v: string) {
  if (k === 'antrieb') return labelVon(ANTRIEBE, v as never) ?? v;
  if (k === 'getriebe') return labelVon(GETRIEBE, v as never) ?? v;
  if (k === 'erstzulassung') return v.split('-').reverse().join('.');
  return v;
}

const normVin = (v?: string) => (v ?? '').replace(/\s/g, '').toUpperCase();
const gleich = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
/** More than two differing characters: another vehicle, not a corrected misread. */
const andereVin = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length > 2;

interface Scan {
  laden?: boolean;
  fehler?: string;
  /** Inputs this scan filled: the only values a reset may remove. */
  eingetragen: ScanWerte;
  /** Already in the form with the same value. */
  bestaetigt: ScanWerte;
  /** Document value differs from what is in the form: taken over only on request. */
  abweichend: ScanWerte;
  unklar: string[];
  adresse?: string;
  /** VIN the applied values belong to. */
  basisVin?: string;
}
const LEER: Scan = { eingetragen: {}, bestaetigt: {}, abweichend: {}, unklar: [] };

interface DokumentScanProps {
  werte: ScanWerte;
  onChange: (k: ScanFeld, v: string) => void;
  /** New-customer form: the holder's name may fill the contact fields. */
  mitKontakt?: boolean;
  /** Clears the result and values of an earlier VIN lookup (VehicleFields). */
  vinReset?: React.MutableRefObject<(() => void) | null>;
}

/** Photo of the vehicle papers → only reliably read values fill empty inputs.
    Values already in the form are never overwritten without a click, and a new
    photo or another VIN removes what the previous scan entered. */
export default function DokumentScan({ werte, onChange, mitKontakt, vinReset }: DokumentScanProps) {
  const [scan, setScan] = useState<Scan | null>(null);
  const aktuell = useRef(werte);
  aktuell.current = werte;
  const stand = useRef(scan);
  stand.current = scan;
  const abbruch = useRef<AbortController | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const datei = useRef<HTMLInputElement>(null);
  useEffect(() => () => abbruch.current?.abort(), []);

  /** Removes what the last scan entered, except inputs edited since. */
  function eintraegeEntfernen(ohne?: ScanFeld) {
    for (const [k, v] of Object.entries(stand.current?.eingetragen ?? {}) as [ScanFeld, string][]) {
      if (k !== ohne && aktuell.current[k] === v) onChange(k, '');
    }
  }

  async function lesen(file: File | undefined) {
    if (!file) return;
    abbruch.current?.abort();
    const ac = new AbortController();
    abbruch.current = ac;
    eintraegeEntfernen();
    vinReset?.current?.();
    setScan({ ...LEER, laden: true });
    try {
      const a = ausweisAuswerten(await ausweisLesen(file, ac.signal));
      if (ac.signal.aborted) return;
      const eingetragen: ScanWerte = {}, bestaetigt: ScanWerte = {}, abweichend: ScanWerte = {};
      for (const [k, v] of Object.entries(a.werte) as [ScanFeld, string][]) {
        if (!mitKontakt && (k === 'vorname' || k === 'nachname')) continue;
        const alt = String(aktuell.current[k] ?? '').trim();
        if (!alt) { onChange(k, v); eingetragen[k] = v; }
        else if (gleich(alt, v)) bestaetigt[k] = alt;
        else abweichend[k] = v;
      }
      const vin = eingetragen.chassisnummer ?? bestaetigt.chassisnummer;
      if (!Object.keys(a.werte).length) {
        setScan({ ...LEER, unklar: a.unklar, fehler: 'Auf diesem Bild wurden keine verlässlichen Daten erkannt. Es wurde nichts eingetragen.' });
        return;
      }
      setScan({ eingetragen, bestaetigt, abweichend, unklar: a.unklar, adresse: a.adresse, basisVin: vin ? normVin(vin) : undefined });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setScan({ ...LEER, fehler: `${(e as Error).message || 'Lesen fehlgeschlagen.'} Es wurde nichts eingetragen.` });
    }
  }

  // Another VIN means another vehicle: the previous document's values must not stay behind.
  const vinJetzt = normVin(werte.chassisnummer);
  useEffect(() => {
    const s = stand.current;
    if (!s?.basisVin || s.laden || vinJetzt === s.basisVin) return;
    if (vinJetzt && !(vinGueltig(vinJetzt) && andereVin(vinJetzt, s.basisVin))) return;
    eintraegeEntfernen('chassisnummer');
    setScan({ ...LEER, fehler: 'VIN geändert: Die Werte des vorherigen Dokuments wurden entfernt.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinJetzt]);

  function uebernehmen() {
    if (!scan) return;
    const neu = Object.entries(scan.abweichend) as [ScanFeld, string][];
    for (const [k, v] of neu) onChange(k, v);
    const vin = scan.abweichend.chassisnummer;
    setScan({ ...scan, eingetragen: { ...scan.eingetragen, ...scan.abweichend }, abweichend: {}, basisVin: vin ? normVin(vin) : scan.basisVin });
  }

  function verwerfen() {
    abbruch.current?.abort();
    eintraegeEntfernen();
    setScan(null);
  }

  const erkannt = scan ? (Object.entries({ ...scan.bestaetigt, ...scan.eingetragen }) as [ScanFeld, string][])
    .filter(([k, v]) => gleich(werte[k], v)) : [];
  const abweichend = scan ? Object.entries(scan.abweichend) as [ScanFeld, string][] : [];
  const offen = FAHRZEUG_OFFEN.filter((k) => !String(werte[k] ?? '').trim()).map((k) => LABEL[k]);
  const hatErgebnis = !!scan && !scan.laden && !scan.fehler;
  const vinAnders = hatErgebnis && !!scan.basisVin && vinJetzt !== scan.basisVin;

  return (
    <div className="scan-bar">
      <div className="scan-kopf">
        <div className="scan-titel">
          <span className="scan-name">Fahrzeugausweis</span>
          <span className="scan-hint">Foto füllt nur eindeutig lesbare Felder aus</span>
        </div>
        <div className="scan-aktionen">
          <button type="button" className="btn-system btn-secondary scan-btn scan-kamera" disabled={scan?.laden} onClick={() => kamera.current?.click()}>Foto aufnehmen</button>
          <button type="button" className="btn-system btn-secondary scan-btn" disabled={scan?.laden} onClick={() => datei.current?.click()}>
            {scan?.laden ? <Spinner size={13} color="var(--accent)" /> : 'Bild wählen'}
          </button>
        </div>
      </div>
      <input ref={kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void lesen(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={datei} type="file" accept="image/*" hidden onChange={(e) => { void lesen(e.target.files?.[0]); e.target.value = ''; }} />

      {scan && (
        <div className={`vin-status${scan.fehler || scan.unklar.length || abweichend.length || vinAnders ? ' vin-status-warn' : ''}`} role="status" aria-live="polite">
          {scan.laden && <span>Dokument wird gelesen, das kann bis zu einer Minute dauern…</span>}
          {scan.fehler && <span>{scan.fehler}</span>}
          {!!erkannt.length && (
            <span className="vin-zeile"><span className="vin-zeile-titel">Aus Dokument übernommen</span><span className="vin-zeile-wert">{erkannt.map(([k, v]) => `${LABEL[k]}: ${anzeige(k, v)}`).join(' · ')}</span></span>
          )}
          {!!scan.unklar.length && (
            <span className="vin-zeile"><span className="vin-zeile-titel">Nicht sicher lesbar, nicht eingetragen</span><span className="vin-zeile-wert">{scan.unklar.join(', ')}</span></span>
          )}
          {hatErgebnis && !!offen.length && (
            <span className="vin-zeile"><span className="vin-zeile-titel">Bitte prüfen / ergänzen</span><span className="vin-zeile-wert">{offen.join(', ')}</span></span>
          )}
          {!!abweichend.length && (
            <span className="vin-abweichend">
              Dokument abweichend: {abweichend.map(([k, v]) => `${LABEL[k]} ${anzeige(k, v)}`).join(' · ')}
              <button type="button" className="sp-text-btn" onClick={uebernehmen}>Übernehmen</button>
            </span>
          )}
          {vinAnders && <span>Die VIN weicht vom gelesenen Dokument ab. Bitte prüfen.</span>}
          {scan.adresse && <span className="vin-info">Adresse auf dem Dokument (wird nicht gespeichert): {scan.adresse}</span>}
          {!scan.laden && (erkannt.length > 0 || scan.fehler) && (
            <span className="vin-abweichend"><button type="button" className="sp-text-btn scan-entfernen" onClick={verwerfen}>{erkannt.length ? 'Dokumentwerte entfernen' : 'Schliessen'}</button></span>
          )}
        </div>
      )}
    </div>
  );
}
