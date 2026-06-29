'use strict';

const { applyCors, sendJson } = require('../../server/http');
const { ApiError } = require('../../server/google-auth');
const { authContext } = require('../../server/session-auth');
const {
  driveFileId,
  gmailSend,
  grantFolderAccess,
  recipientEmail,
  requiredEnv,
  textMessage
} = require('../../server/email');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    const { token } = await authContext(req, res);
    const to = recipientEmail(req.body?.to);
    const subject = requiredEnv('EMAIL_SUBJECT');
    const body = requiredEnv('EMAIL_BODY');
    const folderId = driveFileId(requiredEnv('EMAIL_DRIVE_FOLDER_ID'));
    const accessGranted = await grantFolderAccess(token, folderId, to);
    await gmailSend(token, textMessage(to, subject, body));
    return sendJson(res, 200, { sent: true, accessGranted });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Documents email endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
