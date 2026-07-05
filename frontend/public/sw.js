/* ProfX Service Worker — custom, no build-tool dependency.
   Strategy:
   - Navigations: network-first, fall back to cached app shell (SPA offline launch).
   - Same-origin hashed assets (/static/, images, fonts): stale-while-revalidate.
   - API calls (GET): network-first with cache fallback. Non-GET: always network.
   - Everything else: network, fall back to cache if present.
   Bump SW_VERSION on any shell change to force a clean update. */

const SW_VERSION = 'v1.0.0';
const SHELL_CACHE = `profx-shell-${SW_VERSION}`;
const ASSET_CACHE = `profx-assets-${SW_VERSION}`;
const API_CACHE = `profx-api-${SW_VERSION}`;

// Stable shell resources (CRA's hashed JS/CSS are cached at runtime instead).
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/logo-icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// Treat these as API traffic (network-first). Matches same-origin '/api/...'
// and your Render backend host. Add hosts here if your API domain changes.
const API_HINTS = ['/api/', '/auth/', 'onrender.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll fails the whole install if one 404s; add resiliently instead.
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {/* skip missing */})
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(SW_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Allow the page to trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isApiRequest(url) {
  return API_HINTS.some((h) => url.href.includes(h) || url.pathname.includes(h));
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith('/static/') ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|eot|json)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // let POST/PUT/etc. hit network directly

  const url = new URL(request.url);

  // 1) SPA navigations → network-first, fall back to shell then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', net.clone());
          return net;
        } catch {
          return (
            (await caches.match('/index.html')) ||
            (await caches.match('/offline.html')) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // 2) API (GET) → network-first with cache fallback.
  if (isApiRequest(url)) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          if (net && net.ok && url.origin === self.location.origin) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, net.clone());
          }
          return net;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          throw new Error('offline-and-uncached');
        }
      })()
    );
    return;
  }

  // 3) Static assets → stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((net) => {
            if (net && net.ok) cache.put(request, net.clone());
            return net;
          })
          .catch(() => null);
        return cached || (await network) || Response.error();
      })()
    );
    return;
  }

  // 4) Default → try network, fall back to any cache.
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(request)) || Response.error())
  );
});
