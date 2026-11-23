// Native scroll plus an optional, cancellable camera move when entering.
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.app-hdr');
  if (!header) return;
  // Rear-view compositions reviewed for desktop and mobile.
  const artworkVersion = 'v4';
  const scene = document.createElement('section');
  scene.className = 'workspace-scene';
  scene.setAttribute('aria-label', 'Рабочее место в пути');
  scene.innerHTML = `<div class="workspace-scene-stage">
    <div class="workspace-scene-visual"><picture><source media="(max-width:767px)" srcset="img/workspace/driver-office-mobile-${artworkVersion}.webp"><img class="workspace-scene-photo" src="img/workspace/driver-office-${artworkVersion}.webp" width="1672" height="941" fetchpriority="high" alt="Рефрижератор MAN с гидробортом; перед ним ноутбук, термос и кофе"></picture></div>
    <div class="workspace-scene-shade" aria-hidden="true"></div>
    <div class="workspace-scene-copy"><p class="workspace-scene-eyebrow">ГРУЗОПЕРЕВОЗКИ · МОСКВА</p><h1>ИП Карпов С.В.</h1><button type="button" class="workspace-scene-enter"><span>Оформить бумаги</span><span class="scene-enter-arrow" aria-hidden="true">↗</span></button>
</div>
    <p class="workspace-scene-scroll" aria-hidden="true">Вниз — к вашему рабочему столу <span>↓</span></p>
  </div>`;
  header.before(scene);
  const button = scene.querySelector('.workspace-scene-enter');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const image = scene.querySelector('img');
  const visual = scene.querySelector('.workspace-scene-visual');
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
    const center = mobile ? { x: .497, y: .802 } : { x: .514, y: .765 };
    const scale = (mobile ? Math.min : Math.max)(stage.clientWidth/(image.naturalWidth||1672), stage.clientHeight/(image.naturalHeight||941));
    const cx = stage.clientWidth/2+(center.x-.5)*(image.naturalWidth||1672)*scale;
    const cy = mobile ? stage.clientHeight-(1-center.y)*(image.naturalHeight||941)*scale : stage.clientHeight/2+(center.y-.5)*(image.naturalHeight||941)*scale;
    visual.style.transformOrigin = `${cx}px ${cy}px`;
    visual.style.transform = reduced.matches ? 'none' : `translate3d(${(stage.clientWidth/2-cx)*progress}px,${(stage.clientHeight/2-cy)*progress}px,0) scale(${1+progress*3.4})`;
    scene.querySelector('.workspace-scene-copy').inert = progress>.3 && !entering;
  };
  const schedule = () => {if(!pending){pending=true;requestAnimationFrame(update);}};
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('pageshow',schedule);
  reduced.addEventListener('change',schedule);
  image.addEventListener('load',schedule);
  image.addEventListener('error',()=>{
    if (!image.dataset.fallback) {
      image.dataset.fallback = 'true';
      scene.querySelector('source').srcset = 'img/workspace/driver-office-mobile-v1.webp';
      image.src = 'img/workspace/driver-office-v1.webp';
      return;
    }
    scene.classList.add('scene-image-unavailable');
  });

  const enter = () => new Promise(resolve => {
    if(reduced.matches){scrollTo({top:header.getBoundingClientRect().top+scrollY,behavior:'instant'});resolve(true);return;}
    const from=scrollY, to=header.getBoundingClientRect().top+scrollY;
    const started=performance.now();let frame;
    const cleanup=()=>{cancelAnimationFrame(frame);['wheel','touchstart','keydown'].forEach(type=>removeEventListener(type,cancel));};
    const cancel=()=>{cleanup();resolve(false);};
    ['wheel','touchstart','keydown'].forEach(type=>addEventListener(type,cancel,{passive:true}));
    const step=now=>{const t=Math.min(1,(now-started)/2800);const ease=t*t*t*(t*(t*6-15)+10);scrollTo({top:from+(to-from)*ease,behavior:'instant'});if(t<1)frame=requestAnimationFrame(step);else{cleanup();resolve(true);}};
    frame=requestAnimationFrame(step);
  });
  button.addEventListener('click', async () => {
    if (entering) return;
    entering = true;
    const completed = await enter();
    entering = false;
    update();
    if (completed) header.focus({ preventScroll: true });
  });
  update();
});
