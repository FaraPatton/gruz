'use strict';

const { applyCors, getBearerToken, parseList, sendJson } = require('../../server/http');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  const token = getBearerToken(req);
  if (!token) return sendJson(res, 401, { error: 'authentication_required' });

  const allowedEmails = parseList(process.env.ANALYTICS_ALLOWED_EMAILS)
    .map(email => email.toLowerCase());
  if (!allowedEmails.length) return sendJson(res, 503, { error: 'access_policy_not_configured' });

  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return sendJson(res, 401, { error: 'invalid_google_token' });

    const profile = await response.json();
    const email = String(profile.email || '').trim().toLowerCase();
    const verified = profile.email_verified === true;

    if (!email || !verified || !allowedEmails.includes(email)) {
      return sendJson(res, 403, { error: 'access_denied' });
    }

    return sendJson(res, 200, {
      authenticated: true,
      user: {
        email,
        name: String(profile.name || ''),
        picture: String(profile.picture || '')
      }
    });
  } catch (error) {
    console.error('Google userinfo request failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 502, { error: 'identity_provider_unavailable' });
  }
};
