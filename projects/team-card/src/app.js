/* UI wiring: form -> state -> debounced SVG render -> PNG export.
   Export path is the one the brief pins down:
   live SVG -> XMLSerializer -> Blob(SVG) -> Image -> canvas.drawImage -> toBlob(PNG). */
(function (global) {
  'use strict';

  var state = {
    name: 'VECTOR DYNAMICS',
    number: '07',
    origin: 'GBR / KINGSMERE COLLEGE',
    mass: '54.2',
    cda: '0.0041',
    dia: '30.0',
    run: '1.087',
    accent: 'caliper',
    crest: null
  };

  var variant = '4:5';
  var status = { text: 'READY', ok: true, bytes: 0 };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- fonts ---------------------------------------------------------- */

  function mountFonts() {
    var style = document.createElement('style');
    style.id = 'card-fonts';
    style.appendChild(document.createTextNode(Card.fontFaceCss('swap')));
    document.head.appendChild(style);
  }

  function fontReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('700 96px "Barlow Condensed"'),
      document.fonts.load('600 40px "Barlow Condensed"'),
      document.fonts.load('400 13px "JetBrains Mono"'),
      document.fonts.load('700 56px "JetBrains Mono"')
    ]).catch(function () { return null; }).then(function () {
      return document.fonts.ready;
    });
  }

  /* ---------- render --------------------------------------------------------- */

  var stageEl = null;

  function render() {
    var markup = Card.build(state, variant);
    stageEl.innerHTML = markup;
    setStatus(state.crest ? 'UPDATED · CREST IN MEMORY' : 'UPDATED', true, 0);
  }

  var timer = null;
  function scheduleRender() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; render(); }, 140);
  }

  function setStatus(text, ok, bytes) {
    status.text = text;
    status.ok = ok !== false;
    status.bytes = bytes || 0;
    var el = $('#status');
    if (!el) return;
    el.textContent = status.text;
    el.dataset.ok = status.ok ? '1' : '0';
  }

  /* ---------- export --------------------------------------------------------- */

  function serialize(svgEl) {
    var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = Card.fontFaceCss('block');
    svgEl.insertBefore(style, svgEl.firstChild);
    return new XMLSerializer().serializeToString(svgEl);
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('SVG rasterisation failed')); };
      img.src = url;
    });
  }

  function exportPng(which) {
    var v = which || variant;
    var size = v === '9:16' ? Card.SIZES.H9 : Card.SIZES.H4;

    var holder = document.createElement('div');
    holder.innerHTML = Card.build(state, v);
    var svgEl = holder.firstElementChild;
    var xml = serialize(svgEl);

    var svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);

    return loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      var canvas = document.createElement('canvas');
      canvas.width = Card.SIZES.W;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = v === '9:16' ? '#060607' : '#0B0B0C';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error('toBlob returned null'));
          else resolve(blob);
        }, 'image/png');
      });
    }, function (err) {
      URL.revokeObjectURL(url);
      throw err;
    });
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function runExport(which) {
    setStatus('RENDERING…', true, 0);
    exportPng(which).then(function (blob) {
      var tag = which === '9:16' ? '9x16' : '4x5';
      download(blob, 'team-card-' + (state.number || '00') + '-' + tag + '.png');
      setStatus('PNG ' + tag + ' · ' + Math.round(blob.size / 1024) + ' KB', true, blob.size);
    }).catch(function (err) {
      setStatus('EXPORT FAILED · ' + err.message, false, 0);
    });
  }

  /* ---------- crest ---------------------------------------------------------- */

  /* Shrink the upload to 560 px on the long edge before it enters the SVG.
     A 4 MB phone photo turned into a data URI makes every redraw and every
     rasterisation slow for zero visual gain at 232 px of print size. */
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('FileReader failed')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('not a readable image')); };
        img.onload = function () {
          var max = 560;
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * k));
          c.height = Math.max(1, Math.round(h * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.src = String(fr.result);
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- form ----------------------------------------------------------- */

  function bind() {
    $$('[data-bind]').forEach(function (el) {
      var key = el.dataset.bind;
      el.addEventListener('input', function () {
        state[key] = el.value;
        scheduleRender();
      });
    });

    $$('[data-accent]').forEach(function (el) {
      el.addEventListener('click', function () {
        state.accent = el.dataset.accent;
        $$('[data-accent]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); });
        document.documentElement.style.setProperty('--ink', Card.ACCENTS[state.accent].lit);
        render();
      });
    });

    $$('[data-variant]').forEach(function (el) {
      el.addEventListener('click', function () {
        variant = el.dataset.variant;
        $$('[data-variant]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === el)); });
        render();
      });
    });

    var file = $('#crest-file');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) { setStatus('NOT AN IMAGE FILE', false, 0); file.value = ''; return; }
        shrinkImage(f).then(function (dataUrl) {
          state.crest = dataUrl;
          render();
          setStatus('CREST ' + f.name.slice(0, 20) + ' · IN MEMORY ONLY', true, 0);
          file.value = '';
        }).catch(function (err) {
          setStatus('CREST REJECTED · ' + err.message, false, 0);
          file.value = '';
        });
      });
    }

    var clear = $('#crest-clear');
    if (clear) {
      clear.addEventListener('click', function () {
        state.crest = null;
        render();
      });
    }

    $('#ex-45').addEventListener('click', function () { runExport('4:5'); });
    $('#ex-916').addEventListener('click', function () { runExport('9:16'); });
  }

  /* ---------- boot ----------------------------------------------------------- */

  function boot() {
    mountFonts();
    stageEl = $('#stage');
    bind();
    render();

    fontReady().then(function () {
      render();
      global.__teamcardReady = true;
    });

    global.__teamcard = {
      state: state,
      set: function (patch) { Object.assign(state, patch); render(); },
      render: render,
      exportPng: exportPng,
      status: function () { return status; },
      ready: function () { return global.__teamcardReady === true; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
