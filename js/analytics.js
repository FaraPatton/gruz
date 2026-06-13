// Analytics: fast Drive registry + one-time PDF archive scan

let analyticsView = 'overview';
let analyticsPaymentFilter = 'all';
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
window.setAnalyticsPaymentFilter = setAnalyticsPaymentFilter;
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
