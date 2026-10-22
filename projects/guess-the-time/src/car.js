/* car.js — deterministic car generation and the three-window question.
 *
 * Everything here is a pure function of the seed string. Same seed -> same car,
 * same time, same windows, byte for byte, in any browser session.
 */
(function () {
  'use strict';
  var GT = window.GT;
  var P = GT.PHYS;

  // Rejection sampling: a seed can draw a combination that is not a plausible
  // 20 m car (1.2 N.s pushing 70 g of effective mass is not a car, it is a brick).
  // We redraw deterministically until the model lands inside the sanity band, so
  // every car the series ever shows is one we could actually have entered.
  var BAND = [1.0, 1.25];
  var MAX_ATTEMPTS = 400;

  function drawParams(rng) {
    return {
      massG:         GT.rngRange(rng, P.RANGES.massG),
      wheelMassG:    GT.rngRange(rng, P.RANGES.wheelMassG),
      wheelRadiusMM: GT.rngRange(rng, P.RANGES.wheelRadiusMM),
      cdaMM2:        GT.rngRange(rng, P.RANGES.cdaMM2),
      crr:           GT.rngRange(rng, P.RANGES.crr),
      impulseNS:     GT.rngRange(rng, P.RANGES.impulseNS),
      tauMs:         GT.rngRange(rng, P.RANGES.tauMs),
      toeDeg:        GT.rngRange(rng, P.RANGES.toeDeg)
    };
  }

  // Plan-view proportions, driven by the actual parameters so the drawing is an
  // artifact of the model rather than decoration.
  function shapeFrom(rng, p) {
    var len = 200;                                  // mm, class limit [VERIFY]
    var wFrac = (p.cdaMM2 - P.RANGES.cdaMM2[0]) / (P.RANGES.cdaMM2[1] - P.RANGES.cdaMM2[0]);
    var width = 44 + GT.clamp(wFrac, 0, 1) * 26;    // 44..70 mm
    return {
      lengthMM: len,
      widthMM: width,
      noseMM: 58 + rng() * 32,                      // nose length
      tailMM: 34 + rng() * 16,
      wheelDiaMM: p.wheelRadiusMM * 2,
      frontAxleMM: len * (0.70 + rng() * 0.06),     // from nose
      rearAxleMM: len * (0.16 + rng() * 0.06),
      finMM: 8 + rng() * 5,                         // tail fin plate thickness
      finSpanMM: width * (0.55 + rng() * 0.25)
    };
  }

  // Build the three windows so that EXACTLY ONE contains the true time, and it
  // does so with at least 30 ms of margin on both sides. Rounding to 1/100 s is
  // why the margin, not the exact equality, is the guarantee.
  function buildQuestion(rng, time) {
    var W = 0.07;
    var lo0 = Math.round((time - W / 2) * 100) / 100;
    var hi0 = lo0 + W;
    var raw = [
      { lo: lo0, hi: hi0 },
      { lo: lo0 - W, hi: lo0 },
      { lo: hi0, hi: hi0 + W }
    ];
    // shuffle deterministically
    var order = [0, 1, 2];
    for (var i = 2; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    var windows = [];
    var correctIndex = -1;
    for (var k = 0; k < 3; k++) {
      windows.push(raw[order[k]]);
      if (order[k] === 0) correctIndex = k;
    }
    return { windows: windows, correctIndex: correctIndex, width: W };
  }

  function inBand(t) { return t >= BAND[0] && t <= BAND[1]; }

  function makeCar(seed) {
    seed = seed === undefined || seed === null || seed === '' ? '4407' : String(seed);
    var rng = GT.makeRng('car|' + seed);
    var p = null, sim = null, attempt = 0;
    for (; attempt < MAX_ATTEMPTS; attempt++) {
      p = drawParams(rng);
      sim = P.simulate(p);
      if (inBand(sim.time)) break;
    }
    var shape = shapeFrom(rng, p);
    var question = buildQuestion(rng, sim.time);
    var contrib = P.contributions(p, sim.time);

    return {
      seed: seed,
      attempts: attempt + 1,
      inBand: inBand(sim.time),
      p: p,
      sim: sim,
      shape: shape,
      question: question,
      contrib: contrib,
      energy: P.energyClosure(p, sim),
      refTime: P.simulate(P.BEST).time
    };
  }

  // ---- verification helpers (used by app.selfTest and tests/gate.mjs) ----
  function checkQuestion(car) {
    var t = car.sim.time;
    var hits = [];
    for (var i = 0; i < 3; i++) {
      var w = car.question.windows[i];
      if (t >= w.lo && t <= w.hi) hits.push(i);
    }
    var problems = [];
    if (hits.length !== 1) problems.push('时间 ' + t.toFixed(4) + ' 命中了 ' + hits.length + ' 个区间（必须恰好 1 个）');
    else if (hits[0] !== car.question.correctIndex) problems.push('正确下标是 ' + hits[0] + ' 但记录为 ' + car.question.correctIndex);
    // margin check
    for (var k = 0; k < 3; k++) {
      var w2 = car.question.windows[k];
      if (k === car.question.correctIndex) {
        var margin = Math.min(t - w2.lo, w2.hi - t);
        if (margin < 0.02) problems.push('正确区间余量只有 ' + (margin * 1000).toFixed(0) + ' ms，太贴边');
      }
    }
    // windows must not overlap each other
    var sorted = car.question.windows.slice().sort(function (a, b) { return a.lo - b.lo; });
    for (var n = 1; n < sorted.length; n++) {
      if (sorted[n].lo < sorted[n - 1].hi - 1e-9) problems.push('区间 ' + n + ' 与上一个重叠');
    }
    return problems;
  }

  // Name the parameters that pushed a car out of the sanity band, so a failure
  // says which constant to look at instead of just "time is wrong".
  function diagnose(car) {
    var t = car.sim.time, p = car.p, out = [];
    if (t > BAND[1]) out.push('偏慢 ' + (t - BAND[1]).toFixed(3) + ' s');
    if (t < BAND[0]) out.push('偏快 ' + (BAND[0] - t).toFixed(3) + ' s');
    var me = P.effectiveMassKg(p);
    var vLaunch = p.impulseNS / me;
    if (vLaunch < 17.5) out.push('冲量/有效质量比偏低（起飞速度 ' + vLaunch.toFixed(1) + ' m/s）');
    if (vLaunch > 23) out.push('冲量/有效质量比偏高（起飞速度 ' + vLaunch.toFixed(1) + ' m/s）');
    if (t > BAND[1] && p.cdaMM2 > 1150) out.push('CdA ' + p.cdaMM2.toFixed(0) + ' mm² 顶到上限');
    if (t > BAND[1] && p.crr > 0.0085) out.push('Crr ' + p.crr.toFixed(4) + ' 接近上限');
    if (t > BAND[1] && p.toeDeg > 0.7) out.push('toe ' + p.toeDeg.toFixed(2) + '° 接近上限');
    if (t > BAND[1] && p.massG > 62) out.push('质量 ' + p.massG.toFixed(1) + ' g 偏重');
    if (t < BAND[0] && p.massG < 54) out.push('质量 ' + p.massG.toFixed(1) + ' g 偏轻');
    return out;
  }

  GT.BAND = BAND;
  GT.makeCar = makeCar;
  GT.inBand = inBand;
  GT.checkQuestion = checkQuestion;
  GT.diagnoseCar = diagnose;
})();
