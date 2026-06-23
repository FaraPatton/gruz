// Analytics dashboard widgets and overview helpers.

function dashboardHeroCard(label, value, hint, trend, tone) {
  const visual = {
    turnover: '<div class="dash-money-visual"><i></i><i></i><i></i></div>',
    profit: '<div class="dash-fuel-visual"><i></i><span></span></div>',
    tax: '<div class="dash-tax-visual"><i></i><i></i><i></i><span></span></div>',
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
    rides: '<i></i><i></i><span></span>',
    avg: '<i></i><span></span>',
    fuel: '<i></i><span></span>',
    tax: '<i></i><i></i><i></i><span></span>'
  }[tone] || '';
  return '<div class="dash-metric-card ' + aEsc(tone || '') + '">' +
    '<div class="dash-metric-sticker" aria-hidden="true">' + sticker + '</div>' +
    '<b>' + aEsc(value) + '</b>' +
    '<span>' + aEsc(label) + '</span>' +
    '<small>' + aEsc(hint) + '</small>' +
  '</div>';
}

function dashboardMonthlyNetChart(values, taxValues, max, labels, selectedYear) {
  const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const active = values.filter(value => Number(value) !== 0).length;
  const period = selectedYear ? String(selectedYear) : 'все годы';
  return '<div class="dash-panel dash-turnover-panel dash-net-panel">' +
    '<div class="dash-panel-head"><b>Прибыль с учетом трат на топливо (без налога)</b><span>' + aEsc(period) + '</span></div>' +
    '<div class="dash-turnover-summary">' +
      '<b>' + aEsc(money(total)) + '</b>' +
      '<small>' + aEsc(active ? active + ' мес. с результатом' : 'нет данных') + '</small>' +
    '</div>' +
    '<div class="dash-month-grid">' +
      values.map((value, i) => {
        const width = value ? Math.max(4, Math.round(Math.abs(value) / (max || 1) * 100)) : 0;
        const tone = value < 0 ? ' is-negative' : '';
        return '<div class="dash-month-cell' + tone + '" title="' + aEsc(labels[i] + ': ' + money(value)) + '">' +
          '<div><span>' + aEsc(labels[i]) + '</span><b>' + (value ? aEsc(shortMoney(value)) : '—') + '</b></div>' +
          '<small class="dash-month-tax">(налог ~' + aEsc(money(taxValues[i] || 0)) + ')</small>' +
          '<em><i style="width:' + width + '%"></i></em>' +
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
  const netPct = total ? 100 - fuelPct : 0;
  return '<div class="dash-panel dash-money-panel">' +
    '<div class="dash-panel-head"><b>Структура денег</b><span>топливо / чистая</span></div>' +
    '<div class="dash-expense">' +
      '<div class="dash-money-total"><b>' + aEsc(money(total)) + '</b><span>распределено</span></div>' +
      '<div class="dash-money-split" style="--fuel:' + fuelPct + '%"><i></i><span></span></div>' +
      '<div class="dash-expense-list">' +
        dashExpenseRow('Топливо', fuel, fuelPct, '#39d98a') +
        dashExpenseRow('Чистая прибыль', net, netPct, '#4f7cff') +
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

function aiAnalyticsPanel(rows, customers, routes, avgAmt) {
  const bestCustomer = customers[0];
  const bestRoute = routes[0];
  const bestMonth = bestMonthByAmount(rows);
  return '<div class="dash-ai-panel">' +
    '<div class="dash-ai-copy">' +
      '<div class="dash-panel-head"><b>AI-аналитика</b><span>обзор</span></div>' +
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
