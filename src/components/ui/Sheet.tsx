import { ReactNode, useEffect } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
  barLeft?: ReactNode;
  barRight?: ReactNode;
}

export default function Sheet({ title, onClose, children, full, barLeft, barRight }: SheetProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      <div className="sheet-backdrop" style={{ animation: 'fade-in 0.2s ease' }} onClick={onClose} />
      <div className="sheet-container" style={{ maxHeight: full ? '96dvh' : '92dvh' }}>
        <div className="sheet-handle" />
        <div className="sheet-nav">
          {barLeft ?? <div style={{ minWidth: 60 }} />}
          <span className="sf-headline">{title}</span>
          {barRight ?? (
            <button className="bar-btn" onClick={onClose} style={{ color: 'var(--blue)', fontWeight: 400 }}>
              Fertig
            </button>
          )}
        </div>
        <div className="sheet-content">{children}</div>
      </div>
    </>
  );
}
