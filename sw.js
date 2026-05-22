// Service Worker — ИП Карпов Docs PWA
// Версия кэша — меняй при каждом обновлении index.html
const CACHE = 'karpov-docs-v5';

// Файлы для кэширования при установке
const PRECACHE = [
  '/gruz/',
  '/gruz/index.html',
  '/gruz/icon-192.png',
  '/gruz/icon-512.png',
];

// Домены которые НЕ кэшируем (Google APIs)
const BYPASS = [
  'googleapis.com',
  'google.com',
  'gstatic.com',
  'accounts.google.com',
];

// Установка — кэшируем основные файлы
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Активация — удаляем старые кэши
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — стратегия: сначала сеть, при ошибке — кэш
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Google API запросы — всегда через сеть, не кэшировать
  if(BYPASS.some(domain => url.includes(domain))) {
    return; // браузер обработает сам
  }

  // CDN ресурсы (jsPDF, Bootstrap и т.д.) — кэш then network
  if(url.includes('cdnjs.') || url.includes('jsdelivr.') || url.includes('cloudflare.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if(cached) return cached;
        return fetch(e.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        });
      })
    );
    return;
  }

  // Основной контент — network first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if(resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
