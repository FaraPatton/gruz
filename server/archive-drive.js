'use strict';

const { ApiError } = require('./google-auth');

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function driveJson(url, token, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  } catch (error) {
    console.error('Archive Drive request failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'drive_unavailable');
  }
  if (response.status === 401) throw new ApiError(401, 'drive_token_invalid');
  if (response.status === 403) throw new ApiError(403, 'drive_access_denied');
  if (!response.ok) throw new ApiError(502, 'drive_request_failed');
  return response.json();
}

async function findFile(token, parentId, name, mimeType) {
  const query = `'${driveQueryValue(parentId)}' in parents and name='${driveQueryValue(name)}' and mimeType='${mimeType}' and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '10'
  });
  const data = await driveJson(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  return Array.isArray(data.files) ? data.files[0] || null : null;
}

async function yearFolder(token, year) {
  const archiveRoot = String(process.env.ARCHIVE_ROOT || '').trim();
  if (!archiveRoot) throw new ApiError(503, 'archive_not_configured');

  const mimeType = 'application/vnd.google-apps.folder';
  const existing = await findFile(token, archiveRoot, String(year), mimeType);
  if (existing?.id) return existing.id;

  const created = await driveJson('https://www.googleapis.com/drive/v3/files', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: String(year), mimeType, parents: [archiveRoot] })
  });
  if (!created?.id) throw new ApiError(502, 'archive_folder_create_failed');
  return created.id;
}

function archiveYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2015 || year > 2100) throw new ApiError(400, 'archive_year_invalid');
  return year;
}

function archiveFileName(value) {
  const name = String(value || '').trim();
  if (name.length > 180 || !/^(?:schet|akt)_[A-Za-zА-Яа-яЁё0-9_.-]+\.pdf$/i.test(name)) {
    throw new ApiError(400, 'archive_filename_invalid');
  }
  return name;
}

function archivePdf(value) {
  const base64 = String(value || '').replace(/^data:application\/pdf;base64,/, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new ApiError(400, 'pdf_invalid');
  }
  const pdf = Buffer.from(base64, 'base64');
  if (!pdf.length || pdf.length > 3 * 1024 * 1024) throw new ApiError(413, 'pdf_too_large');
  if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ApiError(400, 'pdf_invalid');
  return pdf;
}

async function uploadArchivePdf(token, yearValue, nameValue, pdfBase64) {
  const year = archiveYear(yearValue);
  const name = archiveFileName(nameValue);
  const pdf = archivePdf(pdfBase64);
  const folderId = await yearFolder(token, year);
  const existing = await findFile(token, folderId, name, 'application/pdf');
  const metadata = existing?.id
    ? { name, mimeType: 'application/pdf' }
    : { name, mimeType: 'application/pdf', parents: [folderId] };
  const boundary = `gruz_pdf_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
    pdf,
    Buffer.from(`\r\n--${boundary}--`, 'utf8')
  ]);
  const url = existing?.id
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const uploaded = await driveJson(url, token, {
    method: existing?.id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  if (!uploaded?.id) throw new ApiError(502, 'archive_upload_failed');
  return { id: uploaded.id, name };
}

module.exports = { archiveFileName, archivePdf, archiveYear, uploadArchivePdf };
