import { useState } from 'react';
import Sheet from '../ui/Sheet';
import Badge from '../ui/Badge';
import VehicleForm from './VehicleForm';
import ServicePlan from './ServicePlan';
import { SFChevron } from '../Icons';
import { formatDateCH } from '../../lib/utils';
import { fahrzeugTitel, formatKm } from '../../lib/vehicles';
import { useApp } from '../../context/AppContext';
import type { Customer, Order, Vehicle } from '../../types';

interface VehicleDetailProps {
  vehicle: Vehicle;
  customer: Customer;
  onClose: () => void;
  onOrderClick: (o: Order) => void;
}

/** Fahrzeugprofil: data, Service-Wartungsplan and the vehicle's Aufträge. */
export default function VehicleDetail({ vehicle, customer, onClose, onOrderClick }: VehicleDetailProps) {
  const { orders, updateVehicle, deleteVehicle, docVehicle } = useApp();
  const [edit, setEdit] = useState(false);

  const auftraege = orders
    .filter((o) => o.customerId === customer.id && docVehicle(o)?.id === vehicle.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
      </div>

      <p className="section-header" style={{ padding: '0 0 8px' }}>Service-Wartungsplan</p>
      <ServicePlan key={vehicle.id} vehicle={vehicle} onSave={updateVehicle} />

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
            const upd: Vehicle = { id: vehicle.id, customerId: vehicle.customerId, createdAt: vehicle.createdAt, service: vehicle.service, ...data };
            await updateVehicle(upd);
            setEdit(false);
          }} />
        </Sheet>
      )}
    </Sheet>
  );
}
