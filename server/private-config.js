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

function privateRuntimeConfig() {
  const rawConfig = String(process.env.PRIVATE_RUNTIME_CONFIG || '').trim();
  if (!rawConfig) throw new ApiError(503, 'private_config_not_configured');
  let source;
  try {
    source = JSON.parse(rawConfig);
  } catch (error) {
    throw new ApiError(503, 'private_config_invalid');
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new ApiError(503, 'private_config_not_configured');
  }

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

  const archiveRoot = cleanString(process.env.ARCHIVE_ROOT, 200);
  if (!archiveRoot) throw new ApiError(503, 'private_config_not_configured');

  return {
    archiveRoot,
    routeBaseAddress: cleanString(source.routeBaseAddress),
    executorMarkers: markers,
    executorProfile,
    stampFileId: cleanString(source.stampFileId, 200)
  };
}

module.exports = { privateRuntimeConfig };
