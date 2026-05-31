// Standalone analytics page bootstrap

let analyticsProfile = null;

function analyticsAllowedEmails() {
  return (typeof ANALYTICS_ALLOWED_EMAILS !== 'undefined' ? ANALYTICS_ALLOWED_EMAILS : [])
    .map(email => String(email || '').trim().toLowerCase())
    .filter(Boolean);
}

function setAnalyticsGate(state, message) {
  const gate = document.getElementById('analyticsGate');
  const app = document.getElementById('analyticsApp');
  const msg = document.getElementById('analyticsGateMsg');
  if (gate) gate.style.display = state === 'open' ? 'none' : 'grid';
  if (app) app.style.display = state === 'open' ? 'block' : 'none';
  if (msg) msg.textContent = message || '';
}

async function fetchGoogleProfile() {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  if (!resp.ok) throw new Error('Не удалось получить email Google: HTTP ' + resp.status);
  return resp.json();
}

function isAnalyticsAllowed(profile) {
  const allowed = analyticsAllowedEmails();
  if (!allowed.length) return false;
  return allowed.includes(String(profile?.email || '').toLowerCase());
}

async function analyticsLogin() {
  const overlay = document.getElementById('googleOverlay');
  const btn = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');
  if (overlay) overlay.style.display = 'flex';
  if (btn) btn.disabled = true;
  if (status) status.textContent = '';

  try {
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('consent', res, rej));
    analyticsProfile = await fetchGoogleProfile();

    const allowed = analyticsAllowedEmails();
    if (!allowed.length) {
      setAnalyticsGate('closed', 'Доступ не настроен: добавьте разрешенные email в ANALYTICS_ALLOWED_EMAILS в js/config.js.');
      if (status) status.textContent = analyticsProfile.email || '';
      return;
    }

    if (!isAnalyticsAllowed(analyticsProfile)) {
      setAnalyticsGate('closed', 'Доступ закрыт для ' + (analyticsProfile.email || 'этого аккаунта') + '.');
      if (status) status.textContent = 'ДОСТУП ЗАКРЫТ';
      return;
    }

    if (status) status.textContent = analyticsProfile.email || 'ДОСТУП РАЗРЕШЕН';
    setAnalyticsGate('open');
    const panel = document.getElementById('analyticsPanel');
    if (panel) panel.style.display = 'block';
    await loadDriveAnalytics(true);
  } catch (e) {
    setAnalyticsGate('closed', 'Ошибка авторизации: ' + e.message);
  } finally {
    if (overlay) overlay.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('loginBtn');
  if (btn) btn.addEventListener('click', analyticsLogin);
});
