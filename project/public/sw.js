/*
  UniEco Ghana — Service Worker
  Production caching strategy:
  - App shell (static assets, fonts, JS, CSS): Cache First, fall back to network
  - Navigation (pages): Network First, fall back to cache, then offline page
  - Public API GETs (cached business/product info): Stale While Revalidate
  - Sensitive/private requests (auth, payments, messages, admin): Network Only (never cached)
  - Non-GET requests: Network Only (never cached)
*/

const SHELL_CACHE = 'unieco-shell-v2';
const CONTENT_CACHE = 'unieco-content-v2';
const OFFLINE_URL = '/offline';

const SHELL_ASSETS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icon.svg',
];

// Paths that must NEVER be cached — sensitive or user-specific data
const NEVER_CACHE_PATTERNS = [
  '/auth',
  '/signin',
  '/signup',
  '/checkout',
  '/orders',
  '/cart',
  '/admin',
  '/vendor-dashboard',
  '/dashboard',
  '/profile',
  '/payment',
  '/forgot-password',
  '/verify-email',
  '/onboarding',
];

// API paths that return public, cacheable content
const PUBLIC_API_PATTERNS = [
  '/rest/v1/businesses',
  '/rest/v1/products',
  '/rest/v1/services',
  '/rest/v1/events',
  '/rest/v1/universities',
  '/rest/v1/categories',
  '/rest/v1/business_hours',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== CONTENT_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function shouldNeverCache(url) {
  return NEVER_CACHE_PATTERNS.some((p) => url.pathname.startsWith(p));
}

function isPublicApi(url) {
  return PUBLIC_API_PATTERNS.some((p) => url.pathname.includes(p));
}

function isStaticAsset(request, url) {
  return (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    request.destination === 'manifest' ||
    url.pathname.startsWith('/_next/static/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Sensitive/private paths — always network only, never cached
  if (shouldNeverCache(url)) return;

  // Navigation requests — network first, fall back to cache, then offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CONTENT_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((r) => r || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Public API GETs — stale while revalidate
  if (isPublicApi(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CONTENT_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Static assets — cache first, fall back to network
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in background
          fetch(request)
            .then((response) => {
              if (response.ok) {
                const copy = response.clone();
                caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Default — try network, fall back to cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
