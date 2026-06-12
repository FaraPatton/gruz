// ══ Sign Contract ════════════════════════════════════════════════════

let signPdfBytes   = null;
let signCurrentPage = 1;
let signTotalPages  = 1;
let signPdfDoc     = null;
let stampPos       = null;
let stampPlaced    = false;

function setSignMessage(text, color) {
  const msg = document.getElementById('signMsg');
  if (!msg) return;
  msg.textContent = text || '';
  msg.style.color = color || 'var(--mut)';
}

function toggleSign() {
  const panel = document.getElementById('signPanel');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (open) {
    if (typeof syncAuthDependentUi === 'function') syncAuthDependentUi();
    setSignMessage(gAccessToken ? '' : 'Войдите в Google, чтобы загрузить договор и поставить печать.', gAccessToken ? 'var(--mut)' : 'var(--dan)');
    document.getElementById('signCanvas').style.display = 'none';
    document.getElementById('downloadSignBtn').style.display = 'none';
    document.getElementById('contractPh').style.display = 'block';
    document.getElementById('contractName').style.display = 'none';
    stampPlaced = false;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const contractZone = document.getElementById('contractUploadZone');
  if (contractZone) {
    contractZone.addEventListener('click', function () {
      if (!gAccessToken) setSignMessage('Сначала войдите в Google, затем выберите PDF договор.', 'var(--dan)');
    });
  }

  document.getElementById('contractFile').addEventListener('change', async function (e) {
    if (!gAccessToken) {
      e.target.value = '';
      setSignMessage('Сначала войдите в Google, затем выберите PDF договор.', 'var(--dan)');
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('contractPh').style.display = 'none';
    const nameEl = document.getElementById('contractName');
    nameEl.textContent = '📄 ' + file.name;
    nameEl.style.display = 'block';
    setSignMessage('Загружаю документ...', 'var(--mut)');
    const buf = await file.arrayBuffer();
    signPdfBytes = new Uint8Array(buf);
    signCurrentPage = 1;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    signPdfDoc = await pdfjsLib.getDocument({ data: signPdfBytes.buffer.slice(0) }).promise;
    signTotalPages = signPdfDoc.numPages;
    await renderSignPage(signCurrentPage);
    document.getElementById('signCanvas').style.display = 'block';
    document.getElementById('downloadSignBtn').style.display = 'block';
    setSignMessage(stampUrl ? 'Нажмите на документ чтобы поставить печать' : 'Печать ещё не загружена. Проверьте блок печати выше.', stampUrl ? 'var(--mut)' : 'var(--dan)');
    document.getElementById('signEmailBlock').style.display = 'block';
  });

  const viewport = document.getElementById('signViewport');
  if (viewport) {
    viewport.addEventListener('click', function (e) {
      if (!signPdfDoc) return;
      if (!stampUrl) {
        if (typeof loadDriveStamp === 'function') loadDriveStamp();
        setSignMessage('Печать не загружена. Проверьте STAMP_FILE_ID и доступ к файлу в Drive или загрузите печать вручную.', 'var(--dan)');
        return;
      }
      const canvas  = document.getElementById('pdfCanvas');
      const rect    = canvas.getBoundingClientRect();
      const viewRect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      stampPos = { px: cx * scaleX, py: cy * scaleY, page: signCurrentPage, canvasW: canvas.width, canvasH: canvas.height };
      const overlay = document.getElementById('stampOverlay');
      overlay.src = stampUrl;
      overlay.style.display = 'block';
      const overlayW = 80, overlayH = 56;
      overlay.style.left = (e.clientX - viewRect.left + viewport.scrollLeft - overlayW / 2) + 'px';
      overlay.style.top  = (e.clientY - viewRect.top  + viewport.scrollTop  - overlayH / 2) + 'px';
      stampPlaced = true;
      setSignMessage('Печать размещена. Нажмите ещё раз чтобы переместить.', 'var(--acc)');
    });
  }
});

async function renderSignPage(pageNum) {
  const page     = await signPdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas   = document.getElementById('pdfCanvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  document.getElementById('signPageInfo').textContent = pageNum + ' / ' + signTotalPages;
  document.getElementById('stampOverlay').style.display = 'none';
  stampPlaced = false;
}

async function signPagePrev() { if (signCurrentPage > 1) { signCurrentPage--; await renderSignPage(signCurrentPage); } }
async function signPageNext() { if (signCurrentPage < signTotalPages) { signCurrentPage++; await renderSignPage(signCurrentPage); } }

async function loadPdfLib() {
  if (typeof PDFLib !== 'undefined') return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function buildSignedPdf() {
  if (stampPlaced && stampPos && !stampUrl) throw new Error('Печать не загружена');
  await loadPdfLib();
  const { PDFDocument } = PDFLib;
  const pdfDoc = await PDFDocument.load(signPdfBytes);
  if (stampPlaced && stampPos) {
    const page  = pdfDoc.getPages()[stampPos.page - 1];
    const { width: pdfW, height: pdfH } = page.getSize();
    const pdfX  = stampPos.px * (pdfW / stampPos.canvasW);
    const pdfY  = pdfH - stampPos.py * (pdfH / stampPos.canvasH);
    const imgBytes = await fetch(stampUrl).then(r => r.arrayBuffer());
    const img  = await pdfDoc.embedPng(imgBytes);
    page.drawImage(img, { x: pdfX - 35, y: pdfY - 25, width: 70, height: 50, opacity: 0.85 });
  }
  return pdfDoc.save();
}

async function downloadSigned() {
  if (!signPdfBytes) { alert('Сначала загрузите PDF'); return; }
  const btn = document.getElementById('downloadSignBtn');
  btn.disabled = true; btn.textContent = '⏳ Обрабатываю...';
  try {
    const bytes = await buildSignedPdf();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    Object.assign(document.createElement('a'), { href: url, download: 'dogovor_podpisany.pdf' }).click();
    URL.revokeObjectURL(url);
    setSignMessage('✅ Файл скачан!', 'var(--acc)');
  } catch(e) {
    setSignMessage('Ошибка: ' + e.message, 'var(--dan)');
  } finally {
    btn.disabled = false; btn.textContent = '⬇️ Скачать с печатью';
  }
}

async function sendSignedByEmail() {
  const to = document.getElementById('signEmailTo').value.trim();
  if (!to || !to.includes('@')) {
    setSignMessage('Введите корректный email', 'var(--dan)');
    return;
  }
  const btn = document.getElementById('sendSignedBtn');
  btn.disabled = true; btn.textContent = '⏳ Подготовка...';
  try {
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('consent', res, rej));
    btn.textContent = '⏳ Генерирую PDF...';
    if (!signPdfBytes) throw new Error('Договор не загружен');
    const pdfBytes = await buildSignedPdf();
    btn.textContent = '⏳ Отправляю...';
    const boundary = 'bnd_' + Date.now();
    const subjectText = typeof SIGN_EMAIL_SUBJECT !== 'undefined' && SIGN_EMAIL_SUBJECT ? SIGN_EMAIL_SUBJECT : 'Подписанный договор';
    const bodyText = typeof SIGN_EMAIL_BODY !== 'undefined' && SIGN_EMAIL_BODY ? SIGN_EMAIL_BODY : 'Добрый день!\nВо вложении подписанный договор.';
    const subj = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subjectText))) + '?=';
    const bodyB64 = btoa(unescape(encodeURIComponent(bodyText)));
    const arr = new Uint8Array(pdfBytes);
    let b64 = '';
    for (let i = 0; i < arr.length; i += 8192) b64 += String.fromCharCode(...arr.subarray(i, i + 8192));
    b64 = btoa(b64);
    const mime = ['To: '+to,'Subject: '+subj,'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',bodyB64,'','--'+boundary,'Content-Type: application/pdf','Content-Transfer-Encoding: base64','Content-Disposition: attachment; filename="dogovor_podpisany.pdf"','',b64,'','--'+boundary+'--'].join('\r\n');
    const encoded = btoa(unescape(encodeURIComponent(mime))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded })
    });
    if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Ошибка'); }
    setSignMessage('✅ Договор отправлен на ' + to, 'var(--acc)');
    showToast('✅ Договор отправлен!');
  } catch(e) {
    setSignMessage('Ошибка: ' + e.message, 'var(--dan)');
  } finally {
    btn.disabled = false; btn.textContent = '✉️ Отправить договор на почту';
  }
}
