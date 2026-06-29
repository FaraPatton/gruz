// ══ Auth ─ Google OAuth2 ════════════════════════════════════════════

let analyticsWhitelistCheck = null;
let privateRuntimeConfigPromise = null;
const SERVER_SESSION_TOKEN = '__gruz_server_session__';

function usesServerAuthSession() {
  return /\.vercel\.app$/i.test(location.hostname) || location.hostname === 'localhost';
}

async function loadPrivateRuntimeConfig() {
  if (privateRuntimeConfigPromise) return privateRuntimeConfigPromise;
  privateRuntimeConfigPromise = (async () => {
    const response = await authApiFetch('/api/config/private', {}, true);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.config) {
      const messages = {
        private_config_not_configured: 'приватная конфигурация не добавлена в Vercel',
        private_config_invalid: 'приватная конфигурация Vercel заполнена неверно'
      };
      throw new Error(messages[data.error] || 'не удалось загрузить приватную конфигурацию');
    }
    ROUTE_BASE_ADDRESS = String(data.config.routeBaseAddress || '');
    EXECUTOR_MARKERS = Array.isArray(data.config.executorMarkers) ? data.config.executorMarkers : [];
    EXECUTOR_PROFILE = data.config.executorProfile && typeof data.config.executorProfile === 'object'
      ? data.config.executorProfile
      : {};
    if (typeof loadDriveStamp === 'function') loadDriveStamp();
    return data.config;
  })().catch(error => {
    privateRuntimeConfigPromise = null;
    throw error;
  });
  return privateRuntimeConfigPromise;
}

function getTokenClient() {
  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCLIENT_ID,
      scope: 'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
      callback: (r) => {
        if (r.error) {
          console.error('Auth error:', r.error);
          if (gAuthCallback) gAuthCallback(null, r.error);
          return;
        }
        gAccessToken = r.access_token;
        const btnTxt  = document.getElementById('loginBtnText');
        const btnIcon = document.getElementById('loginBtnIcon');
        const btn     = document.getElementById('loginBtn');
        const status  = document.getElementById('loginStatus');
        setAuthLockState(true);
        if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
        if (btnTxt)  { btnTxt.textContent = 'Google'; }
        if (btnIcon) { btnIcon.textContent = '✓'; btnIcon.style.color = 'var(--acc)'; btnIcon.style.display = 'inline'; }
        if (btn)     { btn.style.borderColor = 'var(--acc)'; btn.style.color = 'var(--acc)'; btn.style.boxShadow = '0 0 10px rgba(232,200,74,.2)'; btn.disabled = false; }
        if (status)  { status.textContent = 'АВТОРИЗОВАН'; status.style.color = 'var(--acc)'; }
        const overlay = document.getElementById('googleOverlay');
        if (overlay) overlay.style.display = 'none';
        checkAnalyticsWhitelistSilent();
        if (gAuthCallback) gAuthCallback(r.access_token, null);
        gAuthCallback = null;
      }
    });
  }
  return gTokenClient;
}

async function ensureTokenClient() {
  await ensureGoogleIdentityLib();
  return getTokenClient();
}

function authApiUrl(path) {
  if (usesServerAuthSession()) return path;
  const configured = typeof API_BASE_URL !== 'undefined' ? String(API_BASE_URL || '').trim() : '';
  const base = (configured || 'https://gruz-kappa.vercel.app').replace(/\/$/, '');
  return base + path;
}

async function authApiFetch(path, options = {}, refreshOnUnauthorized = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const headers = { ...(options.headers || {}) };
  if (gAccessToken && gAccessToken !== SERVER_SESSION_TOKEN) {
    headers.Authorization = 'Bearer ' + gAccessToken;
  }
  let response;
  try {
    response = await fetch(authApiUrl(path), {
      ...options,
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
      headers
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Сервер не ответил за 20 секунд');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 401 || !refreshOnUnauthorized) return response;

  gAccessToken = null;
  clearAnalyticsSession();
  await new Promise((resolve, reject) => requestAuth('consent', resolve, reject));
  return authApiFetch(path, options, false);
}

async function authVerifyAnalyticsAccess(token) {
  if (token) gAccessToken = token;
  const resp = await authApiFetch('/api/auth/me');
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 401) {
      gAccessToken = null;
      clearAnalyticsSession();
    }
    const messages = {
      access_denied: 'этот Google-аккаунт не имеет доступа',
      access_policy_not_configured: 'доступ на сервере не настроен',
      invalid_google_token: 'Google-сессия устарела',
      authentication_required: 'требуется вход через Google',
      session_expired: 'серверная сессия устарела',
      google_client_id_not_configured: 'Google Client ID не настроен на сервере',
      google_client_secret_not_configured: 'Google Client Secret не настроен на сервере',
      session_secret_not_configured: 'SESSION_SECRET не добавлен в Vercel'
    };
    throw new Error(messages[data.error] || 'сервер не подтвердил доступ');
  }
  if (data.mode === 'session') gAccessToken = SERVER_SESSION_TOKEN;
  return data.user;
}

function setGoogleOverlayState(visible, title, sub) {
  const overlay = document.getElementById('googleOverlay');
  const text = overlay?.querySelector('.google-overlay-text');
  const small = overlay?.querySelector('.google-overlay-sub');
  if (text && title) text.textContent = title;
  if (small && sub) small.textContent = sub;
  if (overlay) overlay.style.display = visible ? 'flex' : 'none';
}

function rememberAnalyticsSession(profile) {
  if (usesServerAuthSession()) return;
  if (!gAccessToken || !profile?.email) return;
  try {
    sessionStorage.setItem('gruzAnalyticsAccessToken', gAccessToken);
    sessionStorage.setItem('gruzAnalyticsEmail', String(profile.email).trim().toLowerCase());
    sessionStorage.setItem('gruzAnalyticsCheckedAt', String(Date.now()));
  } catch (e) {
    console.warn('Analytics session save skipped:', e);
  }
}

function clearAnalyticsSession() {
  try {
    sessionStorage.removeItem('gruzAnalyticsAccessToken');
    sessionStorage.removeItem('gruzAnalyticsEmail');
    sessionStorage.removeItem('gruzAnalyticsCheckedAt');
  } catch (e) {}
}

function setAnalyticsAccessState(state, profile, error) {
  const banner = document.getElementById('analyticsAccessBanner');
  const title = document.getElementById('analyticsAccessTitle');
  const text = document.getElementById('analyticsAccessText');
  if (!banner) return;

  banner.classList.remove('is-idle', 'is-checking', 'is-allowed', 'is-denied', 'is-hidden');
  banner.disabled = true;

  if (state === 'hidden') {
    banner.classList.add('is-hidden');
    return;
  }

  if (state === 'idle') {
    banner.classList.add('is-idle');
    banner.disabled = false;
    if (title) title.textContent = 'Войдите в Google для аналитики';
    if (text) text.textContent = 'после входа проверим доступ по whitelist';
    return;
  }

  banner.classList.add('is-' + state);
  if (state === 'checking') {
    if (title) title.textContent = 'Проверяем ваш email на whitelist';
    if (text) text.textContent = 'доступ к закрытой аналитике';
    return;
  }

  if (state === 'allowed') {
    banner.disabled = false;
    if (title) title.textContent = 'Открыть аналитику рейсов';
    if (text) text.textContent = profile?.email ? 'доступ разрешен: ' + profile.email : 'доступ разрешен';
    return;
  }

  banner.disabled = false;
  if (title) title.textContent = 'Аналитика недоступна';
  if (text) text.textContent = error || (profile?.email ? 'email не найден в whitelist: ' + profile.email : 'email не прошел whitelist');
}

async function checkAnalyticsWhitelistSilent() {
  const banner = document.getElementById('analyticsAccessBanner');
  if (!banner || !gAccessToken) return false;
  if (analyticsWhitelistCheck) return analyticsWhitelistCheck;

  setAnalyticsAccessState('checking');
  analyticsWhitelistCheck = (async () => {
    try {
      const profile = await authVerifyAnalyticsAccess(gAccessToken);
      await loadPrivateRuntimeConfig();
      rememberAnalyticsSession(profile);
      setAnalyticsAccessState('allowed', profile);
      return true;
    } catch (e) {
      clearAnalyticsSession();
      setAnalyticsAccessState('denied', null, e.message || 'не удалось проверить доступ');
      console.error('Analytics access:', e);
      return false;
    } finally {
      analyticsWhitelistCheck = null;
    }
  })();
  return analyticsWhitelistCheck;
}

function openProtectedAnalytics() {
  const banner = document.getElementById('analyticsAccessBanner');
  if (!banner || banner.disabled || !banner.classList.contains('is-allowed')) return;
  try {
    sessionStorage.setItem('gruzAnalyticsOpenIntent', '1');
  } catch (e) {}
  window.location.href = 'analytics.html';
}

function handleAnalyticsAccessClick() {
  const banner = document.getElementById('analyticsAccessBanner');
  if (banner?.classList.contains('is-allowed')) {
    openProtectedAnalytics();
    return;
  }
  googleLogin();
}

function setAuthLockState(locked) {
  const lock = document.getElementById('authLockToggle');
  if (lock) lock.classList.toggle('is-authorized', !!locked);
}

async function restoreServerAuthSession() {
  if (!usesServerAuthSession()) return;
  const params = new URLSearchParams(location.search);
  const authError = params.get('auth_error');
  if (authError) {
    setAnalyticsAccessState('denied', null, 'Google не завершил вход: ' + authError);
    return;
  }

  try {
    const profile = await authVerifyAnalyticsAccess();
    await loadPrivateRuntimeConfig();
    setAuthLockState(true);
    if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
    const btnTxt = document.getElementById('loginBtnText');
    const btnIcon = document.getElementById('loginBtnIcon');
    const btn = document.getElementById('loginBtn');
    const status = document.getElementById('loginStatus');
    if (btnTxt) btnTxt.textContent = 'Google';
    if (btnIcon) { btnIcon.textContent = '✓'; btnIcon.style.color = 'var(--acc)'; btnIcon.style.display = 'inline'; }
    if (btn) { btn.style.borderColor = 'var(--acc)'; btn.style.color = 'var(--acc)'; btn.style.boxShadow = '0 0 10px rgba(232,200,74,.2)'; btn.disabled = false; }
    if (status) { status.textContent = 'АВТОРИЗОВАН'; status.style.color = 'var(--acc)'; }
    setAnalyticsAccessState('allowed', profile);
  } catch (error) {
    gAccessToken = null;
    setAuthLockState(false);
    if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
    setAnalyticsAccessState('idle');
  }
}

function requestAuth(prompt, resolve, reject) {
  if (usesServerAuthSession()) {
    const returnTo = location.pathname + location.search;
    location.href = authApiUrl('/api/auth/start?returnTo=' + encodeURIComponent(returnTo || '/'));
    return;
  }

  let settled = false;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    gAuthCallback = null;
    reject(new Error('Google не завершил авторизацию за 60 секунд'));
  }, 60000);

  ensureTokenClient()
    .then(client => {
      gAuthCallback = (token, err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (err) reject(new Error(err));
        else resolve(token);
      };
      client.requestAccessToken({ prompt: prompt || '' });
    })
    .catch(error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
}

async function googleLogin() {
  const btn     = document.getElementById('loginBtn');
  const btnTxt  = document.getElementById('loginBtnText');
  const status  = document.getElementById('loginStatus');
  const overlay = document.getElementById('googleOverlay');

  if (gAccessToken) {
    setAuthLockState(true);
    if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
    const accessConfirmed = await checkAnalyticsWhitelistSilent();
    if (accessConfirmed || gAccessToken) {
      status.textContent = accessConfirmed ? 'УЖЕ АВТОРИЗОВАН' : 'ДОСТУП НЕ ПОДТВЕРЖДЕН';
      status.style.color = accessConfirmed ? 'var(--acc)' : 'var(--dan)';
      return;
    }
  }
  setGoogleOverlayState(true, 'ПЕРЕХОД В GOOGLE', 'АВТОРИЗАЦИЯ...');
  btn.disabled = true;
  setAuthLockState(false);
  status.textContent = '';
  try {
    await new Promise((res, rej) => requestAuth('select_account', res, rej));
  } catch(e) {
    setGoogleOverlayState(false);
    btn.disabled = false;
    setAuthLockState(false);
    if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
    status.textContent = 'ОШИБКА';
    status.style.color = 'var(--dan)';
    setAnalyticsAccessState('denied', null, 'Google не завершил вход. Нажмите здесь, чтобы повторить');
    console.error('Login:', e);
  }
}

document.addEventListener('DOMContentLoaded', restoreServerAuthSession);
