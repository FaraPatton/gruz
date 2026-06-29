// Analytics Drive registry: trips.json storage and archive scanning.

async function archiveApiError(resp, fallback) {
  const data = await resp.json().catch(() => ({}));
  const messages = {
    archive_not_configured: 'архив не настроен на сервере',
    archive_too_many_files: 'в архиве слишком много файлов для одной пересборки',
    archive_file_not_found: 'PDF не найден внутри защищенного архива',
    pdf_too_large: 'PDF превышает допустимый размер',
    pdf_invalid: 'Drive вернул поврежденный PDF',
    drive_token_invalid: 'Google-сессия не дает доступ к Drive',
    drive_access_denied: 'Google Drive не разрешил доступ к архиву',
    drive_unavailable: 'Google Drive временно не отвечает',
    archive_download_failed: 'Google Drive не отдал архивный PDF'
  };
  return new Error(messages[data.error] || fallback + ': HTTP ' + resp.status);
}

async function listArchivePdfs() {
  const resp = await authApiFetch('/api/archive/files', {}, true);
  if (!resp.ok) throw await archiveApiError(resp, 'Не удалось получить список архива');
  const data = await resp.json();
  return Array.isArray(data.files) ? data.files : [];
}

async function loadTripsRegistry() {
  setProgress('ЗАГРУЖАЮ trips.json ЧЕРЕЗ API...');
  const resp = await authApiFetch('/api/analytics/trips', {}, true);
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
  const resp = await authApiFetch('/api/analytics/trips', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(registry)
  }, true);
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
  setProgress('ПОЛУЧАЮ СПИСОК АРХИВА ЧЕРЕЗ API...');
  const allFiles = (await listArchivePdfs()).filter(isDocumentPdf);

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
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
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
  const resp = await authApiFetch('/api/archive/file?id=' + encodeURIComponent(file.id), {}, true);
  if (!resp.ok) throw await archiveApiError(resp, 'Не удалось загрузить PDF');
  const buf = await resp.arrayBuffer();

  try {
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
