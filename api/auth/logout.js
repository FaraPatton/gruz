'use strict';

const { applyCors, sendJson } = require('../../server/http');
const { clearSessionCookie } = require('../../server/session-auth');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });

  clearSessionCookie(res);
  if (req.method === 'GET') return res.redirect(302, '/');
  return sendJson(res, 200, { loggedOut: true });
};
