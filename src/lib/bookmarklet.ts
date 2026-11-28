/** Desktop/mobile bookmarklet: runs on the open Autodoc/ATP product page,
    reads title, price, currency and article number from the live DOM
    (structured data first, see bookmarklet-src.js) and opens GarageOS's import
    flow with them in a NEW tab, so the shop page stays open. A confirmation
    box on the shop page says what was sent; when the popup is blocked it holds
    a real link to tap instead.
    Which Offerte is active ("Für Import auswählen") is decided in the opened
    tab, since the shop page can't read GarageOS's storage.
    `import_v` is bumped whenever the snippet changes, so GarageOS can tell an
    outdated bookmark apart and ask for it to be recreated. */
import src from './bookmarklet-src.js?raw';

export const BOOKMARKLET_VERSION = '2';

export function buildImportBookmarklet(origin: string): string {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace("'__ORIGIN__'", JSON.stringify(origin))
    .replace('__V__', BOOKMARKLET_VERSION);
  // Browsers percent-decode javascript: URLs; the source must not need it.
  if (code.includes('%') && import.meta.env.DEV) console.warn('[bookmarklet] source contains "%" and will break once percent-decoded');
  return `javascript:${code}`;
}
