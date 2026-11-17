import { useState } from 'react';
import { ANTRIEBE, GETRIEBE, STEUERTRIEBE, fahrzeugProfil, labelVon } from '../../lib/wartung';
import type { FahrzeugFelder } from '../../types';

/** "Automatisch – erkannt: Diesel" / "Automatisch – unbekannt": the empty option of a technical select. */
const auto = (erkannt?: string) => `Automatisch – ${erkannt ? `erkannt: ${erkannt}` : 'unbekannt'}`;

/** The vehicle inputs, shared by the vehicle sheet and the new-customer form. */
export function VehicleFields({ f, onChange }: { f: FahrzeugFelder; onChange: (k: keyof FahrzeugFelder, v: string) => void }) {
  const s = (k: keyof FahrzeugFelder) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(k, e.target.value);
  const p = fahrzeugProfil(f);
  return (
    <div className="cf-group">
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
          <label className="cf-label">Kontrollschild</label>
          <input className="cf-input" value={f.kennzeichen ?? ''} onChange={s('kennzeichen')} placeholder="ZH 123456" />
        </div>
        <div className="cf-field">
          <label className="cf-label">KM-Stand</label>
          <input className="cf-input" type="number" inputMode="numeric" value={f.km ?? ''} onChange={s('km')} placeholder="85000" />
        </div>
      </div>
      <div className="cf-grid-2" style={{ marginTop: 10 }}>
        <div className="cf-field">
          <label className="cf-label">Chassisnummer (VIN)</label>
          <input className="cf-input" value={f.chassisnummer ?? ''} onChange={s('chassisnummer')} placeholder="WBA12345678901234" />
        </div>
        <div className="cf-field">
          <label className="cf-label">1. Inv. Setzung</label>
          <input className="cf-input" type="date" value={f.erstzulassung ?? ''} onChange={s('erstzulassung')} />
        </div>
      </div>

      {/* Technical data: decides which Wartungsplan items apply and their intervals. */}
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
          <input className="cf-input" value={f.motor ?? ''} onChange={s('motor')} placeholder="z.B. 2.0 TDI / B47" />
        </div>
        <div className="cf-field">
          <label className="cf-label">Steuertrieb</label>
          <select className="cf-select" value={f.steuertrieb ?? ''} onChange={s('steuertrieb')}>
            <option value="">{auto(f.steuertrieb ? undefined : labelVon(STEUERTRIEBE, p.steuertrieb))}</option>
            {STEUERTRIEBE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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
