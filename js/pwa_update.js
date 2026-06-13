// PWA update handling for GitHub Pages.

function notifyPwaUpdate(message) {
  if (typeof showToast === 'function') {
    showToast(message);
  } else {
    console.log(message);
  }
}

function registerPwaUpdater() {
  if (!('serviceWorker' in navigator)) return;
  if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => registrations.forEach(registration => registration.unregister()))
      .catch(e => console.log('Local SW cleanup skipped:', e));
    return;
  }

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js')
    .then(registration => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyPwaUpdate('Обновляю приложение...');
          }
        });
      });

      if (typeof registration.update === 'function') {
        registration.update().catch(e => console.log('SW update error:', e));
      }
    })
    .catch(e => console.log('SW error:', e));
}

if (document.readyState === 'loading') {
  window.addEventListener('load', registerPwaUpdater);
} else {
  registerPwaUpdater();
}
