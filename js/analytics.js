// Analytics: fast Drive registry + one-time PDF archive scan

const TRIPS_REGISTRY_NAME = 'trips.json';
const TRIPS_REGISTRY_VERSION = 6;
const EXECUTOR_MARKERS = ['Карпов', '771313296859', '40802810438000085714', 'Керамический', 'СБЕРБАНК'];
const ANALYTICS_GREEN = '#39d98a';
const ANALYTICS_GREEN_DARK = '#1f9d63';
const DEFAULT_FUEL_PRICE_RUB = 60;
const DEFAULT_FUEL_LITERS_PER_100KM = 25;
const PAYMENT_TYPES = {
  bank: 'Банковский перевод',
  cash: 'Наличные',
  unknown: 'Не указано'
};

let analyticsRegistryFileId = null;
let analyticsView = 'overview';
let yandexMapsLoadPromise = null;

function routeEndpointParts(route) {
  const parts = String(route || '').split(/\s+-\s+/).map(cleanText).filter(Boolean);
  return {
    origin: parts[0] || '',
    destination: parts.slice(1).join(' - ') || ''
  };
}

function routeMapId(value) {
  return encodeURIComponent(String(value || ''));
}

function routeBaseAddress() {
  return typeof ROUTE_BASE_ADDRESS !== 'undefined' ? cleanText(ROUTE_BASE_ADDRESS) : '';
}

function routePoints(trip, includeBase = true) {
  const origin = trip.routeOrigin || routeEndpointParts(trip.route).origin;
  const destination = trip.routeDestination || routeEndpointParts(trip.route).destination;
  const base = includeBase ? routeBaseAddress() : '';
  return [base, origin, destination, base].filter(Boolean);
}

function routeRtext(points) {
  return points.map(point => encodeURIComponent(point)).join('~');
}

function formatKm(meters) {
  const value = Math.round(Number(meters) || 0);
  return value ? Math.round(value / 1000).toLocaleString('ru-RU') + ' км' : '';
}

function grossPerKm(trip) {
  const km = (Number(trip.totalDistanceMeters) || 0) / 1000;
  return km && trip.amount ? Math.round(trip.amount / km) : 0;
}

function fuelEstimate(trip) {
  const km = (Number(trip.totalDistanceMeters) || 0) / 1000;
  const amount = Number(trip.amount) || 0;
  if (!km) {
    const cost = Number(trip.fuelCostRub) || 0;
    return { liters: Number(trip.fuelLiters) || 0, cost, net: Math.round(amount - cost) };
  }
  const litersPer100 = Number(trip.fuelLitersPer100Km || DEFAULT_FUEL_LITERS_PER_100KM) || DEFAULT_FUEL_LITERS_PER_100KM;
  const price = Number(trip.fuelPriceRub || DEFAULT_FUEL_PRICE_RUB) || DEFAULT_FUEL_PRICE_RUB;
  const liters = Number(trip.fuelLiters) || km * litersPer100 / 100;
  const cost = Number(trip.fuelCostRub) || liters * price;
  const net = Math.round(amount - cost);
  return {
    liters: Math.round(liters * 10) / 10,
    cost: Math.round(cost),
    net
  };
}

function netProfit(trip) {
  return fuelEstimate(trip).net;
}

function normalizePaymentType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['cash', 'nal', 'нал', 'наличные', 'наличка'].includes(raw)) return 'cash';
  if (['bank', 'transfer', 'wire', 'перевод', 'банковский перевод', 'безнал', 'безналичные'].includes(raw)) return 'bank';
  return 'unknown';
}

function paymentLabel(type) {
  return PAYMENT_TYPES[normalizePaymentType(type)] || PAYMENT_TYPES.unknown;
}

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
    '<p>Топливо считается авто: 25л/100км, 1л-60руб</p>' +
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
  const profitRate = totalAmt ? Math.round(totalNet / totalAmt * 1000) / 10 : 0;
  const profitPerTrip = totalRides ? Math.round(totalNet / totalRides) : 0;
  const paymentStats = paymentSummary(filtered);
  const monthly = Array(12).fill(0);
  const monthlyMoney = Array(12).fill(0);
  filtered.forEach(e => {
    if (e.month >= 1 && e.month <= 12) {
      monthly[e.month - 1]++;
      monthlyMoney[e.month - 1] += e.amount || 0;
    }
  });
  const maxM = Math.max(...monthly, 1);
  const maxMonthMoney = Math.max(...monthlyMoney, 1);
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
      fuel: rows.reduce((s, e) => s + fuelEstimate(e).cost, 0)
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
      dashboardHeroCard('Рентабельность', (profitRate ? profitRate.toLocaleString('ru-RU') : '0') + '%', 'чистая / оборот', '↑', 'rate') +
    '</div>' +
    '<div class="dash-mini-grid">' +
      dashboardMetricCard('🚚', totalRides, 'рейсов', 'закрыто в периоде') +
      dashboardMetricCard('🧾', money(avgAmt), 'средний чек', 'оборот / рейсы') +
      dashboardMetricCard('⛽', money(totalFuel), 'бензин', '25л/100км, 60 руб/л') +
      dashboardMetricCard('📈', money(profitPerTrip), 'прибыль с рейса', 'чистая / рейсы') +
    '</div>' +
    aiAnalyticsPanel(filtered, topByMoney, topRoutesByMoney, profitRate, avgAmt) +
    '<div class="dash-grid-2">' +
      dashboardTurnoverChart(monthlyMoney, maxMonthMoney, monthNames) +
      expenseStructureCard(totalFuel, totalNet) +
    '</div>' +
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
    '<style>' +
      '@keyframes analyticsViewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '@keyframes yearChartIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes yearBarGrow{from{transform:scaleX(.04);filter:saturate(.8)}to{transform:scaleX(1);filter:saturate(1.1)}}@keyframes yearCardShine{from{transform:translateX(-130%)}to{transform:translateX(130%)}}' +
      '.dash-hero-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px}.dash-hero-card{position:relative;min-height:214px;padding:22px;border:1px solid rgba(79,124,255,.24);border-radius:23px;background:radial-gradient(160% 105% at 24% 105%,rgba(255,247,177,.22) 0%,rgba(255,255,255,0) 68%),linear-gradient(145deg,rgba(28,36,58,.94),rgba(15,13,24,.98));box-shadow:0 30px 54px rgba(0,0,0,.18),0 10px 22px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden;cursor:default;transition:transform .8s cubic-bezier(.15,.83,.66,1),box-shadow .8s cubic-bezier(.15,.83,.66,1),border-color .8s cubic-bezier(.15,.83,.66,1)}.dash-hero-card:hover{transform:scale(1.035);border-color:rgba(255,247,177,.38);box-shadow:0 40px 66px rgba(0,0,0,.24),0 0 36px rgba(255,247,177,.08),inset 0 1px 0 rgba(255,255,255,.08)}.dash-hero-weather{position:absolute;right:-36px;top:-52px;width:250px;height:250px;display:flex;align-items:center;justify-content:center;transform:scale(.55);opacity:.82}.dash-hero-cloud{position:absolute;width:250px}.dash-hero-cloud.front{padding-top:45px;margin-left:25px;z-index:11;animation:dashClouds 8s ease-in-out infinite}.dash-hero-cloud.back{margin-top:-30px;margin-left:150px;z-index:12;animation:dashClouds 12s ease-in-out infinite}.dash-cloud-left-front{width:65px;height:65px;border-radius:50% 50% 0 50%;background:#4c9beb;display:inline-block}.dash-cloud-right-front{width:45px;height:45px;border-radius:50% 50% 50% 0;background:#4c9beb;display:inline-block;margin-left:-25px}.dash-cloud-left-back{width:30px;height:30px;border-radius:50% 50% 0 50%;background:#4c9beb;display:inline-block}.dash-cloud-right-back{width:50px;height:50px;border-radius:50% 50% 50% 0;background:#4c9beb;display:inline-block;margin-left:-20px}.dash-hero-sun{width:120px;height:120px;border-radius:60px;background:linear-gradient(to right,#fcbb04,#fffc00);position:absolute;box-shadow:0 0 42px rgba(252,187,4,.22)}.dash-hero-sun.shine{animation:dashSunshine 2s infinite}.dash-hero-card.profit .dash-hero-sun{background:linear-gradient(to right,#39d98a,#baff6b)}.dash-hero-card.rate .dash-hero-sun{background:linear-gradient(to right,#4f7cff,#57f4ff)}.dash-hero-head{position:relative;z-index:13;display:flex;flex-direction:column;gap:8px;max-width:72%}.dash-hero-head span:first-child{font-weight:800;font-size:12px;line-height:1.35;text-transform:uppercase;letter-spacing:.12em;color:rgba(248,251,255,.66)}.dash-hero-head span:last-child{font-weight:700;font-size:11px;line-height:1.35;color:rgba(248,251,255,.38)}.dash-hero-value{position:absolute;z-index:13;left:22px;right:100px;bottom:18px;color:#fff;font-weight:800;font-size:clamp(24px,3vw,36px);line-height:1.06;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 20px rgba(255,247,177,.08)}.dash-hero-scale{position:absolute;z-index:13;right:20px;bottom:22px;min-width:72px;height:34px;padding:0 10px;display:flex;align-items:center;justify-content:center;border-radius:9px;background:rgba(255,255,255,.06);backdrop-filter:blur(8px);color:rgba(248,251,255,.66);font-weight:800;font-size:12px}.dash-mini-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.dash-metric-card,.dash-panel,.dash-ai-panel{position:relative;overflow:hidden;border:1px solid rgba(79,124,255,.22);border-radius:12px;background:linear-gradient(145deg,rgba(28,35,56,.7),rgba(18,15,29,.9));box-shadow:0 14px 30px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.045)}.dash-metric-card{padding:14px 12px;min-width:0}.dash-metric-icon{font-size:20px;margin-bottom:10px;filter:drop-shadow(0 0 14px rgba(57,217,138,.22))}.dash-metric-card b{display:block;color:#fff;font-size:17px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-metric-card span{display:block;margin-top:7px;color:var(--ana-text);font-size:11px;font-weight:750}.dash-metric-card small{display:block;margin-top:5px;color:var(--ana-muted);font-size:9px;line-height:1.28}.dash-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.dash-panel{padding:14px}.dash-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px}.dash-panel-head b{color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.dash-panel-head span{border:1px solid rgba(248,251,255,.1);border-radius:999px;padding:4px 8px;color:var(--ana-muted);font-size:9px}.dash-bars{height:168px;display:flex;align-items:flex-end;gap:8px;padding:12px 4px 0;border-bottom:1px solid rgba(255,255,255,.08)}.dash-bar-col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:7px}.dash-bar-col em{position:relative;width:100%;max-width:28px;min-height:3px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#57f4a8,#27b36f);box-shadow:0 10px 22px rgba(57,217,138,.18);transform-origin:bottom;animation:yearBarGrow .8s cubic-bezier(.2,.8,.2,1) both}.dash-bar-col strong{position:absolute;left:50%;top:-16px;transform:translateX(-50%);font-size:8px;color:var(--ana);font-style:normal;white-space:nowrap}.dash-bar-col small{color:var(--ana-muted);font-size:9px}.dash-expense{display:grid;grid-template-columns:146px minmax(0,1fr);gap:14px;align-items:center}.dash-donut{width:138px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;text-align:center;background:conic-gradient(#39d98a 0 var(--fuel),#4f7cff var(--fuel) 100%);box-shadow:0 0 28px rgba(57,217,138,.14);position:relative}.dash-donut:before{content:"";position:absolute;inset:20px;border-radius:50%;background:#151426;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}.dash-donut b,.dash-donut span{position:relative;z-index:1}.dash-donut b{color:#fff;font-size:15px;line-height:1.1}.dash-donut span{display:block;margin-top:3px;color:var(--ana-muted);font-size:10px}.dash-expense-list{display:grid;gap:9px}.dash-expense-row{display:grid;grid-template-columns:9px minmax(0,1fr) auto 34px;align-items:center;gap:8px;color:var(--ana-muted);font-size:10px}.dash-expense-row i{width:7px;height:7px;border-radius:50%}.dash-expense-row span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-expense-row b{color:var(--ana-text);font-size:11px;white-space:nowrap}.dash-expense-row small{text-align:right;color:var(--ana-muted)}.dash-ai-panel{display:grid;grid-template-columns:minmax(0,1.2fr) 190px;gap:14px;padding:14px;margin:12px 0}.dash-ai-copy{min-width:0}.dash-ai-row{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:start;margin-top:12px}.dash-ai-row i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(57,217,138,.11);color:var(--ana);font-style:normal;box-shadow:0 0 18px rgba(57,217,138,.08)}.dash-ai-row b{display:block;color:#fff;font-size:12px;line-height:1.25}.dash-ai-row small{display:block;margin-top:3px;color:var(--ana-muted);font-size:10px;line-height:1.35}.dash-ai-orb{display:grid;place-items:center;min-height:180px}.dash-ai-orb span{width:128px;height:128px;border-radius:48% 52% 45% 55%;background:radial-gradient(circle at 50% 64%,rgba(57,217,138,.9),rgba(57,217,138,.24) 42%,transparent 66%);box-shadow:0 0 36px rgba(57,217,138,.28),inset 0 0 36px rgba(79,124,255,.22);animation:analyticsViewIn .8s ease both,aiOrbPulse 3.8s ease-in-out infinite}.dash-top-list{display:grid;gap:10px}.dash-top-row{display:grid;grid-template-columns:25px minmax(0,1fr) auto;gap:10px;align-items:center}.dash-top-row em{width:25px;height:25px;border-radius:8px;display:grid;place-items:center;background:rgba(57,217,138,.14);color:var(--ana);font-style:normal;font-weight:850;font-size:11px}.dash-top-row span{min-width:0}.dash-top-row span b{display:block;color:#fff;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-top-row span small{display:block;margin-top:3px;color:var(--ana-muted);font-size:9px}.dash-top-row strong{color:#fff;font-size:11px;white-space:nowrap}@keyframes dashSunshine{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.4);opacity:0}}@keyframes dashClouds{0%{transform:translateX(15px)}50%{transform:translateX(0)}100%{transform:translateX(15px)}}@keyframes aiOrbPulse{0%,100%{transform:scale(1);filter:saturate(1)}50%{transform:scale(1.06) rotate(4deg);filter:saturate(1.25)}}' +
      '.journal-trip-list{display:grid;gap:14px}.journal-trip-card{position:relative;overflow:hidden;border:1px solid rgba(79,124,255,.34);border-radius:19px;padding:14px;background:linear-gradient(145deg,rgba(35,25,54,.98),rgba(15,12,24,.98));box-shadow:0 16px 34px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.05);cursor:pointer;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}.journal-trip-card:before{content:"";position:absolute;inset:-1px;background:radial-gradient(circle at 88% 12%,rgba(79,124,255,.18),transparent 32%);opacity:.72;pointer-events:none}.journal-trip-card:hover{transform:translateY(-1px);border-color:rgba(79,124,255,.54);box-shadow:0 18px 34px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06)}.journal-trip-card:focus-visible{outline:3px solid rgba(79,124,255,.32);outline-offset:3px}.journal-trip-main,.journal-trip-strip,.journal-trip-more{position:relative;z-index:1}.journal-trip-main{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:52px;align-items:start;padding-right:56px}.journal-trip-kicker{color:var(--ana);font-family:monospace;font-size:10px;letter-spacing:0;font-weight:800;text-transform:uppercase}.journal-trip-title{margin-top:5px;color:var(--ana-text);font-size:14px;font-weight:820;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.journal-trip-route{margin-top:5px;color:var(--ana-muted);font-size:11px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.journal-trip-money{text-align:right;min-width:96px}.journal-trip-money b{display:block;color:#fff;font-size:16px;line-height:1.1;white-space:nowrap}.journal-trip-money span{display:block;margin-top:4px;color:var(--ana-muted);font-size:10px}.journal-trip-strip{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px;padding-right:52px}.journal-trip-strip span{border:1px solid rgba(79,124,255,.22);border-radius:999px;background:rgba(79,124,255,.08);color:var(--ana-muted);font-size:10px;line-height:1;padding:6px 8px;white-space:nowrap}.journal-trip-strip b{color:var(--ana-text);font-weight:820}.journal-trip-strip span:first-child{border-color:rgba(57,217,138,.28);background:rgba(57,217,138,.08);color:rgba(224,255,241,.78)}.journal-trip-more{margin-top:10px;color:rgba(248,251,255,.6);font-size:10px;font-family:monospace;letter-spacing:0;line-height:1.45;padding-right:52px}.journal-trip-more b{display:inline;color:var(--ana);font-family:inherit;font-size:11px;margin-right:8px}.journal-trip-delete{position:absolute;z-index:2;right:14px;top:14px;width:42px;height:42px;border-radius:50%;background-color:rgb(20,20,20);border:none;font-weight:600;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 22px rgba(0,0,0,.24);cursor:pointer;transition-duration:.3s;overflow:hidden}.journal-trip-delete svg{width:12px;transition-duration:.3s}.journal-trip-delete svg path{fill:#fff}.journal-trip-delete:hover{width:118px;border-radius:50px;background-color:rgb(255,69,69);align-items:center}.journal-trip-delete:hover svg{width:42px;transform:translateY(58%)}.journal-trip-delete:before{position:absolute;top:-20px;content:"Удалить";color:#fff;transition-duration:.3s;font-size:2px}.journal-trip-delete:hover:before{font-size:12px;opacity:1;transform:translateY(29px)}.journal-trip-delete:active{transform:scale(.96)}' +
      '.payment-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px;margin-bottom:16px}.payment-summary-card{border:1px solid rgba(79,124,255,.22);border-radius:9px;background:linear-gradient(135deg,rgba(79,124,255,.08),rgba(57,217,138,.045));padding:11px 10px;min-width:0}.payment-summary-card b{display:block;color:var(--ana-text);font-size:14px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.payment-summary-card span{display:block;margin-top:5px;color:var(--ana-muted);font-size:10px}.payment-summary-card small{display:block;margin-top:4px;color:rgba(248,251,255,.5);font-size:9px}.journal-payment{position:relative;z-index:1;display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-right:52px}.journal-payment button{border:1px solid rgba(79,124,255,.24);border-radius:999px;background:rgba(255,255,255,.045);color:var(--ana-muted);font-size:10px;line-height:1;padding:7px 9px;cursor:pointer;transition:.16s ease}.journal-payment button:hover{border-color:rgba(79,124,255,.52);color:#fff}.journal-payment button.is-active{border-color:rgba(57,217,138,.46);background:rgba(57,217,138,.12);color:#dfffee;box-shadow:0 0 18px rgba(57,217,138,.08)}' +
      '.journal-card{position:relative;overflow:hidden;border-radius:18px;padding:1px;background:linear-gradient(135deg,rgba(57,217,138,.65),rgba(137,104,190,.35),rgba(255,255,255,.08));box-shadow:0 18px 34px rgba(0,0,0,.24),0 0 24px rgba(57,217,138,.06);transition:transform .22s ease,box-shadow .22s ease}' +
      '.journal-card:hover{transform:translateY(-2px);box-shadow:0 24px 42px rgba(0,0,0,.3),0 0 30px rgba(57,217,138,.11)}' +
      '.journal-card:before{content:"";position:absolute;width:110px;height:110px;right:-48px;top:-46px;background:radial-gradient(circle,rgba(57,217,138,.28),transparent 62%);transition:transform .35s ease,opacity .35s ease;opacity:.74}' +
      '.journal-card:hover:before{transform:scale(1.25);opacity:1}' +
      '.journal-card-inner{position:relative;z-index:1;border-radius:17px;padding:13px;display:grid;gap:10px;background:linear-gradient(145deg,#241837 0%,#171023 56%,#110d19 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}' +
      '.journal-summary{position:relative;overflow:hidden;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;border:1px solid rgba(57,217,138,.35);border-radius:14px;background:linear-gradient(135deg,rgba(57,217,138,.18),rgba(248,251,255,.065));box-shadow:0 12px 26px rgba(57,217,138,.09),inset 0 1px 0 rgba(255,255,255,.07)}' +
      '.journal-summary:before{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent,rgba(255,255,255,.13),transparent);transform:translateX(-120%);transition:transform .55s ease}' +
      '.journal-card:hover .journal-summary:before{transform:translateX(120%)}' +
      '.journal-stat{position:relative;z-index:1;min-width:0;padding:10px 10px;border-right:1px solid rgba(57,217,138,.18)}' +
      '.journal-stat:last-child{border-right:0}' +
      '.journal-stat span{display:block;color:var(--ana-muted);font-size:9px;font-family:monospace;letter-spacing:0;margin-bottom:4px}' +
      '.journal-stat b{display:block;color:var(--ana-text);font-size:12px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 14px rgba(57,217,138,.12)}' +
      '.journal-delete{width:45px;height:45px;border-radius:50%;border:2px solid rgb(255,201,201);background:rgb(255,95,95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer;box-shadow:0 10px 20px rgba(255,95,95,.18);transition:background .22s ease,transform .18s ease,box-shadow .22s ease;flex:0 0 auto}' +
      '.journal-delete-top{width:17px;height:4px;background:#fff;border-radius:5px;transform-origin:right;transition:transform .25s ease}' +
      '.journal-delete-cap{width:10px;height:3px;background:#fff;border-radius:5px;margin-bottom:-1px}' +
      '.journal-delete-bottom{width:15px;height:17px;background:#fff;border-radius:2px 2px 4px 4px;position:relative}' +
      '.journal-delete-bottom:before,.journal-delete-bottom:after{content:"";position:absolute;top:3px;width:2px;height:10px;background:rgb(255,95,95);border-radius:2px;transition:background .22s ease}' +
      '.journal-delete-bottom:before{left:4px}.journal-delete-bottom:after{right:4px}' +
      '.journal-delete:hover{background:rgb(255,38,38);transform:translateY(-1px);box-shadow:0 14px 26px rgba(255,38,38,.28)}' +
      '.journal-delete:hover .journal-delete-top{transform:rotate(32deg) translate(2px,-2px)}' +
      '.journal-delete:hover .journal-delete-bottom:before,.journal-delete:hover .journal-delete-bottom:after{background:rgb(255,38,38)}' +
      '.journal-delete:active{transform:scale(.95)}' +
      '.journal-map-thumb{position:relative;width:100%;aspect-ratio:3.52/1;border:1px solid rgba(57,217,138,.26);border-radius:8px;overflow:hidden;background:#080b12 url("img/route-card-map.png") center/100% 100% no-repeat;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 26px rgba(0,0,0,.18);transition:transform .18s ease,border-color .2s ease,box-shadow .2s ease}' +
      '.overview-year-chart{display:grid;gap:9px;margin:4px 0 20px}.overview-year-card{position:relative;overflow:hidden;display:grid;grid-template-columns:74px minmax(0,1fr) minmax(128px,auto);gap:12px;align-items:center;padding:12px;border:1px solid rgba(137,104,190,.22);border-radius:10px;background:linear-gradient(135deg,rgba(255,255,255,.045),rgba(57,217,138,.035));animation:yearChartIn .56s cubic-bezier(.2,.8,.2,1) both;animation-timeline:view();animation-range:entry 0% cover 34%}.overview-year-card:before{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent,rgba(255,255,255,.09),transparent);transform:translateX(-130%)}.overview-year-card:hover:before{animation:yearCardShine .85s ease}.overview-year-card:hover{border-color:rgba(57,217,138,.38);box-shadow:0 14px 28px rgba(0,0,0,.16),0 0 22px rgba(57,217,138,.08)}.overview-year-name{position:relative;z-index:1;color:var(--ana-text);font-size:18px;font-weight:780}.overview-year-main{position:relative;z-index:1;min-width:0}.overview-year-bar{height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,.22)}.overview-year-fill{height:100%;width:var(--w);border-radius:inherit;background:linear-gradient(90deg,var(--ana),#65e7a5 54%,#4f7cff);box-shadow:0 0 18px rgba(57,217,138,.2);transform-origin:left;animation:yearBarGrow .82s cubic-bezier(.2,.8,.2,1) both;animation-timeline:view();animation-range:entry 4% cover 32%}.overview-year-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.overview-year-meta span{border:1px solid rgba(57,217,138,.2);border-radius:999px;background:rgba(57,217,138,.06);color:var(--ana-muted);font-size:10px;line-height:1;padding:5px 7px}.overview-year-money{position:relative;z-index:1;text-align:right;min-width:0}.overview-year-money b{display:block;color:var(--ana);font-size:14px;line-height:1.1;white-space:nowrap}.overview-year-money span{display:block;margin-top:5px;color:var(--ana-muted);font-size:10px;white-space:nowrap}.overview-year-card:nth-child(2){animation-delay:.05s}.overview-year-card:nth-child(3){animation-delay:.1s}.overview-year-card:nth-child(4){animation-delay:.15s}' +
      '.journal-map-thumb:hover{transform:translateY(-1px);border-color:rgba(57,217,138,.5);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 16px 34px rgba(0,0,0,.24),0 0 24px rgba(57,217,138,.1)}' +
      '.journal-route-metrics,.route-map-route-metrics{display:flex;gap:6px;flex-wrap:wrap}.journal-route-metrics{margin-top:-3px}.route-map-route-metrics{margin-top:10px}.journal-route-metrics span,.route-map-route-metrics span{border:1px solid rgba(57,217,138,.2);border-radius:999px;background:rgba(57,217,138,.07);color:var(--ana-muted);font-size:10px;line-height:1;padding:5px 7px;white-space:nowrap}.route-map-route-metrics span{font-size:11px;padding:7px 9px}.journal-route-metrics b,.route-map-route-metrics b{color:var(--ana-text);font-weight:800}.journal-route-metrics.is-pending span,.route-map-route-metrics.is-pending span{border-color:rgba(248,251,255,.16);background:rgba(255,255,255,.045);color:rgba(248,251,255,.58)}' +
      '.route-map-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(4,6,10,.72);backdrop-filter:blur(10px)}' +
      '.route-map-modal.is-open{display:flex}' +
      '.route-map-dialog{position:relative;width:min(760px,100%);border:1px solid rgba(57,217,138,.32);border-radius:12px;background:linear-gradient(180deg,#1b1428,#100d18);box-shadow:0 30px 80px rgba(0,0,0,.55);padding:16px}' +
      '.route-map-close{position:absolute;right:10px;top:10px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:#fff;font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
      '.route-map-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin:0 38px 12px 0}' +
      '.route-map-kicker{font-family:monospace;font-size:10px;letter-spacing:0;color:var(--ana)}.route-map-title{font-size:16px;font-weight:800;color:var(--ana-text);margin-top:3px}.route-map-sum{color:var(--ana);font-size:14px;font-weight:800;white-space:nowrap}' +
      '.route-map-large{border-radius:8px;overflow:hidden;border:1px solid rgba(57,217,138,.22);background:rgba(255,255,255,.04);min-height:360px}.route-map-large iframe{width:100%;height:360px;border:0;display:block}.route-map-state{height:100%;min-height:220px;display:flex;align-items:center;justify-content:center;color:var(--ana);font-size:13px;font-weight:800}' +
      '.route-map-error{margin-top:10px;border:1px solid rgba(255,95,95,.32);border-radius:8px;padding:10px;color:#ffb9b9;background:rgba(255,95,95,.08);font-size:12px;line-height:1.45}' +
      '.route-map-customer{margin-top:12px;color:var(--ana);font-size:13px;font-weight:750}.route-map-route{margin-top:5px;color:var(--ana-text);font-size:12px;line-height:1.45}.route-map-meta,.route-map-hint{margin-top:7px;color:var(--ana-muted);font-size:11px;font-family:monospace;letter-spacing:0}.route-map-hint{color:var(--ana)}' +
      '.route-map-manual-km{margin-top:12px;border:1px solid rgba(137,104,190,.28);border-radius:10px;background:rgba(255,255,255,.035);padding:10px}.route-map-manual-km>label{display:block;color:var(--ana-muted);font-size:10px;font-family:monospace;letter-spacing:0;margin-bottom:6px}.route-map-manual-km>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.route-map-manual-km #manualRouteKm{min-width:0;border:1px solid rgba(57,217,138,.24);border-radius:8px;background:rgba(255,255,255,.06);color:var(--ana-text);padding:10px 11px;font-size:14px;outline:0}.route-map-manual-km #manualRouteKm:focus{border-color:rgba(57,217,138,.62);box-shadow:0 0 0 3px rgba(57,217,138,.1)}.holo-save-check{position:relative;display:grid!important;place-items:center;margin:0!important;width:54px;height:54px;padding:0;border:0;border-radius:14px;background:linear-gradient(145deg,#2d2638,#121019);box-shadow:inset 0 -8px 10px rgba(0,0,0,.34),inset 0 2px 2px rgba(255,255,255,.08),0 12px 24px rgba(0,0,0,.26);cursor:pointer;user-select:none;transition:transform .16s ease,box-shadow .18s ease,filter .18s ease}.holo-save-check:hover{transform:translateY(-1px);filter:brightness(1.06);box-shadow:inset 0 -8px 10px rgba(0,0,0,.32),inset 0 2px 2px rgba(255,255,255,.1),0 16px 28px rgba(57,217,138,.12)}.holo-save-check:active{transform:translateY(1px) scale(.97);box-shadow:inset 0 6px 12px rgba(0,0,0,.42),0 6px 14px rgba(0,0,0,.18)}.holo-checkbox-input{position:absolute!important;opacity:0!important;pointer-events:none!important}.holo-checkbox{position:relative;width:36px;height:36px;display:block;flex:0 0 36px}.holo-box{position:absolute;inset:0;border:2px solid rgba(57,217,138,.78);border-radius:10px;background:rgba(8,11,18,.92);box-shadow:inset 0 0 0 2px rgba(255,255,255,.03),inset 0 0 12px rgba(57,217,138,.12),0 0 14px rgba(57,217,138,.1);overflow:hidden;transition:background .24s ease,border-color .24s ease,box-shadow .24s ease,transform .18s ease}.holo-inner{position:absolute;left:9px;top:6px;width:12px;height:20px;border-right:4px solid #07140d;border-bottom:4px solid #07140d;opacity:0;transform:rotate(40deg) scale(.5);transform-origin:center;transition:opacity .16s ease,transform .28s cubic-bezier(.2,1.7,.35,1)}.scan-effect{position:absolute;left:-40%;right:-40%;height:3px;top:-7px;background:linear-gradient(90deg,transparent,#fff,transparent);opacity:0;filter:blur(.2px)}.holo-particles,.activation-rings{position:absolute;inset:0;pointer-events:none}.holo-particle{position:absolute;width:3px;height:3px;border-radius:50%;background:var(--ana);opacity:0}.holo-particle:nth-child(1){left:5px;top:5px}.holo-particle:nth-child(2){right:5px;top:6px}.holo-particle:nth-child(3){left:8px;bottom:5px}.holo-particle:nth-child(4){right:8px;bottom:5px}.holo-particle:nth-child(5){left:16px;top:3px}.holo-particle:nth-child(6){right:16px;bottom:3px}.activation-ring{position:absolute;inset:2px;border:1px solid rgba(57,217,138,.45);border-radius:10px;opacity:0}.corner-accent{position:absolute;width:8px;height:8px;border-color:var(--ana);opacity:.64}.corner-accent:nth-of-type(1){left:-1px;top:-1px;border-top:1px solid;border-left:1px solid}.corner-accent:nth-of-type(2){right:-1px;top:-1px;border-top:1px solid;border-right:1px solid}.corner-accent:nth-of-type(3){left:-1px;bottom:-1px;border-bottom:1px solid;border-left:1px solid}.corner-accent:nth-of-type(4){right:-1px;bottom:-1px;border-bottom:1px solid;border-right:1px solid}.holo-glow{position:absolute;inset:-9px;border-radius:16px;background:radial-gradient(circle,rgba(57,217,138,.34),transparent 68%);opacity:0;transition:.2s ease}.holo-checkbox-input:focus-visible + .holo-checkbox .holo-box{box-shadow:0 0 0 3px rgba(57,217,138,.18),0 0 18px rgba(57,217,138,.22)}.holo-checkbox-input:checked + .holo-checkbox .holo-box{background:linear-gradient(180deg,var(--ana),var(--ana2));border-color:transparent;box-shadow:0 0 22px rgba(57,217,138,.46);transform:scale(1.03)}.holo-checkbox-input:checked + .holo-checkbox .holo-inner{opacity:1;transform:rotate(40deg) scale(1)}.holo-checkbox-input:checked + .holo-checkbox .scan-effect{animation:holoScan .72s ease-out}.holo-checkbox-input:checked + .holo-checkbox .holo-particle{animation:holoParticle .55s ease-out}.holo-checkbox-input:checked + .holo-checkbox .activation-ring{animation:holoRing .7s ease-out}.holo-checkbox-input:checked + .holo-checkbox .holo-glow{opacity:1}.route-map-manual-km p{margin:7px 0 0;color:rgba(248,251,255,.55);font-size:10px;line-height:1.35}@keyframes holoScan{0%{top:-7px;opacity:0}25%{opacity:1}100%{top:40px;opacity:0}}@keyframes holoParticle{0%{transform:scale(.3);opacity:0}35%{opacity:1}100%{transform:scale(2.1);opacity:0}}@keyframes holoRing{0%{transform:scale(.72);opacity:0}35%{opacity:.8}100%{transform:scale(1.45);opacity:0}}' +
      '.route-map-manual-km>div{grid-template-columns:1fr}.route-km-loader-banner{width:100%;margin:10px 0 0;padding:9px 12px;border:1px solid rgba(79,124,255,.34);border-radius:12px;background:linear-gradient(135deg,rgba(79,124,255,.16),rgba(57,217,138,.08));color:var(--ana-text);display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer;overflow:hidden;text-align:left;box-shadow:0 12px 28px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.06);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease}.route-km-loader-banner:hover{transform:translateY(-1px);border-color:rgba(79,124,255,.62);box-shadow:0 16px 34px rgba(0,0,0,.24),0 0 24px rgba(79,124,255,.1),inset 0 1px 0 rgba(255,255,255,.08)}.route-km-loader-banner:active{transform:scale(.99)}.route-km-loader-banner:disabled{cursor:wait}.route-km-loader{width:122px;height:64px;display:flex;align-items:center;justify-content:center;flex:0 0 122px}.route-truck-wrapper{width:122px;height:64px;display:flex;flex-direction:column;position:relative;align-items:center;justify-content:flex-end;overflow:hidden}.route-truck-body{width:86px;height:41px;margin-bottom:5px;display:block}.route-truck-body svg{width:100%;height:auto;display:block}.route-truck-tires{width:86px;display:flex;align-items:center;justify-content:space-between;padding:0 7px 0 10px;position:absolute;bottom:0}.route-truck-tires svg{width:17px;height:17px}.route-road{width:100%;height:1.5px;background-color:#d7d7d7;position:relative;bottom:0;align-self:flex-end;border-radius:3px}.route-road:before{content:"";position:absolute;width:20px;height:100%;background-color:#d7d7d7;right:-50%;border-radius:3px;border-left:10px solid rgba(8,11,18,.95)}.route-road:after{content:"";position:absolute;width:10px;height:100%;background-color:#d7d7d7;right:-65%;border-radius:3px;border-left:4px solid rgba(8,11,18,.95)}.route-lamp-post{position:absolute;bottom:0;right:-90%;height:56px;fill:#d7d7d7}.route-km-loader-copy{min-width:0;display:grid;gap:4px;flex:1}.route-km-loader-copy b{font-size:13px;line-height:1.1;color:#fff}.route-km-loader-copy small{font-size:10px;color:var(--ana-muted);line-height:1.25}.route-km-loader-banner.is-calculating{background:linear-gradient(135deg,rgba(79,124,255,.28),rgba(57,217,138,.13));border-color:rgba(87,244,255,.46)}.route-km-loader-banner.is-calculating .route-truck-body{animation:routeTruckMotion 1s linear infinite}.route-km-loader-banner.is-calculating .route-road:before,.route-km-loader-banner.is-calculating .route-road:after,.route-km-loader-banner.is-calculating .route-lamp-post{animation:routeRoadAnimation 1.4s linear infinite}.route-km-loader-banner.is-calculating .route-km-loader-copy b:after{content:"...";animation:routeDots 1.2s steps(4,end) infinite}.route-map-manual-km.is-saving .route-km-loader-copy small{color:rgba(87,244,255,.86)}@keyframes routeTruckMotion{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}@keyframes routeRoadAnimation{0%{transform:translateX(0)}100%{transform:translateX(-220px)}}@keyframes routeDots{0%{content:""}25%{content:"."}50%{content:".."}75%,100%{content:"..."}}' +
      '.holo-save-check{background:linear-gradient(135deg,#4f7cff 0%,#3163df 100%);border-radius:12px;box-shadow:0 10px 28px rgba(66,133,244,.24),inset 0 1px 0 rgba(255,255,255,.22),inset 0 -10px 18px rgba(14,45,139,.28);overflow:visible}.holo-save-check:before{content:"";position:absolute;inset:-7px;border-radius:18px;background:radial-gradient(circle,rgba(79,124,255,.32),transparent 68%);opacity:.42;filter:blur(4px);transition:opacity .18s ease}.holo-save-check:after{content:"";position:absolute;inset:6px;border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0));pointer-events:none}.holo-save-check:hover{filter:none;background:linear-gradient(135deg,#5d8cff 0%,#3a6df0 100%);box-shadow:0 14px 34px rgba(66,133,244,.32),inset 0 1px 0 rgba(255,255,255,.25),inset 0 -10px 18px rgba(14,45,139,.24)}.holo-save-check:hover:before,.holo-save-check.is-calculating:before{opacity:1}.holo-save-check .holo-checkbox{z-index:1;width:34px;height:34px}.holo-save-check .holo-box{border-color:rgba(255,255,255,.72);background:rgba(6,15,38,.52);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),inset 0 0 18px rgba(255,255,255,.05),0 0 16px rgba(255,255,255,.1)}.holo-save-check .holo-box:before{content:"";position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(180deg,#9ad8ff 0%,#57f4ff 42%,#4f7cff 100%);box-shadow:0 0 18px rgba(87,244,255,.55);transition:height .46s cubic-bezier(.2,.8,.2,1)}.holo-save-check .holo-box:after{content:"";position:absolute;inset:5px;border-radius:50%;border:2px solid transparent;border-top-color:rgba(255,255,255,.9);border-right-color:rgba(87,244,255,.95);opacity:0;transform:scale(.6);transition:opacity .16s ease,transform .18s ease}.holo-save-check .holo-inner{border-color:#fff;z-index:2}.holo-save-check .scan-effect{background:linear-gradient(90deg,transparent,#fff,#57f4ff,transparent);height:4px}.holo-save-check .corner-accent{border-color:#fff;opacity:.72}.holo-save-check .holo-particle{background:#57f4ff;box-shadow:0 0 8px rgba(87,244,255,.85)}.holo-save-check .activation-ring{border-color:rgba(255,255,255,.42)}.holo-save-check .holo-glow{background:radial-gradient(circle,rgba(87,244,255,.45),transparent 66%)}.holo-save-check.is-calculating{pointer-events:none;animation:calcButtonPulse 1.1s ease-in-out infinite}.holo-save-check.is-calculating .holo-box:before,.holo-checkbox-input:checked + .holo-checkbox .holo-box:before{height:100%}.holo-save-check.is-calculating .holo-box:after{opacity:1;transform:scale(1);animation:calcOrbit .72s linear infinite}.holo-save-check.is-calculating .holo-inner{opacity:0;transform:rotate(40deg) scale(.5)}.holo-save-check.is-calculating .scan-effect{animation:holoScan .8s linear infinite}.holo-save-check.is-calculating .holo-particle{animation:calcParticle .9s ease-in-out infinite}.holo-save-check.is-calculating .activation-ring{animation:holoRing 1s ease-out infinite}.route-map-manual-km.is-saving #manualRouteKm{color:rgba(248,251,255,.68);border-color:rgba(79,124,255,.62);background:rgba(79,124,255,.08);box-shadow:0 0 0 3px rgba(79,124,255,.1)}@keyframes calcOrbit{to{transform:scale(1) rotate(360deg)}}@keyframes calcButtonPulse{0%,100%{transform:translateY(0);box-shadow:0 10px 28px rgba(66,133,244,.26),0 0 0 rgba(87,244,255,0)}50%{transform:translateY(-1px);box-shadow:0 16px 38px rgba(66,133,244,.4),0 0 24px rgba(87,244,255,.28)}}@keyframes calcParticle{0%{transform:translateY(0) scale(.45);opacity:0}30%{opacity:1}100%{transform:translateY(-12px) scale(1.8);opacity:0}}' +
      '.holo-save-check .holo-checkbox-input:checked + .holo-checkbox .holo-box{background:rgba(6,15,38,.52);border-color:rgba(255,255,255,.18);box-shadow:0 0 22px rgba(66,133,244,.46),inset 0 0 0 1px rgba(255,255,255,.1);transform:scale(1.03)}.holo-save-check .holo-checkbox-input:checked + .holo-checkbox .holo-inner{border-color:#fff;opacity:1;transform:rotate(40deg) scale(1)}' +
      '.manual-save-check{display:block;position:relative;cursor:pointer;font-size:34px;user-select:none;width:1.3em;height:1.3em;margin:0!important;transition:transform .18s ease}.manual-save-check:hover{transform:translateY(-1px)}.manual-save-check:active{transform:scale(.96)}.manual-save-check input{position:absolute;opacity:0;cursor:pointer;height:0;width:0}.manual-save-checkmark{position:relative;top:0;left:0;height:1.3em;width:1.3em;background:#000;border-radius:50px;transition:all .7s;--spread:20px;box-shadow:0 10px 24px rgba(0,0,0,.26),inset 0 0 0 2px rgba(255,255,255,.22)}.manual-save-check input:checked ~ .manual-save-checkmark,.manual-save-check.is-calculating .manual-save-checkmark{background:#000;box-shadow:-10px -10px var(--spread) 0 #5b51d8,0 -10px var(--spread) 0 #833ab4,10px -10px var(--spread) 0 #e1306c,10px 0 var(--spread) 0 #fd1d1d,10px 10px var(--spread) 0 #f77737,0 10px var(--spread) 0 #fcaf45,-10px 10px var(--spread) 0 #ffdc80}.manual-save-checkmark:after{content:"";position:absolute;display:none}.manual-save-check input:checked ~ .manual-save-checkmark:after,.manual-save-check.is-calculating .manual-save-checkmark:after{display:block}.manual-save-check .manual-save-checkmark:after{left:.45em;top:.25em;width:.25em;height:.5em;border:solid #f0f0f0;border-width:0 .15em .15em 0;transform:rotate(40deg)}.manual-save-check.is-calculating .manual-save-checkmark{animation:manualSavePulse .9s ease-in-out infinite}@keyframes manualSavePulse{0%,100%{filter:saturate(1);transform:scale(1)}50%{filter:saturate(1.35);transform:scale(1.04)}}' +
      '.analytics-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:16px}' +
      '.dash-hero-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.dash-hero-card{min-height:128px;padding:14px;border-radius:16px;background:radial-gradient(120% 95% at 20% 100%,rgba(57,217,138,.13),transparent 60%),linear-gradient(145deg,rgba(28,35,56,.82),rgba(17,14,25,.96));box-shadow:0 16px 34px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.055)}.dash-hero-card:hover{transform:translateY(-2px) scale(1.01)}.dash-hero-weather{display:none}.dash-hero-visual{position:absolute;right:12px;top:12px;width:58px;height:58px;z-index:12;display:grid;place-items:center;opacity:.94}.dash-hero-head{gap:5px;max-width:72%}.dash-hero-head span:first-child{font-size:10px;letter-spacing:.1em}.dash-hero-head span:last-child{font-size:9px}.dash-hero-value{left:14px;right:14px;bottom:14px;font-size:clamp(18px,2.3vw,25px)}.dash-hero-scale{right:12px;bottom:12px;min-width:34px;width:34px;height:28px;padding:0;border-radius:10px;font-size:12px}.dash-money-visual,.dash-fuel-visual,.dash-chart-visual{position:relative;width:58px;height:58px}.dash-money-visual i{position:absolute;width:36px;height:22px;border-radius:6px;background:linear-gradient(135deg,#baff6b,#39d98a);border:1px solid rgba(255,255,255,.35);box-shadow:0 8px 18px rgba(57,217,138,.18);animation:dashBillsRustle 2.6s ease-in-out infinite}.dash-money-visual i:before{content:"";position:absolute;inset:6px 12px;border-radius:999px;border:1px solid rgba(8,20,15,.35)}.dash-money-visual i:nth-child(1){--r:-12deg;left:5px;top:13px;transform:rotate(var(--r))}.dash-money-visual i:nth-child(2){--r:0deg;left:14px;top:18px;animation-delay:.2s}.dash-money-visual i:nth-child(3){--r:12deg;left:22px;top:23px;transform:rotate(var(--r));animation-delay:.4s}.dash-fuel-visual:before{content:"";position:absolute;left:16px;top:8px;width:30px;height:42px;border-radius:7px 7px 9px 9px;border:2px solid rgba(255,255,255,.4);background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(10,17,28,.82));box-shadow:0 10px 22px rgba(57,217,138,.14);overflow:hidden}.dash-fuel-visual i{position:absolute;left:20px;right:16px;bottom:10px;height:0;border-radius:0 0 7px 7px;background:linear-gradient(180deg,#57f4ff,#39d98a);box-shadow:0 0 18px rgba(87,244,255,.45);animation:dashFuelFill 2.4s ease-in-out infinite}.dash-fuel-visual span{position:absolute;right:6px;top:15px;width:14px;height:17px;border:2px solid rgba(255,255,255,.4);border-left:0;border-radius:0 8px 8px 0}.dash-chart-visual{display:flex;align-items:flex-end;justify-content:center;gap:5px}.dash-chart-visual i{width:10px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#57f4ff,#4f7cff);box-shadow:0 8px 18px rgba(79,124,255,.24);animation:dashChartRise 2.1s ease-in-out infinite}.dash-chart-visual i:nth-child(1){height:22px}.dash-chart-visual i:nth-child(2){height:34px;animation-delay:.15s}.dash-chart-visual i:nth-child(3){height:48px;animation-delay:.3s}.dash-chart-visual span{position:absolute;inset:6px;border-radius:50%;border:1px solid rgba(87,244,255,.16)}.dash-mini-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.dash-metric-card{min-height:92px;padding:11px 10px;border-radius:11px}.dash-metric-icon{font-size:17px;margin-bottom:7px}.dash-metric-card b{font-size:15px}.dash-metric-card span{margin-top:5px;font-size:10px}.dash-metric-card small{margin-top:4px;font-size:8px}@keyframes dashBillsRustle{0%,100%{transform:translateY(0) rotate(var(--r,0deg))}50%{transform:translateY(-3px) rotate(calc(var(--r,0deg) + 5deg))}}@keyframes dashFuelFill{0%{height:8px}55%{height:32px}100%{height:8px}}@keyframes dashChartRise{0%,100%{transform:scaleY(.72);filter:saturate(.9)}50%{transform:scaleY(1);filter:saturate(1.3)}}' +
      '.dash-panel{animation:dashPanelReveal .68s cubic-bezier(.2,.8,.2,1) both;animation-timeline:view();animation-range:entry 0% cover 30%}.dash-panel-head b{font-size:13px;letter-spacing:.02em}.dash-panel-head span{font-size:10px}.dash-bars{height:190px;padding:18px 2px 0;align-items:flex-end;gap:7px}.dash-bar-col{gap:8px}.dash-bar-col em{max-width:34px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,#65f0aa,#2fc57c);box-shadow:0 12px 24px rgba(57,217,138,.2)}.dash-bar-col strong{top:-22px;font-size:10px;font-weight:850;text-shadow:0 0 12px rgba(57,217,138,.25)}.dash-bar-col small{font-size:10px;color:rgba(248,251,255,.56)}.dash-expense{grid-template-columns:minmax(170px,210px) minmax(0,1fr);gap:18px}.dash-donut{width:168px;margin:0 auto}.dash-donut:before{inset:32px;background:#171426}.dash-donut b{font-size:18px}.dash-donut span{font-size:10px;text-transform:uppercase;letter-spacing:.08em}.dash-expense-row{grid-template-columns:10px minmax(0,1fr) auto 42px;font-size:12px;gap:9px}.dash-expense-row i{width:9px;height:9px}.dash-expense-row span{color:rgba(248,251,255,.72)}.dash-expense-row b{font-size:13px;color:#fff}.dash-expense-row small{font-size:11px;color:rgba(248,251,255,.52)}@keyframes dashPanelReveal{from{opacity:0;transform:translateY(18px);filter:blur(5px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}' +
      '@media(max-width:760px){.dash-hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-hero-card{min-height:122px}.dash-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-grid-2{grid-template-columns:1fr}.dash-ai-panel{grid-template-columns:1fr}.dash-ai-orb{display:none}.dash-expense{grid-template-columns:1fr;justify-items:center}.dash-expense-list{width:100%}}' +
      '@media(max-width:430px){.analytics-tabs{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-bottom:12px}.analytics-tabs button:first-child{grid-column:1 / -1}.dash-hero-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.dash-hero-card{min-height:108px;padding:10px;border-radius:13px}.dash-hero-card:nth-child(3){grid-column:1 / -1}.dash-hero-visual{right:5px;top:5px;transform:scale(.68);transform-origin:top right}.dash-hero-head{max-width:76%}.dash-hero-head span:first-child{font-size:8px}.dash-hero-head span:last-child{font-size:7.5px}.dash-hero-value{left:10px;right:40px;bottom:11px;font-size:clamp(15px,4.6vw,17px);letter-spacing:0}.dash-hero-card:nth-child(3) .dash-hero-value{font-size:18px}.dash-hero-scale{right:7px;bottom:9px;width:26px;height:24px;min-width:26px}.dash-mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.dash-metric-card{min-height:78px;padding:10px 9px}.dash-metric-icon{font-size:14px;margin-bottom:4px}.dash-metric-card b{font-size:clamp(14px,4.2vw,17px)}.dash-metric-card span{font-size:10px}.dash-metric-card small{font-size:8.5px;line-height:1.25}.dash-bars{gap:5px}.dash-top-row{grid-template-columns:24px minmax(0,1fr)}.dash-top-row strong{grid-column:2;text-align:left}.overview-year-card{grid-template-columns:1fr;gap:9px}.overview-year-money{text-align:left}.journal-trip-card{padding:11px;border-radius:16px}.journal-trip-main{grid-template-columns:1fr;gap:8px}.journal-trip-money{text-align:left;min-width:0;display:flex;align-items:baseline;gap:8px}.journal-trip-title{font-size:13px}.journal-trip-route{-webkit-line-clamp:1}.journal-trip-strip span{font-size:9px;padding:6px 7px}.journal-card-inner{padding:12px}.journal-summary{grid-template-columns:1fr}.journal-stat{border-right:0;border-bottom:1px solid rgba(57,217,138,.18)}.journal-stat:last-child{border-bottom:0}.journal-delete{width:42px;height:42px}.route-map-dialog{padding:13px}.route-map-head{display:block}.route-map-sum{margin-top:6px}.route-map-large{min-height:280px}.route-map-large iframe{height:280px}.route-map-state{min-height:170px}}' +
    '</style>' +
    '<div class="dc" style="--acc:' + ANALYTICS_GREEN + ';--ana:' + ANALYTICS_GREEN + ';--ana2:' + ANALYTICS_GREEN_DARK + ';--ana-bg:#171022;--ana-card:#211733;--ana-card2:#2b2140;--ana-text:#f8fbff;--ana-muted:#a99bc8;padding:18px;margin-bottom:0;background:radial-gradient(circle at 12% 0%,rgba(57,217,138,.11),transparent 30%),linear-gradient(180deg,#1a1128,#130f1d);border-color:rgba(137,104,190,.28);box-shadow:0 22px 54px rgba(0,0,0,.24)">' +
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

function aiAnalyticsPanel(rows, customers, routes, profitRate, avgAmt) {
  const bestCustomer = customers[0];
  const bestRoute = routes[0];
  const bestMonth = bestMonthByAmount(rows);
  return '<div class="dash-ai-panel">' +
    '<div class="dash-ai-copy">' +
      '<div class="dash-panel-head"><b>AI-аналитика</b><span>обзор</span></div>' +
      aiInsight('↗', profitRate ? 'Рентабельность периода ' + profitRate.toLocaleString('ru-RU') + '%' : 'Рентабельность пока не рассчитана', 'чистая прибыль после топлива') +
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
        const fuel = fuelEstimate(trip);
        const totalKm = formatKm(trip.totalDistanceMeters);
        const perKm = grossPerKm(trip);
        const paymentType = normalizePaymentType(trip.paymentType);
        const customer = trip.customerName || 'Заказчик не указан';
        const route = trip.route || 'Маршрут не указан';
        const encodedId = routeMapId(trip.id);
        const keyHandler = 'if(event.key===&quot;Enter&quot;||event.key===&quot; &quot;){event.preventDefault();openRouteMapModalEncoded(&quot;' + encodedId + '&quot;)}';
        const files = [
          trip.invoiceFileId ? 'счёт PDF' : '',
          trip.actFileId ? 'акт PDF' : ''
        ].filter(Boolean).join(' · ') || 'PDF не привязаны';

        return '<div class="journal-trip-card" role="button" tabindex="0" title="Открыть карту маршрута" onclick="openRouteMapModalEncoded(&quot;' + encodedId + '&quot;)" onkeydown="' + keyHandler + '">' +
          '<div class="journal-trip-main">' +
            '<div style="min-width:0">' +
              '<div class="journal-trip-kicker">№' + aEsc(num) + ' · ' + aEsc(date) + '</div>' +
              '<div class="journal-trip-title" title="' + aEsc(customer) + '">' + aEsc(customer) + '</div>' +
              '<div class="journal-trip-route" title="' + aEsc(route) + '">' + aEsc(route) + '</div>' +
            '</div>' +
            '<div class="journal-trip-money"><b>' + aEsc(amount) + '</b><span>оборот</span></div>' +
          '</div>' +
          '<div class="journal-trip-strip">' +
            '<span>чистая <b>' + aEsc(net) + '</b></span>' +
            '<span>топливо <b>' + aEsc(money(fuel.cost)) + '</b></span>' +
            '<span>' + (totalKm ? 'круг <b>' + aEsc(totalKm) + '</b>' : 'км не указан') + '</span>' +
            (perKm ? '<span><b>' + aEsc(perKm.toLocaleString('ru-RU')) + ' ₽/км</b></span>' : '') +
            '<span>оплата <b>' + aEsc(paymentLabel(paymentType)) + '</b></span>' +
          '</div>' +
          '<div class="journal-payment" onclick="event.stopPropagation()">' +
            '<button class="' + (paymentType === 'bank' ? 'is-active' : '') + '" onclick="setTripPaymentTypeEncoded(&quot;' + encodedId + '&quot;,&quot;bank&quot;)">Перевод</button>' +
            '<button class="' + (paymentType === 'cash' ? 'is-active' : '') + '" onclick="setTripPaymentTypeEncoded(&quot;' + encodedId + '&quot;,&quot;cash&quot;)">Наличные</button>' +
          '</div>' +
          '<div class="journal-trip-more"><b>Детали рейса</b>' + aEsc(files) + (trip.car ? ' · ' + aEsc(trip.car) : '') + '</div>' +
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
