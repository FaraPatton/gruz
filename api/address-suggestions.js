'use strict';

const { applyCors, sendJson } = require('../server/http');
const { ApiError } = require('../server/google-auth');
const { authContext } = require('../server/session-auth');

module.exports = async function handler(req, res) {
  if (!applyCors(req, res)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    await authContext(req, res);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (text.length < 3 || text.length > 240) {
      return sendJson(res, 400, { error: 'invalid_query' });
    }

    const key = String(process.env.YANDEX_SUGGEST_API_KEY || '').trim();
    if (!key) return sendJson(res, 503, { error: 'suggest_not_configured' });

    const url = new URL('https://suggest-maps.yandex.ru/v1/suggest');
    url.search = new URLSearchParams({
      apikey: key,
      text,
      lang: 'ru_RU',
      countries: 'ru',
      types: 'geo',
      results: '6',
      highlight: '0',
      print_address: '1'
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return sendJson(res, 502, { error: 'suggest_unavailable' });

    const { results } = await response.json();
    const addresses = (Array.isArray(results) ? results : []).slice(0, 6)
      .map(item => item.address?.formatted_address ||
        [item.subtitle?.text, item.title?.text].filter(Boolean).join(', '))
      .filter(address => typeof address === 'string' && address.trim());
    return sendJson(res, 200, { addresses });
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.code });
    return sendJson(res, 502, { error: 'suggest_unavailable' });
  }
};
