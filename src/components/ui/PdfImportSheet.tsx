import { useRef, useState } from 'react';
import Spinner from './Spinner';
import { importPdf, type PdfImportResult } from '../../lib/pdf-import';

export type PdfImportZiel = 'offerte' | 'rechnung';

interface PdfImportSheetProps {
  token: string;
  /** Preselected document type (the list the import was started from). */
  defaultZiel: PdfImportZiel;
  /** Creates the draft and opens it for review; rejects to keep the sheet open. */
  onImported: (result: PdfImportResult, ziel: PdfImportZiel, filename: string) => Promise<void>;
}

/* Upload a PDF (drop or pick), read it on the server with Claude, then hand the
   structured data to the app, which creates the draft. */
export default function PdfImportSheet({ token, defaultZiel, onImported }: PdfImportSheetProps) {
  const [ziel, setZiel] = useState<PdfImportZiel>(defaultZiel);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setBusy(file.name);
    try {
      const result = await importPdf(file, token);
      await onImported(result, ziel, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import fehlgeschlagen');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <label className="cf-label">Erstellen als</label>
      <div className="seg-ctrl" style={{ width: '100%', marginBottom: 16 }}>
        {(['offerte', 'rechnung'] as const).map((z) => (
          <button key={z} className={`seg-item${ziel === z ? ' active' : ''}`} onClick={() => setZiel(z)} disabled={!!busy} style={{ flex: 1 }}>
            {z === 'offerte' ? 'Offerte' : 'Rechnung'}
          </button>
        ))}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="PDF auswählen oder hierher ziehen"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFile(e.dataTransfer.files[0]); }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          minHeight: 180, padding: 24, borderRadius: 16, textAlign: 'center', cursor: busy ? 'default' : 'pointer',
          background: dragOver ? 'rgba(0,122,255,0.14)' : 'var(--card-bg)',
          WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
          border: `2px dashed ${dragOver ? '#007AFF' : 'rgba(0,122,255,0.35)'}`,
          boxShadow: '0 8px 32px 0 rgba(0,0,0,0.1)',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {busy ? (
          <>
            <Spinner />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--label)' }}>{busy} wird gelesen…</div>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>Kunde, Fahrzeug und Positionen werden erkannt. Das dauert bis zu einer Minute.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>📄</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--label)' }}>PDF hierher ziehen</div>
            <div style={{ fontSize: 13, color: 'var(--label2)' }}>oder tippen, um eine Datei zu wählen (max. 3 MB)</div>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />

      {error && (
        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(255,59,48,0.12)', color: '#FF3B30', fontSize: 14, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 13, color: 'var(--label2)', lineHeight: 1.45 }}>
        Aus dem PDF wird ein Entwurf erstellt und direkt zum Bearbeiten geöffnet – bitte Kunde, Positionen und Preise prüfen.
        Unbekannte Kunden werden neu angelegt.
      </div>
    </div>
  );
}
