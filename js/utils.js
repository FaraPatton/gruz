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

function ensureStampLoadedForAction() {
    if (!isStampEnabled()) return false;
    if (stampUrl) return true;
    if (typeof loadDriveStamp === 'function') loadDriveStamp();
    showToast('Печать ещё не загружена');
    return false;
}

function syncStampAuthState() {
    const toggle = document.getElementById('stampToggle');
    const zone = document.getElementById('stampZone');
    const prev = document.getElementById('spPrev');
    const ph = document.getElementById('spPh');
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
    if (stampUrl && prev && ph) {
        prev.src = stampUrl;
        prev.style.display = 'block';
        ph.style.display = 'none';
    } else if (authorized && typeof loadDriveStamp === 'function') {
        loadDriveStamp();
    }
}

function syncContractAuthState() {
    const input = document.getElementById('contractFile');
    const zone = document.getElementById('contractUploadZone');
    const ph = document.getElementById('contractPh');
    if (!input || !zone) return;
    const authorized = !!gAccessToken;
    input.disabled = !authorized;
    zone.classList.toggle('stamp-zone-disabled', !authorized);
    if (ph) {
        const text = ph.querySelector('.uh');
        if (text) text.textContent = authorized ? 'Выберите PDF договор' : 'Войдите в Google, чтобы загрузить PDF договор';
    }
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

function applyAppTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = nextTheme;
    const toggle = document.getElementById('authLockToggle');
    if (toggle) toggle.checked = nextTheme === 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', nextTheme === 'light' ? '#f4f0e7' : '#e8c84a');
}

function initThemeSwitch() {
    const saved = localStorage.getItem('gruzTheme') || 'dark';
    applyAppTheme(saved);
    const toggle = document.getElementById('authLockToggle');
    if (!toggle || toggle.dataset.themeBound === '1') return;
    toggle.dataset.themeBound = '1';
    toggle.addEventListener('change', () => {
          const theme = toggle.checked ? 'dark' : 'light';
          localStorage.setItem('gruzTheme', theme);
          applyAppTheme(theme);
    });
}

function initAppMotion() {
    requestAnimationFrame(() => document.body.classList.add('app-ready'));
    const items = document.querySelectorAll('.main > .dc, .main > .row, #emailPanel .dc, #signPanel .dc, #analyticsPanel .dc');
    if (!('IntersectionObserver' in window)) {
          items.forEach(el => el.classList.add('is-visible'));
          return;
    }
    const observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
          });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el, index) => {
          el.classList.add('reveal-on-scroll');
          el.style.transitionDelay = Math.min(index * 45, 220) + 'ms';
          observer.observe(el);
    });
}

// ── Stamp init on DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
    initThemeSwitch();
    initAppMotion();
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
                  document.getElementById('spPrev').style.display = 'block';
                  document.getElementById('spPh').style.display = 'none';
          };
          r.readAsDataURL(f);
    });

                            // Stamp toggle
                            document.getElementById('stampToggle').addEventListener('change', syncStampAuthState);
                            syncAuthDependentUi();
});
