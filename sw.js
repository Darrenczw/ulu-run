// Ulu Run service worker.
// Caches the app shell and route data so the app opens without signal (PRD 9).
// OneMap tiles are never cached or stored: their Terms of Use forbid it.

const VERSION = 'ulu-a2-2';
const SHELL = [
  './', 'index.html', 'styles/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'src/app.js', 'src/data.js', 'src/geo.js', 'src/map.js', 'src/views.js', 'src/coast.js', 'src/gpx.js', 'src/store.js',
  'vendor/maplibre/maplibre-gl.js', 'vendor/maplibre/maplibre-gl.css', 'fonts/bricolage-grotesque-latin.woff2',
  'data/regions.json', 'data/places.json', 'data/checked.json', 'data/prototype/routes.json', 'data/prototype/pcn.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // OneMap and anything else: straight to the network.
  // Network first, so updates land straight away; the cache is the offline fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
