/* Lipeno – service worker : tout est mis en cache pour fonctionner 100 % hors ligne.
   Pensez à changer VERSION à chaque mise à jour des fichiers. */
const VERSION = 'lipeno-v1.2.0';

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/sync.js',
  './fonts/nunito-latin-400-normal.woff2',
  './fonts/nunito-latin-700-normal.woff2',
  './fonts/nunito-latin-800-normal.woff2',
  './fonts/nunito-latin-900-normal.woff2',
  './fonts/fredoka-latin-500-normal.woff2',
  './fonts/fredoka-latin-700-normal.woff2',
  './fonts/mountains-of-christmas-latin-700-normal.woff2',
  './fonts/cinzel-decorative-latin-700-normal.woff2',
  './lib/heic2any.min.js',
  './lib/webp/webp_enc.js',
  './lib/webp/webp_enc.wasm',
  './lib/qr/qrcode.mjs',
  './lib/qr/jsQR.js'
];

// Les icônes sont fournies séparément : si l'une manque, l'installation ne doit pas échouer.
const OPTIONAL = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    await Promise.all(OPTIONAL.map((url) => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || fetch(req);
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      return new Response('', { status: 504 });
    }
  })());
});
