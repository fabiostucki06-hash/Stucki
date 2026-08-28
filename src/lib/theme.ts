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

/** Sets the root CSS custom properties that drive text, dividers, cards and the blue accent. */
export function applyBgTheme({ r, g, b }: SampledColor): void {
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

  // Accent: nudge the brand blue's hue slightly toward the wallpaper's dominant
  // hue (capped small so it always reads as "blue"), lightness tuned for whichever
  // card surface got picked above.
  const { h, s } = rgbToHueSat(r, g, b);
  const baseHue = 211; // hue of #007AFF
  const mixedHue = lerpHue(baseHue, h, Math.min(s, 0.6) * 0.22);
  const accentLightness = useDark ? 58 : 42;
  root.setProperty('--blue', `hsl(${mixedHue.toFixed(1)} 88% ${accentLightness}%)`);
}
