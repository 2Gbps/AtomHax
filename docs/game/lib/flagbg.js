(function () {
  var AP_CODES = ['cn','jp','kr','kp','in','pk','bd','lk','np','bt','mv','mm','th','vn',
                  'la','kh','my','sg','id','ph','bn','tl','mn','au','nz','pg','fj','ws',
                  'to','vu','sb','ki','tv','nr','mh','fm','pw'];

  function flagUrl(code) {
    return chrome.runtime.getURL('flags/' + code + '.svg');
  }

  function apFlag(bg, done) {
    if (window.__nyxApFlagSrc) {
      bg.style.backgroundImage = 'url("' + window.__nyxApFlagSrc + '")';
      done(); return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 150;
    var ctx = canvas.getContext('2d');
    var cols = 8, rows = 5, cw = 30, ch = 30;
    var pending = AP_CODES.length;
    var loaded = 0;
    for (var i = 0; i < AP_CODES.length; i++) {
      (function (code, idx) {
        var im = new Image();
        im.onload = function () {
          var col = idx % cols, row = Math.floor(idx / cols);
          var x = col * cw, y = row * ch;
          ctx.fillStyle = 'rgba(27,33,37,0.7)';
          ctx.fillRect(x, y, cw, ch);
          var iw = im.naturalWidth || 160, ih = im.naturalHeight || 120;
          var k = Math.max(cw / iw, ch / ih);
          var dw = iw * k, dh = ih * k;
          ctx.drawImage(im, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
          loaded++;
          if (loaded === AP_CODES.length) finish();
        };
        im.onerror = function () {
          loaded++;
          if (loaded === AP_CODES.length) finish();
        };
        im.src = flagUrl(code);
      })(AP_CODES[i], i);
    }
    function finish() {
      for (var r = 0; r < rows; r++)
        for (var c2 = 0; c2 < cols; c2++) {
          var idx = r * cols + c2;
          if (idx >= AP_CODES.length) {
            ctx.fillStyle = 'rgba(27,33,37,0.7)';
            ctx.fillRect(c2 * cw, r * ch, cw, ch);
          }
        }
      window.__nyxApFlagSrc = canvas.toDataURL('image/png');
      bg.style.backgroundImage = 'url("' + window.__nyxApFlagSrc + '")';
      done();
    }
  }

  function spriteFallback(bg, code) {
    var ic = document.createElement('i');
    ic.className = 'flagico f-' + code;
    document.body.appendChild(ic);
    var cs = getComputedStyle(ic);
    var url = cs.backgroundImage;
    var pos = cs.backgroundPosition;
    ic.remove();
    if (!url || url === 'none') return;
    var img = new Image();
    img.onload = function () {
      var rowH = bg.offsetHeight || 36;
      var k = rowH / 11;
      var parts = pos.split(' ');
      var x = parseFloat(parts[0]) * k;
      var y = parseFloat(parts[1]) * k;
      bg.style.backgroundImage = url;
      bg.style.backgroundSize = (img.naturalWidth * k) + 'px ' + (img.naturalHeight * k) + 'px';
      bg.style.backgroundPosition = x + 'px ' + y + 'px';
    };
    img.src = url.slice(5, -2);
  }

  function build(bg, code, done) {
    if (code === 'ap') { apFlag(bg, done); return; }
    var img = new Image();
    img.onload = function () {
      bg.style.backgroundImage = 'url("' + flagUrl(code) + '")';
      done();
    };
    img.onerror = function () {
      spriteFallback(bg, code);
      done();
    };
    img.src = flagUrl(code);
  }

  var scanTimer = null;
  function scan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = null; }, 100);
    var doc = document;
    if (!doc.body) return;
    var rows = doc.querySelectorAll('#dropdown-content li[data-flag]:not([data-done])');
    if (!rows.length) return;
    var idx = 0;
    function next() {
      if (idx >= rows.length) return;
      var li = rows[idx++];
      if (li.getAttribute('data-done')) { next(); return; }
      var code = li.getAttribute('data-flag');
      var bg = li.querySelector('.nyx-flagbg');
      if (!bg) { next(); return; }
      build(bg, code, function () {
        li.setAttribute('data-done', '1');
        next();
      });
    }
    next();
    var btn = doc.getElementById('searchRoomByCountry');
    var btnImg = btn ? btn.querySelector('.nyx-btnflag[data-flag]:not([data-done])') : null;
    if (btnImg) {
      (function (img) {
        var bg = document.createElement('div');
        build(bg, img.getAttribute('data-flag'), function () {
          var bgi = bg.style.backgroundImage;
          if (bgi && bgi.indexOf('url("chrome-extension://') === 0) {
            img.src = bgi.slice(5, -2);
          }
          img.setAttribute('data-done', '1');
        });
      })(btnImg);
    }
  }

  window.__nyxFlagScan = scan;
  var obs = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType === 1 && (n.id === 'dropdown-content' || (n.querySelector && n.querySelector('[data-flag]')))) {
          scan();
          return;
        }
      }
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();