/* ==========================================
 * Quest Manager — Service Worker
 * Offline support + installable PWA
 * ========================================== */

const CACHE_VERSION = 'qm-v1';
const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './questlife-extension/icons/icon16.png',
  './questlife-extension/icons/icon48.png',
  './questlife-extension/icons/icon128.png',
];

// ---------------------------------------------------------------
// Install: pre-cache the app shell
// ---------------------------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---------------------------------------------------------------
// Activate: wipe old caches so updates take effect
// ---------------------------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------
// Fetch: network-first for HTML, stale-while-revalidate for assets
// ---------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET; let everything else go straight to network
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Don't try to cache cross-origin requests (fonts CDN, analytics, etc.)
  // Let the browser handle them normally.
  if (url.origin !== self.location.origin) return;

  // Navigation / HTML: network-first with cache fallback
  const isHtml = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');
  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          // Only cache successful, basic (same-origin) responses
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);  // offline — fall back to whatever is in cache
      return cached || network;
    })
  );
});

// ---------------------------------------------------------------
// Message handler: allow the page to force an update
// ---------------------------------------------------------------
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
