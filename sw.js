// Service Worker
const CACHE = 'gruz-v59';
const ASSETS = [
  '/gruz/', '/gruz/index.html', '/gruz/css/bb8.css?v=1', '/gruz/css/style.css?v=26',
  '/gruz/js/stamp.js?v=3',
  '/gruz/js/config.js?v=4', '/gruz/js/utils.js?v=9', '/gruz/js/auth.js?v=6',
  '/gruz/js/pdf.js?v=4', '/gruz/js/drive.js?v=5', '/gruz/js/email.js?v=12',
  '/gruz/js/sign.js?v=2', '/gruz/js/analytics.js?v=33',
  '/gruz/fonts/liberation.js',
  '/gruz/manifest.json', '/gruz/img/route-card-map.png', '/gruz/img/truck-neon-hero.png',
  '/gruz/img/icon-192.png', '/gruz/img/icon-512.png'
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
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req).then(resp => {
      if (resp && resp.status === 200) caches.open(CACHE).then(c => c.put(req, resp.clone()));
      return resp;
    }).catch(() => caches.match(req).then(cached => cached || caches.match('/gruz/index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
    if (resp && resp.status === 200) {
      caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
    }
    return resp;
  })));
});
