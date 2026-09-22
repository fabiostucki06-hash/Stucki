/** Best-effort: drop any leftover Cache Storage entries + Service Worker registrations
 *  so a previously installed SW (or cached response) can't keep serving stale assets. */
export async function unregisterStaleServiceWorkers(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // best-effort only
  }
}

export async function hardReload(): Promise<void> {
  try {
    await unregisterStaleServiceWorkers();
  } finally {
    window.location.reload();
  }
}
