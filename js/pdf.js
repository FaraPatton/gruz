// ══ PDF Generation ═══════════════════════════════════════════════════

// ── Font setup ────────────────────────────────────────────────────────
// Используем встроенный шрифт jsPDF (Helvetica) с поддержкой кириллицы через UTF-8
function setupFonts(doc) {
  // jsPDF встроенные шрифты не поддерживают кириллицу напрямую.
  // Используем workaround: устанавливаем helvetica и включаем unicode
  doc.setFont('helvetica', 'normal');
}

// ── Helpers ───────────────────────────────────────────────────────────
function nDoc() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
  return doc;
}
function sf(doc, s, b) { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(s); }
function tw(doc, t)    { return doc.getTextWidth(t); }
function tR(doc, t, rx, y) { doc.text(t, rx - tw(doc, t), y); }
function tC(doc, t, cx, y) { doc.text(t, cx - tw(doc, t) / 2, y); }
function jl(doc, lines, x, y, mW, lH) {
  lines.forEach((ln, i) => {
    const last = i === lines.length - 1;
    const ws = ln.trim().split(/\s+/);
    if (last || ws.length < 2) { doc.text(ws.join(' '), x, y + i * lH); return; }
    const wW  = ws.reduce((a, w) => a + tw(doc, w), 0);
    const gap = (mW - wW) / (ws.length - 1);
    let cx = x;
    ws.forEach(w => { doc.text(w, cx, y + i * lH); cx += tw(doc, w) + gap; });
  });
}

// ── Service table ──────────────────────────────────────────────────────
function drawServiceBlock(doc, d, y, ml, cw, colHeader) {
  const tc = [8, 110, 16, 14, 22, 20];
  const tx = [ml];
  for (let i = 0; i < tc.length - 1; i++) tx.push(tx[i] + tc[i]);
  const tW = tc.reduce((a, b) => a + b, 0);
  const hdrH = 9;
  doc.setFillColor(228, 228, 228);
  doc.rect(tx[0], y, tW, hdrH, 'F');
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(tx[0], y, tW, hdrH);
  tx.forEach((x, i) => { if (i > 0) doc.line(x, y, x, y + hdrH); });
  ['No', colHeader, 'Kol', 'Ed.', 'Cena', 'Summa'].forEach((h, i) => {
    sf(doc, 9.5, true);
    doc.setTextColor(30, 30, 30);
    tC(doc, h, tx[i] + tc[i] / 2, y + hdrH / 2 + 1.8);
  });
  doc.setTextColor(0, 0, 0);
  y += hdrH;

  const descText = 'Transport. uslugi po perevozke gruza: ' + d.route + ', ' + d.car +
    ', Karpov S.V., data zagruzki - ' + d.loadDate + ', data vygruzki - ' + d.unloadDate + '.';
  sf(doc, 9.5, false);
  const descLines = doc.splitTextToSize(descText, tc[1] - 4);
  const svcH = Math.max(descLines.length * 5.0 + 6, 14);
  doc.rect(tx[0], y, tW, svcH);
  tx.forEach((x, i) => { if (i > 0) doc.line(x, y, x, y + svcH); });
  sf(doc, 10.0, false);
  tC(doc, '1', tx[0] + tc[0] / 2, y + svcH / 2 + 1.8);
  jl(doc, descLines, tx[1] + 2, y + 5.5, tc[1] - 4, 5.0);
  sf(doc, 10.0, false);
  tC(doc, '1', tx[2] + tc[2] / 2, y + svcH / 2 + 1.8);
  tR(doc, d.amountFmt, tx[4] + tc[4] - 2, y + svcH / 2 + 1.8);
  tR(doc, d.amountFmt, tx[5] + tc[5] - 2, y + svcH / 2 + 1.8);
  y += svcH;

  const totX = tx[2], totW = tc[2] + tc[3] + tc[4] + tc[5], splitX = tx[5], totH = 8;
  [['Itogo:', d.amountFmt], ['Bez NDS:', '-'], ['Vsego k oplate:', d.amountFmt]].forEach(([l, v], idx) => {
    doc.rect(totX, y, totW, totH);
    doc.line(splitX, y, splitX, y + totH);
    sf(doc, 10.0, idx === 2);
    doc.setTextColor(70, 70, 70);
    tR(doc, l, splitX - 2, y + totH / 2 + 1.8);
    doc.setTextColor(0, 0, 0);
    sf(doc, 10.0, idx === 2);
    tR(doc, v, totX + totW - 2, y + totH / 2 + 1.8);
    y += totH;
  });
  doc.setTextColor(0, 0, 0);
  return y;
}

// ── Invoice (Schet) ────────────────────────────────────────────────────
function genInvoice() {
  const d = getData();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ml = 10, cw = 190;
  let y = 8;
  const c1 = 30, c2 = 60, c3 = 22, c4 = cw - c1 - c2 - c3, rh = 11;

  function hr(cells, ry, bg) {
    const ws = [c1, c2, c3, c4];
    doc.setDrawColor(0); doc.setLineWidth(0.25);
    if (bg) { doc.setFillColor(...bg); doc.rect(ml, ry, cw, rh, 'F'); }
    doc.rect(ml, ry, cw, rh);
    let cx = ml;
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
    { t: 'Poluchatel', b: true, col: [70,70,70], sz: 10.5 },
    { t: 'IP Karpov Sergey Viktorovich', b: true, sz: 12.0 },
    { t: 'Bank', b: true, col: [70,70,70], sz: 10.5 },
    { t: 'PAO SBERBANK g. Moskva', sz: 11.0 }
  ], y, [242,242,242]); y += rh;
  hr([
    { t: 'INN', col: [100,100,100], sz: 9.5 }, { t: '771313296859', sz: 10.0 },
    { t: 'BIK', col: [100,100,100], sz: 9.5 }, { t: '044525225', sz: 10.0 }
  ], y); y += rh;
  hr([
    { t: 'Sch.No', col: [100,100,100], sz: 10.5 }, { t: '30101810400000000225', sz: 11.0 },
    { t: 'Sch.No', col: [100,100,100], sz: 10.5 }, { t: '40802810438000085714', sz: 11.0 }
  ], y); y += rh;

  const rh4 = 11;
  doc.rect(ml, y, cw, rh4); doc.line(ml + c1, y, ml + c1, y + rh4);
  sf(doc, 9.5, false); doc.setTextColor(100,100,100); doc.text('Adres/Tel.', ml + 2, y + rh4/2 + 1.8);
  doc.setTextColor(0,0,0); sf(doc, 10.0, false);
  const aL = doc.splitTextToSize('127591 g. Moskva, Keramicheskiy pr. d.65, k.2, kv.186 tel. 8-964-785-13-86', cw - c1 - 4);
  jl(doc, aL, ml + c1 + 2, y + rh4/2 - aL.length * 5.0/2 + 5.0*0.72, cw - c1 - 4, 5.0);
  y += rh4 + 6;

  sf(doc, 13.0, true);
  doc.text('Schet na oplatu No' + d.num + ' ot ' + d.docDate, ml, y);
  y += 2; doc.setLineWidth(1.0); doc.line(ml, y + 1, ml + cw, y + 1); y += 8;

  ['Zakazchik:', 'Platelshhik:'].forEach(lbl => {
    const cf = d.customerName + ', INN ' + d.customerInn + ', KPP ' + d.customerKpp + ', ' + d.customerAddr;
    sf(doc, 10.0, false);
    const cl = doc.splitTextToSize(cf, cw - 32);
    const rH = cl.length * 4 + 5;
    doc.rect(ml, y, cw, rH); doc.line(ml + 28, y, ml + 28, y + rH);
    sf(doc, 10.0, true); doc.setTextColor(50,50,50); doc.text(lbl, ml + 2, y + rH/2 + 1.8);
    doc.setTextColor(0,0,0); sf(doc, 10.0, false);
    jl(doc, cl, ml + 30, y + 4.5, cw - 32, 5.0);
    y += rH;
  });
  y += 4;

  y = drawServiceBlock(doc, d, y, ml, cw, 'Uslugi'); y += 2;

  const spW = tw(doc, ' ');
  sf(doc, 10.0, false); doc.text('Vsego uslug 1, na summu:', ml, y);
  sf(doc, 10.5, true);
  doc.text(d.amountInt + ' rub 00 kop', ml + tw(doc, 'Vsego uslug 1, na summu:') + spW, y);
  y += 5;
  sf(doc, 10.0, false); doc.text('Vsego na summu:', ml, y);
  sf(doc, 10.5, true);
  doc.text(d.amountWords, ml + tw(doc, 'Vsego na summu:') + spW, y);
  y += 9;

  doc.setLineWidth(1.2); doc.line(ml, y, ml + cw, y); y += 13;

  const ss = ml + 27, se = ml + 80;
  sf(doc, 10.0, false); doc.text('Ispolnitel', ml, y);
  doc.setLineWidth(0.3); doc.line(ss, y + 1, se, y + 1);
  sf(doc, 9.0, false); doc.setTextColor(130,130,130);
  tC(doc, '(podpis)', (ss + se) / 2, y + 5);
  doc.setTextColor(0,0,0); sf(doc, 10.0, true); doc.text('Karpov S.V.', se + 3, y);

  if (stampUrl && isStampEnabled()) {
    try { doc.addImage(stampUrl, 'PNG', (ss+se)/2 - 16, y - 13, 32, 22, undefined, 'FAST'); } catch(e) {}
  }

  doc.save('schet_' + d.num + '_' + d.docDate.replace(/\./g, '-') + '.pdf');
  showToast('Schet sohranyon!');
}

// ── Act ────────────────────────────────────────────────────────────────
function genAct() {
  const d = getData();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ml = 10, cw = 190;
  let y = 8;
  const half = cw / 2, lW = 28;

  function mb(rows, bW) {
    let h = 8;
    rows.forEach(r => {
      sf(doc, r.big ? 10.5 : 9.5, r.big || false);
      const ll = doc.splitTextToSize(r.value, bW - lW - 4);
      h += ll.length * 5.2 + 2;
    });
    return h + 4;
  }

  const eR = [
    { label: 'Ispolnitel', value: 'IP Karpov Sergey Viktorovich', big: true },
    { label: 'INN', value: '771313296859' },
    { label: 'OGRN', value: '318774600201147' },
    { label: 'Adres', value: '127591 g. Moskva, Keramicheskiy pr. d.65, k.2, kv.186' },
    { label: 'Tel.', value: '8-964-785-13-86' }
  ];
  const cR = [
    { label: 'Zakazchik', value: d.customerName, big: true },
    { label: 'INN', value: d.customerInn },
    { label: 'KPP', value: d.customerKpp },
    { label: 'Adres', value: d.customerAddr }
  ];

  const shH = Math.max(mb(eR, half), mb(cR, half));
  doc.rect(ml, y, cw, shH); doc.line(ml + half, y, ml + half, y + shH);

  function db(rows, sX, bW, sY) {
    let ry = sY + 8;
    rows.forEach(r => {
      sf(doc, 9.5, false); doc.setTextColor(110,110,110);
      doc.text(r.label + ':', sX + 2, ry);
      sf(doc, r.big ? 10.5 : 9.5, r.big || false); doc.setTextColor(0,0,0);
      const ll = doc.splitTextToSize(r.value || '', bW - lW - 4);
      ll.forEach((l, i) => doc.text(l, sX + lW, ry + i * 5.2));
      ry += ll.length * 5.2 + 2;
    });
  }
  db(eR, ml, half, y); db(cR, ml + half, half, y);
  y += shH + 4;

  sf(doc, 12.0, true);
  const at = 'AKT SDACHI-PRIEMKI VYPOLNENNYKH RABOT No' + d.num + ' ot ' + d.actDate;
  const al = doc.splitTextToSize(at, cw);
  al.forEach((l, i) => tC(doc, l, ml + cw/2, y + 3 + i * 5.2));
  y += 3 + al.length * 5.2 + 3;
  doc.setLineWidth(1.1); doc.line(ml, y, ml + cw, y); y += 7;

  y = drawServiceBlock(doc, d, y, ml, cw, 'Naim. uslug'); y += 2;

  const spW = tw(doc, ' ');
  sf(doc, 10.0, false); doc.text('Vsego uslug 1, na summu:', ml, y);
  sf(doc, 10.5, true);
  doc.text(d.amountInt + ' rub 00 kop', ml + tw(doc, 'Vsego uslug 1, na summu:') + spW, y);
  y += 5;
  sf(doc, 10.0, false); doc.text('Vsego na summu:', ml, y);
  sf(doc, 10.5, true);
  doc.text(d.amountWords, ml + tw(doc, 'Vsego na summu:') + spW, y); y += 5;

  sf(doc, 9.5, false); doc.setTextColor(60,60,60);
  const nl = doc.splitTextToSize('Vysheperechisl. uslugi vypolneny polnostyu i v srok. Zakazchik pretenziy ne imeet.', cw);
  doc.text(nl, ml, y); y += nl.length * 4 + 5; doc.setTextColor(0,0,0);
  doc.setLineWidth(1.1); doc.line(ml, y, ml + cw, y); y += 13;

  const ss = ml + 27, se = ml + 82;
  sf(doc, 10.0, false); doc.text('Ispolnitel', ml, y);
  doc.setLineWidth(0.3); doc.line(ss, y + 1, se, y + 1);
  sf(doc, 9.0, false); doc.setTextColor(130,130,130);
  tC(doc, '(podpis)', (ss + se) / 2, y + 5);
  doc.setTextColor(0,0,0); sf(doc, 10.0, true); doc.text('Karpov S.V.', se + 3, y);

  if (stampUrl && isStampEnabled()) {
    try { doc.addImage(stampUrl, 'PNG', (ss+se)/2 - 16, y - 13, 32, 22, undefined, 'FAST'); } catch(e) {}
  }

  const rx = ml + cw/2 + 20;
  sf(doc, 10.0, false); doc.setTextColor(0,0,0); doc.text('Zakazchik', rx, y);
  doc.setLineWidth(0.3); doc.line(rx + 22, y + 1, ml + cw, y + 1);
  sf(doc, 9.0, false); doc.setTextColor(130,130,130);
  tC(doc, '(podpis)', (rx + 22 + ml + cw) / 2, y + 5);
  doc.setTextColor(0,0,0);

  doc.save('akt_' + d.num + '_' + d.actDate.replace(/\./g, '-') + '.pdf');
  showToast('Akt sohranyom!');
}