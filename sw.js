// ══ Service Worker ═══════════════════════════════════════════════════
const CACHE = 'gruz-v5';
const ASSETS = [
  '/gruz/', '/gruz/index.html', '/gruz/css/style.css',
  '/gruz/js/stamp.js',
  '/gruz/js/config.js', '/gruz/js/utils.js', '/gruz/js/auth.js',
  '/gruz/js/pdf.js', '/gruz/js/drive.js', '/gruz/js/email.js',
  '/gruz/js/sign.js', '/gruz/js/analytics.js',
  '/gruz/fonts/liberation.js',
  '/gruz/manifest.json', '/gruz/img/mark.png',
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
