// ══ Google Drive ═════════════════════════════════════════════════════

function dMsg(text, type) {
  const el = document.getElementById('driveMsg');
  if (!el) return;
  el.textContent = text;
  el.className = 'drive-msg' + (type ? ' ' + type : '');
}

let archiveBrowserFiles = [];
let archiveBrowserYear = null;

async function openArchiveBrowser() {
  if (!gAccessToken) {
    dMsg('Авторизация Google...', 'info');
    await new Promise((res, rej) => requestAuth('consent', res, rej));
    dMsg('✓ Авторизован', 'ok');
  }
  const box = document.getElementById('archiveBrowser');
  const list = document.getElementById('archiveBrowserList');
  box.style.display = 'block';
  list.innerHTML = '<div class="archive-browser-empty">Загружаю список архива...</div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const resp = await authApiFetch('/api/archive/files', {}, true);
    if (!resp.ok) throw new Error('сервер не отдал список: HTTP ' + resp.status);
    const data = await resp.json();
    archiveBrowserFiles = Array.isArray(data.files) ? data.files : [];
    archiveBrowserYear = null;
    document.getElementById('archiveBrowserSearch').value = '';
    filterArchiveBrowser();
  } catch (error) {
    list.innerHTML = '<div class="archive-browser-empty is-error">' + archiveHtml(error.message) + '</div>';
  }
}

function closeArchiveBrowser() {
  document.getElementById('archiveBrowser').style.display = 'none';
}

function archiveHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function filterArchiveBrowser() {
  const query = String(document.getElementById('archiveBrowserSearch').value || '').trim().toLowerCase();
  if (!query && archiveBrowserYear === null) {
    renderArchiveYears();
    return;
  }
  const files = archiveBrowserFiles.filter(file => {
    const haystack = [file.name, file.fallbackYear].join(' ').toLowerCase();
    return query ? haystack.includes(query) : Number(file.fallbackYear) === archiveBrowserYear;
  }).sort((a, b) => archiveModifiedTime(b) - archiveModifiedTime(a) ||
    String(b.name || '').localeCompare(String(a.name || ''), 'ru', { numeric: true }));
  const visible = files.slice(0, 250);
  document.getElementById('archiveBrowserBack').style.display = query || archiveBrowserYear === null ? 'none' : 'grid';
  document.getElementById('archiveBrowserTitle').textContent = query
    ? 'Поиск по архиву'
    : 'Документы за ' + archiveBrowserYear;
  document.getElementById('archiveBrowserCount').textContent = query
    ? 'найдено: ' + files.length
    : 'документов: ' + files.length;
  document.getElementById('archiveBrowserList').innerHTML = visible.length
    ? visible.map(file => {
      const index = archiveBrowserFiles.indexOf(file);
      const type = String(file.name || '').toLowerCase().startsWith('akt') ? 'Акт' : 'Счёт';
      return '<button type="button" class="archive-file" data-archive-index="' + index + '">' +
        '<span class="archive-file-icon">' + (type === 'Акт' ? '✓' : '₽') + '</span>' +
        '<span><strong>' + archiveHtml(file.name) + '</strong><small>' + type + ' · ' + archiveHtml(file.fallbackYear) + ' · ' + archiveHtml(archiveDateLabel(file.modifiedTime)) + '</small></span>' +
        '<span class="archive-file-arrow">›</span></button>';
    }).join('')
    : '<div class="archive-browser-empty">Документы не найдены</div>';
}

function archiveModifiedTime(file) {
  const value = Date.parse(String(file?.modifiedTime || ''));
  return Number.isFinite(value) ? value : 0;
}

function archiveDateLabel(value) {
  const time = typeof value === 'number' ? value : Date.parse(String(value || ''));
  if (!Number.isFinite(time)) return 'дата не указана';
  return new Date(time).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function renderArchiveYears() {
  const grouped = new Map();
  archiveBrowserFiles.forEach(file => {
    const year = Number(file.fallbackYear);
    if (!Number.isInteger(year)) return;
    const group = grouped.get(year) || { year, count: 0, latest: 0 };
    group.count += 1;
    group.latest = Math.max(group.latest, archiveModifiedTime(file));
    grouped.set(year, group);
  });
  const years = [...grouped.values()].sort((a, b) => b.year - a.year);
  document.getElementById('archiveBrowserBack').style.display = 'none';
  document.getElementById('archiveBrowserTitle').textContent = 'Архив документов';
  document.getElementById('archiveBrowserCount').textContent = 'папок: ' + years.length;
  document.getElementById('archiveBrowserList').innerHTML = years.length
    ? years.map(group => '<button type="button" class="archive-file archive-year" data-archive-year="' + group.year + '">' +
      '<span class="archive-file-icon">▰</span>' +
      '<span><strong>' + group.year + '</strong><small>' + group.count + ' документов · обновлено ' + archiveHtml(archiveDateLabel(group.latest)) + '</small></span>' +
      '<span class="archive-file-arrow">›</span></button>').join('')
    : '<div class="archive-browser-empty">В архиве пока нет документов</div>';
}

function showArchiveYears() {
  archiveBrowserYear = null;
  document.getElementById('archiveBrowserSearch').value = '';
  renderArchiveYears();
}

document.addEventListener('click', event => {
  const yearButton = event.target.closest('[data-archive-year]');
  if (yearButton) {
    archiveBrowserYear = Number(yearButton.dataset.archiveYear);
    document.getElementById('archiveBrowserSearch').value = '';
    filterArchiveBrowser();
    return;
  }
  const button = event.target.closest('[data-archive-index]');
  if (!button) return;
  const file = archiveBrowserFiles[Number(button.dataset.archiveIndex)];
  if (!file) return;
  closeArchiveBrowser();
  dMsg('Читаю: ' + file.name + '...', 'info');
  readAndParse(file.id, file.name);
});

async function readAndParse(fileId, fileName) {
  try {
    dMsg('Загружаю файл...', 'info');
    const resp = await authApiFetch('/api/archive/file?id=' + encodeURIComponent(fileId), {}, true);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = await resp.arrayBuffer();
    dMsg('Извлекаю текст...', 'info');
    await ensurePdfJsLib();
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
  const mkpp = t.match(/Заказчик:.+?КПП\s*(\d{9})?/);       if (mkpp) d.customerKpp = mkpp[1] || '';
  const maddr = t.match(/Заказчик:.+?ИНН\s+\d{10,12}\s*,\s*(?:КПП\s*(?:\d{9})?\s*,\s*)?(.+?)(?:\s+Плательщик:|\s+Транспортные|\s+маршруту:|$)/);
  if (maddr) {
    const customerBlock = (t.match(/Заказчик:(.+?)(?:\s+Плательщик:|\s+Транспортные|\s+маршруту:|$)/) || [])[1] || '';
    const addrIndex = (customerBlock.match(/\b\d{6}\b/) || [])[0] || '';
    let addr = maddr[1].trim().replace(/,\s*$/, '');
    if (addrIndex && !addr.startsWith(addrIndex)) addr = addrIndex + ', ' + addr.replace(/^,?\s*/, '');
    d.customerAddr = addr;
  }
  const mrt  = t.match(/маршруту:\s*(.+?),\s*(?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford)/i);
  if (mrt) {
    const legs = mrt[1].trim().split(/\s+-\s+/).map(l => l.trim().replace(/,\s*$/,''));
    if (legs.length >= 2) { d.from_a = legs[0]; d.to_a = legs[1]; d.from_b = ''; d.to_b = legs[2] || ''; }
    else { d.from_a = legs[0] || ''; d.from_b = ''; d.to_a = ''; d.to_b = ''; }
  }
  const mcar = t.match(/((?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford),\s*[А-ЯA-Z0-9]+(?:\s*\(\d+\))?)/i);
  if (mcar) d.car = normalizeCarNumber(mcar[1]);
  const mld = t.match(/дата загрузки\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);  if (mld) d.loadDate = mld[1];
  const mud = t.match(/дата выгрузки\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);   if (mud) d.unloadDate = mud[1];
  const mamt = t.match(/на сумму\s+(\d+)\s+руб/i);                         if (mamt) d.amount = mamt[1];
  return d;
}

function showParsed(d, fileName) {
  const rows = [
    ['Файл', fileName], ['Номер', d.num||'—'], ['Дата', d.docDate||'—'],
    ['Заказчик', d.customerName||'—'], ['ИНН', d.customerInn||'—'], ['КПП', d.customerKpp||'—'],
    ['Адрес', d.customerAddr||'—'],
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
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
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
  set('amount',        d.amount);
  document.getElementById('amount_words').value = amountToWords(d.amount || 0);
  closeParsed();
  showToast('✅ Данные из Drive заполнены!');
}

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function uploadPdfToDrive(blob, fileName, year) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const resp = await authApiFetch('/api/archive/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year: Number(year), fileName, pdfBase64: btoa(binary) })
  }, true);
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const messages = {
      archive_year_invalid: 'некорректный год архива',
      archive_filename_invalid: 'некорректное имя PDF',
      pdf_invalid: 'сформированный PDF поврежден',
      pdf_too_large: 'PDF превышает 3 МБ',
      archive_not_configured: 'архив не настроен на сервере',
      drive_access_denied: 'Google не разрешил запись в архив',
      archive_upload_failed: 'Google Drive не сохранил PDF'
    };
    throw new Error(messages[data.error] || 'Не удалось загрузить PDF: HTTP ' + resp.status);
  }
  return (await resp.json()).file;
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

    dMsg('Загружаю счёт PDF...', 'info');
    const invoiceFile = await genInvoice({ uploadYear: year, silent: true });

    dMsg('Загружаю акт PDF...', 'info');
    const actFile = await genAct({ uploadYear: year, silent: true });

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
