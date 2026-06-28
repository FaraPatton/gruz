// Loads the private stamp image through the protected backend after authorization.

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

  async function loadDriveStamp() {
    const token = typeof gAccessToken !== 'undefined' ? gAccessToken : '';
    if (!token) {
      setStampStatus('Войдите в Google<br><small>После входа печать загрузится из Drive</small>', false);
      return null;
    }

    if (!stampLoadPromise) {
      setStampStatus('Загружаю печать из Drive...', false);
      stampLoadPromise = authApiFetch('/api/archive/stamp', {}, true)
        .then(resp => {
          if (!resp.ok) return resp.json().catch(() => ({})).then(data => {
            const messages = {
              stamp_not_configured: 'печать не настроена на сервере',
              stamp_type_invalid: 'файл печати должен быть PNG или JPEG',
              stamp_too_large: 'файл печати превышает 2 МБ',
              stamp_invalid: 'файл печати поврежден',
              drive_access_denied: 'Google Drive не разрешил доступ к печати'
            };
            throw new Error(messages[data.error] || 'сервер не отдал печать: HTTP ' + resp.status);
          });
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
          setStampStatus('Не удалось загрузить печать<br><small>' + err.message + '</small>', true);
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
