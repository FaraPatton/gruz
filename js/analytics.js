// Analytics: fast Drive registry + one-time PDF archive scan

let analyticsRegistryFileId = null;
let analyticsView = 'overview';
let yandexMapsLoadPromise = null;

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
  const route = cleanText(trip.route || '');
  const routeParts = routeEndpointParts(route);
  const cargoDistanceMeters = Math.round(Number(trip.cargoDistanceMeters || trip.routeDistanceMeters) || 0);
  const totalDistanceMeters = Math.round(Number(trip.totalDistanceMeters) || 0);

  const normalized = {
    id: trip.id || '',
    docNum,
    docType: trip.docType || 'invoice',
    date,
    day,
    month,
    year,
    amount: Math.round(Number(trip.amount) || 0),
    paymentType: normalizePaymentType(trip.paymentType || trip.payment || ''),
    paymentUpdatedAt: trip.paymentUpdatedAt || '',
    customerName,
    customerInn: String(trip.customerInn || '').trim(),
    customerKpp: String(trip.customerKpp || '').trim(),
    route,
    routeOrigin: cleanText(trip.routeOrigin || routeParts.origin),
    routeDestination: cleanText(trip.routeDestination || routeParts.destination),
    routePolyline: String(trip.routePolyline || '').trim(),
    routeDistanceMeters: cargoDistanceMeters,
    cargoDistanceMeters,
    totalDistanceMeters,
    routeDuration: String(trip.routeDuration || '').trim(),
    routeMapUpdatedAt: trip.routeMapUpdatedAt || '',
    totalRouteUpdatedAt: trip.totalRouteUpdatedAt || '',
    routeMetricsSource: trip.routeMetricsSource || '',
    fuelCostRub: Math.round(Number(trip.fuelCostRub) || 0),
    fuelLiters: Number(trip.fuelLiters) || 0,
    fuelPriceRub: Number(trip.fuelPriceRub) || 0,
    fuelLitersPer100Km: Number(trip.fuelLitersPer100Km) || 0,
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
    if (normalizePaymentType(merged.paymentType) === 'unknown' && normalizePaymentType(trip.paymentType) !== 'unknown') {
      merged.paymentType = normalizePaymentType(trip.paymentType);
    }
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
  const markers = typeof EXECUTOR_MARKERS !== 'undefined' && Array.isArray(EXECUTOR_MARKERS) ? EXECUTOR_MARKERS : [];
  return markers.some(marker => value.includes(String(marker || '').toLowerCase()));
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
    routeOrigin: data.routeOrigin,
    routeDestination: data.routeDestination,
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

function loadYandexMapsApi() {
  if (typeof ymaps !== 'undefined') {
    return new Promise((resolve, reject) => ymaps.ready(resolve, reject));
  }
  if (yandexMapsLoadPromise) return yandexMapsLoadPromise;

  yandexMapsLoadPromise = new Promise((resolve, reject) => {
    const key = typeof YANDEX_MAPS_API_KEY !== 'undefined' ? String(YANDEX_MAPS_API_KEY || '').trim() : '';
    if (!key) {
      reject(new Error('YANDEX_MAPS_API_KEY is empty'));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://api-maps.yandex.ru/2.1/?apikey=' + encodeURIComponent(key) + '&lang=ru_RU&load=package.full';
    script.async = true;
    script.onload = () => ymaps.ready(resolve, reject);
    script.onerror = () => {
      yandexMapsLoadPromise = null;
      reject(new Error('Не загрузился Yandex Maps JS API'));
    };
    document.head.appendChild(script);
  });

  return yandexMapsLoadPromise;
}

async function calculateYandexRouteMeters(points) {
  const cleanPoints = (points || []).map(cleanText).filter(Boolean);
  if (cleanPoints.length < 2) return 0;
  try {
    await loadYandexMapsApi();
    const route = await ymaps.route(cleanPoints, { routingMode: 'auto' });
    return Math.round(route.getLength() || 0);
  } catch (e) {
    const code = e && (e.message || e.name || e.toString && e.toString());
    if (String(code || '').includes('scriptError')) {
      throw new Error('routing unavailable');
    }
    throw e;
  }
}

async function enrichTripRouteMetrics(trip) {
  const cleanTrip = normalizeTrip(trip);
  if (!cleanTrip) return null;
  if (!routeBaseAddress() || !cleanTrip.routeOrigin || !cleanTrip.routeDestination) return cleanTrip;
  if (cleanTrip.cargoDistanceMeters && cleanTrip.totalDistanceMeters) return cleanTrip;

  try {
    const cargoPoints = routePoints(cleanTrip, false);
    const totalPoints = routePoints(cleanTrip, true);
    if (!cleanTrip.cargoDistanceMeters) {
      cleanTrip.cargoDistanceMeters = await calculateYandexRouteMeters(cargoPoints);
      cleanTrip.routeDistanceMeters = cleanTrip.cargoDistanceMeters;
    }
    if (!cleanTrip.totalDistanceMeters) {
      cleanTrip.totalDistanceMeters = await calculateYandexRouteMeters(totalPoints);
    }
    cleanTrip.totalRouteUpdatedAt = new Date().toISOString();
  } catch (e) {
    cleanTrip.routeMetricsSource = 'manual-required';
  }

  return cleanTrip;
}

function routeYandexMapsUrl(trip) {
  const points = routePoints(trip, true);
  if (points.length < 2) return '';
  return 'https://yandex.ru/maps/?rtext=' + routeRtext(points) + '&rtt=auto';
}

function routeYandexWidgetUrl(trip) {
  const points = routePoints(trip, true);
  if (points.length < 2) return '';
  return 'https://yandex.ru/map-widget/v1/?rtext=' + routeRtext(points) + '&rtt=auto&z=8';
}

function routeMapMeta(trip) {
  const cargo = formatKm(trip.cargoDistanceMeters || trip.routeDistanceMeters);
  const total = formatKm(trip.totalDistanceMeters);
  const perKm = grossPerKm(trip);
  const fuel = fuelEstimate(trip);
  return [
    total ? 'круг ' + total : '',
    cargo ? 'груз ' + cargo : '',
    perKm ? perKm.toLocaleString('ru-RU') + ' ₽/км' : '',
    fuel.cost ? 'топливо ' + fuel.cost.toLocaleString('ru-RU') + ' ₽' : '',
    trip.car
  ].filter(Boolean).join(' · ');
}

function routeMetricsHtml(trip, mode = 'journal') {
  const totalKm = formatKm(trip.totalDistanceMeters);
  const cargoKm = formatKm(trip.cargoDistanceMeters || trip.routeDistanceMeters);
  const perKm = grossPerKm(trip);
  const fuel = fuelEstimate(trip);
  const parts = [
    totalKm ? '<span>Круг: <b>' + aEsc(totalKm) + '</b></span>' : '',
    cargoKm ? '<span>Груз: <b>' + aEsc(cargoKm) + '</b></span>' : '',
    perKm ? '<span><b>' + aEsc(perKm.toLocaleString('ru-RU')) + ' ₽/км</b></span>' : '',
    fuel.cost ? '<span>Топливо: <b>' + aEsc(fuel.cost.toLocaleString('ru-RU')) + ' ₽</b></span>' : ''
  ].filter(Boolean).join('');

  if (parts) return '<div class="' + mode + '-route-metrics">' + parts + '</div>';
  return '';
}

function parseKmValue(value) {
  const n = Number(String(value || '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function buildManualKmHtml(trip) {
  return '<div class="route-map-manual-km">' +
    '<label for="manualRouteKm">Круг, км</label>' +
    '<div>' +
      '<input id="manualRouteKm" inputmode="decimal" placeholder="например 264" value="' + aEsc(trip.totalDistanceMeters ? Math.round(trip.totalDistanceMeters / 1000) : '') + '">' +
    '</div>' +
    routeKmLoaderHtml(trip) +
    '<p>Топливо считается авто: 28л/100км, 1л-60руб</p>' +
  '</div>';
}

function routeKmLoaderHtml(trip) {
  return '<button id="manualRouteKmSaveBtn" class="route-km-loader-banner" type="button" onclick="saveManualRouteKmEncoded(&quot;' + routeMapId(trip.id) + '&quot;)">' +
    '<span class="route-km-loader">' +
      '<span class="route-truck-wrapper">' +
        '<span class="route-truck-body">' +
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 198 93" aria-hidden="true">' +
            '<path stroke-width="3" stroke="#282828" fill="#F83D3D" d="M135 22.5H177.264C178.295 22.5 179.22 23.133 179.594 24.0939L192.33 56.8443C192.442 57.1332 192.5 57.4404 192.5 57.7504V89C192.5 90.3807 191.381 91.5 190 91.5H135C133.619 91.5 132.5 90.3807 132.5 89V25C132.5 23.6193 133.619 22.5 135 22.5Z"></path>' +
            '<path stroke-width="3" stroke="#282828" fill="#7D7C7C" d="M146 33.5H181.741C182.779 33.5 183.709 34.1415 184.078 35.112L190.538 52.112C191.16 53.748 189.951 55.5 188.201 55.5H146C144.619 55.5 143.5 54.3807 143.5 53V36C143.5 34.6193 144.619 33.5 146 33.5Z"></path>' +
            '<path stroke-width="2" stroke="#282828" fill="#282828" d="M150 65C150 65.39 149.763 65.8656 149.127 66.2893C148.499 66.7083 147.573 67 146.5 67C145.427 67 144.501 66.7083 143.873 66.2893C143.237 65.8656 143 65.39 143 65C143 64.61 143.237 64.1344 143.873 63.7107C144.501 63.2917 145.427 63 146.5 63C147.573 63 148.499 63.2917 149.127 63.7107C149.763 64.1344 150 64.61 150 65Z"></path>' +
            '<rect stroke-width="2" stroke="#282828" fill="#FFFCAB" rx="1" height="7" width="5" y="63" x="187"></rect>' +
            '<rect stroke-width="2" stroke="#282828" fill="#282828" rx="1" height="11" width="4" y="81" x="193"></rect>' +
            '<rect stroke-width="3" stroke="#282828" fill="#DFDFDF" rx="2.5" height="90" width="121" y="1.5" x="6.5"></rect>' +
            '<rect stroke-width="2" stroke="#282828" fill="#DFDFDF" rx="2" height="4" width="6" y="84" x="1"></rect>' +
          '</svg>' +
        '</span>' +
        '<span class="route-truck-tires">' +
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 30 30" aria-hidden="true"><circle stroke-width="3" stroke="#282828" fill="#282828" r="13.5" cy="15" cx="15"></circle><circle fill="#DFDFDF" r="7" cy="15" cx="15"></circle></svg>' +
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 30 30" aria-hidden="true"><circle stroke-width="3" stroke="#282828" fill="#282828" r="13.5" cy="15" cx="15"></circle><circle fill="#DFDFDF" r="7" cy="15" cx="15"></circle></svg>' +
        '</span>' +
        '<span class="route-road"></span>' +
        '<svg class="route-lamp-post" viewBox="0 0 453.459 453.459" xmlns="http://www.w3.org/2000/svg" fill="#000000" aria-hidden="true">' +
          '<path d="M252.882,0c-37.781,0-68.686,29.953-70.245,67.358h-6.917v8.954c-26.109,2.163-45.463,10.011-45.463,19.366h9.993c-1.65,5.146-2.507,10.54-2.507,16.017c0,28.956,23.558,52.514,52.514,52.514c28.956,0,52.514-23.558,52.514-52.514c0-5.478-0.856-10.872-2.506-16.017h9.992c0-9.354-19.352-17.204-45.463-19.366v-8.954h-6.149C200.189,38.779,223.924,16,252.882,16c29.952,0,54.32,24.368,54.32,54.32c0,28.774-11.078,37.009-25.105,47.437c-17.444,12.968-37.216,27.667-37.216,78.884v113.914h-.797c-5.068,0-9.174,4.108-9.174,9.177c0,2.844,1.293,5.383,3.321,7.066c-3.432,27.933-26.851,95.744-8.226,115.459v11.202h45.75v-11.202c18.625-19.715-4.794-87.527-8.227-115.459c2.029-1.683,3.322-4.223,3.322-7.066c0-5.068-4.107-9.177-9.176-9.177h-.795V196.641c0-43.174,14.942-54.283,30.762-66.043c14.793-10.997,31.559-23.461,31.559-60.277C323.202,31.545,291.656,0,252.882,0zM232.77,111.694c0,23.442-19.071,42.514-42.514,42.514c-23.442,0-42.514-19.072-42.514-42.514c0-5.531,1.078-10.957,3.141-16.017h78.747C231.693,100.736,232.77,106.162,232.77,111.694z"></path>' +
        '</svg>' +
      '</span>' +
    '</span>' +
    '<span class="route-km-loader-copy"><b>Пересчитать маршрут</b><small>обновлю круг, топливо и прибыль</small></span>' +
  '</button>';
}

function ensureRouteMapModal() {
  let modal = document.getElementById('routeMapModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'routeMapModal';
  modal.className = 'route-map-modal';
  modal.innerHTML =
    '<div class="route-map-dialog">' +
      '<button class="route-map-close" onclick="closeRouteMapModal()" aria-label="Закрыть">×</button>' +
      '<div id="routeMapContent"></div>' +
    '</div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeRouteMapModal(); });
  return modal;
}

function closeRouteMapModal() {
  const modal = document.getElementById('routeMapModal');
  if (modal) modal.classList.remove('is-open');
}

function renderRouteMapModal(trip, stateText, errorText) {
  const modal = ensureRouteMapModal();
  const content = document.getElementById('routeMapContent');
  const widgetUrl = routeYandexWidgetUrl(trip);
  const route = trip.route || [trip.routeOrigin, trip.routeDestination].filter(Boolean).join(' - ');
  content.innerHTML =
    '<div class="route-map-head">' +
      '<div><div class="route-map-kicker">Маршрут</div><div class="route-map-title">№' + aEsc(trip.docNum || '—') + ' от ' + aEsc(formatIsoDate(trip.date)) + '</div></div>' +
      '<div class="route-map-sum">' + aEsc(money(trip.amount)) + '</div>' +
    '</div>' +
    '<div class="route-map-large">' +
      (widgetUrl
        ? '<iframe src="' + aEsc(widgetUrl) + '" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>'
        : '<div class="route-map-state">' + aEsc(stateText || 'Не хватает адресов для карты') + '</div>') +
    '</div>' +
    '' +
    '<div class="route-map-customer">' + aEsc(trip.customerName || 'Заказчик не указан') + '</div>' +
    '<div class="route-map-route">' + aEsc(route || 'Маршрут не указан') + '</div>' +
    routeMetricsHtml(trip, 'route-map') +
    '<div class="route-map-meta">' + aEsc(routeMapMeta(trip) || 'Детали маршрута появятся после построения') + '</div>' +
    (stateText ? '<div class="route-map-hint">' + aEsc(stateText) + '</div>' : '') +
    buildManualKmHtml(trip);
  modal.classList.add('is-open');
}

async function openRouteMapModal(tripId) {
  let trip = (driveCache || []).map(normalizeTrip).filter(Boolean).find(item => item.id === tripId);
  if (!trip) return;
  renderRouteMapModal(trip);
}

function openRouteMapModalEncoded(encodedTripId) {
  openRouteMapModal(decodeURIComponent(encodedTripId));
}

async function saveManualRouteKm(tripId) {
  const input = document.getElementById('manualRouteKm');
  const trigger = document.getElementById('manualRouteKmSaveBtn');
  const panel = trigger && trigger.closest('.route-map-manual-km');
  if (trigger && trigger.disabled) return;
  const km = parseKmValue(input && input.value);
  if (!km) {
    showToast('Укажи километраж круга');
    if (input) input.focus();
    return;
  }

  const currentTrips = (driveCache || []).map(normalizeTrip).filter(Boolean);
  const trip = currentTrips.find(item => item.id === tripId);
  if (!trip) {
    return;
  }

  if (trigger) {
    trigger.classList.add('is-calculating');
    trigger.disabled = true;
    trigger.setAttribute('aria-label', 'Считаю километраж и топливо');
    trigger.title = 'Считаю километраж и топливо';
  }
  if (panel) panel.classList.add('is-saving');
  if (input) input.disabled = true;
  await new Promise(resolve => requestAnimationFrame(resolve));

  const updatedTrip = normalizeTrip({
    ...trip,
    totalDistanceMeters: km * 1000,
    totalRouteUpdatedAt: new Date().toISOString(),
    routeMetricsSource: 'manual',
    fuelLitersPer100Km: DEFAULT_FUEL_LITERS_PER_100KM,
    fuelPriceRub: DEFAULT_FUEL_PRICE_RUB,
    fuelLiters: Math.round((km * DEFAULT_FUEL_LITERS_PER_100KM / 100) * 10) / 10,
    fuelCostRub: Math.round(km * DEFAULT_FUEL_LITERS_PER_100KM / 100 * DEFAULT_FUEL_PRICE_RUB)
  });

  if (!updatedTrip.cargoDistanceMeters && updatedTrip.routeDistanceMeters) {
    updatedTrip.cargoDistanceMeters = updatedTrip.routeDistanceMeters;
  }

  try {
    const registry = await loadTripsRegistry();
    const trips = mergeTrips([...(registry.trips || []), updatedTrip]).sort((a, b) => {
      const da = a.date || String(a.year || '');
      const db = b.date || String(b.year || '');
      return db.localeCompare(da);
    });

    await saveTripsRegistry({
      ...registry,
      version: TRIPS_REGISTRY_VERSION,
      updatedAt: new Date().toISOString(),
      source: 'manual-route-km',
      trips
    });

    driveCache = trips;
    renderDriveAnalytics(driveCache, analyticsYear, document.getElementById('analyticsPanel'));
    renderRouteMapModal(updatedTrip);
    showToast('✓ Километраж сохранён');
  } catch(e) {
    if (trigger) {
      trigger.classList.remove('is-calculating');
      trigger.disabled = false;
      trigger.setAttribute('aria-label', 'Сохранить километраж');
      trigger.title = 'Сохранить километраж';
    }
    if (panel) panel.classList.remove('is-saving');
    if (input) input.disabled = false;
    showToast('Не удалось сохранить километраж: ' + e.message);
  }
}

function saveManualRouteKmEncoded(encodedTripId) {
  saveManualRouteKm(decodeURIComponent(encodedTripId));
}

async function setTripPaymentType(tripId, paymentType) {
  const type = normalizePaymentType(paymentType);
  if (type === 'unknown') return;

  const currentTrips = (driveCache || []).map(normalizeTrip).filter(Boolean);
  const trip = currentTrips.find(item => item.id === tripId);
  if (!trip) return;

  const updatedTrip = normalizeTrip({
    ...trip,
    paymentType: type,
    paymentUpdatedAt: new Date().toISOString()
  });

  try {
    const registry = await loadTripsRegistry();
    const trips = mergeTrips([...(registry.trips || []), updatedTrip]).sort((a, b) => {
      const da = a.date || String(a.year || '');
      const db = b.date || String(b.year || '');
      return db.localeCompare(da);
    });

    await saveTripsRegistry({
      ...registry,
      version: TRIPS_REGISTRY_VERSION,
      updatedAt: new Date().toISOString(),
      source: 'payment-type',
      trips
    });

    driveCache = trips;
    renderDriveAnalytics(driveCache, analyticsYear, document.getElementById('analyticsPanel'));
    showToast('✓ Оплата: ' + paymentLabel(type));
  } catch (e) {
    showToast('Не удалось сохранить тип оплаты: ' + e.message);
  }
}

function setTripPaymentTypeEncoded(encodedTripId, paymentType) {
  setTripPaymentType(decodeURIComponent(encodedTripId), paymentType);
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

function deleteTripFromRegistryEncoded(encodedTripId) {
  deleteTripFromRegistry(decodeURIComponent(encodedTripId));
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
  const totalNet = filtered.reduce((sum, e) => sum + netProfit(e), 0);
  const totalFuel = filtered.reduce((sum, e) => sum + fuelEstimate(e).cost, 0);
  const avgAmt = totalRides ? Math.round(totalAmt / totalRides) : 0;
  const taxRows = selectedYear ? filtered : currentYearTrips(trips);
  const totalTax = sumUsnTax(taxRows);
  const totalAfterTax = sumNetAfterTax(taxRows);
  const taxHint = selectedYear ? 'УСН за ' + selectedYear : 'УСН с начала года';
  const afterTaxHint = selectedYear ? 'за ' + selectedYear : 'с начала года';
  const missingDistanceRows = filtered.filter(needsDistance);
  const paymentStats = paymentSummary(filtered);
  const monthly = Array(12).fill(0);
  const monthlyMoney = Array(12).fill(0);
  const monthlyTax = Array(12).fill(0);
  const monthlyAfterTax = Array(12).fill(0);
  filtered.forEach(e => {
    if (e.month >= 1 && e.month <= 12) {
      monthly[e.month - 1]++;
      monthlyMoney[e.month - 1] += e.amount || 0;
    }
  });
  taxRows.forEach(e => {
    if (e.month >= 1 && e.month <= 12) {
      monthlyTax[e.month - 1] += usnTax(e);
      monthlyAfterTax[e.month - 1] += netAfterTax(e);
    }
  });
  const maxM = Math.max(...monthly, 1);
  const maxMonthMoney = Math.max(...monthlyMoney, 1);
  const maxMonthTax = Math.max(...monthlyTax, 1);
  const monthNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

  const customerRows = filtered.filter(e => e.customerName && !isExecutorCustomer(e.customerName, e.customerInn));
  const customerStats = groupStats(customerRows, e => e.customerName);
  const topByTrips = customerStats.slice().sort((a, b) => b.count - a.count).slice(0, 5);
  const topByMoney = customerStats.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
  const routeStats = groupStats(filtered.filter(e => e.route), e => e.route).sort((a, b) => b.count - a.count).slice(0, 5);
  const topRoutesByMoney = groupStats(filtered.filter(e => e.route), e => e.route).sort((a, b) => b.amount - a.amount).slice(0, 3);
  const yearStats = years.map(y => {
    const rows = trips.filter(e => e.year === y);
    return {
      name: String(y),
      count: rows.length,
      amount: rows.reduce((s, e) => s + e.amount, 0),
      net: rows.reduce((s, e) => s + netProfit(e), 0),
      fuel: rows.reduce((s, e) => s + fuelEstimate(e).cost, 0),
      tax: rows.reduce((s, e) => s + usnTax(e), 0),
      afterTax: rows.reduce((s, e) => s + netAfterTax(e), 0)
    };
  });

  const maxYearCount = Math.max(...yearStats.map(s => s.count), 1);
  const maxYearAmount = Math.max(...yearStats.map(s => s.amount), 1);
  const maxTopTrips = Math.max(...topByTrips.map(s => s.count), 1);
  const maxTopMoney = Math.max(...topByMoney.map(s => s.amount), 1);
  const maxRoutes = Math.max(...routeStats.map(s => s.count), 1);
  if (!['overview', 'journal'].includes(analyticsView)) analyticsView = 'overview';

  const overviewHtml =
    '<div class="dash-hero-grid">' +
      dashboardHeroCard('Оборот', money(totalAmt), 'по выбранному периоду', '↗', 'turnover') +
      dashboardHeroCard('Чистая прибыль', money(totalNet), 'после топлива', '↗', 'profit') +
      dashboardHeroCard('После налога', money(totalAfterTax), afterTaxHint, '6%', 'rate') +
    '</div>' +
    '<div class="dash-mini-grid">' +
      dashboardMetricCard('🚚', totalRides, 'рейсов', 'закрыто в периоде') +
      dashboardMetricCard('🧾', money(avgAmt), 'средний чек', 'оборот / рейсы') +
      dashboardMetricCard('⛽', money(totalFuel), 'топливо', '28л/100км, 60 руб/л') +
      dashboardMetricCard('6%', money(totalTax), 'налоги', taxHint) +
    '</div>' +
    distanceWarningPanel(missingDistanceRows) +
    aiAnalyticsPanel(filtered, topByMoney, topRoutesByMoney, totalNet, avgAmt) +
    '<div class="dash-grid-2">' +
      dashboardTurnoverChart(monthlyMoney, maxMonthMoney, monthNames) +
      expenseStructureCard(totalFuel, totalNet) +
    '</div>' +
    dashboardTaxChart(monthlyTax, monthlyAfterTax, maxMonthTax, monthNames, selectedYear) +
    '<div class="dash-grid-2">' +
      dashboardTopList('Топ заказчики', topByMoney.slice(0, 3), row => row.count + ' рейс.', row => money(row.amount)) +
      dashboardTopList('Топ маршруты', topRoutesByMoney, row => row.count + ' рейс.', row => money(row.amount)) +
    '</div>' +
    sectionTitle('Оплата') +
    paymentSummaryHtml(paymentStats) +
    sectionTitle('Кратко по годам') +
    overviewYearsChart(yearStats.slice(0, 4), maxYearAmount);

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
    journal: journalHtml
  }[analyticsView];

  panel.innerHTML =
    '<div class="dc" style="--acc:' + ANALYTICS_GREEN + ';--ana:' + ANALYTICS_GREEN + ';--ana2:' + ANALYTICS_GREEN_DARK + ';--ana-bg:#151b2a;--ana-card:#171d2c;--ana-card2:#1b2233;--ana-text:#f8fbff;--ana-muted:#9ba6bd;padding:18px;margin-bottom:0;background:#151b2a;border-color:rgba(120,139,180,.22);box-shadow:0 18px 42px rgba(0,0,0,.22)">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px">' +
        '<div style="font-family:monospace;font-size:10px;letter-spacing:0;color:var(--ana);font-weight:700">АРХИВ DRIVE - АНАЛИТИКА</div>' +
        '<button onclick="rebuildTripsRegistry()" style="background:rgba(255,255,255,.045);color:var(--ana-muted);border:1px solid rgba(137,104,190,.35);border-radius:8px;padding:5px 10px;font-size:10px;font-family:monospace;letter-spacing:0;cursor:pointer;transition:.18s ease">ПЕРЕСОБРАТЬ</button>' +
      '</div>' +
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px">' +
        [0, ...years].map(y => yearButton(y, selectedYear)).join('') +
      '</div>' +
      '<div class="analytics-tabs">' +
        viewButton('overview', 'Обзор') +
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

function dashboardHeroCard(label, value, hint, trend, tone) {
  const visual = {
    turnover: '<div class="dash-money-visual"><i></i><i></i><i></i></div>',
    profit: '<div class="dash-fuel-visual"><i></i><span></span></div>',
    rate: '<div class="dash-chart-visual"><i></i><i></i><i></i><span></span></div>'
  }[tone] || '';
  return '<div class="dash-hero-card ' + aEsc(tone || '') + '">' +
    '<div class="dash-hero-visual" aria-hidden="true">' + visual + '</div>' +
    '<div class="dash-hero-head"><span>' + aEsc(label) + '</span><span>' + aEsc(hint) + '</span></div>' +
    '<div class="dash-hero-value">' + aEsc(value) + '</div>' +
    '<div class="dash-hero-scale"><span>' + aEsc(trend) + '</span></div>' +
  '</div>';
}

function dashboardMetricCard(icon, value, label, hint) {
  return '<div class="dash-metric-card">' +
    '<div class="dash-metric-icon">' + icon + '</div>' +
    '<b>' + aEsc(value) + '</b>' +
    '<span>' + aEsc(label) + '</span>' +
    '<small>' + aEsc(hint) + '</small>' +
  '</div>';
}

function dashboardTurnoverChart(values, max, labels) {
  const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return '<div class="dash-panel">' +
    '<div class="dash-panel-head"><b>Динамика оборота</b><span>' + aEsc(money(total)) + '</span></div>' +
    '<div class="dash-bars">' +
      values.map((value, i) => {
        const h = value ? Math.max(8, Math.round(value / (max || 1) * 118)) : 3;
        return '<div class="dash-bar-col" title="' + aEsc(money(value)) + '">' +
          '<em style="height:' + h + 'px"><strong>' + (value ? aEsc(shortMoney(value)) : '') + '</strong></em>' +
          '<small>' + aEsc(labels[i]) + '</small>' +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function dashboardTaxChart(taxValues, afterTaxValues, max, labels, selectedYear) {
  const totalTax = taxValues.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalAfterTax = afterTaxValues.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const caption = selectedYear ? 'УСН за ' + selectedYear : 'УСН с начала года';
  return '<div class="dash-panel dash-tax-panel">' +
    '<div class="dash-panel-head"><b>Налоги по месяцам</b><span>' + aEsc(caption) + '</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px">' +
      '<span style="border:1px solid rgba(57,217,138,.24);border-radius:10px;background:rgba(57,217,138,.08);padding:10px;min-width:0"><b style="display:block;color:#fff;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + aEsc(money(totalTax)) + '</b><small style="display:block;margin-top:4px;color:var(--ana-muted);font-size:10px">УСН 6%</small></span>' +
      '<span style="border:1px solid rgba(79,124,255,.24);border-radius:10px;background:rgba(79,124,255,.08);padding:10px;min-width:0"><b style="display:block;color:#fff;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + aEsc(money(totalAfterTax)) + '</b><small style="display:block;margin-top:4px;color:var(--ana-muted);font-size:10px">после налога</small></span>' +
    '</div>' +
    '<div class="dash-bars dash-tax-bars">' +
      taxValues.map((value, i) => {
        const h = value ? Math.max(8, Math.round(value / (max || 1) * 96)) : 3;
        return '<div class="dash-bar-col" title="' + aEsc(money(value)) + '">' +
          '<em style="height:' + h + 'px"><strong>' + (value ? aEsc(shortMoney(value)) : '') + '</strong></em>' +
          '<small>' + aEsc(labels[i]) + '</small>' +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function distanceWarningPanel(rows) {
  if (!rows.length) return '';
  const examples = rows.slice(0, 3).map(row => '№' + (row.docNum || '—')).join(', ');
  const more = rows.length > 3 ? ' +' + (rows.length - 3) : '';
  return '<div style="border:1px solid rgba(255,190,90,.34);border-radius:12px;background:linear-gradient(135deg,rgba(255,190,90,.12),rgba(255,255,255,.035));padding:11px 12px;margin:0 0 12px;box-shadow:0 12px 26px rgba(0,0,0,.12)">' +
    '<b style="display:block;color:#ffd79a;font-size:12px;line-height:1.25">Требуется километраж: ' + aEsc(rows.length) + '</b>' +
    '<span style="display:block;margin-top:5px;color:rgba(248,251,255,.68);font-size:11px;line-height:1.4">У этих рейсов прибыль, налоги и “после налога” могут быть завышены: ' + aEsc(examples + more) + '</span>' +
  '</div>';
}

function expenseStructureCard(fuel, net) {
  const expenses = Math.max(0, fuel);
  const total = expenses + Math.max(0, net);
  const fuelPct = total ? Math.round(expenses / total * 100) : 0;
  return '<div class="dash-panel">' +
    '<div class="dash-panel-head"><b>Структура денег</b><span>топливо / чистая</span></div>' +
    '<div class="dash-expense">' +
      '<div class="dash-donut" style="--fuel:' + fuelPct + '%"><b>' + aEsc(money(total)) + '</b><span>всего</span></div>' +
      '<div class="dash-expense-list">' +
        dashExpenseRow('Топливо', fuel, fuelPct, '#39d98a') +
        dashExpenseRow('Чистая прибыль', net, 100 - fuelPct, '#4f7cff') +
      '</div>' +
    '</div>' +
  '</div>';
}

function dashExpenseRow(label, value, pctValue, color) {
  return '<div class="dash-expense-row">' +
    '<i style="background:' + color + '"></i>' +
    '<span>' + aEsc(label) + '</span>' +
    '<b>' + aEsc(money(value)) + '</b>' +
    '<small>' + aEsc(pctValue) + '%</small>' +
  '</div>';
}

function dashboardTopList(title, rows, sub, val) {
  if (!rows.length) return '<div class="dash-panel">' +
    '<div class="dash-panel-head"><b>' + aEsc(title) + '</b><span>нет данных</span></div>' +
    emptyAnalyticsText('Данные появятся после распознавания рейсов.') +
  '</div>';
  return '<div class="dash-panel">' +
    '<div class="dash-panel-head"><b>' + aEsc(title) + '</b><span>топ</span></div>' +
    '<div class="dash-top-list">' +
      rows.map((row, i) => '<div class="dash-top-row">' +
        '<em>' + (i + 1) + '</em>' +
        '<span><b>' + aEsc(row.name) + '</b><small>' + aEsc(sub(row)) + '</small></span>' +
        '<strong>' + aEsc(val(row)) + '</strong>' +
      '</div>').join('') +
    '</div>' +
  '</div>';
}

function aiAnalyticsPanel(rows, customers, routes, totalNet, avgAmt) {
  const bestCustomer = customers[0];
  const bestRoute = routes[0];
  const bestMonth = bestMonthByAmount(rows);
  return '<div class="dash-ai-panel">' +
    '<div class="dash-ai-copy">' +
      '<div class="dash-panel-head"><b>AI-аналитика</b><span>обзор</span></div>' +
      aiInsight('↗', totalNet ? 'Чистая прибыль периода ' + money(totalNet) : 'Чистая прибыль пока не рассчитана', 'после пересчета топлива') +
      aiInsight('🏆', bestRoute ? 'Самый денежный маршрут' : 'Маршруты пока не распознаны', bestRoute ? bestRoute.name + ' · ' + money(bestRoute.amount) : 'появится после обновления реестра') +
      aiInsight('▥', bestCustomer ? 'Ключевой заказчик: ' + bestCustomer.name : 'Заказчики пока не распознаны', bestCustomer ? money(bestCustomer.amount) + ' · ' + bestCustomer.count + ' рейс.' : 'проверь trips.json') +
      aiInsight('◷', bestMonth ? 'Сильный месяц: ' + bestMonth.label : 'Месячная динамика без данных', bestMonth ? money(bestMonth.amount) + ', средний чек ' + money(avgAmt) : 'нужно больше рейсов') +
    '</div>' +
    '<div class="dash-ai-orb"><span></span></div>' +
  '</div>';
}

function aiInsight(icon, title, text) {
  return '<div class="dash-ai-row"><i>' + icon + '</i><span><b>' + aEsc(title) + '</b><small>' + aEsc(text) + '</small></span></div>';
}

function bestMonthByAmount(rows) {
  const labels = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const values = Array(12).fill(0);
  rows.forEach(row => { if (row.month >= 1 && row.month <= 12) values[row.month - 1] += row.amount || 0; });
  const amount = Math.max(...values);
  const index = values.indexOf(amount);
  return amount > 0 ? { label: labels[index], amount } : null;
}

function shortMoney(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return Math.round(n / 100000) / 10 + 'м';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + 'к';
  return String(n);
}

function paymentSummary(rows) {
  return rows.reduce((stat, trip) => {
    const type = normalizePaymentType(trip.paymentType);
    stat.total += trip.amount || 0;
    stat[type] += trip.amount || 0;
    stat.counts[type] += 1;
    return stat;
  }, { total: 0, bank: 0, cash: 0, unknown: 0, counts: { bank: 0, cash: 0, unknown: 0 } });
}

function paymentSummaryHtml(stat) {
  return '<div class="payment-summary">' +
    paymentSummaryCard('Всего', stat.total, '') +
    paymentSummaryCard('Перевод', stat.bank, stat.counts.bank + ' рейс.') +
    paymentSummaryCard('Наличные', stat.cash, stat.counts.cash + ' рейс.') +
    paymentSummaryCard('Не указано', stat.unknown, stat.counts.unknown + ' рейс.') +
  '</div>';
}

function paymentSummaryCard(label, value, hint) {
  return '<div class="payment-summary-card">' +
    '<b>' + aEsc(money(value)) + '</b>' +
    '<span>' + aEsc(label) + '</span>' +
    (hint ? '<small>' + aEsc(hint) + '</small>' : '') +
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

function overviewYearsChart(rows, maxAmount) {
  if (!rows.length) return emptyAnalyticsText('По годам пока нет данных.');
  return '<div class="overview-year-chart">' +
    rows.map(row => {
      const width = Math.max(8, Math.round((row.amount || 0) / (maxAmount || 1) * 100));
      return '<div class="overview-year-card">' +
        '<div class="overview-year-name">' + aEsc(row.name) + '</div>' +
        '<div class="overview-year-main">' +
          '<div class="overview-year-bar"><div class="overview-year-fill" style="--w:' + width + '%"></div></div>' +
          '<div class="overview-year-meta">' +
            '<span>' + aEsc(row.count) + ' рейсов</span>' +
            '<span>чистая ' + aEsc(money(row.net)) + '</span>' +
            '<span>УСН ' + aEsc(money(row.tax)) + '</span>' +
            '<span>после налога ' + aEsc(money(row.afterTax)) + '</span>' +
            '<span>бензин ' + aEsc(money(row.fuel)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="overview-year-money">' +
          '<b>' + aEsc(money(row.amount)) + '</b>' +
          '<span>оборот</span>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function analyticsJournal(rows) {
  const sorted = rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!sorted.length) return emptyAnalyticsText('В выбранном периоде нет записей trips.json.');

  return sectionTitle('Журнал trips.json') +
    '<div class="journal-trip-list">' +
      sorted.map(trip => {
        const num = trip.docNum || '—';
        const date = formatIsoDate(trip.date);
        const amount = money(trip.amount);
        const net = money(netProfit(trip));
        const tax = usnTax(trip);
        const afterTax = netAfterTax(trip);
        const afterTaxMoney = money(afterTax);
        const fuel = fuelEstimate(trip);
        const totalKm = formatKm(trip.totalDistanceMeters);
        const perKm = grossPerKm(trip);
        const paymentType = normalizePaymentType(trip.paymentType);
        const distanceMissing = needsDistance(trip);
        const customer = trip.customerName || 'Заказчик не указан';
        const route = trip.route || 'Маршрут не указан';
        const encodedId = routeMapId(trip.id);
        const keyHandler = 'if(event.key===&quot;Enter&quot;||event.key===&quot; &quot;){event.preventDefault();openRouteMapModalEncoded(&quot;' + encodedId + '&quot;)}';
        const files = [
          trip.invoiceFileId ? 'счёт PDF' : '',
          trip.actFileId ? 'акт PDF' : ''
        ].filter(Boolean).join(' · ') || 'PDF не привязаны';

        return '<div class="journal-trip-card' + (distanceMissing ? ' needs-distance' : '') + '" ' + (distanceMissing ? 'style="border-color:rgba(255,190,90,.58);box-shadow:0 16px 34px rgba(0,0,0,.24),0 0 24px rgba(255,190,90,.1),inset 0 1px 0 rgba(255,255,255,.05)" ' : '') + 'role="button" tabindex="0" title="Открыть карту маршрута" onclick="openRouteMapModalEncoded(&quot;' + encodedId + '&quot;)" onkeydown="' + keyHandler + '">' +
          '<div class="journal-trip-main">' +
            '<div style="min-width:0">' +
              '<div class="journal-trip-kicker">№' + aEsc(num) + ' · ' + aEsc(date) + '</div>' +
              '<div class="journal-trip-title" title="' + aEsc(customer) + '">' + aEsc(customer) + '</div>' +
              '<div class="journal-trip-route" title="' + aEsc(route) + '">' + aEsc(route) + '</div>' +
            '</div>' +
            '<div class="journal-trip-money"><b>' + aEsc(amount) + '</b><span>оборот</span><small style="display:block;margin-top:5px;color:var(--ana);font-size:10px;white-space:nowrap">после налога ' + aEsc(afterTaxMoney) + '</small></div>' +
          '</div>' +
          '<div class="journal-trip-strip">' +
            '<span>топливо <b>' + aEsc(money(fuel.cost)) + '</b></span>' +
            '<span>чистая <b>' + aEsc(net) + '</b></span>' +
            '<span>УСН 6% <b>' + aEsc(money(tax)) + '</b></span>' +
            '<span>итог <b>' + aEsc(afterTaxMoney) + '</b></span>' +
            '<span>' + (totalKm ? 'круг <b>' + aEsc(totalKm) + '</b>' : 'км не указан') + '</span>' +
            (perKm ? '<span><b>' + aEsc(perKm.toLocaleString('ru-RU')) + ' ₽/км</b></span>' : '') +
            '<span>оплата <b>' + aEsc(paymentLabel(paymentType)) + '</b></span>' +
          '</div>' +
          '<div class="journal-payment" onclick="event.stopPropagation()">' +
            '<button class="' + (paymentType === 'bank' ? 'is-active' : '') + '" onclick="setTripPaymentTypeEncoded(&quot;' + encodedId + '&quot;,&quot;bank&quot;)">Перевод</button>' +
            '<button class="' + (paymentType === 'cash' ? 'is-active' : '') + '" onclick="setTripPaymentTypeEncoded(&quot;' + encodedId + '&quot;,&quot;cash&quot;)">Наличные</button>' +
          '</div>' +
          '<div class="journal-trip-more"><b>' + (distanceMissing ? 'Нужен км' : 'Детали рейса') + '</b>' + aEsc(files) + (trip.car ? ' · ' + aEsc(trip.car) : '') + (distanceMissing ? ' · прибыль рассчитана без топлива' : '') + '</div>' +
          '<button class="journal-trip-delete" title="Удалить рейс" aria-label="Удалить рейс" onclick="event.stopPropagation();deleteTripFromRegistryEncoded(&quot;' + encodeURIComponent(trip.id) + '&quot;)">' +
            '<svg viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7 128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32h384c17.7 0 32-14.3 32-32s-14.3-32-32-32h-96l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32l21.2 339c1.6 25.3 22.6 45 47.9 45h245.8c25.3 0 46.3-19.7 47.9-45L416 128z"></path></svg>' +
          '</button>' +
        '</div>';
      }).join('') +
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
window.deleteTripFromRegistryEncoded = deleteTripFromRegistryEncoded;
window.openRouteMapModal = openRouteMapModal;
window.openRouteMapModalEncoded = openRouteMapModalEncoded;
window.saveManualRouteKm = saveManualRouteKm;
window.saveManualRouteKmEncoded = saveManualRouteKmEncoded;
window.setTripPaymentType = setTripPaymentType;
window.setTripPaymentTypeEncoded = setTripPaymentTypeEncoded;
window.closeRouteMapModal = closeRouteMapModal;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAnalyticsButton);
} else {
  bindAnalyticsButton();
}
