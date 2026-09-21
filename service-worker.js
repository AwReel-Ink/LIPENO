const CACHE_NAME = 'lettre-pere-noel-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  './css/print.css',
  './js/app.js',
  './js/db.js',
  './js/router.js',
  './js/modules/profils.js',
  './js/modules/jouets.js',
  './js/modules/imageConverter.js',
  './js/modules/heicFallback.js',
  './js/modules/cropTool.js',
  './js/modules/pdfExport.js',
  './js/modules/shareManager.js',
  './js/modules/santaAnimation.js',
  './js/modules/wisdomSlider.js',
  './js/modules/progressIndicator.js',
  './js/modules/confirmDialog.js',
  './js/vendor/jspdf.min.js',
  './js/vendor/heic2any.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.ico',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network-first for navigation, cache-first for assets
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200) return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});