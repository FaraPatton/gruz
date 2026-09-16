// A photographic intro: camera motion and dissolve, not simulated vehicle mechanics.
(() => {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (new URLSearchParams(location.search).has('auth_error')) return;
  const preview = new URLSearchParams(location.search).get('intro') === 'preview';
  try {
    const authReturn = Number(sessionStorage.getItem('gruz-intro-auth-return'));
    sessionStorage.removeItem('gruz-intro-auth-return');
    if (authReturn && Date.now() - authReturn < 600000) return;
    const previous = Number(sessionStorage.getItem('gruz-intro-opened'));
    if (!preview && previous && Date.now() - previous < 15000) return;
    if (!preview && document.referrer && new URL(document.referrer).origin === location.origin) return;
  } catch (_) {}
  let abandoned = false;
  const abandon = () => { abandoned = true; };
  document.addEventListener('pointerdown', abandon, { once: true });
  document.addEventListener('keydown', abandon, { once: true });
  const images = ['img/intro/arrival.webp', 'img/intro/loading.webp'].map(src => {
    const img = new Image(); img.src = src; img.alt = ''; return img;
  });
  const timeout = setTimeout(abandon, 2500);
  Promise.all(images.map(img => img.decode())).then(() => {
    if (abandoned || document.hidden) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'gruz-intro';
    dialog.tabIndex = -1;
    dialog.autofocus = true;
    dialog.setAttribute('aria-label', 'Добро пожаловать в GRUZ');
    dialog.innerHTML = '<div class="gruz-intro__scene"></div><div class="gruz-intro__scene gruz-intro__scene--end"></div><div class="gruz-intro__shade"></div><div class="gruz-intro__top"><span>GRUZ / МОСКВА</span><button class="gruz-intro__skip" aria-label="Идёт загрузка — пропустить вступление"><span class="gruz-intro__loading-dot" aria-hidden="true"></span>Идёт загрузка…</button></div><div class="gruz-intro__copy"><p class="gruz-intro__eyebrow">КАЖДЫЙ РЕЙС ПОД КОНТРОЛЕМ</p><h2>Всё готово.<br>Можно в путь.</h2><p class="gruz-intro__caption">ИП Карпов С.В. · Грузоперевозки</p></div><footer class="gruz-intro__footer"><div class="gruz-intro__details">Контур Диадок ЭДО: <span class="gruz-intro__edo">2BM-771313296859-2026090605550033630920000000021:03</span></div><div class="gruz-intro__details">Код ATI: 2936939</div><div class="gruz-intro__copyright">© 2026 ИП Карпов С.В. Все права защищены.</div></footer><div class="gruz-intro__line"></div>';
    dialog.querySelectorAll('.gruz-intro__scene').forEach((scene, i) => scene.append(images[i]));
    document.body.append(dialog);
    const previousFocus = document.activeElement;
    let closing = false;
    let finishTimer;
    const close = () => {
      if (closing) return;
      closing = true; clearTimeout(finishTimer);
      document.removeEventListener('visibilitychange', hidden);
      dialog.classList.add('is-leaving');
      setTimeout(() => { dialog.close(); dialog.remove(); if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true }); }, 500);
    };
    const hidden = () => { if (document.hidden) close(); };
    dialog.querySelector('button').addEventListener('click', close);
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    document.addEventListener('visibilitychange', hidden);
    try { dialog.showModal(); dialog.focus({ preventScroll: true }); } catch (_) { dialog.remove(); document.removeEventListener('visibilitychange', hidden); return; }
    try { sessionStorage.setItem('gruz-intro-opened', String(Date.now())); } catch (_) {}
    finishTimer = setTimeout(close, 6500);
  }).catch(() => {}).finally(() => {
    clearTimeout(timeout);
    document.removeEventListener('pointerdown', abandon);
    document.removeEventListener('keydown', abandon);
  });
})();
