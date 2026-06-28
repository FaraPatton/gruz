'use strict';

const { applyCors, getBearerToken, sendJson } = require('../../server/http');
const { ApiError, verifyAnalyticsUser } = require('../../server/google-auth');
const { privateRuntimeConfig } = require('../../server/private-config');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    await verifyAnalyticsUser(getBearerToken(req));
    return sendJson(res, 200, { config: privateRuntimeConfig() });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Private config endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
