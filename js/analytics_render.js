// Analytics rendering: dashboard, journal, and HTML helpers.

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
      dashboardMetricCard('rides', totalRides, 'рейсов', 'закрыто в периоде', '↗') +
      dashboardMetricCard('avg', money(avgAmt), 'средний чек', 'оборот / рейсы', '₽') +
      dashboardMetricCard('fuel', money(totalFuel), 'топливо', '28л/100км, 60 руб/л', 'л') +
      dashboardMetricCard('tax', money(totalTax), 'налоги', taxHint, '6%') +
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
      paymentFilterControls(paymentStats) +
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

function setAnalyticsPaymentFilter(type) {
  analyticsPaymentFilter = ['all', 'bank', 'cash', 'unknown'].includes(type) ? type : 'all';
  renderDriveAnalytics(driveCache || [], analyticsYear, document.getElementById('analyticsPanel'));
}

function viewButton(view, label) {
  const active = analyticsView === view;
  return '<button onclick="setAnalyticsView(&quot;' + view + '&quot;)" ' +
    'style="min-width:0;background:' + (active ? 'linear-gradient(180deg,rgba(57,217,138,.18),rgba(57,217,138,.08))' : 'rgba(255,255,255,.035)') + ';color:' + (active ? 'var(--ana)' : 'var(--ana-muted)') + ';border:1px solid ' + (active ? 'rgba(57,217,138,.42)' : 'rgba(137,104,190,.24)') + ';border-radius:8px;padding:8px 6px;font-size:11px;font-weight:650;cursor:pointer;transition:.18s ease;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
    label + '</button>';
}

function paymentFilterControls(stat) {
  return '<div class="analytics-payment-filter">' +
    paymentFilterButton('all', 'Все', stat.counts.bank + stat.counts.cash + stat.counts.unknown) +
    paymentFilterButton('bank', 'Перевод', stat.counts.bank) +
    paymentFilterButton('cash', 'Наличные', stat.counts.cash) +
    paymentFilterButton('unknown', 'Не указано', stat.counts.unknown) +
  '</div>';
}

function paymentFilterButton(type, label, count) {
  const active = analyticsPaymentFilter === type;
  return '<button onclick="setAnalyticsPaymentFilter(&quot;' + type + '&quot;)" ' +
    'style="background:' + (active ? 'linear-gradient(180deg,rgba(57,217,138,.18),rgba(57,217,138,.08))' : 'rgba(255,255,255,.035)') + ';color:' + (active ? 'var(--ana)' : 'var(--ana-muted)') + ';border:1px solid ' + (active ? 'rgba(57,217,138,.42)' : 'rgba(137,104,190,.24)') + ';border-radius:999px;padding:6px 9px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">' +
    aEsc(label) + ' <span style="opacity:.62">' + aEsc(count) + '</span></button>';
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

function dashboardMetricCard(tone, value, label, hint, badge) {
  const sticker = {
    rides: '<i></i><i></i><i></i>',
    avg: '<i></i><i></i><span></span>',
    fuel: '<i></i><span></span>',
    tax: '<i></i><i></i><i></i>'
  }[tone] || '';
  return '<div class="dash-metric-card ' + aEsc(tone || '') + '">' +
    '<div class="dash-metric-sticker" aria-hidden="true">' + sticker + '</div>' +
    '<div class="dash-metric-badge">' + aEsc(badge || '') + '</div>' +
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
    '<div class="dash-ai-aside">' +
      '<span><b>' + aEsc(rows.length) + '</b><small>рейсов в выборке</small></span>' +
      '<span><b>' + aEsc(money(avgAmt)) + '</b><small>средний чек</small></span>' +
      '<span><b>' + aEsc(bestMonth ? bestMonth.label : '—') + '</b><small>лучший месяц</small></span>' +
    '</div>' +
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
