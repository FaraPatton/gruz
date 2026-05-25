import { writeFileSync } from 'node:fs';

const read = (name) => process.env[name] || '';
const jsString = (value) => JSON.stringify(String(value));

const config = `// App Config. Generated at deploy time.

// Google OAuth
const GCLIENT_ID = ${jsString(read('GCLIENT_ID'))};
const GAPI_KEY = ${jsString(read('GAPI_KEY'))};
const YANDEX_MAPS_API_KEY = ${jsString(read('YANDEX_MAPS_API_KEY'))};

// Google Drive archive root folder
const ARCHIVE_ROOT = ${jsString(read('ARCHIVE_ROOT'))};

// Email defaults
const EMAIL_SUBJECT = ${jsString(read('EMAIL_SUBJECT'))};
const EMAIL_BODY = ${jsString(read('EMAIL_BODY'))};

// Global auth state
let gTokenClient = null;
let gAccessToken = null;
let gAuthCallback = null;
let gPickerReady = false;
let gParsed = null;
let driveCache = null;
let analyticsYear = 0;

// Default stamp image loaded from fonts/liberation.js
let stampUrl = typeof STAMP_DEFAULT !== 'undefined' ? STAMP_DEFAULT : null;
`;

writeFileSync('js/config.js', config, 'utf8');
