import { useRef, useState } from 'react';
import Sheet from '../ui/Sheet';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import DocumentViewerModal from '../ui/DocumentViewerModal';
import VehicleDetail from './VehicleDetail';
import VehicleForm from './VehicleForm';
import { SFChevron, SFPaperclip, SFDownload, SFTrash, SFPlus } from '../Icons';
import { anstehendeServices, fahrzeugTitel, formatKm } from '../../lib/vehicles';
import { isOverdue, formatDateCH } from '../../lib/utils';
import { showToast } from '../ui/Toast';
import { useApp } from '../../context/AppContext';
import { storage } from '../../lib/supabase';
import type { Customer, Order, VehicleDocument } from '../../types';

const DOCS_BUCKET = 'vehicle-documents';
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CustomerDetailProps {
  customer: Customer;
  orders: Order[];
  onClose: () => void;
  onEdit: () => void;
  onNewOrder: () => void;
  onOrderClick: (o: Order) => void;
  onDelete: () => void;
}

export default function CustomerDetail({ customer, orders, onClose, onEdit, onNewOrder, onOrderClick, onDelete }: CustomerDetailProps) {
  const { token, updateCustomer, vehiclesOf, addVehicle, docVehicle } = useApp();
  const fahrzeuge = vehiclesOf(customer.id);
  // By id, so the open profile follows every save of the vehicle.
  const [fahrzeugId, setFahrzeugId] = useState<string | null>(null);
  const offenesFahrzeug = fahrzeuge.find((v) => v.id === fahrzeugId);
  const [neuesFahrzeug, setNeuesFahrzeug] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<VehicleDocument | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const docs = customer.vehicleDocuments ?? [];

  const cos = orders
    .filter((o) => o.customerId === customer.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function handleFilesSelected(files: FileList | null) {
    if (!files || !files.length || !token) return;
    setUploading(true);
    try {
      const newDocs: VehicleDocument[] = [];
      for (const file of Array.from(files)) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          showToast(`${file.name}: nur PDF, PNG oder JPG erlaubt`, 'error');
          continue;
        }
        const path = `${customer.id}/${Date.now()}_${file.name}`;
        await storage.upload(DOCS_BUCKET, path, file, token);
        newDocs.push({ path, name: file.name, uploadedAt: new Date().toISOString(), size: file.size });
      }
      if (newDocs.length) {
        await updateCustomer(customer.id, { vehicleDocuments: [...docs, ...newDocs] });
        showToast(`${newDocs.length} Datei${newDocs.length > 1 ? 'en' : ''} hochgeladen`, 'success');
      }
    } catch (e) {
      showToast('Upload fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'), 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDownload(doc: VehicleDocument) {
    if (!token) return;
    setBusyPath(doc.path);
    try {
      const url = await storage.createSignedUrl(DOCS_BUCKET, doc.path, token, 60);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      showToast('Download fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'), 'error');
    } finally {
      setBusyPath(null);
    }
  }

  async function handleDeleteDoc(doc: VehicleDocument): Promise<boolean> {
    if (!token) return false;
    if (!window.confirm(`"${doc.name}" löschen?`)) return false;
    setBusyPath(doc.path);
    try {
      await storage.remove(DOCS_BUCKET, [doc.path], token);
      await updateCustomer(customer.id, { vehicleDocuments: docs.filter((d) => d.path !== doc.path) });
      return true;
    } catch (e) {
      showToast('Löschen fehlgeschlagen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'), 'error');
      return false;
    } finally {
      setBusyPath(null);
    }
  }

  async function openViewer(doc: VehicleDocument) {
    setViewerDoc(doc);
    setViewerUrl(null);
    setViewerError(null);
    if (!token) { setViewerError('Nicht angemeldet'); return; }
    setViewerLoading(true);
    try {
      const url = await storage.createSignedUrl(DOCS_BUCKET, doc.path, token, 300);
      setViewerUrl(url);
    } catch (e) {
      setViewerError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setViewerLoading(false);
    }
  }

  function closeViewer() {
    setViewerDoc(null);
    setViewerUrl(null);
    setViewerError(null);
  }

  return (
    <Sheet title="Kundenakte" onClose={onClose} full back barRight={<button onClick={onEdit} className="bar-btn">Bearbeiten</button>}>
      <div className="glass-panel" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar avatar-lg">
            {(customer.vorname?.[0] ?? '').toUpperCase()}{(customer.nachname?.[0] ?? '').toUpperCase()}
          </div>
          <div>
            <div className="sf-title3">{customer.vorname} {customer.nachname}</div>
            <div className="sf-subhead" style={{ color: 'var(--label2)' }}>{customer.telefon}</div>
            {customer.email && <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{customer.email}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8 }}>
        <p className="section-header" style={{ padding: 0 }}>Fahrzeuge ({fahrzeuge.length})</p>
        <button className="sp-add-vehicle" onClick={() => setNeuesFahrzeug(true)}><SFPlus size={12} /> Fahrzeug hinzufügen</button>
      </div>
      <div className="glass-panel" style={{ marginBottom: 20, overflow: 'hidden' }}>
        {!fahrzeuge.length && (
          <div style={{ textAlign: 'center', padding: '18px 12px', color: 'var(--label3)', fontSize: 15 }}>Noch kein Fahrzeug erfasst.</div>
        )}
        {fahrzeuge.map((v) => {
          const offen = anstehendeServices(v);
          const rot = offen.some((x) => x.zustand === 'ueberfaellig');
          return (
            <div key={v.id} className="list-row" tabIndex={0} onClick={() => setFahrzeugId(v.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sf-subhead" style={{ fontWeight: 600 }}>{fahrzeugTitel(v)}{v.kennzeichen && <span style={{ color: 'var(--label2)', fontWeight: 500 }}> · {v.kennzeichen}</span>}</div>
                <div className="sf-footnote" style={{ color: 'var(--label3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[v.chassisnummer && `VIN ${v.chassisnummer}`, v.km && `${formatKm(v.km)} km`].filter(Boolean).join(' · ') || 'Keine weiteren Angaben'}
                </div>
                {offen.length > 0 && (
                  <div className="sf-footnote" style={{ color: rot ? 'var(--red)' : 'var(--orange)', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rot ? 'Wartung fällig' : 'Wartung bald fällig'}: {offen.map((x) => x.item.name).join(', ')}
                  </div>
                )}
              </div>
              <span style={{ color: 'var(--label3)' }}><SFChevron /></span>
            </div>
          );
        })}
      </div>

      <p className="section-header" style={{ padding: '0 0 6px' }}>Fahrzeugpapiere</p>
      <div className="glass-panel" style={{ padding: 10, marginBottom: 16 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (!uploading) handleFilesSelected(e.dataTransfer.files); }}
          style={{
            border: '1px dashed var(--border-strong)', borderRadius: 8, padding: '10px 12px',
            textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
            background: 'var(--surface)', marginBottom: docs.length ? 14 : 0,
          }}
        >
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Spinner size={22} />
              <span className="sf-footnote" style={{ color: 'var(--label2)' }}>Wird hochgeladen…</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--label2)' }}>
              <SFPaperclip size={16} />
              <span className="sf-footnote">Dateien auswählen oder hierher ziehen <span style={{ color: 'var(--label3)' }}>· PDF, PNG, JPG</span></span>
            </div>
          )}
        </div>

        {docs.length > 0 && (
          <div className="inset-grouped-list" style={{ margin: 0 }}>
            {docs.map((doc) => (
              <div key={doc.path} className="list-row" tabIndex={0} onClick={() => openViewer(doc)}>
                <span className="list-row-icon" style={{ background: 'rgb(var(--accent-rgb) / 0.12)', color: 'var(--blue)' }}>
                  <SFPaperclip size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sf-subhead" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                  <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{formatBytes(doc.size)} · {formatDateCH(doc.uploadedAt)}</div>
                </div>
                {busyPath === doc.path ? (
                  <Spinner size={18} />
                ) : (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleDownload(doc); }} className="bar-btn" title="Herunterladen" style={{ color: 'var(--blue)' }}><SFDownload /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc); }} className="bar-btn" title="Löschen" style={{ color: 'var(--red)' }}><SFTrash /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onNewOrder} className="btn-system" style={{ marginBottom: 12 }}>Neuer Auftrag</button>

      <p className="section-header">Aufträge ({cos.length})</p>
      {!cos.length && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--label3)', fontSize: 15 }}>Noch keine Aufträge.</div>}
      <div className="inset-grouped-list">
        {cos.map((o) => (
          <div key={o.id} className="list-row" tabIndex={0} onClick={() => onOrderClick(o)}>
            <div style={{ flex: 1 }}>
              {isOverdue(o) && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 2 }}>Frist überschritten</div>}
              <div className="sf-subhead" style={{ fontWeight: 600 }}>Auftrag #{o.orderNumber}</div>
              <div className="sf-footnote" style={{ color: 'var(--label3)' }}>
                {formatDateCH(o.createdAt)}{fahrzeuge.length > 1 && docVehicle(o) ? ` · ${fahrzeugTitel(docVehicle(o)!)}` : ''}
              </div>
            </div>
            <Badge status={o.status} small />
            <span style={{ color: 'var(--label3)', marginLeft: 6 }}><SFChevron /></span>
          </div>
        ))}
      </div>

      <button
        onClick={() => { if (window.confirm('Kunden löschen? Dies kann nicht rückgängig gemacht werden.')) onDelete(); }}
        className="text-danger-btn"
      >
        Kunden löschen
      </button>

      {offenesFahrzeug && (
        <VehicleDetail
          vehicle={offenesFahrzeug} customer={customer}
          onClose={() => setFahrzeugId(null)}
          onOrderClick={(o) => { setFahrzeugId(null); onOrderClick(o); }}
        />
      )}

      {neuesFahrzeug && (
        <Sheet title="Neues Fahrzeug" onClose={() => setNeuesFahrzeug(false)}
          barRight={<button onClick={() => setNeuesFahrzeug(false)} className="bar-btn" style={{ color: 'var(--label2)' }}>Abbrechen</button>}>
          <VehicleForm onCancel={() => setNeuesFahrzeug(false)} onSave={async (data) => {
            const v = await addVehicle(customer.id, data);
            setNeuesFahrzeug(false);
            setFahrzeugId(v.id);
          }} />
        </Sheet>
      )}

      {viewerDoc && (
        <DocumentViewerModal
          doc={viewerDoc}
          url={viewerUrl}
          loading={viewerLoading}
          error={viewerError}
          deleting={busyPath === viewerDoc.path}
          onClose={closeViewer}
          onDownload={() => handleDownload(viewerDoc)}
          onDelete={async () => { if (await handleDeleteDoc(viewerDoc)) closeViewer(); }}
        />
      )}
    </Sheet>
  );
}
