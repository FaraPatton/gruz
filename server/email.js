'use strict';

const { ApiError } = require('./google-auth');

const MAX_SIGNED_PDF_BYTES = 3 * 1024 * 1024;

function recipientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'recipient_invalid');
  }
  return email;
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new ApiError(503, 'email_not_configured');
  return value;
}

function driveFileId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(?:folders\/|[?&]id=)([A-Za-z0-9_-]{10,})/) || raw.match(/^([A-Za-z0-9_-]{10,})$/);
  if (!match) throw new ApiError(503, 'email_not_configured');
  return match[1];
}

function encodedHeader(value) {
  const clean = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function base64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return buffer.toString('base64url');
}

function textMessage(to, subject, body) {
  return [
    `To: ${to}`,
    `Subject: ${encodedHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(body), 'utf8').toString('base64')
  ].join('\r\n');
}

function signedPdfMessage(to, subject, body, pdf) {
  const boundary = `gruz_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return [
    `To: ${to}`,
    `Subject: ${encodedHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(body), 'utf8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="dogovor_podpisany.pdf"',
    '',
    pdf.toString('base64'),
    '',
    `--${boundary}--`
  ].join('\r\n');
}

function signedPdfBuffer(value) {
  const base64 = String(value || '').replace(/^data:application\/pdf;base64,/, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new ApiError(400, 'pdf_invalid');
  }
  const pdf = Buffer.from(base64, 'base64');
  if (!pdf.length || pdf.length > MAX_SIGNED_PDF_BYTES) throw new ApiError(413, 'pdf_too_large');
  if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ApiError(400, 'pdf_invalid');
  return pdf;
}

async function gmailSend(token, message) {
  let response;
  try {
    response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: base64Url(message) })
    });
  } catch (error) {
    console.error('Gmail request failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'gmail_unavailable');
  }
  if (response.status === 401) throw new ApiError(401, 'gmail_token_invalid');
  if (response.status === 403) throw new ApiError(403, 'gmail_access_denied');
  if (!response.ok) throw new ApiError(502, 'gmail_send_failed');
}

async function grantFolderAccess(token, folderId, email) {
  let response;
  try {
    response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email })
      }
    );
  } catch (error) {
    console.error('Drive permission request failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'drive_unavailable');
  }
  if (response.ok) return true;

  const data = await response.json().catch(() => ({}));
  const message = String(data?.error?.message || '');
  if (response.status === 409 || /already exists|already has access/i.test(message)) return false;
  if (response.status === 401) throw new ApiError(401, 'drive_token_invalid');
  if (response.status === 403) throw new ApiError(403, 'drive_access_denied');
  throw new ApiError(502, 'drive_permission_failed');
}

module.exports = {
  gmailSend,
  grantFolderAccess,
  recipientEmail,
  requiredEnv,
  driveFileId,
  signedPdfBuffer,
  signedPdfMessage,
  textMessage
};
