import { useState } from 'react';
import { showToast } from '../ui/Toast';
import type { Customer } from '../../types';

type CustomerData = Omit<Customer, 'id' | 'createdAt'>;

interface CustomerFormProps {
  initial?: Customer;
  onSave: (data: CustomerData) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

export default function CustomerForm({ initial, onSave, onCancel, saving }: CustomerFormProps) {
  const [f, setF] = useState<CustomerData>({
    vorname:     initial?.vorname     ?? '',
    nachname:    initial?.nachname    ?? '',
    telefon:     initial?.telefon     ?? '',
    email:       initial?.email       ?? '',
    marke:       initial?.marke       ?? '',
    modell:      initial?.modell      ?? '',
    kennzeichen: initial?.kennzeichen ?? '',
    km:          initial?.km          ?? '',
  });

  const s = (k: keyof CustomerData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function submit() {
    if (!f.vorname.trim() || !f.nachname.trim() || !f.telefon.trim()) {
      showToast('Bitte Pflichtfelder ausfüllen', 'error'); return;
    }
    onSave(f);
  }

  return (
    <div>
      <div className="cf-section-title" style={{ marginTop: 0 }}>Kontakt</div>
      <div className="cf-group">
        <div className="cf-grid-2">
          <div className="cf-field">
            <label className="cf-label">Vorname *</label>
            <input className="cf-input" value={f.vorname} onChange={s('vorname')} placeholder="Max" />
          </div>
          <div className="cf-field">
            <label className="cf-label">Nachname *</label>
            <input className="cf-input" value={f.nachname} onChange={s('nachname')} placeholder="Muster" />
          </div>
        </div>
        <div className="cf-grid-2" style={{ marginTop: 10 }}>
          <div className="cf-field">
            <label className="cf-label">Telefon *</label>
            <input className="cf-input" type="tel" value={f.telefon} onChange={s('telefon')} placeholder="+41 79 123 45 67" />
          </div>
          <div className="cf-field">
            <label className="cf-label">E-Mail</label>
            <input className="cf-input" type="email" value={f.email} onChange={s('email')} placeholder="max@muster.ch" />
          </div>
        </div>
      </div>

      <div className="cf-section-title">Fahrzeug</div>
      <div className="cf-group">
        <div className="cf-grid-2">
          <div className="cf-field">
            <label className="cf-label">Marke</label>
            <input className="cf-input" value={f.marke} onChange={s('marke')} placeholder="z.B. BMW" />
          </div>
          <div className="cf-field">
            <label className="cf-label">Modell</label>
            <input className="cf-input" value={f.modell} onChange={s('modell')} placeholder="z.B. 320d" />
          </div>
        </div>
        <div className="cf-grid-2" style={{ marginTop: 10 }}>
          <div className="cf-field">
            <label className="cf-label">Kennzeichen</label>
            <input className="cf-input" value={f.kennzeichen} onChange={s('kennzeichen')} placeholder="ZH 123456" />
          </div>
          <div className="cf-field">
            <label className="cf-label">KM-Stand</label>
            <input className="cf-input" type="number" value={String(f.km ?? '')} onChange={s('km')} placeholder="85000" />
          </div>
        </div>
      </div>

      <div className="cf-actions">
        <button className="cf-btn-save" onClick={submit} disabled={saving}>
          {saving ? 'Wird gespeichert…' : 'Sichern'}
        </button>
        <button className="cf-btn-cancel" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}
