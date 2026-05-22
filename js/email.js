// ══ Email ════════════════════════════════════════════════════════════

function toggleEmail() {
  const panel = document.getElementById('emailPanel');
  const open  = panel.style.display === 'none';
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

async function sendEmail() {
  const to = document.getElementById('emailTo').value.trim();
  if (!to || !to.includes('@')) {
    document.getElementById('emailMsg').textContent = 'Введите корректный email';
    document.getElementById('emailMsg').style.color = 'var(--dan)';
    return;
  }
  const btn = document.getElementById('sendEmailBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Отправляю...';
  document.getElementById('emailMsg').textContent = '';
  try {
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('consent', res, rej));
    const lines = [
      'To: ' + to,
      'Subject: =?UTF-8?B?' + btoa(unescape(encodeURIComponent(EMAIL_SUBJECT))) + '?=',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(EMAIL_BODY)))
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
    btn.textContent = '✉️ Отправить письмо';
  }
}