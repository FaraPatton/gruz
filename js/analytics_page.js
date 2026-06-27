// Standalone analytics page bootstrap

let analyticsProfile = null;

function setAnalyticsGate(state, message) {
  const gate = document.getElementById('analyticsGate');
  const app = document.getElementById('analyticsApp');
  const msg = document.getElementById('analyticsGateMsg');
  if (gate) gate.style.display = state === 'open' ? 'none' : 'grid';
  if (app) app.style.display = state === 'open' ? 'block' : 'none';
  if (msg) msg.textContent = message || '';
}

function setGoogleOverlayState(visible, title, sub) {
  const overlay = document.getElementById('googleOverlay');
  const text = overlay?.querySelector('.google-overlay-text');
  const small = overlay?.querySelector('.google-overlay-sub');
  if (text && title) text.textContent = title;
  if (small && sub) small.textContent = sub;
  if (overlay) overlay.style.display = visible ? 'flex' : 'none';
}

function getRememberedAnalyticsSession() {
  try {
    const token = sessionStorage.getItem('gruzAnalyticsAccessToken');
    const email = sessionStorage.getItem('gruzAnalyticsEmail');
    const checkedAt = Number(sessionStorage.getItem('gruzAnalyticsCheckedAt') || 0);
    const isFresh = checkedAt && Date.now() - checkedAt < 55 * 60 * 1000;
    if (!token || !email || !isFresh) return null;
    return { token, email };
  } catch (e) {
    return null;
  }
}

function clearRememberedAnalyticsSession() {
  try {
    sessionStorage.removeItem('gruzAnalyticsAccessToken');
    sessionStorage.removeItem('gruzAnalyticsEmail');
    sessionStorage.removeItem('gruzAnalyticsCheckedAt');
    sessionStorage.removeItem('gruzAnalyticsOpenIntent');
  } catch (e) {}
}

async function openAnalyticsFromRememberedSession() {
  const remembered = getRememberedAnalyticsSession();
  if (!remembered) return false;

  gAccessToken = remembered.token;
  setGoogleOverlayState(true, 'ПРОВЕРЯЕМ ДОСТУП', 'ЗАЩИЩЕННЫЙ API...');
  try {
    analyticsProfile = await authVerifyAnalyticsAccess(remembered.token);
    setAnalyticsGate('open');
    const panel = document.getElementById('analyticsPanel');
    if (panel) panel.style.display = 'block';
    setGoogleOverlayState(true, 'ЗАГРУЖАЮ РЕЙСЫ', 'TRIPS.JSON...');
    await loadDriveAnalytics(true);
    return true;
  } catch (e) {
    clearRememberedAnalyticsSession();
    setAnalyticsGate('closed', 'Сессия устарела. Нажмите «Открыть аналитику», чтобы обновить доступ.');
    return false;
  } finally {
    setGoogleOverlayState(false);
  }
}

async function analyticsLogin() {
  const btn = document.getElementById('loginBtn');
  const status = document.getElementById('loginStatus');
  setGoogleOverlayState(true, 'ПЕРЕХОД В GOOGLE', 'АВТОРИЗАЦИЯ...');
  if (btn) btn.disabled = true;
  if (status) status.textContent = '';

  try {
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('consent', res, rej));
    setGoogleOverlayState(true, 'ПРОВЕРЯЕМ ДОСТУП', 'ЗАЩИЩЕННЫЙ API...');
    analyticsProfile = await authVerifyAnalyticsAccess(gAccessToken);
    rememberAnalyticsSession(analyticsProfile);

    if (status) status.textContent = analyticsProfile.email || 'ДОСТУП РАЗРЕШЕН';
    setAnalyticsGate('open');
    const panel = document.getElementById('analyticsPanel');
    if (panel) panel.style.display = 'block';
    setGoogleOverlayState(true, 'ЗАГРУЖАЮ РЕЙСЫ', 'TRIPS.JSON...');
    await loadDriveAnalytics(true);
  } catch (e) {
    setAnalyticsGate('closed', 'Ошибка авторизации: ' + e.message);
  } finally {
    setGoogleOverlayState(false);
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
  openAnalyticsFromRememberedSession();
});
