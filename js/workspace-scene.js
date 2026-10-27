// Native scroll plus an optional, cancellable camera move when entering.
document.addEventListener('DOMContentLoaded', () => {
  if (!document.body.classList.contains('workbench')) return;
  const nav = document.querySelector('.workspace-nav');
  const main = document.querySelector('.main');
  const login = document.getElementById('loginBtn');
  if (!nav || !main || !login) return;
  document.body.classList.add('has-workspace-scene');
  // Rear-view compositions reviewed for desktop and mobile.
  const artworkVersion = 'v4';
  const scene = document.createElement('section');
  scene.className = 'workspace-scene';
  scene.setAttribute('aria-label', 'Рабочее место в пути');
  scene.innerHTML = `<div class="workspace-scene-stage">
    <div class="workspace-scene-visual"><picture><source media="(max-width:767px)" srcset="img/workspace/driver-office-mobile-${artworkVersion}.webp"><img class="workspace-scene-photo" src="img/workspace/driver-office-${artworkVersion}.webp" width="1672" height="941" fetchpriority="high" alt="Рефрижератор MAN с гидробортом; перед ним ноутбук, термос и кофе"></picture><svg class="workspace-laptop-ui" aria-hidden="true" preserveAspectRatio="xMidYMid slice"></svg></div>
    <div class="workspace-scene-shade" aria-hidden="true"></div>
    <div class="workspace-scene-copy"><p class="workspace-scene-eyebrow">ГРУЗОПЕРЕВОЗКИ · МОСКВА</p><h1>ИП Карпов С.В.</h1>
</div>
    <p class="workspace-scene-scroll" aria-hidden="true">Вниз — к вашему рабочему столу <span>↓</span></p>
  </div>`;
  nav.before(scene);
  nav.id = 'workspace-start'; nav.tabIndex = -1;
  login.removeAttribute('onclick');
  login.dataset.sceneEnter = 'true';
  document.getElementById('loginBtnText').textContent = 'Оформить бумаги';
  const legend = document.createElement('span'); legend.className = 'legend-tag'; legend.textContent = 'MAN · LEGEND'; legend.setAttribute('aria-hidden','true'); login.prepend(legend);
  login.classList.add('workspace-scene-enter');
  scene.querySelector('.workspace-scene-copy').append(login);
  const controls = document.createElement('div');
  controls.className = 'workspace-scene-controls';
  const theme = document.querySelector('.theme-switch-wrap');
  const profile = document.querySelector('.interface-preferences');
  if (theme) controls.append(theme);
  if (profile) controls.append(profile);
  document.querySelector('.workspace-review-head').after(controls);
  const status = document.getElementById('loginStatus');
  if (status) {status.setAttribute('role', 'status'); controls.after(status);}
  if (status && new URLSearchParams(location.search).has('auth_error')) {
    status.textContent = 'Google не завершил вход. Вернитесь к кнопке «Оформить бумаги» и попробуйте ещё раз.';
  }
  document.querySelector('.app-hdr').hidden = true;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const image = scene.querySelector('img');
  const visual = scene.querySelector('.workspace-scene-visual');
  const screen = scene.querySelector('.workspace-laptop-ui');
  let center = {x:.51,y:.77};
  // Screen corners are measured against the matching art asset; vector text stays sharp on zoom.
  const drawScreen = () => {
    const mobile = matchMedia('(max-width:767px)').matches;
    const w = image.naturalWidth || (mobile ? 941 : 1672);
    const h = image.naturalHeight || (mobile ? 1672 : 941);
    const region = mobile ? {x:.322,y:.744,w:.35,h:.116} : {x:.397,y:.664,w:.233,h:.202};
    center = {x:region.x+region.w/2,y:region.y+region.h/2};
    screen.setAttribute('viewBox', `0 0 ${w} ${h}`);
    screen.setAttribute('preserveAspectRatio', mobile ? 'xMidYMax meet' : 'xMidYMid slice');
    screen.innerHTML = `<svg x="${region.x*w}" y="${region.y*h}" width="${region.w*w}" height="${region.h*h}" viewBox="0 0 960 500" preserveAspectRatio="none"><rect width="960" height="500" fill="#17191c"/><g font-family="Segoe UI,Arial,sans-serif"><text x="35" y="38" fill="#ece8df" font-size="17">ИП Карпов С.В.</text><text x="620" y="38" fill="#bca976" font-size="13">Документы    Архив    Аналитика</text><path d="M30 58H930" stroke="#36383b"/><text x="35" y="98" fill="#f6f3ec" font-size="28">Счёт и акт</text><text x="35" y="121" fill="#a8abae" font-size="12">Грузоперевозки · Москва</text><rect x="30" y="145" width="545" height="137" rx="9" fill="#23262a" stroke="#3d4146"/><text x="48" y="171" fill="#eee9df" font-size="15">01 / Документ</text><text x="48" y="198" fill="#aeb4ba" font-size="11">Номер</text><text x="221" y="198" fill="#aeb4ba" font-size="11">Дата счёта</text><text x="394" y="198" fill="#aeb4ba" font-size="11">Дата акта</text><g fill="#191c20" stroke="#454a50"><rect x="48" y="211" width="150" height="42" rx="5"/><rect x="221" y="211" width="150" height="42" rx="5"/><rect x="394" y="211" width="150" height="42" rx="5"/></g><rect x="30" y="296" width="545" height="176" rx="9" fill="#23262a" stroke="#3d4146"/><text x="48" y="325" fill="#eee9df" font-size="15">02 / Заказчик</text><text x="48" y="352" fill="#aeb4ba" font-size="11">Название организации</text><rect x="48" y="363" width="496" height="40" rx="5" fill="#191c20" stroke="#454a50"/><text x="48" y="431" fill="#aeb4ba" font-size="11">ИНН</text><text x="310" y="431" fill="#aeb4ba" font-size="11">КПП</text><rect x="599" y="145" width="331" height="257" rx="8" fill="#f3f0e8"/><text x="622" y="179" fill="#30362f" font-size="17">Проверка данных</text><path d="M620 197H908" stroke="#d2cfc6"/><text x="622" y="226" fill="#30362f" font-size="20">Счёт и акт</text><g stroke="#c7c9c5" stroke-width="3"><path d="M622 251H870M622 270H890M622 307H870M622 326H850M622 366H908"/></g><rect x="599" y="420" width="156" height="52" rx="8" fill="#dfc38a"/><rect x="774" y="420" width="156" height="52" rx="8" fill="#d6c7a8"/><text x="653" y="452" font-size="18" fill="#28251f">Счёт</text><text x="829" y="452" font-size="18" fill="#28251f">Акт</text></g></svg>`;
  };
  let pending = false;
  let entering = false;
  const update = () => {
    pending = false;
    const bounds = scene.getBoundingClientRect();
    const stage = scene.querySelector('.workspace-scene-stage');
    const progress = reduced.matches ? 0 : Math.max(0, Math.min(1, -bounds.top / Math.max(1, scene.offsetHeight-innerHeight)));
    scene.style.setProperty('--scene-zoom', String(1+progress*3.4));
    scene.style.setProperty('--scene-copy', String(Math.max(0,1-progress*4)));
    scene.style.setProperty('--scene-fade', String(reduced.matches ? 0 : Math.max(0,Math.min(1,(-bounds.top-(scene.offsetHeight-innerHeight))/innerHeight))));
    const mobile = matchMedia('(max-width:767px)').matches;
    const scale = (mobile ? Math.min : Math.max)(stage.clientWidth/(image.naturalWidth||1672), stage.clientHeight/(image.naturalHeight||941));
    const cx = stage.clientWidth/2+(center.x-.5)*(image.naturalWidth||1672)*scale;
    const cy = mobile ? stage.clientHeight-(1-center.y)*(image.naturalHeight||941)*scale : stage.clientHeight/2+(center.y-.5)*(image.naturalHeight||941)*scale;
    visual.style.transformOrigin = `${cx}px ${cy}px`;
    visual.style.transform = reduced.matches ? 'none' : `translate3d(${(stage.clientWidth/2-cx)*progress}px,${(stage.clientHeight/2-cy)*progress}px,0) scale(${1+progress*3.4})`;
    document.body.classList.toggle('scene-scrolled',scrollY>60);
    scene.querySelector('.workspace-scene-copy').inert = progress>.3 && !entering;
  };
  const schedule = () => {if(!pending){pending=true;requestAnimationFrame(update);}};
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',()=>{drawScreen();schedule();},{passive:true});
  addEventListener('pageshow',schedule);
  reduced.addEventListener('change',schedule);
  image.addEventListener('load',()=>{drawScreen();schedule();});
  image.addEventListener('error',()=>{
    if (!image.dataset.fallback) {
      image.dataset.fallback = 'true';
      scene.querySelector('source').srcset = 'img/workspace/driver-office-mobile-v1.webp';
      image.src = 'img/workspace/driver-office-v1.webp';
      return;
    }
    scene.classList.add('scene-image-unavailable');screen.hidden=true;
  });

  const enter = (target = nav) => new Promise(resolve => {
    if(reduced.matches){scrollTo({top:target === nav ? nav.getBoundingClientRect().top+scrollY : scene.offsetTop+scene.offsetHeight-innerHeight,behavior:'instant'});resolve(true);return;}
    const from=scrollY, to=target === nav ? nav.getBoundingClientRect().top+scrollY : scene.offsetTop+scene.offsetHeight-innerHeight;
    const started=performance.now();let frame;
    const cleanup=()=>{cancelAnimationFrame(frame);['wheel','touchstart','keydown'].forEach(type=>removeEventListener(type,cancel));};
    const cancel=event=>{if(event?.target?.closest?.('.scene-entry-details'))return;cleanup();resolve(false);};
    ['wheel','touchstart','keydown'].forEach(type=>addEventListener(type,cancel,{passive:true}));
    const step=now=>{const t=Math.min(1,(now-started)/2800);const ease=t*t*t*(t*(t*6-15)+10);scrollTo({top:from+(to-from)*ease,behavior:'instant'});if(t<1)frame=requestAnimationFrame(step);else{cleanup();resolve(true);}};
    frame=requestAnimationFrame(step);
  });
  const banner = document.createElement('aside');
  banner.className = 'scene-entry-details';
  banner.hidden = true;
  banner.setAttribute('aria-label', 'Реквизиты ИП Карпов С.В.');
  banner.innerHTML = '<div class="scene-entry-heading"><span class="scene-entry-label">ИП Карпов С.В.</span><button type="button" class="scene-details-close" aria-label="Закрыть реквизиты">×</button></div><div class="scene-entry-ati"><span>Код ATI</span><strong>2936939</strong></div><div class="scene-entry-edo"><span>Контур ЭДО</span><span>2BM-771313296859-2026090605550033630920000000021:03</span></div><button type="button" class="scene-details-copy">Скопировать реквизиты</button><span class="scene-copy-status" role="status"></span>';
  document.body.append(banner);
  let bannerTimer;
  const showBanner = () => {clearTimeout(bannerTimer);banner.dataset.dismissed='';banner.querySelector('.scene-copy-status').textContent='';banner.hidden=false;requestAnimationFrame(()=>banner.classList.add('is-visible'));};
  let copyBusy = false;
  const hideBanner = (force = false) => {
    clearTimeout(bannerTimer);
    if(!force && !banner.dataset.dismissed && (copyBusy || banner.matches(':hover') || banner.contains(document.activeElement))){bannerTimer=setTimeout(()=>hideBanner(),1200);return;}
    banner.classList.remove('is-visible');bannerTimer=setTimeout(()=>{if(banner.contains(document.activeElement))nav.focus({preventScroll:true});banner.hidden=true;},180);
  };
  banner.querySelector('.scene-details-close').addEventListener('click',()=>{banner.dataset.dismissed='true';hideBanner(true);nav.focus({preventScroll:true});});
  const detailsText = 'ИП Карпов С.В.\nКод ATI: 2936939\nКонтур ЭДО: 2BM-771313296859-2026090605550033630920000000021:03';
  banner.querySelector('.scene-details-copy').addEventListener('click',async()=>{
    copyBusy=true;clearTimeout(bannerTimer);
    const notice=banner.querySelector('.scene-copy-status');
    try {
      await navigator.clipboard.writeText(detailsText);notice.textContent='Скопировано';
      banner.dataset.dismissed='true';
      bannerTimer=setTimeout(()=>hideBanner(true),400);
    }
    catch (_) {notice.textContent='Не удалось скопировать. Выделите реквизиты и скопируйте вручную.';}
    finally {copyBusy=false;}
  });
  const reopen=document.createElement('button');reopen.type='button';reopen.className='scene-details-reopen';reopen.textContent='Реквизиты';
  controls.append(reopen);reopen.addEventListener('click',()=>{showBanner();banner.querySelector('.scene-details-copy').focus({preventScroll:true});});
  const finishEntry = async () => {
    const completed = await enter();
    hideBanner();entering=false;login.disabled=false;update();
    if(completed)nav.focus({preventScroll:true});
  };
  login.addEventListener('click',async()=>{
    if(entering)return;
    entering=true;login.disabled=true;showBanner();
    const local=typeof isLocalDesignPreview==='function' && isLocalDesignPreview();
    const legacy=!local && !usesServerAuthSession();
    const legacyLogin = legacy ? googleLogin({quiet:true}) : null;
    // The real form is revealed only after the session check. Local preview demonstrates the move.
    const completed=await enter(local ? nav : scene);
    if(!completed){hideBanner();entering=false;login.disabled=false;update();return;}
    if(local){hideBanner();entering=false;login.disabled=false;update();nav.focus({preventScroll:true});return;}
    await Promise.resolve(window.gruzAuthRestore);
    if(legacyLogin) await legacyLogin;
    if(gAccessToken){await finishEntry();return;}
    if(!legacy){
      try{sessionStorage.setItem('gruz-scene-auth-return',String(Date.now()));}catch(_){}
      await googleLogin({quiet:true});
    }
    hideBanner();entering=false;login.disabled=false;update();
    // On failed login, keep the existing visible error status reachable.
    nav.scrollIntoView({behavior:'smooth'});
  });
  drawScreen();update();
  try{
    const stamp=Number(sessionStorage.getItem('gruz-scene-auth-return'));
    sessionStorage.removeItem('gruz-scene-auth-return');
    if(stamp && Date.now()-stamp<600000){
      entering=true;showBanner();
      requestAnimationFrame(async()=>{
        scrollTo({top:scene.offsetTop+scene.offsetHeight-innerHeight,behavior:'instant'});
        await Promise.resolve(window.gruzAuthRestore);
        if(gAccessToken){await finishEntry();}
        else{hideBanner();entering=false;login.disabled=false;nav.scrollIntoView({behavior:'instant'});nav.focus({preventScroll:true});}
      });
    }
  }catch(_){}
});
