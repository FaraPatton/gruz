'use strict';

const { ApiError } = require('./google-auth');
const { driveApiError, driveFetchJson } = require('./google-drive');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PDF_MIME = 'application/pdf';
const MAX_ARCHIVE_PDF_BYTES = 3 * 1024 * 1024;

function driveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function archiveRoot() {
  const root = String(process.env.ARCHIVE_ROOT || '').trim();
  if (!root) throw new ApiError(503, 'archive_not_configured');
  return root;
}

async function listChildren(token, parentId, mimeType, fields) {
  const files = [];
  let pageToken = '';
  do {
    const query = `'${driveQueryValue(parentId)}' in parents and mimeType='${mimeType}' and trashed=false`;
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,files(${fields})`,
      orderBy: 'name',
      pageSize: '1000'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await driveFetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token);
    if (Array.isArray(data.files)) files.push(...data.files);
    pageToken = String(data.nextPageToken || '');
    if (files.length > 5000) throw new ApiError(413, 'archive_too_many_files');
  } while (pageToken);
  return files;
}

async function listArchivePdfs(token) {
  const folders = await listChildren(token, archiveRoot(), FOLDER_MIME, 'id,name');
  const years = folders
    .map(folder => ({ ...folder, year: Number(folder.name) }))
    .filter(folder => Number.isInteger(folder.year) && folder.year >= 2015 && folder.year <= 2100)
    .sort((a, b) => b.year - a.year);
  const files = [];
  for (const folder of years) {
    const children = await listChildren(token, folder.id, PDF_MIME, 'id,name,modifiedTime,size');
    children.forEach(file => {
      const name = String(file.name || '');
      if (/^(?:schet|akt)[_\s-]/i.test(name)) {
        files.push({ id: file.id, name, modifiedTime: file.modifiedTime || '', size: Number(file.size) || 0, fallbackYear: folder.year });
      }
    });
  }
  return files;
}

function archiveFileId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new ApiError(400, 'archive_file_id_invalid');
  return id;
}

async function loadArchivePdf(token, value) {
  const id = archiveFileId(value);
  const metadata = await driveFetchJson(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,size`,
    token
  );
  const parentId = Array.isArray(metadata.parents) ? metadata.parents[0] : '';
  if (metadata.mimeType !== PDF_MIME || !parentId || !/^(?:schet|akt)[_\s-]/i.test(String(metadata.name || ''))) {
    throw new ApiError(404, 'archive_file_not_found');
  }
  const size = Number(metadata.size) || 0;
  if (size > MAX_ARCHIVE_PDF_BYTES) throw new ApiError(413, 'pdf_too_large');

  const parent = await driveFetchJson(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parentId)}?fields=id,name,mimeType,parents`,
    token
  );
  const year = Number(parent.name);
  if (parent.mimeType !== FOLDER_MIME || !Number.isInteger(year) || year < 2015 || year > 2100 || !parent.parents?.includes(archiveRoot())) {
    throw new ApiError(404, 'archive_file_not_found');
  }

  let response;
  try {
    response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (error) {
    throw new ApiError(502, 'drive_unavailable');
  }
  if (!response.ok) throw await driveApiError(response, 'archive_download_failed');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_ARCHIVE_PDF_BYTES) throw new ApiError(413, 'pdf_too_large');
  const pdf = Buffer.from(await response.arrayBuffer());
  if (!pdf.length || pdf.length > MAX_ARCHIVE_PDF_BYTES || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new ApiError(502, 'pdf_invalid');
  }
  return { pdf, name: metadata.name };
}

module.exports = { archiveFileId, listArchivePdfs, loadArchivePdf };
