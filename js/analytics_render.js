// Analytics rendering entry point.

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
  const periodTrips = selectedYear ? trips.filter(e => e.year === selectedYear) : trips;
  if (!['all', 'bank', 'cash', 'unknown'].includes(analyticsPaymentFilter)) analyticsPaymentFilter = 'all';
  const filtered = analyticsPaymentFilter === 'all'
    ? periodTrips
    : periodTrips.filter(e => normalizePaymentType(e.paymentType) === analyticsPaymentFilter);

  if (!trips.length) {
    renderRegistryEmpty(panel);
    return;
  }

  const totalRides = filtered.length;
  const totalAmt = filtered.reduce((sum, e) => sum + e.amount, 0);
  const totalNet = filtered.reduce((sum, e) => sum + netProfit(e), 0);
  const totalFuel = filtered.reduce((sum, e) => sum + fuelEstimate(e).cost, 0);
  const avgAmt = totalRides ? Math.round(totalAmt / totalRides) : 0;
  const taxRows = selectedYear ? filtered : currentYearTrips(filtered);
  const totalTax = sumUsnTax(taxRows);
  const totalAfterTax = sumNetAfterTax(taxRows);
  const taxHint = selectedYear ? 'УСН за ' + selectedYear : 'УСН с начала года';
  const afterTaxHint = selectedYear ? 'за ' + selectedYear : 'с начала года';
  const missingDistanceRows = filtered.filter(needsDistance);
  const paymentStats = paymentSummary(periodTrips);
  const monthly = Array(12).fill(0);
  const monthlyNet = Array(12).fill(0);
  const monthlyNetTax = Array(12).fill(0);
  const monthlyTax = Array(12).fill(0);
  const monthlyAfterTax = Array(12).fill(0);
  filtered.forEach(e => {
    if (e.month >= 1 && e.month <= 12) {
      monthly[e.month - 1]++;
      monthlyNet[e.month - 1] += netProfit(e);
      monthlyNetTax[e.month - 1] += usnTax(e);
    }
  });
  taxRows.forEach(e => {
    if (e.month >= 1 && e.month <= 12) {
      monthlyTax[e.month - 1] += usnTax(e);
      monthlyAfterTax[e.month - 1] += netAfterTax(e);
    }
  });
  const maxM = Math.max(...monthly, 1);
  const maxMonthNet = Math.max(...monthlyNet.map(value => Math.abs(value)), 1);
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
    dashboardMonthlyNetChart(monthlyNet, monthlyNetTax, maxMonthNet, monthNames, selectedYear) +
    '<div class="dash-hero-grid">' +
      dashboardHeroCard('Оборот', money(totalAmt), 'по выбранному периоду', '↗', 'turnover') +
      dashboardHeroCard('Чистая прибыль', money(totalNet), 'после топлива', '↗', 'profit') +
      dashboardHeroCard('После налога', money(totalAfterTax), afterTaxHint, '6%', 'rate') +
    '</div>' +
    '<div class="dash-mini-grid">' +
      dashboardMetricCard('rides', totalRides, 'рейсов', 'закрыто в периоде', '↗') +
      dashboardMetricCard('avg', money(avgAmt), 'средний чек', 'оборот / рейсы', '₽') +
      dashboardMetricCard('fuel', money(totalFuel), 'топливо', '28л/100км, 60 руб/л', 'л') +
      dashboardMetricCard('tax', money(totalTax), 'налоги', taxHint, '6%') +
    '</div>' +
    distanceWarningPanel(missingDistanceRows) +
    aiAnalyticsPanel(filtered, topByMoney, topRoutesByMoney, avgAmt) +
    expenseStructureCard(totalFuel, totalNet);

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
      paymentFilterControls(paymentStats) +
      '<div style="animation:analyticsViewIn .22s ease">' + viewHtml + '</div>' +
      '<button class="bd" onclick="driveCache=null;loadDriveAnalytics(true)" style="margin-top:14px;font-size:13px;padding:11px;border-radius:8px;background:linear-gradient(180deg,var(--ana),var(--ana2));color:#08140f;border:0">Обновить из trips.json</button>' +
    '</div>';
}
