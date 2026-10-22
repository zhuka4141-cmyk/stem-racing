/* Canvas2D 图表引擎 · 零依赖
 * 页面与 1080×1920 导出共用同一套渲染函数，保证屏幕所见与导出所见一致。
 * 规范：数字一律等宽字体；单位一律出现在轴上；只有强调色一个色相，其余靠明度分级。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LabCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var T = {
    paper:  '#F2F0EB',
    ink:    '#0B0B0C',
    ink2:   '#151517',
    line:   'rgba(242,240,235,0.16)',
    soft:   'rgba(242,240,235,0.07)',
    mute:   'rgba(242,240,235,0.55)',
    mute2:  'rgba(242,240,235,0.32)',
    accent: '#E8590C',
    mono:   '"Cascadia Mono","Consolas","Microsoft YaHei","Noto Sans SC",ui-monospace,monospace',
    disp:   '"Bahnschrift Condensed","Bahnschrift","Arial Narrow","Microsoft YaHei UI","Noto Sans SC",sans-serif',
    body:   '"Segoe UI","Microsoft YaHei UI","Noto Sans SC",sans-serif'
  };

  /* 阻力分项配色：一个强调色给最大损失，其余靠明度 */
  var SEG = {
    keTrans: '#E9E5DD',
    keWheel: '#A9A49B',
    drag:    '#E8590C',
    bearing: '#6E6A64',
    roll:    '#474441',
    scrub:   '#2F2C29'
  };

  function mono(ctx, size, weight) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + T.mono;
  }
  function disp(ctx, size, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px ' + T.disp;
  }
  function body(ctx, size, weight) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + T.body;
  }

  function niceCeil(v, step) {
    if (v <= 0) return step;
    return Math.ceil(v / step) * step;
  }
  function fmt(n, d) {
    return (n < 0 ? '-' : '') + Math.abs(n).toFixed(d === undefined ? 2 : d);
  }

  /* ---- 通用：标题带 ---- */
  function head(ctx, box, title, sub) {
    var y = box.y;
    disp(ctx, 17, 600);
    ctx.fillStyle = T.paper;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, box.x, y + 15);
    if (sub) {
      mono(ctx, 10.5, 400);
      ctx.fillStyle = T.mute;
      ctx.textAlign = 'right';
      ctx.fillText(sub, box.x + box.w, y + 15);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, y + 24.5);
    ctx.lineTo(box.x + box.w, y + 24.5);
    ctx.stroke();
    return { x: box.x, y: y + 34, w: box.w, h: box.h - 34 };
  }

  /* ---- 通用：坐标框 + 刻度 + 轴标题 ---- */
  function axes(ctx, r, cfg) {
    var x0 = r.x, y0 = r.y + r.h, x1 = r.x + r.w, y1 = r.y;

    // 网格
    ctx.lineWidth = 1;
    ctx.strokeStyle = T.soft;
    cfg.xTicks.forEach(function (t) {
      var px = x0 + (t - cfg.xMin) / (cfg.xMax - cfg.xMin) * (x1 - x0);
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke();
    });
    cfg.yTicks.forEach(function (t) {
      var py = y0 - (t - cfg.yMin) / (cfg.yMax - cfg.yMin) * (y0 - y1);
      ctx.beginPath(); ctx.moveTo(x0, py); ctx.lineTo(x1, py); ctx.stroke();
    });

    // 轴
    ctx.strokeStyle = T.line;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y0);
    ctx.moveTo(x0, y0); ctx.lineTo(x0, y1);
    ctx.stroke();

    // 刻度数字（等宽）
    mono(ctx, 10.5);
    ctx.fillStyle = T.mute;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    cfg.xTicks.forEach(function (t) {
      var px = x0 + (t - cfg.xMin) / (cfg.xMax - cfg.xMin) * (x1 - x0);
      ctx.fillText(cfg.xFmt(t), px, y0 + 6);
    });
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    cfg.yTicks.forEach(function (t) {
      var py = y0 - (t - cfg.yMin) / (cfg.yMax - cfg.yMin) * (y0 - y1);
      ctx.fillText(cfg.yFmt(t), x0 - 7, py);
    });

    // 单位必须出现在轴上
    mono(ctx, 10.5);
    ctx.fillStyle = T.mute;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(cfg.xLabel, x1, y0 + 34);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(cfg.yLabel, x0 - 46, y1 - 2);
  }

  function toX(cfg, r, v) { return r.x + (v - cfg.xMin) / (cfg.xMax - cfg.xMin) * r.w; }
  function toY(cfg, r, v) { return r.y + r.h - (v - cfg.yMin) / (cfg.yMax - cfg.yMin) * r.h; }

  /* ============ 图 1：速度—距离 ============ */
  function speed(ctx, box, data) {
    var r = head(ctx, box, '速度—距离', 'v(x) · RK4');
    r = { x: r.x + 46, y: r.y, w: r.w - 46 - 14, h: r.h - 40 };

    var vTop = Math.max(data.main.vmax, data.ideal ? data.ideal.vmax : 0, 20);
    var cfg = {
      xMin: 0, xMax: 20, yMin: 0, yMax: niceCeil(vTop * 1.06, 5),
      xTicks: [0, 4, 8, 12, 16, 20],
      yTicks: [], xFmt: function (t) { return t.toFixed(0); }, yFmt: function (t) { return t.toFixed(0); },
      xLabel: '距离 x [m]', yLabel: '速度 v [m/s]'
    };
    for (var yt = 0; yt <= cfg.yMax; yt += 5) cfg.yTicks.push(yt);

    axes(ctx, r, cfg);

    // 无阻对照曲线
    if (data.ideal) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = T.mute2;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      var ix = data.ideal.trace.xs, iv = data.ideal.trace.vs;
      for (var i = 0; i < ix.length; i++) {
        var px = toX(cfg, r, ix[i]), py = toY(cfg, r, iv[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 主曲线 + 淡淡的下方填充
    var xs = data.main.trace.xs, vs = data.main.trace.vs;
    ctx.beginPath();
    for (var j = 0; j < xs.length; j++) {
      var qx = toX(cfg, r, xs[j]), qy = toY(cfg, r, vs[j]);
      if (j === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
    }
    var fillPath = ctx;
    ctx.save();
    ctx.lineTo(toX(cfg, r, 20), toY(cfg, r, 0));
    ctx.lineTo(toX(cfg, r, 0), toY(cfg, r, 0));
    ctx.closePath();
    ctx.fillStyle = 'rgba(242,240,235,0.045)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    for (var k = 0; k < xs.length; k++) {
      var ax = toX(cfg, r, xs[k]), ay = toY(cfg, r, vs[k]);
      if (k === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
    }
    ctx.strokeStyle = T.paper;
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 推力归零处的标注
    if (data.thrustEndX !== null && data.thrustEndX !== undefined) {
      var cx = toX(cfg, r, data.thrustEndX);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = T.mute2;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, r.y + r.h); ctx.lineTo(cx, r.y + 4); ctx.stroke();
      ctx.restore();
      mono(ctx, 9.5);
      ctx.fillStyle = T.mute;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('推力归零 ' + data.thrustEndT.toFixed(2) + ' s', cx + 5, r.y + 3);
    }

    // 终点：强调色竖线 + 读数
    var ex = toX(cfg, r, 20), ey = toY(cfg, r, data.main.v);
    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(ex, r.y + r.h); ctx.lineTo(ex, ey - 8); ctx.stroke();
    ctx.fillStyle = T.accent;
    ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.fill();

    mono(ctx, 11, 500);
    ctx.fillStyle = T.accent;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(data.main.t.toFixed(3) + ' s', r.x + r.w - 4, r.y + 14);
    ctx.fillStyle = T.paper;
    ctx.fillText(data.main.v.toFixed(2) + ' m/s', r.x + r.w - 4, r.y + 30);
    return r;
  }

  /* ============ 图 2：各阻力功占比（堆叠条） ============ */
  function energy(ctx, box, data) {
    var r = head(ctx, box, '推力做功的去向', '按功分解 · J');
    var w = data.work, total = w.thrust;
    var segs = [
      { k: 'keTrans', label: '平移动能', v: data.keTrans, c: SEG.keTrans, dark: true },
      { k: 'keWheel', label: '轮转动能', v: data.keWheel, c: SEG.keWheel, dark: true },
      { k: 'drag',    label: '空气阻力', v: w.drag,      c: SEG.drag,    dark: true },
      { k: 'bearing', label: '轴承',     v: w.bear,      c: SEG.bearing, dark: false },
      { k: 'roll',    label: '滚动',     v: w.roll,      c: SEG.roll,    dark: false },
      { k: 'scrub',   label: '导轨擦阻', v: w.scrub,     c: SEG.scrub,   dark: false }
    ];

    var barY = r.y + 16, barH = 30;
    var cx = r.x;
    ctx.textBaseline = 'alphabetic';
    mono(ctx, 10);
    ctx.fillStyle = T.mute;
    ctx.textAlign = 'left';
    ctx.fillText('总输入 ' + total.toFixed(2) + ' J', r.x, r.y + 8);
    ctx.textAlign = 'right';
    ctx.fillText('100 %', r.x + r.w, r.y + 8);

    segs.forEach(function (s) {
      var sw = Math.max(0, s.v / total * r.w);
      ctx.fillStyle = s.c;
      ctx.fillRect(cx, barY, sw, barH);
      if (sw > 34) {
        mono(ctx, 10, 500);
        ctx.fillStyle = s.dark ? T.ink : T.paper;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((s.v / total * 100).toFixed(1) + '%', cx + sw / 2, barY + barH / 2);
      }
      cx += sw;
    });
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, barY + 0.5, r.w - 1, barH - 1);

    // 图例：两列
    var ly = barY + barH + 18;
    var colW = r.w / 2;
    ctx.textBaseline = 'middle';
    segs.forEach(function (s, i) {
      var col = i < 3 ? 0 : 1;
      var row = i % 3;
      var lx = r.x + col * colW;
      var yy = ly + row * 17;
      ctx.fillStyle = s.c;
      ctx.fillRect(lx, yy - 5, 10, 10);
      mono(ctx, 10.5);
      ctx.fillStyle = T.mute;
      ctx.textAlign = 'left';
      ctx.fillText(s.label, lx + 16, yy);
      mono(ctx, 10.5, 500);
      ctx.fillStyle = T.paper;
      ctx.textAlign = 'right';
      ctx.fillText(s.v.toFixed(3) + ' J', lx + colW - 12, yy);
    });
    ctx.textAlign = 'left';
    return r;
  }

  /* ============ 图 3：当前 vs 队内基准（差值秒数） ============ */
  function delta(ctx, box, data) {
    var r = head(ctx, box, '当前参数 vs 队内基准', '单位 ms · 负值 = 当前更快');
    var rows = data.rows;
    var maxAbs = 1;
    rows.forEach(function (q) { maxAbs = Math.max(maxAbs, Math.abs(q.deltaMs)); });
    maxAbs = Math.max(maxAbs, Math.abs(data.totalMs));
    maxAbs = niceCeil(maxAbs, 20);

    var gutter = 74, valW = 52;
    var x0 = r.x + gutter, x1 = r.x + r.w - valW;
    var mid = (x0 + x1) / 2;
    var halfW = (x1 - x0) / 2;

    var all = rows.concat([{ label: '合计', sym: '', deltaMs: data.totalMs, total: true }]);
    var rowH = Math.min(22, (r.h - 10) / all.length);
    var barH = Math.max(7, rowH * 0.46);
    var top = r.y + 6;

    // 零线
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mid, top); ctx.lineTo(mid, top + rowH * all.length - 4); ctx.stroke();

    all.forEach(function (q, i) {
      var cy = top + i * rowH + rowH / 2;
      if (q.total) {
        ctx.strokeStyle = T.line;
        ctx.beginPath();
        ctx.moveTo(r.x, cy - rowH / 2 + 1); ctx.lineTo(r.x + r.w, cy - rowH / 2 + 1);
        ctx.stroke();
      }
      mono(ctx, 10.5, q.total ? 500 : 400);
      ctx.fillStyle = q.total ? T.paper : T.mute;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(q.label, r.x, cy);

      var bw = Math.abs(q.deltaMs) / maxAbs * halfW;
      // 当前更快（负）= 向左，用强调色
      ctx.fillStyle = q.total ? T.accent : (q.deltaMs < 0 ? T.accent : T.mute2);
      if (q.deltaMs < 0) ctx.fillRect(mid - bw, cy - barH / 2, bw, barH);
      else ctx.fillRect(mid, cy - barH / 2, bw, barH);

      mono(ctx, 10.5, q.total ? 600 : 500);
      ctx.fillStyle = q.total ? T.accent : T.paper;
      ctx.textAlign = 'right';
      ctx.fillText((q.deltaMs < 0 ? '' : '+') + q.deltaMs.toFixed(0), r.x + r.w, cy);
    });

    mono(ctx, 9.5);
    ctx.fillStyle = T.mute2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('← 更快', x0, top + rowH * all.length);
    ctx.textAlign = 'right';
    ctx.fillText('更慢 →', x1, top + rowH * all.length);
    ctx.textAlign = 'left';
    return r;
  }

  /* ============ 图 4：跑偏敏感度 ============ */
  function lateral(ctx, box, data) {
    var r = head(ctx, box, '跑偏敏感度', '质心偏移 → 车尾横向偏移');
    r = { x: r.x + 46, y: r.y, w: r.w - 46 - 14, h: r.h - 40 };

    var maxY = 1;
    data.curve.forEach(function (p) { maxY = Math.max(maxY, p.latMM); });
    var cfg = {
      xMin: 0, xMax: 3, yMin: 0, yMax: niceCeil(maxY * 1.1, 0.5),
      xTicks: [0, 0.5, 1, 1.5, 2, 2.5, 3],
      yTicks: [], xFmt: function (t) { return t.toFixed(1); },
      yFmt: function (t) { return t.toFixed(1); },
      xLabel: '质心横向偏移 [mm]', yLabel: '车尾横向偏移 [mm]'
    };
    var step = cfg.yMax <= 1.5 ? 0.25 : (cfg.yMax <= 3 ? 0.5 : 1);
    for (var yt = 0; yt <= cfg.yMax + 1e-9; yt += step) cfg.yTicks.push(yt);

    axes(ctx, r, cfg);

    // 导孔余量线：超过它说明导孔已经顶住鱼线
    var gy = toY(cfg, r, data.guideClear);
    if (data.guideClear < cfg.yMax) {
      ctx.fillStyle = 'rgba(232,89,12,0.07)';
      ctx.fillRect(r.x, r.y, r.w, Math.max(0, gy - r.y));
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = T.accent;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(r.x, gy); ctx.lineTo(r.x + r.w, gy); ctx.stroke();
      ctx.restore();
      mono(ctx, 9.5);
      ctx.fillStyle = T.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('导孔余量 ' + data.guideClear.toFixed(2) + ' mm — 以上导孔已顶死', r.x + 4, gy - 2);
    }

    // 曲线
    ctx.beginPath();
    data.curve.forEach(function (p, i) {
      var px = toX(cfg, r, p.dMM), py = toY(cfg, r, p.latMM);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = T.paper;
    ctx.lineWidth = 2.1;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 当前点
    var mx = toX(cfg, r, data.currentD), my = toY(cfg, r, data.currentLat);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = T.mute2;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, r.y + r.h); ctx.lineTo(mx, my); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = T.accent;
    ctx.beginPath(); ctx.arc(mx, my, 3.6, 0, Math.PI * 2); ctx.fill();

    mono(ctx, 11, 500);
    ctx.fillStyle = T.accent;
    ctx.textAlign = mx > r.x + r.w * 0.62 ? 'right' : 'left';
    ctx.textBaseline = 'bottom';
    var tx = mx + (ctx.textAlign === 'right' ? -7 : 7);
    ctx.fillText(data.currentD.toFixed(2) + ' mm → ' + data.currentLat.toFixed(2) + ' mm', tx, my - 7);
    ctx.textAlign = 'left';
    return r;
  }

  return {
    T: T, SEG: SEG,
    head: head, axes: axes, niceCeil: niceCeil, fmt: fmt,
    speed: speed, energy: energy, delta: delta, lateral: lateral
  };
});
