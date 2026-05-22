// ══ PDF Generation ═══════════════════════════════════════════════════
// Шрифт Roboto загружается с Google Fonts при первом вызове (кириллица ✓)

let _fontReady = false;

async function ensureFont(doc) {
  if (_fontReady) { doc.setFont('L', 'normal'); return; }
  try {
    const [rR, rB] = await Promise.all([
      fetch('https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf'),
      fetch('https://fonts.gstatic.com/s/roboto/v32/KFOlCnqEu92Fr1MmWUlfBBc9.ttf')
    ]);
    async function ttf2b64(r) {
      const buf = await r.arrayBuffer();
      const u = new Uint8Array(buf);
      let s = '';
      for (let i = 0; i < u.length; i += 8192)
        s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
      return btoa(s);
    }
    const [b64R, b64B] = await Promise.all([ttf2b64(rR), ttf2b64(rB)]);
    doc.addFileToVFS('LR.ttf', b64R);
    doc.addFont('LR.ttf', 'L', 'normal');
    doc.addFileToVFS('LB.ttf', b64B);
    doc.addFont('LB.ttf', 'L', 'bold');
    _fontReady = true;
  } catch (e) {
    console.warn('Шрифт не загружен, используется helvetica:', e.message);
  }
  doc.setFont(_fontReady ? 'L' : 'helvetica', 'normal');
}

function nDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

function sf(doc, s, b) {
  doc.setFont(_fontReady ? 'L' : 'helvetica', b ? 'bold' : 'normal');
  doc.setFontSize(s);
}
function tw(doc, t) { return doc.getTextWidth(t); }
function tR(doc, t, rx, y) { doc.text(t, rx - tw(doc, t), y); }
function tC(doc, t, cx, y) { doc.text(t, cx - tw(doc, t) / 2, y); }
function jl(doc, lines, x, y, mW, lH) {
  lines.forEach((ln, i) => {
    const last = i === lines.length - 1;
    const ws = ln.trim().split(/\s+/);
    if (last || ws.length < 2) { doc.text(ws.join(' '), x, y + i * lH); return; }
    const wW = ws.reduce((a, w) => a + tw(doc, w), 0);
    const gap = (mW - wW) / (ws.length - 1);
    let cx = x;
    ws.forEach(w => { doc.text(w, cx, y + i * lH); cx += tw(doc, w) + gap; });
  });
}

// ── Таблица услуг ──────────────────────────────────────────────────────
function drawServiceBlock(doc, d, y, ml, cw, colHeader) {
  const tc = [8, 110, 16, 14, 22, 20];
  const tx = [ml];
  for (let i = 0; i < tc.length - 1; i++) tx.push(tx[i] + tc[i]);
  const tW = tc.reduce((a, b) => a + b, 0);
  const hdrH = 9;
  doc.setFillColor(228, 228, 228);
  doc.rect(tx[0], y, tW, hdrH, 'F');
  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(tx[0], y, tW, hdrH);
  tx.forEach((x, i) => { if (i > 0) doc.line(x, y, x, y + hdrH); });
  ['№', colHeader, 'Кол-во', 'Ед.', 'Цена', 'Сумма'].forEach((h, i) => {
    sf(doc, 9.5, true); doc.setTextColor(30, 30, 30);
    tC(doc, h, tx[i] + tc[i] / 2, y + hdrH / 2 + 1.8);
  });
  doc.setTextColor(0, 0, 0); y += hdrH;

  const desc = 'Транспортные услуги по перевозке груза по маршруту: ' +
    d.route + ', ' + d.car + ', Карпов С.В., дата загрузки - ' +
    d.loadDate + ', дата выгрузки - ' + d.unloadDate + '.';
  sf(doc, 9.5, false);
  const dl = doc.splitTextToSize(desc, tc[1] - 4);
  const svcH = Math.max(dl.length * 5.0 + 6, 14);
  doc.rect(tx[0], y, tW, svcH);
  tx.forEach((x, i) => { if (i > 0) doc.line(x, y, x, y + svcH); });
  sf(doc, 10, false);
  tC(doc, '1', tx[0] + tc[0] / 2, y + svcH / 2 + 1.8);
  jl(doc, dl, tx[1] + 2, y + 5.5, tc[1] - 4, 5.0);
  tC(doc, '1', tx[2] + tc[2] / 2, y + svcH / 2 + 1.8);
  tR(doc, d.amountFmt, tx[4] + tc[4] - 2, y + svcH / 2 + 1.8);
  tR(doc, d.amountFmt, tx[5] + tc[5] - 2, y + svcH / 2 + 1.8);
  y += svcH;

  const totX = tx[2], totW = tc[2] + tc[3] + tc[4] + tc[5], splitX = tx[5], totH = 8;
  [['Итого:', d.amountFmt], ['Без налога (НДС):', '-'], ['Всего к оплате:', d.amountFmt]].forEach(([l, v], idx) => {
    doc.rect(totX, y, totW, totH); doc.line(splitX, y, splitX, y + totH);
    sf(doc, 10, idx === 2); doc.setTextColor(70, 70, 70);
    tR(doc, l, splitX - 2, y + totH / 2 + 1.8);
    doc.setTextColor(0, 0, 0); sf(doc, 10, idx === 2);
    tR(doc, v, totX + totW - 2, y + totH / 2 + 1.8);
    y += totH;
  });
  doc.setTextColor(0, 0, 0);
  return y;
}

// ── Счёт на оплату ─────────────────────────────────────────────────────
async function genInvoice() {
  const btn = document.querySelector('[onclick="genInvoice()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Генерация...'; }
  try {
    const d = getData(), doc = nDoc();
    await ensureFont(doc);
    const ml = 10, cw = 190; let y = 8;
    const c1 = 30, c2 = 60, c3 = 22, rh = 11;

    function hr(cells, ry, bg) {
      const ws = [c1, c2, c3, cw - c1 - c2 - c3];
      doc.setDrawColor(0); doc.setLineWidth(0.25);
      if (bg) { doc.setFillColor(...bg); doc.rect(ml, ry, cw, rh, 'F'); }
      doc.rect(ml, ry, cw, rh); let cx = ml;
      cells.forEach((cell, i) => {
        if (i > 0) doc.line(cx, ry, cx, ry + rh);
        sf(doc, cell.sz || 8, cell.b || false);
        doc.setTextColor(...(cell.col || [0, 0, 0]));
        const ll = doc.splitTextToSize(cell.t || '', ws[i] - 4);
        const lh = (cell.sz || 8) * 0.42;
        const ty = ry + rh / 2 - ll.length * lh / 2 + lh * 0.72;
        ll.forEach((l, j) => doc.text(l, cx + 2, ty + j * lh));
        cx += ws[i];
      });
      doc.setTextColor(0, 0, 0);
    }

    hr([
      { t: 'Получатель', b: true, col: [70, 70, 70], sz: 10.5 },
      { t: 'ИП Карпов Сергей Викторович', b: true, sz: 12 },
      { t: 'Банк', b: true, col: [70, 70, 70], sz: 10.5 },
      { t: 'ПАО СБЕРБАНК г. Москва', sz: 11 }
    ], y, [242, 242, 242]); y += rh;
    hr([
      { t: 'ИНН', col: [100, 100, 100], sz: 9.5 }, { t: '771313296859', sz: 10 },
      { t: 'БИК', col: [100, 100, 100], sz: 9.5 }, { t: '044525225', sz: 10 }
    ], y); y += rh;
    hr([
      { t: 'Сч. №', col: [100, 100, 100], sz: 10.5 }, { t: '30101810400000000225', sz: 11 },
      { t: 'Сч. №', col: [100, 100, 100], sz: 10.5 }, { t: '40802810438000085714', sz: 11 }
    ], y); y += rh;

    doc.rect(ml, y, cw, rh); doc.line(ml + c1, y, ml + c1, y + rh);
    sf(doc, 9.5, false); doc.setTextColor(100, 100, 100);
    doc.text('Адрес / Тел.', ml + 2, y + rh / 2 + 1.8);
    doc.setTextColor(0, 0, 0); sf(doc, 10, false);
    const aL = doc.splitTextToSize('127591 г. Москва, Керамический пр. д.65, к.2, кв.186  тел. 8-964-785-13-86', cw - c1 - 4);
    jl(doc, aL, ml + c1 + 2, y + rh / 2 - aL.length * 5 / 2 + 5 * 0.72, cw - c1 - 4, 5);
    y += rh + 6;

    sf(doc, 13, true);
    doc.text('Счёт на оплату №' + d.num + ' от ' + d.docDate, ml, y);
    y += 2; doc.setLineWidth(1); doc.line(ml, y + 1, ml + cw, y + 1); y += 8;

    ['Заказчик:', 'Плательщик:'].forEach(lbl => {
      const cf = d.customerName + ', ИНН ' + d.customerInn + ', КПП ' + d.customerKpp + ', ' + d.customerAddr;
      sf(doc, 10, false);
      const cl = doc.splitTextToSize(cf, cw - 32);
      const rH = cl.length * 4 + 5;
      doc.rect(ml, y, cw, rH); doc.line(ml + 28, y, ml + 28, y + rH);
      sf(doc, 10, true); doc.setTextColor(50, 50, 50);
      doc.text(lbl, ml + 2, y + rH / 2 + 1.8);
      doc.setTextColor(0, 0, 0); sf(doc, 10, false);
      jl(doc, cl, ml + 30, y + 4.5, cw - 32, 5);
      y += rH;
    }); y += 4;

    y = drawServiceBlock(doc, d, y, ml, cw, 'Товары (работы, услуги)'); y += 2;

    const sp = tw(doc, ' ');
    const l1 = 'Всего оказано услуг 1, на сумму:';
    sf(doc, 10, false); doc.text(l1, ml, y);
    sf(doc, 10.5, true); doc.text(d.amountInt + ' руб 00 коп.', ml + tw(doc, l1) + sp, y); y += 5;
    const l2 = 'Всего оказано услуг на сумму:';
    sf(doc, 10, false); doc.text(l2, ml, y);
    sf(doc, 10.5, true); doc.text(d.amountWords, ml + tw(doc, l2) + sp, y); y += 9;

    doc.setLineWidth(1.2); doc.line(ml, y, ml + cw, y); y += 13;
    const ss = ml + 27, se = ml + 80;
    sf(doc, 10, false); doc.text('Исполнитель', ml, y);
    doc.setLineWidth(0.3); doc.line(ss, y + 1, se, y + 1);
    sf(doc, 9, false); doc.setTextColor(130, 130, 130);
    tC(doc, '(подпись)', (ss + se) / 2, y + 5);
    doc.setTextColor(0, 0, 0); sf(doc, 10, true);
    doc.text('Карпов С.В.', se + 3, y);

    if (stampUrl && isStampEnabled()) {
      try { doc.addImage(stampUrl, 'PNG', (ss + se) / 2 - 16, y - 13, 32, 22, undefined, 'FAST'); } catch (e) { }
    }

    doc.save('schet_' + d.num + '_' + d.docDate.replace(/\./g, '-') + '.pdf');
    showToast('✅ Счёт сохранён!');
  } catch (e) {
    showToast('Ошибка: ' + e.message); console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 Счёт'; }
  }
}

// ── Акт сдачи-приёмки ──────────────────────────────────────────────────
async function genAct() {
  const btn = document.querySelector('[onclick="genAct()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Генерация...'; }
  try {
    const d = getData(), doc = nDoc();
    await ensureFont(doc);
    const ml = 10, cw = 190; let y = 8;
    const half = cw / 2, lW = 28;

    function mb(rows, bW) {
      let h = 8;
      rows.forEach(r => {
        sf(doc, r.big ? 10.5 : 9.5, r.big || false);
        const ll = doc.splitTextToSize(r.value || '', bW - lW - 4);
        h += ll.length * 5.2 + 2;
      });
      return h + 4;
    }

    const eR = [
      { label: 'Исполнитель', value: 'ИП Карпов Сергей Викторович', big: true },
      { label: 'ИНН', value: '771313296859' },
      { label: 'ОГРН', value: '318774600201147' },
      { label: 'Адрес', value: '127591 г. Москва, Керамический пр. д.65, к.2, кв.186' },
      { label: 'Тел.', value: '8-964-785-13-86' }
    ];
    const cR = [
      { label: 'Заказчик', value: d.customerName, big: true },
      { label: 'ИНН', value: d.customerInn },
      { label: 'КПП', value: d.customerKpp },
      { label: 'Адрес', value: d.customerAddr }
    ];

    const shH = Math.max(mb(eR, half), mb(cR, half));
    doc.rect(ml, y, cw, shH); doc.line(ml + half, y, ml + half, y + shH);

    function db(rows, sX, bW, sY) {
      let ry = sY + 8;
      rows.forEach(r => {
        sf(doc, 9.5, false); doc.setTextColor(110, 110, 110);
        doc.text(r.label + ':', sX + 2, ry);
        sf(doc, r.big ? 10.5 : 9.5, r.big || false); doc.setTextColor(0, 0, 0);
        const ll = doc.splitTextToSize(r.value || '', bW - lW - 4);
        ll.forEach((l, i) => doc.text(l, sX + lW, ry + i * 5.2));
        ry += ll.length * 5.2 + 2;
      });
    }
    db(eR, ml, half, y); db(cR, ml + half, half, y); y += shH + 4;

    sf(doc, 12, true);
    const at = 'АКТ СДАЧИ-ПРИЁМКИ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) №' + d.num + ' от ' + d.actDate;
    const al = doc.splitTextToSize(at, cw);
    al.forEach((l, i) => tC(doc, l, ml + cw / 2, y + 3 + i * 5.2));
    y += 3 + al.length * 5.2 + 3;
    doc.setLineWidth(1.1); doc.line(ml, y, ml + cw, y); y += 7;

    y = drawServiceBlock(doc, d, y, ml, cw, 'Наименование работ, услуг'); y += 2;

    const sp = tw(doc, ' ');
    const l1 = 'Всего оказано услуг 1, на сумму:';
    sf(doc, 10, false); doc.text(l1, ml, y);
    sf(doc, 10.5, true); doc.text(d.amountInt + ' руб 00 коп.', ml + tw(doc, l1) + sp, y); y += 5;
    const l2 = 'Всего оказано услуг на сумму:';
    sf(doc, 10, false); doc.text(l2, ml, y);
    sf(doc, 10.5, true); doc.text(d.amountWords, ml + tw(doc, l2) + sp, y); y += 5;

    sf(doc, 9.5, false); doc.setTextColor(60, 60, 60);
    const nl = doc.splitTextToSize('Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.', cw);
    doc.text(nl, ml, y); y += nl.length * 4 + 5; doc.setTextColor(0, 0, 0);

    doc.setLineWidth(1.1); doc.line(ml, y, ml + cw, y); y += 13;
    const ss = ml + 27, se = ml + 82;
    sf(doc, 10, false); doc.text('Исполнитель', ml, y);
    doc.setLineWidth(0.3); doc.line(ss, y + 1, se, y + 1);
    sf(doc, 9, false); doc.setTextColor(130, 130, 130);
    tC(doc, '(подпись)', (ss + se) / 2, y + 5);
    doc.setTextColor(0, 0, 0); sf(doc, 10, true);
    doc.text('Карпов С.В.', se + 3, y);

    if (stampUrl && isStampEnabled()) {
      try { doc.addImage(stampUrl, 'PNG', (ss + se) / 2 - 16, y - 13, 32, 22, undefined, 'FAST'); } catch (e) { }
    }

    const rx = ml + cw / 2 + 20;
    sf(doc, 10, false); doc.setTextColor(0, 0, 0);
    doc.text('Заказчик', rx, y);
    doc.setLineWidth(0.3); doc.line(rx + 22, y + 1, ml + cw, y + 1);
    sf(doc, 9, false); doc.setTextColor(130, 130, 130);
    tC(doc, '(подпись)', (rx + 22 + ml + cw) / 2, y + 5);
    doc.setTextColor(0, 0, 0);

    doc.save('akt_' + d.num + '_' + d.actDate.replace(/\./g, '-') + '.pdf');
    showToast('✅ Акт сохранён!');
  } catch (e) {
    showToast('Ошибка: ' + e.message); console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📋 Акт'; }
  }
}
