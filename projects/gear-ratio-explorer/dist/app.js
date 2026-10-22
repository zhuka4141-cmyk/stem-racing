(() => {
  // src/reel-export.js
  var REEL_W = 1080;
  var REEL_H = 1920;
  var COVER_W = 1080;
  var COVER_H = 1350;
  function resample(src, outW, outH) {
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx2 = c.getContext("2d");
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    const sw = src.width, sh = src.height;
    const scale2 = Math.max(outW / sw, outH / sh);
    const dw = sw * scale2, dh = sh * scale2;
    ctx2.drawImage(src, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
    return c;
  }
  async function toPNG(canvas, { width = REEL_W, height = REEL_H, quality } = {}) {
    const out = resample(canvas, width, height);
    const blob = await new Promise((r) => out.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob returned null");
    if (blob.size < 4096) throw new Error(`PNG \u8FC7\u5C0F\uFF08${blob.size} B\uFF09\uFF0C\u753B\u5E03\u53EF\u80FD\u662F\u7A7A\u7684`);
    return blob;
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function assertPNG(blob) {
    const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const magic = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (b[i] !== magic[i]) throw new Error("\u4E0D\u662F\u5408\u6CD5 PNG");
    return true;
  }
  async function exportEpisode(canvas, slug, coverCanvas = canvas) {
    const vertical = await toPNG(canvas, { width: REEL_W, height: REEL_H });
    await assertPNG(vertical);
    download(vertical, `${slug}-1080x1920.png`);
    const cover = await toPNG(coverCanvas, { width: COVER_W, height: COVER_H });
    await assertPNG(cover);
    download(cover, `${slug}-1080x1350.png`);
    return { vertical: vertical.size, cover: cover.size };
  }

  // src/plot.js
  var CHART = {
    ink: "#0b0b0c",
    paper: "#f2f0eb",
    accent: "#e8590c",
    grid: "rgba(242,240,235,0.10)",
    gridMajor: "rgba(242,240,235,0.20)",
    axis: "rgba(242,240,235,0.38)",
    label: "rgba(242,240,235,0.55)",
    mono: '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace',
    sans: '"IBM Plex Sans","Noto Sans SC","Microsoft YaHei",sans-serif'
  };
  function scale(box, domain) {
    const { x0, x1, y0, y1 } = domain;
    const dx = x1 - x0 || 1;
    const dy = y1 - y0 || 1;
    return {
      sx: (v) => box.x + (v - x0) / dx * box.w,
      sy: (v) => box.y + box.h - (v - y0) / dy * box.h,
      domain,
      box
    };
  }
  function niceStep(range, target = 5) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
    return step * mag;
  }
  function line(ctx2, s, points, { color = CHART.accent, width = 3, dashed = false, glow = false } = {}) {
    if (!points.length) return;
    ctx2.save();
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineJoin = "round";
    ctx2.lineCap = "round";
    if (dashed) ctx2.setLineDash([10, 10]);
    if (glow) {
      ctx2.shadowColor = color;
      ctx2.shadowBlur = 12;
    }
    ctx2.beginPath();
    pts(ctx2, s, points);
    ctx2.stroke();
    ctx2.restore();
  }
  function area(ctx2, s, points, { color = "rgba(232,89,12,0.16)", base = 0 } = {}) {
    if (points.length < 2) return;
    ctx2.save();
    ctx2.fillStyle = color;
    ctx2.beginPath();
    points.forEach(([x, y], i) => {
      const px = s.sx(x), py = s.sy(y);
      i ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py);
    });
    ctx2.lineTo(s.sx(points[points.length - 1][0]), s.sy(base));
    ctx2.lineTo(s.sx(points[0][0]), s.sy(base));
    ctx2.closePath();
    ctx2.fill();
    ctx2.restore();
  }
  function fmtNum(v, digits = 2) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(1) + "k";
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(digits).replace(/\.?0+$/, "");
    return v.toFixed(digits + 1);
  }
  function pts(ctx2, s, points) {
    points.forEach(([x, y], i) => {
      const px = s.sx(x), py = s.sy(y);
      i ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py);
    });
  }

  // src/main.js
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var MONO = CHART.mono;
  var DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
  var ACCENT = CHART.accent;
  var INK = CHART.ink;
  var PAPER = CHART.paper;
  var RHO = 1.204;
  var G = 9.81;
  var DIST = 20;
  var MASS = 0.065;
  var CD0 = 0.34;
  var AREA = 16e-4;
  var CRR = 8e-3;
  var WHEEL_I = 45e-8;
  var WHEEL_R = 0.011;
  var N_WHEEL = 4;
  var F_PEAK_REF = 21;
  var T_BURN_REF = 0.11;
  var V_CEIL_REF = 26;
  var MEFF = MASS + N_WHEEL * WHEEL_I / (WHEEL_R * WHEEL_R);
  var IMPULSE = 2 * F_PEAK_REF * T_BURN_REF / Math.PI;
  var I_MIN = 0.2;
  var I_MAX = 3;
  var I_DEF = 1;
  function paramsAt(i) {
    return {
      i,
      fPeak: F_PEAK_REF * i,
      tBurn: T_BURN_REF / i,
      vCeil: V_CEIL_REF / i,
      impulse: IMPULSE
    };
  }
  function thrust(t, v, p) {
    if (t >= p.tBurn || v >= p.vCeil) return 0;
    return p.fPeak * Math.sin(Math.PI * t / p.tBurn);
  }
  function dragF(v) {
    return 0.5 * RHO * CD0 * AREA * v * v;
  }
  function rollF() {
    return CRR * MASS * G;
  }
  function run(i, { dt = 1 / 8e3, maxT = 8, traceN = 220 } = {}) {
    const p = paramsAt(i);
    const fr = rollF();
    let t = 0, x = 0, v = 0;
    let peakA = 0, peakAat = 0, peakV = 0, peakVat = 0;
    const trace = [];
    const every = Math.max(1, Math.round(4e-3 / dt));
    let done = false;
    for (let s = 0; s < 4e7 && !done && t < maxT; s++) {
      const ft = thrust(t, v, p);
      const fd = dragF(v);
      const a = (ft - fd - fr) / MEFF;
      if (a > peakA) {
        peakA = a;
        peakAat = t;
      }
      if (v > peakV) {
        peakV = v;
        peakVat = t;
      }
      if (s % every === 0) trace.push([t, v, x]);
      let vN = v + a * dt;
      if (vN < 0) vN = 0;
      const xN = x + vN * dt;
      if (xN >= DIST) {
        const f = (DIST - x) / (xN - x);
        t = t + dt * f;
        v = v + (vN - v) * f;
        x = DIST;
        done = true;
      } else {
        v = vN;
        x = xN;
        t += dt;
      }
    }
    trace.push([t, v, x]);
    let out = trace;
    if (trace.length > traceN) {
      const step = trace.length / traceN;
      out = [];
      for (let k = 0; k < traceN; k++) out.push(trace[Math.floor(k * step)]);
      out.push(trace[trace.length - 1]);
    }
    return {
      p,
      t,
      x,
      v,
      peakA,
      peakAat,
      peakV,
      peakVat,
      trace: out,
      hitCeil: peakV >= p.vCeil - 1e-6
    };
  }
  var SWEEP_N = 57;
  var SWEEP = [];
  for (let k = 0; k < SWEEP_N; k++) {
    const i = I_MIN + (I_MAX - I_MIN) * k / (SWEEP_N - 1);
    const r = run(i, { dt: 1 / 12e3, traceN: 2 });
    SWEEP.push({ i, t: r.t, v: r.v, peakA: r.peakA, ceil: r.hitCeil });
  }
  var BEST = SWEEP[0];
  for (const s of SWEEP) if (s.t < BEST.t) BEST = s;
  var clipIdx = SWEEP.findIndex((s) => s.ceil);
  var CLIP_I = clipIdx < 0 ? I_MAX : SWEEP[clipIdx].i;
  var BAND_TOL = 1.02;
  var inBand = SWEEP.filter((s) => s.t <= BEST.t * BAND_TOL);
  var BAND = {
    lo: inBand[0].i,
    hi: inBand[inBand.length - 1].i,
    tBest: BEST.t,
    iBest: BEST.i,
    vBest: BEST.v
  };
  var GHOSTS = [0.3, 0.5, 0.8, 1.6, 2.4];
  var GHOST_RUNS = GHOSTS.map((gi) => ({ i: gi, r: run(gi, { dt: 1 / 3e3, traceN: 110 }) }));
  var GHOST_VMAX = Math.max(...GHOST_RUNS.map((g) => g.r.peakV));
  var GHOST_TMAX = Math.max(...GHOST_RUNS.map((g) => g.r.t));
  var state = { i: I_DEF };
  var R = run(state.i);
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var X0 = 176;
  var XW = 700;
  var C1 = { x: X0, y: 548, w: XW, h: 200 };
  var C2 = { x: X0, y: 802, w: XW, h: 150 };
  var C3 = { x: X0, y: 1012, w: XW, h: 150 };
  var I_DOM = { x0: I_MIN, x1: I_MAX };
  var X_AXIS_Y = C3.y + C3.h;
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawHeader();
    drawCurve();
    drawTimeTradeoff();
    drawSpeedTradeoff();
    drawReadouts();
    drawVerdict();
    drawBrand();
  }
  function drawHeader() {
    ctx.save();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, 296, 46, 3);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 17px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("GEAR RATIO \xB7 WHAT-IF", SAFE.x0, 330);
    ctx.fillStyle = PAPER;
    ctx.font = `600 56px ${DISP}`;
    ctx.letterSpacing = "1px";
    ctx.fillText("\u9F7F\u6BD4\u518D\u5927\u4E00\u70B9\uFF0C\u771F\u7684\u66F4\u5FEB\u5417", SAFE.x0, 402);
    ctx.fillStyle = "rgba(242,240,235,0.55)";
    ctx.font = `500 20px ${MONO}`;
    ctx.letterSpacing = "0px";
    ctx.fillText("\u540C\u4E00\u4EFD\u51B2\u91CF\u6362\u4E2A\u653E\u6CD5\uFF1A\u6362\u66F4\u5927\u7684\u529B\uFF0C\u8FD8\u662F\u6362\u66F4\u957F\u7684\u65F6\u95F4", SAFE.x0, 448);
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 486, SAFE.x1 - SAFE.x0, 1);
    ctx.restore();
  }
  function tag(y, left, right) {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(left, SAFE.x0, y);
    if (right) {
      ctx.letterSpacing = "0px";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(242,240,235,0.32)";
      ctx.fillText(right, SAFE.x1, y);
    }
    ctx.restore();
  }
  function gridY(box, dom, yTicks = 4) {
    const s = scale(box, dom);
    const ys = niceStep(dom.y1 - dom.y0, yTicks);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = Math.ceil(dom.y0 / ys) * ys; v <= dom.y1 + ys * 1e-6; v += ys) {
      const y = Math.round(s.sy(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < ys * 1e-6 ? CHART.gridMajor : CHART.grid;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      ctx.fillStyle = CHART.label;
      ctx.fillText(fmtNum(v), box.x - 10, y);
    }
    ctx.strokeStyle = CHART.axis;
    ctx.beginPath();
    ctx.moveTo(box.x + 0.5, box.y);
    ctx.lineTo(box.x + 0.5, box.y + box.h);
    ctx.stroke();
    ctx.restore();
    return s;
  }
  function drawCurve() {
    tag(524, "\u2460 \u901F\u5EA6\u66F2\u7EBF v(t)", "\u51B2\u91CF\u56FA\u5B9A " + IMPULSE.toFixed(2) + " N\xB7s");
    const dom = {
      x0: 0,
      x1: Math.max(0.6, Math.ceil(R.t * 1.06 * 10) / 10),
      y0: 0,
      y1: Math.ceil(GHOST_VMAX * 1.05 / 2) * 2
    };
    const s = gridY(C1, dom, 4);
    ctx.save();
    const xs = niceStep(dom.x1, 6);
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let v = 0; v <= dom.x1 + 1e-9; v += xs) {
      const px = Math.round(s.sx(v)) + 0.5;
      ctx.strokeStyle = CHART.grid;
      ctx.beginPath();
      ctx.moveTo(px, C1.y);
      ctx.lineTo(px, C1.y + C1.h);
      ctx.stroke();
      ctx.fillStyle = CHART.label;
      ctx.fillText(v.toFixed(1), px, C1.y + C1.h + 8);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.42)";
    ctx.fillText("t / s", C1.x + C1.w, C1.y + C1.h + 30);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(C1.x, C1.y, C1.w, C1.h);
    ctx.clip();
    for (const g of GHOST_RUNS) {
      line(ctx, s, g.r.trace.map((p) => [p[0], p[1]]), { color: "rgba(242,240,235,0.26)", width: 2 });
    }
    const pts2 = R.trace.map((p) => [p[0], p[1]]);
    area(ctx, s, pts2, { color: "rgba(232,89,12,0.13)", base: 0 });
    line(ctx, s, pts2, { color: ACCENT, width: 3 });
    ctx.restore();
    if (R.p.vCeil < dom.y1) {
      ctx.save();
      ctx.strokeStyle = "rgba(232,89,12,0.6)";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      const yy = Math.round(s.sy(R.p.vCeil)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(C1.x, yy);
      ctx.lineTo(C1.x + C1.w, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(232,89,12,0.85)";
      ctx.font = `500 13px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("\u8F66\u8F6E\u901F\u5EA6\u4E0A\u9650 " + R.p.vCeil.toFixed(1) + " m/s", C1.x + 6, yy - 4);
      ctx.restore();
    }
    const last = R.trace[R.trace.length - 1];
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.fillRect(s.sx(last[0]) - 6, s.sy(last[1]) - 6, 12, 12);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(s.sx(last[0]) - 3, s.sy(last[1]) - 3, 6, 6);
    ctx.restore();
    ctx.save();
    ctx.font = `500 13px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(242,240,235,0.38)";
    ctx.fillText("\u7070\u7EBF = i = " + GHOSTS.join(" / ") + "  \u6A59\u8272 = \u5F53\u524D", SAFE.x0, C1.y + C1.h + 50);
    ctx.restore();
  }
  function shadeClip(box, s, label) {
    if (CLIP_I >= I_MAX) return;
    const x0 = s.sx(CLIP_I);
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.05)";
    ctx.fillRect(x0, box.y, box.x + box.w - x0, box.h);
    ctx.strokeStyle = "rgba(242,240,235,0.30)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x0) + 0.5, box.y);
    ctx.lineTo(Math.round(x0) + 0.5, box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.fillStyle = "rgba(242,240,235,0.42)";
      ctx.font = `500 12px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("\u901F\u5EA6\u4E0A\u9650\u751F\u6548 i > " + CLIP_I.toFixed(2), x0 + 8, box.y + 5);
    }
    ctx.restore();
  }
  function drawTimeTradeoff() {
    tag(786, "\u2461 \u5B8C\u8D5B\u65F6\u95F4 t(i) \xB7 \u8D8A\u4F4E\u8D8A\u597D", "\u6700\u4F18 i* = " + BEST.i.toFixed(2) + " \xB7 " + BEST.t.toFixed(3) + " s");
    const tMax = SWEEP[SWEEP.length - 1].t;
    const dom = { ...I_DOM, y0: 1.1, y1: Math.ceil(tMax * 1.06 * 10) / 10 };
    const s = gridY(C2, dom, 3);
    shadeClip(C2, s, false);
    ctx.save();
    ctx.fillStyle = "rgba(232,89,12,0.10)";
    ctx.fillRect(s.sx(BAND.lo), C2.y, s.sx(BAND.hi) - s.sx(BAND.lo), C2.h);
    ctx.strokeStyle = "rgba(232,89,12,0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(Math.round(s.sx(BAND.lo)) + 0.5, C2.y);
    ctx.lineTo(Math.round(s.sx(BAND.lo)) + 0.5, C2.y + C2.h);
    ctx.moveTo(Math.round(s.sx(BAND.hi)) + 0.5, C2.y);
    ctx.lineTo(Math.round(s.sx(BAND.hi)) + 0.5, C2.y + C2.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    const pts2 = SWEEP.map((p) => [p.i, p.t]);
    area(ctx, s, pts2, { color: "rgba(242,240,235,0.07)", base: dom.y0 });
    line(ctx, s, pts2, { color: "rgba(242,240,235,0.70)", width: 2 });
    const cx = s.sx(state.i), cy = s.sy(R.t);
    ctx.save();
    ctx.strokeStyle = "rgba(242,240,235,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx) + 0.5, C2.y);
    ctx.lineTo(Math.round(cx) + 0.5, C2.y + C2.h);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(cx - 6, cy - 6, 12, 12);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(232,89,12,0.85)";
    ctx.font = `500 13px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("\u63A8\u8350 " + BAND.lo.toFixed(2) + "\u2013" + BAND.hi.toFixed(2), s.sx((BAND.lo + BAND.hi) / 2), C2.y + 6);
    ctx.restore();
  }
  function drawSpeedTradeoff() {
    tag(996, "\u2462 \u5230\u5934\u901F\u5EA6 v_exit(i) \xB7 \u8D8A\u9AD8\u8D8A\u597D", "i \u8D8A\u5927\u6389\u5F97\u8D8A\u5FEB");
    const vTop = Math.max(...SWEEP.map((s2) => s2.v));
    const dom = { ...I_DOM, y0: 0, y1: Math.ceil(vTop * 1.12 / 4) * 4 };
    const s = gridY(C3, dom, 3);
    shadeClip(C3, s, true);
    ctx.save();
    ctx.fillStyle = "rgba(232,89,12,0.10)";
    ctx.fillRect(s.sx(BAND.lo), C3.y, s.sx(BAND.hi) - s.sx(BAND.lo), C3.h);
    ctx.restore();
    const pts2 = SWEEP.map((p) => [p.i, p.v]);
    area(ctx, s, pts2, { color: "rgba(242,240,235,0.06)", base: 0 });
    line(ctx, s, pts2, { color: "rgba(242,240,235,0.70)", width: 2 });
    ctx.save();
    ctx.strokeStyle = CHART.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(C3.x, X_AXIS_Y + 0.5);
    ctx.lineTo(C3.x + C3.w, X_AXIS_Y + 0.5);
    ctx.stroke();
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let k = 0; k <= 28; k++) {
      const v = 0.2 + k * 0.1;
      const px = Math.round(s.sx(v)) + 0.5;
      ctx.fillStyle = CHART.axis;
      ctx.fillRect(px, X_AXIS_Y, 1, k % 4 === 0 ? 6 : 3);
      if (k % 4 === 0) {
        ctx.fillStyle = CHART.label;
        ctx.fillText(v.toFixed(1), px, X_AXIS_Y + 10);
      }
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.45)";
    ctx.fillText("\u7B49\u6548\u4F20\u52A8\u6BD4 i", C3.x + C3.w, X_AXIS_Y + 32);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(s.sx(state.i) - 6, s.sy(R.v) - 6, 12, 12);
    ctx.restore();
  }
  function drawReadouts() {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 1200, SAFE.x1 - SAFE.x0, 1);
    ctx.restore();
    tag(1226, "\u5F53\u524D\u4F20\u52A8\u6BD4", R.hitCeil ? "\u5DF2\u649E\u4E0A\u901F\u5EA6\u4E0A\u9650" : "\u672A\u649E\u4E0A\u9650");
    const cells = [
      ["i", state.i.toFixed(2), "\u7B49\u6548\u4F20\u52A8\u6BD4", PAPER],
      ["t", R.t.toFixed(3), "s \xB7 \u8DD1\u5B8C 20 m", PAPER],
      ["v_exit", R.v.toFixed(1), "m/s \xB7 \u51B2\u5230", ACCENT],
      ["a_max", (R.peakA / G).toFixed(0), "g \xB7 \u8D77\u6B65", PAPER]
    ];
    const colW = (SAFE.x1 - SAFE.x0) / 4;
    cells.forEach(([k, val, unit, color], idx) => {
      const cx = SAFE.x0 + idx * colW;
      ctx.save();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(242,240,235,0.38)";
      ctx.font = `500 13px ${MONO}`;
      ctx.fillText(k, cx, 1256);
      ctx.fillStyle = color;
      ctx.font = `600 38px ${MONO}`;
      ctx.fillText(val, cx, 1296);
      ctx.fillStyle = "rgba(242,240,235,0.38)";
      ctx.font = `500 13px ${MONO}`;
      ctx.fillText(unit, cx, 1318);
      ctx.restore();
    });
  }
  function drawVerdict() {
    const y = 1344;
    const inside = state.i >= BAND.lo && state.i <= BAND.hi;
    ctx.save();
    if (inside) {
      ctx.strokeStyle = "rgba(232,89,12,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(SAFE.x0 + 0.5, y + 0.5, SAFE.x1 - SAFE.x0 - 1, 75.5);
    } else {
      ctx.fillStyle = "rgba(242,240,235,0.055)";
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 76);
    }
    ctx.fillStyle = inside ? PAPER : "rgba(242,240,235,0.62)";
    ctx.font = `500 13px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(inside ? "\u5728\u63A8\u8350\u5E26\u5185" : "\u504F\u79BB\u63A8\u8350\u5E26", SAFE.x0 + 20, y + 26);
    ctx.letterSpacing = "0px";
    ctx.font = `600 27px ${MONO}`;
    const dt = (R.t - BAND.tBest) * 1e3;
    ctx.fillText(
      "\u6BD4\u6700\u4F18\u70B9\u6162 " + Math.abs(dt).toFixed(0) + " ms \xB7 \u5230\u5934\u901F\u5EA6\u5C11 " + Math.max(0, BAND.vBest - R.v).toFixed(2) + " m/s",
      SAFE.x0 + 20,
      y + 60
    );
    ctx.textAlign = "right";
    ctx.font = `500 14px ${MONO}`;
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.fillText("\u63A8\u8350 i = " + BAND.lo.toFixed(2) + " \u2013 " + BAND.hi.toFixed(2), SAFE.x1 - 20, y + 26);
    ctx.fillText("i < " + BAND.lo.toFixed(2) + " \u8D77\u6B65\u592A\u8F6F \xB7 i > " + BAND.hi.toFixed(2) + " \u649E\u4E0A\u9650", SAFE.x1 - 20, y + 60);
    ctx.restore();
  }
  function drawBrand() {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 1470, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("STEM RACING \xB7 EP.05", SAFE.x0, 1496);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.3)";
    ctx.letterSpacing = "0px";
    ctx.fillText("\u771F\u8F66\u6CA1\u6709\u53D8\u901F\u5668 \xB7 \u7EAF\u5047\u8BBE \xB7 V_CEIL 26 m/s [VERIFY]", SAFE.x1, 1496);
    ctx.restore();
  }
  var slider = document.getElementById("ratio");
  var ratioOut = document.getElementById("ratioOut");
  function setI(v) {
    state.i = Math.min(I_MAX, Math.max(I_MIN, v));
    R = run(state.i);
    if (slider) slider.value = String(state.i);
    if (ratioOut) ratioOut.textContent = state.i.toFixed(2);
    compose();
  }
  if (slider) slider.addEventListener("input", () => setI(parseFloat(slider.value)));
  setI(I_DEF);
  var exportBtn = document.getElementById("export");
  if (exportBtn) exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "\u5BFC\u51FA\u4E2D\u2026";
    try {
      compose();
      await new Promise((r) => setTimeout(r, 60));
      await window.__app.downloadAll();
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "\u5BFC\u51FA 9:16";
    }
  });
  var bestBtn = document.getElementById("best");
  if (bestBtn) bestBtn.addEventListener("click", () => setI(BEST.i));
  window.__app = {
    canvas: stage,
    params: { MASS, CD0, AREA, CRR, MEFF, IMPULSE, F_PEAK_REF, T_BURN_REF, V_CEIL_REF, I_MIN, I_MAX },
    run: (i) => {
      const r = run(i, { traceN: 20 });
      return {
        i,
        t: r.t,
        x: r.x,
        v: r.v,
        peakA: r.peakA,
        peakAat: r.peakAat,
        peakV: r.peakV,
        hitCeil: r.hitCeil,
        vCeil: r.p.vCeil,
        fPeak: r.p.fPeak,
        tBurn: r.p.tBurn
      };
    },
    sweep: () => SWEEP.map((s) => ({ ...s })),
    band: () => ({ ...BAND }),
    setI: (v) => {
      setI(v);
      return { i: state.i, t: R.t, v: R.v, peakA: R.peakA, hitCeil: R.hitCeil };
    },
    getMetrics: () => ({
      i: state.i,
      t: R.t,
      x: R.x,
      v: R.v,
      peakA: R.peakA,
      peakAat: R.peakAat,
      peakV: R.peakV,
      vCeil: R.p.vCeil,
      fPeak: R.p.fPeak,
      tBurn: R.p.tBurn,
      impulse: R.p.impulse,
      hitCeil: R.hitCeil,
      meff: MEFF,
      clipI: CLIP_I,
      band: { ...BAND },
      sweepN: SWEEP.length
    }),
    selfTest: () => {
      const errs = [];
      const base = run(1, { traceN: 20 });
      if (Math.abs(base.t - 1.1885) > 4e-3) errs.push("i=1 \u5B8C\u8D5B\u65F6\u95F4\u504F\u79BB\u57FA\u7EBF\uFF1A" + base.t.toFixed(4));
      if (Math.abs(base.v - 16.906) > 0.06) errs.push("i=1 \u672B\u901F\u504F\u79BB\u57FA\u7EBF\uFF1A" + base.v.toFixed(3));
      if (Math.abs(base.x - DIST) > 0.05) errs.push("i=1 \u4F4D\u79FB\u7EC8\u70B9\u504F\u79BB 20 m");
      for (const i of [0.4, 1, 2.5]) {
        const p = paramsAt(i);
        const imp = 2 * p.fPeak * p.tBurn / Math.PI;
        if (Math.abs(imp - IMPULSE) > 1e-9) errs.push("i=" + i + " \u7684\u51B2\u91CF\u4E0D\u5B88\u6052");
      }
      for (let k = 1; k < SWEEP.length; k++) {
        if (SWEEP[k].v > SWEEP[k - 1].v + 1e-6) {
          errs.push("\u5230\u5934\u901F\u5EA6\u4E0D\u968F i \u5355\u8C03\u4E0B\u964D\uFF0C\u65AD\u5728 i=" + SWEEP[k].i.toFixed(2));
          break;
        }
      }
      const bi = SWEEP.indexOf(BEST);
      if (bi <= 0 || bi >= SWEEP.length - 1) errs.push("\u6700\u4F18\u70B9\u843D\u5728\u5B9A\u4E49\u57DF\u8FB9\u754C\uFF0C\u8BF4\u660E\u6CA1\u6709 U \u5F62");
      for (let k = 1; k <= bi; k++) if (SWEEP[k].t >= SWEEP[k - 1].t) {
        errs.push("\u6700\u4F18\u70B9\u5DE6\u4FA7\u65F6\u95F4\u4E0D\u5355\u8C03\u4E0B\u964D");
        break;
      }
      for (let k = bi + 1; k < SWEEP.length; k++) if (SWEEP[k].t <= SWEEP[k - 1].t) {
        errs.push("\u6700\u4F18\u70B9\u53F3\u4FA7\u65F6\u95F4\u4E0D\u5355\u8C03\u4E0A\u5347");
        break;
      }
      const ci = SWEEP.findIndex((s) => s.ceil);
      if (ci < 0) errs.push("\u6574\u4E2A\u5B9A\u4E49\u57DF\u90FD\u6CA1\u649E\u4E0A\u9650\uFF0C\u6A21\u578B\u6CA1\u8D77\u4F5C\u7528");
      else {
        for (let k = 1; k < ci; k++) {
          if (SWEEP[k].t >= SWEEP[k - 1].t) {
            errs.push("\u672A\u9876\u4E0A\u9650\u533A\u95F4\u65F6\u95F4\u4E0D\u968F i \u4E0B\u964D\uFF0C\u65AD\u5728 " + SWEEP[k].i.toFixed(2));
            break;
          }
        }
        for (let k = ci + 1; k < SWEEP.length; k++) {
          if (SWEEP[k].t <= SWEEP[k - 1].t) {
            errs.push("\u9876\u4E0A\u9650\u533A\u95F4\u65F6\u95F4\u4E0D\u968F i \u4E0A\u5347\uFF0C\u65AD\u5728 " + SWEEP[k].i.toFixed(2));
            break;
          }
        }
      }
      if (!(BAND.lo <= BAND.iBest && BAND.iBest <= BAND.hi)) errs.push("\u63A8\u8350\u5E26\u6CA1\u6709\u5305\u4F4F\u6700\u4F18\u70B9");
      if (BAND.vBest < 16.5) errs.push("\u6700\u4F18\u70B9\u5230\u5934\u901F\u5EA6\u504F\u4F4E\uFF1A" + BAND.vBest.toFixed(2));
      if (!run(3, { traceN: 10 }).hitCeil) errs.push("i=3 \u6CA1\u6709\u649E\u4E0A\u901F\u5EA6\u4E0A\u9650\uFF0C\u6A21\u578B\u6CA1\u8D77\u4F5C\u7528");
      if (run(0.3, { traceN: 10 }).hitCeil) errs.push("i=0.3 \u4E0D\u8BE5\u649E\u4E0A\u9650");
      if (Math.abs(MEFF * 1e3 - 79.88) > 0.05) errs.push("\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u4E0D\u5BF9\uFF1A" + (MEFF * 1e3).toFixed(2));
      return { ok: errs.length === 0, errs };
    },
    exportPNG: async () => {
      compose();
      const b = await toPNG(stage, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      compose();
      const b = await toPNG(stage, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(stage, "gear-ratio-explorer")
  };
})();
