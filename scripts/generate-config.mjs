import { writeFileSync } from 'node:fs';

const read = (name) => process.env[name] || '';
const readTrim = (name) => read(name).trim();
const jsString = (value) => JSON.stringify(String(value));
const apiBaseUrl = readTrim('API_BASE_URL') || 'https://gruz-kappa.vercel.app';

const config = `// App Config. Generated at deploy time.

// Google OAuth
const GCLIENT_ID = ${jsString(read('GCLIENT_ID'))};
const GAPI_KEY = ${jsString(read('GAPI_KEY'))};
const YANDEX_MAPS_API_KEY = ${jsString(read('YANDEX_MAPS_API_KEY'))};
const API_BASE_URL = ${jsString(apiBaseUrl)};

// Loaded from the protected Vercel API after authorization.
let ARCHIVE_ROOT = '';
let ROUTE_BASE_ADDRESS = '';
let EXECUTOR_MARKERS = [];
let EXECUTOR_PROFILE = {};
let STAMP_FILE_ID = '';

// Global auth state
let gTokenClient = null;
let gAccessToken = null;
let gAuthCallback = null;
let gPickerReady = false;
let gParsed = null;
let driveCache = null;
let analyticsYear = 0;

// Private stamp image is loaded from Google Drive after authorization.
let stampUrl = typeof STAMP_DEFAULT !== 'undefined' ? STAMP_DEFAULT : null;
`;

writeFileSync('js/config.js', config, 'utf8');
