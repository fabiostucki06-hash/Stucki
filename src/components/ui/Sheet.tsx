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
    // Plain `overflow:hidden` doesn't block background scroll on iOS Safari.
    // Pin the body in place instead and restore the scroll position on close.
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    body.position = 'fixed';
    body.top = `-${scrollY}px`;
    body.width = '100%';
    body.overflow = 'hidden';
    return () => {
      body.position = prev.position;
      body.top = prev.top;
      body.width = prev.width;
      body.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
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
