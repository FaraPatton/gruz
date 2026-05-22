// ── PDF helpers ────────────────────────────────────────────────────
function nDoc(){
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4"});
  setupFonts(doc); return doc;
}
function sf(doc,s,b){doc.setFont("L",b?"bold":"normal"); doc.setFontSize(s);}
function tw(doc,t){return doc.getTextWidth(t);}
function tR(doc,t,rx,y){doc.text(t,rx-tw(doc,t),y);}
function tC(doc,t,cx,y){doc.text(t,cx-tw(doc,t)/2,y);}
function jl(doc,lines,x,y,mW,lH){
  lines.forEach((ln,i)=>{
    const last=i===lines.length-1;
    const ws=ln.trim().split(/\s+/);
    if(last||ws.length<2){doc.text(ws.join(" "),x,y+i*lH); return;}
    const wW=ws.reduce((a,w)=>a+tw(doc,w),0);
    const gap=(mW-wW)/(ws.length-1);
    let cx=x; ws.forEach(w=>{doc.text(w,cx,y+i*lH); cx+=tw(doc,w)+gap;});
  });
}

// Columns: №(8) Desc(110) Qty(16) Unit(14) Price(22) Sum(20) = 190mm total
// tx: [10, 18, 128, 144, 158, 180]  right edge = 200

function drawServiceBlock(doc, d, y, ml, cw, colHeader) {
  const tc=[8,110,16,14,22,20];
  const tx=[ml]; for(let i=0;i<tc.length-1;i++) tx.push(tx[i]+tc[i]);
  const tW=tc.reduce((a,b)=>a+b,0);

  // ── Header row ──
  const hdrH = 9;
  doc.setFillColor(228,228,228);
  doc.rect(tx[0],y,tW,hdrH,"F");
  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(tx[0],y,tW,hdrH);
  tx.forEach((x,i)=>{ if(i>0) doc.line(x,y,x,y+hdrH); });
  ["№", colHeader, "Кол-во", "Ед.", "Цена", "Сумма"].forEach((h,i)=>{
    sf(doc,9.5,true); doc.setTextColor(30,30,30);
    tC(doc,h, tx[i]+tc[i]/2, y+hdrH/2+1.8);
  });
  doc.setTextColor(0,0,0);
  y += hdrH;

  // ── Service description row ──
  const descText="Транспортные услуги по перевозке груза по маршруту: "+d.route+
    ", "+d.car+", Карпов Сергей Викторович, дата загрузки - "+
    d.loadDate+", дата выгрузки - "+d.unloadDate+".";
  sf(doc,9.5,false);
  const descLines=doc.splitTextToSize(descText, tc[1]-4);
  const svcH=Math.max(descLines.length*5.0+6, 14);

  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(tx[0],y,tW,svcH);
  tx.forEach((x,i)=>{ if(i>0) doc.line(x,y,x,y+svcH); });

  // № "1" — centred vertically and horizontally
  sf(doc,10.0,false);
  tC(doc,"1", tx[0]+tc[0]/2, y+svcH/2+1.8);

  // Description text
  jl(doc, descLines, tx[1]+2, y+5.5, tc[1]-4, 5.0);

  // Qty, Price, Sum
  sf(doc,10.0,false);
  tC(doc,"1", tx[2]+tc[2]/2, y+svcH/2+1.8);
  tR(doc,d.amountFmt, tx[4]+tc[4]-2, y+svcH/2+1.8);
  tR(doc,d.amountFmt, tx[5]+tc[5]-2, y+svcH/2+1.8);
  y += svcH;

  // ── Totals rows — attached directly to service table (no gap) ──
  const totX  = tx[2];
  const totW  = tc[2]+tc[3]+tc[4]+tc[5];
  const splitX = tx[5];
  const totH = 8;

  [["Итого:",d.amountFmt],["Без налога (НДС):","-"],["Всего к оплате:",d.amountFmt]]
    .forEach(([l,v],idx)=>{
      doc.setDrawColor(0); doc.setLineWidth(0.3);
      doc.rect(totX,y,totW,totH);
      doc.line(splitX,y,splitX,y+totH);
      sf(doc,10.0,idx===2); doc.setTextColor(70,70,70);
      tR(doc,l, splitX-2, y+totH/2+1.8);
      doc.setTextColor(0,0,0); sf(doc,10.0,idx===2);
      tR(doc,v, totX+totW-2, y+totH/2+1.8);
      y+=totH;
    });

  doc.setTextColor(0,0,0);
  return y;
}

// ── INVOICE ────────────────────────────────────────────────────────
function genInvoice(existingDoc){
  const d=getData();
  const doc=existingDoc||nDoc(); const ml=10,cw=190; let y=8;
  const c1=30,c2=60,c3=22,c4=cw-c1-c2-c3,rh=11;

  function hr(cells,ry,bg){
    const ws=[c1,c2,c3,c4];
    doc.setDrawColor(0); doc.setLineWidth(0.25);
    if(bg){doc.setFillColor(...bg); doc.rect(ml,ry,cw,rh,"F");}
    doc.rect(ml,ry,cw,rh);
    let cx=ml;
    cells.forEach((cell,i)=>{
      if(i>0) doc.line(cx,ry,cx,ry+rh);
      sf(doc,cell.sz||8,cell.b||false);
      doc.setTextColor(...(cell.col||[0,0,0]));
      const ll=doc.splitTextToSize(cell.t||"",ws[i]-4);
      const lh=(cell.sz||8)*0.42;
      const ty=ry+rh/2-ll.length*lh/2+lh*0.72;
      ll.forEach((l,j)=>doc.text(l,cx+2,ty+j*lh));
      cx+=ws[i];
    });
    doc.setTextColor(0,0,0);
  }

  hr([{t:"Получатель",b:true,col:[70,70,70],sz:10.5},{t:"ИП Карпов Сергей Викторович",b:true,sz:12.0},
      {t:"Банк",b:true,col:[70,70,70],sz:10.5},{t:"ПАО СБЕРБАНК г. Москва",sz:11.0}],y,[242,242,242]); y+=rh;
  hr([{t:"ИНН",col:[100,100,100],sz:9.5},{t:"771313296859",sz:10.0},
      {t:"БИК",col:[100,100,100],sz:9.5},{t:"044525225",sz:10.0}],y); y+=rh;
  hr([{t:"Сч. №",col:[100,100,100],sz:10.5},{t:"30101810400000000225",sz:11.0},
      {t:"Сч. №",col:[100,100,100],sz:10.5},{t:"40802810438000085714",sz:11.0}],y); y+=rh;

  const rh4=11;
  doc.setDrawColor(0); doc.setLineWidth(0.25);
  doc.rect(ml,y,cw,rh4); doc.line(ml+c1,y,ml+c1,y+rh4);
  sf(doc,9.5,false); doc.setTextColor(100,100,100); doc.text("Адрес / Тел.",ml+2,y+rh4/2+1.8);
  doc.setTextColor(0,0,0); sf(doc,10.0,false);
  const aW=cw-c1-4;
  const aL=doc.splitTextToSize("127591 г. Москва, Керамический пр. д.65, к.2, кв.186    тел. 8-964-785-13-86",aW);
  jl(doc,aL, ml+c1+2, y+rh4/2-aL.length*5.0/2+5.0*0.72, aW, 5.0);
  y+=rh4+6;

  sf(doc,13.0,true); doc.text("Счёт на оплату №"+d.num+" от "+d.docDate,ml,y);
  y+=2; doc.setLineWidth(1.0); doc.line(ml,y+1,ml+cw,y+1); y+=8;

  ["Заказчик:","Плательщик:"].forEach(lbl=>{
    const cf=d.customerName+", ИНН "+d.customerInn+", КПП "+d.customerKpp+", "+d.customerAddr;
    sf(doc,10.0,false); const vW=cw-28;
    const cl=doc.splitTextToSize(cf,vW-4);
    const rH=cl.length*4+5;
    doc.setDrawColor(0); doc.setLineWidth(0.25);
    doc.rect(ml,y,cw,rH); doc.line(ml+28,y,ml+28,y+rH);
    sf(doc,10.0,true); doc.setTextColor(50,50,50); doc.text(lbl,ml+2,y+rH/2+1.8);
    doc.setTextColor(0,0,0); sf(doc,10.0,false);
    jl(doc,cl,ml+30,y+4.5,vW-4,5.0); y+=rH;
  });
  y+=4;

  y=drawServiceBlock(doc,d,y,ml,cw,"Товары (работы, услуги)");
  y+=2;

  // Amount lines — colon added, bold value
  const a1="Всего оказано услуг 1, на сумму:";
  sf(doc,10.0,false); doc.text(a1,ml,y);
  const lw1=tw(doc,a1)+" "; // add a space gap
  sf(doc,10.0,false); const spaceW=tw(doc," ");
  sf(doc,10.5,true); doc.text(d.amountInt+" руб 00 копеек", ml+tw(doc,a1)+spaceW, y);
  y+=5;
  const a2="Всего оказано услуг на сумму:";
  sf(doc,10.0,false); doc.text(a2,ml,y);
  sf(doc,10.5,true); doc.text(d.amountWords, ml+tw(doc,a2)+spaceW, y);
  doc.setTextColor(0,0,0); y+=9;

  // Divider
  doc.setLineWidth(1.2); doc.line(ml,y,ml+cw,y);
  y+=13;

  // Signature line
  const ss=ml+27, se=ml+80;
  sf(doc,10.0,false); doc.text("Исполнитель",ml,y);
  doc.setLineWidth(0.3); doc.line(ss,y+1,se,y+1);
  sf(doc,9.0,false); doc.setTextColor(130,130,130);
  tC(doc,"(подпись)",(ss+se)/2,y+5);
  doc.setTextColor(0,0,0); sf(doc,10.0,true);
  doc.text("Карпов С.В.",se+3,y);

  // Stamp: centred over sig line, top = y+2 (below baseline, no overlap with divider)
  if(stampUrl && isStampEnabled()){
    const stW=32, stH=22;
    const stX=(ss+se)/2-stW/2;
    try{doc.addImage(stampUrl,"PNG",stX,y-stH+9,stW,stH,undefined,"FAST");}catch(e){}
  }

  doc.save("schet_"+d.num+"_"+d.docDate.replace(/\\./g,"-")+".pdf");
  appendToSheet(d);
}

// ── ACT ────────────────────────────────────────────────────────────
function genAct(existingDoc){
  const d=getData();
  const doc=existingDoc||nDoc(); const ml=10,cw=190; let y=8;
  const half=cw/2, lW=28;

  function mb(rows,bW){
    let h=8;
    rows.forEach(r=>{
      sf(doc,r.big?10.5:9.5,r.big||false);
      const ll=doc.splitTextToSize(r.value,bW-lW-4);
      h+=ll.length*5.2+2;
    });
    return h+4;
  }
  const eR=[
    {label:"Исполнитель",value:"ИП Карпов Сергей Викторович",big:true},
    {label:"ИНН",value:"771313296859"},
    {label:"ОГРН",value:"318774600201147"},
    {label:"Адрес",value:"127591 г. Москва, Керамический пр. д.65, к.2, кв.186"},
    {label:"Тел.",value:"8-964-785-13-86"}
  ];
  const cR=[
    {label:"Заказчик",value:d.customerName,big:true},
    {label:"ИНН",value:d.customerInn},
    {label:"КПП",value:d.customerKpp},
    {label:"Адрес",value:d.customerAddr}
  ];
  const eH=mb(eR,half), cH=mb(cR,half), shH=Math.max(eH,cH);

  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(ml,y,cw,shH); doc.line(ml+half,y,ml+half,y+shH);

  function db(rows,sX,bW,sY){
    let ry=sY+8;
    rows.forEach(r=>{
      sf(doc,9.5,false); doc.setTextColor(110,110,110);
      doc.text(r.label+":",sX+2,ry);
      sf(doc,r.big?10.5:9.5,r.big||false); doc.setTextColor(0,0,0);
      const ll=doc.splitTextToSize(r.value,bW-lW-4);
      ll.forEach((l,i)=>doc.text(l,sX+lW,ry+i*5.2));
      ry+=ll.length*5.2+2;
    });
  }
  db(eR,ml,half,y); db(cR,ml+half,half,y);
  y+=shH+4;

  sf(doc,12.0,true);
  const at="АКТ СДАЧИ-ПРИЁМКИ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) №"+d.num+" от "+d.actDate;
  const al=doc.splitTextToSize(at,cw);
  al.forEach((l,i)=>tC(doc,l,ml+cw/2,y+3+i*5.2));
  y+=3+al.length*5.2+3;
  doc.setLineWidth(1.1); doc.line(ml,y,ml+cw,y); y+=7;

  y=drawServiceBlock(doc,d,y,ml,cw,"Наименование работ, услуг");
  y+=2;

  const a1="Всего оказано услуг 1, на сумму:";
  sf(doc,10.0,false); doc.text(a1,ml,y);
  const spaceW=tw(doc," ");
  sf(doc,10.5,true); doc.text(d.amountInt+" руб 00 копеек", ml+tw(doc,a1)+spaceW, y);
  y+=5;
  const a2="Всего оказано услуг на сумму:";
  sf(doc,10.0,false); doc.text(a2,ml,y);
  sf(doc,10.5,true); doc.text(d.amountWords, ml+tw(doc,a2)+spaceW, y);
  y+=5;

  sf(doc,9.5,false); doc.setTextColor(60,60,60);
  const nl=doc.splitTextToSize(
    "Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.",cw);
  doc.text(nl,ml,y); y+=nl.length*4+5;

  doc.setTextColor(0,0,0);
  doc.setLineWidth(1.1); doc.line(ml,y,ml+cw,y);
  y+=13;

  const ss=ml+27, se=ml+82;
  sf(doc,10.0,false); doc.text("Исполнитель",ml,y);
  doc.setLineWidth(0.3); doc.line(ss,y+1,se,y+1);
  sf(doc,9.0,false); doc.setTextColor(130,130,130);
  tC(doc,"(подпись)",(ss+se)/2,y+5);
  doc.setTextColor(0,0,0); sf(doc,10.0,true);
  doc.text("Карпов С.В.",se+3,y);

  if(stampUrl && isStampEnabled()){
    const stW=32, stH=22;
    const stX=(ss+se)/2-stW/2;
    try{doc.addImage(stampUrl,"PNG",stX,y-stH+9,stW,stH,undefined,"FAST");}catch(e){}
  }

  const rx=ml+cw/2+20;
  sf(doc,10.0,false); doc.setTextColor(0,0,0); doc.text("Заказчик",rx,y);
  doc.setLineWidth(0.3); doc.line(rx+22,y+1,ml+cw,y+1);
  sf(doc,9.0,false); doc.setTextColor(130,130,130);
  tC(doc,"(подпись)",(rx+22+ml+cw)/2,y+5);
  doc.setTextColor(0,0,0);

  doc.save("akt_"+d.num+"_"+d.actDate.replace(/\\./g,"-")+".pdf");
}


// ═══════════════════════════════════════════════════
// Google Drive Integration
// ═══════════════════════════════════════════════════
const GCLIENT_ID = '1065862583210-pc1ulr62167km969n4kaqc5f79hre1j7.apps.googleusercontent.com';
const GAPI_KEY   = 'AIzaSyD-miNligFmgCvFWlYj6j2Hz0hq0EsfxLU';
let gTokenClient = null;
let gAccessToken = null;
let gAuthCallback = null; // shared callback

function getTokenClient() {
  if(!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
      callback: (r) => {
        if(r.error) {
          console.error('Auth error:', r.error);
          if(gAuthCallback) gAuthCallback(null, r.error);
          return;
        }
        gAccessToken = r.access_token;
        // Update UI
        const btnTxt = document.getElementById('loginBtnText');
        const btn    = document.getElementById('loginBtn');
        const status = document.getElementById('loginStatus');
        if(btnTxt) btnTxt.textContent = 'Google';
        if(btn){ btn.style.borderColor='var(--acc)'; btn.style.color='var(--acc)'; btn.disabled=false; }
        if(status){ status.textContent='АВТОРИЗОВАН'; status.style.color='var(--acc)'; }
        // Hide overlay
        const overlay = document.getElementById('googleOverlay');
        if(overlay) overlay.style.display='none';
        if(gAuthCallback) gAuthCallback(r.access_token, null);
        gAuthCallback = null;
      }
    });
  }
  return gTokenClient;
}

function requestAuth(prompt, resolve, reject) {
  gAuthCallback = (token, err) => {
    if(err) reject(new Error(err));
    else resolve(token);
  };
  getTokenClient().requestAccessToken({prompt: prompt||''});
}
let gPickerReady = false;
let gParsed      = null;

function dMsg(text, type) {
  const el = document.getElementById('driveMsg');
  if(!el) return;
  el.textContent = text;
  el.className = 'drive-msg' + (type ? ' '+type : '');
}

// Init picker lib
function initPicker() {
  if(gPickerReady) return Promise.resolve();
  return new Promise((res) => {
    gapi.load('picker', () => { gPickerReady = true; res(); });
  });
}

async function openDrivePicker() {
  await initPicker();
  if(!gAccessToken) {
    dMsg('Авторизация Google...', 'info');
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GCLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send',
      callback: async (resp) => {
        if(resp.error) { dMsg('Ошибка авторизации: '+resp.error, 'err'); return; }
        gAccessToken = resp.access_token;
        dMsg('✓ Авторизован', 'ok');
        showPicker();
      }
    });
    gTokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    showPicker();
  }
}

function showPicker() {
  dMsg('Открываю Drive...', 'info');
  const view = new google.picker.DocsView()
    .setMimeTypes('application/pdf')
    .setMode(google.picker.DocsViewMode.LIST)
    .setParent('1ywctaRSj0XWrY6MHjkWsvDCULxrNLSVd')
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);
  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(gAccessToken)
    .setDeveloperKey(GAPI_KEY)
    .setTitle('Счета и акты — выберите файл')
    .setCallback(pickerCb)
    .build();
  picker.setVisible(true);
}

function pickerCb(data) {
  if(data.action === google.picker.Action.PICKED) {
    const f = data.docs[0];
    dMsg('Читаю: '+f.name+'...', 'info');
    readAndParse(f.id, f.name);
  }
}

async function readAndParse(fileId, fileName) {
  try {
    dMsg('Загружаю файл...', 'info');
    const resp = await fetch(
      'https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media',
      { headers: { Authorization: 'Bearer '+gAccessToken } }
    );
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const buf = await resp.arrayBuffer();

    // Use PDF.js to properly extract text
    dMsg('Извлекаю текст из PDF...', 'info');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    let fullText = '';
    for(let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items.map(i => i.str).join(' ');
      fullText += pageText + ' ';
    }

    console.log('PDF text extracted:', fullText.substring(0, 500));

    const parsed = parsePDF(fullText);
    const filled = Object.values(parsed).filter(v=>v).length;
    if(filled >= 3) {
      gParsed = parsed;
      showParsed(parsed, fileName);
    } else {
      dMsg('Файл прочитан, но данные не распознаны. Попробуйте другой файл.', 'err');
      console.log('Full extracted text:', fullText);
    }
  } catch(e) {
    dMsg('Ошибка: '+e.message, 'err');
    console.error(e);
  }
}

function parsePDF(t) {
  t = t.replace(/\s+/g, ' ');
  const d = {};

  // Number + date (handles "№218" and "№ 218")
  const m1 = t.match(/№\s*(\d+)\s+от\s+(\d{2}\.\d{2}\.\d{4})/);
  if(m1){ d.num=m1[1]; d.docDate=m1[2]; d.actDate=m1[2]; }

  // Customer name — after "Заказчик:" up to ", ИНН"
  const m2 = t.match(/Заказчик:\s*((?:ООО|ИП|АО|ЗАО|ПАО|НКО).+?),\s*ИНН/);
  if(m2) {
    let nm = m2[1].trim().replace(/^"+|"+$/g,'').trim();
    // Restore quotes for ООО
    if(nm.startsWith('ООО ') && !nm.includes('"')) {
      nm = 'ООО "' + nm.slice(4).trim() + '"';
    }
    d.customerName = nm;
  }

  // Customer INN — specifically from Заказчик context
  const minn = t.match(/Заказчик:.+?ИНН\s+(\d{10,12})/);
  if(minn) d.customerInn = minn[1];

  // KPP — from Заказчик context
  const mkpp = t.match(/Заказчик:.+?КПП\s+(\d{9})/);
  if(mkpp) d.customerKpp = mkpp[1];

  // Address — after КПП in customer block
  const maddr = t.match(/Заказчик:.+?КПП\s+\d+,\s*(\d{6},.+?(?:дом|д\.)\s*\d+)/i);
  if(maddr) d.customerAddr = maddr[1].replace(/\s+/g,' ').trim();

  // Route — between "маршруту:" and car brand
  const mrt = t.match(/маршруту:\s*(.+?),\s*(?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford)/i);
  if(mrt) {
    const raw = mrt[1].trim();
    // Split by " - " (legs separated by dash with spaces)
    const legs = raw.split(/\s+-\s+/).map(l=>l.trim().replace(/,\s*$/,'').trim()).filter(l=>l);
    if(legs.length >= 2) {
      const fromParts = legs[0].split(', ');
      if(fromParts.length >= 3) {
        d.from_a = fromParts.slice(0,2).join(', ');
        d.from_b = fromParts.slice(2).join(', ');
      } else {
        d.from_a = legs[0]; d.from_b = '';
      }
      d.to_a = legs[1] || '';
      d.to_b = legs[2] || '';
    } else {
      d.from_a = legs[0] || ''; d.from_b = ''; d.to_a = ''; d.to_b = '';
    }
  }

  // Car
  const mcar = t.match(/((?:MAN|КАМАЗ|ГАЗ|Volvo|Scania|DAF|Mercedes|Iveco|Ford),\s*[А-Я\d]+(?:\(\d+\))?)/);
  if(mcar) d.car = mcar[1];

  // Load / unload dates
  const mld = t.match(/дата загрузки\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);
  if(mld) d.loadDate = mld[1];
  const mud = t.match(/дата выгрузки\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);
  if(mud) d.unloadDate = mud[1];

  // Amount — "на сумму 32000 руб"
  const mamt = t.match(/на сумму\s+(\d+)\s+руб/i);
  if(mamt) d.amount = mamt[1];

  return d;
}

function showParsed(d, fileName) {
  const rows = [
    ['Файл', fileName],
    ['Номер', d.num||'—'],
    ['Дата', d.docDate||'—'],
    ['Заказчик', d.customerName||'—'],
    ['ИНН', d.customerInn||'—'],
    ['КПП', d.customerKpp||'—'],
    ['Адрес', d.customerAddr||'—'],
    ['Откуда', d.from_a||'—'],
    ['Куда', d.to_a||'—'],
    ['Автомобиль', d.car||'—'],
    ['Загрузка', d.loadDate||'—'],
    ['Выгрузка', d.unloadDate||'—'],
    ['Сумма', d.amount ? d.amount+' руб' : '—'],
  ];
  document.getElementById('parseRows').innerHTML = rows
    .map(([k,v])=>`<div class="prow"><span class="pk">${k}</span><span class="pv" title="${v}">${v}</span></div>`)
    .join('');
  const box = document.getElementById('parseBox');
  box.style.display = 'block';
  box.scrollIntoView({behavior:'smooth', block:'start'});
  dMsg('Проверьте данные и нажмите «Заполнить форму»', 'ok');
}

function closeParsed() {
  document.getElementById('parseBox').style.display = 'none';
  gParsed = null;
  const el = document.getElementById('driveMsg');
  if(el) el.textContent = '';
}

function toInputDate(s) {
  if(!s) return '';
  const p=s.split('.');
  return p.length===3 ? p[2]+'-'+p[1]+'-'+p[0] : s;
}

function applyParsed() {
  if(!gParsed) return;
  const d=gParsed;
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!==undefined&&v!=='')el.value=v;};
  set('doc_num', d.num);
  set('doc_date', toInputDate(d.docDate));
  set('act_date', toInputDate(d.actDate));
  set('customer_name', d.customerName);
  set('customer_inn', d.customerInn);
  set('customer_kpp', d.customerKpp);
  set('customer_addr', d.customerAddr);
  set('from_a', d.from_a);
  set('from_b', d.from_b);
  set('to_a', d.to_a);
  set('to_b', d.to_b);
  set('car', d.car);
  set('load_date', toInputDate(d.loadDate));
  set('unload_date', toInputDate(d.unloadDate));
  if(d.amount) {
    set('amount', d.amount);
    document.getElementById('amount_words').value = amountToWords(d.amount);
  }
  closeParsed();
  showToast('✅ Данные из Drive заполнены!');
}

window.addEventListener('load', () => {
  if(typeof gapi !== 'undefined') {
    gapi.load('picker', () => { gPickerReady=true; });
  }
});