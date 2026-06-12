import { readFileSync, writeFileSync } from 'node:fs';

const version = (
  process.env.APP_VERSION ||
  process.env.GITHUB_SHA?.slice(0, 7) ||
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)
).trim();

const versionedAssets = [
  'css/bb8.css',
  'css/style.css',
  'css/analytics.css',
  'js/stamp.js',
  'js/config.js',
  'js/config_diagnostics.js',
  'js/utils.js',
  'js/auth.js',
  'js/pdf.js',
  'js/drive.js',
  'js/email.js',
  'js/sign.js',
  'js/analytics_calc.js',
  'js/analytics_render.js',
  'js/analytics.js',
  'js/analytics_page.js',
  'js/pwa_update.js'
];

function updateFile(path, updater) {
  const current = readFileSync(path, 'utf8');
  const next = updater(current);
  if (next !== current) writeFileSync(path, next, 'utf8');
}

function versionHtml(html) {
  return versionedAssets.reduce((text, asset) => {
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped + '\\?v=[A-Za-z0-9._-]+', 'g'), asset + '?v=' + version);
  }, html);
}

function versionServiceWorker(sw) {
  const withCache = sw.replace(/const CACHE = 'gruz-[^']+';/, "const CACHE = 'gruz-" + version + "';");
  return versionHtml(withCache);
}

updateFile('index.html', versionHtml);
updateFile('analytics.html', versionHtml);
updateFile('sw.js', versionServiceWorker);

console.log('Prepared deploy assets with version ' + version);
