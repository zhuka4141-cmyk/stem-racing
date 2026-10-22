/* scene.js — turns game state into the shared draw-op list.
 *
 * GT.LAYOUT is the single geometry table. The renderer draws every polygon from
 * it and ui.js positions every string from it, so the two layers cannot drift.
 */
(function () {
  'use strict';
  var GT = window.GT;
  var P = GT.PALETTE;
  var SAFE = GT.SAFE;

  GT.LAYOUT = {
    headerY: 240,
    headerRule: 316,
    eyebrowY: 336,
    titleY: 404,
    titleSize: 84,
    blockA: { top: 486, bottom: 812 },
    car: { cx: 540, cy: 618, pxPerMM: 3.0 },
    ladder: { x0: SAFE.x0, x1: SAFE.x1, axisY: 1010, barBase: 1000, barMaxH: 88, tickMinor: 14, tickMajor: 26 },
    axisLabelY: 1064,
    lower: { top: 1140 },
    params: { x1: 60, x2: 490, w1: 400, w2: 440, rowY: [1120, 1174, 1228] },
    buttons: { x: 60, y: 1330, w: 280, h: 150, gap: 15 },
    revealed: { timeY: 1252, timeSize: 132, verdictY: 1322, noteY: 1392, toeY: 1452 },
    bars: { labelX: 60, trackX: 400, trackW: 280, valueX: 930, rowTop: 486, rowPitch: 70, labelW: 330 }
  };

  var C = { ready: false };
  function colours() {
    if (C.ready) return C;
    var g = GT.hex;
    C.faint = g(P.faint, 0.55);
    C.rail = g(P.rail, 0.9);
    C.inkSoft = g(P.ink, 0.22);
    C.inkLine = g(P.ink, 0.30);
    C.tyre = g('#2C2C30');
    C.tail = g('#232326');
    C.body = g('#1B1B1E');
    C.nose = g('#26262A');
    C.accent = g(P.accent);
    C.accentSoft = g(P.accent, 0.75);
    C.ready = true;
    return C;
  }

  function cornerMarks(o) {
    var LEN = 26, c = colours().faint;
    var pts = [
      [SAFE.x0, SAFE.y0, 1, 1], [SAFE.x1, SAFE.y0, -1, 1],
      [SAFE.x0, SAFE.y1, 1, -1], [SAFE.x1, SAFE.y1, -1, -1]
    ];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      o.rect(p[0] + (p[2] > 0 ? 0 : -LEN), p[1], LEN, 1, c);
      o.rect(p[0], p[1] + (p[3] > 0 ? 0 : -LEN), 1, LEN, c);
    }
  }

  // ---- car plan view -----------------------------------------------------
  // Body width follows CdA and wheel footprint follows wheel diameter, so the
  // picture is a readout of the generated parameters and not decoration.
  function drawCarPlan(o, car) {
    var cc = colours();
    var s = car.shape, L = GT.LAYOUT.car;
    var k = L.pxPerMM;
    function X(mm) { return L.cx + (mm - s.lengthMM / 2) * k; }
    function Y(mm) { return L.cy + mm * k; }

    var hwBody = s.widthMM / 2;
    var wheelW = 8;
    var wHalf = hwBody + wheelW;

    o.rect(SAFE.x0, L.cy - 1, SAFE.x1 - SAFE.x0, 2, cc.rail);

    var axes = [s.lengthMM - s.frontAxleMM, s.lengthMM - s.rearAxleMM];
    for (var a = 0; a < axes.length; a++) {
      var ax = axes[a];
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var cyMm = sgn * (hwBody + wheelW / 2) * 0.55 + sgn * (s.wheelDiaMM / 2) * 0.45;
        o.rect(X(ax) - s.wheelDiaMM * k / 2, Y(cyMm - s.wheelDiaMM / 2),
          s.wheelDiaMM * k, s.wheelDiaMM * k, cc.tyre);
      }
      o.rect(X(ax) - 1, Y(-hwBody), 2, hwBody * 2 * k, GT.hex(P.faint, 0.75));
    }

    var tailMm = s.tailMM;
    var bodyEnd = s.lengthMM - s.noseMM;
    o.rect(X(0), Y(-hwBody), tailMm * k, hwBody * 2 * k, cc.tail);
    o.rect(X(tailMm), Y(-hwBody), (bodyEnd - tailMm) * k, hwBody * 2 * k, cc.body);
    o.wedge(X(bodyEnd), Y(-hwBody), s.noseMM * k, hwBody * 2 * k, 1.0, cc.nose);

    o.rect(X(tailMm), Y(-1.5), (s.lengthMM - tailMm - s.noseMM * 0.45) * k, 3, cc.inkSoft);

    o.rect(X(4), Y(-s.finSpanMM / 2), s.finMM * k, s.finSpanMM * k, GT.hex(P.accent, 0.92));

    o.rect(X(0), Y(-hwBody), 1, hwBody * 2 * k, cc.inkLine);
    o.rect(X(0), Y(-hwBody) - 1, (s.lengthMM - s.noseMM * 0.15) * k, 1, cc.inkLine);
    o.rect(X(0), Y(hwBody), (s.lengthMM - s.noseMM * 0.15) * k, 1, cc.inkLine);

    var dy = L.cy + (wHalf + 10) * k;
    var xa = X(axes[1]), xb = X(axes[0]);
    o.rect(xa, dy, xb - xa, 1, cc.accentSoft);
    o.rect(xa, dy - 9, 1, 18, cc.accentSoft);
    o.rect(xb - 1, dy - 9, 1, 18, cc.accentSoft);
  }

  // ---- ladder: the 20 m axis --------------------------------------------
  function drawLadder(o, state) {
    var cc = colours();
    var LA = GT.LAYOUT.ladder;
    var car = state.car;
    var span = LA.x1 - LA.x0;
    function mx(metres) { return LA.x0 + (metres / 20) * span; }

    // Speed bars would leak the answer while the viewer is still guessing, so
    // they are absent until the run starts and complete only after the reveal.
    var shown = state.phase === 'armed' ? 0
      : state.phase === 'revealed' ? 20
        : state.progressMetres;
    if (shown > 0) {
      var pm = car.sim.perMetre;
      var vmax = 0;
      for (var q = 0; q < pm.length; q++) if (pm[q].v > vmax) vmax = pm[q].v;
      var bw = span / 20 - 9;
      for (var i = 0; i < pm.length; i++) {
        var frac = GT.clamp(shown - i, 0, 1);
        if (frac <= 0) continue;
        var h = Math.max(2, (pm[i].v / vmax) * LA.barMaxH * frac);
        var live = state.phase === 'running' && i >= Math.floor(shown) - 1;
        o.rect(mx(i + 0.5) - bw / 2, LA.barBase - h, bw, h,
          live ? cc.accent : GT.hex(P.ink, 0.42));
      }
      o.rect(LA.x0, LA.barBase - LA.barMaxH - 6, span, 1, GT.hex(P.faint, 0.8));
    }

    o.rect(LA.x0, LA.axisY, span, 2, GT.hex(P.ink, 0.55));
    for (var m = 0; m <= 20; m++) {
      var major = m % 5 === 0;
      var tx = m === 20 ? LA.x1 - 3 : Math.round(mx(m));
      o.rect(tx, LA.axisY, major ? 3 : 2, major ? LA.tickMajor : LA.tickMinor,
        GT.hex(major ? P.ink : P.dim, major ? 0.85 : 0.5));
    }

    o.rect(LA.x0, LA.axisY - 34, 4, 34, cc.accent);
    o.rect(LA.x1 - 4, LA.axisY - 34, 4, 34, cc.accent);

    var px = mx(GT.clamp(state.progressMetres, 0, 20));
    if (state.phase === 'running') {
      var tail = 46;
      for (var t = 0; t < tail; t += 4) {
        o.disc(px - t, LA.axisY - 16, 5 - t / 22, GT.hex(P.accent, Math.pow(1 - t / tail, 2) * 0.5));
      }
    }
    o.rect(px - 2, LA.axisY - 30, 4, 30, GT.hex(P.ink));
    o.disc(px, LA.axisY - 34, 7, cc.accent);
  }

  // ---- contribution bars (reveal state) ---------------------------------
  function drawBars(o, car) {
    var cc = colours();
    var B = GT.LAYOUT.bars;
    var f = car.contrib.factors;
    var maxSaved = 0.001;
    for (var i = 0; i < f.length; i++) maxSaved = Math.max(maxSaved, Math.abs(f[i].savedSeconds));

    for (var r = 0; r < f.length; r++) {
      var y = B.rowTop + r * B.rowPitch;
      o.rect(SAFE.x0, y + 46, SAFE.x1 - SAFE.x0, 1, cc.rail);
      var frac = Math.abs(f[r].savedSeconds) / maxSaved;
      var w = Math.max(3, frac * B.trackW);
      var good = f[r].savedSeconds >= 0.0005;
      o.rect(B.trackX, y + 12, w, 20, good ? cc.accent : GT.hex(P.faint));
    }
    o.rect(B.trackX - 1, B.rowTop + 6, 1, B.rowPitch * f.length - 24, GT.hex(P.ink, 0.45));
  }

  function build(state) {
    var o = GT.newOps();
    o.rect(0, 0, GT.W, GT.H, P.bg);
    cornerMarks(o);
    o.rect(SAFE.x0, GT.LAYOUT.headerRule, SAFE.x1 - SAFE.x0, 1, colours().rail);

    if (state.phase === 'revealed') drawBars(o, state.car);
    else drawCarPlan(o, state.car);

    drawLadder(o, state);
    return o;
  }

  GT.scene = { build: build, drawCarPlan: drawCarPlan, drawLadder: drawLadder, drawBars: drawBars };
})();
