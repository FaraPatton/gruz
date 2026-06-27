'use strict';

const { ApiError } = require('./google-auth');

const MAX_REGISTRY_BYTES = 5 * 1024 * 1024;

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

async function loadTripsRegistry(token) {
  const archiveRoot = String(process.env.ARCHIVE_ROOT || '').trim();
  if (!archiveRoot) throw new ApiError(503, 'archive_not_configured');

  const query = `'${driveQueryValue(archiveRoot)}' in parents and name='trips.json' and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime)',
    pageSize: '1'
  });
  const listing = await driveFetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  const file = Array.isArray(listing.files) ? listing.files[0] : null;
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

module.exports = { loadTripsRegistry };
