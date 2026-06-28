// Analytics trip parsing and normalization helpers.

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

function upsertTrip(trips, value) {
  const next = normalizeTrip(value);
  if (!next) return mergeTrips(trips || []);

  const remaining = (trips || []).filter(item => {
    const current = normalizeTrip(item);
    return current && current.id !== next.id;
  });
  return mergeTrips([...remaining, next]);
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
