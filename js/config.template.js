// Google OAuth
const GCLIENT_ID = '';
const YANDEX_MAPS_API_KEY = '';
const API_BASE_URL = 'https://gruz-kappa.vercel.app';

// Private route analytics base address
let ROUTE_BASE_ADDRESS = '';
let EXECUTOR_MARKERS = [];

// Private executor profile for PDF documents
let EXECUTOR_PROFILE = {
  name: '',
  shortName: '',
  inn: '',
  ogrn: '',
  address: '',
  phone: '',
  bank: '',
  bik: '',
  corrAccount: '',
  account: ''
};

// Global auth state
let gTokenClient = null;
let gAccessToken = null;
let gAuthCallback = null;
let gParsed = null;
let driveCache = null;
let analyticsYear = 0;

// Private stamp image is loaded from Google Drive after authorization.
let stampUrl = typeof STAMP_DEFAULT !== 'undefined' ? STAMP_DEFAULT : null;
