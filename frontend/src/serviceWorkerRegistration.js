// Registers the custom service worker at /sw.js.
// Safe on all browsers; no-ops where SW is unsupported.

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return; // avoid caching during dev

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // When a new SW is found, activate it immediately on next controllerchange.
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // New version ready — tell it to take over.
              reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {/* registration failed; app still works online */});

    // Reload once when the new SW takes control, so users get fresh assets.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
