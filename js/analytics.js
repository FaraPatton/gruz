// Analytics: fast Drive registry + one-time PDF archive scan

const TRIPS_REGISTRY_NAME = 'trips.json';
const TRIPS_REGISTRY_VERSION = 5;
const EXECUTOR_MARKERS = ['Карпов', '771313296859', '40802810438000085714', 'Керамический', 'СБЕРБАНК'];
const ANALYTICS_GREEN = '#39d98a';
const ANALYTICS_GREEN_DARK = '#1f9d63';
const DEFAULT_FUEL_PRICE_RUB = 60;
const DEFAULT_FUEL_LITERS_PER_100KM = 25;

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
  if (!km) return { liters: 0, cost: Number(trip.fuelCostRub) || 0, net: 0 };
  const litersPer100 = Number(trip.fuelLitersPer100Km || DEFAULT_FUEL_LITERS_PER_100KM) || DEFAULT_FUEL_LITERS_PER_100KM;
  const price = Number(trip.fuelPriceRub || DEFAULT_FUEL_PRICE_RUB) || DEFAULT_FUEL_PRICE_RUB;
  const liters = Number(trip.fuelLiters) || km * litersPer100 / 100;
  const cost = Number(trip.fuelCostRub) || liters * price;
  const net = Math.round((Number(trip.amount) || 0) - cost);
  return {
    liters: Math.round(liters * 10) / 10,
    cost: Math.round(cost),
    net
  };
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
  if (!routeBaseAddress()) return '';
  return '<div class="' + mode + '-route-metrics is-pending"><span>Км: <b>нужно рассчитать</b></span></div>';
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
      '<label class="manual-save-check" title="Сохранить километраж">' +
        '<input id="manualRouteKmSave" type="checkbox" onchange="saveManualRouteKmEncoded(&quot;' + routeMapId(trip.id) + '&quot;)">' +
        '<span class="manual-save-box"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 9.5 7.4 13 14.4 5"></path></svg></span>' +
        '<span class="manual-save-text">Сохранить</span>' +
      '</label>' +
    '</div>' +
    '<p>Топливо считается автоматически: 25 л / 100 км, 60 руб / л.</p>' +
  '</div>';
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
  const mapsUrl = routeYandexMapsUrl(trip);
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
    buildManualKmHtml(trip) +
    '<div class="route-map-actions">' +
      (mapsUrl ? '<a class="route-map-yandex-btn" href="' + aEsc(mapsUrl) + '" target="_blank" rel="noopener">' +
        '<span class="route-map-yandex-icon">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4Z"></path></svg>' +
        '</span>' +
        '<span class="route-map-yandex-label">Открыть в Яндекс Картах</span>' +
      '</a>' : '') +
    '</div>';
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
  const check = document.getElementById('manualRouteKmSave');
  const km = parseKmValue(input && input.value);
  if (!km) {
    showToast('Укажи километраж круга');
    if (check) check.checked = false;
    if (input) input.focus();
    return;
  }

  const currentTrips = (driveCache || []).map(normalizeTrip).filter(Boolean);
  const trip = currentTrips.find(item => item.id === tripId);
  if (!trip) return;

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
}

function saveManualRouteKmEncoded(encodedTripId) {
  saveManualRouteKm(decodeURIComponent(encodedTripId));
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
    '<style>' +
      '@keyframes analyticsViewIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '.journal-card{position:relative;overflow:hidden;border-radius:18px;padding:1px;background:linear-gradient(135deg,rgba(57,217,138,.65),rgba(137,104,190,.35),rgba(255,255,255,.08));box-shadow:0 18px 34px rgba(0,0,0,.24),0 0 24px rgba(57,217,138,.06);transition:transform .22s ease,box-shadow .22s ease}' +
      '.journal-card:hover{transform:translateY(-2px);box-shadow:0 24px 42px rgba(0,0,0,.3),0 0 30px rgba(57,217,138,.11)}' +
      '.journal-card:before{content:"";position:absolute;width:110px;height:110px;right:-48px;top:-46px;background:radial-gradient(circle,rgba(57,217,138,.28),transparent 62%);transition:transform .35s ease,opacity .35s ease;opacity:.74}' +
      '.journal-card:hover:before{transform:scale(1.25);opacity:1}' +
      '.journal-card-inner{position:relative;z-index:1;border-radius:17px;padding:13px;display:grid;gap:10px;background:linear-gradient(145deg,#241837 0%,#171023 56%,#110d19 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}' +
      '.journal-summary{position:relative;overflow:hidden;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border:1px solid rgba(57,217,138,.35);border-radius:14px;background:linear-gradient(135deg,rgba(57,217,138,.18),rgba(248,251,255,.065));box-shadow:0 12px 26px rgba(57,217,138,.09),inset 0 1px 0 rgba(255,255,255,.07)}' +
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
      '.journal-map-thumb:hover{transform:translateY(-1px);border-color:rgba(57,217,138,.5);box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 16px 34px rgba(0,0,0,.24),0 0 24px rgba(57,217,138,.1)}' +
      '.journal-route-metrics,.route-map-route-metrics{display:flex;gap:6px;flex-wrap:wrap}.journal-route-metrics{margin-top:-3px}.route-map-route-metrics{margin-top:10px}.journal-route-metrics span,.route-map-route-metrics span{border:1px solid rgba(57,217,138,.2);border-radius:999px;background:rgba(57,217,138,.07);color:var(--ana-muted);font-size:10px;line-height:1;padding:5px 7px;white-space:nowrap}.route-map-route-metrics span{font-size:11px;padding:7px 9px}.journal-route-metrics b,.route-map-route-metrics b{color:var(--ana-text);font-weight:800}.journal-route-metrics.is-pending span,.route-map-route-metrics.is-pending span{border-color:rgba(248,251,255,.16);background:rgba(255,255,255,.045);color:rgba(248,251,255,.58)}' +
      '.route-map-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(4,6,10,.72);backdrop-filter:blur(10px)}' +
      '.route-map-modal.is-open{display:flex}' +
      '.route-map-dialog{position:relative;width:min(760px,100%);border:1px solid rgba(57,217,138,.32);border-radius:12px;background:linear-gradient(180deg,#1b1428,#100d18);box-shadow:0 30px 80px rgba(0,0,0,.55);padding:16px}' +
      '.route-map-close{position:absolute;right:10px;top:10px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:#fff;font-size:24px;line-height:1;cursor:pointer}' +
      '.route-map-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin:0 38px 12px 0}' +
      '.route-map-kicker{font-family:monospace;font-size:10px;letter-spacing:0;color:var(--ana)}.route-map-title{font-size:16px;font-weight:800;color:var(--ana-text);margin-top:3px}.route-map-sum{color:var(--ana);font-size:14px;font-weight:800;white-space:nowrap}' +
      '.route-map-large{border-radius:8px;overflow:hidden;border:1px solid rgba(57,217,138,.22);background:rgba(255,255,255,.04);min-height:360px}.route-map-large iframe{width:100%;height:360px;border:0;display:block}.route-map-state{height:100%;min-height:220px;display:flex;align-items:center;justify-content:center;color:var(--ana);font-size:13px;font-weight:800}' +
      '.route-map-error{margin-top:10px;border:1px solid rgba(255,95,95,.32);border-radius:8px;padding:10px;color:#ffb9b9;background:rgba(255,95,95,.08);font-size:12px;line-height:1.45}' +
      '.route-map-customer{margin-top:12px;color:var(--ana);font-size:13px;font-weight:750}.route-map-route{margin-top:5px;color:var(--ana-text);font-size:12px;line-height:1.45}.route-map-meta,.route-map-hint{margin-top:7px;color:var(--ana-muted);font-size:11px;font-family:monospace;letter-spacing:0}.route-map-hint{color:var(--ana)}' +
      '.route-map-manual-km{margin-top:12px;border:1px solid rgba(137,104,190,.28);border-radius:10px;background:rgba(255,255,255,.035);padding:10px}.route-map-manual-km>label:not(.manual-save-check){display:block;color:var(--ana-muted);font-size:10px;font-family:monospace;letter-spacing:0;margin-bottom:6px}.route-map-manual-km>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.route-map-manual-km input{min-width:0;border:1px solid rgba(57,217,138,.24);border-radius:8px;background:rgba(255,255,255,.06);color:var(--ana-text);padding:10px 11px;font-size:14px;outline:0}.route-map-manual-km input:focus{border-color:rgba(57,217,138,.62);box-shadow:0 0 0 3px rgba(57,217,138,.1)}.manual-save-check{display:inline-flex;align-items:center;gap:8px;min-height:40px;border-radius:10px;padding:0 11px;background:rgba(57,217,138,.08);border:1px solid rgba(57,217,138,.28);color:var(--ana-text);cursor:pointer;user-select:none;transition:transform .16s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}.manual-save-check:hover{transform:translateY(-1px);border-color:rgba(57,217,138,.54);box-shadow:0 10px 22px rgba(57,217,138,.12)}.manual-save-check input{position:absolute;opacity:0;pointer-events:none}.manual-save-box{width:22px;height:22px;border-radius:6px;border:2px solid rgba(57,217,138,.72);background:#120e1b;display:grid;place-items:center;transition:background .18s ease,border-color .18s ease,transform .18s ease}.manual-save-box svg{width:17px;height:17px;fill:none;stroke:#07140d;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:24;transition:stroke-dashoffset .22s ease}.manual-save-check input:checked + .manual-save-box{background:linear-gradient(180deg,var(--ana),var(--ana2));border-color:transparent;transform:scale(1.05)}.manual-save-check input:checked + .manual-save-box svg{stroke-dashoffset:0}.manual-save-text{font-size:12px;font-weight:800;white-space:nowrap}.route-map-manual-km p{margin:7px 0 0;color:rgba(248,251,255,.55);font-size:10px;line-height:1.35}' +
      '.route-map-actions{margin-top:14px;display:flex;justify-content:flex-end}' +
      '.route-map-yandex-btn{border:0;border-radius:10px;background:linear-gradient(135deg,#4f7cff 0%,#3163df 100%);color:#fff;padding:13px 18px;min-height:50px;min-width:250px;display:inline-flex;align-items:center;justify-content:center;gap:10px;font-size:17px;font-weight:700;cursor:pointer;overflow:hidden;box-shadow:0 10px 28px rgba(66,133,244,.24);text-decoration:none;-webkit-tap-highlight-color:transparent;transition:transform .16s ease,box-shadow .18s ease,background .18s ease}' +
      '.route-map-yandex-btn .route-map-yandex-label{display:block;transition:transform .28s ease,opacity .28s ease}.route-map-yandex-btn .route-map-yandex-icon{width:22px;height:22px;display:flex;align-items:center;justify-content:center;transition:transform .28s ease}.route-map-yandex-btn svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transform-origin:center;transition:transform .28s ease}' +
      '.route-map-yandex-btn:hover{background:linear-gradient(135deg,#5d8cff 0%,#3a6df0 100%);box-shadow:0 14px 34px rgba(66,133,244,.32);transform:translateY(-1px)}.route-map-yandex-btn:hover .route-map-yandex-icon{animation:sendFloat .62s ease-in-out infinite alternate}.route-map-yandex-btn:hover svg{transform:translateX(13px) rotate(42deg) scale(1.08)}.route-map-yandex-btn:hover .route-map-yandex-label{transform:translateX(72px);opacity:0}.route-map-yandex-btn:active{transform:scale(.97)}' +
      '.analytics-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:16px}' +
      '@media(max-width:430px){.analytics-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.analytics-tabs button:first-child{grid-column:1 / -1}.journal-card-inner{padding:12px}.journal-summary{grid-template-columns:1fr}.journal-stat{border-right:0;border-bottom:1px solid rgba(57,217,138,.18)}.journal-stat:last-child{border-bottom:0}.journal-delete{width:42px;height:42px}.route-map-dialog{padding:13px}.route-map-head{display:block}.route-map-sum{margin-top:6px}.route-map-large{min-height:280px}.route-map-large iframe{height:280px}.route-map-state{min-height:170px}}' +
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
        viewButton('years', 'Годы') +
        viewButton('customers', 'Заказчики') +
        viewButton('routes', 'Маршруты') +
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
        const num = trip.docNum || '—';
        const date = formatIsoDate(trip.date);
        const amount = money(trip.amount);
        const customer = trip.customerName || 'Заказчик не указан';
        const route = trip.route || 'Маршрут не указан';
        const mapHtml = '<div class="journal-map-thumb" role="button" tabindex="0" onclick="openRouteMapModalEncoded(&quot;' + routeMapId(trip.id) + '&quot;)" title="Открыть маршрут"></div>';
        const metricsHtml = routeMetricsHtml(trip, 'journal');
        const files = [
          trip.invoiceFileId ? 'счёт PDF' : '',
          trip.actFileId ? 'акт PDF' : ''
        ].filter(Boolean).join(' · ') || 'PDF не привязаны';

        return '<div class="journal-card"><div class="journal-card-inner">' +
          '<div class="journal-summary">' +
            '<div class="journal-stat"><span>Номер</span><b>№' + aEsc(num) + '</b></div>' +
            '<div class="journal-stat"><span>Дата</span><b>' + aEsc(date) + '</b></div>' +
            '<div class="journal-stat"><span>Сумма</span><b>' + aEsc(amount) + '</b></div>' +
          '</div>' +
          mapHtml +
          metricsHtml +
          '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center">' +
            '<div style="min-width:0;display:grid;gap:5px">' +
              '<div style="color:var(--ana);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + aEsc(customer) + '">' + aEsc(customer) + '</div>' +
              '<div style="color:var(--ana-muted);font-size:11px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="' + aEsc(route) + '">' + aEsc(route) + '</div>' +
              '<div style="color:rgba(248,251,255,.58);font-size:10px;font-family:monospace;letter-spacing:0">' + aEsc(files) + '</div>' +
            '</div>' +
            '<button class="journal-delete" title="Удалить рейс" aria-label="Удалить рейс" onclick="deleteTripFromRegistryEncoded(&quot;' + encodeURIComponent(trip.id) + '&quot;)">' +
              '<span class="journal-delete-cap"></span><span class="journal-delete-top"></span><span class="journal-delete-bottom"></span>' +
            '</button>' +
          '</div>' +
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
window.deleteTripFromRegistryEncoded = deleteTripFromRegistryEncoded;
window.openRouteMapModal = openRouteMapModal;
window.openRouteMapModalEncoded = openRouteMapModalEncoded;
window.saveManualRouteKm = saveManualRouteKm;
window.saveManualRouteKmEncoded = saveManualRouteKmEncoded;
window.closeRouteMapModal = closeRouteMapModal;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAnalyticsButton);
} else {
  bindAnalyticsButton();
}
