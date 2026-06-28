'use strict';

const { ApiError } = require('./google-auth');

const PROFILE_FIELDS = [
  'name', 'shortName', 'inn', 'ogrn', 'address', 'phone',
  'bank', 'bik', 'corrAccount', 'account'
];

function cleanString(value, maxLength = 500) {
  const text = String(value || '').trim();
  if (text.length > maxLength) throw new ApiError(503, 'private_config_invalid');
  return text;
}

function privateConfigSource() {
  const rawConfig = String(process.env.PRIVATE_RUNTIME_CONFIG || '').trim();
  if (!rawConfig) throw new ApiError(503, 'private_config_not_configured');
  try {
    const source = JSON.parse(rawConfig);
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new ApiError(503, 'private_config_not_configured');
    }
    return source;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'private_config_invalid');
  }
}

function privateRuntimeConfig() {
  const source = privateConfigSource();

  const markers = Array.isArray(source.executorMarkers)
    ? source.executorMarkers.map(value => cleanString(value, 160)).filter(Boolean).slice(0, 30)
    : [];
  const rawProfile = source.executorProfile;
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
    throw new ApiError(503, 'private_config_invalid');
  }
  const executorProfile = Object.fromEntries(
    PROFILE_FIELDS.map(field => [field, cleanString(rawProfile[field])])
  );

  return {
    routeBaseAddress: cleanString(source.routeBaseAddress),
    executorMarkers: markers,
    executorProfile
  };
}

function privateStampFileId() {
  const id = cleanString(privateConfigSource().stampFileId, 200);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new ApiError(503, 'stamp_not_configured');
  return id;
}

module.exports = { privateRuntimeConfig, privateStampFileId };
