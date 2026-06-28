'use strict';

const { applyCors, getBearerToken, sendJson } = require('../../server/http');
const { ApiError, verifyAnalyticsUser } = require('../../server/google-auth');
const { uploadArchivePdf } = require('../../server/archive-drive');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const token = getBearerToken(req);
  try {
    await verifyAnalyticsUser(token);
    const file = await uploadArchivePdf(token, req.body?.year, req.body?.fileName, req.body?.pdfBase64);
    return sendJson(res, 200, { stored: true, file });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Archive PDF endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
