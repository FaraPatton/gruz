// Analytics: fast Drive registry + one-time PDF archive scan

const TRIPS_REGISTRY_NAME = 'trips.json';
const TRIPS_REGISTRY_VERSION = 3;
const EXECUTOR_MARKERS = ['Карпов', '771313296859', '40802810438000085714', 'Керамический', 'СБЕРБАНК'];
const ANALYTICS_GREEN = '#39d98a';
const ANALYTICS_GREEN_DARK = '#1f9d63';

let analyticsRegistryFileId = null;
let analyticsView = 'overview';

function toggleAnalytics() {
  const panel = document.getElementById('analyticsPanel');
  const open = getComputedStyle(panel).display === 'none';
  if (!open) {
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-10px) scale(.985)';
    setTimeout(() => { panel.style.display = 'none'; }, 170);
    return;
  }

  panel.style.display = 'block';
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(-14px) scale(.985)';
  panel.style.transition = 'opacity .26s ease, transform .26s cubic-bezier(.2,.8,.2,1)';
  requestAnimationFrame(() => {
    panel.style.opacity = '1';
    panel.style.transform = 'translateY(0) scale(1)';
  });
  loadDriveAnalytics();
}

async function loadDriveAnalytics(refresh) {
  const panel = document.getElementById('analyticsPanel');
  if (!gAccessToken) {
    panel.innerHTML = analyticsShell(
      '<p style="text-align:center;color:var(--dan);font-size:12px;margin:0">Сначала нажмите «Войти в Google».</p>'
    );
    return;
  }

  if (driveCache && !refresh) {
    renderDriveAnalytics(driveCache, analyticsYear, panel);
    return;
  }

  panel.innerHTML = analyticsShell(
    '<p style="color:var(--mut);font-size:12px;margin:0 0 8px;text-align:center">Читаю реестр аналитики...</p>' +
    '<p id="scanProgress" style="color:var(--acc);font-size:11px;font-family:monospace;letter-spacing:1px;margin:0;text-align:center">ПОДКЛЮЧАЮСЬ...</p>'
  );

  try {
    const registry = await loadTripsRegistry();
    driveCache = registry.trips || [];
    if (!driveCache.length) {
      renderRegistryEmpty(panel);
      return;
    }
    renderDriveAnalytics(driveCache, analyticsYear, panel);
  } catch(e) {
    panel.innerHTML = analyticsShell(
      '<p style="text-align:center;color:var(--dan);font-size:12px;margin:0">Ошибка: ' + aEsc(e.message) + '</p>'
    );
  }
}

async function rebuildTripsRegistry() {
  const panel = document.getElementById('analyticsPanel');
  if (!gAccessToken) {
    await new Promise((res, rej) => requestAuth('', res, rej));
  }

  panel.innerHTML = analyticsShell(
    '<p style="color:var(--mut);font-size:12px;margin:0 0 8px;text-align:center">Собираю реестр из счетов и актов...</p>' +
    '<p id="scanProgress" style="color:var(--acc);font-size:11px;font-family:monospace;letter-spacing:1px;margin:0;text-align:center">СТАРТ...</p>'
  );

  try {
    const trips = await scanDriveArchiveToTrips();
    const registry = {
      version: TRIPS_REGISTRY_VERSION,
      updatedAt: new Date().toISOString(),
      source: 'drive-pdf-scan',
      trips
    };

    await saveTripsRegistry(registry);
    driveCache = trips;
    analyticsYear = 0;
    renderDriveAnalytics(driveCache, analyticsYear, panel);
    showToast('✓ Реестр аналитики обновлен');
  } catch(e) {
    panel.innerHTML = analyticsShell(
      '<p style="text-align:center;color:var(--dan);font-size:12px;margin:0">Ошибка: ' + aEsc(e.message) + '</p>'
    );
  }
}

function setProgress(txt) {
  const el = document.getElementById('scanProgress');
  if (el) el.textContent = txt;
}

function analyticsShell(inner) {
  return '<div class="dc" style="padding:16px;margin-bottom:0">' + inner + '</div>';
}

function aEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  const n = Number(value) || 0;
  return n ? n.toLocaleString('ru-RU') + ' ₽' : '—';
}

function pct(value, max) {
  if (!value || !max) return 0;
  return Math.max(3, Math.round(value / max * 100));
}

async function driveJson(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + gAccessToken,
      ...(options.headers || {})
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Drive API ' + resp.status + (text ? ': ' + text.slice(0, 120) : ''));
  }
  return resp.json();
}

async function driveList(parentId, kind) {
  const mime = kind === 'folder'
    ? "mimeType='application/vnd.google-apps.folder'"
    : "mimeType='application/pdf'";
  const q = encodeURIComponent("'" + parentId + "' in parents and " + mime + " and trashed=false");
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
    '&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000';
  const data = await driveJson(url);
  return data.files || [];
}

async function findTripsRegistryFile() {
  const q = encodeURIComponent(
    "'" + ARCHIVE_ROOT + "' in parents and name='" + TRIPS_REGISTRY_NAME + "' and trashed=false"
  );
  const data = await driveJson(
    'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,modifiedTime)&pageSize=1'
  );
  return data.files?.[0] || null;
}

async function loadTripsRegistry() {
  setProgress('ИЩУ trips.json...');
  const file = await findTripsRegistryFile();
  analyticsRegistryFileId = file?.id || null;
  if (!file) {
    return { version: TRIPS_REGISTRY_VERSION, updatedAt: null, trips: [] };
  }

  setProgress('ЗАГРУЖАЮ trips.json...');
  const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', {
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  if (!resp.ok) throw new Error('Не удалось загрузить trips.json: HTTP ' + resp.status);
  const registry = await resp.json();
  registry.trips = Array.isArray(registry.trips) ? registry.trips.map(normalizeTrip).filter(Boolean) : [];
  return registry;
}

async function saveTripsRegistry(registry) {
  const current = analyticsRegistryFileId ? { id: analyticsRegistryFileId } : await findTripsRegistryFile();
  analyticsRegistryFileId = current?.id || null;

  const metadata = analyticsRegistryFileId
    ? { name: TRIPS_REGISTRY_NAME, mimeType: 'application/json' }
    : { name: TRIPS_REGISTRY_NAME, mimeType: 'application/json', parents: [ARCHIVE_ROOT] };

  const boundary = 'gruz_registry_' + Date.now();
  const payload = JSON.stringify(registry, null, 2);
  const body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    payload + '\r\n' +
    '--' + boundary + '--';

  const url = analyticsRegistryFileId
    ? 'https://www.googleapis.com/upload/drive/v3/files/' + analyticsRegistryFileId + '?uploadType=multipart'
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  setProgress('СОХРАНЯЮ trips.json...');
  const data = await driveJson(url, {
    method: analyticsRegistryFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  analyticsRegistryFileId = data.id || analyticsRegistryFileId;
}

async function scanDriveArchiveToTrips() {
  setProgress('ЧИТАЮ ПАПКИ ПО ГОДАМ...');
  const yearFolders = await driveList(ARCHIVE_ROOT, 'folder');
  const allFiles = [];

  for (const folder of yearFolders) {
    const year = parseInt(folder.name, 10);
    if (!year || year < 2015) continue;

    setProgress('ГОД ' + year + ': ИЩУ PDF...');
    const files = await driveList(folder.id, 'pdf');
    files
      .filter(isDocumentPdf)
      .forEach(file => allFiles.push({ ...file, fallbackYear: year }));
  }

  const orderedFiles = allFiles.sort((a, b) => {
    const ad = docTypeRank(a.name);
    const bd = docTypeRank(b.name);
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, 'ru');
  });

  setProgress('НАЙДЕНО PDF: ' + orderedFiles.length);
  const trips = [];
  for (let i = 0; i < orderedFiles.length; i += 8) {
    setProgress(Math.min(i + 8, orderedFiles.length) + '/' + orderedFiles.length + ' ФАЙЛОВ...');
    const chunk = orderedFiles.slice(i, i + 8);
    const results = await Promise.allSettled(chunk.map(readTripFromPdf));
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) trips.push(result.value);
    });
  }

  return mergeTrips(trips).sort((a, b) => {
    const da = a.date || String(a.year || '');
    const db = b.date || String(b.year || '');
    return db.localeCompare(da);
  });
}

function isDocumentPdf(file) {
  const name = (file.name || '').toLowerCase();
  return name.startsWith('schet') || name.startsWith('akt');
}

function docTypeRank(name) {
  return String(name || '').toLowerCase().startsWith('schet') ? 0 : 1;
}

async function readTripFromPdf(file) {
  try {
    const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', {
      headers: { Authorization: 'Bearer ' + gAccessToken }
    });
    if (!resp.ok) return null;

    const buf = await resp.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map(i => i.str).join(' ').replace(/\s+/g, ' ');
    return parseTripFromPdfText(text, file);
  } catch(e) {
    console.warn('Analytics PDF skipped:', file.name, e);
    return null;
  }
}

function parseTripFromPdfText(text, file) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const name = file.name || '';
  const lowerName = name.toLowerCase();
  const docType = lowerName.startsWith('akt') ? 'act' : 'invoice';
  const docNum = pickFirst(
    matchOne(t, /(?:Сч[её]т(?:\s+на\s+оплату)?|Акт)[^№]{0,40}№\s*([A-Za-zА-Яа-я0-9_-]+)/i),
    matchOne(name, /^(?:schet|akt)[_\s-]*(\d+)/i)
  );

  const dateMatch = t.match(/(?:№\s*[A-Za-zА-Яа-я0-9_-]+\s*)?от\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  const day = dateMatch ? parseInt(dateMatch[1], 10) : 1;
  const month = dateMatch ? parseInt(dateMatch[2], 10) : 1;
  const year = dateMatch ? parseInt(dateMatch[3], 10) : (file.fallbackYear || null);
  if (!year || year < 2015) return null;

  const customer = extractCustomerDetails(t);
  const customerName = customer.name;
  const customerInn = customer.inn;
  const customerKpp = customer.kpp;

  const amount = amountFromText(t);
  const route = cleanText(matchOne(
    t,
    /маршруту:\s*(.+?)(?:,\s*(?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford)|,\s*дата\s+загрузки|,\s*дат[аы]\s+|$)/i
  ));
  const car = cleanText(matchOne(
    t,
    /((?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford),\s*[А-ЯA-Z0-9]+(?:\(\d+\))?)/i
  ));
  const loadDate = toIsoDate(matchOne(t, /дата\s+загрузки\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/i));
  const unloadDate = toIsoDate(matchOne(t, /дата\s+выгрузки\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/i));
  const docDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : `${year}-01-01`;

  return normalizeTrip({
    id: '',
    docNum,
    docType,
    date: docDate,
    day,
    month,
    year,
    amount,
    customerName,
    customerInn,
    customerKpp,
    route,
    car,
    loadDate,
    unloadDate,
    invoiceFileId: docType === 'invoice' ? file.id : '',
    actFileId: docType === 'act' ? file.id : '',
    sourceName: name
  });
}

function amountFromText(t) {
  const raw = pickFirst(
    matchOne(t, /Всего\s+к\s+оплате[:\s]+(\d[\d\s]*(?:[,.]\d{2})?)/i),
    matchOne(t, /на\s+сумму[:\s]+(\d[\d\s]*(?:[,.]\d{2})?)\s*(?:руб|₽)/i),
    matchOne(t, /Итого[:\s]+(\d[\d\s]*(?:[,.]\d{2})?)/i)
  );
  if (!raw) return 0;
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  return Math.round(parseFloat(normalized) || 0);
}

function normalizeTrip(trip) {
  if (!trip) return null;
  const year = parseInt(trip.year, 10);
  if (!year || year < 2015) return null;

  const date = trip.date || `${year}-${String(trip.month || 1).padStart(2, '0')}-${String(trip.day || 1).padStart(2, '0')}`;
  const month = parseInt(trip.month || date.slice(5, 7), 10) || 1;
  const day = parseInt(trip.day || date.slice(8, 10), 10) || 1;
  const customerName = customerDisplayName(trip.customerName || trip.customer || '');
  const docNum = String(trip.docNum || '').trim();

  const normalized = {
    id: trip.id || '',
    docNum,
    docType: trip.docType || 'invoice',
    date,
    day,
    month,
    year,
    amount: Math.round(Number(trip.amount) || 0),
    customerName,
    customerInn: String(trip.customerInn || '').trim(),
    customerKpp: String(trip.customerKpp || '').trim(),
    route: cleanText(trip.route || ''),
    car: cleanText(trip.car || ''),
    loadDate: trip.loadDate || '',
    unloadDate: trip.unloadDate || '',
    invoiceFileId: trip.invoiceFileId || '',
    actFileId: trip.actFileId || '',
    sourceName: trip.sourceName || ''
  };

  normalized.id = normalized.id || tripKey(normalized);
  return normalized;
}

function mergeTrips(trips) {
  const byKey = new Map();
  trips.map(normalizeTrip).filter(Boolean).forEach(trip => {
    const key = tripKey(trip);
    if (!byKey.has(key)) {
      byKey.set(key, trip);
      return;
    }

    const prev = byKey.get(key);
    const merged = { ...prev };
    Object.keys(trip).forEach(k => {
      if (!merged[k] && trip[k]) merged[k] = trip[k];
    });
    if (trip.invoiceFileId) {
      merged.invoiceFileId = trip.invoiceFileId;
      merged.docType = 'invoice';
      merged.sourceName = trip.sourceName || merged.sourceName;
    }
    if (trip.actFileId) merged.actFileId = trip.actFileId;
    byKey.set(key, normalizeTrip(merged));
  });
  return [...byKey.values()];
}

function tripKey(trip) {
  const customer = trip.customerInn || cleanCustomer(trip.customerName).toLowerCase();
  const num = trip.docNum || matchOne(trip.sourceName || '', /^(?:schet|akt)[_\s-]*(\d+)/i) || '';
  return [trip.year, num, customer, trip.amount || 0].join('|');
}

function matchOne(text, regex) {
  const m = String(text || '').match(regex);
  return m ? m[1] : '';
}

function pickFirst(...values) {
  return values.find(v => String(v || '').trim()) || '';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/,\s*$/g, '').trim();
}

function customerDisplayName(value) {
  const raw = cleanCustomer(value);
  if (!raw || isBadCustomerText(raw)) return '';

  const orgQuoted = raw.match(/((?:ООО|АО|ЗАО|ПАО|НКО)\s+"[^"]{2,80}")/i);
  if (orgQuoted) return orgQuoted[1].trim();

  const ipName = raw.match(/(ИП\s+[А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+){1,2})/);
  if (ipName) return ipName[1].trim();

  const orgPlain = raw.match(/((?:ООО|АО|ЗАО|ПАО|НКО)\s+[А-ЯЁA-Z][А-ЯЁа-яёA-Z0-9 .-]{2,70})/i);
  if (orgPlain) {
    const name = orgPlain[1]
      .replace(/\s+(?:ИНН|КПП|адрес|тел|№|Наименование|Товары|Услуги).*$/i, '')
      .replace(/,\s*.*$/, '')
      .trim();
    if (!isBadCustomerText(name)) return name;
  }

  const person = raw.match(/\b([А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+){1,2})\b/);
  if (person && !isBadCustomerText(person[1])) return person[1].trim();

  return '';
}

function isBadCustomerText(value) {
  const v = cleanText(value);
  const low = v.toLowerCase();
  if (!v || v.length < 3) return true;
  if (!/[а-яёa-z]/i.test(v)) return true;
  if (/^\d/.test(v)) return true;
  if ((v.match(/\d/g) || []).length >= 5) return true;
  if (isExecutorCustomer(v, '')) return true;
  return [
    'инн', 'кпп', 'бик', 'сч.', 'счет', 'счёт', 'банк', 'получатель',
    'адрес', 'тел', 'область', 'район', 'городского типа', 'деревня',
    'поселок', 'посёлок', 'улица', 'ул.', 'дом ', ' д.', 'кв.',
    'наименование работ', 'товары', 'услуги', 'кол-во', 'цена', 'сумма'
  ].some(marker => low.includes(marker));
}

function extractCustomerDetails(text) {
  const t = cleanText(text);
  const labelRe = /(Заказчик|Плательщик|Покупатель):\s*/ig;
  const candidates = [];
  let m;

  while ((m = labelRe.exec(t)) !== null) {
    const start = m.index + m[0].length;
    const next = t.slice(start).search(/\s(?:Заказчик|Плательщик|Покупатель|Товары|Услуги|№|Итого|Всего)\s*[:№]/i);
    const block = t.slice(start, next >= 0 ? start + next : start + 360);
    const details = customerFromBlock(block);
    if (details.name && !isExecutorCustomer(details.name, details.inn)) candidates.push(details);
  }

  if (candidates.length) return candidates[0];

  const wholeTextOrg = matchOne(t, /((?:ООО|ИП|АО|ЗАО|ПАО|НКО)\s+(?:"[^"]+"|[А-ЯЁA-Z0-9][^,;:]{1,80}))/i);
  const fallback = customerFromBlock(wholeTextOrg);
  return isExecutorCustomer(fallback.name, fallback.inn) ? { name: '', inn: '', kpp: '' } : fallback;
}

function customerFromBlock(block) {
  const b = cleanText(block);
  const org = matchOne(b, /((?:ООО|ИП|АО|ЗАО|ПАО|НКО)\s+(?:"[^"]+"|[А-ЯЁA-Z0-9][^,;:]{1,80}))/i);
  return {
    name: customerDisplayName(org || b),
    inn: matchOne(b, /ИНН\s*(\d{10,12})/i),
    kpp: matchOne(b, /КПП\s*(\d{9})/i)
  };
}

function isExecutorCustomer(name, inn) {
  const value = (String(name || '') + ' ' + String(inn || '')).toLowerCase();
  return EXECUTOR_MARKERS.some(marker => value.includes(marker.toLowerCase()));
}

function cleanCustomer(value) {
  let v = cleanText(value).trim();
  v = v
    .replace(/\s*(?:ИНН|КПП|ОГРН|Адрес|Тел\.?).*$/i, '')
    .replace(/,\s*(?:\d{6}|г\.|город|ул\.|улица|д\.|дом).*$/i, '')
    .replace(/,\s*$/, '')
    .trim();
  const quoted = v.match(/^"(.+)"$/);
  if (quoted) v = quoted[1].trim();
  const orgQuoted = v.match(/^((?:ООО|АО|ЗАО|ПАО|НКО)\s+"[^"]+")/i);
  if (orgQuoted) return orgQuoted[1].trim();
  const ipName = v.match(/^(ИП\s+[А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+){1,2})/);
  if (ipName) return ipName[1].trim();
  v = v.replace(/\s+,/g, ',');
  if (/^ООО\s+[^"]/.test(v) && !v.includes('"')) v = 'ООО "' + v.slice(4).trim() + '"';
  return v;
}

function toIsoDate(value) {
  const m = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function tripFromFormData(data, extra = {}) {
  const date = toIsoDate(data.docDate) || toIsoDate(data.loadDate) || today();
  const year = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(5, 7), 10) || 1;
  const day = parseInt(date.slice(8, 10), 10) || 1;

  return normalizeTrip({
    id: extra.id || '',
    docNum: data.num,
    docType: extra.docType || 'invoice',
    date,
    day,
    month,
    year,
    amount: data.amount,
    customerName: data.customerName,
    customerInn: data.customerInn,
    customerKpp: data.customerKpp,
    route: data.route,
    car: data.car,
    loadDate: toIsoDate(data.loadDate),
    unloadDate: toIsoDate(data.unloadDate),
    invoiceFileId: extra.invoiceFileId || '',
    actFileId: extra.actFileId || '',
    sourceName: extra.sourceName || ('form_' + data.num + '_' + date)
  });
}

async function saveTripToRegistry(trip) {
  const cleanTrip = normalizeTrip(trip);
  if (!cleanTrip) throw new Error('Не удалось подготовить рейс для trips.json');

  const registry = await loadTripsRegistry();
  const trips = mergeTrips([...(registry.trips || []), cleanTrip]).sort((a, b) => {
    const da = a.date || String(a.year || '');
    const db = b.date || String(b.year || '');
    return db.localeCompare(da);
  });

  await saveTripsRegistry({
    ...registry,
    version: TRIPS_REGISTRY_VERSION,
    updatedAt: new Date().toISOString(),
    source: 'form-and-drive',
    trips
  });

  driveCache = trips;
  return cleanTrip;
}

async function saveFormTripToRegistry(data, extra = {}) {
  return saveTripToRegistry(tripFromFormData(data, extra));
}

async function deleteTripFromRegistry(tripId) {
  const currentTrips = (driveCache || []).map(normalizeTrip).filter(Boolean);
  const trip = currentTrips.find(item => item.id === tripId);
  const label = trip
    ? '№' + (trip.docNum || '—') + ' от ' + formatIsoDate(trip.date) + ', ' + (trip.customerName || 'без заказчика')
    : 'эту запись';

  if (!confirm('Удалить рейс из trips.json?\n\n' + label + '\n\nPDF-файлы на Drive останутся на месте.')) {
    return;
  }

  if (!gAccessToken) {
    await new Promise((res, rej) => requestAuth('', res, rej));
  }

  const registry = await loadTripsRegistry();
  const normalizedTrips = (registry.trips || []).map(normalizeTrip).filter(Boolean);
  const trips = normalizedTrips.filter(item => item.id !== tripId);

  if (trips.length === normalizedTrips.length) {
    showToast('Запись уже не найдена');
    return;
  }

  await saveTripsRegistry({
    ...registry,
    version: TRIPS_REGISTRY_VERSION,
    updatedAt: new Date().toISOString(),
    source: 'manual-delete',
    trips
  });

  driveCache = trips;
  showToast('Рейс удалён из trips.json');
  renderDriveAnalytics(driveCache, analyticsYear, document.getElementById('analyticsPanel'));
}

function formatIsoDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
}

function renderRegistryEmpty(panel) {
  panel.innerHTML = analyticsShell(
    '<div style="--acc:' + ANALYTICS_GREEN + ';font-family:monospace;font-size:10px;letter-spacing:0;color:var(--acc);margin-bottom:10px;font-weight:700">АРХИВ DRIVE - АНАЛИТИКА</div>' +
    '<p style="font-size:12px;color:var(--txt2);line-height:1.45;margin:0 0 12px">Реестр trips.json пока не найден. Его можно собрать автоматически из PDF-файлов в архиве: подойдут счета и акты с именами вида schet_1 или akt_1.</p>' +
    '<button class="bd" onclick="rebuildTripsRegistry()" style="font-size:13px;padding:10px">Собрать реестр из PDF</button>'
  );
}

function renderDriveAnalytics(entries, yr, panel) {
  const trips = (entries || []).map(normalizeTrip).filter(Boolean);
  const years = [...new Set(trips.map(e => e.year))].sort((a, b) => b - a);
  const selectedYear = years.includes(yr) ? yr : 0;
  const filtered = selectedYear ? trips.filter(e => e.year === selectedYear) : trips;

  if (!trips.length) {
    renderRegistryEmpty(panel);
    return;
  }

  const totalRides = filtered.length;
  const totalAmt = filtered.reduce((sum, e) => sum + e.amount, 0);
  const avgAmt = totalRides ? Math.round(totalAmt / totalRides) : 0;
  const monthly = Array(12).fill(0);
  filtered.forEach(e => { if (e.month >= 1 && e.month <= 12) monthly[e.month - 1]++; });
  const maxM = Math.max(...monthly, 1);
  const monthNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

  const customerRows = filtered.filter(e => e.customerName && !isExecutorCustomer(e.customerName, e.customerInn));
  const customerStats = groupStats(customerRows, e => e.customerName);
  const topByTrips = customerStats.slice().sort((a, b) => b.count - a.count).slice(0, 5);
  const topByMoney = customerStats.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
  const routeStats = groupStats(filtered.filter(e => e.route), e => e.route).sort((a, b) => b.count - a.count).slice(0, 5);
  const yearStats = years.map(y => {
    const rows = trips.filter(e => e.year === y);
    return { name: String(y), count: rows.length, amount: rows.reduce((s, e) => s + e.amount, 0) };
  });

  const maxYearCount = Math.max(...yearStats.map(s => s.count), 1);
  const maxTopTrips = Math.max(...topByTrips.map(s => s.count), 1);
  const maxTopMoney = Math.max(...topByMoney.map(s => s.amount), 1);
  const maxRoutes = Math.max(...routeStats.map(s => s.count), 1);
  if (!['overview', 'years', 'customers', 'routes', 'journal'].includes(analyticsView)) analyticsView = 'overview';

  const overviewHtml =
    '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:16px">' +
      statCard(totalRides, 'Рейсов') +
      statCard(money(totalAmt), 'Выручка') +
      statCard(money(avgAmt), 'Средний чек') +
    '</div>' +
    sectionTitle('Рейсы по месяцам') +
    '<div style="display:flex;align-items:flex-end;gap:5px;height:76px;margin-bottom:20px;padding:6px 2px 0;border-bottom:1px solid rgba(255,255,255,.08)">' +
      monthly.map((v, i) => monthBar(v, maxM, monthNames[i])).join('') +
    '</div>' +
    sectionTitle('Кратко по годам') +
    yearStats.slice(0, 4).map(row => metricRow(row.name, row.count + ' рейсов · ' + money(row.amount), pct(row.count, maxYearCount))).join('');

  const yearsHtml =
    sectionTitle('Динамика по годам') +
    yearStats.map(row => metricRow(row.name, row.count + ' рейсов · ' + money(row.amount), pct(row.count, maxYearCount))).join('');

  const customersHtml =
    analyticsList('Топ заказчиков по рейсам', topByTrips, maxTopTrips, row => row.count + ' рейсов') +
    analyticsList('Топ заказчиков по выручке', topByMoney, maxTopMoney, row => money(row.amount), true) +
    (!topByTrips.length && !topByMoney.length ? emptyAnalyticsText('Не нашёл заказчиков в формате ООО, ИП или ФИО. Попробуй пересобрать реестр после обновления.') : '');

  const routesHtml =
    analyticsList('Популярные маршруты', routeStats, maxRoutes, row => row.count + ' рейсов') +
    (!routeStats.length ? emptyAnalyticsText('Маршруты пока не распознаны в выбранном периоде.') : '');

  const journalHtml = analyticsJournal(filtered);

  const viewHtml = {
    overview: overviewHtml,
    years: yearsHtml,
    customers: customersHtml,
    routes: routesHtml,
    journal: journalHtml
  }[analyticsView];

  panel.innerHTML =
    '<style>@keyframes analyticsViewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}</style>' +
    '<div class="dc" style="--acc:' + ANALYTICS_GREEN + ';--ana:' + ANALYTICS_GREEN + ';--ana2:' + ANALYTICS_GREEN_DARK + ';--ana-bg:#171022;--ana-card:#211733;--ana-card2:#2b2140;--ana-text:#f8fbff;--ana-muted:#a99bc8;padding:18px;margin-bottom:0;background:radial-gradient(circle at 12% 0%,rgba(57,217,138,.11),transparent 30%),linear-gradient(180deg,#1a1128,#130f1d);border-color:rgba(137,104,190,.28);box-shadow:0 22px 54px rgba(0,0,0,.24)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px">' +
        '<div style="font-family:monospace;font-size:10px;letter-spacing:0;color:var(--ana);font-weight:700">АРХИВ DRIVE - АНАЛИТИКА</div>' +
        '<button onclick="rebuildTripsRegistry()" style="background:rgba(255,255,255,.045);color:var(--ana-muted);border:1px solid rgba(137,104,190,.35);border-radius:8px;padding:5px 10px;font-size:10px;font-family:monospace;letter-spacing:0;cursor:pointer;transition:.18s ease">ПЕРЕСОБРАТЬ</button>' +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px">' +
        [0, ...years].map(y => yearButton(y, selectedYear)).join('') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:16px">' +
        viewButton('overview', 'Обзор') +
        viewButton('years', 'Годы') +
        viewButton('customers', 'Заказчики') +
        viewButton('routes', 'Маршруты') +
        viewButton('journal', 'Журнал') +
      '</div>' +
      '<div style="animation:analyticsViewIn .22s ease">' + viewHtml + '</div>' +
      '<button class="bd" onclick="driveCache=null;loadDriveAnalytics(true)" style="margin-top:14px;font-size:13px;padding:11px;border-radius:8px;background:linear-gradient(180deg,var(--ana),var(--ana2));color:#08140f;border:0">Обновить из trips.json</button>' +
    '</div>';
}

function groupStats(rows, getName) {
  const map = new Map();
  rows.forEach(row => {
    const name = getName(row);
    if (!map.has(name)) map.set(name, { name, count: 0, amount: 0 });
    const stat = map.get(name);
    stat.count += 1;
    stat.amount += row.amount || 0;
  });
  return [...map.values()];
}

function setAnalyticsView(view) {
  analyticsView = view;
  renderDriveAnalytics(driveCache || [], analyticsYear, document.getElementById('analyticsPanel'));
}

function viewButton(view, label) {
  const active = analyticsView === view;
  return '<button onclick="setAnalyticsView(&quot;' + view + '&quot;)" ' +
    'style="min-width:0;background:' + (active ? 'linear-gradient(180deg,rgba(57,217,138,.18),rgba(57,217,138,.08))' : 'rgba(255,255,255,.035)') + ';color:' + (active ? 'var(--ana)' : 'var(--ana-muted)') + ';border:1px solid ' + (active ? 'rgba(57,217,138,.42)' : 'rgba(137,104,190,.24)') + ';border-radius:8px;padding:8px 6px;font-size:11px;font-weight:650;cursor:pointer;transition:.18s ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
    label + '</button>';
}

function emptyAnalyticsText(text) {
  return '<div style="background:rgba(255,255,255,.035);border:1px solid rgba(137,104,190,.24);border-radius:8px;padding:12px;color:var(--ana-muted);font-size:12px;line-height:1.45">' + aEsc(text) + '</div>';
}

function analyticsJournal(rows) {
  const sorted = rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!sorted.length) return emptyAnalyticsText('В выбранном периоде нет записей trips.json.');

  return sectionTitle('Журнал trips.json') +
    '<div style="display:grid;gap:8px">' +
      sorted.map(trip => {
        const title = '№' + (trip.docNum || '—') + ' · ' + formatIsoDate(trip.date) + ' · ' + money(trip.amount);
        const customer = trip.customerName || 'Заказчик не указан';
        const route = trip.route || 'Маршрут не указан';
        const files = [
          trip.invoiceFileId ? 'счёт PDF' : '',
          trip.actFileId ? 'акт PDF' : ''
        ].filter(Boolean).join(' · ') || 'PDF не привязаны';

        return '<div style="background:rgba(255,255,255,.035);border:1px solid rgba(137,104,190,.24);border-radius:8px;padding:11px;display:grid;gap:8px">' +
          '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
            '<div style="min-width:0">' +
              '<div style="color:var(--ana-text);font-weight:750;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + aEsc(title) + '</div>' +
              '<div style="color:var(--ana);font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + aEsc(customer) + '">' + aEsc(customer) + '</div>' +
            '</div>' +
            '<button onclick="deleteTripFromRegistry(&quot;' + aEsc(trip.id) + '&quot;)" style="background:rgba(232,74,95,.12);color:#ff8d9d;border:1px solid rgba(232,74,95,.38);border-radius:8px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Удалить</button>' +
          '</div>' +
          '<div style="color:var(--ana-muted);font-size:11px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="' + aEsc(route) + '">' + aEsc(route) + '</div>' +
          '<div style="display:flex;justify-content:space-between;gap:10px;color:rgba(248,251,255,.62);font-size:10px;font-family:monospace;letter-spacing:0">' +
            '<span>' + aEsc(files) + '</span>' +
            '<span>' + aEsc(trip.id) + '</span>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

function yearButton(year, selectedYear) {
  const active = year === selectedYear;
  const label = year === 0 ? 'Все' : year;
  return '<button onclick="analyticsYear=' + year + ';renderDriveAnalytics(driveCache,' + year + ',document.getElementById(&quot;analyticsPanel&quot;))" ' +
    'style="background:' + (active ? 'linear-gradient(180deg,var(--ana),var(--ana2))' : 'rgba(255,255,255,.035)') + ';color:' + (active ? '#07140d' : 'var(--ana-muted)') + ';border:1px solid ' + (active ? 'rgba(57,217,138,.78)' : 'rgba(137,104,190,.24)') + ';border-radius:14px;padding:4px 11px;font-size:11px;font-family:monospace;letter-spacing:0;cursor:pointer;box-shadow:' + (active ? '0 8px 22px rgba(57,217,138,.14)' : 'none') + ';transition:.18s ease">' +
    label + '</button>';
}

function statCard(value, label) {
  return '<div style="background:linear-gradient(180deg,var(--ana-card2),var(--ana-card));border:1px solid rgba(137,104,190,.24);border-radius:8px;padding:12px 10px;text-align:center;min-width:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)">' +
    '<div style="font-size:16px;font-weight:750;color:var(--ana-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + value + '</div>' +
    '<div style="font-size:10px;color:var(--ana-muted);margin-top:4px">' + label + '</div>' +
  '</div>';
}

function sectionTitle(text) {
  return '<div style="font-family:monospace;font-size:10px;letter-spacing:0;color:var(--ana-muted);margin:16px 0 9px">' + text + '</div>';
}

function monthBar(value, max, label) {
  const h = value ? Math.max(Math.round(value / max * 62), 4) : 0;
  return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0">' +
    '<div title="' + value + '" style="width:100%;height:' + h + 'px;background:' + (value ? 'linear-gradient(180deg,var(--ana),var(--ana2))' : 'rgba(255,255,255,.06)') + ';border-radius:6px 6px 2px 2px;box-shadow:' + (value ? '0 8px 18px rgba(57,217,138,.12)' : 'none') + ';transition:height .28s ease"></div>' +
    '<div style="font-size:8px;color:var(--mut);margin-top:3px">' + label + '</div>' +
  '</div>';
}

function analyticsList(title, rows, max, formatValue, amountWidth) {
  if (!rows.length) return '';
  return sectionTitle(title) + rows.map((row, i) => {
    const width = amountWidth ? pct(row.amount, max) : pct(row.count, max);
    return metricRow((i + 1) + '. ' + row.name, formatValue(row), width);
  }).join('');
}

function metricRow(name, value, width) {
  return '<div style="margin-bottom:8px;padding:7px 0">' +
    '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;margin-bottom:6px;align-items:baseline">' +
      '<span style="color:var(--ana-text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + aEsc(name) + '">' + aEsc(name) + '</span>' +
      '<span style="color:var(--ana);font-weight:650;white-space:nowrap">' + aEsc(value) + '</span>' +
    '</div>' +
    '<div style="height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden"><div style="height:100%;width:' + width + '%;background:linear-gradient(90deg,var(--ana),var(--ana2));border-radius:999px;box-shadow:0 0 16px rgba(57,217,138,.16);transition:width .28s ease"></div></div>' +
  '</div>';
}

function bindAnalyticsButton() {
  const btn = document.getElementById('analyticsToggleBtn');
  if (!btn || btn.dataset.analyticsBound === '1') return;
  btn.dataset.analyticsBound = '1';
  btn.onclick = event => {
    event.preventDefault();
    toggleAnalytics();
  };
}

window.toggleAnalytics = toggleAnalytics;
window.loadDriveAnalytics = loadDriveAnalytics;
window.rebuildTripsRegistry = rebuildTripsRegistry;
window.renderDriveAnalytics = renderDriveAnalytics;
window.setAnalyticsView = setAnalyticsView;
window.saveFormTripToRegistry = saveFormTripToRegistry;
window.deleteTripFromRegistry = deleteTripFromRegistry;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAnalyticsButton);
} else {
  bindAnalyticsButton();
}
