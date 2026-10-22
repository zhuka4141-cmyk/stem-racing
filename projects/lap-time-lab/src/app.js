/* 页面装配：控件、读数、图表、导出
 * 经典脚本，不用 ES module —— file:// 下 module 会被 CORS 拦掉。
 */
(function () {
  'use strict';

  var P = window.LabPhysics;
  var C = window.LabCharts;

  var state = {
    params: P.defaultParams(),
    res: null, ideal: null, cmp: null, lat: null,
    thrustEndT: 0.30, thrustEndX: 0
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function decOf(step) {
    var s = String(step);
    return s.indexOf('.') < 0 ? 0 : s.split('.')[1].length;
  }
  function fmtParam(k, displayValue) {
    return displayValue.toFixed(decOf(P.PARAMS[k].step));
  }

  /* ================= 控件 ================= */

  function buildControls() {
    var host = $('controls');
    host.innerHTML = '';
    Object.keys(P.PARAMS).forEach(function (k) {
      var d = P.PARAMS[k];
      var dec = decOf(d.step);
      var row = el('div', 'ctrl');
      row.setAttribute('data-tip', 'param:' + k);
      row.setAttribute('tabindex', '0');
      row.innerHTML =
        '<div class="ctrl__top">' +
          '<span class="ctrl__name">' + d.label + ' <em>' + d.sym + '</em></span>' +
          '<span class="ctrl__val"><b class="num" data-role="val" data-key="' + k + '">' +
            d.def.toFixed(dec) + '</b> <span class="unit">' + d.unit + '</span></span>' +
          '<span class="tag tag--' + d.status.toLowerCase() + '">' + d.status + '</span>' +
        '</div>' +
        '<input type="range" data-input="' + k + '" aria-label="' + d.label + '"' +
          ' min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + d.def + '">' +
        '<div class="ctrl__scale"><span>' + d.min + '</span><span>' + d.max + ' ' + d.unit + '</span></div>';
      host.appendChild(row);

      var input = row.querySelector('input');
      input.addEventListener('input', function () {
        state.params[k] = parseFloat(input.value) * d.scale;
        row.querySelector('[data-role="val"]').textContent = parseFloat(input.value).toFixed(dec);
        if (tipKey === 'param:' + k) showTip(row, tipKey);
        render();
      });
    });
  }

  function buildConsts() {
    var host = $('consts');
    host.innerHTML = '';
    Object.keys(P.CONSTS).forEach(function (key) {
      var c = P.CONSTS[key];
      var shown;
      if (c.value === null) shown = '\u2014';
      else if (Array.isArray(c.value)) shown = c.value[0] + '\u2013' + c.value[1];
      else if (Math.abs(c.value) < 1e-3) shown = c.value.toExponential(1).replace('e-', '\u00d710\u207b').replace(/^([\d.]+)\u00d710\u207b(\d)$/, function (m, a, b) {
        return a + '\u00d710\u207b' + '⁰¹²³⁴⁵⁶⁷⁸⁹'[+b];
      });
      else shown = String(c.value);

      var item = el('div', 'consts__item');
      item.setAttribute('data-tip', 'const:' + key);
      item.setAttribute('tabindex', '0');
      item.innerHTML =
        '<span class="tag tag--' + c.status.toLowerCase() + '">' + c.status + '</span>' +
        '<div><span class="consts__sym">' + (c.sym || '') + '</span>' +
        '<span class="consts__val">' + shown + '</span> ' +
        '<span class="consts__unit" style="color:var(--mute);font-size:11px">' + c.unit + '</span></div>' +
        '<div style="color:var(--mute);font-size:11.5px;line-height:1.45;margin-top:3px">' + c.label + '</div>';
      host.appendChild(item);
    });
  }

  /* ================= 悬停提示 ================= */

  var tip = $('tip');
  var tipKey = null;

  function tipData(key) {
    var parts = key.split(':');
    if (parts[0] === 'param') {
      var d = P.PARAMS[parts[1]];
      var si = state.params[parts[1]];
      var disp = si / d.scale;
      return {
        name: d.label + ' ' + d.sym,
        val: fmtParam(parts[1], disp) + ' ' + d.unit,
        status: d.status,
        note: d.note
      };
    }
    var c = P.CONSTS[parts[1]];
    var v = c.value === null ? '\u2014' : (Array.isArray(c.value) ? c.value.join('\u2013') : String(c.value));
    return { name: c.label + ' ' + (c.sym || ''), val: v + ' ' + c.unit, status: c.status, note: c.note };
  }

  function showTip(anchor, key) {
    var d = tipData(key);
    tipKey = key;
    tip.innerHTML =
      '<div class="tip__hd"><span class="tip__name">' + d.name + '</span>' +
      '<span class="tip__val">' + d.val + '</span></div>' +
      '<div class="tip__hd"><span class="tag tag--' + d.status.toLowerCase() + '">' + d.status + '</span></div>' +
      '<div class="tip__note">' + d.note + '</div>';
    tip.setAttribute('data-open', '');
    tip.setAttribute('aria-hidden', 'false');

    var r = anchor.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - tw - 8);
    var top = r.bottom + 8;
    if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 8);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTip() {
    tipKey = null;
    tip.removeAttribute('data-open');
    tip.setAttribute('aria-hidden', 'true');
  }

  document.addEventListener('mouseover', function (e) {
    var host = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (host) showTip(host, host.getAttribute('data-tip'));
  });
  document.addEventListener('mouseout', function (e) {
    var host = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!host) return;
    // 在同一个锚点内部换子元素不算离开，别闪
    if (e.relatedTarget && host.contains(e.relatedTarget)) return;
    hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var host = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (host) showTip(host, host.getAttribute('data-tip'));
  });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('scroll', hideTip, true);

  /* ================= 计算与读数 ================= */

  var STATS = [
    { k: 'vEnd', label: '末速度', unit: 'm/s', fmt: function (r) { return r.v.toFixed(2); } },
    { k: 'aMax', label: '峰值加速度', unit: 'g', fmt: function (r) { return (r.aMax / 9.81).toFixed(1); } },
    { k: 'fp', label: '峰值推力', unit: 'N', fmt: function (r) { return r.fp.toFixed(1); } },
    { k: 'meff', label: '有效质量', unit: 'g', fmt: function (r) { return (r.meff * 1000).toFixed(1); } }
  ];

  function buildStats() {
    var host = $('stats');
    host.innerHTML = '';
    STATS.forEach(function (s) {
      var cell = el('div');
      cell.innerHTML = '<dt class="label">' + s.label + '</dt>' +
        '<dd><b class="num" data-stat="' + s.k + '">\u2014</b><span>' + s.unit + '</span></dd>';
      host.appendChild(cell);
    });
  }

  function compute() {
    var p = state.params;
    state.res = P.simulate(p);
    state.ideal = P.simulate(p, { ideal: true });
    state.cmp = P.compareToBaseline(p);
    state.lat = P.lateralCurve(p);

    // 推力归零那一刻在赛道上的位置
    var cut = P.CONSTS.TH_CUT.value;
    var ts = state.res.trace.ts, xs = state.res.trace.xs;
    var xEnd = 0;
    for (var i = 0; i < ts.length; i++) { if (ts[i] <= cut) xEnd = xs[i]; else break; }
    state.thrustEndX = xEnd;
    state.thrustEndT = cut;
  }

  function renderReadout() {
    var r = state.res;
    $('v-time').textContent = r.t.toFixed(3);

    // 区间条
    var LO = 0.90, HI = 1.40;
    var zone = $('bandzone'), mark = $('bandmark');
    zone.style.left = ((1.00 - LO) / (HI - LO) * 100) + '%';
    zone.style.width = ((1.25 - 1.00) / (HI - LO) * 100) + '%';
    var pct = (r.t - LO) / (HI - LO) * 100;
    mark.style.left = Math.min(99.4, Math.max(0.6, pct)) + '%';
    mark.style.background = r.inBandT ? 'var(--paper)' : 'var(--accent)';

    // 四个读数
    STATS.forEach(function (s) {
      var n = document.querySelector('[data-stat="' + s.k + '"]');
      if (n) n.textContent = s.fmt(r);
    });

    // 超区间警告
    var alertBox = $('band-alert');
    var body = $('band-alert-body');
    if (!r.inBandT) {
      alertBox.hidden = false;
      var side = r.t > 1.25 ? '慢' : '快';
      body.innerHTML =
        '<b>t = ' + r.t.toFixed(3) + ' s</b>，落在 1.00\u20131.25 s 之外（偏 ' + side + '）。' +
        '按赛规常识，20 m 气动车跑不出这个数 \u2014 出问题的是模型或参数，不是车。' +
        '先看推力冲量 ' + (state.params.J).toFixed(2) + ' N\u00b7s 和车体质量 ' +
        (state.params.m * 1000).toFixed(1) + ' g 这两个数是不是给错了。';
    } else {
      alertBox.hidden = true;
    }
    return r;
  }

  /* ================= 图表 ================= */

  function drawChart(id, cssH, draw) {
    var cv = $(id);
    var panel = cv.parentElement;
    var w = Math.max(300, panel.clientWidth - 28);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = w + 'px';
    cv.style.height = cssH + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, cssH);
    draw(ctx, w, cssH);
  }

  function renderCharts() {
    drawChart('c-speed', 300, function (ctx, w, h) {
      C.speed(ctx, { x: 0, y: 0, w: w, h: h }, {
        main: state.res, ideal: state.ideal,
        thrustEndX: state.thrustEndX, thrustEndT: state.thrustEndT
      });
    });
    drawChart('c-energy', 200, function (ctx, w, h) {
      C.energy(ctx, { x: 0, y: 0, w: w, h: h }, {
        work: state.res.work, keTrans: state.res.keTrans, keWheel: state.res.keWheel
      });
    });
    drawChart('c-delta', 230, function (ctx, w, h) {
      C.delta(ctx, { x: 0, y: 0, w: w, h: h }, {
        rows: state.cmp.rows, totalMs: state.cmp.totalMs
      });
    });
    drawChart('c-lat', 200, function (ctx, w, h) {
      C.lateral(ctx, { x: 0, y: 0, w: w, h: h }, {
        curve: state.lat, currentD: state.params.d * 1000,
        currentLat: state.res.latDev, guideClear: P.GUIDE_CLEAR
      });
    });
  }

  function render() {
    compute();
    renderReadout();
    renderCharts();
  }

  /* ================= 1080×1920 导出 ================= */

  var PW = 1080, PH = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

  function posterStatus(ctx, x, y, w) {
    var r = state.res;
    var h = 44;
    if (r.inBandT) {
      ctx.strokeStyle = 'rgba(242,240,235,0.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // 迷你区间条
      var LO = 0.90, HI = 1.40;
      var bx = x + 14, bw = w - 28;
      var z0 = bx + (1.00 - LO) / (HI - LO) * bw;
      var z1 = bx + (1.25 - LO) / (HI - LO) * bw;
      ctx.fillStyle = 'rgba(242,240,235,0.12)';
      ctx.fillRect(z0, y + 12, z1 - z0, 8);
      var mx = bx + Math.min(1, Math.max(0, (r.t - LO) / (HI - LO))) * bw;
      ctx.fillStyle = '#F2F0EB';
      ctx.fillRect(mx - 1, y + 6, 2, 20);
      ctx.font = '400 11px ' + C.T.mono;
      ctx.fillStyle = 'rgba(242,240,235,0.55)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('落在 1.00\u20131.25 s 合理区间内', x + 14, y + h - 15);
      ctx.textAlign = 'right';
      ctx.fillText('1.00', z0, y + h - 15);
      ctx.fillText('1.25', z1, y + h - 15);
    } else {
      ctx.fillStyle = 'rgba(232,89,12,0.10)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#E8590C';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#E8590C';
      ctx.fillRect(x, y, 4, h);
      ctx.font = '600 12px ' + C.T.mono;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('\u26a0 模型超出合理区间', x + 16, y + 10);
      ctx.font = '400 11px ' + C.T.mono;
      ctx.fillStyle = 'rgba(242,240,235,0.7)';
      ctx.fillText(r.t.toFixed(3) + ' s 不落在 1.00\u20131.25 s 内 \u2014 先怀疑参数，不是车快', x + 16, y + 27);
    }
    return y + h;
  }

  function drawPoster(ctx) {
    var X0 = SAFE.x0, X1 = SAFE.x1, XW = X1 - X0;
    var r = state.res, cmp = state.cmp, p = state.params;

    function rule(y) {
      ctx.strokeStyle = 'rgba(242,240,235,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X0, y + 0.5); ctx.lineTo(X1, y + 0.5); ctx.stroke();
    }

    ctx.fillStyle = '#0B0B0C';
    ctx.fillRect(0, 0, PW, PH);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    /* 顶栏 */
    rule(240);
    ctx.font = '400 11px ' + C.T.mono;
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
    ctx.fillText('STEM RACING / LAP-TIME LAB', X0, 262);
    ctx.textAlign = 'right';
    ctx.fillText('赛道 20.000 m \u00b7 RK4 \u00b7 \u0394t 1.0 ms', X1, 262);

    ctx.textAlign = 'left';
    ctx.font = '600 40px ' + C.T.disp;
    ctx.fillStyle = '#F2F0EB';
    ctx.fillText('20 m 直线加速 \u00b7 成绩预测', X0, 306);

    ctx.font = '400 12px ' + C.T.body;
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
    ctx.fillText('推力按衰减曲线逐毫秒积分 \u00b7 常数的可信度标在下方', X0, 330);
    rule(346);

    /* 主读数 —— 画面的绝对重心 */
    ctx.font = '400 11px ' + C.T.mono;
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
    ctx.fillText('模型预测成绩', X0, 366);

    var HERO = 168;
    var txt = r.t.toFixed(3);
    ctx.font = '500 ' + HERO + 'px ' + C.T.mono;
    ctx.fillStyle = '#F2F0EB';
    ctx.fillText(txt, X0 - 4, 502);
    var nw = ctx.measureText(txt).width;
    ctx.font = '400 44px ' + C.T.mono;
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
    ctx.fillText('s', X0 + nw + 8, 502);

    /* 右侧次要读数 */
    var rows = [
      ['末速度', r.v.toFixed(2), 'm/s'],
      ['峰值推力', r.fp.toFixed(1), 'N'],
      ['峰值加速度', (r.aMax / 9.81).toFixed(1), 'g']
    ];
    rows.forEach(function (q, i) {
      var y = 404 + i * 34;
      ctx.textAlign = 'left';
      ctx.font = '400 11px ' + C.T.mono;
      ctx.fillStyle = 'rgba(242,240,235,0.45)';
      ctx.fillText(q[0], X1 - 200, y);
      ctx.textAlign = 'right';
      ctx.font = '500 17px ' + C.T.mono;
      ctx.fillStyle = '#F2F0EB';
      ctx.fillText(q[1] + ' ' + q[2], X1, y);
    });
    ctx.textAlign = 'left';

    /* 区间状态 */
    posterStatus(ctx, X0, 520, XW);

    /* 四张图，铺满安全区 */
    var b1 = { x: X0, y: 584, w: XW, h: 300 };
    C.speed(ctx, b1, {
      main: r, ideal: state.ideal,
      thrustEndX: state.thrustEndX, thrustEndT: state.thrustEndT
    });
    var b2 = { x: X0, y: 896, w: XW, h: 146 };
    C.energy(ctx, b2, { work: r.work, keTrans: r.keTrans, keWheel: r.keWheel });
    var b3 = { x: X0, y: 1054, w: XW, h: 200 };
    C.delta(ctx, b3, { rows: cmp.rows, totalMs: cmp.totalMs });
    var b4 = { x: X0, y: 1266, w: XW, h: 170 };
    C.lateral(ctx, b4, {
      curve: state.lat, currentD: p.d * 1000,
      currentLat: r.latDev, guideClear: P.GUIDE_CLEAR
    });

    /* 参数快照 */
    ctx.font = '400 11px ' + C.T.mono;
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText(
      'm ' + (p.m * 1000).toFixed(1) + ' g   \u00b7   CdA ' + (p.CdA * 1e4).toFixed(1) +
      ' cm\u00b2   \u00b7   Crr ' + p.Crr.toFixed(4) + '   \u00b7   J ' + p.J.toFixed(2) +
      ' N\u00b7s   \u00b7   r_w ' + (p.rw * 1000).toFixed(1) + ' mm   \u00b7   d ' +
      (p.d * 1000).toFixed(2) + ' mm', X0, 1458);

    rule(1472);
  }

  /* 粒子噪点：确定性哈希，只落在暗背景上，给纯黑加纸感、也保证 PNG 有真实体积 */
  function grain(ctx) {
    var img = ctx.getImageData(0, 0, PW, PH);
    var d = img.data;
    for (var y = 0; y < PH; y++) {
      for (var x = 0; x < PW; x++) {
        var i = (y * PW + x) * 4;
        if (Math.max(d[i], d[i + 1], d[i + 2]) > 44) continue;
        var h = (x * 374761393 + y * 668265263) | 0;
        h = (h ^ (h >>> 13)) | 0;
        h = Math.imul(h, 1274126177) | 0;
        if (((h ^ (h >>> 16)) & 7) !== 0) continue;
        d[i] += 4; d[i + 1] += 4; d[i + 2] += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  var posterCanvas = null;
  function composePoster() {
    if (!posterCanvas) {
      posterCanvas = document.createElement('canvas');
      posterCanvas.width = PW;
      posterCanvas.height = PH;
    }
    var ctx = posterCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, PW, PH);
    drawPoster(ctx);
    grain(ctx);
    return posterCanvas;
  }

  function posterBlob() {
    return new Promise(function (resolve, reject) {
      composePoster().toBlob(function (b) {
        if (b) resolve(b); else reject(new Error('toBlob 返回空'));
      }, 'image/png');
    });
  }

  function download(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'lap-time-lab-1080x1920.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* ================= 对外接口（门禁用） ================= */

  window.__lab = {
    ready: false,
    selfTest: function () { return P.selfTest(); },
    state: function () {
      return {
        params: JSON.parse(JSON.stringify(state.params)),
        time: state.res.t,
        vEnd: state.res.v,
        vMax: state.res.vmax,
        aMax: state.res.aMax,
        inBand: state.res.inBand,
        inBandV: state.res.inBandV,
        latDev: state.res.latDev,
        totalMs: state.cmp.totalMs,
        baseT: state.cmp.baseT,
        steps: state.res.trace.vs.length
      };
    },
    setParam: function (k, displayValue) {
      var d = P.PARAMS[k];
      var input = document.querySelector('[data-input="' + k + '"]');
      if (input) input.value = String(displayValue);
      state.params[k] = displayValue * d.scale;
      var out = document.querySelector('[data-role="val"][data-key="' + k + '"]');
      if (out) out.textContent = Number(displayValue).toFixed(decOf(d.step));
      render();
    },
    reset: function () {
      state.params = P.defaultParams();
      Object.keys(P.PARAMS).forEach(function (k) {
        var input = document.querySelector('[data-input="' + k + '"]');
        if (input) input.value = String(P.PARAMS[k].def);
        var out = document.querySelector('[data-role="val"][data-key="' + k + '"]');
        if (out) out.textContent = P.PARAMS[k].def.toFixed(decOf(P.PARAMS[k].step));
      });
      render();
    },
    render: render,
    exportPng: function () { return posterBlob(); },
    exportPngDataURL: function () { return composePoster().toDataURL('image/png'); },
    constants: P.CONSTS,
    params: P.PARAMS
  };

  /* ================= 启动 ================= */

  buildControls();
  buildConsts();
  buildStats();
  render();

  $('btn-reset').addEventListener('click', function () { window.__lab.reset(); });
  $('btn-export').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = '渲染中\u2026';
    posterBlob().then(function (b) {
      download(b);
      btn.textContent = '已导出 ' + Math.round(b.size / 1024) + ' KB';
      setTimeout(function () { btn.textContent = label; btn.disabled = false; }, 2200);
    }).catch(function (e) {
      btn.textContent = '导出失败';
      btn.disabled = false;
      console.error(e);
    });
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(renderCharts, 80);
  });

  window.__lab.ready = true;
})();
