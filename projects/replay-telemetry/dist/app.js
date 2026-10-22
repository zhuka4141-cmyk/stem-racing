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
  var FRAME_HZ = 240;
  var SUBSTEPS = 50;
  var DT = 1 / (FRAME_HZ * SUBSTEPS);
  function effMass(p = P) {
    return p.mass + p.wheels * p.wheelI / (p.wheelR * p.wheelR);
  }
  function thrust(t, p = P) {
    return t >= p.tBurn ? 0 : p.fPeak * Math.sin(Math.PI * t / p.tBurn);
  }
  function dragF(v, p = P) {
    return 0.5 * RHO * p.cd0 * p.area * v * v;
  }
  function rollF(p = P) {
    return p.crr * p.mass * G;
  }
  function simulate(p = P) {
    const me = effMass(p);
    const fr = rollF(p);
    let t = 0, x = 0, v = 0;
    const F = { t: [], x: [], v: [], a: [], ft: [], fd: [], fr: [], fnet: [] };
    let peakA = 0, peakAat = 0, peakV = 0, peakVat = 0;
    let wThrust = 0, wDrag = 0, wRoll = 0;
    for (let i = 0; i < 8e6 && x < DIST; i++) {
      const ft = thrust(t, p);
      const fd = dragF(v, p);
      const a = (ft - fd - fr) / me;
      if (a > peakA) {
        peakA = a;
        peakAat = t;
      }
      if (v > peakV) {
        peakV = v;
        peakVat = t;
      }
      wThrust += ft * v * DT;
      wDrag += fd * v * DT;
      wRoll += fr * v * DT;
      v += a * DT;
      if (v < 0) v = 0;
      x += v * DT;
      t += DT;
      if (i % SUBSTEPS === SUBSTEPS - 1) {
        F.t.push(t);
        F.x.push(x);
        F.v.push(v);
        F.a.push(a);
        F.ft.push(ft);
        F.fd.push(fd);
        F.fr.push(fr);
        F.fnet.push(ft - fd - fr);
      }
    }
    return {
      F,
      tTotal: t,
      vExit: v,
      xExit: x,
      peakA,
      peakAat,
      peakV,
      peakVat,
      me,
      wThrust,
      wDrag,
      wRoll,
      kekin: 0.5 * me * v * v,
      frameHz: FRAME_HZ,
      ok: x >= DIST
    };
  }
  var RUN = simulate(P);
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var scrubEl = document.getElementById("scrub");
  var scrubOut = document.getElementById("scrubOut");
  var state = {
    mass: P.mass,
    fPeak: P.fPeak,
    tBurn: P.tBurn,
    tNow: 0,
    playing: true,
    dragging: false,
    show: { thrust: true, drag: true, roll: true }
  };
  function currentParams() {
    return { ...P, mass: state.mass, fPeak: state.fPeak, tBurn: state.tBurn };
  }
  function rerun() {
    RUN = simulate(currentParams());
    state.tNow = Math.min(state.tNow, RUN.tTotal);
    syncScrub();
  }
  function frameIndexAt(t) {
    const arr = RUN.F.t;
    if (!arr.length) return 0;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (arr[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function frameNow() {
    const i = frameIndexAt(state.tNow);
    const F = RUN.F;
    return {
      i,
      frameCount: F.t.length,
      t: F.t[i],
      x: F.x[i],
      v: F.v[i],
      a: F.a[i],
      ft: F.ft[i],
      fd: F.fd[i],
      fr: F.fr[i],
      fnet: F.fnet[i]
    };
  }
  var X0 = 176;
  var XW = 700;
  var BARS = {
    x: { x: X0, y: 548, w: XW, h: 78 },
    v: { x: X0, y: 660, w: XW, h: 148 },
    a: { x: X0, y: 842, w: XW, h: 78 },
    f: { x: X0, y: 954, w: XW, h: 118 }
  };
  var PLAY_TO = BARS.x.y;
  var PLAY_BOTTOM = BARS.f.y + BARS.f.h;
  var AXIS_Y = PLAY_BOTTOM;
  var SCRUB_LABEL_Y = 1168;
  var SCRUB_Y = 1206;
  var PANEL_RULE = 1248;
  var PANEL_LABEL = 1274;
  var NUM_BASE = 1310;
  var ROW0 = 1354;
  var ROW_DY = 28;
  function band(box, domain, opts = {}) {
    const s = scale(box, domain);
    const ys = niceStep(domain.y1 - domain.y0, opts.yTicks || 3);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = Math.ceil(domain.y0 / ys) * ys; v <= domain.y1 + ys * 1e-6; v += ys) {
      const y = Math.round(s.sy(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < ys * 1e-6 ? CHART.gridMajor : CHART.grid;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      ctx.fillStyle = CHART.label;
      ctx.fillText(opts.yFmt ? opts.yFmt(v) : fmtNum(v), box.x - 10, y);
    }
    const xs = niceStep(domain.x1 - domain.x0, 6);
    for (let v = Math.ceil(domain.x0 / xs) * xs; v <= domain.x1 + xs * 1e-6; v += xs) {
      const px = Math.round(s.sx(v)) + 0.5;
      ctx.strokeStyle = CHART.grid;
      ctx.beginPath();
      ctx.moveTo(px, box.y);
      ctx.lineTo(px, box.y + box.h);
      ctx.stroke();
    }
    ctx.strokeStyle = CHART.axis;
    ctx.beginPath();
    ctx.moveTo(box.x + 0.5, box.y);
    ctx.lineTo(box.x + 0.5, box.y + box.h);
    ctx.stroke();
    ctx.restore();
    return s;
  }
  function stripTag(box, name, unit, color) {
    ctx.save();
    ctx.font = `500 15px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = color || "rgba(242,240,235,0.55)";
    ctx.fillText(name, box.x + 2, box.y - 8);
    const w = ctx.measureText(name).width;
    ctx.fillStyle = "rgba(242,240,235,0.28)";
    ctx.font = `400 13px ${MONO}`;
    ctx.fillText(unit, box.x + 12 + w, box.y - 8);
    ctx.restore();
  }
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawHeader();
    drawBurnBand();
    drawStrips();
    drawScrubber();
    drawFramePanel();
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
    ctx.fillText("REPLAY TELEMETRY \xB7 RUN 0417", SAFE.x0, 330);
    ctx.fillStyle = PAPER;
    ctx.font = `600 56px ${DISP}`;
    ctx.letterSpacing = "1px";
    ctx.fillText("\u9010\u5E27\u62C6\u5F00\u8FD9 " + RUN.tTotal.toFixed(2) + " \u79D2", SAFE.x0, 402);
    ctx.fillStyle = "rgba(242,240,235,0.55)";
    ctx.font = `500 20px ${MONO}`;
    ctx.letterSpacing = "0px";
    ctx.fillText("240 \u5E27/\u79D2 \u843D\u76D8 \xB7 \u62D6\u65F6\u95F4\u8F74\u770B\u6BCF\u4E00\u5E27\u7684\u53D7\u529B\u6784\u6210", SAFE.x0, 448);
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 486, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.fillText("\u5E27\u7EA7\u9065\u6D4B \xB7 \u56DB\u6761\u5E26\u5171\u7528\u4E00\u6761\u65F6\u95F4\u8F74", SAFE.x0, 518);
    ctx.letterSpacing = "0px";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.32)";
    ctx.fillText(RUN.F.t.length + " \u5E27 / " + RUN.frameHz + " Hz", SAFE.x1, 518);
    ctx.restore();
  }
  function drawBurnBand() {
    const tMax = Math.max(RUN.tTotal, 1e-6);
    const px0 = X0;
    const px1 = X0 + state.tBurn / tMax * XW;
    ctx.save();
    ctx.fillStyle = "rgba(232,89,12,0.055)";
    ctx.fillRect(px0, PLAY_TO, px1 - px0, PLAY_BOTTOM - PLAY_TO);
    ctx.strokeStyle = "rgba(232,89,12,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(px1) + 0.5, PLAY_TO);
    ctx.lineTo(Math.round(px1) + 0.5, PLAY_BOTTOM);
    ctx.stroke();
    ctx.fillStyle = "rgba(232,89,12,0.62)";
    ctx.font = `500 13px ${MONO}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("\u63A8\u529B\u6BB5 " + (state.tBurn * 1e3).toFixed(0) + " ms", px0 + 8, PLAY_TO + 6);
    ctx.restore();
  }
  function drawStrips() {
    const F = RUN.F;
    const tMax = Math.max(RUN.tTotal, 0.01);
    const tDom = { x0: 0, x1: tMax };
    const xTop = Math.max(...F.x) * 1.06;
    const vTop = Math.max(...F.v) * 1.12;
    const aTop = Math.max(...F.a) * 1.1;
    const fTop = Math.max(state.fPeak, ...F.ft) * 1.1;
    stripTag(BARS.x, "\u4F4D\u7F6E x", "m", "rgba(242,240,235,0.55)");
    const sx = band(BARS.x, { ...tDom, y0: 0, y1: xTop }, { yTicks: 3 });
    line(ctx, sx, F.t.map((t, i) => [t, F.x[i]]), { color: "rgba(242,240,235,0.55)", width: 2 });
    ctx.save();
    ctx.strokeStyle = "rgba(232,89,12,0.45)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BARS.x.x, sx.sy(DIST) + 0.5);
    ctx.lineTo(BARS.x.x + BARS.x.w, sx.sy(DIST) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(232,89,12,0.7)";
    ctx.font = `500 13px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("\u7EC8\u70B9 20.00 m", BARS.x.x + BARS.x.w - 4, sx.sy(DIST) - 5);
    ctx.restore();
    stripTag(BARS.v, "\u901F\u5EA6 v", "m/s", ACCENT);
    const sv = band(BARS.v, { ...tDom, y0: 0, y1: vTop }, { yTicks: 4 });
    const vPts = F.t.map((t, i) => [t, F.v[i]]);
    area(ctx, sv, vPts, { color: "rgba(232,89,12,0.13)", base: 0 });
    line(ctx, sv, vPts, { color: ACCENT, width: 3 });
    ctx.save();
    ctx.strokeStyle = "rgba(242,240,235,0.32)";
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BARS.v.x, sv.sy(RUN.peakV) + 0.5);
    ctx.lineTo(BARS.v.x + BARS.v.w, sv.sy(RUN.peakV) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      "v_max " + RUN.peakV.toFixed(2) + " m/s  @ " + RUN.peakVat.toFixed(3) + " s",
      BARS.v.x + BARS.v.w - 4,
      sv.sy(RUN.peakV) - 6
    );
    ctx.restore();
    stripTag(BARS.a, "\u52A0\u901F\u5EA6 a", "m/s\xB2", "rgba(242,240,235,0.72)");
    const sa = band(BARS.a, { ...tDom, y0: 0, y1: aTop }, { yTicks: 3 });
    line(ctx, sa, F.t.map((t, i) => [t, F.a[i]]), { color: "rgba(242,240,235,0.72)", width: 2 });
    stripTag(BARS.f, "\u53D7\u529B F", "N");
    const sf = band(BARS.f, { ...tDom, y0: 0, y1: fTop }, { yTicks: 3 });
    if (state.show.roll) line(ctx, sf, F.t.map((t, i) => [t, F.fr[i]]), { color: "rgba(242,240,235,0.40)", width: 2, dashed: true });
    if (state.show.drag) line(ctx, sf, F.t.map((t, i) => [t, F.fd[i]]), { color: "rgba(242,240,235,0.72)", width: 2 });
    if (state.show.thrust) {
      const tp = F.t.map((t, i) => [t, F.ft[i]]);
      area(ctx, sf, tp, { color: "rgba(232,89,12,0.20)" });
      line(ctx, sf, tp, { color: ACCENT, width: 3 });
    }
    ctx.save();
    ctx.strokeStyle = CHART.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BARS.f.x, AXIS_Y + 0.5);
    ctx.lineTo(BARS.f.x + BARS.f.w, AXIS_Y + 0.5);
    ctx.stroke();
    ctx.fillStyle = CHART.label;
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xs = niceStep(tMax, 6);
    for (let v = 0; v <= tMax + xs * 1e-6; v += xs) {
      ctx.fillText(v.toFixed(2), sf.sx(v), AXIS_Y + 8);
      ctx.fillStyle = CHART.axis;
      ctx.fillRect(Math.round(sf.sx(v)), AXIS_Y, 1, 5);
      ctx.fillStyle = CHART.label;
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.45)";
    ctx.fillText("\u65F6\u95F4 t / s", BARS.f.x + BARS.f.w, AXIS_Y + 30);
    ctx.restore();
    const px = Math.round(sv.sx(state.tNow)) + 0.5;
    ctx.save();
    ctx.strokeStyle = "rgba(242,240,235,0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, PLAY_TO);
    ctx.lineTo(px, PLAY_BOTTOM);
    ctx.stroke();
    ctx.restore();
    const cur = frameNow();
    ctx.save();
    ctx.strokeStyle = "rgba(232,89,12,0.5)";
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(BARS.v.x, sv.sy(cur.v) + 0.5);
    ctx.lineTo(sv.sx(cur.t), sv.sy(cur.v) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PAPER;
    ctx.fillRect(sv.sx(cur.t) - 7, sv.sy(cur.v) - 7, 14, 14);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(sv.sx(cur.t) - 4, sv.sy(cur.v) - 4, 8, 8);
    ctx.restore();
    const legend = [
      ["\u4F4D\u7F6E x", "rgba(242,240,235,0.55)"],
      ["\u901F\u5EA6 v", ACCENT],
      ["\u52A0\u901F\u5EA6 a", "rgba(242,240,235,0.72)"],
      ["\u63A8\u529B F_thrust", ACCENT],
      ["\u6C14\u52A8\u963B\u529B F_drag", "rgba(242,240,235,0.72)"],
      ["\u6EDA\u52A8\u963B\u529B F_roll", "rgba(242,240,235,0.40)"]
    ];
    ctx.save();
    ctx.font = `500 14px ${MONO}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    legend.forEach(([label, color], i) => {
      const lx = SAFE.x0 + i % 3 * 292;
      const ly = 1132;
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 2, 16, 4);
      ctx.fillStyle = "rgba(242,240,235,0.55)";
      ctx.fillText(label, lx + 24, ly);
    });
    ctx.restore();
  }
  function drawScrubber() {
    const w = SAFE.x1 - SAFE.x0;
    const F = RUN.F;
    const n = F.t.length;
    const span = Math.max(RUN.tTotal, 1e-9);
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("\u65F6\u95F4\u8F74 \xB7 \u62D6\u52A8\u5B9A\u4F4D\u5230\u4EFB\u610F\u4E00\u5E27", SAFE.x0, SCRUB_LABEL_Y);
    ctx.letterSpacing = "0px";
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.32)";
    ctx.fillText("0 \u2014 " + span.toFixed(3) + " s", SAFE.x1, SCRUB_LABEL_Y);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.07)";
    ctx.fillRect(SAFE.x0, SCRUB_Y - 18, w, 36);
    for (let i = 0; i < n; i++) {
      const px2 = SAFE.x0 + F.t[i] / span * w;
      ctx.fillStyle = F.t[i] <= state.tNow ? "rgba(232,89,12,0.6)" : "rgba(242,240,235,0.18)";
      ctx.fillRect(px2, SCRUB_Y - 13, 1, 26);
    }
    const px = SAFE.x0 + state.tNow / span * w;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(px - 1, SCRUB_Y - 22, 3, 44);
    ctx.fillStyle = PAPER;
    ctx.fillRect(px - 6, SCRUB_Y - 11, 12, 22);
    ctx.fillStyle = INK;
    ctx.fillRect(px - 2, SCRUB_Y - 7, 5, 14);
    ctx.restore();
  }
  function drawFramePanel() {
    const cur = frameNow();
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, PANEL_RULE, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("\u5F53\u524D\u5E27", SAFE.x0, PANEL_LABEL);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "rgba(242,240,235,0.42)";
    ctx.textAlign = "right";
    ctx.fillText("\u7B2C " + (cur.i + 1) + " / " + cur.frameCount + " \u5E27", SAFE.x1, PANEL_LABEL);
    const cells = [
      ["t", cur.t.toFixed(4), "s"],
      ["x", cur.x.toFixed(3), "m"],
      ["v", cur.v.toFixed(2), "m/s"],
      ["a", (cur.a / G).toFixed(1), "g"]
    ];
    const colW = (SAFE.x1 - SAFE.x0) / 4;
    cells.forEach(([k, val, unit], i) => {
      const cx = SAFE.x0 + i * colW;
      ctx.fillStyle = "rgba(242,240,235,0.38)";
      ctx.font = `500 13px ${MONO}`;
      ctx.textAlign = "left";
      ctx.fillText(k, cx, NUM_BASE - 52);
      ctx.fillStyle = i === 2 ? ACCENT : PAPER;
      ctx.font = `600 42px ${MONO}`;
      ctx.fillText(val, cx, NUM_BASE);
      ctx.fillStyle = "rgba(242,240,235,0.38)";
      ctx.font = `500 14px ${MONO}`;
      ctx.fillText(unit, cx, NUM_BASE + 22);
    });
    const rows = [
      ["\u63A8\u529B F_thrust", cur.ft, ACCENT],
      ["\u6C14\u52A8\u963B\u529B F_drag", cur.fd, "rgba(242,240,235,0.72)"],
      ["\u6EDA\u52A8\u963B\u529B F_roll", cur.fr, "rgba(242,240,235,0.40)"],
      ["\u5408\u529B F_net", cur.fnet, PAPER]
    ];
    const frameMax = Math.max(1e-9, Math.abs(cur.ft), Math.abs(cur.fd), Math.abs(cur.fr), Math.abs(cur.fnet));
    const barX = SAFE.x0 + 244, barW = 452;
    rows.forEach(([label, val, color], i) => {
      const ry = ROW0 + i * ROW_DY;
      ctx.fillStyle = "rgba(242,240,235,0.5)";
      ctx.font = `500 14px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, SAFE.x0, ry);
      ctx.fillStyle = "rgba(242,240,235,0.06)";
      ctx.fillRect(barX, ry - 7, barW, 14);
      const wpx = Math.max(2, Math.abs(val) / frameMax * barW);
      ctx.fillStyle = color;
      ctx.fillRect(barX, ry - 7, wpx, 14);
      ctx.fillStyle = PAPER;
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(2) + " N", SAFE.x1, ry);
    });
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
    ctx.fillText("STEM RACING \xB7 EP.03", SAFE.x0, 1496);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.3)";
    ctx.letterSpacing = "0px";
    ctx.fillText("\u03C1 g L [FIXED]  Cd0 Crr A I_w r_w [TYPICAL]  m F_peak t_burn [VERIFY]", SAFE.x1, 1496);
    ctx.restore();
  }
  function scrubTo(px) {
    const w = SAFE.x1 - SAFE.x0;
    const f = Math.min(1, Math.max(0, (px - SAFE.x0) / w));
    state.tNow = f * RUN.tTotal;
    syncScrub();
  }
  function syncScrub() {
    if (scrubEl) scrubEl.value = String(Math.round(state.tNow / Math.max(RUN.tTotal, 1e-6) * 1e3));
    if (scrubOut) scrubOut.textContent = state.tNow.toFixed(4) + " s";
  }
  function toCanvas(e) {
    const r = stage.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  }
  function inScrubBand(y) {
    return y >= SCRUB_Y - 26 && y <= SCRUB_Y + 26;
  }
  stage.addEventListener("pointerdown", (e) => {
    const p = toCanvas(e);
    if (!inScrubBand(p.y)) return;
    state.dragging = true;
    state.playing = false;
    setBtnText();
    stage.setPointerCapture(e.pointerId);
    scrubTo(p.x);
  });
  stage.addEventListener("pointermove", (e) => {
    const p = toCanvas(e);
    if (state.dragging) {
      scrubTo(p.x);
      return;
    }
    stage.style.cursor = inScrubBand(p.y) ? "ew-resize" : "default";
  });
  stage.addEventListener("pointerup", (e) => {
    state.dragging = false;
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch {
    }
  });
  stage.addEventListener("pointercancel", () => {
    state.dragging = false;
  });
  if (scrubEl) {
    scrubEl.addEventListener("input", () => {
      state.playing = false;
      setBtnText();
      state.tNow = parseFloat(scrubEl.value) / 1e3 * RUN.tTotal;
      if (scrubOut) scrubOut.textContent = state.tNow.toFixed(4) + " s";
    });
  }
  var last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1e3, 0.05);
    last = now;
    if (state.playing && !state.dragging) {
      state.tNow += dt * 0.55;
      if (state.tNow > RUN.tTotal) state.tNow = 0;
      syncScrub();
    }
    compose();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  function bind(id, key, k = 1, digits = 2) {
    const el = document.getElementById(id);
    if (!el) return;
    const out = document.getElementById(id + "Out");
    const sync = () => {
      if (out) out.textContent = (state[key] / k).toFixed(digits);
    };
    sync();
    el.addEventListener("input", () => {
      state[key] = parseFloat(el.value) * k;
      rerun();
      sync();
    });
  }
  bind("mass", "mass", 1e-3, 0);
  bind("fPeak", "fPeak", 1, 0);
  bind("tBurn", "tBurn", 1e-3, 0);
  for (const k of ["thrust", "drag", "roll"]) {
    const el = document.getElementById("tog-" + k);
    if (el) el.addEventListener("change", () => {
      state.show[k] = el.checked;
      compose();
    });
  }
  var pauseBtn = document.getElementById("pause");
  function setBtnText() {
    if (pauseBtn) pauseBtn.textContent = state.playing ? "\u6682\u505C" : "\u7EE7\u7EED";
  }
  setBtnText();
  if (pauseBtn) pauseBtn.addEventListener("click", () => {
    state.playing = !state.playing;
    setBtnText();
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
      tTotal: RUN.tTotal,
      xExit: RUN.xExit,
      vExit: RUN.vExit,
      peakV: RUN.peakV,
      peakVat: RUN.peakVat,
      peakA: RUN.peakA,
      peakAat: RUN.peakAat,
      effMass: RUN.me,
      wThrust: RUN.wThrust,
      wDrag: RUN.wDrag,
      wRoll: RUN.wRoll,
      kekin: RUN.kekin,
      frameCount: RUN.F.t.length,
      frameHz: RUN.frameHz,
      ok: RUN.ok
    }),
    frameAt: (t) => {
      state.tNow = t;
      compose();
      return frameNow();
    },
    scrubFrac: (f) => {
      state.tNow = f * RUN.tTotal;
      compose();
      return frameNow();
    },
    setPlaying: (v) => {
      state.playing = v;
      setBtnText();
    },
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
      const F = RUN.F;
      if (thrust(P.tBurn + 0.01) !== 0) errs.push("\u63A8\u529B\u5728 t_burn \u4E4B\u540E\u6CA1\u6709\u5F52\u96F6");
      if (thrust(1e-3) <= 0) errs.push("\u63A8\u529B\u8D77\u70B9\u975E\u6B63");
      if (!(dragF(20) > dragF(10) * 3.9)) errs.push("\u963B\u529B\u4E0D\u968F\u901F\u5EA6\u5E73\u65B9\u589E\u957F");
      if (!(effMass() > P.mass)) errs.push("\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u5E94\u5927\u4E8E\u5E73\u52A8\u8D28\u91CF");
      let pk = 0;
      for (let i = 1; i < F.v.length; i++) if (F.v[i] > F.v[pk]) pk = i;
      for (let i = 1; i <= pk; i++) if (F.v[i] < F.v[i - 1] - 1e-9) {
        errs.push("\u5CF0\u503C\u4E4B\u524D\u901F\u5EA6\u4E0D\u5355\u8C03");
        break;
      }
      for (let i = pk + 2; i < F.v.length; i++) if (F.v[i] > F.v[i - 1] + 1e-9) {
        errs.push("\u5CF0\u503C\u4E4B\u540E\u901F\u5EA6\u56DE\u5347");
        break;
      }
      if (!(RUN.peakVat > 0 && RUN.peakVat <= P.tBurn + 1e-9)) errs.push("\u901F\u5EA6\u5CF0\u503C\u6CA1\u6709\u843D\u5728\u63A8\u529B\u6BB5\u5185");
      if (Math.abs(RUN.xExit - DIST) > 0.05) errs.push("\u4F4D\u79FB\u79EF\u5206\u7EC8\u70B9\u504F\u79BB 20 m\uFF1A" + RUN.xExit.toFixed(4));
      const bal = Math.abs(RUN.wThrust - RUN.wDrag - RUN.wRoll - RUN.kekin);
      if (bal > Math.max(0.02, RUN.wThrust * 0.01)) errs.push("\u80FD\u91CF\u8D26\u672C\u4E0D\u95ED\u5408\uFF0C\u6B8B\u5DEE " + bal.toFixed(4) + " J");
      if (Math.abs(F.t.length - Math.round(RUN.tTotal * RUN.frameHz)) > 2) errs.push("\u5E27\u6570\u4E0E\u5E27\u7387\u4E0D\u4E00\u81F4");
      if (!RUN.ok) errs.push("\u57FA\u7EBF\u672A\u8DD1\u5B8C 20 \u7C73");
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
    downloadAll: () => exportEpisode(stage, "replay-telemetry")
  };
})();
