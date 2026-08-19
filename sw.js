const CACHE_NAME = 'qmt-static-v1';
const STATIC_ASSETS = [
  './index.html',
  './manifest.webmanifest',
  './js/firebase-auth.js',
  './js/ai.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];
const APP_ROOT = new URL('./', self.registration.scope).pathname;
const INDEX_PATH = new URL('./index.html', self.registration.scope).pathname;
const STATIC_PATHS = new Set(STATIC_ASSETS.map(asset =>
  new URL(asset, self.registration.scope).pathname));

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAsset(url) {
  return STATIC_PATHS.has(url.pathname) ||
    url.pathname.startsWith(`${APP_ROOT}js/`) ||
    url.pathname.startsWith(`${APP_ROOT}icons/`);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (!isSameOrigin(url) || event.request.method !== 'GET') return;
  if (url.pathname === INDEX_PATH || url.pathname === APP_ROOT ||
      url.pathname.startsWith(`${APP_ROOT}js/`)) {
    event.respondWith(networkFirst(event.request));
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
  }
});
