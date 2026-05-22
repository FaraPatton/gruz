// ── Email ──────────────────────────────────────────────────────
const EMAIL_SUBJECT = 'Документы на проверку';
const EMAIL_BODY = `Добрый день!
Комплект документов доступен по моей ссылке ниже:

https://drive.google.com/drive/folders/1pJMPxTEhMu3JRHe0_K4F8ECHye1_LSj8?usp=sharing

ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ КАРПОВ СЕРГЕЙ ВИКТОРОВИЧ
Расчётный счёт: 40802810438000085714
ИНН: 771313296859
КПП: -
ОГРН: 318774600201147
Банк: ПАО СБЕРБАНК
БИК: 044525225
Кор. счёт: 30101810400000000225

--
С уважением,
Карпов Сергей | 89647851386 | Код участника АТИ: 2936939`;

function toggleEmail() {
  const panel = document.getElementById('emailPanel');
  const btn = document.getElementById('emailToggleBtn');
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if(open) {
    document.getElementById('emailTo').value = '';
    document.getElementById('emailMsg').textContent = '';
    setTimeout(()=>document.getElementById('emailTo').focus(), 50);
  }
}
function closeEmail() {
  document.getElementById('emailPanel').style.display = 'none';
}

async function sendEmail() {
  const to = document.getElementById('emailTo').value.trim();
  if(!to || !to.includes('@')) {
    document.getElementById('emailMsg').textContent = 'Введите корректный email';
    document.getElementById('emailMsg').style.color = 'var(--dan)';
    return;
  }
  const btn = document.getElementById('sendEmailBtn');
  btn.disabled = true; btn.textContent = '⏳ Отправляю...';
  document.getElementById('emailMsg').textContent = '';

  try {
    if(!gAccessToken) {
      document.getElementById('emailMsg').textContent = 'Авторизация...';
      await new Promise((res,rej)=>{
        gTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GCLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
          callback: (r)=>{ if(r.error){rej(new Error(r.error));return;} gAccessToken=r.access_token; res(); }
        });
        gTokenClient.requestAccessToken({prompt:'consent'});
      });
    }

    // Build RFC 2822 email
    const emailLines = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(EMAIL_SUBJECT)))}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(EMAIL_BODY)))
    ].join('\r\n');

    const encoded = btoa(unescape(encodeURIComponent(emailLines)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + gAccessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encoded })
    });

    if(!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || 'Ошибка отправки');
    }

    document.getElementById('emailMsg').textContent = '✅ Письмо отправлено на ' + to;
    document.getElementById('emailMsg').style.color = 'var(--success)';
    showToast('✅ Письмо отправлено!');
    setTimeout(closeEmail, 2000);

  } catch(e) {
    document.getElementById('emailMsg').textContent = 'Ошибка: ' + e.message;
    document.getElementById('emailMsg').style.color = 'var(--dan)';
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '✉️ Отправить письмо';
  }
}