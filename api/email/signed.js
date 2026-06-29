'use strict';

const { applyCors, sendJson } = require('../../server/http');
const { ApiError } = require('../../server/google-auth');
const { authContext } = require('../../server/session-auth');
const {
  gmailSend,
  recipientEmail,
  signedPdfBuffer,
  signedPdfMessage
} = require('../../server/email');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    const { token } = await authContext(req, res);
    const to = recipientEmail(req.body?.to);
    const pdf = signedPdfBuffer(req.body?.pdfBase64);
    const subject = String(process.env.SIGN_EMAIL_SUBJECT || 'Подписанный договор').trim();
    const body = String(process.env.SIGN_EMAIL_BODY || 'Добрый день!\nВо вложении подписанный договор.').trim();
    await gmailSend(token, signedPdfMessage(to, subject, body, pdf));
    return sendJson(res, 200, { sent: true });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Signed email endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
