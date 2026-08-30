/**
 * Derives the app's text/border/card/accent tokens from the currently selected
 * background wallpaper, so the glass UI stays legible no matter how bright the
 * photo is (previously the design only ever accounted for dark photos).
 *
 * Approach: sample the wallpaper's average color, then evaluate the two card
 * treatments the design system already defines (CLAUDE.md "Dark Mode" navy
 * glass vs. "Milchglas" white glass) at an overlay opacity that scales with
 * how far the photo already is from black/white. Picking whichever of the two
 * yields the higher WCAG contrast ratio keeps body text at AA (>=4.5:1) or
 * better across the full brightness range — verified by sweep, see PR notes.
 */

type RGB = [number, number, number];

const DARK_TINT:  RGB = [30, 34, 52];   // CLAUDE.md dark-glass navy
const LIGHT_TINT: RGB = [255, 255, 255]; // CLAUDE.md "Milchglas" white
const DARK_TEXT:  RGB = [255, 255, 255];
const LIGHT_TEXT: RGB = [18, 18, 22];

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const relLuminance = ([r, g, b]: RGB) =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const blend = (fg: RGB, alpha: number, bg: RGB): RGB =>
  [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as RGB;
const contrastRatio = (l1: number, l2: number) => {
  const a = Math.max(l1, l2) + 0.05, b = Math.min(l1, l2) + 0.05;
  return a / b;
};
const rgba = ([r, g, b]: RGB, a: number) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(2)})`;

/** More opaque the closer the photo already is to the "wrong" end of the scale. */
const darkTintAlpha  = (brightness: number) => Math.min(0.86, 0.12 + brightness * 0.95);
const lightTintAlpha = (brightness: number) => Math.min(0.88, 0.16 + (1 - brightness) * 0.95);

const lerpHue = (a: number, b: number, t: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};

function rgbToHueSat(r: number, g: number, b: number): { h: number; s: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d) % 6; break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  h *= 60;
  if (h < 0) h += 360;
  return { h, s };
}

export type WallpaperThemeId = 'wallpaper-1' | 'wallpaper-2' | 'wallpaper-3';

interface AccentPalette {
  h: number;              // accent hue
  s: number;              // accent saturation (0-1)
  lightnessShift?: number; // shifts the whole ladder darker/lighter (HSL lightness isn't perceptually even across hues — green/orange read brighter than blue at the same L)
  borderHue?: number;     // if set, tints --card-border/--sep toward this hue instead of neutral
  borderSat?: number;
  scrimRgb: RGB;          // .bg::after top-of-photo legibility gradient
  placeholderRgb: RGB;    // .bg solid color shown before the photo has loaded
}

/** Curated per-wallpaper accent palettes (distinct from the auto-sampled photo color below). */
const WALLPAPER_PALETTES: Record<WallpaperThemeId, AccentPalette> = {
  // Mac Standard — classic Apple blue, neutral chrome, original lavender scrim/placeholder
  'wallpaper-1': { h: 211, s: 1.00, scrimRgb: [180, 155, 210], placeholderRgb: [196, 176, 212] },
  // Mac Secondary — warm amber/orange, warm tan scrim (no blue/violet cast)
  'wallpaper-2': { h: 32,  s: 0.92, scrimRgb: [150, 110, 70],  placeholderRgb: [176, 140, 100] },
  // Nature/Green — deep forest green, olive borders, dark olive scrim (zero blue saturation)
  'wallpaper-3': { h: 148, s: 0.55, lightnessShift: -0.08, borderHue: 74, borderSat: 0.38,
                   scrimRgb: [58, 74, 46], placeholderRgb: [72, 92, 58] },
};

const hslToRgb = (h: number, s: number, l: number): RGB => {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

export interface SampledColor { r: number; g: number; b: number; }

/**
 * Downsamples the image (already a same-origin/blob URL — call this with the
 * local blob URL, not the remote asset URL, to avoid canvas tainting) and
 * returns its average color.
 */
export function sampleImageColor(src: string): Promise<SampledColor> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2d context unavailable');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
        resolve({ r: r / n, g: g / n, b: b / n });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

const setRgbVar = (root: CSSStyleDeclaration, name: string, [r, g, b]: RGB) =>
  root.setProperty(name, `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`);

/**
 * Sets the root CSS custom properties that drive text, dividers, cards and the
 * accent color family (buttons, active tabs, chips, input focus rings, ...).
 *
 * `themeId` selects a curated palette (see WALLPAPER_PALETTES) for the known
 * wallpapers so each one gets a deliberately distinct look; for an unrecognized
 * (e.g. custom-uploaded) wallpaper it falls back to nudging the classic blue
 * toward the photo's own dominant hue, same as before this existed.
 */
export function applyBgTheme({ r, g, b }: SampledColor, themeId?: WallpaperThemeId): void {
  const photo: RGB = [r, g, b];
  const brightness = relLuminance(photo);

  const dAlpha = darkTintAlpha(brightness);
  const lAlpha = lightTintAlpha(brightness);
  const darkCard  = blend(DARK_TINT, dAlpha, photo);
  const lightCard = blend(LIGHT_TINT, lAlpha, photo);
  const darkContrast  = contrastRatio(relLuminance(darkCard),  relLuminance(blend(DARK_TEXT, 0.96, darkCard)));
  const lightContrast = contrastRatio(relLuminance(lightCard), relLuminance(blend(LIGHT_TEXT, 0.94, lightCard)));
  const useDark = darkContrast >= lightContrast;

  const root = document.documentElement.style;
  document.documentElement.dataset.theme = themeId ?? 'wallpaper-1';

  const palette = themeId ? WALLPAPER_PALETTES[themeId] : undefined;

  // Always set unconditionally (not just when a palette overrides them) so
  // switching back to a theme without a custom scrim doesn't leave the
  // previous theme's tint stuck via the inline style.
  const scrim = palette ? palette.scrimRgb : WALLPAPER_PALETTES['wallpaper-1'].scrimRgb;
  const placeholder = palette ? palette.placeholderRgb : WALLPAPER_PALETTES['wallpaper-1'].placeholderRgb;
  setRgbVar(root, '--bg-scrim-rgb', scrim);
  setRgbVar(root, '--bg-placeholder-rgb', placeholder);

  if (useDark) {
    root.setProperty('--label',      'rgba(255,255,255,0.96)');
    root.setProperty('--label2',     'rgba(255,255,255,0.65)');
    root.setProperty('--label3',     'rgba(255,255,255,0.38)');
    root.setProperty('--label4',     'rgba(255,255,255,0.22)');
    root.setProperty('--sep',        'rgba(255,255,255,0.12)');
    root.setProperty('--sep-opaque', 'rgba(255,255,255,0.35)');
    root.setProperty('--card-bg',     rgba(DARK_TINT, dAlpha));
    root.setProperty('--card-border', 'rgba(255,255,255,0.20)');
  } else {
    root.setProperty('--label',      'rgba(18,18,22,0.94)');
    root.setProperty('--label2',     'rgba(18,18,22,0.62)');
    root.setProperty('--label3',     'rgba(18,18,22,0.36)');
    root.setProperty('--label4',     'rgba(18,18,22,0.18)');
    root.setProperty('--sep',        'rgba(18,18,22,0.16)');
    root.setProperty('--sep-opaque', 'rgba(18,18,22,0.34)');
    root.setProperty('--card-bg',     rgba(LIGHT_TINT, lAlpha));
    root.setProperty('--card-border', 'rgba(18,18,22,0.18)');
  }

  // Border tint: wallpaper-1 stays neutral (classic dark-mode chrome); wallpapers
  // with a curated borderHue (e.g. wallpaper-3's olive) get their card/separator
  // borders tinted to match instead, at the same alpha the neutral version used.
  if (palette?.borderHue !== undefined) {
    const borderTint = hslToRgb(palette.borderHue, palette.borderSat ?? palette.s, useDark ? 0.62 : 0.38);
    root.setProperty('--card-border', rgba(borderTint, useDark ? 0.26 : 0.24));
    root.setProperty('--sep',         rgba(borderTint, useDark ? 0.18 : 0.22));
  }

  // Accent hue: curated per known wallpaper, or nudged from the classic blue
  // toward the photo's dominant hue (capped small so it stays recognizably
  // "on-brand") for anything without a curated palette.
  const baseHue = 211; // hue of #007AFF
  let h: number, s: number, shift: number;
  if (palette) {
    h = palette.h; s = palette.s; shift = palette.lightnessShift ?? 0;
  } else {
    const sampled = rgbToHueSat(r, g, b);
    h = lerpHue(baseHue, sampled.h, Math.min(sampled.s, 0.6) * 0.22);
    s = 1; shift = 0;
  }
  const rung = (l: number) => Math.max(0, Math.min(1, l + shift));

  const accentLightness = useDark ? 58 : 42;
  root.setProperty('--blue', `hsl(${h.toFixed(1)} ${(s * 88).toFixed(0)}% ${Math.round(rung(accentLightness / 100) * 100)}%)`);

  // Full ladder backing the shared button/tab/chip/focus-ring CSS (see globals.css
  // rgb(var(--accent-*-rgb) / alpha) usages) — kept independent of useDark since
  // those surfaces always render white text on a solid/glass accent fill.
  setRgbVar(root, '--accent-chip-rgb',  hslToRgb(h, s, rung(0.77)));
  setRgbVar(root, '--accent-light-rgb', hslToRgb(h, s, rung(0.66)));
  setRgbVar(root, '--accent-hover-rgb', hslToRgb(h, s, rung(0.58)));
  setRgbVar(root, '--accent-rgb',       hslToRgb(h, s, rung(0.50)));
  setRgbVar(root, '--accent-dark-rgb',  hslToRgb(h, s, rung(0.35)));
  setRgbVar(root, '--accent-border-rgb',hslToRgb(h, s, rung(0.34)));
}
