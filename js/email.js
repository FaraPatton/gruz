// ══ Email ════════════════════════════════════════════════════════════

function toggleEmail() {
  const panel = document.getElementById('emailPanel');
  const open  = getComputedStyle(panel).display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (open) {
    document.getElementById('emailTo').value = '';
    document.getElementById('emailMsg').textContent = '';
    setTimeout(() => document.getElementById('emailTo').focus(), 50);
  }
}

function closeEmail() {
  document.getElementById('emailPanel').style.display = 'none';
}

function getEmailDriveFolderId() {
  const explicit = typeof EMAIL_DRIVE_FOLDER_ID !== 'undefined' ? String(EMAIL_DRIVE_FOLDER_ID || '').trim() : '';
  if (explicit) return explicit;
  const body = typeof EMAIL_BODY !== 'undefined' ? String(EMAIL_BODY || '') : '';
  const match = body.match(/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : '';
}

function requireEmailConfig() {
  const subject = typeof EMAIL_SUBJECT !== 'undefined' ? String(EMAIL_SUBJECT || '').trim() : '';
  const body = typeof EMAIL_BODY !== 'undefined' ? String(EMAIL_BODY || '').trim() : '';
  const folderId = getEmailDriveFolderId();
  const missing = [];
  if (!subject) missing.push('EMAIL_SUBJECT');
  if (!body) missing.push('EMAIL_BODY');
  if (!folderId) missing.push('EMAIL_DRIVE_FOLDER_ID');
  if (missing.length) throw new Error('Не заполнен runtime config для отправки: ' + missing.join(', '));
  return { subject, body, folderId };
}

async function grantEmailFolderAccess(email) {
  const folderId = getEmailDriveFolderId();
  if (!folderId) throw new Error('Не указан ID папки документов для доступа');

  const resp = await fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(folderId) +
      '/permissions?sendNotificationEmail=false&supportsAllDrives=true',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'user',
        role: 'reader',
        emailAddress: email
      })
    }
  );

  if (resp.ok) return true;

  const data = await resp.json().catch(() => ({}));
  const message = data.error?.message || '';
  if (resp.status === 409 || /already exists|already has access/i.test(message)) return false;
  throw new Error(message || 'Не удалось открыть доступ к папке документов');
}

async function sendEmail() {
  const to = document.getElementById('emailTo').value.trim();
  if (!to || !to.includes('@')) {
    document.getElementById('emailMsg').textContent = 'Введите корректный email';
    document.getElementById('emailMsg').style.color = 'var(--dan)';
    return;
  }
  const btn = document.getElementById('sendEmailBtn');
  const btnLabel = btn?.querySelector('.send-flight-label');
  btn.disabled = true;
  if (btnLabel) btnLabel.textContent = 'Отправляю...';
  document.getElementById('emailMsg').textContent = '';
  try {
    const emailConfig = requireEmailConfig();
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('consent', res, rej));
    if (btnLabel) btnLabel.textContent = 'Открываю доступ...';
    document.getElementById('emailMsg').textContent = 'Открываю доступ к папке для ' + to + '...';
    document.getElementById('emailMsg').style.color = 'var(--txt2)';
    await grantEmailFolderAccess(to);
    if (btnLabel) btnLabel.textContent = 'Отправляю...';
    const lines = [
      'To: ' + to,
      'Subject: =?UTF-8?B?' + btoa(unescape(encodeURIComponent(emailConfig.subject))) + '?=',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(emailConfig.body)))
    ].join('\r\n');
    const encoded = btoa(unescape(encodeURIComponent(lines))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded })
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Ошибка отправки'); }
    document.getElementById('emailMsg').textContent = '✅ Письмо отправлено на ' + to;
    document.getElementById('emailMsg').style.color = 'var(--success)';
    showToast('✅ Письмо отправлено!');
    setTimeout(closeEmail, 2000);
  } catch(e) {
    document.getElementById('emailMsg').textContent = 'Ошибка: ' + e.message;
    document.getElementById('emailMsg').style.color = 'var(--dan)';
  } finally {
    btn.disabled = false;
    if (btnLabel) btnLabel.textContent = 'Отправить';
  }
}
