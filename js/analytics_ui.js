// Analytics shared UI helpers.

function formatIsoDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
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

function setAnalyticsMonth(month) {
  const value = Number(month);
  const nextMonth = value >= 1 && value <= 12 ? value : new Date().getMonth() + 1;
  if (nextMonth === analyticsMonth) return;
  analyticsMonthDirection = nextMonth > analyticsMonth ? 1 : -1;
  analyticsMonth = nextMonth;
  renderDriveAnalytics(driveCache || [], analyticsYear, document.getElementById('analyticsPanel'));
}

function dashboardMonthFilter(selectedMonth, selectedYear, labels) {
  return '<div class="dash-month-switcher">' +
    '<div class="dash-month-switcher-head"><span>Отчетный месяц</span><b>' + aEsc(selectedYear) + '</b></div>' +
    '<div class="dash-month-buttons">' +
      labels.map((label, index) => {
        const month = index + 1;
        const active = month === selectedMonth;
        return '<button class="dash-month-button' + (active ? ' is-active' : '') + '" onclick="setAnalyticsMonth(' + month + ')" aria-pressed="' + active + '">' +
          '<span>' + aEsc(label) + '</span><i></i>' +
        '</button>';
      }).join('') +
    '</div>' +
  '</div>';
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

function shortMoney(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return Math.round(n / 100000) / 10 + 'м';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + 'к';
  return String(n);
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
