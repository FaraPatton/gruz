'use strict';

function parseList(value) {
  return String(value || '')
    .split(/[\n,;]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function applyCors(req, res) {
  setSecurityHeaders(res);
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;

  const allowedOrigins = parseList(process.env.APP_ORIGINS);
  if (!allowedOrigins.includes(origin)) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Vary', 'Origin');
  return true;
}

function sendJson(res, status, body) {
  setSecurityHeaders(res);
  return res.status(status).json(body);
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : '';
}

module.exports = { applyCors, getBearerToken, parseList, sendJson, setSecurityHeaders };
