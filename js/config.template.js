// Google OAuth
const GCLIENT_ID = '';
const GAPI_KEY = '';
const YANDEX_MAPS_API_KEY = '';

// Google Drive archive root folder
const ARCHIVE_ROOT = '';

// Private route analytics base address
const ROUTE_BASE_ADDRESS = '';
const ANALYTICS_ALLOWED_EMAILS = [];
const EXECUTOR_MARKERS = [];

// Private executor profile for PDF documents
const EXECUTOR_PROFILE = {
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

// Email defaults
const EMAIL_SUBJECT = '';
const EMAIL_BODY = ``;
const SIGN_EMAIL_SUBJECT = '';
const SIGN_EMAIL_BODY = ``;
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
