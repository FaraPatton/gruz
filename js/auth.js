// ══ Auth ─ Google OAuth2 ════════════════════════════════════════════

function getTokenClient() {
  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
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
        if (btnTxt)  { btnTxt.textContent = 'Google'; }
        if (btnIcon) { btnIcon.textContent = '✓'; btnIcon.style.color = 'var(--acc)'; btnIcon.style.display = 'inline'; }
        if (btn)     { btn.style.borderColor = 'var(--acc)'; btn.style.color = 'var(--acc)'; btn.style.boxShadow = '0 0 10px rgba(232,200,74,.2)'; btn.disabled = false; }
        if (status)  { status.textContent = 'АВТОРИЗОВАН'; status.style.color = 'var(--acc)'; }
        const overlay = document.getElementById('googleOverlay');
        if (overlay) overlay.style.display = 'none';
        if (gAuthCallback) gAuthCallback(r.access_token, null);
        gAuthCallback = null;
      }
    });
  }
  return gTokenClient;
}

function requestAuth(prompt, resolve, reject) {
  gAuthCallback = (token, err) => {
    if (err) reject(new Error(err));
    else resolve(token);
  };
  getTokenClient().requestAccessToken({ prompt: prompt || '' });
}

async function googleLogin() {
  const btn     = document.getElementById('loginBtn');
  const btnTxt  = document.getElementById('loginBtnText');
  const status  = document.getElementById('loginStatus');
  const overlay = document.getElementById('googleOverlay');

  if (gAccessToken) {
    status.textContent = 'УЖЕ АВТОРИЗОВАН';
    status.style.color = 'var(--acc)';
    return;
  }
  overlay.style.display = 'flex';
  btn.disabled = true;
  status.textContent = '';
  try {
    await new Promise((res, rej) => requestAuth('', res, rej));
  } catch(e) {
    overlay.style.display = 'none';
    btn.disabled = false;
    status.textContent = 'ОШИБКА';
    status.style.color = 'var(--dan)';
    console.error('Login:', e);
  }
}