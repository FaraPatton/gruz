// ══ Utils ════════════════════════════════════════════════════

// ── Date helpers ──
const today  = () => new Date().toISOString().split('T')[0];
const fmt    = s => { if(!s) return ''; const [y,m,d] = s.split('-'); return d+'.'+m+'.'+y; };
const toInput = s => { if(!s) return ''; const p = s.split('.'); return p.length===3 ? p[2]+'-'+p[1]+'-'+p[0] : s; };

// ── Toast notification ──
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Stamp helpers ──
function isStampEnabled() {
    return !!gAccessToken && document.getElementById('stampToggle').checked;
}

function syncStampAuthState() {
    const toggle = document.getElementById('stampToggle');
    const zone = document.getElementById('stampZone');
    if (!toggle || !zone) return;
    const authorized = !!gAccessToken;
    toggle.disabled = !authorized;
    if (!authorized) {
        toggle.checked = false;
        delete toggle.dataset.authReady;
    } else if (!toggle.dataset.authReady) {
        toggle.checked = true;
        toggle.dataset.authReady = '1';
    }
    zone.classList.toggle('stamp-zone-disabled', !authorized || !toggle.checked);
}

function syncContractAuthState() {
    const input = document.getElementById('contractFile');
    const zone = document.getElementById('contractUploadZone');
    if (!input || !zone) return;
    const authorized = !!gAccessToken;
    input.disabled = !authorized;
    zone.classList.toggle('stamp-zone-disabled', !authorized);
}

function syncAuthDependentUi() {
    syncStampAuthState();
    syncContractAuthState();
}

function normalizeCarNumber(value) {
    const car = String(value || '').trim().replace(/\s+\(/g, '(');
    if (/^MAN,\s*[МM]563[УY][СC](?:\(?799\)?)?$/i.test(car)) return 'MAN, М563УС(799)';
    return car;
}

// ── Template save/load (localStorage) ──
function loadTpl() {
    try {
          const raw = localStorage.getItem('gruz_tpl');
          if (!raw) return;
          const d = JSON.parse(raw);
          Object.entries(d).forEach(([id, v]) => {
                  const el = document.getElementById(id);
                  if (el) el.value = v;
          });
    } catch(e) {}
}

// ── Get form data ──
function getData() {
    const amount  = parseFloat(document.getElementById('amount').value) || 0;
    const fromA   = document.getElementById('from_a').value.trim();
    const toA     = document.getElementById('to_a').value.trim();
    const route   = fromA + ' - ' + toA;
    return {
          num:          document.getElementById('doc_num').value,
          docDate:      fmt(document.getElementById('doc_date').value),
          actDate:      fmt(document.getElementById('act_date').value),
          loadDate:     fmt(document.getElementById('load_date').value),
          unloadDate:   fmt(document.getElementById('unload_date').value),
          customerName: document.getElementById('customer_name').value.trim(),
          customerInn:  document.getElementById('customer_inn').value.trim(),
          customerKpp:  document.getElementById('customer_kpp').value.trim(),
          customerAddr: document.getElementById('customer_addr').value.trim(),
          car:          normalizeCarNumber(document.getElementById('car').value),
          routeOrigin:   fromA,
          routeDestination: toA,
          route, amount,
          amountFmt:    amount.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2}),
          amountWords:  amountToWords(amount),
          amountInt:    Math.floor(amount)
    };
}

// ── Amount to Russian words ──
function amountToWords(n) {
    n = Math.floor(Number(n));
    if (!n) return 'Ноль рублей';
    const one  = ['','Один','Два','Три','Четыре','Пять','Шесть','Семь','Восемь','Девять','Десять','Одиннадцать','Двенадцать','Тринадцать','Четырнадцать','Пятнадцать','Шестнадцать','Семнадцать','Восемнадцать','Девятнадцать'];
    const oneF = ['','Одна','Две','Три','Четыре','Пять','Шесть','Семь','Восемь','Девять','Десять','Одиннадцать','Двенадцать','Тринадцать','Четырнадцать','Пятнадцать','Шестнадцать','Семнадцать','Восемнадцать','Девятнадцать'];
    const tens = ['','Десять','Двадцать','Тридцать','Сорок','Пятьдесят','Шестьдесят','Семьдесят','Восемьдесят','Девяносто'];
    const hund = ['','Сто','Двести','Триста','Четыреста','Пятьсот','Шестьсот','Семьсот','Восемьсот','Девятьсот'];

  function chunk(num, feminine) {
        let r = '';
        const h = Math.floor(num/100);
        const t = Math.floor((num%100)/10);
        const o = num % 10;
        if (h) r += hund[h] + ' ';
        if (t === 1) r += one[10 + o] + ' ';
        else { if (t) r += tens[t] + ' '; if (o) r += (feminine ? oneF[o] : one[o]) + ' '; }
        return r;
  }

  function rubles(n) {
        const l = n % 100;
        const o = n % 10;
        if (l >= 11 && l <= 19) return 'рублей';
        if (o === 1) return 'рубль';
        if (o >= 2 && o <= 4) return 'рубля';
        return 'рублей';
  }

  let result = '';
    const millions  = Math.floor(n / 1000000);
    const thousands = Math.floor((n % 1000000) / 1000);
    const rest      = n % 1000;

  if (millions) {
        result += chunk(millions, false);
        const m = millions % 10;
        const ml = millions % 100;
        if (ml >= 11 && ml <= 19) result += 'миллионов ';
        else if (m === 1) result += 'миллион ';
        else if (m >= 2 && m <= 4) result += 'миллиона ';
        else result += 'миллионов ';
  }
    if (thousands) {
          result += chunk(thousands, true);
          const t = thousands % 10;
          const tl = thousands % 100;
          if (tl >= 11 && tl <= 19) result += 'тысяч ';
          else if (t === 1) result += 'тысяча ';
          else if (t >= 2 && t <= 4) result += 'тысячи ';
          else result += 'тысяч ';
    }
    result += chunk(rest, false);
    const rWord = rubles(rest || (n ? 0 : 0));
    return (result.trim() + ' ' + rubles(n % 1000 || (n===0?0:n))).trim();
}

// ── Stamp init on DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
    // Set today for empty date fields
                            loadTpl();
    const t = today();
    ['doc_date','act_date','load_date','unload_date'].forEach(id => {
          if (!document.getElementById(id).value) document.getElementById(id).value = t;
    });
    document.getElementById('amount_words').value = amountToWords(
          document.getElementById('amount').value
        );
    document.getElementById('amount').addEventListener('input', e => {
          document.getElementById('amount_words').value = amountToWords(e.target.value);
    });

                            // Stamp file picker
                            if (typeof STAMP_DEFAULT !== 'undefined') {
                                  stampUrl = STAMP_DEFAULT;
                                  document.getElementById('spPrev').src = STAMP_DEFAULT;
                                  document.getElementById('spPrev').style.display = 'block';
                                  document.getElementById('spPh').style.display   = 'none';
                            }
    document.getElementById('stampFile').addEventListener('change', function(e) {
          const f = e.target.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = ev => {
                  stampUrl = ev.target.result;
                  document.getElementById('spPrev').src = ev.target.result;
          };
          r.readAsDataURL(f);
    });

                            // Stamp toggle
                            document.getElementById('stampToggle').addEventListener('change', syncStampAuthState);
                            syncAuthDependentUi();
});
