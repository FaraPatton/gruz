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
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('consent', res, rej));
    if (btnLabel) btnLabel.textContent = 'Отправляю...';
    document.getElementById('emailMsg').textContent = 'Открываю доступ и отправляю письмо через защищенный сервер...';
    document.getElementById('emailMsg').style.color = 'var(--txt2)';
    const resp = await fetch(authApiUrl('/api/email/documents'), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const messages = {
        recipient_invalid: 'некорректный email получателя',
        email_not_configured: 'почтовые шаблоны не настроены на сервере',
        gmail_access_denied: 'Google не разрешил отправку Gmail',
        drive_access_denied: 'Google не разрешил доступ к папке документов',
        drive_permission_failed: 'не удалось открыть доступ к папке документов',
        gmail_send_failed: 'Gmail не отправил письмо'
      };
      throw new Error(messages[data.error] || 'сервер не отправил письмо: HTTP ' + resp.status);
    }
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
