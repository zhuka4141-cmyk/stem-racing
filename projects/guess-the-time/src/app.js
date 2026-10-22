/* app.js — game loop, compositing, export, self-test.
 *
 * Compositing note, measured rather than assumed: a canvas that has had a
 * WebGPU context returns blank pixels from drawImage()/toBlob(). So the screen
 * is built from two stacked canvas elements (scene + text) and only the export
 * path re-reads the GPU frame with copyTextureToBuffer. Both end up drawing the
 * exact same op list and the exact same text runs.
 */
(function () {
  'use strict';
  var GT = window.GT;
  var P = GT.PALETTE;

  var els = {};
  var backend = null;
  var sceneCanvas = null;
  var uiCtx = null;
  var outCtx = null;
  var scale = 1;
  var dirty = true;
  var rafId = 0;
  var lastRects = [];
  var runToken = 0;

  var state = {
    episode: 7,
    phase: 'armed',
    car: null,
    chosenIndex: -1,
    progressMetres: 0,
    speedNow: 0
  };

  // ---- backend selection -------------------------------------------------
  function newCanvas(id) {
    var c = document.createElement('canvas');
    c.width = GT.W; c.height = GT.H;
    c.id = id;
    c.className = 'layer';
    return c;
  }

  function installBackend() {
    var old = document.getElementById('scene');
    if (old) old.parentNode.removeChild(old);
    sceneCanvas = newCanvas('scene');
    els.stage.insertBefore(sceneCanvas, els.stage.firstChild);

    var tried = null;
    var forced2d = new URLSearchParams(location.search).get('backend') === '2d';
    if (forced2d) tried = new Error('forced by ?backend=2d');
    var attempt = (!forced2d && window.GT.createGpuBackend)
      ? GT.createGpuBackend(sceneCanvas).catch(function (e) { tried = e; return null; })
      : Promise.resolve(null);

    return attempt.then(function (b) {
      if (b) { backend = b; return b; }
      // A canvas that has handed out a webgpu context can never yield a 2d one,
      // so the fallback needs a brand new element.
      var dead = document.getElementById('scene');
      if (dead) dead.parentNode.removeChild(dead);
      sceneCanvas = newCanvas('scene');
      els.stage.insertBefore(sceneCanvas, els.stage.firstChild);
      backend = GT.create2DBackend(sceneCanvas);
      window.__webgpuError = tried ? String(tried.message || tried) : 'navigator.gpu undefined';
      return backend;
    }).then(function (b) {
      window.__backendKind = b.kind;
      console.log('[gt] render backend:', b.kind, window.__webgpuError ? '(' + window.__webgpuError + ')' : '');
      return b;
    });
  }

  // ---- layout scaling ----------------------------------------------------
  function resize() {
    scale = Math.min(window.innerWidth / GT.W, window.innerHeight / GT.H);
    els.stage.style.transform = 'scale(' + scale + ')';
    els.stage.style.transformOrigin = 'top left';
    els.stage.style.position = 'absolute';
    els.stage.style.left = ((window.innerWidth - GT.W * scale) / 2) + 'px';
    els.stage.style.top = ((window.innerHeight - GT.H * scale) / 2) + 'px';
    placeHitButtons();
  }

  // Real DOM buttons over the painted choice areas: keyboard reachable, and the
  // gate can drive them by accessible name instead of by pixel.
  function placeHitButtons() {
    var b = GT.LAYOUT.buttons;
    for (var i = 0; i < 3; i++) {
      var el = document.getElementById('hit' + i);
      if (!el) continue;
      var r = GT.UI.buttonRect(i);
      el.style.left = r.x + 'px';
      el.style.top = r.y + 'px';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
    }
  }

  function buildHitButtons() {
    for (var i = 0; i < 3; i++) {
      (function (idx) {
        var el = document.createElement('button');
        el.id = 'hit' + idx;
        el.className = 'hit';
        el.type = 'button';
        el.addEventListener('click', function () { choose(idx); });
        els.stage.appendChild(el);
      })(i);
    }
    placeHitButtons();
    refreshHitButtons();
  }

  function refreshHitButtons() {
    var armed = state.phase === 'armed';
    for (var i = 0; i < 3; i++) {
      var el = document.getElementById('hit' + i);
      if (!el) continue;
      var w = state.car.question.windows[i];
      el.textContent = '区间 ' + GT.UI.windowLabel(w) + ' 秒';
      el.disabled = !armed;
      el.style.pointerEvents = armed ? 'auto' : 'none';
    }
  }

  // ---- frame -------------------------------------------------------------
  function requestRender() { dirty = true; }

  function frame() {
    rafId = requestAnimationFrame(frame);
    if (!dirty || !backend) return;
    dirty = false;
    var ops = GT.scene.build(state);
    backend.render(ops);
    lastRects = GT.UI.draw(uiCtx, state);
  }

  // ---- run animation -----------------------------------------------------
  function posAt(tau) {
    var pm = state.car.sim.perMetre;
    if (tau <= 0) return { m: 0, v: 0 };
    for (var i = 0; i < pm.length; i++) {
      if (pm[i].t >= tau) {
        var prev = i === 0 ? { m: 0, t: 0, v: 0 } : pm[i - 1];
        var span = pm[i].t - prev.t;
        var f = span > 1e-9 ? (tau - prev.t) / span : 1;
        return { m: GT.lerp(prev.m, pm[i].m, f), v: GT.lerp(prev.v, pm[i].v, f) };
      }
    }
    var last = pm[pm.length - 1];
    return { m: last.m, v: last.v };
  }

  function choose(idx) {
    if (state.phase !== 'armed') return;
    state.chosenIndex = idx;
    state.phase = 'running';
    refreshHitButtons();
    requestRender();

    var T = state.car.sim.time;
    var t0 = performance.now();
    var token = ++runToken;

    (function step() {
      if (token !== runToken) return;
      var tau = (performance.now() - t0) / 1000;
      if (tau >= T) {
        state.progressMetres = 20;
        state.speedNow = state.car.sim.finishSpeed;
        requestRender();
        setTimeout(function () {
          if (token !== runToken) return;
          state.phase = 'revealed';
          refreshHitButtons();
          requestRender();
          document.body.setAttribute('data-phase', 'revealed');
        }, 420);
        return;
      }
      var s = posAt(tau);
      state.progressMetres = s.m;
      state.speedNow = s.v;
      requestRender();
      requestAnimationFrame(step);
    })();
  }

  // ---- export ------------------------------------------------------------
  function stateForExport() {
    return {
      episode: state.episode,
      phase: 'revealed',
      car: state.car,
      chosenIndex: state.chosenIndex >= 0 ? state.chosenIndex : 0,
      progressMetres: 20,
      speedNow: state.car.sim.finishSpeed
    };
  }

  function exportPng() {
    var st = stateForExport();
    var ops = GT.scene.build(st);
    backend.render(ops);                       // also primes lastOps for readback
    return backend.readPixels().then(function (img) {
      GT.UI.draw(uiCtx, st);
      outCtx.setTransform(1, 0, 0, 1, 0, 0);
      outCtx.clearRect(0, 0, GT.W, GT.H);
      outCtx.putImageData(img, 0, 0);
      outCtx.drawImage(els.ui, 0, 0);
      return new Promise(function (resolve, reject) {
        els.out.toBlob(function (blob) {
          if (!blob) { reject(new Error('toBlob returned null')); return; }
          resolve(blob);
        }, 'image/png');
      });
    }).then(function (blob) {
      window.__game.lastExport = { bytes: blob.size, width: GT.W, height: GT.H };
      return blob;
    });
  }

  function download() {
    return exportPng().then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'guess-the-time-' + state.car.seed + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return blob.size;
    });
  }

  // ---- self test ---------------------------------------------------------
  function extremeFires() {
    // A deliberately impossible car: no thrust worth speaking of, huge drag.
    // If the band check cannot reject this, it cannot reject anything.
    var bad = Object.assign({}, GT.PHYS.BEST, {
      impulseNS: 0.55, cdaMM2: 2400, crr: 0.02, massG: 68
    });
    var t = GT.PHYS.simulate(bad).time;
    return { time: t, outOfBand: !GT.inBand(t) };
  }

  function selfTest(opts) {
    opts = opts || {};
    var n = opts.seeds || 400;
    var failures = [];
    var worst = 0;
    for (var i = 0; i < n; i++) {
      var car = GT.makeCar(String(opts.base || 1000) + '-' + i);
      if (!car.inBand) {
        failures.push('seed ' + car.seed + ' 时间 ' + car.sim.time.toFixed(4) + ' s 超出 1.00–1.25：' + GT.diagnoseCar(car).join('；'));
        continue;
      }
      var q = GT.checkQuestion(car);
      for (var k = 0; k < q.length; k++) failures.push('seed ' + car.seed + '：' + q[k]);
      var t = car.sim.time;
      if (t < 1.0 || t > 1.25) failures.push('seed ' + car.seed + ' 时间 ' + t + ' 越界');
      if (t > worst) worst = t;
    }
    var ex = extremeFires();
    if (!ex.outOfBand) failures.push('极端参数没有被判出界（' + ex.time.toFixed(3) + ' s），检查器无法工作');

    return {
      ok: failures.length === 0,
      checked: n,
      backend: window.__backendKind,
      failures: failures.slice(0, 20),
      failureCount: failures.length,
      extreme: ex,
      worstTime: worst
    };
  }

  // ---- boot --------------------------------------------------------------
  function boot() {
    els.stage = document.getElementById('stage');
    els.ui = document.getElementById('ui');
    els.out = document.getElementById('out');
    uiCtx = els.ui.getContext('2d');
    outCtx = els.out.getContext('2d');

    state.episode = Number(new URLSearchParams(location.search).get('ep') || 7);
    var seed = new URLSearchParams(location.search).get('seed') || '4407';
    state.car = GT.makeCar(seed);

    buildHitButtons();
    window.addEventListener('resize', resize);

    installBackend().then(function () {
      resize();
      requestRender();
      frame();
      window.__game.ready = true;
      document.body.setAttribute('data-ready', '1');
    });

    document.getElementById('btn-export').addEventListener('click', function () {
      download().catch(function (e) { console.error('[gt] export failed', e); });
    });
    document.getElementById('btn-again').addEventListener('click', function () {
      var next = String(Math.floor(Math.random() * 9000) + 1000);
      window.__game.load(next);
    });
  }

  window.__game = {
    ready: false,
    selfTest: selfTest,
    exportPng: exportPng,
    load: function (seed) {
      runToken++;
      state.car = GT.makeCar(String(seed));
      state.phase = 'armed';
      state.chosenIndex = -1;
      state.progressMetres = 0;
      state.speedNow = 0;
      refreshHitButtons();
      document.body.setAttribute('data-phase', 'armed');
      requestRender();
      return state.car;
    },
    choose: choose,
    textRects: function () { return lastRects; },
    state: function () {
      return {
        phase: state.phase, seed: state.car.seed, time: state.car.sim.time,
        correctIndex: state.car.question.correctIndex, chosenIndex: state.chosenIndex,
        windows: state.car.question.windows
      };
    },
    car: function () { return state.car; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
