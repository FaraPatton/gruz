// Service Worker
const CACHE = 'gruz-20261123-classic';
const ASSETS = [
  '/gruz/', '/gruz/index.html', '/gruz/css/bb8.css?v=20261123-classic', '/gruz/css/style.css?v=20261123-classic', '/gruz/css/analytics.css?v=20261123-classic',
  '/gruz/js/stamp_secure.js?v=20261123-classic',
  '/gruz/js/config.js?v=20261123-classic', '/gruz/js/lazy_libs.js?v=20261123-classic', '/gruz/js/utils.js?v=20261123-classic', '/gruz/js/auth.js?v=20261123-classic',
  '/gruz/js/pdf.js?v=20261123-classic', '/gruz/js/drive.js?v=20261123-classic', '/gruz/js/email.js?v=20261123-classic',
  '/gruz/js/sign.js?v=20261123-classic', '/gruz/js/analytics_calc.js?v=20261123-classic', '/gruz/js/analytics_trips.js?v=20261123-classic', '/gruz/js/analytics_registry.js?v=20261123-classic', '/gruz/js/analytics_routes.js?v=20261123-classic', '/gruz/js/analytics.js?v=20261123-classic', '/gruz/js/pwa_update.js?v=20261123-classic',
  '/gruz/manifest.json', '/gruz/img/truck-neon-hero.jpg?v=1',
  '/gruz/img/icon-192.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const networkFirst = req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.destination === 'script' ||
    req.destination === 'style';
  if (networkFirst) {
    e.respondWith(fetch(req).then(resp => {
      if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(req, resp.clone()));
      return resp;
    }).catch(() => caches.match(req).then(cached => {
      if (cached) return cached;
      return req.mode === 'navigate' || req.destination === 'document'
        ? caches.match('/gruz/index.html')
        : Response.error();
    })));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
    if (resp && resp.status === 200) {
      caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
    }
    return resp;
  })));
});
