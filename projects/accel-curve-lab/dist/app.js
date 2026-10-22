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
  function frame(ctx2, box, domain, opts = {}) {
    const s = scale(box, domain);
    const xf = opts.xFmt || ((v) => fmtNum(v));
    const yf = opts.yFmt || ((v) => fmtNum(v));
    const xs = niceStep(domain.x1 - domain.x0, opts.xTicks || 5);
    const ys = niceStep(domain.y1 - domain.y0, opts.yTicks || 5);
    ctx2.save();
    ctx2.lineWidth = 1;
    ctx2.font = `500 15px ${CHART.mono}`;
    ctx2.letterSpacing = "0px";
    ctx2.textAlign = "right";
    ctx2.textBaseline = "middle";
    const yStart = Math.ceil(domain.y0 / ys) * ys;
    for (let v = yStart; v <= domain.y1 + ys * 1e-6; v += ys) {
      const y = Math.round(s.sy(v)) + 0.5;
      const major = Math.abs(v) < ys * 1e-6;
      ctx2.strokeStyle = major ? CHART.gridMajor : CHART.grid;
      ctx2.beginPath();
      ctx2.moveTo(box.x, y);
      ctx2.lineTo(box.x + box.w, y);
      ctx2.stroke();
      ctx2.fillStyle = CHART.label;
      ctx2.fillText(yf(v), box.x - 10, y);
    }
    ctx2.textAlign = "center";
    ctx2.textBaseline = "top";
    const xStart = Math.ceil(domain.x0 / xs) * xs;
    for (let v = xStart; v <= domain.x1 + xs * 1e-6; v += xs) {
      const x = Math.round(s.sx(v)) + 0.5;
      ctx2.strokeStyle = CHART.grid;
      ctx2.beginPath();
      ctx2.moveTo(x, box.y);
      ctx2.lineTo(x, box.y + box.h);
      ctx2.stroke();
      ctx2.fillStyle = CHART.label;
      ctx2.fillText(xf(v), x, box.y + box.h + 10);
    }
    ctx2.strokeStyle = CHART.axis;
    ctx2.beginPath();
    ctx2.moveTo(box.x, box.y + box.h + 0.5);
    ctx2.lineTo(box.x + box.w, box.y + box.h + 0.5);
    ctx2.moveTo(box.x + 0.5, box.y);
    ctx2.lineTo(box.x + 0.5, box.y + box.h);
    ctx2.stroke();
    if (opts.xLabel) {
      ctx2.fillStyle = CHART.label;
      ctx2.font = `500 15px ${CHART.mono}`;
      ctx2.textAlign = "right";
      ctx2.textBaseline = "bottom";
      ctx2.fillText(opts.xLabel, box.x + box.w, box.y + box.h + 44);
    }
    if (opts.yLabel) {
      ctx2.save();
      ctx2.translate(box.x - 62, box.y);
      ctx2.rotate(-Math.PI / 2);
      ctx2.textAlign = "left";
      ctx2.textBaseline = "top";
      ctx2.fillStyle = CHART.label;
      ctx2.fillText(opts.yLabel, 0, 0);
      ctx2.restore();
    }
    ctx2.restore();
    return s;
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
  function marker(ctx2, s, x, { label, color = CHART.paper } = {}) {
    const px = Math.round(s.sx(x)) + 0.5;
    ctx2.save();
    ctx2.strokeStyle = color;
    ctx2.globalAlpha = 0.5;
    ctx2.lineWidth = 1;
    ctx2.setLineDash([4, 6]);
    ctx2.beginPath();
    ctx2.moveTo(px, s.box.y);
    ctx2.lineTo(px, s.box.y + s.box.h);
    ctx2.stroke();
    ctx2.setLineDash([]);
    ctx2.globalAlpha = 1;
    if (label) {
      ctx2.fillStyle = color;
      ctx2.font = `500 15px ${CHART.mono}`;
      ctx2.textAlign = "center";
      ctx2.textBaseline = "bottom";
      ctx2.fillText(label, px, s.box.y - 6);
    }
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
  var P = {
    mass: 0.065,
    // [VERIFY] 整车质量 kg
    cd0: 0.34,
    // [TYPICAL] 零迎角阻力系数
    area: 16e-4,
    // [TYPICAL] 迎风面积 m²
    crr: 8e-3,
    // [TYPICAL] 滚动阻力系数
    fPeak: 21,
    // [VERIFY] 推力峰值 N
    tBurn: 0.11,
    // [VERIFY] 推力持续时间 s
    wheelI: 45e-8,
    // [TYPICAL] 单轮转动惯量 kg·m²
    wheelR: 0.011,
    // [TYPICAL] 轮半径 m
    wheels: 4
  };
  function effMass(p = P) {
    return p.mass + p.wheels * p.wheelI / (p.wheelR * p.wheelR);
  }
  function thrust(t, p = P) {
    if (t >= p.tBurn) return 0;
    return p.fPeak * Math.sin(Math.PI * t / p.tBurn);
  }
  function dragF(v, p = P) {
    return 0.5 * RHO * p.cd0 * p.area * v * v;
  }
  function rollF(p = P) {
    return p.crr * p.mass * G;
  }
  function simulate(p = P, dt = 1e-4) {
    const me = effMass(p);
    let t = 0, x = 0, v = 0;
    const rec = { t: [], x: [], v: [], a: [], ft: [], fd: [], fr: [] };
    const fr = rollF(p);
    let peakA = 0, peakAat = 0;
    let dragWork = 0, rollWork = 0, thrustWork = 0;
    for (let i = 0; i < 4e6 && x < DIST; i++) {
      const ft = thrust(t, p);
      const fd = dragF(v, p);
      const a = (ft - fd - fr) / me;
      if (a > peakA) {
        peakA = a;
        peakAat = t;
      }
      if (i % 50 === 0) {
        rec.t.push(t);
        rec.x.push(x);
        rec.v.push(v);
        rec.a.push(a);
        rec.ft.push(ft);
        rec.fd.push(fd);
        rec.fr.push(fr);
      }
      dragWork += fd * v * dt;
      rollWork += fr * v * dt;
      thrustWork += ft * v * dt;
      v += a * dt;
      x += v * dt;
      t += dt;
      if (v < 0) v = 0;
    }
    return { rec, tTotal: t, vExit: v, peakA, peakAat, me, dragWork, rollWork, thrustWork, ok: x >= DIST };
  }
  var BASE = simulate(P);
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var state = {
    mass: P.mass,
    cd0: P.cd0,
    fPeak: P.fPeak,
    tBurn: P.tBurn,
    show: { thrust: true, drag: true, roll: true, net: true },
    paused: false,
    tNow: 0
  };
  function currentParams() {
    return { ...P, mass: state.mass, cd0: state.cd0, fPeak: state.fPeak, tBurn: state.tBurn };
  }
  function rerun() {
    BASE = simulate(currentParams());
    if (state.tNow > BASE.tTotal) state.tNow = 0;
  }
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawHeader();
    drawChart();
    drawMetrics();
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
    ctx.fillText("ACCEL CURVE LAB", SAFE.x0, 330);
    ctx.fillStyle = PAPER;
    ctx.font = `600 58px ${DISP}`;
    ctx.letterSpacing = "1px";
    ctx.fillText("\u4E8C\u5341\u7C73\u91CC\uFF0C\u6BCF\u4E00\u725B\u90FD\u53BB\u54EA\u513F\u4E86", SAFE.x0, 406);
    ctx.fillStyle = "rgba(242,240,235,0.55)";
    ctx.font = `500 22px ${MONO}`;
    ctx.letterSpacing = "0px";
    ctx.fillText("\u63A8\u529B\u53EA\u7ED9 " + (state.tBurn * 1e3).toFixed(0) + " \u6BEB\u79D2\uFF0C\u5269\u4E0B\u5168\u7A0B\u53EA\u6709\u963B\u529B\u5728\u54AC", SAFE.x0, 452);
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 490, SAFE.x1 - SAFE.x0, 1);
    ctx.restore();
  }
  function drawChart() {
    const box = { x: 176, y: 570, w: 700, h: 500 };
    const r = BASE.rec;
    const tMax = Math.max(BASE.tTotal, 0.01);
    const yMax = Math.max(state.fPeak, ...r.ft) * 1.12;
    const vTop = Math.max(Math.max(...r.v) * 1.18, 1);
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 16px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.fillText("\u53D7\u529B\u5206\u89E3 \xB7 F(t)", SAFE.x0, 552);
    const s = frame(ctx, box, { x0: 0, x1: tMax, y0: 0, y1: yMax }, {
      xLabel: "\u65F6\u95F4 t (s)",
      yLabel: "\u529B F (N)",
      xTicks: 5,
      yTicks: 5,
      xFmt: (v) => v.toFixed(2),
      yFmt: (v) => v.toFixed(v < 10 ? 1 : 0)
    });
    const pts2 = (arr) => r.t.map((t, i) => [t, arr[i]]);
    if (state.show.roll) line(ctx, s, pts2(r.fr), { color: "rgba(242,240,235,0.42)", width: 2, dashed: true });
    if (state.show.drag) line(ctx, s, pts2(r.fd), { color: "rgba(232,89,12,0.55)", width: 2 });
    if (state.show.thrust) {
      area(ctx, s, pts2(r.ft), { color: "rgba(232,89,12,0.20)" });
      line(ctx, s, pts2(r.ft), { color: ACCENT, width: 3 });
    }
    if (state.show.net) line(ctx, s, pts2(r.a), { color: PAPER, width: 2, dashed: true });
    const syV = (v) => box.y + box.h - v / vTop * box.h;
    const vPts = r.t.map((t, i) => [t, r.v[i]]);
    if (vPts.length > 1) {
      ctx.save();
      ctx.beginPath();
      vPts.forEach(([t, v], i) => {
        const px = s.sx(t), py = syV(v);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.lineTo(s.sx(vPts[vPts.length - 1][0]), box.y + box.h);
      ctx.lineTo(s.sx(vPts[0][0]), box.y + box.h);
      ctx.closePath();
      ctx.fillStyle = "rgba(124,168,214,0.10)";
      ctx.fill();
      ctx.beginPath();
      vPts.forEach(([t, v], i) => {
        const px = s.sx(t), py = syV(v);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.strokeStyle = "rgba(150,190,232,0.9)";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.fillStyle = "rgba(150,190,232,0.62)";
      ctx.font = "500 15px " + MONO;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let k = 0; k <= 4; k++) {
        const vv = vTop / 4 * k;
        ctx.fillText(vv.toFixed(0), box.x + box.w + 12, syV(vv));
      }
      ctx.save();
      ctx.translate(box.x + box.w + 62, box.y);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(150,190,232,0.5)";
      ctx.fillText("\u901F\u5EA6 v (m/s)", 0, 0);
      ctx.restore();
      ctx.restore();
    }
    if (state.tNow > 0 && state.tNow <= tMax) {
      marker(ctx, s, state.tNow, { label: `${state.tNow.toFixed(2)}s` });
    }
    const items = [
      ["\u63A8\u529B F_thrust (N)", ACCENT, state.show.thrust],
      ["\u6C14\u52A8\u963B\u529B F_drag (N)", "rgba(232,89,12,0.55)", state.show.drag],
      ["\u6EDA\u963B F_roll (N)", "rgba(242,240,235,0.42)", state.show.roll],
      ["\u51C0\u52A0\u901F\u5EA6 a (m/s\xB2)", PAPER, state.show.net],
      ["\u901F\u5EA6 v (m/s) \u53F3\u8F74", "rgba(150,190,232,0.9)", true],
      ["", "transparent", true]
    ];
    ctx.font = `500 16px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    items.forEach(([label, color, on], i) => {
      const lx = SAFE.x0 + i % 2 * 430;
      const yy = 1112 + Math.floor(i / 2) * 32;
      ctx.globalAlpha = on ? 1 : 0.28;
      ctx.fillStyle = color;
      ctx.fillRect(lx, yy - 2, 18, 4);
      ctx.fillStyle = "rgba(242,240,235,0.62)";
      ctx.fillText(label, lx + 28, yy);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }
  function drawMetrics() {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 1192, SAFE.x1 - SAFE.x0, 1);
    const items = [
      ["\u5B8C\u8D5B\u7528\u65F6", BASE.tTotal.toFixed(3), "s", BASE.tTotal >= 1 && BASE.tTotal <= 1.25],
      ["\u672B\u901F\u5EA6", BASE.vExit.toFixed(2), "m/s", BASE.vExit >= 15 && BASE.vExit <= 22],
      ["\u963B\u529B\u8017\u529F", BASE.dragWork.toFixed(2), "J", true]
    ];
    const colW = (SAFE.x1 - SAFE.x0) / 3;
    items.forEach(([label, val, unit, inBand], i) => {
      const x = SAFE.x0 + i * colW;
      ctx.fillStyle = "rgba(242,240,235,0.45)";
      ctx.font = `500 15px ${MONO}`;
      ctx.letterSpacing = "1px";
      ctx.textAlign = "left";
      ctx.fillText(label, x, 1236);
      ctx.fillStyle = inBand ? PAPER : "#ff5a3c";
      ctx.font = `600 46px ${MONO}`;
      ctx.letterSpacing = "0px";
      ctx.fillText(val, x, 1296);
      ctx.fillStyle = "rgba(242,240,235,0.4)";
      ctx.font = `500 16px ${MONO}`;
      ctx.fillText(unit, x, 1326);
      ctx.fillStyle = inBand ? ACCENT : "#ff5a3c";
      ctx.fillRect(x, 1342, inBand ? 54 : 92, 2);
    });
    const bad = !(BASE.tTotal >= 1 && BASE.tTotal <= 1.25);
    if (bad) {
      ctx.fillStyle = "#ff5a3c";
      ctx.font = `500 17px ${MONO}`;
      ctx.letterSpacing = "0px";
      ctx.fillText("\u7ED3\u679C\u8D85\u51FA 1.000\u20131.250 s \u5408\u7406\u533A\u95F4\uFF0C\u53C2\u6570\u53EF\u80FD\u4E0D\u771F\u5B9E", SAFE.x0, 1384);
    } else {
      ctx.fillStyle = "rgba(242,240,235,0.38)";
      ctx.font = `500 15px ${MONO}`;
      ctx.letterSpacing = "0px";
      ctx.fillText(
        `m ${(state.mass * 1e3).toFixed(0)} g   Cd0 ${state.cd0.toFixed(2)}   F_peak ${state.fPeak.toFixed(0)} N   t_burn ${(state.tBurn * 1e3).toFixed(0)} ms`,
        SAFE.x0,
        1378
      );
      ctx.fillText(`\u7B49\u6548\u60EF\u6027\u8D28\u91CF ${(BASE.me * 1e3).toFixed(1)} g   \xB7   \u63A8\u8FDB\u529F ${BASE.thrustWork.toFixed(2)} J`, SAFE.x0, 1406);
    }
    ctx.restore();
  }
  function drawBrand() {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 1430, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 15px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("STEM RACING \xB7 EP.02", SAFE.x0, 1458);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.3)";
    ctx.letterSpacing = "0px";
    ctx.fillText("\u03C1[FIXED] Cd0[TYPICAL] m[VERIFY]", SAFE.x1, 1458);
    ctx.restore();
  }
  var last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1e3, 0.05);
    last = now;
    if (!state.paused) {
      state.tNow += dt * 0.6;
      if (state.tNow > BASE.tTotal) state.tNow = 0;
    }
    compose();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  function bind(id, key, scale2 = 1, digits = 2) {
    const el = document.getElementById(id);
    if (!el) return;
    const out = document.getElementById(id + "Out");
    const sync = () => {
      if (out) out.textContent = (state[key] / scale2).toFixed(digits);
    };
    sync();
    el.addEventListener("input", () => {
      state[key] = parseFloat(el.value) * scale2;
      rerun();
      sync();
    });
  }
  bind("mass", "mass", 1e-3, 0);
  bind("cd0", "cd0", 1, 2);
  bind("fPeak", "fPeak", 1, 0);
  bind("tBurn", "tBurn", 1e-3, 0);
  for (const k of ["thrust", "drag", "roll", "net"]) {
    const el = document.getElementById("tog-" + k);
    if (el) el.addEventListener("change", () => {
      state.show[k] = el.checked;
      compose();
    });
  }
  var pauseBtn = document.getElementById("pause");
  if (pauseBtn) pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "\u7EE7\u7EED" : "\u6682\u505C";
  });
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
  window.__app = {
    canvas: stage,
    params: P,
    getState: () => ({ ...state }),
    getMetrics: () => ({
      tTotal: BASE.tTotal,
      vExit: BASE.vExit,
      peakA: BASE.peakA,
      effMass: BASE.me,
      dragWork: BASE.dragWork,
      rollWork: BASE.rollWork,
      thrustWork: BASE.thrustWork,
      ok: BASE.ok
    }),
    set: (k, v) => {
      state[k] = v;
      rerun();
      compose();
    },
    setShow: (k, v) => {
      state.show[k] = v;
      compose();
    },
    simulate,
    selfTest: () => {
      const errs = [];
      if (thrust(1e-3, P) <= 0) errs.push("\u63A8\u529B\u8D77\u70B9\u975E\u6B63");
      if (thrust(P.tBurn + 0.01, P) !== 0) errs.push("\u63A8\u529B\u672A\u5728\u70E7\u5B8C\u540E\u5F52\u96F6");
      if (!(dragF(20, P) > dragF(10, P) * 3.9)) errs.push("\u963B\u529B\u4E0D\u968F\u901F\u5EA6\u5E73\u65B9\u589E\u957F");
      if (!(effMass(P) > P.mass)) errs.push("\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u5E94\u5927\u4E8E\u5E73\u52A8\u8D28\u91CF");
      if (!BASE.ok) errs.push("\u57FA\u7EBF\u672A\u8DD1\u5B8C 20 \u7C73");
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
    downloadAll: () => exportEpisode(stage, "accel-curve-lab")
  };
})();
