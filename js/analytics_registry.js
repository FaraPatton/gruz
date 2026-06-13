// Analytics Drive registry: trips.json storage and archive scanning.

let analyticsRegistryFileId = null;

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

async function findTripsRegistryFile() {
  const q = encodeURIComponent(
    "'" + ARCHIVE_ROOT + "' in parents and name='" + TRIPS_REGISTRY_NAME + "' and trashed=false"
  );
  const data = await driveJson(
    'https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,modifiedTime)&pageSize=1'
  );
  return data.files?.[0] || null;
}

async function loadTripsRegistry() {
  setProgress('ИЩУ trips.json...');
  const file = await findTripsRegistryFile();
  analyticsRegistryFileId = file?.id || null;
  if (!file) {
    return { version: TRIPS_REGISTRY_VERSION, updatedAt: null, trips: [] };
  }

  setProgress('ЗАГРУЖАЮ trips.json...');
  const resp = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', {
    headers: { Authorization: 'Bearer ' + gAccessToken }
  });
  if (!resp.ok) throw new Error('Не удалось загрузить trips.json: HTTP ' + resp.status);
  const registry = await resp.json();
  registry.trips = Array.isArray(registry.trips) ? registry.trips.map(normalizeTrip).filter(Boolean) : [];
  return registry;
}

async function saveTripsRegistry(registry) {
  const current = analyticsRegistryFileId ? { id: analyticsRegistryFileId } : await findTripsRegistryFile();
  analyticsRegistryFileId = current?.id || null;

  const metadata = analyticsRegistryFileId
    ? { name: TRIPS_REGISTRY_NAME, mimeType: 'application/json' }
    : { name: TRIPS_REGISTRY_NAME, mimeType: 'application/json', parents: [ARCHIVE_ROOT] };

  const boundary = 'gruz_registry_' + Date.now();
  const payload = JSON.stringify(registry, null, 2);
  const body =
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    payload + '\r\n' +
    '--' + boundary + '--';

  const url = analyticsRegistryFileId
    ? 'https://www.googleapis.com/upload/drive/v3/files/' + analyticsRegistryFileId + '?uploadType=multipart'
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  setProgress('СОХРАНЯЮ trips.json...');
  const data = await driveJson(url, {
    method: analyticsRegistryFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  analyticsRegistryFileId = data.id || analyticsRegistryFileId;
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const text = (await page.getTextContent()).items.map(i => i.str).join(' ').replace(/\s+/g, ' ');
    return parseTripFromPdfText(text, file);
  } catch(e) {
    console.warn('Analytics PDF skipped:', file.name, e);
    return null;
  }
}
