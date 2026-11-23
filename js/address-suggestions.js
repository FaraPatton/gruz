// Selecting a suggestion changes only the active route field.
document.addEventListener('DOMContentLoaded', () => {
  const normalize = value => value.toLocaleLowerCase('ru').replaceAll('ё', 'е')
    .match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
  const expandRegion = text => text.replace(/(?<![\p{L}\p{N}])м\.?\s?о\.?(?![\p{L}\p{N}])/giu, 'Московская область');
  let registryRequest;
  let mapsConfigured = true;

  async function getTrips() {
    await window.gruzAuthRestore;
    if (typeof gAccessToken === 'undefined' || !gAccessToken) {
      registryRequest = undefined;
      return [];
    }
    registryRequest ||= loadTripsRegistry().then(registry => registry.trips).catch(() => {
      registryRequest = undefined;
      return [];
    });
    return registryRequest;
  }

  function historyMatches(trips, query, isOrigin, opposite) {
    const words = normalize(query).split(' ').filter(Boolean);
    const matches = new Map();
    for (const trip of trips) {
      const address = isOrigin ? trip.routeOrigin : trip.routeDestination;
      const other = isOrigin ? trip.routeDestination : trip.routeOrigin;
      const key = normalize(address);
      if (!key || !words.every(word => key.includes(word))) continue;
      const entry = matches.get(key) || { address, paired: 0, count: 0, date: '' };
      entry.paired += Number(Boolean(opposite) && normalize(other) === opposite);
      entry.count++;
      const date = trip.loadDate || trip.date;
      if (date > entry.date) {
        entry.date = date;
        entry.address = address;
      }
      matches.set(key, entry);
    }
    return [...matches.values()]
      .sort((a, b) => b.paired - a.paired || b.count - a.count || b.date.localeCompare(a.date))
      .slice(0, 6)
      .map(entry => entry.address);
  }

  async function mapMatches(query) {
    await window.gruzAuthRestore;
    if (!mapsConfigured || typeof gAccessToken === 'undefined' || !gAccessToken) return [];
    try {
      const response = await authApiFetch('/api/address-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query })
      });
      const data = await response.json();
      if (data.error === 'suggest_not_configured') mapsConfigured = false;
      return response.ok && Array.isArray(data.addresses) ? data.addresses : [];
    } catch {
      return [];
    }
  }

  for (const [id, otherId] of [['from_a', 'to_a'], ['to_a', 'from_a']]) {
    const input = document.getElementById(id);
    const other = document.getElementById(otherId);
    const panel = document.getElementById(id + '-suggestions');
    const list = panel.querySelector('ul');
    let generation = 0;
    let timer;
    let historyAddresses = [];
    let mapAddresses = [];

    function close() {
      generation++;
      clearTimeout(timer);
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }

    function select(address) {
      input.value = address;
      input.focus();
      close();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function render() {
      const seen = new Set([normalize(input.value)]);
      list.replaceChildren();
      for (const address of [...historyAddresses, ...mapAddresses]) {
        const key = normalize(address);
        if (seen.has(key)) continue;
        seen.add(key);
        const item = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = address;
        option.addEventListener('click', () => select(address));
        item.append(option);
        list.append(item);
      }
      panel.hidden = !list.childElementCount;
      input.setAttribute('aria-expanded', String(!panel.hidden));
    }

    function refresh(searchMaps) {
      const current = ++generation;
      const query = expandRegion(input.value.trim());
      clearTimeout(timer);
      historyAddresses = [];
      mapAddresses = [];
      render();

      getTrips().then(trips => {
        if (current !== generation || document.activeElement !== input) return;
        historyAddresses = historyMatches(trips, query, id === 'from_a', normalize(other.value));
        render();
      });

      if (searchMaps && query.length >= 3 && query.length <= 240) {
        timer = setTimeout(async () => {
          const addresses = await mapMatches(query);
          if (current !== generation || document.activeElement !== input) return;
          mapAddresses = addresses;
          render();
        }, 320);
      }
    }

    input.addEventListener('focus', () => refresh(false));
    input.addEventListener('input', event => { if (!event.isComposing) refresh(true); });
    input.addEventListener('compositionend', () => refresh(true));
    input.parentElement.addEventListener('focusout', event => {
      if (!input.parentElement.contains(event.relatedTarget)) close();
    });
    input.parentElement.addEventListener('keydown', event => {
      if (panel.hidden) return;
      if (event.key === 'Escape') {
        input.focus();
        close();
        event.preventDefault();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const options = [...list.querySelectorAll('button')];
        const index = options.indexOf(event.target);
        const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        (options[next] || input).focus();
        event.preventDefault();
      }
    });
    document.addEventListener('gruz:data-updated', close);
  }
});
