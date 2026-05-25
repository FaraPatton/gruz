// App Config template. Copy to js/config.js for local development.

// Google OAuth
const GCLIENT_ID = '';
const GAPI_KEY = '';
const YANDEX_MAPS_API_KEY = '';

// Google Drive archive root folder
const ARCHIVE_ROOT = '';

// Email defaults
const EMAIL_SUBJECT = '';
const EMAIL_BODY = ``;
const EMAIL_DRIVE_FOLDER_ID = '';

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
