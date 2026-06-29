'use strict';

const { applyCors, sendJson } = require('../../server/http');
const { ApiError } = require('../../server/google-auth');
const { exchangeCodeForSession, setSessionCookie, verifyState } = require('../../server/session-auth');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    if (req.query?.error) throw new ApiError(401, 'oauth_denied');
    const state = verifyState(req.query?.state);
    const session = await exchangeCodeForSession(req, req.query?.code);
    setSessionCookie(res, session);
    return res.redirect(302, state.returnTo || '/');
  } catch (error) {
    if (error instanceof ApiError) {
      return res.redirect(302, '/?auth_error=' + encodeURIComponent(error.code));
    }
    console.error('Auth callback failed:', error instanceof Error ? error.message : 'unknown error');
    return res.redirect(302, '/?auth_error=internal_error');
  }
};
