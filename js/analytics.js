// ══ Analytics ════════════════════════════════════════════════════════

function toggleAnalytics() {
  const panel = document.getElementById('analyticsPanel');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (open) loadDriveAnalytics();
}

async function loadDriveAnalytics(refresh) {
  const panel = document.getElementById('analyticsPanel');
  if (!gAccessToken) {
    panel.innerHTML = '<div class="dc" style="padding:16px"><p style="text-align:center;color:var(--dan);font-size:12px">Нажмите «Войти в Google» сначала</p></div>';
    return;
  }
  if (driveCache && !refresh) { renderDriveAnalytics(driveCache, analyticsYear, panel); return; }
  panel.innerHTML = '<div class="dc" style="padding:20px;text-align:center"><p style="color:var(--mut);font-size:12px;margin-bottom:8px">⏳ Читаю архив...</p><p id="scanProgress" style="color:var(--acc);font-size:11px;font-family:monospace;letter-spacing:1px">ПОДКЛЮЧАЮСЬ...</p></div>';
  try {
    driveCache = await scanDriveArchive();
    renderDriveAnalytics(driveCache, analyticsYear, panel);
  } catch(e) {
    panel.innerHTML = '<div class="dc" style="padding:16px"><p style="text-align:center;color:var(--dan);font-size:12px">Ошибка: ' + e.message + '</p></div>';
  }
}

function setProgress(txt) { const el = document.getElementById('scanProgress'); if (el) el.textContent = txt; }

async function driveList(parentId, type) {
  const mime = type === 'folder' ? "mimeType='application/vnd.google-apps.folder'" : "mimeType='application/pdf'";
  const q = encodeURIComponent("'" + parentId + "' in parents and " + mime + " and trashed=false");
  const r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&pageSize=1000', {
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  return (await r.json()).files || [];
}

async function readPdfEntry(file) {
  try {
    const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', {
      headers: { Authorization: 'Bearer ' + gAccessToken }
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map(i => i.str).join(' ').replace(/\s+/g,' ');
    return parsePdfText(text, file.year);
  } catch(e) { return null; }
}

function parsePdfText(t, fallbackYear) {
  const dateM  = t.match(/от\s+(\d{2})\.(\d{2})\.(\d{4})/);
  const day    = dateM ? parseInt(dateM[1]) : 1;
  const month  = dateM ? parseInt(dateM[2]) : 1;
  const year   = dateM ? parseInt(dateM[3]) : fallbackYear;
  const amtM   = t.match(/на сумму\s+(\d[\d\s]*)\s+руб/i) || t.match(/Всего к оплате[:\s]+(\d[\d\s,\.]+)/i);
  const amount = amtM ? parseInt(amtM[1].replace(/[\s,\.]/g,'').substring(0,8)) : 0;
  const custM  = t.match(/Заказчик:\s*((?:ООО|ИП|АО|ЗАО)[^,]+)/);
  const customer = custM ? custM[1].trim().replace(/"+$/,'').replace(/^"+/,'') : '';
  if (!year || year < 2015) return null;
  return { day, month, year, amount, customer };
}

async function scanDriveArchive() {
  setProgress('ЧИТАЮ ПАПКИ...');
  const yearFolders = await driveList(ARCHIVE_ROOT, 'folder');
  const allFiles = [];
  for (const folder of yearFolders) {
    const yr = parseInt(folder.name);
    if (isNaN(yr)) continue;
    setProgress('ГОД ' + yr + '...');
    const files = await driveList(folder.id, 'pdf');
    allFiles.push(...files.filter(f => f.name.toLowerCase().startsWith('schet')).map(f => ({...f, year: yr})));
  }
  setProgress('ЧИТАЮ ' + allFiles.length + ' СЧЕТОВ...');
  const entries = [];
  for (let i = 0; i < allFiles.length; i += 10) {
    setProgress(i + '/' + allFiles.length + ' ФАЙЛОВ...');
    const results = await Promise.allSettled(allFiles.slice(i, i+10).map(f => readPdfEntry(f)));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) entries.push(r.value); });
  }
  return entries;
}

function renderDriveAnalytics(entries, yr, panel) {
  const years    = [...new Set(entries.map(e => e.year))].sort((a,b) => b-a);
  const filtered = yr ? entries.filter(e => e.year === yr) : entries;
  const totalRides = filtered.length;
  const totalAmt   = filtered.reduce((s,e) => s+e.amount, 0);
  const avgAmt     = totalRides ? Math.round(totalAmt/totalRides) : 0;
  const monthly    = Array(12).fill(0);
  filtered.forEach(e => { if (e.month>=1&&e.month<=12) monthly[e.month-1]++; });
  const maxM  = Math.max(...monthly, 1);
  const MN    = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const cm    = {};
  filtered.forEach(e => { if (e.customer) cm[e.customer] = (cm[e.customer]||0)+1; });
  const topC  = Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxC  = topC[0]?.[1]||1;
  const yearStats = years.map(y => ({ y, count: entries.filter(e=>e.year===y).length, amt: entries.filter(e=>e.year===y).reduce((s,e)=>s+e.amount,0) }));
  const maxY  = Math.max(...yearStats.map(s=>s.count),1);

  panel.innerHTML = '<div class="dc" style="padding:16px;margin-bottom:0">'
    + '<div style="font-family:monospace;font-size:10px;letter-spacing:2px;color:var(--acc);margin-bottom:12px">АРХИВ DRIVE — АНАЛИТИКА</div>'
    + '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px">'
    + [0,...years].map(y=>'<button onclick="analyticsYear='+y+';renderDriveAnalytics(driveCache,'+y+',document.getElementById('analyticsPanel'))" style="background:'+(y===yr?'var(--acc)':'transparent')+';color:'+(y===yr?'#0f0f11':'var(--mut)')+';border:1px solid '+(y===yr?'var(--acc)':'var(--brd)')+';border-radius:12px;padding:3px 10px;font-size:11px;font-family:monospace;cursor:pointer">'+(y===0?'Все':y)+'</button>').join('')
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">'
    + ['<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:700;color:var(--acc)">'+totalRides+'</div><div style="font-size:10px;color:var(--mut);margin-top:2px">Рейсов</div></div>',
       '<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:8px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:700;color:var(--acc)">'+(totalAmt?totalAmt.toLocaleString('ru-RU')+'₽':'—')+'</div><div style="font-size:10px;color:var(--mut);margin-top:2px">Выручка</div></div>',
       '<div style="background:var(--surf2);border:1px solid var(--brd);border-radius:8px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:700;color:var(--acc)">'+(avgAmt?avgAmt.toLocaleString('ru-RU')+'₽':'—')+'</div><div style="font-size:10px;color:var(--mut);margin-top:2px">Средний чек</div></div>'].join('')
    + '</div>'
    + '<div style="font-family:monospace;font-size:10px;letter-spacing:1px;color:var(--mut);margin-bottom:8px">РЕЙСЫ ПО МЕСЯЦАМ</div>'
    + '<div style="display:flex;align-items:flex-end;gap:3px;height:64px;margin-bottom:18px">'
    + monthly.map((v,i)=>'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:100%;height:'+Math.max(Math.round(v/maxM*56),v>0?3:0)+'px;background:'+(v>0?'var(--acc)':'var(--brd)')+';border-radius:2px 2px 0 0"></div><div style="font-size:8px;color:var(--mut)">'+MN[i]+'</div></div>').join('')
    + '</div>'
    + '<div style="font-family:monospace;font-size:10px;letter-spacing:1px;color:var(--mut);margin-bottom:10px">ПО ГОДАМ</div>'
    + yearStats.map(({y,count,amt})=>'<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="color:var(--txt2);font-family:monospace">'+y+'</span><span style="color:var(--acc)">'+count+' рейсов'+(amt?' · '+amt.toLocaleString('ru-RU')+'₽':'')+'</span></div><div style="height:4px;background:var(--brd);border-radius:2px"><div style="height:100%;width:'+Math.round(count/maxY*100)+'%;background:var(--acc);border-radius:2px"></div></div></div>').join('')
    + (topC.length ? '<div style="font-family:monospace;font-size:10px;letter-spacing:1px;color:var(--mut);margin:14px 0 10px">ТОП ЗАКАЗЧИКИ</div>'+topC.map(([name,cnt],i)=>'<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span style="color:var(--txt2)">'+(i+1)+'. '+name+'</span><span style="color:var(--acc);font-weight:600">'+cnt+' рейсов</span></div><div style="height:4px;background:var(--brd);border-radius:2px"><div style="height:100%;width:'+Math.round(cnt/maxC*100)+'%;background:var(--acc);border-radius:2px"></div></div></div>').join('') : '')
    + '<button class="bd" onclick="driveCache=null;loadDriveAnalytics(true)" style="margin-top:12px;font-size:13px;padding:10px">🔄 Обновить</button>'
    + '</div>';
}