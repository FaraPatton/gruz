'use strict';

const crypto = require('crypto');
const { ApiError, verifyAnalyticsUser } = require('./google-auth');
const { getBearerToken } = require('./http');

const SESSION_COOKIE = 'gruz_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.send'
].join(' ');

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new ApiError(503, name.toLowerCase() + '_not_configured');
  return value;
}

function oauthClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.GCLIENT_ID || '').trim();
}

function sessionSecret() {
  return requiredEnv('SESSION_SECRET');
}

function encryptionKey() {
  return crypto.createHash('sha256').update(sessionSecret()).digest();
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signState(payload) {
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return body + '.' + signature;
}

function verifyState(state) {
  const [body, signature] = String(state || '').split('.');
  if (!body || !signature) throw new ApiError(400, 'oauth_state_invalid');
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) {
    throw new ApiError(400, 'oauth_state_invalid');
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new ApiError(400, 'oauth_state_invalid');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.createdAt || Date.now() - Number(payload.createdAt) > 10 * 60 * 1000) {
    throw new ApiError(400, 'oauth_state_expired');
  }
  return payload;
}

function encryptSession(session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptSession(value) {
  try {
    const data = Buffer.from(String(value || ''), 'base64url');
    if (data.length < 29) return null;
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch (error) {
    return null;
  }
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const index = cookie.indexOf('=');
    if (index < 0) continue;
    const key = cookie.slice(0, index).trim();
    if (key === name) return decodeURIComponent(cookie.slice(index + 1));
  }
  return '';
}

function setSessionCookie(res, session) {
  const value = encodeURIComponent(encryptSession(session));
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`
  ]);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
  ]);
}

function redirectUri(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}/api/auth/callback`;
}

function safeReturnTo(value) {
  const path = String(value || '/').trim();
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  return path.slice(0, 200);
}

function authStartUrl(req, returnTo) {
  const clientId = oauthClientId();
  if (!clientId) throw new ApiError(503, 'google_client_id_not_configured');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: signState({ returnTo: safeReturnTo(returnTo), createdAt: Date.now() })
  });
  return GOOGLE_AUTH_URL + '?' + params.toString();
}

async function postGoogleToken(params) {
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: controller.signal
    });
  } catch (error) {
    throw new ApiError(502, 'identity_provider_unavailable');
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(401, data.error || 'oauth_token_exchange_failed');
  return data;
}

async function exchangeCodeForSession(req, code) {
  const clientId = oauthClientId();
  if (!clientId) throw new ApiError(503, 'google_client_id_not_configured');
  const data = await postGoogleToken(new URLSearchParams({
    code: String(code || ''),
    client_id: clientId,
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code'
  }));
  const accessToken = String(data.access_token || '');
  if (!accessToken) throw new ApiError(401, 'oauth_token_exchange_failed');
  const user = await verifyAnalyticsUser(accessToken);
  return {
    accessToken,
    refreshToken: String(data.refresh_token || ''),
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000,
    user
  };
}

async function refreshSession(res, session) {
  if (!session.refreshToken) throw new ApiError(401, 'session_expired');
  const clientId = oauthClientId();
  if (!clientId) throw new ApiError(503, 'google_client_id_not_configured');
  const data = await postGoogleToken(new URLSearchParams({
    client_id: clientId,
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
    refresh_token: session.refreshToken,
    grant_type: 'refresh_token'
  }));
  const next = {
    ...session,
    accessToken: String(data.access_token || ''),
    refreshToken: String(data.refresh_token || session.refreshToken),
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000
  };
  if (!next.accessToken) throw new ApiError(401, 'session_expired');
  setSessionCookie(res, next);
  return next;
}

async function authContext(req, res) {
  const bearer = getBearerToken(req);
  if (bearer) {
    const user = await verifyAnalyticsUser(bearer);
    return { token: bearer, user, mode: 'bearer' };
  }

  let session = decryptSession(cookieValue(req, SESSION_COOKIE));
  if (!session?.accessToken) throw new ApiError(401, 'authentication_required');
  if (Date.now() > Number(session.expiresAt || 0)) session = await refreshSession(res, session);
  const user = await verifyAnalyticsUser(session.accessToken);
  if (session.user?.email !== user.email) {
    session = { ...session, user };
    setSessionCookie(res, session);
  }
  return { token: session.accessToken, user, mode: 'session' };
}

module.exports = {
  authContext,
  authStartUrl,
  clearSessionCookie,
  exchangeCodeForSession,
  setSessionCookie,
  verifyState
};
