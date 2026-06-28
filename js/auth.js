// ══ Auth ─ Google OAuth2 ════════════════════════════════════════════

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
        if (typeof loadDriveStamp === 'function') loadDriveStamp();
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
  const configured = typeof API_BASE_URL !== 'undefined' ? String(API_BASE_URL || '').trim() : '';
  const base = (configured || 'https://gruz-kappa.vercel.app').replace(/\/$/, '');
  return base + path;
}

async function authApiFetch(path, options = {}, refreshOnUnauthorized = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(authApiUrl(path), {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        Authorization: 'Bearer ' + (gAccessToken || '')
      }
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
      invalid_google_token: 'Google-сессия устарела'
    };
    throw new Error(messages[data.error] || 'сервер не подтвердил доступ');
  }
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

  banner.classList.remove('is-checking', 'is-allowed', 'is-denied', 'is-hidden');
  banner.disabled = true;

  if (state === 'hidden') {
    banner.classList.add('is-hidden');
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

  if (title) title.textContent = 'Аналитика недоступна';
  if (text) text.textContent = error || (profile?.email ? 'email не найден в whitelist: ' + profile.email : 'email не прошел whitelist');
}

async function checkAnalyticsWhitelistSilent() {
  const banner = document.getElementById('analyticsAccessBanner');
  if (!banner || !gAccessToken) return false;

  setAnalyticsAccessState('checking');
  try {
    const profile = await authVerifyAnalyticsAccess(gAccessToken);
    rememberAnalyticsSession(profile);
    setAnalyticsAccessState('allowed', profile);
    return true;
  } catch (e) {
    clearAnalyticsSession();
    setAnalyticsAccessState('denied', null, e.message || 'не удалось проверить доступ');
    console.error('Analytics access:', e);
    return false;
  }
}

function openProtectedAnalytics() {
  const banner = document.getElementById('analyticsAccessBanner');
  if (!banner || banner.disabled || !banner.classList.contains('is-allowed')) return;
  try {
    sessionStorage.setItem('gruzAnalyticsOpenIntent', '1');
  } catch (e) {}
  window.location.href = 'analytics.html';
}

function setAuthLockState(locked) {
  const lock = document.getElementById('authLockToggle');
  if (lock) lock.classList.toggle('is-authorized', !!locked);
}

function requestAuth(prompt, resolve, reject) {
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
    if (typeof loadDriveStamp === 'function') loadDriveStamp();
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
    await new Promise((res, rej) => requestAuth('', res, rej));
  } catch(e) {
    setGoogleOverlayState(false);
    btn.disabled = false;
    setAuthLockState(false);
    if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
    status.textContent = 'ОШИБКА';
    status.style.color = 'var(--dan)';
    console.error('Login:', e);
  }
}
