// ══ Default stamp ════════════════════════════════════════════════════
// Загружает изображение печати при старте приложения

(function() {
  function loadDefaultStamp() {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      stampUrl = canvas.toDataURL('image/png');
      // Показываем превью
      var prev = document.getElementById('spPrev');
      var ph   = document.getElementById('spPh');
      if (prev) { prev.src = stampUrl; prev.style.display = 'block'; }
      if (ph)   { ph.style.display = 'none'; }
    };
    img.onerror = function() {
      console.log('Default stamp not found — user can upload manually');
    };
    img.src = 'stamp.png?' + Date.now();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadDefaultStamp);
  } else {
    loadDefaultStamp();
  }
})();