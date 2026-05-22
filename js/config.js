// ══ App Config ═════════════════════════════════════════════════

// Google OAuth
const GCLIENT_ID = '1065862583210-pc1ulr62167km969n4kaqc5f79hre1j7.apps.googleusercontent.com';
const GAPI_KEY   = 'AIzaSyD-miNligFmgCvFWlYj6j2Hz0hq0EsfxLU';

// Google Drive — архивная папка
const ARCHIVE_ROOT = '1ywctaRSj0XWrY6MHjkWsvDCULxrNLSVd';

// Данные отправителя
const EMAIL_SUBJECT = 'Документы на проверку';
const EMAIL_BODY = `Добрый день!
Комплект документов доступен по моей ссылке ниже:

https://drive.google.com/drive/folders/1pJMPxTEhMu3JRHe0_K4F8ECHye1_LSj8?usp=sharing

ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ КАРПОВ СЕРГЕЙ ВИКТОРОВИЧ
Расчётный счёт: 40802810438000085714
ИНН: 771313296859
КПП: -
ОГРН: 318774600201147
Банк: ПАО СБЕРБАНК
БИК: 044525225
Кор. счёт: 30101810400000000225

  --
  С уважением,
  Карпов Сергей | 89647851386 | Код участника АТИ: 2936939`;

// Глобальные состояния авторизации
let gTokenClient = null;
let gAccessToken = null;
let gAuthCallback = null;
let gPickerReady  = false;
let gParsed       = null;
let driveCache    = null;
let analyticsYear = 0;

// Дефолтная печать (загружается из fonts/liberation.js)
let stampUrl = typeof STAMP_DEFAULT !== 'undefined' ? STAMP_DEFAULT : null;
