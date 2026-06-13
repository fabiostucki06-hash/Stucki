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
    vorname: initial?.vorname ?? '',
    nachname: initial?.nachname ?? '',
    telefon: initial?.telefon ?? '',
    email: initial?.email ?? '',
    marke: initial?.marke ?? '',
    modell: initial?.modell ?? '',
    kennzeichen: initial?.kennzeichen ?? '',
    km: initial?.km ?? '',
  });

  const s = (k: keyof CustomerData) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit() {
    if (!f.vorname.trim() || !f.nachname.trim() || !f.telefon.trim()) {
      showToast('Bitte Pflichtfelder ausfüllen', 'error'); return;
    }
    onSave(f);
  }

  const inp = (placeholder: string, key: keyof CustomerData, type = 'text', last = false) => (
    <input
      type={type} value={String(f[key] ?? '')} onChange={(e) => s(key)(e.target.value)}
      placeholder={placeholder}
      className={`text-field${last ? ' text-field-last' : ''}`}
      style={{ display: 'block' }}
    />
  );

  return (
    <div>
      <p className="section-header">Name</p>
      <div className="form-section">{inp('Vorname', 'vorname')}{inp('Nachname', 'nachname', 'text', true)}</div>

      <p className="section-header">Kontakt</p>
      <div className="form-section">{inp('Telefon', 'telefon', 'tel')}{inp('E-Mail (optional)', 'email', 'email', true)}</div>

      <p className="section-header">Fahrzeug</p>
      <div className="form-section">
        {inp('Marke', 'marke')}
        {inp('Modell', 'modell')}
        {inp('Kennzeichen', 'kennzeichen')}
        {inp('KM-Stand (optional)', 'km', 'number', true)}
      </div>

      <button onClick={submit} disabled={saving} className="btn-system" style={{ marginBottom: 12 }}>
        {saving ? 'Wird gespeichert…' : 'Sichern'}
      </button>
      <button onClick={onCancel} className="btn-system btn-secondary">Abbrechen</button>
    </div>
  );
}
