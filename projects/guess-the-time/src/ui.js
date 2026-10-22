/* ui.js — every string in the frame, painted onto a 2D canvas.
 *
 * Text lives on its own canvas layer rather than in the DOM so that the screen
 * and the exported PNG run literally the same stroke calls: there is no second
 * layout engine to disagree with.
 *
 * draw() returns the measured bounding box of every glyph run, which is what
 * the gate asserts the safe area and the 48 px minimum against.
 */
(function () {
  'use strict';
  var GT = window.GT;
  var P = GT.PALETTE;
  var L = GT.LAYOUT;
  var SAFE = GT.SAFE;

  function windowLabel(w) { return w.lo.toFixed(2) + '–' + w.hi.toFixed(2); }

  function makeText(ctx, rec) {
    return function (text, x, y, opt) {
      opt = opt || {};
      var fontKey = opt.font || 'cjk';
      var size = opt.size || 48;
      var weight = opt.weight || 400;
      var align = opt.align || 'left';
      ctx.font = weight + ' ' + size + 'px ' + GT.FONTS[fontKey];
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = opt.color || P.ink;
      if (opt.alpha !== undefined) {
        ctx.save();
        ctx.globalAlpha = opt.alpha;
        ctx.fillText(text, x, y);
        ctx.restore();
      } else {
        ctx.fillText(text, x, y);
      }
      var m = ctx.measureText(text);
      var w = m.width;
      var asc = m.actualBoundingBoxAscent !== undefined ? m.actualBoundingBoxAscent : size * 0.78;
      var desc = m.actualBoundingBoxDescent !== undefined ? m.actualBoundingBoxDescent : size * 0.22;
      var x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      rec.push({
        text: text, size: size, font: fontKey, weight: weight,
        x0: x0, y0: y - asc, x1: x0 + w, y1: y + desc
      });
      return w;
    };
  }

  function buttonRect(i) {
    var b = L.buttons;
    return { x: b.x + i * (b.w + b.gap), y: b.y, w: b.w, h: b.h };
  }

  // Which button rectangle contains a canvas-space point (already un-scaled).
  function hitButton(px, py) {
    for (var i = 0; i < 3; i++) {
      var r = buttonRect(i);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  }

  function drawParams(T, car) {
    var p = car.p, s = car.shape;
    var rows = [
      [['质量', p.massG.toFixed(1) + ' g'], ['CdA', p.cdaMM2.toFixed(0) + ' mm²']],
      [['Crr', p.crr.toFixed(4)], ['冲量', p.impulseNS.toFixed(3) + ' N·s']],
      [['轮径', (s.wheelDiaMM).toFixed(1) + ' mm'], ['对中', p.toeDeg.toFixed(2) + '°']]
    ];
    for (var r = 0; r < rows.length; r++) {
      var y = L.params.rowY[r] + 38;
      T(rows[r][0][0], L.params.x1, y, { font: 'cjk', size: 48, color: P.dim });
      T(rows[r][0][1], L.params.x1 + L.params.w1, y, { font: 'mono', size: 48, align: 'right' });
      T(rows[r][1][0], L.params.x2, y, { font: 'cjk', size: 48, color: P.dim });
      T(rows[r][1][1], L.params.x2 + L.params.w2, y, { font: 'mono', size: 48, align: 'right' });
    }
  }

  function drawButtons(o, state) {
    var car = state.car, q = car.question;
    var revealed = state.phase === 'revealed';
    for (var i = 0; i < 3; i++) {
      var r = buttonRect(i);
      var w = q.windows[i];
      var isCorrect = i === q.correctIndex;
      var isChosen = state.chosenIndex === i;

      var border, fill, textCol;
      if (!revealed) {
        border = isChosen ? P.accent : GT.hexRgb(P.faint).map(function (v, k) {
          return k < 3 ? Math.round(v * 255) : 1;
        });
        border = isChosen ? P.accent : '#3A3A3E';
        fill = isChosen ? 'rgba(232,89,12,0.14)' : 'rgba(0,0,0,0)';
        textCol = isChosen ? P.accent : P.ink;
      } else if (isCorrect) {
        border = P.accent; fill = 'rgba(232,89,12,0.20)'; textCol = P.accent;
      } else {
        border = '#33333A'; fill = 'rgba(0,0,0,0)'; textCol = P.dim;
      }
      o.rect(r.x, r.y, r.w, r.h, fill);
      o.rect(r.x, r.y, r.w, 2, border);
      o.rect(r.x, r.y + r.h - 2, r.w, 2, isChosen || (revealed && isCorrect) ? border : '#2A2A2C');
      o.rect(r.x, r.y, 2, r.h, border);
      o.rect(r.x + r.w - 2, r.y, 2, r.h, border);
    }
  }

  function drawButtonsText(T, state) {
    var car = state.car, q = car.question;
    var revealed = state.phase === 'revealed';
    for (var i = 0; i < 3; i++) {
      var r = buttonRect(i);
      var w = q.windows[i];
      var isCorrect = i === q.correctIndex;
      var isChosen = state.chosenIndex === i;
      var col = revealed ? (isCorrect ? P.accent : P.dim) : (isChosen ? P.accent : P.ink);
      T(windowLabel(w), r.x + r.w / 2, r.y + r.h / 2 + 17, {
        font: 'mono', size: 48, align: 'center', color: col
      });
      T('s', r.x + r.w / 2, r.y + r.h / 2 + 54, { font: 'mono', size: 48, align: 'center', color: P.faint });
    }
  }

  function drawBarsText(T, car) {
    var B = L.bars;
    var f = car.contrib.factors;
    var units = { massG: 'g', cdaMM2: 'mm²', crr: '', impulseNS: 'N·s' };
    for (var i = 0; i < f.length; i++) {
      var y = B.rowTop + i * B.rowPitch + 38;
      var val = f[i].value;
      var shown = f[i].key === 'crr' ? val.toFixed(4)
        : f[i].key === 'massG' ? val.toFixed(1)
          : f[i].key === 'impulseNS' ? val.toFixed(3)
            : val.toFixed(0);
      var u = units[f[i].key] || '';
      T(f[i].label + ' ' + shown + u, B.labelX, y, { font: 'cjk', size: 48, color: P.dim });
      var ms = f[i].savedSeconds * 1000;
      T((ms >= 1 ? '+' + ms.toFixed(0) : '±0') + ' ms', B.valueX, y, {
        font: 'mono', size: 48, align: 'right',
        color: f[i].savedSeconds >= 0.0005 ? P.accent : P.faint
      });
    }
  }

  function draw(ctx, state) {
    var rec = [];
    var T = makeText(ctx, rec);
    var car = state.car;
    var phase = state.phase;

    ctx.clearRect(0, 0, GT.W, GT.H);

    // header
    T('EP.' + String(state.episode).padStart(2, '0'), SAFE.x0, L.headerY + 40, {
      font: 'mono', size: 48, color: P.accent
    });
    T('SEED ' + car.seed, SAFE.x1, L.headerY + 40, { font: 'mono', size: 48, align: 'right', color: P.faint });

    // title
    T('20.00 m 直线 · CO₂ 弹力车', SAFE.x0, L.eyebrowY + 34, { font: 'mono', size: 48, color: P.dim });
    T('猜它跑多少秒', SAFE.x0, L.titleY + 60, { font: 'cjk', size: L.titleSize, weight: 700 });

    if (phase === 'revealed') {
      drawBarsText(T, car);
    } else {
      T('200 mm 全长 · ' + (car.shape.frontAxleMM - car.shape.rearAxleMM).toFixed(0) + ' mm 轴距',
        (SAFE.x0 + SAFE.x1) / 2, SAFE.y0 + 560, { font: 'mono', size: 48, align: 'center', color: P.faint });
    }

    // ladder labels
    T('0.00 m', SAFE.x0, L.axisLabelY + 40, { font: 'mono', size: 48, color: P.dim });
    T('20.00 m', SAFE.x1, L.axisLabelY + 40, { font: 'mono', size: 48, align: 'right', color: P.dim });

    if (phase === 'revealed') {
      var t = car.sim.time;
      var tw = T(t.toFixed(3), SAFE.x0, L.revealed.timeY, {
        font: 'mono', size: L.revealed.timeSize, color: P.accent
      });
      T('s', SAFE.x0 + tw + 14, L.revealed.timeY, { font: 'mono', size: 64, color: P.dim });

      var trueWin = car.question.windows[car.question.correctIndex];
      var picked = car.question.windows[state.chosenIndex];
      var verdict = state.chosenIndex === car.question.correctIndex
        ? '选对了 · 实际在 ' + windowLabel(trueWin) + ' s'
        : '选偏了 · 你选 ' + windowLabel(picked) + '，实际 ' + windowLabel(trueWin);
      T(verdict, SAFE.x0, L.revealed.verdictY, {
        font: 'cjk', size: 48,
        color: state.chosenIndex === car.question.correctIndex ? P.ink : P.dim
      });
      T('单项改到最优各能省多少 · 不可相加', SAFE.x0, L.revealed.noteY, { font: 'cjk', size: 48, color: P.dim });
      T('对中 ' + car.p.toeDeg.toFixed(2) + '° 另算，可省 ' + (car.contrib.toeSaved * 1000).toFixed(0) + ' ms',
        SAFE.x0, L.revealed.toeY, { font: 'cjk', size: 48, color: P.faint });
    } else if (phase === 'running') {
      T('x ' + state.progressMetres.toFixed(1) + ' m', SAFE.x0, 1290, { font: 'mono', size: 48 });
      T('v ' + state.speedNow.toFixed(1) + ' m/s', SAFE.x0 + 300, 1290, { font: 'mono', size: 48, color: P.dim });
      T('…', SAFE.x1, 1290, { font: 'mono', size: 48, align: 'right', color: P.faint });
    } else {
      T('选一个区间', SAFE.x0, L.params.rowY[2] + 78, { font: 'cjk', size: 48, color: P.dim });
      drawParams(T, car);
    }

    return rec;
  }

  GT.UI = { draw: draw, buttonRect: buttonRect, hitButton: hitButton, windowLabel: windowLabel };
})();
