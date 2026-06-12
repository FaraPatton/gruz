// Loads the private stamp image from Google Drive after Google authorization.

(function() {
  let stampLoadPromise = null;

  function setStampStatus(message, isError) {
    const prev = document.getElementById('spPrev');
    const ph = document.getElementById('spPh');
    if (!ph) return;

    if (!stampUrl && prev) prev.style.display = 'none';
    ph.style.display = stampUrl ? 'none' : 'block';

    const text = ph.querySelector('.uh');
    if (text) {
      text.innerHTML = message;
      text.style.color = isError ? 'var(--dan)' : 'var(--mut)';
    }
  }

  function showStampPreview(dataUrl) {
    stampUrl = dataUrl;

    const prev = document.getElementById('spPrev');
    const ph = document.getElementById('spPh');
    if (prev) {
      prev.src = stampUrl;
      prev.style.display = 'block';
    }
    if (ph) ph.style.display = 'none';
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function normalizeDriveFileId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const fileMatch = raw.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];

    const queryMatch = raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (queryMatch) return queryMatch[1];

    return raw;
  }

  async function loadDriveStamp() {
    const fileId = normalizeDriveFileId(typeof STAMP_FILE_ID !== 'undefined' ? STAMP_FILE_ID : '');
    const token = typeof gAccessToken !== 'undefined' ? gAccessToken : '';
    if (!fileId) {
      setStampStatus('Печать не настроена<br><small>Добавьте STAMP_FILE_ID в Secrets или загрузите файл вручную</small>', true);
      return null;
    }
    if (!token) {
      setStampStatus('Войдите в Google<br><small>После входа печать загрузится из Drive</small>', false);
      return null;
    }

    if (!stampLoadPromise) {
      setStampStatus('Загружаю печать из Drive...', false);
      stampLoadPromise = fetch(
        'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media',
        { headers: { Authorization: 'Bearer ' + token } }
      )
        .then(resp => {
          if (!resp.ok) throw new Error('Stamp load failed: ' + resp.status);
          return resp.blob();
        })
        .then(blobToDataUrl)
        .then(dataUrl => {
          showStampPreview(dataUrl);
          return dataUrl;
        })
        .catch(err => {
          stampLoadPromise = null;
          console.error('Drive stamp:', err);
          setStampStatus('Не удалось загрузить печать<br><small>Проверьте STAMP_FILE_ID и доступ к файлу в Drive</small>', true);
          return null;
        });
    }

    return stampLoadPromise;
  }

  window.loadDriveStamp = loadDriveStamp;

  if (document.readyState !== 'loading' && typeof gAccessToken !== 'undefined' && gAccessToken) {
    loadDriveStamp();
  }
})();
