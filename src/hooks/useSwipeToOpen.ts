import { useEffect, useRef } from 'react';

/** Horizontal distance (px) a right swipe needs before it counts. */
const THRESHOLD = 60;
/** Browser (not home-screen app): touches starting this close to the left edge
    belong to the browser's own back-swipe, so they are left alone. */
const EDGE_ZONE = 24;

/** Something floats above the page: sheet / dialog, context menu, FAB menu. */
function overlayOpen(): boolean {
  return !!document.querySelector('[aria-modal="true"], .sheet-backdrop, .context-menu, [role="menu"]');
}

/** The touch started on something that handles horizontal moves itself:
    form fields, reorder grips, draggable items, sliders, horizontal scrollers. */
function ownsHorizontalGesture(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  if (el?.closest('input, textarea, select, [contenteditable="true"], [draggable="true"], .df-grip, .df-dragging, [data-no-swipe]')) return true;
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Right swipe anywhere on the page calls `onOpen` (mobile navigation drawer).
 * Listeners are passive and never call preventDefault, so vertical scrolling and
 * every other touch interaction stay untouched; the swipe is only evaluated
 * once the finger lifts.
 */
export function useSwipeToOpen(enabled: boolean, onOpen: () => void) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;

    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!isStandalone() && t.clientX < EDGE_ZONE) return;
      if (overlayOpen() || ownsHorizontalGesture(e.target)) return;
      start = { x: t.clientX, y: t.clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) start = null; // pinch-zoom etc.
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      start = null;
      if (dx < THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
      if (overlayOpen()) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // text selection drag
      onOpenRef.current();
    };
    const onCancel = () => { start = null; };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled]);
}
