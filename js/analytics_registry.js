// Analytics Drive registry: trips.json storage and archive scanning.

async function driveJson(url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + gAccessToken,
      ...(options.headers || {})
    }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('Drive API ' + resp.status + (text ? ': ' + text.slice(0, 120) : ''));
  }
  return resp.json();
}

async function driveList(parentId, kind) {
  const mime = kind === 'folder'
    ? "mimeType='application/vnd.google-apps.folder'"
    : "mimeType='application/pdf'";
  const q = encodeURIComponent("'" + parentId + "' in parents and " + mime + " and trashed=false");
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
    '&fields=files(id,name,mimeType,modifiedTime)&pageSize=1000';
  const data = await driveJson(url);
  return data.files || [];
}

async function loadTripsRegistry() {
  setProgress('ЗАГРУЖАЮ trips.json ЧЕРЕЗ API...');
  const resp = await fetch(authApiUrl('/api/analytics/trips'), {
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const messages = {
      authentication_required: 'требуется авторизация Google',
      invalid_google_token: 'Google-сессия устарела',
      access_denied: 'доступ к аналитике закрыт',
      archive_not_configured: 'архив не настроен на сервере',
      drive_query_invalid: 'Google Drive отклонил ID архивной папки',
      drive_token_invalid: 'Google-сессия не дает доступ к Drive',
      drive_access_denied: 'Google Drive не разрешил доступ к архивной папке',
      drive_resource_not_found: 'архивная папка или trips.json не найдены',
      drive_request_failed: 'Google Drive временно не отвечает',
      registry_download_failed: 'Google Drive не отдал trips.json',
      registry_invalid: 'trips.json поврежден',
      registry_too_large: 'trips.json превышает допустимый размер'
    };
    throw new Error(messages[data.error] || 'Не удалось загрузить trips.json: HTTP ' + resp.status);
  }
  const registry = await resp.json();
  registry.trips = Array.isArray(registry.trips) ? registry.trips.map(normalizeTrip).filter(Boolean) : [];
  return registry;
}

async function saveTripsRegistry(registry) {
  setProgress('СОХРАНЯЮ trips.json ЧЕРЕЗ API...');
  const resp = await fetch(authApiUrl('/api/analytics/trips'), {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + gAccessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(registry)
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const messages = {
      registry_invalid: 'формат trips.json не прошел проверку',
      registry_invalid_trip: 'один из рейсов содержит некорректные данные',
      registry_too_many_trips: 'в trips.json слишком много рейсов',
      registry_too_large: 'trips.json превышает допустимый размер',
      registry_upload_failed: 'Google Drive не сохранил trips.json',
      drive_access_denied: 'Google Drive не разрешил запись trips.json'
    };
    throw new Error(messages[data.error] || 'Не удалось сохранить trips.json: HTTP ' + resp.status);
  }
  await resp.json();
  return loadTripsRegistry();
}

async function scanDriveArchiveToTrips() {
  setProgress('ЧИТАЮ ПАПКИ ПО ГОДАМ...');
  const yearFolders = await driveList(ARCHIVE_ROOT, 'folder');
  const allFiles = [];

  for (const folder of yearFolders) {
    const year = parseInt(folder.name, 10);
    if (!year || year < 2015) continue;

    setProgress('ГОД ' + year + ': ИЩУ PDF...');
    const files = await driveList(folder.id, 'pdf');
    files
      .filter(isDocumentPdf)
      .forEach(file => allFiles.push({ ...file, fallbackYear: year }));
  }

  const orderedFiles = allFiles.sort((a, b) => {
    const ad = docTypeRank(a.name);
    const bd = docTypeRank(b.name);
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name, 'ru');
  });

  setProgress('НАЙДЕНО PDF: ' + orderedFiles.length);
  const trips = [];
  for (let i = 0; i < orderedFiles.length; i += 8) {
    setProgress(Math.min(i + 8, orderedFiles.length) + '/' + orderedFiles.length + ' ФАЙЛОВ...');
    const chunk = orderedFiles.slice(i, i + 8);
    const results = await Promise.allSettled(chunk.map(readTripFromPdf));
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) trips.push(result.value);
    });
  }

  return mergeTrips(trips).sort((a, b) => {
    const da = a.date || String(a.year || '');
    const db = b.date || String(b.year || '');
    return db.localeCompare(da);
  });
}

function isDocumentPdf(file) {
  const name = (file.name || '').toLowerCase();
  return name.startsWith('schet') || name.startsWith('akt');
}

function docTypeRank(name) {
  return String(name || '').toLowerCase().startsWith('schet') ? 0 : 1;
}

async function readTripFromPdf(file) {
  try {
    const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', {
      headers: { Authorization: 'Bearer ' + gAccessToken }
    });
    if (!resp.ok) return null;

    const buf = await resp.arrayBuffer();
    await ensurePdfJsLib();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map(i => i.str).join(' ').replace(/\s+/g, ' ');
    return parseTripFromPdfText(text, file);
  } catch(e) {
    console.warn('Analytics PDF skipped:', file.name, e);
    return null;
  }
}
