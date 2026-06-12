// Runtime config diagnostics. Shows only missing field names, never values.

function configValue(name) {
  try {
    return window[name];
  } catch (e) {
    return undefined;
  }
}

function hasTextConfig(name) {
  return String(configValue(name) || '').trim().length > 0;
}

function hasListConfig(name) {
  const value = configValue(name);
  return Array.isArray(value) && value.map(item => String(item || '').trim()).filter(Boolean).length > 0;
}

function hasProfileFields(fields) {
  const profile = configValue('EXECUTOR_PROFILE') || {};
  return fields.filter(field => !String(profile[field] || '').trim()).map(field => 'EXECUTOR_PROFILE.' + field);
}

function configDiagEsc(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function runtimeConfigIssues() {
  const issues = [];
  const isAnalyticsPage = document.body?.classList.contains('analytics-page');

  ['GCLIENT_ID', 'GAPI_KEY', 'ARCHIVE_ROOT'].forEach(name => {
    if (!hasTextConfig(name)) issues.push(name);
  });

  if (isAnalyticsPage) {
    if (!hasListConfig('ANALYTICS_ALLOWED_EMAILS')) issues.push('ANALYTICS_ALLOWED_EMAILS');
  } else {
    issues.push(...hasProfileFields(['name', 'shortName', 'inn', 'address', 'phone', 'bank', 'bik', 'corrAccount', 'account']));
    ['EMAIL_SUBJECT', 'EMAIL_BODY', 'EMAIL_DRIVE_FOLDER_ID'].forEach(name => {
      if (!hasTextConfig(name)) issues.push(name);
    });
  }

  return issues;
}

function showRuntimeConfigDiagnostics() {
  const issues = runtimeConfigIssues();
  if (!issues.length) return;

  const banner = document.createElement('div');
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'position:sticky;top:0;z-index:9999;margin:0 auto 12px;padding:10px 12px;border:1px solid rgba(255,190,90,.45);border-radius:0 0 12px 12px;background:#211a10;color:#ffdca8;font-size:12px;line-height:1.4;box-shadow:0 12px 28px rgba(0,0,0,.22);max-width:1120px';
  banner.innerHTML =
    '<b style="display:block;color:#fff;margin-bottom:4px">Runtime config требует внимания</b>' +
    '<span>Не заполнено: ' + issues.map(configDiagEsc).join(', ') + '. Проверь GitHub Secrets и перезапусти Pages deploy.</span>';

  document.body.prepend(banner);
}

window.runtimeConfigIssues = runtimeConfigIssues;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showRuntimeConfigDiagnostics);
} else {
  showRuntimeConfigDiagnostics();
}
