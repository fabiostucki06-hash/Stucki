/** "19.10.2026 16:42" (Zurich time) of the build this tab is running. */
export const BUILD_DATE = new Date(__BUILD_TIME__).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
/** Short commit SHA on Vercel builds, '' locally. */
export const BUILD_SHA = __BUILD_SHA__;
export const BUILD_LABEL = `Build: ${BUILD_DATE}${BUILD_SHA ? ` · ${BUILD_SHA}` : ''}`;
