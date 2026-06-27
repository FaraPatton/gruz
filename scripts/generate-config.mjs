import { writeFileSync } from 'node:fs';

const read = (name) => process.env[name] || '';
const readTrim = (name) => read(name).trim();
const jsString = (value) => JSON.stringify(String(value));
const jsStringArray = (value) => JSON.stringify(
  String(value || '')
    .split(/[\n,;]/)
    .map(item => item.trim())
    .filter(Boolean)
);
const jsStringObject = (entries) => JSON.stringify(
  Object.fromEntries(entries.map(([key, name]) => [key, readTrim(name)]))
);
const apiBaseUrl = readTrim('API_BASE_URL') || 'https://gruz-kappa.vercel.app';

const config = `// App Config. Generated at deploy time.

// Google OAuth
const GCLIENT_ID = ${jsString(read('GCLIENT_ID'))};
const GAPI_KEY = ${jsString(read('GAPI_KEY'))};
const YANDEX_MAPS_API_KEY = ${jsString(read('YANDEX_MAPS_API_KEY'))};
const API_BASE_URL = ${jsString(apiBaseUrl)};

// Google Drive archive root folder
const ARCHIVE_ROOT = ${jsString(readTrim('ARCHIVE_ROOT'))};

// Private route analytics base address
const ROUTE_BASE_ADDRESS = ${jsString(readTrim('ROUTE_BASE_ADDRESS'))};
const EXECUTOR_MARKERS = ${jsStringArray(read('EXECUTOR_MARKERS'))};

// Private executor profile for PDF documents
const EXECUTOR_PROFILE = ${jsStringObject([
  ['name', 'EXECUTOR_NAME'],
  ['shortName', 'EXECUTOR_SHORT_NAME'],
  ['inn', 'EXECUTOR_INN'],
  ['ogrn', 'EXECUTOR_OGRN'],
  ['address', 'EXECUTOR_ADDRESS'],
  ['phone', 'EXECUTOR_PHONE'],
  ['bank', 'EXECUTOR_BANK'],
  ['bik', 'EXECUTOR_BIK'],
  ['corrAccount', 'EXECUTOR_CORR_ACCOUNT'],
  ['account', 'EXECUTOR_ACCOUNT']
])};

// Email defaults
const EMAIL_SUBJECT = ${jsString(read('EMAIL_SUBJECT'))};
const EMAIL_BODY = ${jsString(read('EMAIL_BODY'))};
const SIGN_EMAIL_SUBJECT = ${jsString(read('SIGN_EMAIL_SUBJECT'))};
const SIGN_EMAIL_BODY = ${jsString(read('SIGN_EMAIL_BODY'))};
const EMAIL_DRIVE_FOLDER_ID = ${jsString(readTrim('EMAIL_DRIVE_FOLDER_ID'))};
const STAMP_FILE_ID = ${jsString(readTrim('STAMP_FILE_ID'))};

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
