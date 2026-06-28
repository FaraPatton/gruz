'use strict';

const { ApiError } = require('./google-auth');
const { MAX_REGISTRY_BYTES } = require('./trips-registry');

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveApiError(response, fallbackCode) {
  let reason = '';
  try {
    const body = await response.json();
    reason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || '').slice(0, 80);
  } catch (error) {}

  console.warn('Google Drive API rejected request:', {
    status: response.status,
    reason: reason || 'unknown'
  });

  if (response.status === 400) return new ApiError(502, 'drive_query_invalid');
  if (response.status === 401) return new ApiError(401, 'drive_token_invalid');
  if (response.status === 403) return new ApiError(403, 'drive_access_denied');
  if (response.status === 404) return new ApiError(404, 'drive_resource_not_found');
  return new ApiError(502, fallbackCode);
}

async function driveFetchJson(url, token) {
  let response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    console.error('Google Drive request failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'drive_unavailable');
  }
  if (!response.ok) throw await driveApiError(response, 'drive_request_failed');
  return response.json();
}

async function findTripsRegistryFile(token, archiveRoot) {
  const query = `'${driveQueryValue(archiveRoot)}' in parents and name='trips.json' and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '100'
  });
  const listing = await driveFetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  const files = Array.isArray(listing.files) ? listing.files : [];
  if (files.length > 1) {
    console.warn('Multiple trips.json files found in archive root:', files.length);
  }
  return files[0] || null;
}

async function loadTripsRegistry(token) {
  const archiveRoot = String(process.env.ARCHIVE_ROOT || '').trim();
  if (!archiveRoot) throw new ApiError(503, 'archive_not_configured');

  const file = await findTripsRegistryFile(token, archiveRoot);
  if (!file?.id) return { version: 6, updatedAt: null, trips: [] };

  let response;
  try {
    response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (error) {
    console.error('Trips registry download failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'drive_unavailable');
  }
  if (!response.ok) throw await driveApiError(response, 'registry_download_failed');

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_REGISTRY_BYTES) throw new ApiError(413, 'registry_too_large');

  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_REGISTRY_BYTES) {
    throw new ApiError(413, 'registry_too_large');
  }

  let registry;
  try {
    registry = JSON.parse(text);
  } catch (error) {
    throw new ApiError(502, 'registry_invalid');
  }
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.trips)) {
    throw new ApiError(502, 'registry_invalid');
  }

  return registry;
}

async function saveTripsRegistry(token, registryText) {
  const archiveRoot = String(process.env.ARCHIVE_ROOT || '').trim();
  if (!archiveRoot) throw new ApiError(503, 'archive_not_configured');

  const file = await findTripsRegistryFile(token, archiveRoot);
  const metadata = file?.id
    ? { name: 'trips.json', mimeType: 'application/json' }
    : { name: 'trips.json', mimeType: 'application/json', parents: [archiveRoot] };
  const boundary = `gruz_registry_${Date.now()}`;
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    registryText + '\r\n' +
    `--${boundary}--`;
  const url = file?.id
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  let response;
  try {
    response = await fetch(url, {
      method: file?.id ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
  } catch (error) {
    console.error('Trips registry upload failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'drive_unavailable');
  }
  if (!response.ok) throw await driveApiError(response, 'registry_upload_failed');
}

module.exports = { driveApiError, driveFetchJson, loadTripsRegistry, saveTripsRegistry };
