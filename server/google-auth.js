'use strict';

const { parseList } = require('./http');

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function verifyAnalyticsUser(token) {
  if (!token) throw new ApiError(401, 'authentication_required');

  const allowedEmails = parseList(process.env.ANALYTICS_ALLOWED_EMAILS)
    .map(email => email.toLowerCase());
  if (!allowedEmails.length) throw new ApiError(503, 'access_policy_not_configured');

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
  } catch (error) {
    console.error('Google userinfo request failed:', error instanceof Error ? error.message : 'unknown error');
    throw new ApiError(502, 'identity_provider_unavailable');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new ApiError(401, 'invalid_google_token');

  const profile = await response.json();
  const email = String(profile.email || '').trim().toLowerCase();
  if (!email || profile.email_verified !== true || !allowedEmails.includes(email)) {
    throw new ApiError(403, 'access_denied');
  }

  return {
    email,
    name: String(profile.name || ''),
    picture: String(profile.picture || '')
  };
}

module.exports = { ApiError, verifyAnalyticsUser };
