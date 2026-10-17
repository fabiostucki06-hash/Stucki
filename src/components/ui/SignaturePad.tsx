import { useEffect, useRef } from 'react';

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
}

// 3:1 like the signature box on the AB PDF (54 × 18 mm).
const W = 600, H = 200;

/** Finger / mouse signature field. Ink is dark on a transparent canvas so the
    PNG drops cleanly onto the white PDF page. */
export default function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef<string | undefined>(undefined);

  // Paint the stored signature, but not the one this pad just emitted.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || value === shown.current) return;
    shown.current = value;
    ctx.clearRect(0, 0, W, H);
    if (!value) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, W, H);
    img.src = value;
  }, [value]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.strokeStyle = '#1c1c1e';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const url = canvasRef.current?.toDataURL('image/png') ?? '';
    shown.current = url;
    onChange(url);
  }

  function clear() {
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, W, H);
    shown.current = '';
    onChange('');
  }

  return (
    <div className="sig-pad">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="sig-pad-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Unterschrift"
      />
      <div className="sig-pad-foot">
        <span>Hier unterschreiben</span>
        <button type="button" onClick={clear} className="mf-btn-cancel">Löschen</button>
      </div>
    </div>
  );
}
