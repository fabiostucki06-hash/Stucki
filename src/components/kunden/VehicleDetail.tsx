import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Badge from '../ui/Badge';
import VehicleForm from './VehicleForm';
import Wartungsplan from './Wartungsplan';
import { SFChevron } from '../Icons';
import { formatDateCH } from '../../lib/utils';
import { FAHRZEUG_FELDER, fahrzeugTitel, formatKm } from '../../lib/vehicles';
import { ANTRIEBE, GETRIEBE, STEUERTRIEBE, fahrzeugProfil, labelVon } from '../../lib/wartung';
import { useApp } from '../../context/AppContext';
import type { Customer, Order, ServiceItem, Vehicle } from '../../types';

interface VehicleDetailProps {
  vehicle: Vehicle;
  customer: Customer;
  onClose: () => void;
  onOrderClick: (o: Order) => void;
  /** Creates a draft Offerte from the given Wartungsplan items and opens it. */
  onOfferte: (items: ServiceItem[]) => Promise<void>;
}

/** Fahrzeugprofil: data, Wartungsplan and the vehicle's Aufträge. */
export default function VehicleDetail({ vehicle, customer, onClose, onOrderClick, onOfferte }: VehicleDetailProps) {
  const { orders, updateVehicle, deleteVehicle, docVehicle } = useApp();
  const [edit, setEdit] = useState(false);

  const auftraege = orders
    .filter((o) => o.customerId === customer.id && docVehicle(o)?.id === vehicle.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Inferred technical data is marked as such; it drives the Wartungsplan.
  const profil = fahrzeugProfil(vehicle);
  const technik = (label?: string, erkannt?: boolean) => label && (erkannt ? `${label} (erkannt)` : label);

  const zeile = (label: string, value?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
      <span style={{ color: 'var(--label2)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{value || '–'}</span>
    </div>
  );

  async function remove() {
    if (!window.confirm(`Fahrzeug "${fahrzeugTitel(vehicle)}" mit Wartungsplan löschen? Dokumente bleiben erhalten.`)) return;
    try { await deleteVehicle(vehicle); onClose(); } catch { /* toast shown by the context */ }
  }

  return (
    <Sheet title={fahrzeugTitel(vehicle)} onClose={onClose} full back barRight={<button onClick={() => setEdit(true)} className="bar-btn">Bearbeiten</button>}>
      <div className="glass-panel" style={{ padding: '12px 14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div className="sf-title3">{fahrzeugTitel(vehicle)}</div>
            <div className="sf-footnote" style={{ color: 'var(--label2)' }}>{customer.vorname} {customer.nachname}</div>
          </div>
        </div>
        {zeile('Kontrollschild', vehicle.kennzeichen)}
        {zeile('Chassisnummer (VIN)', vehicle.chassisnummer)}
        {zeile('KM-Stand', vehicle.km ? `${formatKm(vehicle.km)} km` : undefined)}
        {zeile('1. Inv. Setzung', vehicle.erstzulassung ? formatDateCH(vehicle.erstzulassung) : undefined)}
        {zeile('Antrieb', technik(labelVon(ANTRIEBE, profil.antrieb), profil.erkannt.antrieb))}
        {zeile('Getriebe', technik(labelVon(GETRIEBE, profil.getriebe), profil.erkannt.getriebe))}
        {zeile('Motor', vehicle.motor)}
        {zeile('Motorkennbuchstabe', [vehicle.motorcode, profil.motor && `(${profil.motor.name})`].filter(Boolean).join(' ') || undefined)}
        {zeile('Steuertrieb', profil.steuertriebQuelle === 'marke'
          ? `${labelVon(STEUERTRIEBE, profil.steuertrieb)} (angenommen)`
          : technik(labelVon(STEUERTRIEBE, profil.steuertrieb), profil.erkannt.steuertrieb))}
      </div>

      <p className="section-header" style={{ padding: '0 0 8px' }}>Wartungsplan</p>
      <Wartungsplan key={vehicle.id} vehicle={vehicle} customer={customer} onSave={updateVehicle} onOfferte={onOfferte} />

      <p className="section-header" style={{ padding: '0 0 8px' }}>Aufträge ({auftraege.length})</p>
      {!auftraege.length && <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--label3)', fontSize: 15 }}>Noch keine Aufträge für dieses Fahrzeug.</div>}
      {auftraege.length > 0 && (
        <div className="inset-grouped-list" style={{ marginBottom: 20 }}>
          {auftraege.map((o) => (
            <div key={o.id} className="list-row" tabIndex={0} onClick={() => onOrderClick(o)}>
              <div style={{ flex: 1 }}>
                <div className="sf-subhead" style={{ fontWeight: 600 }}>Auftrag #{o.orderNumber}</div>
                <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{formatDateCH(o.createdAt)}</div>
              </div>
              <Badge status={o.status} small />
              <span style={{ color: 'var(--label3)', marginLeft: 6 }}><SFChevron /></span>
            </div>
          ))}
        </div>
      )}

      <button onClick={remove} className="text-danger-btn">Fahrzeug löschen</button>

      {edit && (
        <Sheet title="Fahrzeug bearbeiten" onClose={() => setEdit(false)}
          barRight={<button onClick={() => setEdit(false)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <VehicleForm initial={vehicle} onCancel={() => setEdit(false)} onSave={async (data) => {
            // The form holds all vehicle fields: cleared ones are dropped, the rest (plan, profile) kept.
            const upd: Vehicle = { ...vehicle, ...data };
            for (const k of FAHRZEUG_FELDER) if (!(k in data)) delete upd[k];
            await updateVehicle(upd);
            setEdit(false);
          }} />
        </Sheet>
      )}
    </Sheet>
  );
}
