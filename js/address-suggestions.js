// Keep the selected archive document intact when choosing an address.
document.addEventListener('DOMContentLoaded', () => {
  const normalize = value => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
  let registryRequest;

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

  for (const [id, otherId] of [['from_a', 'to_a'], ['to_a', 'from_a']]) {
    const input = document.getElementById(id);
    const other = document.getElementById(otherId);
    const panel = document.getElementById(id + '-suggestions');
    const list = panel.querySelector('ul');
    const mapLink = panel.querySelector('a');
    let generation = 0;

    function close() {
      generation++;
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    }

    async function refresh() {
      const current = ++generation;
      const value = input.value.trim();
      list.replaceChildren();
      mapLink.hidden = normalize(value).length < 3;
      mapLink.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(value);
      panel.hidden = mapLink.hidden;
      input.setAttribute('aria-expanded', String(!panel.hidden));

      const trips = await getTrips();
      if (current !== generation || document.activeElement !== input) return;
      const suggestions = historyMatches(trips, value, id === 'from_a', normalize(other.value));
      for (const address of suggestions) {
        if (normalize(address) === normalize(value)) continue;
        const item = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = address;
        option.addEventListener('click', () => {
          input.value = address;
          input.focus();
          close();
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        item.append(option);
        list.append(item);
      }
      panel.hidden = !list.childElementCount && mapLink.hidden;
      input.setAttribute('aria-expanded', String(!panel.hidden));
    }

    input.addEventListener('focus', refresh);
    input.addEventListener('input', event => { if (!event.isComposing) refresh(); });
    input.addEventListener('compositionend', refresh);
    input.parentElement.addEventListener('focusout', event => {
      if (!input.parentElement.contains(event.relatedTarget)) close();
    });
    input.parentElement.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        input.focus();
        close();
        event.preventDefault();
      }
      if (event.key === 'ArrowDown' && event.target === input && !panel.hidden) {
        panel.querySelector('button, a:not([hidden])')?.focus();
        event.preventDefault();
      }
    });
    document.addEventListener('gruz:data-updated', close);
  }
});
