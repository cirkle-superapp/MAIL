/**
 * sw.js — CIRKLE minimal service worker.
 * -----------------------------------------------------------------------------
 * Strategy:
 *   1. On `install`: pre-cache the home-shell assets (/, /manifest.json,
 *      /cirkle-logo.svg, /cirkle-favicon.svg) so the app loads offline.
 *   2. On `activate`: delete any old cache versions.
 *   3. On `fetch`:
 *      - Only handle GET (skip POST/PUT/etc — let the browser handle them).
 *      - Network-first for HTML documents + API calls (/api/*) so the user
 *        always gets fresh data; fall back to cache when offline.
 *      - Cache-first for static assets (same-origin images, scripts, styles,
 *        fonts, .svg, .json, .js, .css); fall back to network on cache miss.
 *
 *  Notes:
 *   - This SW intentionally does NOT cache search API responses long-term —
 *     search results change frequently and we want users to always see fresh
 *     results. Network-first means the SW will hit the network when online
 *     and only serve stale cached data when truly offline.
 *   - Cross-origin requests (fonts.googleapis, images.pexels, etc.) are
 *     passed straight through to the network without caching — we don't
 *     control their cache headers and shouldn't impersonate them.
 */

const CACHE_VERSION = 'cirkle-v1';
const HOME_SHELL = [
  '/',
  '/manifest.json',
  '/cirkle-logo.svg',
  '/cirkle-favicon.svg',
];

// --- Install: pre-cache the home shell ------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // Use addAll but tolerate individual failures (some assets may 404 in
      // dev) — we still want the SW to install + activate.
      return Promise.allSettled(
        HOME_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })),
        ),
      );
    }),
  );
  self.skipWaiting();
});

// --- Activate: clear old caches ------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// --- Fetch: routing -------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only intercept GET — let POST/PUT/etc go straight to the network.
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return; // malformed URL — let the browser handle it
  }

  // Don't touch cross-origin requests (fonts, CDNs, etc.) — let the browser
  // handle them with its default caching.
  if (url.origin !== self.location.origin) return;

  // API requests + HTML documents → network-first (always fresh when online).
  const isApi = url.pathname.startsWith('/api/');
  const isHtml =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isApi || isHtml) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else (static assets: .js, .css, .svg, .woff2, .json, etc.)
  // → cache-first, fall back to network.
  event.respondWith(cacheFirst(req));
});

// --- Strategies -----------------------------------------------------------

async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(req);
    // Only cache successful, basic/cors responses (avoid caching errors /
    // opaque responses we can't introspect).
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Offline / network error — try the cache.
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // Nothing we can do — propagate.
    throw err;
  }
}
