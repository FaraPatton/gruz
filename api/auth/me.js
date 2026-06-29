'use strict';

const { applyCors, sendJson } = require('../../server/http');
const { ApiError } = require('../../server/google-auth');
const { authContext } = require('../../server/session-auth');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    const { user, mode } = await authContext(req, res);
    return sendJson(res, 200, {
      authenticated: true,
      mode,
      user
    });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Auth endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
