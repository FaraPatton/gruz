// ══ Google Drive ═════════════════════════════════════════════════════

function dMsg(text, type) {
  const el = document.getElementById('driveMsg');
  if (!el) return;
  el.textContent = text;
  el.className = 'drive-msg' + (type ? ' ' + type : '');
}

function initPicker() {
  if (gPickerReady) return Promise.resolve();
  return new Promise(res => { gapi.load('picker', () => { gPickerReady = true; res(); }); });
}

async function openDrivePicker() {
  await initPicker();
  if (!gAccessToken) {
    dMsg('Авторизация Google...', 'info');
    await new Promise((res, rej) => requestAuth('consent', res, rej));
    dMsg('✓ Авторизован', 'ok');
  }
  showPicker();
}

function showPicker() {
  dMsg('Открываю Drive...', 'info');
  const view = new google.picker.DocsView()
    .setMimeTypes('application/pdf')
    .setMode(google.picker.DocsViewMode.LIST)
    .setParent(ARCHIVE_ROOT)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);
  new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(gAccessToken)
    .setDeveloperKey(GAPI_KEY)
    .setTitle('Счета и акты — выберите файл')
    .setCallback(pickerCb)
    .build()
    .setVisible(true);
}

function pickerCb(data) {
  if (data.action === google.picker.Action.PICKED) {
    const f = data.docs[0];
    dMsg('Читаю: ' + f.name + '...', 'info');
    readAndParse(f.id, f.name);
  }
}

async function readAndParse(fileId, fileName) {
  try {
    dMsg('Загружаю файл...', 'info');
    const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
      headers: { Authorization: 'Bearer ' + gAccessToken }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = await resp.arrayBuffer();
    dMsg('Извлекаю текст...', 'info');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    let fullText = '';
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map(i => i.str).join(' ') + ' ';
    }
    const parsed = parsePDF(fullText);
    const filled = Object.values(parsed).filter(v => v).length;
    if (filled >= 3) { gParsed = parsed; showParsed(parsed, fileName); }
    else dMsg('Данные не распознаны. Попробуйте другой файл.', 'err');
  } catch(e) {
    dMsg('Ошибка: ' + e.message, 'err');
    console.error(e);
  }
}

function parsePDF(t) {
  t = t.replace(/\s+/g, ' ');
  const d = {};
  const m1 = t.match(/№\s*(\d+)\s+от\s+(\d{2}\.\d{2}\.\d{4})/);
  if (m1) { d.num = m1[1]; d.docDate = m1[2]; d.actDate = m1[2]; }
  const m2 = t.match(/Заказчик:\s*((?:ООО|ИП|АО|ЗАО|ПАО|НКО).+?),\s*ИНН/);
  if (m2) { let nm = m2[1].trim().replace(/^"+|"+$/g,'').trim(); if (nm.startsWith('ООО ') && !nm.includes('"')) nm = 'ООО "' + nm.slice(4).trim() + '"'; d.customerName = nm; }
  const minn = t.match(/Заказчик:.+?ИНН\s+(\d{10,12})/);  if (minn) d.customerInn = minn[1];
  const mkpp = t.match(/Заказчик:.+?КПП\s+(\d{9})/);       if (mkpp) d.customerKpp = mkpp[1];
  const mrt  = t.match(/маршруту:\s*(.+?),\s*(?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford)/i);
  if (mrt) {
    const legs = mrt[1].trim().split(/\s+-\s+/).map(l => l.trim().replace(/,\s*$/,''));
    if (legs.length >= 2) { d.from_a = legs[0]; d.to_a = legs[1]; d.from_b = ''; d.to_b = legs[2] || ''; }
    else { d.from_a = legs[0] || ''; d.from_b = ''; d.to_a = ''; d.to_b = ''; }
  }
  const mcar = t.match(/((?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford),\s*[А-Я\d]+(?:\(\d+\))?)/);
  if (mcar) d.car = mcar[1];
  const mld = t.match(/дата загрузки\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);  if (mld) d.loadDate = mld[1];
  const mud = t.match(/дата выгрузки\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);   if (mud) d.unloadDate = mud[1];
  const mamt = t.match(/на сумму\s+(\d+)\s+руб/i);                         if (mamt) d.amount = mamt[1];
  return d;
}

function showParsed(d, fileName) {
  const rows = [
    ['Файл', fileName], ['Номер', d.num||'—'], ['Дата', d.docDate||'—'],
    ['Заказчик', d.customerName||'—'], ['ИНН', d.customerInn||'—'], ['КПП', d.customerKpp||'—'],
    ['Откуда', d.from_a||'—'], ['Куда', d.to_a||'—'], ['Авто', d.car||'—'],
    ['Загрузка', d.loadDate||'—'], ['Выгрузка', d.unloadDate||'—'],
    ['Сумма', d.amount ? d.amount + ' руб' : '—']
  ];
  document.getElementById('parseRows').innerHTML = rows
    .map(([k,v]) => '<div class="prow"><span class="pk">'+k+'</span><span class="pv" title="'+v+'">'+v+'</span></div>')
    .join('');
  const box = document.getElementById('parseBox');
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  dMsg('Проверьте данные и нажмите «Заполнить форму»', 'ok');
}

function closeParsed() {
  document.getElementById('parseBox').style.display = 'none';
  gParsed = null;
  const el = document.getElementById('driveMsg');
  if (el) el.textContent = '';
}

function applyParsed() {
  if (!gParsed) return;
  const d = gParsed;
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== '') el.value = v; };
  set('doc_num',       d.num);
  set('doc_date',      toInput(d.docDate));
  set('act_date',      toInput(d.actDate));
  set('customer_name', d.customerName);
  set('customer_inn',  d.customerInn);
  set('customer_kpp',  d.customerKpp);
  set('customer_addr', d.customerAddr);
  set('from_a',        d.from_a);
  set('from_b',        d.from_b);
  set('to_a',          d.to_a);
  set('to_b',          d.to_b);
  set('car',           d.car);
  set('load_date',     toInput(d.loadDate));
  set('unload_date',   toInput(d.unloadDate));
  if (d.amount) { set('amount', d.amount); document.getElementById('amount_words').value = amountToWords(d.amount); }
  closeParsed();
  showToast('✅ Данные из Drive заполнены!');
}

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getOrCreateYearFolder(year) {
  const q = encodeURIComponent(
    "'" + ARCHIVE_ROOT + "' in parents and mimeType='application/vnd.google-apps.folder' and name='" + driveQueryValue(year) + "' and trashed=false"
  );
  const listResp = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)', {
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  if (!listResp.ok) throw new Error('Не удалось найти папку года: HTTP ' + listResp.status);

  const listData = await listResp.json();
  const folderId = listData.files?.[0]?.id;
  if (folderId) return folderId;

  const cr = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + gAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: year, mimeType: 'application/vnd.google-apps.folder', parents: [ARCHIVE_ROOT] })
  });
  if (!cr.ok) throw new Error('Не удалось создать папку года: HTTP ' + cr.status);
  return (await cr.json()).id;
}

async function findDriveFileByName(parentId, fileName) {
  const q = encodeURIComponent(
    "'" + parentId + "' in parents and name='" + driveQueryValue(fileName) + "' and trashed=false"
  );
  const resp = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&pageSize=1', {
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  if (!resp.ok) throw new Error('Не удалось проверить файл в Drive: HTTP ' + resp.status);
  const data = await resp.json();
  return data.files?.[0] || null;
}

async function uploadPdfToDrive(blob, fileName, folderId) {
  const existing = await findDriveFileByName(folderId, fileName);
  const metadata = existing
    ? { name: fileName, mimeType: 'application/pdf' }
    : { name: fileName, mimeType: 'application/pdf', parents: [folderId] };
  const boundary = 'gruz_pdf_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  const body = new Blob([
    '--' + boundary + '\r\n',
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata) + '\r\n',
    '--' + boundary + '\r\n',
    'Content-Type: application/pdf\r\n\r\n',
    blob,
    '\r\n--' + boundary + '--'
  ], { type: 'multipart/related; boundary=' + boundary });
  const url = existing
    ? 'https://www.googleapis.com/upload/drive/v3/files/' + existing.id + '?uploadType=multipart'
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const resp = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: 'Bearer ' + gAccessToken,
      'Content-Type': 'multipart/related; boundary=' + boundary
    },
    body
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Не удалось загрузить PDF: HTTP ' + resp.status + (text ? ' ' + text.slice(0, 120) : ''));
  }
  return resp.json();
}

async function archiveToDrive() {
  const btn = document.getElementById('archiveBtn');
  btn.disabled = true; btn.textContent = '⏳ Загружаю...';
  try {
    if (!gAccessToken) await new Promise((res, rej) => requestAuth('', res, rej));
    const d = getData();
    const year = (toInput(d.docDate) || today()).slice(0, 4);

    dMsg('Сохраняю рейс в trips.json...', 'info');
    await saveFormTripToRegistry(d);

    dMsg('Готовлю папку ' + year + '...', 'info');
    const folderId = await getOrCreateYearFolder(year);

    dMsg('Загружаю счёт PDF...', 'info');
    const invoiceFile = await genInvoice({ uploadFolderId: folderId, silent: true });

    dMsg('Загружаю акт PDF...', 'info');
    const actFile = await genAct({ uploadFolderId: folderId, silent: true });

    dMsg('Обновляю связи в trips.json...', 'info');
    await saveFormTripToRegistry(d, {
      invoiceFileId: invoiceFile?.id || '',
      actFileId: actFile?.id || ''
    });

    dMsg('✅ Рейс, счёт и акт загружены в Drive!', 'ok');
    showToast('✅ Архив и trips.json обновлены!');
  } catch(e) {
    dMsg('Ошибка: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '📤 Загрузить документы в архив';
  }
}

window.addEventListener('load', () => {
  if (typeof gapi !== 'undefined') gapi.load('picker', () => { gPickerReady = true; });
});
