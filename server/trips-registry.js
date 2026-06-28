'use strict';

const { ApiError } = require('./google-auth');

const MAX_REGISTRY_BYTES = 5 * 1024 * 1024;
const MAX_TRIPS = 10000;

const STRING_LIMITS = {
  id: 240,
  docNum: 80,
  docType: 20,
  date: 10,
  paymentType: 20,
  paymentUpdatedAt: 40,
  customerName: 240,
  customerInn: 20,
  customerKpp: 20,
  route: 2000,
  routeOrigin: 500,
  routeDestination: 500,
  routePolyline: 20000,
  routeDuration: 80,
  routeMapUpdatedAt: 40,
  totalRouteUpdatedAt: 40,
  routeMetricsSource: 40,
  car: 160,
  loadDate: 10,
  unloadDate: 10,
  invoiceFileId: 240,
  actFileId: 240,
  sourceName: 500
};

const NUMBER_LIMITS = {
  day: [1, 31],
  month: [1, 12],
  year: [2015, 2100],
  amount: [0, 1000000000],
  routeDistanceMeters: [0, 100000000],
  cargoDistanceMeters: [0, 100000000],
  totalDistanceMeters: [0, 100000000],
  fuelCostRub: [0, 100000000],
  fuelLiters: [0, 10000000],
  fuelPriceRub: [0, 100000],
  fuelLitersPer100Km: [0, 10000]
};

function cleanString(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function cleanNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}

function sanitizeTrip(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'registry_invalid_trip');
  }

  const trip = {};
  for (const [key, limit] of Object.entries(STRING_LIMITS)) {
    trip[key] = cleanString(value[key], limit);
  }
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS)) {
    trip[key] = cleanNumber(value[key], min, max);
  }

  if (!trip.id || !trip.year) throw new ApiError(400, 'registry_invalid_trip');
  return trip;
}

function sanitizeRegistry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.trips)) {
    throw new ApiError(400, 'registry_invalid');
  }
  if (value.trips.length > MAX_TRIPS) throw new ApiError(413, 'registry_too_many_trips');

  const registry = {
    version: 6,
    updatedAt: new Date().toISOString(),
    source: cleanString(value.source || 'backend-update', 80),
    trips: value.trips.map(sanitizeTrip)
  };

  const text = JSON.stringify(registry, null, 2);
  if (Buffer.byteLength(text, 'utf8') > MAX_REGISTRY_BYTES) {
    throw new ApiError(413, 'registry_too_large');
  }
  return { registry, text };
}

module.exports = { MAX_REGISTRY_BYTES, sanitizeRegistry };
