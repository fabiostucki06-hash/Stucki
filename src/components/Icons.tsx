import { useId, type ReactNode } from 'react';

/* GarageOS icon set – filled glyphs in the spirit of Apple's "Liquid Glass" app icons:
   solid, rounded silhouettes with detail cut out of the shape (not drawn on top), so
   they read cleanly at 16–20px and sit well on the neutral icon tiles (.icon-tile).
   Pure line glyphs (chevron, plus, close, menu …) use a heavy rounded stroke instead.
   Every export keeps its earlier name and props, so call sites stay unchanged. */

/** Filled shape(s) with details knocked out via a mask (cut-outs drawn in black). */
function Knockout({ w, h, vb, cut, children }: { w: number; h: number; vb: string; cut: ReactNode; children: ReactNode }) {
  const id = 'k' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg width={w} height={h} viewBox={vb} fill="none" aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse">
          <rect x="-4" y="-4" width="40" height="40" fill="#fff" />
          <g stroke="#000" fill="#000" strokeLinecap="round" strokeLinejoin="round">{cut}</g>
        </mask>
      </defs>
      <g mask={`url(#${id})`} fill="currentColor">{children}</g>
    </svg>
  );
}

const PAGE = 'M7 2h6.6c.5 0 1 .2 1.4.6l4.4 4.4c.4.4.6.9.6 1.4V20a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z';
const FOLD = <path d="M13.6 2.2V7a1.2 1.2 0 001.2 1.2h4.8" strokeWidth={1.5} fill="none" />;
const RECEIPT = 'M6 2h12a1.5 1.5 0 011.5 1.5v18.1a.4.4 0 01-.6.3l-2.2-1.5-2.3 1.6a.5.5 0 01-.6 0L12 20.4l-1.8 1.6a.5.5 0 01-.6 0l-2.3-1.6-2.2 1.5a.4.4 0 01-.6-.3V3.5A1.5 1.5 0 016 2z';

export const SFHouse = () => (
  <svg width={25} height={25} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M11.3 2.6a1.1 1.1 0 011.4 0l8.6 7.2c.7.6.3 1.7-.6 1.7H19.5V20a1.5 1.5 0 01-1.5 1.5h-3.5V16a1 1 0 00-1-1h-3a1 1 0 00-1 1v5.5H6A1.5 1.5 0 014.5 20v-8.5H3.3c-.9 0-1.3-1.1-.6-1.7l8.6-7.2z" fill="currentColor"/>
  </svg>
);

export const SFWrench = () => (
  <svg width={25} height={25} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20.6 6.1a.6.6 0 00-1-.2l-2.7 2.7-2.6-.6-.6-2.6 2.7-2.7a.6.6 0 00-.2-1A5.8 5.8 0 008.7 9.9l-6 6a2.6 2.6 0 003.7 3.7l6-6a5.8 5.8 0 008.2-7.5z" fill="currentColor"/>
  </svg>
);

export const SFDoc = () => (
  <Knockout w={25} h={25} vb="0 0 24 24" cut={<>{FOLD}<path d="M8.5 13h7M8.5 17h4.5" strokeWidth={1.7} /></>}>
    <path d={PAGE} />
  </Knockout>
);

/** Package (Materialofferten). */
export const SFBox = () => (
  <Knockout w={25} h={25} vb="0 0 24 24" cut={<path d="M3.6 7.3L12 11.8l8.4-4.5M12 11.8V22M7.8 4.9l8.4 4.6" strokeWidth={1.5} fill="none" />}>
    <path d="M11.3 2.2a1.5 1.5 0 011.4 0l7.5 4a1.5 1.5 0 01.8 1.3v9a1.5 1.5 0 01-.8 1.3l-7.5 4a1.5 1.5 0 01-1.4 0l-7.5-4a1.5 1.5 0 01-.8-1.3v-9a1.5 1.5 0 01.8-1.3l7.5-4z" />
  </Knockout>
);

/** Document with checkmark (Auftragsbestätigungen). */
export const SFDocCheck = () => (
  <Knockout w={25} h={25} vb="0 0 24 24" cut={<>{FOLD}<path d="M8.6 14.6l2.4 2.4 4.6-4.8" strokeWidth={1.9} fill="none" /></>}>
    <path d={PAGE} />
  </Knockout>
);

export const SFPerson = () => (
  <svg width={25} height={25} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx={12} cy={7.5} r={4.5} fill="currentColor"/>
    <path d="M3.5 20c0-4 3.8-7 8.5-7s8.5 3 8.5 7c0 .9-.6 1.5-1.5 1.5H5c-.9 0-1.5-.6-1.5-1.5z" fill="currentColor"/>
  </svg>
);

export const SFChevron = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const SFPlus = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"/>
  </svg>
);

export const SFXmark = () => (
  <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"/>
  </svg>
);

export const SFCheckmark = () => (
  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 7.3l3.4 3.4L12 3.6" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const SFChart = () => (
  <svg width={25} height={25} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x={3} y={13} width={5} height={8.5} rx={1.6} fill="currentColor"/>
    <rect x={9.5} y={7.5} width={5} height={14} rx={1.6} fill="currentColor"/>
    <rect x={16} y={2.5} width={5} height={19} rx={1.6} fill="currentColor"/>
  </svg>
);

export const SFReceipt = () => (
  <Knockout w={25} h={25} vb="0 0 24 24" cut={<path d="M8.5 7.5h7M8.5 11.5h7M8.5 15.5h4" strokeWidth={1.7} />}>
    <path d={RECEIPT} />
  </Knockout>
);

/** Receipt with a half-filled circle: 50% Anzahlung. */
export const SFReceiptHalf = () => (
  <Knockout w={25} h={25} vb="0 0 24 24" cut={<><circle cx={12} cy={10.5} r={4} strokeWidth={1.6} fill="none" /><path d="M12 6.5a4 4 0 010 8z" stroke="none" /></>}>
    <path d={RECEIPT} />
  </Knockout>
);

/** Receipt with a checkmark: Schlussrechnung (final invoice). */
export const SFReceiptCheck = () => (
  <Knockout w={25} h={25} vb="0 0 24 24" cut={<path d="M8.3 10.6l2.6 2.6 4.8-5.1" strokeWidth={1.9} fill="none" />}>
    <path d={RECEIPT} />
  </Knockout>
);

export const SFCloud = () => (
  <Knockout w={24} h={20} vb="0 0 24 20" cut={<path d="M12 16v-6.2M9.6 12.1L12 9.7l2.4 2.4" strokeWidth={1.9} fill="none" />}>
    <path d="M6.6 18.5a5.1 5.1 0 01-.9-10.1A7 7 0 0119.2 10a4.3 4.3 0 01-.7 8.5H6.6z" />
  </Knockout>
);

export const SFMenu = () => (
  <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden="true">
    <path d="M3.5 6h15M3.5 11h15M3.5 16h15" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"/>
  </svg>
);

export const SFRefresh = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M16.6 10a6.6 6.6 0 11-2-4.7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"/>
    <path d="M17.4 2.9v4.6a.6.6 0 01-.6.6h-4.6a.4.4 0 01-.3-.7l4.8-4.8a.4.4 0 01.7.3z" fill="currentColor"/>
  </svg>
);

export const SFPaperclip = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M12.5 6.5l-6 6a2.5 2.5 0 003.5 3.5l6.5-6.5a4 4 0 00-5.5-5.5l-6.5 6.5a5.5 5.5 0 007.5 7.5" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** arrow.down.circle.fill */
export const SFDownload = ({ size = 16 }: { size?: number }) => (
  <Knockout w={size} h={size} vb="0 0 16 16" cut={<path d="M8 4.3v6.4M5.4 8.3L8 10.9l2.6-2.6" strokeWidth={1.6} fill="none" />}>
    <circle cx={8} cy={8} r={7.2} />
  </Knockout>
);

/** clock.fill */
export const SFClock = ({ size = 16 }: { size?: number }) => (
  <Knockout w={size} h={size} vb="0 0 16 16" cut={<path d="M8 4.2V8l2.5 1.7" strokeWidth={1.5} fill="none" />}>
    <circle cx={8} cy={8} r={7.2} />
  </Knockout>
);

/** pencil.fill */
export const SFPencil = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M11.3 1.9a1.6 1.6 0 012.3 0l.5.5a1.6 1.6 0 010 2.3l-1 1-2.8-2.8 1-1z" fill="currentColor"/>
    <path d="M9.5 3.7l2.8 2.8-7.1 7.1a1.5 1.5 0 01-.7.4l-2.6.7a.4.4 0 01-.5-.5l.7-2.6c.1-.3.2-.5.4-.7l7-7.2z" fill="currentColor"/>
  </svg>
);

/** trash.fill */
export const SFTrash = ({ size = 16 }: { size?: number }) => (
  <Knockout w={size} h={size} vb="0 0 16 16" cut={<path d="M6.4 7v4.6M9.6 7v4.6" strokeWidth={1.2} fill="none" />}>
    <path d="M6.2 1.3h3.6a1 1 0 011 1v.9h3a.8.8 0 010 1.6H2.2a.8.8 0 010-1.6h3v-.9a1 1 0 011-1z" />
    <path d="M3.2 5.6h9.6l-.7 8.1a1.5 1.5 0 01-1.5 1.4H5.4a1.5 1.5 0 01-1.5-1.4l-.7-8.1z" />
  </Knockout>
);

/** gearshape.fill */
export const SFGear = () => (
  <svg width={25} height={25} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" fill="currentColor" d="M10.1 2h3.8l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.9 3.3-2 1.7a7 7 0 010 2l2 1.7-1.9 3.3-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.8l-.5-2.6a7 7 0 01-1.7-.9l-2.5.9-1.9-3.3 2-1.7a7 7 0 010-2l-2-1.7 1.9-3.3 2.5.9c.5-.4 1.1-.7 1.7-.9l.5-2.6zM12 15.3a3.3 3.3 0 100-6.6 3.3 3.3 0 000 6.6z"/>
  </svg>
);

/** exclamationmark.triangle.fill */
export const SFWarning = ({ size = 16 }: { size?: number }) => (
  <Knockout w={size} h={size} vb="0 0 24 24" cut={<><path d="M12 9v5" strokeWidth={2.2} fill="none" /><circle cx={12} cy={17.4} r={1.3} stroke="none" /></>}>
    <path d="M10.3 3.3a2 2 0 013.4 0l8.4 14.6a2 2 0 01-1.7 3H3.6a2 2 0 01-1.7-3L10.3 3.3z" />
  </Knockout>
);

/** scope / Find-My-style target: filled disc with a knocked-out ring. */
export const SFTarget = ({ size = 16 }: { size?: number }) => (
  <Knockout w={size} h={size} vb="0 0 24 24" cut={<circle cx={12} cy={12} r={5.6} strokeWidth={2} fill="none" />}>
    <circle cx={12} cy={12} r={9.5} />
  </Knockout>
);

/** cart.fill */
export const SFCart = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2.5 3.2h1.9c.6 0 1.1.4 1.2 1l.3 1.6h14.4c.8 0 1.4.8 1.2 1.6l-1.4 6.6a2 2 0 01-2 1.6H8.6a2 2 0 01-2-1.6L4.7 5.6l-.4-1.9H2.5" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" fill="currentColor"/>
    <circle cx={9} cy={19.8} r={1.7} fill="currentColor"/>
    <circle cx={17} cy={19.8} r={1.7} fill="currentColor"/>
  </svg>
);
