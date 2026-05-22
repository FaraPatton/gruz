// ── Sign Contract ──────────────────────────────────────────────
let signPdfBytes = null;
let signCurrentPage = 1;
let signTotalPages = 1;
let signPdfDoc = null;
let stampPos = null; // {x, y} in PDF points
let stampPlaced = false;

function toggleSign() {
  const panel = document.getElementById('signPanel');
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if(open) {
    document.getElementById('signMsg').textContent = '';
    document.getElementById('signCanvas').style.display = 'none';
    document.getElementById('downloadSignBtn').style.display = 'none';
    document.getElementById('contractPh').style.display = 'block';
    document.getElementById('contractName').style.display = 'none';
    stampPlaced = false;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('contractFile').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if(!file) return;
    document.getElementById('contractPh').style.display = 'none';
    const nameEl = document.getElementById('contractName');
    nameEl.textContent = '📄 ' + file.name;
    nameEl.style.display = 'block';
    document.getElementById('signMsg').textContent = 'Загружаю документ...';
    document.getElementById('signMsg').style.color = 'var(--mut)';

    const buf = await file.arrayBuffer();
    signPdfBytes = new Uint8Array(buf);
    signCurrentPage = 1;

    // Load with PDF.js for preview
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    signPdfDoc = await pdfjsLib.getDocument({data: signPdfBytes.buffer.slice(0)}).promise;
    signTotalPages = signPdfDoc.numPages;
    await renderSignPage(signCurrentPage);
    document.getElementById('signCanvas').style.display = 'block';
    document.getElementById('downloadSignBtn').style.display = 'block';
    document.getElementById('signMsg').textContent = 'Нажмите на документ чтобы поставить печать';
    document.getElementById('signMsg').style.color = 'var(--mut)';
    document.getElementById('signEmailBlock').style.display = 'block';
  });
});

async function renderSignPage(pageNum) {
  const page = await signPdfDoc.getPage(pageNum);
  const viewport = page.getViewport({scale: 1.5});
  const canvas = document.getElementById('pdfCanvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({canvasContext: ctx, viewport}).promise;
  document.getElementById('signPageInfo').textContent = pageNum + ' / ' + signTotalPages;

  // Reset stamp position on page change
  const overlay = document.getElementById('stampOverlay');
  overlay.style.display = 'none';
  stampPlaced = false;
}

async function signPagePrev() {
  if(signCurrentPage > 1) { signCurrentPage--; await renderSignPage(signCurrentPage); }
}
async function signPageNext() {
  if(signCurrentPage < signTotalPages) { signCurrentPage++; await renderSignPage(signCurrentPage); }
}

// Click on canvas → place stamp
document.addEventListener('DOMContentLoaded', function() {
  const viewport = document.getElementById('signViewport');
  if(!viewport) return;

  viewport.addEventListener('click', function(e) {
    if(!signPdfDoc) return;
    const canvas = document.getElementById('pdfCanvas');
    const rect = canvas.getBoundingClientRect();
    const viewRect = viewport.getBoundingClientRect();

    // Click position relative to canvas
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Scale factor (canvas CSS vs actual pixels)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = cx * scaleX;
    const py = cy * scaleY;

    // Store position (in canvas pixels at scale 1.5)
    stampPos = {px, py, page: signCurrentPage, canvasW: canvas.width, canvasH: canvas.height};

    // Show stamp overlay
    const overlay = document.getElementById('stampOverlay');
    overlay.src = STAMP_DEFAULT;
    overlay.style.display = 'block';
    // Position relative to viewport, centred on click
    const overlayW = 80, overlayH = 56;
    overlay.style.left = (e.clientX - viewRect.left + viewport.scrollLeft - overlayW/2) + 'px';
    overlay.style.top  = (e.clientY - viewRect.top  + viewport.scrollTop  - overlayH/2) + 'px';
    stampPlaced = true;
    document.getElementById('signMsg').textContent = 'Печать размещена. Нажмите ещё раз чтобы переместить, или скачайте.';
    document.getElementById('signMsg').style.color = 'var(--acc)';
    document.getElementById('signEmailBlock').style.display = 'block';
  });
});

async function downloadSigned() {
  if(!signPdfBytes) { alert('Сначала загрузите PDF'); return; }
  const btn = document.getElementById('downloadSignBtn');
  btn.disabled = true; btn.textContent = '⏳ Обрабатываю...';

  try {
    // Load pdf-lib dynamically if not loaded
    if(typeof PDFLib === 'undefined') {
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
        s.onload=res; s.onerror=rej;
        document.head.appendChild(s);
      });
    }

    const {PDFDocument} = PDFLib;
    const pdfDoc = await PDFDocument.load(signPdfBytes);
    const pages = pdfDoc.getPages();

    if(stampPlaced && stampPos) {
      const targetPage = pages[stampPos.page - 1];
      const {width: pdfW, height: pdfH} = targetPage.getSize();

      // Convert canvas coords to PDF coords
      const scaleX = pdfW / stampPos.canvasW;
      const scaleY = pdfH / stampPos.canvasH;
      const pdfX = stampPos.px * scaleX;
      const pdfY = pdfH - stampPos.py * scaleY; // PDF Y is bottom-up

      // Embed stamp image
      const stampBytes = await fetch(STAMP_DEFAULT).then(r=>r.arrayBuffer());
      const stampImg = await pdfDoc.embedPng(stampBytes);
      const stampW = 70, stampH = 50;
      targetPage.drawImage(stampImg, {
        x: pdfX - stampW/2,
        y: pdfY - stampH/2,
        width: stampW,
        height: stampH,
        opacity: 0.85
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], {type:'application/pdf'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dogovor_podpisany.pdf';
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('signMsg').textContent = '✅ Файл скачан!';
    document.getElementById('signMsg').style.color = 'var(--acc)';
  } catch(e) {
    document.getElementById('signMsg').textContent = 'Ошибка: ' + e.message;
    document.getElementById('signMsg').style.color = 'var(--dan)';
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '⬇️ Скачать с печатью';
  }
}


// ── Send signed contract by email ─────────────────────────────
let signedPdfCache = null; // store last generated signed PDF

async function sendSignedByEmail() {
  const to = document.getElementById('signEmailTo').value.trim();
  if(!to || !to.includes('@')) {
    document.getElementById('signMsg').textContent = 'Введите корректный email';
    document.getElementById('signMsg').style.color = 'var(--dan)';
    return;
  }
  const btn = document.getElementById('sendSignedBtn');
  btn.disabled = true; btn.textContent = '⏳ Подготовка...';
  document.getElementById('signMsg').textContent = '';

  try {
    // Auth if needed
    if(!gAccessToken) {
      await new Promise((res,rej)=>{
        gTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GCLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
          callback:(r)=>{ if(r.error){rej(new Error(r.error));return;} gAccessToken=r.access_token; res(); }
        });
        gTokenClient.requestAccessToken({prompt:'consent'});
      });
    }

    btn.textContent = '⏳ Генерирую PDF...';

    // Generate signed PDF (same logic as downloadSigned but return bytes)
    let pdfBytes;
    if(!signPdfBytes) throw new Error('Договор не загружен');

    if(typeof PDFLib === 'undefined') {
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }

    const {PDFDocument} = PDFLib;
    const pdfDoc = await PDFDocument.load(signPdfBytes);
    const pages = pdfDoc.getPages();

    if(stampPlaced && stampPos) {
      const targetPage = pages[stampPos.page - 1];
      const {width: pdfW, height: pdfH} = targetPage.getSize();
      const scaleX = pdfW / stampPos.canvasW;
      const scaleY = pdfH / stampPos.canvasH;
      const pdfX = stampPos.px * scaleX;
      const pdfY = pdfH - stampPos.py * scaleY;
      const stampBytes = await fetch(STAMP_DEFAULT).then(r=>r.arrayBuffer());
      const stampImg = await pdfDoc.embedPng(stampBytes);
      targetPage.drawImage(stampImg, {
        x: pdfX - 35, y: pdfY - 25,
        width: 70, height: 50, opacity: 0.85
      });
    }

    pdfBytes = await pdfDoc.save();
    const fileName = 'dogovor_podpisany.pdf';

    btn.textContent = '⏳ Отправляю письмо...';

    // Build MIME multipart email with PDF attachment
    const boundary = 'boundary_' + Date.now();
    const subject = 'Подписанный договор';
    const bodyText = 'Добрый день!\nВо вложении подписанный договор.\n\n--\nС уважением,\nКарпов Сергей | 89647851386 | АТИ: 2936939';
    const subjectEncoded = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject))) + '?=';
    const bodyB64 = btoa(unescape(encodeURIComponent(bodyText)));
    // Chunked base64 to avoid call stack overflow on large PDFs
    const pdfArr = new Uint8Array(pdfBytes);
    let pdfB64 = '';
    const chunkSize = 8192;
    for(let i = 0; i < pdfArr.length; i += chunkSize) {
      pdfB64 += String.fromCharCode(...pdfArr.subarray(i, i + chunkSize));
    }
    pdfB64 = btoa(pdfB64);
    const fileNameEncoded = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(fileName))) + '?=';

    const mime = [
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
      '',
      `--${boundary}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${fileNameEncoded}"`,
      '',
      pdfB64,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const encoded = btoa(unescape(encodeURIComponent(mime)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

    const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded })
    });

    if(!resp.ok) { const e=await resp.json(); throw new Error(e.error?.message||'Ошибка отправки'); }

    document.getElementById('signMsg').textContent = '✅ Договор отправлен на ' + to;
    document.getElementById('signMsg').style.color = 'var(--acc)';
    showToast('✅ Договор отправлен!');

  } catch(e) {
    document.getElementById('signMsg').textContent = 'Ошибка: ' + e.message;
    document.getElementById('signMsg').style.color = 'var(--dan)';
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '✉️ Отправить договор на почту';
  }
}


// ── Telegram Mini App Auth ────────────────────────────────────




// ── Google Sheets Analytics ───────────────────────────────────