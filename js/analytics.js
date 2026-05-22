// Analytics: fast Drive registry + one-time PDF archive scan

const TRIPS_REGISTRY_NAME = 'trips.json';
const TRIPS_REGISTRY_VERSION = 1;

let analyticsRegistryFileId = null;

function toggleAnalytics() {
  const panel = document.getElementById('analyticsPanel');
  const open = getComputedStyle(panel).display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (open) loadDriveAnalytics();
}

async function loadDriveAnalytics(refresh) {
  const panel = document.getElementById('analyticsPanel');
  if (!gAccessToken) {
    panel.innerHTML = analyticsShell(
      '<p style="text-align:center;color:var(--dan);font-size:12px;margin:0">Сначала нажмите «Войти в Google».</p>'
    );
    return;
  }

  if (driveCache && !refresh) {
    renderDriveAnalytics(driveCache, analyticsYear, panel);
    return;
  }

  panel.innerHTML = analyticsShell(
    '<p style="color:var(--mut);font-size:12px;margin:0 0 8px;text-align:center">Читаю реестр аналитики...</p>' +
    '<p id="scanProgress" style="color:var(--acc);font-size:11px;font-family:monospace;letter-spacing:1px;margin:0;text-align:center">ПОДКЛЮЧАЮСЬ...</p>'
  );

  try {
    const registry = await loadTripsRegistry();
    driveCache = registry.trips || [];
    if (!driveCache.length) {
      renderRegistryEmpty(panel);
      return;
    }
    renderDriveAnalytics(driveCache, analyticsYear, panel);
  } catch(e) {
    panel.innerHTML = analyticsShell(
      '<p style="text-align:center;color:var(--dan);font-size:12px;margin:0">Ошибка: ' + aEsc(e.message) + '</p>'
    );
  }
}

async function rebuildTripsRegistry() {
  const panel = document.getElementById('analyticsPanel');
  if (!gAccessToken) {
    await new Promise((res, rej) => requestAuth('', res, rej));
  }

  panel.innerHTML = analyticsShell(
    '<p style="color:var(--mut);font-size:12px;margin:0 0 8px;text-align:center">Собираю реестр из счетов и актов...</p>' +
    '<p id="scanProgress" style="color:var(--acc);font-size:11px;font-family:monospace;letter-spacing:1px;margin:0;text-align:center">СТАРТ...</p>'
  );

  try {
    const trips = await scanDriveArchiveToTrips();
    const registry = {
      version: TRIPS_REGISTRY_VERSION,
      updatedAt: new Date().toISOString(),
      source: 'drive-pdf-scan',
      trips
    };

    await saveTripsRegistry(registry);
    driveCache = trips;
    analyticsYear = 0;
    renderDriveAnalytics(driveCache, analyticsYear, panel);
    showToast('✓ Реестр аналитики обновлен');
  } catch(e) {
    panel.innerHTML = analyticsShell(
      '<p style="text-align:center;color:var(--dan);font-size:12px;margin:0">Ошибка: ' + aEsc(e.message) + '</p>'
    );
  }
}

function setProgress(txt) {
  const el = document.getElementById('scanProgress');
  if (el) el.textContent = txt;
}

function analyticsShell(inner) {
  return '<div class="dc" style="padding:16px;margin-bottom:0">' + inner + '</div>';
}

function aEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  const n = Number(value) || 0;
