import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { SFXmark, SFDownload, SFTrash, SFDoc } from '../Icons';
import { getFileKind } from '../../lib/fileKind';
import type { VehicleDocument } from '../../types';

interface DocumentViewerModalProps {
  doc: VehicleDocument;
  url: string | null;
  loading: boolean;
  error: string | null;
  deleting?: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

export default function DocumentViewerModal({ doc, url, loading, error, deleting, onClose, onDownload, onDelete }: DocumentViewerModalProps) {
  const [zoomed, setZoomed] = useState(false);
  const kind = getFileKind(doc.name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    body.position = 'fixed'; body.top = `-${scrollY}px`; body.width = '100%'; body.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      body.position = prev.position; body.top = prev.top; body.width = prev.width; body.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', flexDirection: 'column', background: 'rgba(10,12,20,0.92)', animation: 'fade-in 0.15s ease' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          paddingTop: 'calc(12px + env(safe-area-inset-top))',
          background: 'rgba(28,32,50,0.80)', backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.12)', flexShrink: 0,
        }}
      >
        <button onClick={onClose} className="bar-btn" style={{ color: '#fff' }} aria-label="Schliessen"><SFXmark /></button>
        <span style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.name}
        </span>
        {deleting ? (
          <Spinner size={18} color="#fff" />
        ) : (
          <>
            <button onClick={onDownload} disabled={!url} className="bar-btn" style={{ color: '#fff', opacity: url ? 1 : 0.4 }} title="Herunterladen" aria-label="Herunterladen"><SFDownload /></button>
            <button onClick={onDelete} className="bar-btn" style={{ color: 'var(--red)' }} title="Löschen" aria-label="Löschen"><SFTrash /></button>
          </>
        )}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: zoomed ? 'auto' : 'hidden', position: 'relative',
        }}
      >
        {loading && <Spinner size={36} color="#fff" />}

        {!loading && error && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', padding: 24 }}>
            <div style={{ fontSize: 15, marginBottom: 4 }}>Vorschau fehlgeschlagen</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{error}</div>
          </div>
        )}

        {!loading && !error && url && kind === 'image' && (
          <img
            src={url}
            alt={doc.name}
            onClick={() => setZoomed((z) => !z)}
            style={
              zoomed
                ? { maxWidth: 'none', maxHeight: 'none', width: 'auto', height: 'auto', cursor: 'zoom-out', overflow: 'auto' }
                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }
            }
          />
        )}

        {!loading && !error && url && kind === 'pdf' && (
          <iframe title={doc.name} src={url} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        )}

        {!loading && !error && url && kind === 'other' && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.85)', padding: 24 }}>
            <div style={{ marginBottom: 10, opacity: 0.7 }}><SFDoc /></div>
            <div style={{ fontSize: 15, marginBottom: 14 }}>Keine Vorschau für dieses Format verfügbar</div>
            <button onClick={onDownload} className="btn-system" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'auto', padding: '10px 20px' }}>
              <SFDownload /> Herunterladen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
