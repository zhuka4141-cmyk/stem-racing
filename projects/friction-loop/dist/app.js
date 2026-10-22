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
  function yawLimit(p = flatParams(), nf) {
    return p.mu * nf * p.armPin;
  }
  function criticalOffset(p = flatParams(), thrust = THRUST.Fpeak, nf) {
    return yawLimit(p, nf) / thrust;
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
  var DEFAULT_STATE = { d: 0.3, toe: 0, mu: 0.6 };
  var LIMITS = {
    d: { min: 0, max: 0.6, step: 5e-3, unit: "mm", label: "\u8D28\u5FC3\u6A2A\u5411\u504F\u79FB", status: "TYPICAL" },
    toe: { min: 0, max: 5, step: 0.05, unit: "\xB0", label: "\u524D\u8F6E\u524D\u675F\u89D2", status: "VERIFY" },
    mu: { min: 0.35, max: 0.9, step: 0.01, unit: "", label: "\u8F6E\u8F68\u6469\u64E6\u7CFB\u6570", status: "TYPICAL" }
  };
  function model(state2) {
    const p = flatParams({ mu: state2.mu });
    const loads = axleLoads(p, 0, 0);
    const Nf = loads.nf;
    const Nw = Nf / 2;
    const cap = p.mu * Nw;
    const dM = state2.d / 1e3;
    const fy = THRUST.Fpeak * dM / (2 * p.armPin);
    const roll = p.crr * Nw;
    const scrub = p.mu * Nw * Math.abs(Math.sin(state2.toe * Math.PI / 180));
    const fx = roll + scrub;
    const mag = Math.hypot(fx, fy);
    const dCrit = criticalOffset(p, THRUST.Fpeak, Nf) * 1e3;
    return {
      p,
      Nf,
      Nr: loads.nr,
      Nw,
      cap,
      fx,
      fy,
      roll,
      scrub,
      mag,
      dCrit,
      usage: mag / cap,
      lateralUsage: fy / cap,
      moment: THRUST.Fpeak * dM,
      // N·m
      momentLimit: yawLimit(p, Nf),
      // N·m
      margin: 1 - mag / cap,
      slipping: mag > cap,
      dRatio: dM / (dCrit / 1e3),
      // 当前偏移是临界的几倍
      forceRatio: mag / cap
    };
  }
  function runResult() {
    return selfCheck(flatParams());
  }
  function assertions() {
    const out = [];
    const add = (name, ok, detail) => out.push({ name, ok, detail });
    {
      const a = model({ d: 0.3, toe: 0, mu: 0.4 }).cap;
      const b = model({ d: 0.3, toe: 0, mu: 0.8 }).cap;
      const ratio = b / a;
      add("\u6469\u64E6\u5706\u534A\u5F84 \u221D \u03BC\uFF08\u03BC \u52A0\u500D\uFF0C\u534A\u5F84\u52A0\u500D\uFF09", Math.abs(ratio - 2) < 1e-12, `\u6BD4\u503C ${ratio.toFixed(12)}`);
    }
    {
      const m1 = model({ d: 0.3, toe: 0, mu: 0.6 });
      const half = 0.5 * m1.p.mu * (m1.Nf / 2);
      add(
        "\u534A\u5F84 = \u03BC\xB7N\uFF08\u5355\u8F6E\u8F7D\u8377\u51CF\u534A\uFF0C\u534A\u5F84\u51CF\u534A\uFF09",
        Math.abs(half - 0.5 * m1.cap) < 1e-12,
        `${(half * 1e3).toFixed(4)} mN`
      );
    }
    {
      let prev = -1, mono = true, at = 0;
      for (let i = 0; i <= 60; i++) {
        const d = i * 0.01;
        const v = model({ d, toe: 0, mu: 0.6 }).fy;
        if (v <= prev) {
          mono = false;
          at = d;
        }
        prev = v;
      }
      add("\u4FA7\u5411\u9700\u6C42 F_y \u968F\u8D28\u5FC3\u504F\u79FB\u4E25\u683C\u5355\u8C03\u9012\u589E", mono, mono ? "61 \u4E2A\u91C7\u6837\u70B9\u5168\u90E8\u9012\u589E" : `\u5728 d=${at.toFixed(3)} mm \u5904\u5931\u6548`);
    }
    {
      const m0 = model({ d: 0.3, toe: 0, mu: 0.6 });
      const mC = model({ d: m0.dCrit, toe: 0, mu: 0.6 });
      const err = Math.abs(mC.lateralUsage - 1);
      add("d = d_crit \u5904 F_y \u6070\u597D\u7B49\u4E8E \u03BCN", err < 1e-9, `\u504F\u5DEE ${err.toExponential(2)}`);
    }
    {
      const m0 = model({ d: 0, toe: 0, mu: 0.6 });
      add("d = 0 \u65F6\u4F7F\u7528\u7387 < 5 %", m0.usage < 0.05, `${(m0.usage * 100).toFixed(2)} %`);
    }
    {
      const a = model({ d: 0.3, toe: 0, mu: 0.6 });
      const b = model({ d: 0.3, toe: 3, mu: 0.6 });
      add(
        "\u524D\u675F 3\xB0 \u4F7F\u4F7F\u7528\u7387\u4E0A\u5347",
        b.usage > a.usage,
        `${(a.usage * 100).toFixed(2)} % \u2192 ${(b.usage * 100).toFixed(2)} %`
      );
    }
    {
      const m0 = model({ d: 0.3, toe: 0, mu: 0.6 });
      const over = model({ d: m0.dCrit * 1.15, toe: 0, mu: 0.6 });
      add(
        "d > d_crit \u5224\u5B9A\u4E3A\u6253\u6ED1",
        over.slipping && !m0.slipping,
        `${(over.usage * 100).toFixed(1)} % > 100 %`
      );
    }
    {
      const p = flatParams();
      const Nf = axleLoads(p, 0, 0).nf;
      const dA = p.mu * (Nf / 2) * 2 * p.armPin / THRUST.Fpeak;
      const dB = yawLimit(p, Nf) / THRUST.Fpeak;
      add(
        "\u4E24\u6761\u8DEF\u5F84\u7B97\u51FA\u7684 d_crit \u4E00\u81F4",
        Math.abs(dA - dB) < 1e-15,
        `${(dA * 1e3).toFixed(6)} / ${(dB * 1e3).toFixed(6)} mm`
      );
    }
    {
      const a = model({ d: 0, toe: 0, mu: 0.4 }).dCrit;
      const b = model({ d: 0, toe: 0, mu: 0.8 }).dCrit;
      add("d_crit \u221D \u03BC", Math.abs(b / a - 2) < 1e-12, `\u6BD4\u503C ${(b / a).toFixed(12)}`);
    }
    {
      const a = model({ d: 0.3, toe: 1, mu: 0.6 }).scrub;
      const b = model({ d: 0.3, toe: 2, mu: 0.6 }).scrub;
      const want = Math.sin(2 * Math.PI / 180) / Math.sin(1 * Math.PI / 180);
      add(
        "\u524D\u675F\u522E\u64E6\u529B \u221D sin\u03B8",
        Math.abs(b / a - want) < 1e-12,
        `\u6BD4\u503C ${(b / a).toFixed(6)} vs sin2\xB0/sin1\xB0 ${want.toFixed(6)}`
      );
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
    kicker: "\u524D\u8F6E\u6469\u64E6\u5706 \uFF0F FRICTION-LOOP",
    t1: "\u524D\u8F6E\u79BB\u4FA7\u6ED1",
    t2: "\u53EA\u5DEE",
    mm: "\u6BEB\u7C73",
    sub: "\u7EB5\u5411\u529B\u548C\u4FA7\u5411\u529B\u5171\u7528\u540C\u4E00\u4EFD\u6469\u64E6\uFF0C\u6781\u9650\u662F\u4E00\u4E2A\u5706\uFF0C\u4E0D\u662F\u4E24\u6761\u72EC\u7ACB\u7684\u7EBF",
    sec1: "\u2460 \u5355\u4E2A\u524D\u8F6E\u63A5\u89E6\u6591",
    sec1r: "FRICTION CIRCLE \xB7 Fx / Fy",
    capLabel: "\u6469\u64E6\u5706 \u03BC\xB7N",
    fyAxis: "\u4FA7\u5411\u529B Fy",
    fxAxis: "\u7EB5\u5411\u529B Fx",
    rollLabel: "\u6EDA\u52A8\u963B\u529B",
    top: "\u4FEF\u89C6 \xB7 \u63A8\u529B\u7EBF\u76F8\u5BF9\u8D28\u5FC3",
    pin: "\u5BFC\u8F68\u9500",
    com: "\u8D28\u5FC3",
    yaw: "\u504F\u822A\u529B\u77E9",
    exag: "\u6A2A\u5411\u653E\u5927",
    e1: "\u63A8\u529B\u7EBF\u504F\u51FA\u8D28\u5FC3 d\uFF0C\u4EA7\u751F\u504F\u822A\u529B\u77E9 M = F\xB7d",
    e2: "\u4E24\u4E2A\u524D\u8F6E\u7528\u4FA7\u5411\u6469\u64E6\u9876\u4F4F\u5B83\uFF0C\u4E0A\u9650 \u03BC\xB7Nf\xB7arm",
    e3: "d \u8D8A\u8FC7\u4E34\u754C\u503C\uFF0C\u524D\u8F6E\u62B1\u4E0D\u4F4F\uFF0C\u8F66\u5934\u5F00\u59CB\u6446",
    sec2: "\u2461 \u6469\u64E6\u5706\u4F7F\u7528\u7387",
    limit: "100 % \u6781\u9650",
    curve: "\u4F7F\u7528\u7387\u968F\u8D28\u5FC3\u504F\u79FB d \u7684\u8D70\u5411",
    dCap: "\u5F53\u524D\u6A2A\u5411\u504F\u79FB",
    dCritCap: "\u4E34\u754C\u504F\u79FB",
    marginCap: "\u5269\u4F59\u4F59\u91CF",
    sliding: "\u5DF2\u4FA7\u6ED1",
    held: "\u8FD8\u62B1\u5F97\u4F4F",
    magCap: "\u5408\u529B",
    foot: "\u8F6E\u8F68\u6469\u64E6\u7CFB\u6570\u53D6\u6587\u732E\u4E2D\u503C\uFF0C\u8D5B\u524D\u5FC5\u987B\u91CD\u6D4B",
    sanity: "\u6574\u8DD1",
    sanityOk: "\u53C2\u6570\u7EC4\u81EA\u6D3D",
    sanityBad: "\u53C2\u6570\u7EC4\u77DB\u76FE",
    derived: "\u63A8\u5BFC\u91CF",
    typical: "\u6587\u732E\u4E2D\u503C"
  };
  var CHARS = Object.values(TEXT).join("");
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var state = { ...DEFAULT_STATE };
  var C = { x: 292, y: 790, r: 148 };
  var SCH = { x0: 522, x1: 930, cy: 700, halfW: 24 };
  var BAR = { x0: 60, x1: 930, y: 1046, h: 26, max: 200 };
  var CH = { x: 150, y: 1116, w: 780, h: 144 };
  function compose() {
    const m = model(state);
    const run = runResult();
    backdrop(ctx);
    accentRule(ctx, SAFE2.x0, 300);
    kicker(ctx, TEXT.kicker, 334);
    title(ctx, [TEXT.t1, TEXT.t2 + " " + m.dCrit.toFixed(3) + " " + TEXT.mm], 410, { size: 58, lead: 68 });
    sub(ctx, TEXT.sub, 536);
    hairline(ctx, 564);
    label(ctx, TEXT.sec1, SAFE2.x0, 596, { color: rgba2(0.5) });
    label(ctx, TEXT.sec1r, SAFE2.x1, 596, { color: rgba2(0.32), align: "right" });
    drawCircle(m);
    label(ctx, TEXT.top, SCH.x0, 640, { color: rgba2(0.5) });
    drawSchematic(m);
    text(ctx, TEXT.e1, SCH.x0, 790, { font: `400 15px ${MONO2}`, color: rgba2(0.62) });
    text(ctx, TEXT.e2, SCH.x0, 816, { font: `400 15px ${MONO2}`, color: rgba2(0.62) });
    text(ctx, TEXT.e3, SCH.x0, 842, { font: `400 15px ${MONO2}`, color: m.slipping ? ACCENT2 : rgba2(0.62) });
    text(
      ctx,
      `M = ${(m.moment * 1e3).toFixed(3)} mN\xB7m`,
      SCH.x0,
      884,
      { font: `600 21px ${MONO2}`, color: PAPER2 }
    );
    label(
      ctx,
      `M_lim = ${(m.momentLimit * 1e3).toFixed(3)} mN\xB7m`,
      SCH.x0 + 250,
      884,
      { color: rgba2(0.45), font: `400 15px ${MONO2}`, spacing: 0 }
    );
    label(
      ctx,
      `d / d_crit = ${m.dRatio.toFixed(3)}`,
      SCH.x0,
      914,
      { color: m.slipping ? ACCENT2 : rgba2(0.55), font: `500 15px ${MONO2}`, spacing: 0 }
    );
    label(
      ctx,
      `${TEXT.magCap} |F| = ${(m.mag * 1e3).toFixed(2)} mN`,
      SAFE2.x0,
      968,
      { color: m.slipping ? ACCENT2 : rgba2(0.7), font: `500 16px ${MONO2}`, spacing: 0 }
    );
    label(
      ctx,
      `d / d_crit = ${m.dRatio.toFixed(3)}`,
      SAFE2.x1,
      968,
      { color: m.slipping ? ACCENT2 : rgba2(0.6), font: `500 16px ${MONO2}`, spacing: 0, align: "right" }
    );
    label(
      ctx,
      `Fy ${(m.fy * 1e3).toFixed(2)}   Fx ${(m.fx * 1e3).toFixed(2)}   \u03BCN ${(m.cap * 1e3).toFixed(2)}   (mN)`,
      SAFE2.x0,
      990,
      { color: rgba2(0.45), font: `400 15px ${MONO2}`, spacing: 0 }
    );
    label(
      ctx,
      `Nf ${m.Nf.toFixed(3)} N   Nw ${m.Nw.toFixed(3)} N   arm ${(m.p.armPin * 1e3).toFixed(1)} mm`,
      SAFE2.x1,
      990,
      { color: rgba2(0.45), font: `400 15px ${MONO2}`, spacing: 0, align: "right" }
    );
    label(ctx, TEXT.sec2, SAFE2.x0, 1016, { color: rgba2(0.5) });
    bigNum(
      ctx,
      (m.usage * 100).toFixed(1) + " %",
      SAFE2.x1,
      1026,
      { size: 42, color: m.slipping ? ACCENT2 : PAPER2, align: "right" }
    );
    drawBar(m);
    drawCurve(m);
    hairline(ctx, 1322);
    readout(ctx, {
      x: SAFE2.x0,
      y: 1358,
      value: state.d.toFixed(3),
      unit: "mm",
      caption: TEXT.dCap,
      status: TEXT.typical,
      color: PAPER2,
      size: 40
    });
    readout(ctx, {
      x: 348,
      y: 1358,
      value: m.dCrit.toFixed(3),
      unit: "mm",
      caption: TEXT.dCritCap,
      status: TEXT.derived,
      color: ACCENT2,
      size: 40
    });
    readout(ctx, {
      x: 664,
      y: 1358,
      value: (m.margin * 100).toFixed(1),
      unit: "%",
      caption: TEXT.marginCap,
      status: m.slipping ? TEXT.sliding : TEXT.held,
      color: m.slipping ? ACCENT2 : PAPER2,
      size: 40
    });
    hairline(ctx, 1420);
    label(ctx, TEXT.foot, SAFE2.x0, 1448, { color: rgba2(0.42) });
    label(
      ctx,
      `${TEXT.sanity} ${run.run.t.toFixed(4)} s \xB7 ${run.ok ? TEXT.sanityOk : TEXT.sanityBad}`,
      SAFE2.x1,
      1448,
      { color: run.ok ? rgba2(0.42) : ACCENT2, align: "right" }
    );
  }
  function drawCircle(m) {
    const s = C.r / m.cap;
    ctx.save();
    ctx.fillStyle = rgba2(0.062);
    ctx.beginPath();
    ctx.arc(C.x, C.y, C.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba2(0.24);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(C.x - C.r - 26, C.y + 0.5);
    ctx.lineTo(C.x + C.r + 26, C.y + 0.5);
    ctx.moveTo(C.x + 0.5, C.y - C.r - 26);
    ctx.lineTo(C.x + 0.5, C.y + C.r + 26);
    ctx.stroke();
    ctx.restore();
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.save();
      ctx.strokeStyle = rgba2(0.13);
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(C.x, C.y, C.r * f, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = PAPER2;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(C.x, C.y, C.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const theta = Math.atan2(m.fy, m.fx);
    if (Math.abs(theta) > 1e-4) {
      ctx.save();
      ctx.fillStyle = accent2(m.slipping ? 0.3 : 0.15);
      ctx.beginPath();
      ctx.moveTo(C.x, C.y);
      ctx.arc(C.x, C.y, C.r, 0, -theta, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const px = C.x + m.fx * s;
    const py = C.y - m.fy * s;
    ctx.save();
    ctx.strokeStyle = rgba2(0.25);
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, C.y);
    ctx.moveTo(px, py);
    ctx.lineTo(C.x, py);
    ctx.stroke();
    ctx.restore();
    arrow(ctx, C.x, C.y, px, py, { color: ACCENT2, width: 3, head: 14 });
    dot(ctx, px, py, 5, ACCENT2);
    if (m.slipping) {
      ctx.save();
      ctx.strokeStyle = ACCENT2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const ra = -Math.PI / 4;
    callout(
      ctx,
      C.x + Math.cos(ra) * C.r,
      C.y + Math.sin(ra) * C.r,
      C.x + Math.cos(ra) * C.r - 40,
      C.y + Math.sin(ra) * C.r + 34,
      `${TEXT.capLabel} = ${(m.cap * 1e3).toFixed(2)} mN`,
      { align: "right", color: rgba2(0.62) }
    );
    text(ctx, TEXT.fyAxis, C.x, C.y - C.r - 36, { font: `500 15px ${MONO2}`, color: rgba2(0.55), align: "center" });
    text(ctx, TEXT.fxAxis, C.x + C.r + 30, C.y + 6, { font: `500 15px ${MONO2}`, color: rgba2(0.55) });
    text(ctx, "0", C.x - 10, C.y + 22, { font: `400 13px ${MONO2}`, color: rgba2(0.38), align: "right" });
    text(
      ctx,
      `+${(m.cap * 1e3).toFixed(1)}`,
      C.x + C.r,
      C.y + 22,
      { font: `400 13px ${MONO2}`, color: rgba2(0.38), align: "center" }
    );
    text(
      ctx,
      `+${(m.cap * 1e3).toFixed(1)}`,
      C.x - 10,
      C.y - C.r + 6,
      { font: `400 13px ${MONO2}`, color: rgba2(0.38), align: "right" }
    );
    label(ctx, "mN", C.x + C.r + 30, C.y + 26, { color: rgba2(0.3), font: `400 13px ${MONO2}`, spacing: 0 });
    callout(
      ctx,
      C.x + m.fx * s,
      C.y - 3,
      C.x + 66,
      C.y + 104,
      `${TEXT.rollLabel} ${(m.roll * 1e3).toFixed(2)} mN`,
      { color: rgba2(0.5) }
    );
  }
  function drawSchematic(m) {
    const x0 = SCH.x0, x1 = SCH.x1, cy = SCH.cy;
    const scaleX = (x1 - x0) / 0.2;
    const scaleY = 22;
    const exag = scaleY * 1e3 / scaleX;
    ctx.save();
    ctx.strokeStyle = accent2(0.55);
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 - 8, cy + 0.5);
    ctx.lineTo(x1 + 8, cy + 0.5);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = rgba2(0.09);
    ctx.strokeStyle = rgba2(0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x0, cy - SCH.halfW, x1 - x0, SCH.halfW * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = PAPER2;
    ctx.fillRect(x0 + 12, cy - 4, 8, 8);
    ctx.restore();
    text(ctx, TEXT.pin, x0 + 8, cy - SCH.halfW - 10, { font: `400 12px ${MONO2}`, color: rgba2(0.45) });
    arrow(ctx, x1 - 140, cy, x1 - 20, cy, { color: accent2(0.55), width: 2, head: 11 });
    const comX = x0 + (x1 - x0) * m.p.comFrac;
    const dy = clamp(state.d * scaleY, -70, 70);
    const comY = cy + dy;
    ctx.save();
    ctx.strokeStyle = rgba2(0.3);
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(comX + 0.5, cy);
    ctx.lineTo(comX + 0.5, comY);
    ctx.stroke();
    ctx.restore();
    if (Math.abs(dy) > 2) {
      ctx.save();
      ctx.strokeStyle = PAPER2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(comX + 46, cy);
      ctx.lineTo(comX + 46, comY);
      ctx.moveTo(comX + 40, cy + 0.5);
      ctx.lineTo(comX + 52, cy + 0.5);
      ctx.moveTo(comX + 40, comY + 0.5);
      ctx.lineTo(comX + 52, comY + 0.5);
      ctx.stroke();
      ctx.restore();
      text(
        ctx,
        `${TEXT.com} ${state.d.toFixed(3)} mm`,
        comX + 58,
        (cy + comY) / 2 + (dy >= 0 ? 18 : -8),
        { font: `500 13px ${MONO2}`, color: PAPER2 }
      );
    }
    ctx.save();
    ctx.strokeStyle = PAPER2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(comX - 9, comY);
    ctx.lineTo(comX + 9, comY);
    ctx.moveTo(comX, comY - 9);
    ctx.lineTo(comX, comY + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(comX, comY, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = accent2(0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x0 + 30, cy, 34, -1.95, -0.34);
    ctx.stroke();
    ctx.restore();
    const ea = -0.34;
    arrow(
      ctx,
      x0 + 30 + Math.cos(ea) * 34,
      cy + Math.sin(ea) * 34,
      x0 + 30 + Math.cos(ea) * 46,
      cy + Math.sin(ea) * 46,
      { color: accent2(0.85), width: 2, head: 9 }
    );
    text(ctx, TEXT.yaw, x0 + 2, cy + 62, { font: `400 12px ${MONO2}`, color: rgba2(0.45) });
    label(
      ctx,
      `${TEXT.exag} ${exag.toFixed(1)}\xD7`,
      SCH.x1,
      cy + SCH.halfW + 24,
      { color: rgba2(0.34), align: "right", font: `400 12px ${MONO2}`, spacing: 0 }
    );
  }
  function drawBar(m) {
    const { x0, x1, y, h, max } = BAR;
    const px = (pct) => x0 + Math.min(pct, max) / max * (x1 - x0);
    ctx.save();
    ctx.fillStyle = rgba2(0.07);
    ctx.fillRect(x0, y, x1 - x0, h);
    if (m.usage > 2e-3) {
      ctx.fillStyle = m.slipping ? ACCENT2 : accent2(0.85);
      ctx.fillRect(x0, y, Math.min(m.usage * 100, max) / max * (x1 - x0), h);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = PAPER2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(100) + 0.5, y - 14);
    ctx.lineTo(px(100) + 0.5, y + h + 12);
    ctx.stroke();
    ctx.restore();
    label(ctx, TEXT.limit, px(100) + 8, y - 18, { color: PAPER2, font: `500 13px ${MONO2}`, spacing: 0 });
    for (let pct = 0; pct <= max; pct += 25) {
      const x = px(pct);
      ctx.save();
      ctx.strokeStyle = rgba2(0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + h);
      ctx.lineTo(x + 0.5, y + h + 6);
      ctx.stroke();
      ctx.restore();
      text(
        ctx,
        String(pct),
        x,
        y + h + 26,
        { font: `400 13px ${MONO2}`, color: rgba2(0.38), align: pct === 0 ? "left" : "center" }
      );
    }
    const xNow = px(m.usage * 100);
    ctx.save();
    ctx.fillStyle = m.slipping ? ACCENT2 : PAPER2;
    ctx.beginPath();
    ctx.moveTo(xNow, y - 3);
    ctx.lineTo(xNow - 6, y - 13);
    ctx.lineTo(xNow + 6, y - 13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawCurve(m) {
    const box = CH;
    const dMax = LIMITS.d.max;
    const s = frame(ctx, box, { x0: 0, x1: dMax, y0: 0, y1: 220 }, {
      xLabel: "\u8D28\u5FC3\u6A2A\u5411\u504F\u79FB d (mm)",
      yLabel: "\u4F7F\u7528\u7387 (%)",
      xTicks: 6,
      yTicks: 4,
      xFmt: (v) => v.toFixed(1),
      yFmt: (v) => v.toFixed(0)
    });
    const pts2 = [];
    for (let i = 0; i <= 120; i++) {
      const d = dMax * i / 120;
      pts2.push([d, model({ d, toe: state.toe, mu: state.mu }).usage * 100]);
    }
    area(ctx, s, pts2, { color: accent2(m.slipping ? 0.24 : 0.15) });
    line(ctx, s, pts2, { color: ACCENT2, width: 3 });
    line(ctx, s, [[0, 100], [dMax, 100]], { color: PAPER2, width: 1.5, dashed: true });
    label(
      ctx,
      TEXT.limit,
      box.x + box.w - 4,
      s.sy(100) - 8,
      { color: rgba2(0.6), align: "right", font: `500 13px ${MONO2}`, spacing: 0 }
    );
    const cx = s.sx(state.d);
    const cy = s.sy(m.usage * 100);
    ctx.save();
    ctx.strokeStyle = rgba2(0.32);
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, box.y + box.h);
    ctx.lineTo(cx + 0.5, cy);
    ctx.lineTo(box.x, cy);
    ctx.stroke();
    ctx.restore();
    dot(ctx, cx, cy, 5.5, m.slipping ? ACCENT2 : PAPER2, m.slipping ? ACCENT2 : null);
    label(ctx, TEXT.curve, box.x, box.y - 22, { color: rgba2(0.5), spacing: 1.4 });
    label(
      ctx,
      (m.usage * 100).toFixed(1) + " %",
      box.x + box.w,
      box.y - 22,
      { color: m.slipping ? ACCENT2 : PAPER2, align: "right", font: `600 15px ${MONO2}`, spacing: 0 }
    );
  }
  function selfTest() {
    const checks = assertions();
    const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} \u2014 ${c.detail}`);
    if (canvas.width !== W2 || canvas.height !== H2) errs.push(`\u753B\u5E03\u5C3A\u5BF8 ${canvas.width}\xD7${canvas.height}`);
    if (!(C.y - C.r > 600)) errs.push("\u6469\u64E6\u5706\u538B\u5230\u9875\u7709");
    if (!(C.y + C.r < 1e3)) errs.push("\u6469\u64E6\u5706\u538B\u5230\u4F7F\u7528\u7387\u533A");
    if (!(C.x - C.r >= SAFE2.x0)) errs.push("\u6469\u64E6\u5706\u538B\u51FA\u5B89\u5168\u533A\u5DE6\u8FB9");
    if (!(BAR.y + BAR.h < CH.y - 30)) errs.push("\u6A2A\u6761\u538B\u5230\u66F2\u7EBF\u533A");
    if (!(CH.y + CH.h + 50 < 1358 - 40)) errs.push("\u66F2\u7EBF\u538B\u5230\u8BFB\u6570\u533A");
    const m = model(state);
    if (!(Math.abs(m.usage - Math.hypot(m.fx, m.fy) / m.cap) < 1e-12)) errs.push("\u4F7F\u7528\u7387\u4E0E\u5408\u529B\u4E0D\u81EA\u6D3D");
    if (!(Math.abs(m.dCrit - model({ d: 0.3, toe: 0, mu: state.mu }).dCrit) < 1e-12)) errs.push("\u4E34\u754C\u504F\u79FB\u968F d \u6F02\u79FB");
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
        usage: m.usage,
        mag: m.mag,
        cap: m.cap,
        fy: m.fy,
        fx: m.fx,
        dCrit: m.dCrit,
        moment: m.moment,
        momentLimit: m.momentLimit,
        margin: m.margin,
        slipping: m.slipping,
        tTotal: run.run.t,
        vExit: run.run.v,
        effMass: REFERENCE.effMass,
        bandOk: run.ok,
        thrust: THRUST.Fpeak,
        tBurn: THRUST.tBurn
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
    downloadAll: () => exportEpisode(canvas, "friction-loop")
  };
  for (const key of Object.keys(LIMITS)) {
    const el = document.getElementById("in-" + key);
    const out = document.getElementById("out-" + key);
    if (!el) continue;
    const L = LIMITS[key];
    el.min = L.min;
    el.max = L.max;
    el.step = L.step;
    el.value = state[key];
    const sync = () => {
      state[key] = parseFloat(el.value);
      if (out) out.textContent = state[key].toFixed(3) + L.unit;
      compose();
    };
    el.addEventListener("input", sync);
    if (out) out.textContent = state[key].toFixed(3) + L.unit;
  }
  var btn = document.getElementById("export");
  if (btn) btn.addEventListener("click", () => {
    window.__app.downloadAll().catch((e) => console.error(e));
  });
  compose();
})();
