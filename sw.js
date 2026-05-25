// Service Worker
const CACHE = 'gruz-v40';
const ASSETS = [
  '/gruz/', '/gruz/index.html', '/gruz/css/style.css?v=20',
  '/gruz/js/stamp.js',
  '/gruz/js/config.js?v=3', '/gruz/js/utils.js?v=4', '/gruz/js/auth.js?v=2',
  '/gruz/js/pdf.js?v=4', '/gruz/js/drive.js?v=5', '/gruz/js/email.js?v=12',
  '/gruz/js/sign.js', '/gruz/js/analytics.js?v=24',
  '/gruz/fonts/liberation.js',
  '/gruz/manifest.json', '/gruz/img/mark.png', '/gruz/img/route-card-map.png',
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
  e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
    if (resp && resp.status === 200) {
      caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
    }
    return resp;
  })));
});
