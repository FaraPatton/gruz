// Service Worker — ИП Карпов Docs PWA
// Версия кэша — меняй при каждом обновлении index.html
const CACHE = 'karpov-docs-v7';

const PRECACHE = [
  '/gruz/',
  '/gruz/index.html',
  '/gruz/icon-192.png',
  '/gruz/icon-512.png',
];

const BYPASS = [
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'accounts.google.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});
