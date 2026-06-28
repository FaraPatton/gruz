'use strict';

const { ApiError } = require('./google-auth');
const { driveApiError, driveFetchJson } = require('./google-drive');
const { privateStampFileId } = require('./private-config');

const MAX_STAMP_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg']);

function validImageSignature(buffer, mimeType) {
  if (mimeType === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

async function loadPrivateStamp(token) {
  const id = privateStampFileId();
  const metadata = await driveFetchJson(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size`,
    token
  );
  const mimeType = String(metadata.mimeType || '').toLowerCase();
  const size = Number(metadata.size) || 0;
  if (!ALLOWED_MIME.has(mimeType)) throw new ApiError(415, 'stamp_type_invalid');
  if (size > MAX_STAMP_BYTES) throw new ApiError(413, 'stamp_too_large');

  let response;
  try {
    response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (error) {
    throw new ApiError(502, 'drive_unavailable');
  }
  if (!response.ok) throw await driveApiError(response, 'stamp_download_failed');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_STAMP_BYTES) throw new ApiError(413, 'stamp_too_large');
  const image = Buffer.from(await response.arrayBuffer());
  if (!image.length || image.length > MAX_STAMP_BYTES || !validImageSignature(image, mimeType)) {
    throw new ApiError(502, 'stamp_invalid');
  }
  return { image, mimeType };
}

module.exports = { loadPrivateStamp, validImageSignature };
