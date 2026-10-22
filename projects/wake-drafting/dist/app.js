(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

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
  async function toPNG(canvas2, { width = REEL_W, height = REEL_H, quality } = {}) {
    const out = resample(canvas2, width, height);
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
  async function exportEpisode(canvas2, slug) {
    const vertical = await toPNG(canvas2, { width: REEL_W, height: REEL_H });
    await assertPNG(vertical);
    download(vertical, `${slug}-1080x1920.png`);
    const cover = await toPNG(canvas2, { width: COVER_W, height: COVER_H });
    await assertPNG(cover);
    download(cover, `${slug}-1080x1350.png`);
    return { vertical: vertical.size, cover: cover.size };
  }

  // src/plotkit.js
  var plotkit_exports = {};
  __export(plotkit_exports, {
    ACCENT: () => ACCENT,
    DISP: () => DISP,
    H: () => H,
    INK: () => INK,
    MONO: () => MONO,
    PAPER: () => PAPER,
    SAFE: () => SAFE,
    W: () => W,
    accent: () => accent,
    accentRule: () => accentRule,
    arrow: () => arrow,
    axisFrame: () => axisFrame,
    backdrop: () => backdrop,
    bigNum: () => bigNum,
    callout: () => callout,
    clamp: () => clamp,
    dot: () => dot,
    footer: () => footer,
    hairline: () => hairline,
    kicker: () => kicker,
    label: () => label,
    mapRange: () => mapRange,
    plotGrid: () => plotGrid,
    polyline: () => polyline,
    readout: () => readout,
    rgba: () => rgba,
    sub: () => sub,
    text: () => text,
    title: () => title,
    warnBand: () => warnBand
  });
  var INK = "#0b0b0c";
  var PAPER = "#f2f0eb";
  var ACCENT = "#e8590c";
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var rgba = (a) => `rgba(242,240,235,${a})`;
  var accent = (a) => `rgba(232,89,12,${a})`;
  function backdrop(ctx2) {
    ctx2.fillStyle = INK;
    ctx2.fillRect(0, 0, W, H);
    ctx2.save();
    ctx2.lineWidth = 1;
    ctx2.strokeStyle = rgba(0.075);
    ctx2.beginPath();
    for (let x = 0; x <= W; x += 40) {
      ctx2.moveTo(x + 0.5, 0);
      ctx2.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += 40) {
      ctx2.moveTo(0, y + 0.5);
      ctx2.lineTo(W, y + 0.5);
    }
    ctx2.stroke();
    ctx2.strokeStyle = rgba(0.105);
    ctx2.beginPath();
    for (let x = 0; x <= W; x += 200) {
      ctx2.moveTo(x + 0.5, 0);
      ctx2.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += 200) {
      ctx2.moveTo(0, y + 0.5);
      ctx2.lineTo(W, y + 0.5);
    }
    ctx2.stroke();
    ctx2.restore();
  }
  function hairline(ctx2, y, x0 = SAFE.x0, x1 = SAFE.x1, a = 0.14) {
    ctx2.save();
    ctx2.strokeStyle = rgba(a);
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(x0, y + 0.5);
    ctx2.lineTo(x1, y + 0.5);
    ctx2.stroke();
    ctx2.restore();
  }
  function accentRule(ctx2, x, y, w = 46, h = 3) {
    ctx2.save();
    ctx2.fillStyle = ACCENT;
    ctx2.fillRect(x, y, w, h);
    ctx2.restore();
  }
  function text(ctx2, s, x, y, {
    font = `500 17px ${MONO}`,
    color = PAPER,
    align = "left",
    baseline = "alphabetic",
    spacing = 0
  } = {}) {
    ctx2.save();
    ctx2.font = font;
    ctx2.fillStyle = color;
    ctx2.textAlign = align;
    ctx2.textBaseline = baseline;
    if (spacing && "letterSpacing" in ctx2) ctx2.letterSpacing = spacing + "px";
    ctx2.fillText(s, x, y);
    ctx2.restore();
  }
  function label(ctx2, s, x, y, o = {}) {
    return text(ctx2, s.toUpperCase(), x, y, {
      font: o.font ?? `500 15px ${MONO}`,
      color: o.color ?? rgba(0.5),
      spacing: o.spacing ?? 1.6,
      align: o.align
    });
  }
  function kicker(ctx2, s, y = 348, x = SAFE.x0) {
    label(ctx2, s, x, y, { color: rgba(0.5), font: `500 17px ${MONO}` });
  }
  function title(ctx2, lines, y = 418, { size = 62, color = PAPER, lead = 72 } = {}) {
    ctx2.save();
    ctx2.font = `600 ${size}px ${DISP}`;
    ctx2.fillStyle = color;
    ctx2.textBaseline = "alphabetic";
    lines.forEach((l, i) => ctx2.fillText(l, SAFE.x0, y + i * lead));
    ctx2.restore();
    return y + (lines.length - 1) * lead;
  }
  function sub(ctx2, s, y, { size = 21, color = rgba(0.62), x = SAFE.x0, align = "left" } = {}) {
    return text(ctx2, s, x, y, { font: `400 ${size}px ${MONO}`, color, align });
  }
  function bigNum(ctx2, s, x, y, { size = 84, color = ACCENT, align = "left" } = {}) {
    return text(ctx2, s, x, y, { font: `600 ${size}px ${MONO}`, color, align });
  }
  function readout(ctx2, { x, y, value, unit, caption, status, color = PAPER, size = 52 }) {
    ctx2.save();
    ctx2.font = `600 ${size}px ${MONO}`;
    const vw = ctx2.measureText(value).width;
    ctx2.restore();
    bigNum(ctx2, value, x, y, { size, color });
    if (unit) text(ctx2, unit, x + vw + 7, y, { font: `400 19px ${MONO}`, color: rgba(0.45) });
    if (caption) label(ctx2, caption, x, y + 24, { color: rgba(0.45) });
    if (status) label(ctx2, status, x, y + 45, { color: ACCENT, font: `500 13px ${MONO}` });
  }
  function axisFrame(ctx2, box) {
    const { x0, y0, x1, y1 } = box;
    ctx2.save();
    ctx2.strokeStyle = rgba(0.28);
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(x0, y1 + 0.5);
    ctx2.lineTo(x1, y1 + 0.5);
    ctx2.moveTo(x0 + 0.5, y0);
    ctx2.lineTo(x0 + 0.5, y1);
    ctx2.stroke();
    ctx2.restore();
  }
  function plotGrid(ctx2, box, nx = 6, ny = 5) {
    const { x0, y0, x1, y1 } = box;
    ctx2.save();
    ctx2.strokeStyle = rgba(0.075);
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    for (let i = 0; i <= nx; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / nx) + 0.5;
      ctx2.moveTo(x, y0);
      ctx2.lineTo(x, y1);
    }
    for (let i = 0; i <= ny; i++) {
      const y = Math.round(y0 + (y1 - y0) * i / ny) + 0.5;
      ctx2.moveTo(x0, y);
      ctx2.lineTo(x1, y);
    }
    ctx2.stroke();
    ctx2.restore();
  }
  var mapRange = (v, a, b, c, d) => c + (v - a) / (b - a) * (d - c);
  var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function polyline(ctx2, pts2, { color = PAPER, width = 2, dash = null, alpha = 1 } = {}) {
    if (pts2.length < 2) return;
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineJoin = "round";
    if (dash) ctx2.setLineDash(dash);
    ctx2.beginPath();
    ctx2.moveTo(pts2[0].x, pts2[0].y);
    for (let i = 1; i < pts2.length; i++) ctx2.lineTo(pts2[i].x, pts2[i].y);
    ctx2.stroke();
    ctx2.restore();
  }
  function dot(ctx2, x, y, r = 4, color = ACCENT, ring = null) {
    ctx2.save();
    ctx2.fillStyle = color;
    ctx2.beginPath();
    ctx2.arc(x, y, r, 0, Math.PI * 2);
    ctx2.fill();
    if (ring) {
      ctx2.strokeStyle = ring;
      ctx2.lineWidth = 2;
      ctx2.beginPath();
      ctx2.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx2.stroke();
    }
    ctx2.restore();
  }
  function arrow(ctx2, x0, y0, x1, y1, { color = ACCENT, width = 3, head = 13 } = {}) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx2.save();
    ctx2.strokeStyle = color;
    ctx2.fillStyle = color;
    ctx2.lineWidth = width;
    ctx2.beginPath();
    ctx2.moveTo(x0, y0);
    ctx2.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
    ctx2.stroke();
    ctx2.beginPath();
    ctx2.moveTo(x1, y1);
    ctx2.lineTo(x1 - Math.cos(a - 0.4) * head, y1 - Math.sin(a - 0.4) * head);
    ctx2.lineTo(x1 - Math.cos(a + 0.4) * head, y1 - Math.sin(a + 0.4) * head);
    ctx2.closePath();
    ctx2.fill();
    ctx2.restore();
  }
  function callout(ctx2, x0, y0, x1, y1, s, { color = rgba(0.55), align = "left", font = `400 15px ${MONO}` } = {}) {
    ctx2.save();
    ctx2.strokeStyle = rgba(0.3);
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(x0, y0);
    ctx2.lineTo(x1, y1);
    ctx2.stroke();
    ctx2.restore();
    const tx = align === "right" ? x1 - 8 : x1 + 8;
    text(ctx2, s, tx, y1 + 5, { font, color, align });
  }
  function footer(ctx2, { left, right, y = 1440 }) {
    hairline(ctx2, y - 28);
    label(ctx2, left, SAFE.x0, y, { color: rgba(0.42) });
    label(ctx2, right, SAFE.x1, y, { color: rgba(0.42), align: "right" });
  }
  function warnBand(ctx2, y, { ok, text: msg, detail }) {
    const x0 = SAFE.x0, w = SAFE.x1 - SAFE.x0, h = 62;
    ctx2.save();
    ctx2.fillStyle = ok ? "rgba(242,240,235,0.06)" : "rgba(232,89,12,0.22)";
    ctx2.fillRect(x0, y, w, h);
    ctx2.fillStyle = ok ? rgba(0.32) : ACCENT;
    ctx2.fillRect(x0, y, 4, h);
    ctx2.restore();
    label(ctx2, ok ? "SANITY BAND  \xB7  OK" : "SANITY BAND  \xB7  VIOLATED", x0 + 18, y + 24, {
      color: ok ? rgba(0.55) : ACCENT,
      font: `600 15px ${MONO}`
    });
    text(ctx2, msg, x0 + 18, y + 48, { font: `400 17px ${MONO}`, color: PAPER });
    if (detail) {
      text(ctx2, detail, SAFE.x1 - 14, y + 48, { font: `400 15px ${MONO}`, color: rgba(0.5), align: "right" });
    }
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

  // src/racing-core.js
  var RHO = 1.204;
  var NU = 1516e-8;
  var G = 9.81;
  var PARAMS = {
    m: { v: 0.065, unit: "kg", status: "VERIFY", label: "\u6574\u8F66\u8D28\u91CF" },
    iWheel: { v: 45e-8, unit: "kg\xB7m\xB2", status: "TYPICAL", label: "\u5355\u8F6E\u8F6C\u52A8\u60EF\u91CF" },
    rWheel: { v: 0.011, unit: "m", status: "TYPICAL", label: "\u8F6E\u534A\u5F84" },
    nWheel: { v: 4, unit: "", status: "FIXED", label: "\u8F6E\u6570" },
    area: { v: 16e-4, unit: "m\xB2", status: "TYPICAL", label: "\u8FCE\u98CE\u9762\u79EF" },
    cd: { v: 0.34, unit: "", status: "TYPICAL", label: "\u96F6\u5347\u963B\u529B\u7CFB\u6570" },
    crr: { v: 8e-3, unit: "", status: "TYPICAL", label: "\u6EDA\u52A8\u963B\u529B\u7CFB\u6570" },
    mu: { v: 0.6, unit: "", status: "TYPICAL", label: "\u8F6E\u8F68\u6469\u64E6\u7CFB\u6570" },
    len: { v: 0.2, unit: "m", status: "VERIFY", label: "\u8F66\u8EAB\u957F\u5EA6" },
    width: { v: 0.05, unit: "m", status: "TYPICAL", label: "\u8F66\u8EAB\u5BBD\u5EA6\uFF08\u6A2A\u6D41\u6295\u5F71\uFF09" },
    track: { v: 20, unit: "m", status: "VERIFY", label: "\u8D5B\u9053\u957F\u5EA6" },
    wheelbase: { v: 0.13, unit: "m", status: "TYPICAL", label: "\u8F74\u8DDD" },
    comFrac: { v: 0.55, unit: "", status: "TYPICAL", label: "\u8D28\u5FC3\u8DDD\u524D\u8F74 / \u8F74\u8DDD" },
    armPin: { v: 0.0375, unit: "m", status: "TYPICAL", label: "\u5BFC\u8F68\u9500\u5230\u524D\u8F74" },
    comH: { v: 0.012, unit: "m", status: "TYPICAL", label: "\u8D28\u5FC3\u9AD8\u5EA6" },
    toe: { v: 0, unit: "deg", status: "VERIFY", label: "\u524D\u8F6E\u524D\u675F\u89D2" }
  };
  var THRUST = { Fpeak: 21, tBurn: 0.11 };
  var BAND = { min: 1, max: 1.25 };
  var REFERENCE = {
    time: 1.1885,
    // s    20 m 用时
    vFinish: 16.906,
    // m/s  末速度
    vMax: 18.347,
    // m/s  峰值速度，出现在 t = t_burn
    xAtBurn: 1.01,
    // m    烧完时已跑过的距离
    impulse: 1.4706,
    // N·s  推力冲量
    effMass: 0.079876,
    // kg   等效惯性质量
    band: "1.00\u20131.25 s"
  };
  function bandCheck(t) {
    if (!Number.isFinite(t)) return { ok: false, side: "nan", text: "\u79EF\u5206\u53D1\u6563\uFF0C\u6210\u7EE9\u4E0D\u662F\u6709\u9650\u6570" };
    if (t < BAND.min) return { ok: false, side: "fast", text: `\u5FEB\u8FC7\u4E0B\u754C ${BAND.min.toFixed(2)} s\uFF0C\u6A21\u578B\u6709\u95EE\u9898` };
    if (t > BAND.max) return { ok: false, side: "slow", text: `\u6162\u8FC7\u4E0A\u754C ${BAND.max.toFixed(2)} s\uFF0C\u6A21\u578B\u6709\u95EE\u9898` };
    return { ok: true, side: "in", text: `\u5728 ${BAND.min.toFixed(2)}\u2013${BAND.max.toFixed(2)} s \u5185` };
  }
  function effMass(p = flatParams()) {
    return p.m + p.nWheel * p.iWheel / (p.rWheel * p.rWheel);
  }
  function thrustAt(t, th = THRUST) {
    if (t <= 0) return 0;
    if (t >= th.tBurn) return 0;
    return th.Fpeak * Math.sin(Math.PI * t / th.tBurn);
  }
  function dragForce(v, p = flatParams()) {
    return 0.5 * RHO * p.cd * p.area * v * v;
  }
  function rollForce(p = flatParams()) {
    return p.crr * p.m * G;
  }
  function impulse(th = THRUST) {
    return 2 * th.Fpeak * th.tBurn / Math.PI;
  }
  function accel(v, t, p = flatParams(), o = {}) {
    const th = o.thrust ?? THRUST;
    const fThrust = thrustAt(t, th);
    const fDrag = dragForce(v, p);
    const fRoll = rollForce(p);
    const fScrub = o.scrub ?? 0;
    return (fThrust - fDrag - fRoll - fScrub) / effMass(p);
  }
  function simulateRun(p = flatParams(), o = {}) {
    const dt = o.dt ?? 5e-4, maxT = o.maxT ?? 6;
    const stopAt = o.stopAt ?? p.track;
    const th = o.thrust ?? THRUST;
    let x = o.x0 ?? 0, v = o.v0 ?? 0, t = o.t0 ?? 0, i = 0;
    const maxSteps = Math.ceil(maxT / dt);
    const a = (vv, tt) => accel(vv, tt, p, { ...o, thrust: th });
    while (x < stopAt && i < maxSteps) {
      const k1v = a(v, t), k1x = v;
      const k2v = a(v + 0.5 * dt * k1v, t + 0.5 * dt), k2x = v + 0.5 * dt * k1v;
      const k3v = a(v + 0.5 * dt * k2v, t + 0.5 * dt), k3x = v + 0.5 * dt * k2v;
      const k4v = a(v + dt * k3v, t + dt), k4x = v + dt * k3v;
      x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
      v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      t += dt;
      i++;
      if (!Number.isFinite(x) || !Number.isFinite(v)) break;
    }
    return { t: t - (o.t0 ?? 0), tAbs: t, v, x, steps: i, hitEnd: x >= stopAt };
  }
  function axleLoads(p = flatParams(), thrust = 0, dh = 0) {
    const W3 = p.m * G;
    const nf = W3 * (1 - p.comFrac) + thrust * dh / p.wheelbase;
    return { nf, nr: W3 - nf, total: W3 };
  }
  function selfCheck(p = flatParams()) {
    const rows = [];
    const add = (name, ok, detail) => rows.push({ name, ok, detail });
    const r = simulateRun(p, { dt: 5e-4, stopAt: p.track });
    const me = effMass(p);
    const I = impulse();
    add("20 m \u7528\u65F6\u843D\u5728 1.00\u20131.25 s", bandCheck(r.t).ok, `${r.t.toFixed(4)} s`);
    add("\u672B\u901F\u5EA6\u4F4E\u4E8E\u5CF0\u503C\u901F\u5EA6", r.v < REFERENCE.vMax, `${r.v.toFixed(3)} < ${REFERENCE.vMax.toFixed(3)} m/s`);
    const dvIdeal = I / me;
    add(
      "\u5B9E\u9645\u589E\u901F\u5C0F\u4E8E\u51B2\u91CF\u7406\u60F3\u503C\uFF08\u963B\u529B\u6709\u635F\u8017\uFF09",
      r.v < dvIdeal,
      `${r.v.toFixed(3)} < ${dvIdeal.toFixed(3)} m/s\uFF0C\u635F\u8017 ${((1 - r.v / dvIdeal) * 100).toFixed(1)} %`
    );
    add("\u51B2\u91CF\u7406\u60F3\u503C\u5BF9\u5F97\u4E0A\u89E3\u6790\u89E3 1.4706 N\xB7s", Math.abs(I - 1.4706) < 1e-3, `${I.toFixed(4)} N\xB7s`);
    const vAvg = p.track / r.t;
    add("\u5E73\u5747\u901F\u5EA6\u4F4E\u4E8E\u5CF0\u503C\u901F\u5EA6", vAvg < REFERENCE.vMax, `\u5E73\u5747 ${vAvg.toFixed(3)} < \u5CF0\u503C ${REFERENCE.vMax.toFixed(3)} m/s`);
    add("\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u5927\u4E8E\u5E73\u52A8\u8D28\u91CF", me > p.m, `${(me * 1e3).toFixed(2)} g vs ${(p.m * 1e3).toFixed(1)} g`);
    const a1 = simulateRun(p, { dt: 1e-3, stopAt: p.track }).t;
    const a2 = simulateRun(p, { dt: 25e-5, stopAt: p.track }).t;
    add(
      "RK4 \u6B65\u957F 1 ms \u4E0E 0.25 ms \u5DEE < 2 ms",
      Math.abs(a1 - a2) < 2e-3,
      `${a1.toFixed(4)} / ${a2.toFixed(4)} s`
    );
    const l = axleLoads(p, 0, 0);
    add(
      "\u524D\u540E\u8F74\u8377\u4E4B\u548C\u7B49\u4E8E\u6574\u8F66\u91CD\u91CF",
      Math.abs(l.nf + l.nr - l.total) < 1e-12,
      `${((l.nf + l.nr) * 1e3).toFixed(3)} mN`
    );
    const vInf = Math.sqrt(rollForce(p) / (0.5 * RHO * p.cd * p.area));
    const dInf = dragForce(vInf, p);
    add(
      "v = \u221A(F_roll/k) \u5904\u6C14\u52A8\u963B\u529B\u7B49\u4E8E\u6EDA\u52A8\u963B\u529B",
      Math.abs(dInf - rollForce(p)) / rollForce(p) < 1e-9,
      `v\u221E = ${vInf.toFixed(3)} m/s\uFF0C\u4E24\u9879\u90FD\u662F ${(dInf * 1e3).toFixed(3)} mN`
    );
    return { ok: rows.every((x) => x.ok), rows, run: r, vAvg };
  }
  function flatParams(over = {}) {
    const p = {};
    for (const k of Object.keys(PARAMS)) p[k] = PARAMS[k].v;
    return Object.assign(p, over);
  }

  // src/physics.js
  var L = 0.2;
  var WAKE = {
    qAmp: 0.22,
    // 中线动压赤字幅值
    qTau: 0.85,
    // 动压恢复长度尺度（车长）
    cAmp: 0.38,
    // 阻力系数折减幅值
    cTau: 1.15,
    // 折减恢复长度尺度（车长）
    sigma0: 0.5,
    // 尾端半宽（车长）
    spread: 0.21
    // 半宽增长率
  };
  var AU = 1 - Math.sqrt(1 - WAKE.qAmp);
  var DEFAULT_STATE = { gap: 0.5, v: REFERENCE.vFinish };
  var LIMITS = {
    gap: { min: 0, max: 5, step: 0.05, unit: "L", label: "\u8DDF\u8F66\u8DDD\u79BB", status: "TYPICAL" },
    v: { min: 5, max: 20, step: 0.1, unit: "m/s", label: "\u8F66\u961F\u901F\u5EA6", status: "DERIVED" }
  };
  function qRatio(gapL) {
    return 1 - WAKE.qAmp * Math.exp(-gapL / WAKE.qTau);
  }
  function cdRatio(gapL) {
    return 1 - WAKE.cAmp * Math.exp(-gapL / WAKE.cTau);
  }
  function dragRatio(gapL) {
    return qRatio(gapL) * cdRatio(gapL);
  }
  function sigma(xL) {
    return WAKE.sigma0 + WAKE.spread * Math.max(xL, 0);
  }
  function velocityRatio(xL, yL) {
    const x = Math.max(xL, 0);
    const s = sigma(x);
    return 1 - AU * Math.exp(-x / WAKE.qTau) * Math.exp(-(yL * yL) / (2 * s * s));
  }
  function deficit(xL, yL = 0) {
    return 1 - velocityRatio(xL, yL);
  }
  function model(state2) {
    const p = flatParams();
    const v = state2.v;
    const gapL = state2.gap;
    const qInf = 0.5 * RHO * v * v;
    const fLead = qInf * p.cd * p.area;
    const qR = qRatio(gapL);
    const cR = cdRatio(gapL);
    const dR = qR * cR;
    const fFol = dR * fLead;
    const saving = fLead - fFol;
    return {
      p,
      v,
      gapL,
      gapMm: gapL * L * 1e3,
      qInf,
      fLead,
      fFol,
      qR,
      cR,
      dR,
      saving,
      dropPct: 1 - dR,
      savingShare: saving / THRUST.Fpeak,
      re: v * L / NU,
      fShed: 0.2 * v / L,
      lambda: L / 0.2,
      uCore: velocityRatio(0, 0),
      sigma0: sigma(0),
      sigmaAt1: sigma(1)
    };
  }
  function runResult() {
    return selfCheck(flatParams());
  }
  function assertions() {
    const out = [];
    const add = (name, ok, detail) => out.push({ name, ok, detail });
    {
      const e0 = Math.abs(qRatio(0) - 0.78);
      const e1 = Math.abs(qRatio(WAKE.qTau) - (1 - 0.22 * Math.exp(-1)));
      add(
        "q/q\u221E \u5728 g=0 \u5904\u7B49\u4E8E 0.78\u3001\u5728 g=\u03C4 \u5904\u7B49\u4E8E 1\u22120.22/e",
        e0 < 1e-12 && e1 < 1e-12,
        `${qRatio(0).toFixed(6)} / ${qRatio(WAKE.qTau).toFixed(6)}`
      );
    }
    {
      const err = Math.abs(Math.pow(velocityRatio(0, 0), 2) - qRatio(0));
      add("\u901F\u5EA6\u573A\u4E2D\u7EBF\u5E73\u65B9\u7B49\u4E8E\u52A8\u538B\u6BD4\uFF08\u4E24\u5957\u53C2\u6570\u540C\u6E90\uFF09", err < 1e-12, `\u504F\u5DEE ${err.toExponential(2)}`);
    }
    {
      let prev = -1, mono = true, at = 0;
      for (let i = 0; i <= 200; i++) {
        const g = i * 0.025;
        const v = dragRatio(g);
        if (v <= prev) {
          mono = false;
          at = g;
        }
        prev = v;
      }
      add("\u963B\u529B\u6BD4\u968F\u8DDF\u8F66\u8DDD\u79BB\u4E25\u683C\u5355\u8C03\u9012\u589E", mono, mono ? "201 \u4E2A\u91C7\u6837\u70B9\u5168\u90E8\u9012\u589E" : `\u5728 g=${at.toFixed(3)} L \u5904\u5931\u6548`);
    }
    {
      const want = (1 - WAKE.qAmp) * (1 - WAKE.cAmp);
      add(
        "g = 0 \u65F6\u963B\u529B\u6BD4\u4E3A 0.78 \xD7 0.62",
        Math.abs(dragRatio(0) - want) < 1e-15,
        `${dragRatio(0).toFixed(9)}`
      );
    }
    {
      const far = dragRatio(40);
      add("g \u2192 \u221E \u65F6\u963B\u529B\u6BD4\u56DE\u5230 1", Math.abs(far - 1) < 1e-6, `${far.toFixed(9)}`);
    }
    {
      const a = model({ gap: 0.2, v: 16.906 }).fLead;
      const b = model({ gap: 4.5, v: 16.906 }).fLead;
      add("\u524D\u8F66\u963B\u529B\u4E0E\u8DDF\u8F66\u8DDD\u79BB\u65E0\u5173", Math.abs(a - b) < 1e-15, `${(a * 1e3).toFixed(4)} mN`);
    }
    {
      const f = model({ gap: 1, v: REFERENCE.vFinish }).fLead;
      add(
        "\u524D\u8F66\u963B\u529B\u5728 16.906 m/s \u5904\u7B49\u4E8E 93.6 mN",
        Math.abs(f * 1e3 - 93.6) < 0.15,
        `${(f * 1e3).toFixed(3)} mN`
      );
    }
    {
      let ok = true;
      for (let i = 0; i <= 100; i++) {
        const m = model({ gap: i * 0.05, v: 12 });
        if (!(m.saving >= 0 && m.saving < m.fLead)) ok = false;
      }
      add("\u7701\u4E0B\u7684\u529B\u975E\u8D1F\u4E14\u5C0F\u4E8E\u524D\u8F66\u963B\u529B", ok, `${(model({ gap: 0.5, v: 12 }).saving * 1e3).toFixed(2)} mN\uFF08g=0.5 L\uFF09`);
    }
    {
      const m = model({ gap: 0, v: REFERENCE.vFinish });
      add("\u8DDF\u8F66\u6536\u76CA\u4E0D\u8DB3\u5CF0\u503C\u63A8\u529B\u7684 1 %", m.savingShare < 0.01, `${(m.savingShare * 100).toFixed(3)} %`);
    }
    {
      const d = sigma(2) - sigma(0);
      add("\u5C3E\u6D41\u534A\u5BBD\u968F\u4E0B\u6E38\u7EBF\u6027\u5F20\u5F00", Math.abs(d - 2 * WAKE.spread) < 1e-12, `\u03C3(2) \u2212 \u03C3(0) = ${d.toFixed(4)}`);
    }
    {
      const far = velocityRatio(30, 0);
      add("\u8FDC\u4E0B\u6E38 u/U \u56DE\u5230 1", Math.abs(far - 1) < 1e-6, `${far.toFixed(9)}`);
    }
    {
      const m = model({ gap: 1, v: REFERENCE.vFinish });
      add("\u96F7\u8BFA\u6570\u5904\u4E8E\u6E4D\u6D41\u5C3E\u6D41\u533A\uFF08Re > 1e4\uFF09", m.re > 1e4, `Re = ${m.re.toExponential(3)}`);
    }
    {
      const sc = selfCheck(flatParams());
      add(
        "\u53C2\u6570\u7EC4\u81EA\u6D3D\uFF08\u51B2\u91CF\xB7\u52A8\u91CF\xB7\u8DDD\u79BB\xB7\u5E73\u5747\u901F\u5EA6\uFF09",
        sc.ok,
        sc.ok ? `${sc.run.t.toFixed(4)} s / ${sc.run.v.toFixed(3)} m/s` : sc.rows.filter((r) => !r.ok).map((r) => r.name).join("\uFF1B")
      );
    }
    return out;
  }

  // src/main.js
  var { W: W2, H: H2, PAPER: PAPER2, ACCENT: ACCENT2, MONO: MONO2, SAFE: SAFE2, rgba: rgba2, accent: accent2 } = plotkit_exports;
  var TEXT = {
    kicker: "\u5C3E\u6D41\u8DDF\u8F66 \uFF0F WAKE-DRAFTING",
    t1: "\u8DDF\u5230\u534A\u4E2A\u8F66\u8EAB",
    t2: "\u98CE\u963B\u53EA\u5269",
    sub: "\u524D\u8F66\u62D6\u51FA\u7684\u4F4E\u901F\u533A\u540C\u65F6\u538B\u4F4E\u52A8\u538B\u548C\u963B\u529B\u7CFB\u6570\uFF0C\u4E24\u4EF6\u4E8B\u76F8\u4E58\u624D\u662F\u963B\u529B\u6BD4",
    sec1: "\u2460 \u4FEF\u89C6\u901F\u5EA6\u573A u / U",
    sec1r: "PSEUDO-COLOR \xB7 \u65E0\u56E0\u6B21",
    sec2: "\u2461 \u5C3E\u8F66\u963B\u529B\u968F\u8DDF\u8F66\u8DDD\u79BB",
    lead: "\u524D\u8F66",
    fol: "\u5C3E\u8F66",
    gapDim: "\u8DDF\u8F66\u8DDD\u79BB",
    core: "\u5C3E\u6D41\u6838\u5FC3 u/U",
    prof: "\u6A2A\u5411\u901F\u5EA6\u5256\u9762",
    legend: "u/U \u8272\u6807 0.88 \u2192 1.00\uFF0C\u03B3 \u5DF2\u63D0\u4EAE",
    coef: "\u7B49\u503C\u7EBF u/U 0.99\uFF0F0.97\uFF0F0.95\u3000\u52A8\u538B\u8D64\u5B57 0.22 e^(\u2212g/0.85)\u3000\u963B\u529B\u7CFB\u6570\u6298\u51CF 0.38 e^(\u2212g/1.15)\u3000[TYPICAL]",
    noWake: "\u524D\u8F66\uFF08\u65E0\u5C3E\u6D41\uFF09",
    dragCap: "\u5C3E\u8F66\u963B\u529B",
    ratioCap: "\u76F8\u5BF9\u524D\u8F66",
    savingCap: "\u7701\u4E0B\u7684\u529B",
    thrustShare: "\u5360\u5CF0\u503C\u63A8\u529B",
    foot: "\u51C6\u9759\u6001\u8FDC\u573A\u5C3E\u6D41\u6A21\u578B \xB7 \u975E CFD \xB7 \u975E\u5B9E\u6D4B",
    reFoot: "\u96F7\u8BFA\u6570",
    shedFoot: "\u8131\u843D\u9891\u7387",
    station: "x =",
    c0: "L"
  };
  var CHARS = Object.values(TEXT).join("");
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var state = { ...DEFAULT_STATE };
  var FLD = { x: 60, y: 610, w: 870, h: 370 };
  var PPL = FLD.w / 7;
  var TAIL = FLD.x + FLD.w;
  var CY = FLD.y + FLD.h / 2;
  var HALF = 0.14 * PPL;
  var CH = { x: 150, y: 1040, w: 780, h: 170 };
  var field = document.createElement("canvas");
  field.width = FLD.w;
  field.height = FLD.h;
  function buildField() {
    const g = field.getContext("2d");
    g.clearRect(0, 0, FLD.w, FLD.h);
    const step = 5;
    for (let px = 0; px < FLD.w; px += step) {
      const xL = (TAIL - (FLD.x + px + step / 2)) / PPL;
      if (xL < 0) continue;
      for (let py = 0; py < FLD.h; py += step) {
        const yL = (FLD.y + py + step / 2 - CY) / PPL;
        const d = deficit(xL, yL);
        if (d < 1e-4) continue;
        const a = 0.6 * Math.sqrt(Math.min(1, d / AU));
        g.fillStyle = `rgba(242,240,235,${Math.min(0.62, a).toFixed(4)})`;
        g.fillRect(px, py, step, step);
      }
    }
  }
  function compose() {
    const m = model(state);
    const run = runResult();
    backdrop(ctx);
    accentRule(ctx, SAFE2.x0, 300);
    kicker(ctx, TEXT.kicker, 334);
    title(ctx, [TEXT.t1, `${TEXT.t2} ${(m.dR * 100).toFixed(1)} %`], 410, { size: 58, lead: 68 });
    sub(ctx, TEXT.sub, 536);
    hairline(ctx, 564);
    label(ctx, TEXT.sec1, SAFE2.x0, 594, { color: rgba2(0.5) });
    label(ctx, TEXT.sec1r, SAFE2.x1, 594, { color: rgba2(0.32), align: "right" });
    drawField(m);
    label(ctx, TEXT.sec2, SAFE2.x0, 1014, { color: rgba2(0.5) });
    label(
      ctx,
      `${(m.fFol * 1e3).toFixed(1)} mN`,
      SAFE2.x1,
      1014,
      { color: m.gapL < 0.3 ? ACCENT2 : PAPER2, align: "right", font: `600 16px ${MONO2}`, spacing: 0 }
    );
    drawCurve(m);
    hairline(ctx, 1290);
    readout(ctx, {
      x: SAFE2.x0,
      y: 1330,
      value: (m.fFol * 1e3).toFixed(1),
      unit: "mN",
      caption: TEXT.dragCap,
      status: "TYPICAL",
      color: PAPER2,
      size: 40
    });
    readout(ctx, {
      x: 348,
      y: 1330,
      value: (m.dR * 100).toFixed(1),
      unit: "%",
      caption: TEXT.ratioCap,
      status: "DERIVED",
      color: m.gapL < 0.3 ? ACCENT2 : PAPER2,
      size: 40
    });
    readout(ctx, {
      x: 664,
      y: 1330,
      value: (m.saving * 1e3).toFixed(1),
      unit: "mN",
      caption: TEXT.savingCap,
      status: `${TEXT.thrustShare} ${(m.savingShare * 100).toFixed(2)} %`,
      color: ACCENT2,
      size: 40
    });
    hairline(ctx, 1420);
    label(ctx, TEXT.foot, SAFE2.x0, 1448, { color: rgba2(0.42) });
    label(
      ctx,
      `${TEXT.reFoot} ${m.re.toExponential(2).replace("e+", "E")}\u3000${TEXT.shedFoot} ${m.fShed.toFixed(2)} Hz`,
      SAFE2.x1,
      1448,
      { color: rgba2(0.42), align: "right" }
    );
  }
  function drawField(m) {
    ctx.drawImage(field, FLD.x, FLD.y);
    ctx.save();
    ctx.strokeStyle = rgba2(0.22);
    ctx.lineWidth = 1;
    ctx.strokeRect(FLD.x + 0.5, FLD.y + 0.5, FLD.w - 1, FLD.h - 1);
    ctx.setLineDash([2, 8]);
    ctx.beginPath();
    ctx.moveTo(FLD.x, CY + 0.5);
    ctx.lineTo(FLD.x + FLD.w, CY + 0.5);
    ctx.stroke();
    ctx.restore();
    const K_BULGE = 1500;
    for (const xs of [0.6, 1.6, 3]) {
      const bx = TAIL - xs * PPL;
      if (bx < FLD.x + 8) continue;
      ctx.save();
      ctx.strokeStyle = PAPER2;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      for (let py = 6; py <= FLD.h - 6; py += 4) {
        const yL = (FLD.y + py - CY) / PPL;
        const d = deficit(xs, yL);
        const px = bx - d * K_BULGE;
        if (py === 6) ctx.moveTo(px, FLD.y + py);
        else ctx.lineTo(px, FLD.y + py);
      }
      ctx.stroke();
      ctx.restore();
      label(
        ctx,
        `${TEXT.station} ${xs.toFixed(1)}${TEXT.c0}`,
        bx + 6,
        FLD.y + 24,
        { color: rgba2(0.42), font: `400 12px ${MONO2}`, spacing: 0 }
      );
    }
    for (const c of [0.99, 0.97, 0.95]) {
      const target = 1 - c;
      const xmax = WAKE.qTau * Math.log(AU / target);
      if (!(xmax > 0.02)) continue;
      ctx.save();
      ctx.strokeStyle = c === 0.95 ? accent2(0.55) : rgba2(c === 0.97 ? 0.46 : 0.3);
      ctx.lineWidth = 1.4;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const x = xmax * i / 48;
          const amp = AU * Math.exp(-x / WAKE.qTau);
          const y = sigma(x) * Math.sqrt(2 * Math.log(amp / target));
          const px = TAIL - x * PPL;
          const py = CY + sign * y * PPL;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    drawCar(TAIL - PPL, CY, TEXT.lead, false);
    const nose = TAIL - PPL * (1 + state.gap);
    drawCar(nose - PPL, CY, TEXT.fol, true);
    text(
      ctx,
      `${TEXT.core} ${m.uCore.toFixed(3)}`,
      nose - 4,
      CY - HALF - 12,
      { font: `500 13px ${MONO2}`, color: PAPER2, align: "right" }
    );
    const dimY = CY + HALF + 46;
    ctx.save();
    ctx.strokeStyle = accent2(0.9);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nose + 0.5, dimY);
    ctx.lineTo(nose + 0.5, CY + HALF + 6);
    ctx.moveTo(nose + 0.5, dimY);
    ctx.lineTo(TAIL - PPL - 0.5, dimY);
    ctx.moveTo(TAIL - PPL - 0.5, dimY);
    ctx.lineTo(TAIL - PPL - 0.5, CY + HALF + 6);
    ctx.stroke();
    ctx.restore();
    arrow(ctx, TAIL - PPL - 6, dimY, TAIL - PPL - 26, dimY, { color: accent2(0.9), width: 1.5, head: 8 });
    arrow(ctx, nose + 6, dimY, nose + 26, dimY, { color: accent2(0.9), width: 1.5, head: 8 });
    text(
      ctx,
      `${TEXT.gapDim} g = ${state.gap.toFixed(2)} L = ${m.gapMm.toFixed(0)} mm`,
      (nose + TAIL - PPL) / 2,
      dimY - 10,
      { font: `600 15px ${MONO2}`, color: PAPER2, align: "center" }
    );
    const lgY = FLD.y + FLD.h - 42;
    for (let i = 0; i < 24; i++) {
      const a = 0.6 * Math.sqrt(1 - i / 24);
      ctx.save();
      ctx.fillStyle = `rgba(242,240,235,${a.toFixed(3)})`;
      ctx.fillRect(FLD.x + 16 + i * 9, lgY, 9, 12);
      ctx.restore();
    }
    label(ctx, TEXT.legend, FLD.x + 16, lgY + 30, { color: rgba2(0.42), font: `400 12px ${MONO2}`, spacing: 0 });
    label(ctx, TEXT.coef, FLD.x + 300, lgY + 30, { color: rgba2(0.34), font: `400 12px ${MONO2}`, spacing: 0 });
  }
  function drawCar(x0, cy, labelStr, isFollower) {
    ctx.save();
    ctx.fillStyle = rgba2(0.13);
    ctx.strokeStyle = isFollower ? ACCENT2 : PAPER2;
    ctx.lineWidth = isFollower ? 2 : 1.5;
    ctx.beginPath();
    ctx.rect(x0, cy - HALF, PPL, HALF * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 + PPL - 14, cy);
    ctx.lineTo(x0 + PPL - 4, cy);
    ctx.stroke();
    ctx.restore();
    label(
      ctx,
      labelStr,
      x0 + 4,
      cy + HALF + 16,
      { color: isFollower ? ACCENT2 : rgba2(0.5), font: `500 12px ${MONO2}`, spacing: 0 }
    );
  }
  function drawCurve(m) {
    const box = CH;
    const gMax = LIMITS.gap.max;
    const fMax = 100;
    const s = frame(ctx, box, { x0: 0, x1: gMax, y0: 0, y1: fMax }, {
      xLabel: "\u8DDF\u8F66\u8DDD\u79BB g (\u8F66\u957F)",
      yLabel: "\u5C3E\u8F66\u963B\u529B (mN)",
      xTicks: 5,
      yTicks: 4,
      xFmt: (v) => v.toFixed(0),
      yFmt: (v) => v.toFixed(0)
    });
    const pts2 = [];
    for (let i = 0; i <= 150; i++) {
      const g = gMax * i / 150;
      pts2.push([g, model({ gap: g, v: state.v }).fFol * 1e3]);
    }
    area(ctx, s, pts2, { color: accent2(0.15) });
    line(ctx, s, pts2, { color: ACCENT2, width: 3 });
    const fl = m.fLead * 1e3;
    line(ctx, s, [[0, fl], [gMax, fl]], { color: PAPER2, width: 1.5, dashed: true });
    label(
      ctx,
      TEXT.noWake,
      box.x + box.w - 4,
      s.sy(fl) - 9,
      { color: rgba2(0.6), align: "right", font: `500 13px ${MONO2}`, spacing: 0 }
    );
    const cx = s.sx(state.gap);
    const cy = s.sy(m.fFol * 1e3);
    ctx.save();
    ctx.strokeStyle = rgba2(0.32);
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, box.y + box.h);
    ctx.lineTo(cx + 0.5, cy);
    ctx.stroke();
    ctx.restore();
    dot(ctx, cx, cy, 5.5, PAPER2, ACCENT2);
  }
  function selfTest() {
    const checks = assertions();
    const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} \u2014 ${c.detail}`);
    if (canvas.width !== W2 || canvas.height !== H2) errs.push(`\u753B\u5E03\u5C3A\u5BF8 ${canvas.width}\xD7${canvas.height}`);
    if (!(FLD.y > 564 && FLD.y + FLD.h < 1014)) errs.push("\u901F\u5EA6\u573A\u538B\u5230\u9875\u7709\u6216\u66F2\u7EBF\u533A");
    if (!(FLD.x >= SAFE2.x0 && FLD.x + FLD.w <= SAFE2.x1 + 1)) errs.push("\u901F\u5EA6\u573A\u538B\u51FA\u5B89\u5168\u533A");
    if (!(CH.y > FLD.y + FLD.h + 40)) errs.push("\u66F2\u7EBF\u538B\u5230\u901F\u5EA6\u573A");
    if (!(CH.y + CH.h + 50 < 1330 - 40)) errs.push("\u66F2\u7EBF\u538B\u5230\u8BFB\u6570");
    const nose = TAIL - PPL * (1 + LIMITS.gap.max);
    if (!(nose - PPL >= FLD.x - 1)) errs.push(`\u6700\u5927\u95F4\u8DDD\u65F6\u5C3E\u8F66\u51FA\u6846\uFF1A${(nose - PPL).toFixed(1)}`);
    if (!(model({ gap: 0, v: 12 }).saving >= 0)) errs.push("\u7701\u4E0B\u7684\u529B\u51FA\u73B0\u8D1F\u503C");
    return { ok: errs.length === 0, errs, checks };
  }
  window.__app = {
    canvas,
    canvasChars: CHARS,
    getState: () => ({ ...state }),
    getMetrics: () => {
      const m = model(state);
      const run = runResult();
      return {
        gapL: m.gapL,
        gapMm: m.gapMm,
        fLead: m.fLead,
        fFol: m.fFol,
        qR: m.qR,
        cR: m.cR,
        dR: m.dR,
        saving: m.saving,
        savingShare: m.savingShare,
        uCore: m.uCore,
        re: m.re,
        fShed: m.fShed,
        v: m.v,
        tTotal: run.run.t,
        vExit: run.run.v,
        bandOk: run.ok,
        thrust: THRUST.Fpeak
      };
    },
    set: (k, v) => {
      if (k in state) {
        state[k] = v;
        compose();
      }
    },
    reset: () => {
      Object.assign(state, DEFAULT_STATE);
      compose();
    },
    selfTest,
    model: (s) => model(s ? { ...state, ...s } : state),
    assertions: () => assertions(),
    exportPNG: async () => {
      compose();
      const b = await toPNG(canvas, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      compose();
      const b = await toPNG(canvas, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(canvas, "wake-drafting")
  };
  for (const key of Object.keys(LIMITS)) {
    const el = document.getElementById("in-" + key);
    const out = document.getElementById("out-" + key);
    if (!el) continue;
    const L2 = LIMITS[key];
    el.min = L2.min;
    el.max = L2.max;
    el.step = L2.step;
    el.value = state[key];
    const fmt = (v) => key === "gap" ? v.toFixed(2) + L2.unit : v.toFixed(1) + L2.unit;
    const sync = () => {
      state[key] = parseFloat(el.value);
      if (out) out.textContent = fmt(state[key]);
      compose();
    };
    el.addEventListener("input", sync);
    if (out) out.textContent = fmt(state[key]);
  }
  var btn = document.getElementById("export");
  if (btn) btn.addEventListener("click", () => {
    window.__app.downloadAll().catch((e) => console.error(e));
  });
  buildField();
  compose();
})();
