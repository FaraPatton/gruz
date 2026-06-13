// Analytics journal rendering.

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

