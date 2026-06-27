'use strict';

const { applyCors, sendJson } = require('../server/http');

module.exports = function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  return sendJson(res, 200, {
    ok: true,
    service: 'gruz-api',
    timestamp: new Date().toISOString()
  });
};
