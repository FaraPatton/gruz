document.getElementById('spPrev').src=STAMP_DEFAULT;
document.getElementById('spPrev').style.display='block';
document.getElementById('spPh').style.display='none';
document.getElementById('stampFile').addEventListener('change',function(e){
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{stampUrl=ev.target.result; document.getElementById('spPrev').src=ev.target.result;};
  r.readAsDataURL(f);
});

// Toggle stamp on/off
document.getElementById('stampToggle').addEventListener('change', function(){
  const zone = document.getElementById('stampZone');
  if(this.checked){
    zone.classList.remove('stamp-zone-disabled');
  } else {
    zone.classList.add('stamp-zone-disabled');
  }
});
function isStampEnabled(){ return document.getElementById('stampToggle').checked; }

const today=()=>new Date().toISOString().split('T')[0];
const fmt=s=>{if(!s)return""; const[y,m,d]=s.split('-'); return d+'.'+m+'.'+y;};
const toInput=s=>{if(!s)return""; const p=s.split('.'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:s;};

function loadTpl(){
  try{const raw=localStorage.getItem('gruz_tpl'); if(!raw)return;
    const d=JSON.parse(raw); Object.entries(d).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.value=v;});}
  catch(e){}
}
function showToast(msg){
  const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2500);
}

window.addEventListener('DOMContentLoaded',()=>{
  loadTpl(); const t=today();
  ['doc_date','act_date','load_date','unload_date'].forEach(id=>{
    if(!document.getElementById(id).value) document.getElementById(id).value=t;
  });
  document.getElementById('amount_words').value=amountToWords(document.getElementById('amount').value);
});

function getData(){
  const amount=parseFloat(document.getElementById('amount').value)||0;
  const fromA=document.getElementById('from_a').value.trim();
  const fromB=document.getElementById('from_b').value.trim();
  const toA=document.getElementById('to_a').value.trim();
  const toB=document.getElementById('to_b').value.trim();
  const route=fromA+(fromB?', '+fromB:'')+" - "+toA+(toB?' - '+toB:'');
  return{
    num:document.getElementById('doc_num').value,
    docDate:fmt(document.getElementById('doc_date').value),
    actDate:fmt(document.getElementById('act_date').value),
    loadDate:fmt(document.getElementById('load_date').value),
    unloadDate:fmt(document.getElementById('unload_date').value),
    customerName:document.getElementById('customer_name').value.trim(),
    customerInn:document.getElementById('customer_inn').value.trim(),
    customerKpp:document.getElementById('customer_kpp').value.trim(),
    customerAddr:document.getElementById('customer_addr').value.trim(),
    car:document.getElementById('car').value.trim(),
    route, amount,
    amountFmt:amount.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}),
    amountWords:amountToWords(amount),
    amountInt:Math.floor(amount)
  };
}