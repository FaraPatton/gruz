// Analytics calculations and small data helpers.

const TRIPS_REGISTRY_NAME = 'trips.json';
const TRIPS_REGISTRY_VERSION = 6;
const EXECUTOR_MARKERS = ['Карпов', '771313296859', '40802810438000085714', 'Керамический', 'СБЕРБАНК'];
const ANALYTICS_GREEN = '#39d98a';
const ANALYTICS_GREEN_DARK = '#1f9d63';
const DEFAULT_FUEL_PRICE_RUB = 60;
const DEFAULT_FUEL_LITERS_PER_100KM = 28;
const LEGACY_FUEL_LITERS_PER_100KM = 25;
const USN_TAX_RATE = 0.06;
const PAYMENT_TYPES = {
  bank: 'Банковский перевод',
  cash: 'Наличные',
  unknown: 'Не указано'
};

function routeEndpointParts(route) {
  const parts = String(route || '').split(/\s+-\s+/).map(cleanText).filter(Boolean);
  return {
    origin: parts[0] || '',
    destination: parts.slice(1).join(' - ') || ''
  };
}

function routeMapId(value) {
  return encodeURIComponent(String(value || ''));
}

function routeBaseAddress() {
  return typeof ROUTE_BASE_ADDRESS !== 'undefined' ? cleanText(ROUTE_BASE_ADDRESS) : '';
}

function routePoints(trip, includeBase = true) {
  const origin = trip.routeOrigin || routeEndpointParts(trip.route).origin;
  const destination = trip.routeDestination || routeEndpointParts(trip.route).destination;
  const base = includeBase ? routeBaseAddress() : '';
  return [base, origin, destination, base].filter(Boolean);
}

function routeRtext(points) {
  return points.map(point => encodeURIComponent(point)).join('~');
}

function formatKm(meters) {
  const value = Math.round(Number(meters) || 0);
  return value ? Math.round(value / 1000).toLocaleString('ru-RU') + ' км' : '';
}

function hasTripDistance(trip) {
  return Number(trip.totalDistanceMeters) > 0;
}

function needsDistance(trip) {
  return !hasTripDistance(trip) && Number(trip.amount) > 0;
}

function grossPerKm(trip) {
  const km = (Number(trip.totalDistanceMeters) || 0) / 1000;
  return km && trip.amount ? Math.round(trip.amount / km) : 0;
}

function fuelEstimate(trip) {
  const km = (Number(trip.totalDistanceMeters) || 0) / 1000;
  const amount = Number(trip.amount) || 0;
  if (!km) {
    const cost = Number(trip.fuelCostRub) || 0;
    return { liters: Number(trip.fuelLiters) || 0, cost, net: Math.round(amount - cost) };
  }
  const savedRate = Number(trip.fuelLitersPer100Km || 0);
  const litersPer100 = savedRate && savedRate !== LEGACY_FUEL_LITERS_PER_100KM ? savedRate : DEFAULT_FUEL_LITERS_PER_100KM;
  const price = Number(trip.fuelPriceRub || DEFAULT_FUEL_PRICE_RUB) || DEFAULT_FUEL_PRICE_RUB;
  const liters = km * litersPer100 / 100;
  const cost = liters * price;
  const net = Math.round(amount - cost);
  return {
    liters: Math.round(liters * 10) / 10,
    cost: Math.round(cost),
    net
  };
}

function netProfit(trip) {
  return fuelEstimate(trip).net;
}

function usnTax(trip) {
  if (normalizePaymentType(trip.paymentType) !== 'bank') return 0;
  return Math.round(Math.max(0, netProfit(trip)) * USN_TAX_RATE);
}

function netAfterTax(trip) {
  return netProfit(trip) - usnTax(trip);
}

function currentYearTrips(trips) {
  const currentYear = new Date().getFullYear();
  return (trips || []).filter(trip => Number(trip.year) === currentYear);
}

function sumUsnTax(trips) {
  return (trips || []).reduce((sum, trip) => sum + usnTax(trip), 0);
}

function sumNetAfterTax(trips) {
  return (trips || []).reduce((sum, trip) => sum + netAfterTax(trip), 0);
}

function normalizePaymentType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['cash', 'nal', 'нал', 'наличные', 'наличка'].includes(raw)) return 'cash';
  if (['bank', 'transfer', 'wire', 'перевод', 'банковский перевод', 'безнал', 'безналичные'].includes(raw)) return 'bank';
  return 'unknown';
}

function paymentLabel(type) {
  return PAYMENT_TYPES[normalizePaymentType(type)] || PAYMENT_TYPES.unknown;
}
