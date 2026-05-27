// Loads the private stamp image from Google Drive after Google authorization.

(function() {
  let stampLoadPromise = null;

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
    const fileId = typeof STAMP_FILE_ID !== 'undefined' ? STAMP_FILE_ID : '';
    const token = typeof gAccessToken !== 'undefined' ? gAccessToken : '';
    if (!fileId || !token) return null;

    if (!stampLoadPromise) {
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
