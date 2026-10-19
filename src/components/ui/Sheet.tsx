import { ReactNode, useEffect, useRef } from 'react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
  barLeft?: ReactNode;
  barRight?: ReactNode;
}

/* Touch: bottom sheet sliding up from the edge. Desktop (≥1024px, see
   globals.css): the same markup renders as a centered dialog. Escape closes
   the topmost sheet on both. */
export default function Sheet({ title, onClose, children, full, barLeft, barRight }: SheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Only the topmost (last rendered) sheet reacts.
      const all = document.querySelectorAll('.sheet-container');
      if (all[all.length - 1] !== containerRef.current) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="sheet-backdrop" style={{ animation: 'fade-in 0.2s ease' }} onClick={onClose} />
      <div ref={containerRef} className={`sheet-container${full ? ' sheet-full' : ''}`} role="dialog" aria-modal="true" aria-label={title} style={{ maxHeight: full ? '96dvh' : '92dvh' }}>
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
