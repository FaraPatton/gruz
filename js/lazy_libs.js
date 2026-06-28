// Lazy third-party library loading for actions that need heavy PDF tooling.

(function ensureRuntimeDefaults() {
  const defaults = {
    GCLIENT_ID: '',
    GAPI_KEY: '',
    YANDEX_MAPS_API_KEY: '',
    API_BASE_URL: 'https://gruz-kappa.vercel.app',
    ARCHIVE_ROOT: '',
    ROUTE_BASE_ADDRESS: '',
    EXECUTOR_MARKERS: [],
    EXECUTOR_PROFILE: {},
    STAMP_FILE_ID: '',
    gTokenClient: null,
    gAccessToken: null,
    gAuthCallback: null,
    gPickerReady: false,
    gParsed: null,
    driveCache: null,
    analyticsYear: 0,
    stampUrl: null
  };

  Object.keys(defaults).forEach(key => {
    if (!(key in window)) window[key] = defaults[key];
  });
})();

const lazyScriptPromises = {};

function loadExternalScriptOnce(src, isReady) {
  if (typeof isReady === 'function' && isReady()) return Promise.resolve();
  if (lazyScriptPromises[src]) return lazyScriptPromises[src];

  lazyScriptPromises[src] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      delete lazyScriptPromises[src];
      reject(new Error('Не удалось загрузить библиотеку: ' + src));
    };
    document.head.appendChild(script);
  });

  return lazyScriptPromises[src];
}

function ensureJsPdfLib() {
  return loadExternalScriptOnce(
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    () => !!window.jspdf?.jsPDF
  );
}

function ensurePdfFontLib() {
  return loadExternalScriptOnce(
    'fonts/liberation.js',
    () => typeof window.setupFonts === 'function'
  );
}

function ensureGoogleIdentityLib() {
  return loadExternalScriptOnce(
    'https://accounts.google.com/gsi/client',
    () => !!window.google?.accounts?.oauth2
  );
}

function ensureGoogleApiLib() {
  return loadExternalScriptOnce(
    'https://apis.google.com/js/api.js',
    () => typeof window.gapi !== 'undefined'
  );
}

function ensurePdfJsLib() {
  return loadExternalScriptOnce(
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    () => typeof window.pdfjsLib !== 'undefined'
  ).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  });
}
