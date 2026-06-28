'use strict';

const { applyCors, getBearerToken, sendJson, setSecurityHeaders } = require('../../server/http');
const { ApiError, verifyAnalyticsUser } = require('../../server/google-auth');
const { loadPrivateStamp } = require('../../server/stamp-reader');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const token = getBearerToken(req);
  try {
    await verifyAnalyticsUser(token);
    const stamp = await loadPrivateStamp(token);
    setSecurityHeaders(res);
    res.setHeader('Content-Type', stamp.mimeType);
    return res.status(200).send(stamp.image);
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Stamp endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
