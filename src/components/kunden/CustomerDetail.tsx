import { useRef, useState } from 'react';
import Sheet from '../ui/Sheet';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';
import DocumentViewerModal from '../ui/DocumentViewerModal';
import { SFChevron, SFPaperclip, SFDownload, SFTrash } from '../Icons';
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
  const { token, updateCustomer } = useApp();
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
    <Sheet title="Kundenakte" onClose={onClose} full barRight={<button onClick={onEdit} className="bar-btn">Bearbeiten</button>}>
      <div className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 26,
            background: 'linear-gradient(to bottom,#54a4ff,#0056b3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5),0 3px 8px rgba(0,86,179,0.35)',
            textShadow: '0 -1px 0 rgba(0,0,0,0.3)',
          }}>
            {(customer.vorname?.[0] ?? '').toUpperCase()}{(customer.nachname?.[0] ?? '').toUpperCase()}
          </div>
          <div>
            <div className="sf-title3">{customer.vorname} {customer.nachname}</div>
            <div className="sf-subhead" style={{ color: 'var(--label2)' }}>{customer.telefon}</div>
            {customer.email && <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{customer.email}</div>}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.60)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70),0 4px 16px rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 18 }}>🚗</span>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{customer.marke ?? ''} {customer.modell ?? ''} · {customer.kennzeichen ?? ''}</span>
          {customer.km && <span style={{ fontSize: 13, color: 'var(--label2)', marginLeft: 'auto' }}>{Number(customer.km).toLocaleString()} km</span>}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.60)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.70),0 4px 16px rgba(0,0,0,0.08)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--label2)' }}>Chassisnummer</span>
            <span style={{ fontWeight: 600 }}>{customer.chassisnummer || '–'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--label2)' }}>1. Inv. Setzung</span>
            <span style={{ fontWeight: 600 }}>{customer.erstzulassung ? formatDateCH(customer.erstzulassung) : '–'}</span>
          </div>
        </div>
      </div>

      <p className="section-header" style={{ padding: '0 0 8px' }}>Fahrzeugpapiere</p>
      <div className="glass-panel" style={{ padding: 16, marginBottom: 20 }}>
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
            border: '1.5px dashed var(--sep-opaque)', borderRadius: 12, padding: '18px 12px',
            textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
            background: 'rgba(255,255,255,0.35)', marginBottom: docs.length ? 14 : 0,
          }}
        >
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Spinner size={22} />
              <span className="sf-footnote" style={{ color: 'var(--label2)' }}>Wird hochgeladen…</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--label2)' }}>
              <SFPaperclip size={22} />
              <span className="sf-subhead">Dateien auswählen oder hierher ziehen</span>
              <span className="sf-footnote" style={{ color: 'var(--label3)' }}>PDF, PNG, JPG</span>
            </div>
          )}
        </div>

        {docs.length > 0 && (
          <div className="inset-grouped-list" style={{ margin: 0 }}>
            {docs.map((doc) => (
              <div key={doc.path} className="list-row" onClick={() => openViewer(doc)}>
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
      <button
        onClick={() => { if (window.confirm('Kunden löschen? Dies kann nicht rückgängig gemacht werden.')) onDelete(); }}
        className="btn-system btn-destructive"
        style={{ marginBottom: 20 }}
      >
        Kunden löschen
      </button>

      <p className="section-header">Aufträge ({cos.length})</p>
      {!cos.length && <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--label3)', fontSize: 15 }}>Noch keine Aufträge.</div>}
      <div className="inset-grouped-list">
        {cos.map((o) => (
          <div key={o.id} className="list-row" onClick={() => onOrderClick(o)}>
            <div style={{ flex: 1 }}>
              {isOverdue(o) && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 2 }}>Frist überschritten</div>}
              <div className="sf-subhead" style={{ fontWeight: 600 }}>Auftrag #{o.orderNumber}</div>
              <div className="sf-footnote" style={{ color: 'var(--label3)' }}>{formatDateCH(o.createdAt)}</div>
            </div>
            <Badge status={o.status} small />
            <span style={{ color: 'var(--label3)', marginLeft: 6 }}><SFChevron /></span>
          </div>
        ))}
      </div>

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
