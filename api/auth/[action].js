'use strict';

const { applyCors, sendJson } = require('../../server/http');
const { ApiError } = require('../../server/google-auth');
const {
  authContext,
  authStartUrl,
  clearSessionCookie,
  exchangeCodeForSession,
  setSessionCookie,
  verifyState
} = require('../../server/session-auth');

function actionName(req) {
  const action = req.query?.action;
  return Array.isArray(action) ? action[0] : String(action || '');
}

async function handleStart(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  return res.redirect(302, authStartUrl(req, req.query?.returnTo));
}

async function handleCallback(req, res) {
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
    throw error;
  }
}

async function handleLogout(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
  clearSessionCookie(res);
  if (req.method === 'GET') return res.redirect(302, '/');
  return sendJson(res, 200, { loggedOut: true });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const { user, mode } = await authContext(req, res);
  return sendJson(res, 200, {
    authenticated: true,
    mode,
    user
  });
}

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const action = actionName(req);
    if (action === 'start') return handleStart(req, res);
    if (action === 'callback') return handleCallback(req, res);
    if (action === 'logout') return handleLogout(req, res);
    if (action === 'me') return handleMe(req, res);
    return sendJson(res, 404, { error: 'auth_route_not_found' });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    console.error('Auth endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'internal_error' });
  }
};
