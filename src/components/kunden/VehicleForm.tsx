import { useEffect, useRef, useState } from 'react';
import Spinner from '../ui/Spinner';
import { ANTRIEBE, GETRIEBE, STEUERTRIEBE, fahrzeugProfil, labelVon } from '../../lib/wartung';
import { vinAbrufen, vinGueltig } from '../../lib/vin';
import type { FahrzeugFelder } from '../../types';

/** "Automatisch – erkannt: Diesel" / "Automatisch – unbekannt": the empty option of a technical select. */
const auto = (erkannt?: string) => `Automatisch – ${erkannt ? `erkannt: ${erkannt}` : 'unbekannt'}`;

const FELD_LABEL: Partial<Record<keyof FahrzeugFelder, string>> = {
  marke: 'Marke', modell: 'Modell', antrieb: 'Antrieb', getriebe: 'Getriebe', motor: 'Motor', motorcode: 'Motorkennbuchstabe', steuertrieb: 'Steuertrieb',
};
const WERT_LABEL: Partial<Record<keyof FahrzeugFelder, (v: string) => string | undefined>> = {
  antrieb: (v) => labelVon(ANTRIEBE, v as never), getriebe: (v) => labelVon(GETRIEBE, v as never), steuertrieb: (v) => labelVon(STEUERTRIEBE, v as never),
};
const anzeige = (k: keyof FahrzeugFelder, v: string) => WERT_LABEL[k]?.(v) ?? v;

interface VinStatus {
  laden?: boolean;
  /** What was filled in / what the VIN doesn't hold. */
  text: string;
  warnung?: boolean;
  /** VIN values differing from what was entered by hand: taken over only on request. */
  abweichend?: Partial<FahrzeugFelder>;
}

/** The vehicle inputs, shared by the vehicle sheet and the new-customer form.
    A complete VIN (top of the form) is looked up (lib/vin) when entered, on blur
    or via "Daten abrufen": empty fields (and selects on "Automatisch") are filled in, values
    entered by hand are only replaced on request. */
export function VehicleFields({ f, onChange }: { f: FahrzeugFelder; onChange: (k: keyof FahrzeugFelder, v: string) => void }) {
  const s = (k: keyof FahrzeugFelder) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(k, e.target.value);
  const p = fahrzeugProfil(f);

  const [vin, setVin] = useState<VinStatus | null>(null);
  const aktuell = useRef(f);
  aktuell.current = f;
  const abgefragt = useRef<string | undefined>(vinGueltig(f.chassisnummer));
  const abbruch = useRef<AbortController | null>(null);
  useEffect(() => () => abbruch.current?.abort(), []);

  async function vinLaden(eingabe: string | undefined, erzwingen: boolean) {
    const nr = vinGueltig(eingabe);
    if (!nr) {
      if (erzwingen) setVin({ text: 'Ungültige VIN: 17 Zeichen, ohne I, O und Q.', warnung: true });
      return;
    }
    if (!erzwingen && abgefragt.current === nr) return;
    abgefragt.current = nr;
    abbruch.current?.abort();
    const ac = new AbortController();
    abbruch.current = ac;
    setVin({ laden: true, text: 'VIN wird abgerufen…' });
    try {
      const r = await vinAbrufen(nr, ac.signal);
      const jetzt = aktuell.current;
      if (vinGueltig(jetzt.chassisnummer) !== nr) return; // VIN changed meanwhile
      const gefuellt: string[] = [];
      const abweichend: Partial<FahrzeugFelder> = {};
      for (const [k, v] of Object.entries(r.felder) as [keyof FahrzeugFelder, string][]) {
        const alt = String(jetzt[k] ?? '').trim();
        if (!alt) { onChange(k, v); gefuellt.push(FELD_LABEL[k] ?? k); }
        else if (alt.toLowerCase() !== v.toLowerCase()) (abweichend as Record<string, string>)[k] = v;
      }
      const teile = [
        gefuellt.length ? `Aus VIN übernommen: ${gefuellt.join(', ')}.` : 'Keine leeren Felder zu ergänzen.',
        r.modelljahr ? `Modelljahr ${r.modelljahr}.` : '',
        r.offen.length ? `Nicht aus der VIN ermittelbar: ${r.offen.join(', ')} – bitte Fahrzeugausweis / Datenträger prüfen.` : '',
        r.offline ? 'Online-Abfrage nicht erreichbar, nur Marke/Modell aus der VIN-Struktur.' : '',
      ].filter(Boolean);
      setVin({ text: teile.join(' '), warnung: r.offen.length > 0 || r.offline, abweichend: Object.keys(abweichend).length ? abweichend : undefined });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setVin({ text: (e as Error).message || 'VIN-Abfrage fehlgeschlagen.', warnung: true });
    }
  }

  function uebernehmen() {
    if (!vin?.abweichend) return;
    for (const [k, v] of Object.entries(vin.abweichend) as [keyof FahrzeugFelder, string][]) onChange(k, v);
    setVin({ ...vin, text: `VIN-Werte übernommen: ${Object.keys(vin.abweichend).map((k) => FELD_LABEL[k as keyof FahrzeugFelder]).join(', ')}.`, abweichend: undefined });
  }

  return (
    <div className="cf-group">
      {/* VIN first: a complete VIN fills the vehicle data below. */}
      <div className="vin-bar">
        <label className="cf-label" htmlFor="vf-vin">Chassisnummer (VIN)</label>
        <div className="vin-row">
          <input
            id="vf-vin" className="cf-input vin-input" value={f.chassisnummer ?? ''} placeholder="z.B. WAUZZZ8TX9A020101" maxLength={20}
            autoCapitalize="characters" autoComplete="off" spellCheck={false}
            onChange={(e) => { onChange('chassisnummer', e.target.value); if (vinGueltig(e.target.value)) void vinLaden(e.target.value, false); }}
            onBlur={(e) => void vinLaden(e.target.value, false)}
          />
          <button
            type="button" className="btn-system btn-secondary vin-btn" disabled={vin?.laden || !vinGueltig(f.chassisnummer)}
            onClick={() => void vinLaden(f.chassisnummer, true)} title="Fahrzeugdaten aus der VIN ermitteln"
          >
            {vin?.laden ? <Spinner size={13} color="var(--accent)" /> : 'Daten abrufen'}
          </button>
        </div>
        {vin ? (
          <div className={`vin-status${vin.warnung ? ' vin-status-warn' : ''}`} role="status" aria-live="polite">
            <span>{vin.text}</span>
            {vin.abweichend && (
              <span className="vin-abweichend">
                VIN abweichend: {Object.entries(vin.abweichend).map(([k, v]) => `${FELD_LABEL[k as keyof FahrzeugFelder]} ${anzeige(k as keyof FahrzeugFelder, v)}`).join(' · ')}
                <button type="button" className="sp-text-btn" onClick={uebernehmen}>Übernehmen</button>
              </span>
            )}
          </div>
        ) : (
          <p className="vin-hint">17 Zeichen – füllt Marke, Modell, Antrieb, Getriebe, Motor und Steuertrieb automatisch aus.</p>
        )}
      </div>

      {/* Vehicle data (from the VIN). Technical data decides which Wartungsplan items apply and their intervals. */}
      <div className="cf-grid-2">
        <div className="cf-field">
          <label className="cf-label">Marke</label>
          <input className="cf-input" value={f.marke ?? ''} onChange={s('marke')} placeholder="z.B. BMW" />
        </div>
        <div className="cf-field">
          <label className="cf-label">Modell</label>
          <input className="cf-input" value={f.modell ?? ''} onChange={s('modell')} placeholder="z.B. 320d" />
        </div>
      </div>
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Antrieb</label>
          <select className="cf-select" value={f.antrieb ?? ''} onChange={s('antrieb')}>
            <option value="">{auto(f.antrieb ? undefined : labelVon(ANTRIEBE, p.antrieb))}</option>
            {ANTRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="cf-field">
          <label className="cf-label">Getriebe</label>
          <select className="cf-select" value={f.getriebe ?? ''} onChange={s('getriebe')}>
            <option value="">{auto(f.getriebe ? undefined : labelVon(GETRIEBE, p.getriebe))}</option>
            {GETRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Motor</label>
          <input className="cf-input" value={f.motor ?? ''} onChange={s('motor')} placeholder="z.B. 2.0 TDI 150 PS" />
        </div>
        <div className="cf-field">
          <label className="cf-label">Motorkennbuchstabe</label>
          <input className="cf-input" value={f.motorcode ?? ''} onChange={s('motorcode')} placeholder="z.B. CFFB / B47D20 / OM651" autoCapitalize="characters" />
        </div>
      </div>
      {p.motor && <p className="cf-hint" style={{ margin: '6px 2px 0', fontSize: 12, color: 'var(--label3)' }}>Erkannt: {p.motor.name}</p>}
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Steuertrieb</label>
          <select className="cf-select" value={f.steuertrieb ?? ''} onChange={s('steuertrieb')}>
            <option value="">{auto(f.steuertrieb ? undefined : labelVon(STEUERTRIEBE, p.steuertrieb))}</option>
            {STEUERTRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="cf-field">
          <label className="cf-label">1. Inv. Setzung</label>
          <input className="cf-input" type="date" value={f.erstzulassung ?? ''} onChange={s('erstzulassung')} />
        </div>
      </div>

      {/* Registration / workshop data: entered by hand. */}
      <div className="cf-grid-2 vf-manual">
        <div className="cf-field">
          <label className="cf-label">Kontrollschild</label>
          <input className="cf-input" value={f.kennzeichen ?? ''} onChange={s('kennzeichen')} placeholder="ZH 123456" />
        </div>
        <div className="cf-field">
          <label className="cf-label">KM-Stand</label>
          <input className="cf-input" type="number" inputMode="numeric" value={f.km ?? ''} onChange={s('km')} placeholder="85000" />
        </div>
      </div>
    </div>
  );
}

interface VehicleFormProps {
  initial?: FahrzeugFelder;
  onSave: (data: FahrzeugFelder) => Promise<void> | void;
  onCancel: () => void;
}

export default function VehicleForm({ initial, onSave, onCancel }: VehicleFormProps) {
  const [f, setF] = useState<FahrzeugFelder>({
    marke:         initial?.marke         ?? '',
    modell:        initial?.modell        ?? '',
    kennzeichen:   initial?.kennzeichen   ?? '',
    km:            initial?.km            ?? '',
    chassisnummer: initial?.chassisnummer ?? '',
    erstzulassung: initial?.erstzulassung ?? '',
    antrieb:       initial?.antrieb,
    getriebe:      initial?.getriebe,
    steuertrieb:   initial?.steuertrieb,
    motor:         initial?.motor         ?? '',
    motorcode:     initial?.motorcode     ?? '',
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      // Empty inputs are not stored.
      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(f)) if (String(v ?? '').trim()) data[k] = String(v).trim();
      await onSave(data as FahrzeugFelder);
    } catch {
      // Error toast already shown by the context (syncOk). Form stays open, input intact.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="cf-section-title" style={{ marginTop: 0 }}>Fahrzeug</div>
      <VehicleFields f={f} onChange={(k, v) => setF((p) => ({ ...p, [k]: v }))} />
      <div className="cf-actions">
        <button className="cf-btn-save" onClick={submit} disabled={busy}>
          {busy ? 'Wird gespeichert…' : 'Sichern'}
        </button>
        <button className="cf-btn-cancel" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
