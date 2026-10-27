// Presentation layer. Existing fields, PDF actions and access checks stay in place.
document.addEventListener('DOMContentLoaded', () => {
  try { if (localStorage.getItem('gruzInterface') === 'classic') return; } catch (_) {}
  const main = document.querySelector('.main');
  const cards = main ? [...main.querySelectorAll(':scope > .dc')] : [];
  const invoice = document.querySelector('[onclick="genInvoice()"]');
  const act = document.querySelector('[onclick="genAct()"]');
  if (!main || cards.length < 4 || !invoice || !act) return;

  const element = (tag, className, html) => {
    const node = document.createElement(tag);
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
  };
  document.querySelector('.brand-copy p').innerHTML = '<span>Код ATI: <b>2936939</b></span><span>Контур ЭДО: <b>2BM-771313296859-2026090605550033630920000000021:03</b></span>';
  const loginLabel = document.getElementById('loginBtnText');
  if (loginLabel.textContent === 'Войти в Google') loginLabel.textContent = 'Войти';
  const header = element('div', 'workspace-heading', '<div><p class="workspace-kicker">ДОКУМЕНТЫ / НОВЫЙ КОМПЛЕКТ</p><h2>Счёт и акт</h2><time class="workspace-clock" aria-live="off"></time></div>');
  const dateFormat = new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric',weekday:'long'});
  const timeFormat = new Intl.DateTimeFormat('ru-RU', {timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const clock = header.querySelector('time');
  const tick = () => { const now = new Date(); clock.dateTime = now.toISOString(); clock.textContent = `${dateFormat.format(now)} · ${timeFormat.format(now)} МСК`; };
  tick();
  setInterval(() => { if (!document.hidden) tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  const nav = element('nav', 'workspace-nav', '<a href="#document-editor" aria-current="page">Документы</a><button type="button" data-action="archive">Архив</button><button type="button" data-action="analytics">Аналитика</button><span class="workspace-nav-note">Грузоперевозки · Москва</span>');
  nav.setAttribute('aria-label', 'Разделы приложения');
  nav.querySelector('[data-action="archive"]').addEventListener('click', () => {
    openArchiveBrowser();
    document.getElementById('archiveBrowser').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  nav.querySelector('[data-action="analytics"]').addEventListener('click', () => handleAnalyticsAccessClick());
  document.querySelector('.app-hdr').after(nav);

  const grid = element('div', 'workspace-grid');
  const editor = element('section', 'workspace-editor');
  editor.id = 'document-editor';
  editor.setAttribute('aria-label', 'Данные для счёта и акта');
  const titles = ['01 / Документ', '02 / Заказчик', '03 / Перевозка и стоимость', '04 / Печать и подпись'];
  cards.slice(0, 4).forEach((card, i) => {
    card.querySelector('.cl').textContent = titles[i];
    card.classList.add('is-visible');
    card.dataset.section = ['document', 'customer', 'route', 'signature'][i];
    card.classList.remove('reveal-on-scroll');
    editor.append(card);
  });
  editor.querySelectorAll('label.fl').forEach(label => {
    const field = label.parentElement.querySelector('input[id]');
    if (field) label.htmlFor = field.id;
  });

  const aside = element('aside', 'workspace-aside', '<div class="workspace-review"><div class="workspace-review-head"><span>Проверка данных</span><span class="workspace-badge">Черновик</span></div><div class="workspace-paper"><div class="workspace-paper-brand">ИП Карпов С.В.<span>Грузоперевозки</span></div><h3>Комплект № <span data-value="doc_num"></span></h3><p class="workspace-paper-dates">Счёт: <span data-date="doc_date"></span> · Акт: <span data-date="act_date"></span></p><div class="workspace-paper-label">Заказчик</div><strong data-value="customer_name"></strong><p class="workspace-paper-meta">ИНН <span data-value="customer_inn"></span> · КПП <span data-value="customer_kpp"></span></p><div class="workspace-paper-label">Маршрут</div><div class="workspace-route"><p data-value="from_a"></p><span aria-hidden="true">↓</span><p data-value="to_a"></p></div><p class="workspace-paper-meta" data-value="car"></p><div class="workspace-total"><span>Всего к оплате</span><strong id="workspaceAmount"></strong></div></div><p class="workspace-review-note">Сводка введённых данных. Счёт и акт сохраняются в PDF.</p></div>');
  aside.setAttribute('aria-label', 'Проверка и создание документов');
  const actions = invoice.closest('.row');
  actions.classList.add('workspace-create');
  actions.id = 'document-actions';
  aside.append(actions);
  const tools = element('div', 'workspace-tools');
  [['driveBtn', 'Взять данные из архива'], ['archiveBtn', 'Сохранить в архив'], ['emailToggleBtn', 'Отправить комплект'], ['signToggleBtn', 'Подписать договор']].forEach(([id, text]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.textContent = text;
    tools.append(button.parentElement);
  });
  aside.append(tools);
  grid.append(editor, aside);
  main.prepend(header, grid);
  if (typeof isLocalDesignPreview === 'function' && isLocalDesignPreview()) {
    const notice = element('div', 'workspace-local-notice', '<strong>Предпросмотр нового интерфейса</strong><p>Здесь можно заполнить форму и оценить дизайн. Вход, создание PDF, архив и отправка работают на основном сайте.</p><a href="https://gruz-kappa.vercel.app/" target="_blank" rel="noopener">Открыть рабочее приложение ↗</a>');
    notice.id = 'localPreviewNotice';
    notice.tabIndex = -1;
    main.prepend(notice);
    // Intercept only server-dependent actions in the static design preview.
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      // The scene login demonstrates camera motion locally, without attempting OAuth.
      if (button.id === 'loginBtn' && button.dataset.sceneEnter === 'true') return;
      const protectedIds = ['loginBtn', 'driveBtn', 'archiveBtn', 'emailToggleBtn', 'signToggleBtn', 'sendEmailBtn', 'downloadSignBtn', 'sendSignedBtn'];
      if (protectedIds.includes(button.id) || button.matches('.doc-flight-btn, [data-action="archive"], [data-action="analytics"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        explainLocalDesignPreview();
      }
    }, true);
  }
  const mobileAction = element('a', 'workspace-mobile-action', 'Счёт и акт <span aria-hidden="true">↓</span>');
  mobileAction.href = '#document-actions';
  mobileAction.setAttribute('aria-label', 'Перейти к созданию счёта и акта');
  main.append(mobileAction);

  const theme = document.querySelector('.bb8-toggle');
  if (theme) {
    const caption = element('span', 'workspace-theme-caption', 'Тема');
    theme.append(caption);
  }
  const sync = () => {
    aside.querySelectorAll('[data-value]').forEach(node => {
      node.textContent = document.getElementById(node.dataset.value)?.value.trim() || 'Не указано';
    });
    aside.querySelectorAll('[data-date]').forEach(node => {
      const value = document.getElementById(node.dataset.date)?.value;
      node.textContent = value ? value.split('-').reverse().join('.') : '—';
    });
    const value = document.getElementById('amount').value;
    document.getElementById('workspaceAmount').textContent = value !== '' && Number.isFinite(Number(value))
      ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(Number(value)) : '—';
  };
  editor.addEventListener('input', sync);
  editor.addEventListener('change', sync);
  document.addEventListener('gruz:data-updated', sync);
  window.addEventListener('pageshow', sync);
  sync();
  document.body.classList.add('workbench');
});
