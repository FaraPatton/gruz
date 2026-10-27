// Switch presentation only. No remote files, sessions or business data are changed.
document.addEventListener('DOMContentLoaded', () => {
  const fields = ['doc_num', 'doc_date', 'act_date', 'customer_name', 'customer_inn',
    'customer_kpp', 'customer_addr', 'from_a', 'from_b', 'to_a', 'to_b', 'car',
    'load_date', 'unload_date', 'amount', 'emailTo'];
  const snapshotKey = 'gruz-interface-form';
  let current = 'modern';
  try { current = localStorage.getItem('gruzInterface') === 'classic' ? 'classic' : 'modern'; } catch (_) {}
  try {
    const saved = sessionStorage.getItem(snapshotKey);
    if (saved) {
      const snapshot = JSON.parse(saved);
      if (snapshot && Date.now() - snapshot.savedAt < 300000) {
        fields.forEach(id => {
          const field = document.getElementById(id);
          if (field && typeof snapshot.values?.[id] === 'string') field.value = snapshot.values[id];
        });
        document.getElementById('amount')?.dispatchEvent(new Event('input', { bubbles: true }));
      }
      sessionStorage.removeItem(snapshotKey);
    }
  } catch (_) {}

  const host = document.querySelector('.auth-row');
  if (!host) return;
  const menu = document.createElement('details');
  menu.className = 'interface-preferences';
  menu.innerHTML = '<summary>Профиль и вид</summary><div class="interface-preferences-panel"><strong>ИП Карпов С.В.</strong><p>Интерфейс на этом устройстве</p><button type="button" id="switchInterface"></button><small>Меняется только оформление. Архив и документы остаются на месте.</small><p class="interface-preferences-status" role="status"></p></div>';
  const button = menu.querySelector('button');
  button.textContent = current === 'classic' ? 'Включить новый интерфейс' : 'Классический интерфейс';
  const footer = document.createElement('footer');
  footer.className = 'interface-footer';
  footer.innerHTML = '<button type="button" id="switchInterfaceFooter"></button><p role="status"></p>';
  const footerButton = footer.querySelector('button');
  footerButton.textContent = current === 'classic' ? 'Вернуться к новому интерфейсу' : 'Вернуться к старому интерфейсу';
  document.querySelector('.main')?.after(footer);
  const switchView = (status) => {
    // A reload cannot preserve user-selected files or an in-memory contract canvas.
    const hasFiles = [...document.querySelectorAll('input[type="file"]')].some(input => input.files?.length);
    const contract = document.getElementById('contractName');
    if (hasFiles || (contract?.textContent.trim() && contract.style.display !== 'none')) {
      status.textContent = 'Сначала сохраните работу с загруженным файлом, затем обновите страницу и переключите вид.';
      return;
    }
    try {
      const values = {};
      fields.forEach(id => { const field = document.getElementById(id); if (field) values[id] = field.value; });
      sessionStorage.setItem(snapshotKey, JSON.stringify({ savedAt: Date.now(), values }));
      localStorage.setItem('gruzInterface', current === 'classic' ? 'modern' : 'classic');
    } catch (_) {
      status.textContent = 'Браузер не разрешил сохранить выбор. Вид не изменён, введённые данные сохранены на странице.';
      return;
    }
    location.reload();
  };
  button.addEventListener('click', () => switchView(menu.querySelector('[role="status"]')));
  footerButton.addEventListener('click', () => switchView(footer.querySelector('[role="status"]')));
  host.append(menu);
});
