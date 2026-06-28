'use strict';

const { applyCors, getBearerToken, sendJson } = require('../../server/http');
const { ApiError, verifyAnalyticsUser } = require('../../server/google-auth');
const { loadTripsRegistry, saveTripsRegistry } = require('../../server/google-drive');
const { sanitizeRegistry } = require('../../server/trips-registry');

function requestBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      throw new ApiError(400, 'invalid_json');
    }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'PUT'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });

  const token = getBearerToken(req);
  try {
    await verifyAnalyticsUser(token);
    if (req.method === 'GET') {
      const registry = await loadTripsRegistry(token);
      return sendJson(res, 200, registry);
    }

    const { registry, text } = sanitizeRegistry(requestBody(req));
    await saveTripsRegistry(token, text);
    return sendJson(res, 200, registry);
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Trips endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
