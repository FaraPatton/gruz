// Google OAuth
const GCLIENT_ID = '';
const GAPI_KEY = '';
const YANDEX_MAPS_API_KEY = '';

// Google Drive archive root folder
const ARCHIVE_ROOT = '';

// Private route analytics base address
const ROUTE_BASE_ADDRESS = '';

// Email defaults
const EMAIL_SUBJECT = '';
const EMAIL_BODY = ``;
const EMAIL_DRIVE_FOLDER_ID = '';
const STAMP_FILE_ID = '';

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
