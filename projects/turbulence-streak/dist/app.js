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
  async function toPNG(canvas2, { width: width2 = REEL_W, height = REEL_H, quality } = {}) {
    const out = resample(canvas2, width2, height);
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
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
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
  function polyline(ctx2, pts2, { color = PAPER, width: width2 = 2, dash = null, alpha = 1 } = {}) {
    if (pts2.length < 2) return;
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width2;
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
  function arrow(ctx2, x0, y0, x1, y1, { color = ACCENT, width: width2 = 3, head = 13 } = {}) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx2.save();
    ctx2.strokeStyle = color;
    ctx2.fillStyle = color;
    ctx2.lineWidth = width2;
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
  function line(ctx2, s, points, { color = CHART.accent, width: width2 = 3, dashed = false, glow = false } = {}) {
    if (!points.length) return;
    ctx2.save();
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width2;
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
      const px2 = s.sx(x), py2 = s.sy(y);
      i ? ctx2.lineTo(px2, py2) : ctx2.moveTo(px2, py2);
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
      const px2 = s.sx(x), py2 = s.sy(y);
      i ? ctx2.lineTo(px2, py2) : ctx2.moveTo(px2, py2);
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
  function sheddingFreq(v, p = flatParams(), St = 0.2) {
    return St * v / p.width;
  }
  function sheddingFreqByLen(v, p = flatParams(), St = 0.2) {
    return St * v / p.len;
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
  var D = 0.05;
  var ST = 0.2;
  var UC = 0.85;
  var H0 = 0.028;
  var K_SPREAD = 0.32;
  var WINDOW = 2.4;
  var SEED = 1592598101;
  var DEFAULT_STATE = { v: REFERENCE.vFinish, jitter: 0.18 };
  var LIMITS = {
    v: { min: 5, max: 20, step: 0.1, unit: "m/s", label: "\u8F66\u901F", status: "DERIVED" },
    jitter: { min: 0, max: 0.35, step: 0.01, unit: "", label: "\u6296\u52A8\u5E45\u5EA6", status: "TYPICAL" }
  };
  var wavelength = () => D / ST;
  var freq = (v) => ST * v / D;
  var reLength = (v) => v * L / NU;
  var reWidth = (v) => v * D / NU;
  var convect = (v) => UC * v;
  function width(x) {
    return H0 + K_SPREAD * x;
  }
  function coreRadius(x, v) {
    return Math.sqrt(4 * NU * x / convect(v));
  }
  function street(state2, seed = SEED) {
    const rnd = mulberry32(seed);
    const half = wavelength() / 2;
    const n = Math.floor((WINDOW + half) / half);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const x = i * half;
      const side = i % 2 === 1 ? 1 : -1;
      const jStr = (rnd() - 0.5) * 2 * state2.jitter;
      const jLat = (rnd() - 0.5) * 2 * state2.jitter;
      out.push({
        i,
        x,
        // 下游距离 m，严格等距
        side,
        y: side * width(x) / 2 * (1 + jLat * 0.22),
        r: coreRadius(x, state2.v),
        strength: 1 + jStr * 0.3
      });
    }
    return out;
  }
  function streaklines(state2, seed = SEED) {
    const rnd = mulberry32(seed ^ 2654435769);
    const lam = wavelength();
    const out = [];
    for (let k = 0; k < 5; k++) {
      const phase = rnd() * Math.PI * 2;
      const gain = 0.55 + rnd() * 0.5;
      const pts2 = [];
      for (let i = 0; i <= 90; i++) {
        const x = WINDOW * i / 90;
        const amp = width(x) / 2 * 0.42 * gain;
        pts2.push([x, amp * Math.sin(2 * Math.PI * x / lam + phase)]);
      }
      out.push(pts2);
    }
    return out;
  }
  function model(state2) {
    const v = state2.v;
    const lam = wavelength();
    const f = freq(v);
    const rc = coreRadius(WINDOW, v);
    const p = flatParams();
    return {
      p,
      v,
      f,
      lam,
      uc: convect(v),
      reL: reLength(v),
      reD: reWidth(v),
      period: 1 / f,
      halfPeriod: 1 / (2 * f),
      widthEnd: width(WINDOW),
      width0: width(0),
      rcEnd: rc,
      rc0: coreRadius(0.05, v),
      lamOverL: lam / L,
      vortices: street(state2),
      streaks: streaklines(state2),
      coreFreq: sheddingFreq(v, p),
      // 共用内核，现在也按车宽算了
      st: ST,
      D,
      L,
      WINDOW
    };
  }
  function assertions() {
    const out = [];
    const add = (name, ok, detail) => out.push({ name, ok, detail });
    const state2 = { ...DEFAULT_STATE };
    {
      const a = reLength(20), b = reLength(REFERENCE.vFinish);
      add(
        "Re = vL/\u03BD\uFF1A20 m/s \u5904 2.6385\xD710\u2075\u300116.906 \u5904 2.2303\xD710\u2075",
        Math.abs(a - 263850) < 5 && Math.abs(b - 223030) < 5,
        `${a.toExponential(4)} / ${b.toExponential(4)}`
      );
    }
    {
      const r = reLength(13) / reWidth(13);
      add("Re_L / Re_D = L / D = 4", Math.abs(r - L / D) < 1e-12, r.toFixed(9));
    }
    {
      const f = freq(REFERENCE.vFinish);
      add("f = St\xB7v/D = 67.62 Hz \u4E8E\u6574\u8DD1\u672B\u901F", Math.abs(f - 67.62) < 0.02, f.toFixed(4));
    }
    {
      const a = wavelength(), b = wavelength();
      add("\u03BB = D/St = 0.2500 m\uFF0C\u4E0E\u901F\u5EA6\u65E0\u5173", Math.abs(a - 0.25) < 1e-15 && a === b, a.toFixed(6));
    }
    {
      const e = Math.abs(freq(2 * 7.3) - 2 * freq(7.3));
      add("f \u4E0E v \u4E25\u683C\u6210\u6B63\u6BD4\uFF1Af(2v) = 2f(v)", e < 1e-12, e.toExponential(2));
    }
    {
      const s = street(state2);
      let alt = true, gap = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i].side !== (i % 2 === 1 ? 1 : -1)) alt = false;
        if (i > 0) gap = Math.max(gap, Math.abs(s[i].x - s[i - 1].x - wavelength() / 2));
      }
      add(
        "\u76F8\u90BB\u6DA1\u4E25\u683C\u6362\u8FB9\u3001\u95F4\u8DDD = \u03BB/2 = 0.1250 m",
        alt && gap < 1e-12,
        `${s.length} \u4E2A\u6DA1\uFF0C\u6700\u5927\u95F4\u8DDD\u504F\u5DEE ${gap.toExponential(2)}`
      );
    }
    {
      const a = JSON.stringify(street(state2, SEED));
      const b = JSON.stringify(street(state2, SEED));
      const c = JSON.stringify(street(state2, SEED ^ 1));
      add(
        "mulberry32 \u56FA\u5B9A\u79CD\u5B50\u53EF\u590D\u73B0\uFF08\u540C\u79CD\u5B50\u9010\u5B57\u8282\u76F8\u7B49\uFF0C\u5F02\u79CD\u5B50\u4E0D\u7B49\uFF09",
        a === b && a !== c,
        `${a.length} \u5B57\u8282`
      );
    }
    {
      const s = street({ ...state2, jitter: 0 });
      let worst = 0;
      for (const v of s) worst = Math.max(worst, Math.abs(Math.abs(v.y) - width(v.x) / 2));
      add("\u6296\u52A8 = 0 \u65F6\u6DA1\u5FC3\u4E25\u683C\u843D\u5728 h(x)/2 \u4E0A", worst < 1e-15, worst.toExponential(2));
    }
    {
      let ok = true;
      for (let x = 0; x < WINDOW; x += 0.02) if (!(width(x + 0.02) > width(x))) ok = false;
      add("\u5C3E\u6D41\u5305\u7EDC\u968F\u4E0B\u6E38\u4E25\u683C\u5F20\u5F00", ok, `${width(0).toFixed(3)} \u2192 ${width(WINDOW).toFixed(3)} m`);
    }
    {
      const a = street({ ...state2, v: 5 }).length;
      const b = street({ ...state2, v: 20 }).length;
      add(
        "\u7A7A\u95F4\u5FEB\u7167\u91CC\u6DA1\u6570\u4E0E\u901F\u5EA6\u65E0\u5173\uFF0C\u53D8\u7684\u53EA\u662F\u6BCF\u79D2\u8131\u51E0\u4E2A",
        a === b && Math.abs(freq(20) / freq(5) - 4) < 1e-12,
        `\u90FD\u662F ${a} \u4E2A\uFF0C\u9891\u7387\u5DEE 4 \u500D`
      );
    }
    {
      const r1 = coreRadius(0.4, 12), r2 = coreRadius(0.8, 12);
      add(
        "\u6DA1\u6838\u534A\u5F84\u6309 \u221Ax \u589E\u957F\uFF1Ar(2x) = \u221A2\xB7r(x)",
        Math.abs(r2 / r1 - Math.SQRT2) < 1e-12,
        `${(r1 * 1e3).toFixed(3)} \u2192 ${(r2 * 1e3).toFixed(3)} mm`
      );
    }
    {
      const a = coreRadius(1.2, 5), b = coreRadius(1.2, 20);
      add(
        "\u6DA1\u6838\u534A\u5F84\u4E0E \u221Av \u6210\u53CD\u6BD4\uFF1Av \u7FFB 4 \u500D\uFF0C\u6838\u7626\u4E00\u534A",
        Math.abs(a / b - 2) < 1e-12,
        `${(a * 1e3).toFixed(2)} / ${(b * 1e3).toFixed(2)} mm`
      );
    }
    {
      const lo = reWidth(5), hi = reWidth(20);
      add(
        "Re_D \u843D\u5728\u4E9A\u4E34\u754C\u8131\u843D\u533A\uFF0810\xB3\u20132\xD710\u2075\uFF09",
        lo > 1e3 && hi < 2e5,
        `${lo.toExponential(2)} \u2013 ${hi.toExponential(2)}`
      );
    }
    {
      const p = flatParams();
      const r = freq(REFERENCE.vFinish) / sheddingFreq(REFERENCE.vFinish, p);
      add(
        "\u5171\u7528\u5185\u6838\u4E0E\u672C\u5730\u6309\u8F66\u5BBD\u7B97\u7684 f \u5B8C\u5168\u4E00\u81F4",
        Math.abs(r - 1) < 1e-12,
        `ours/core = ${r.toFixed(9)}`
      );
    }
    {
      const p = flatParams();
      const rLen = freq(REFERENCE.vFinish) / sheddingFreqByLen(REFERENCE.vFinish, p);
      add(
        "\u65E7\u7248\u6309\u8F66\u957F\u7B97\uFF0C\u6B63\u597D\u6BD4\u6309\u8F66\u5BBD\u7B97\u5C0F L/D \u500D\uFF08\u7279\u5F81\u957F\u5EA6\u662F\u552F\u4E00\u5DEE\u5F02\uFF09",
        Math.abs(rLen - L / D) < 1e-12,
        `width/len = ${rLen.toFixed(9)}`
      );
    }
    {
      const sc = selfCheck(flatParams());
      add(
        "\u53C2\u6570\u7EC4\u81EA\u6D3D\uFF08\u51B2\u91CF\xB7\u52A8\u91CF\xB7\u8DDD\u79BB\xB7\u5E73\u5747\u901F\u5EA6\uFF09",
        sc.ok,
        sc.ok ? `${sc.run.t.toFixed(4)} s / ${sc.run.v.toFixed(3)} m/s` : "\u6709\u884C\u4E0D\u901A\u8FC7"
      );
    }
    return out;
  }

  // src/main.js
  var { W: W2, H: H2, PAPER: PAPER2, ACCENT: ACCENT2, MONO: MONO2, SAFE: SAFE2, rgba: rgba2, accent: accent2 } = plotkit_exports;
  var TEXT = {
    kicker: "\u5C3E\u6D41 \uFF0F TURBULENCE-STREAK",
    t1: "\u8F66\u5C3E\u6BCF\u79D2\u7529\u51FA 68 \u4E2A\u6DA1",
    t2: "\u4E0A\u4E0B\u4E24\u5217\u53CD\u7740\u8F6C",
    sub: "\u5361\u95E8\u6DA1\u8857\uFF1A\u6DA1\u95F4\u8DDD \u03BB = D/St = 0.250 m \u8DDF\u901F\u5EA6\u65E0\u5173\uFF0C\u53D8\u7684\u662F\u6BCF\u79D2\u8131\u51E0\u4E2A",
    sec1: "\u2460 \u4FEF\u89C6\u6DA1\u8857\uFF08\u8F66\u5411 \u2192\uFF09",
    sec2: "\u2461 \u8131\u843D\u9891\u7387 f \u968F\u8F66\u901F",
    ax2: "\u6A2A\u8F74 v (m/s)",
    pos: "\u6B63\u6DA1\uFF08\u9006\u65F6\u9488\uFF09",
    neg: "\u8D1F\u6DA1\uFF08\u987A\u65F6\u9488\uFF09",
    env: "\u5C3E\u6D41\u5305\u7EDC h(x)",
    car: "\u8F66\u5C3E",
    lamCap: "\u6DA1\u95F4\u8DDD \u03BB",
    clock: "\u8131\u843D\u8282\u62CD\u30000.25 s \u7A97\u53E3",
    coreCap: "\u6DA1\u6838 r = \u221A(4\u03BDx/u_c)\uFF0C\u901F\u5EA6\u8D8A\u4F4E\u957F\u5F97\u8D8A\u80D6",
    fCap: "\u8131\u843D\u9891\u7387",
    lamCap2: "\u6DA1\u95F4\u8DDD",
    reCap: "\u96F7\u8BFA\u6570 Re_L",
    bands: "\u4E0A\u4E0B\u4E24\u5217\u4EA4\u66FF\u8131\u843D\uFF0C\u95F4\u8DDD\u534A\u4E2A\u6CE2\u957F = 0.125 m",
    paramLine: "St 0.20 [TYPICAL]\u3000\u3000D 0.050 m [FIXED]\u3000\u3000\u03BD 1.516\xD710\u207B\u2075 m\xB2/s [FIXED]\u3000\u3000u_c 0.85v [TYPICAL]",
    paramLine2: "Re_D 5.58\xD710\u2074 \u2192 \u843D\u5728\u4E9A\u4E34\u754C\u8131\u843D\u533A\uFF0CSt \u2248 0.2 \u624D\u6709\u4F9D\u636E",
    foot: "\u968F\u673A\u91CF\u5168\u90E8\u6765\u81EA mulberry32(0x5EED1E55)\uFF0C\u540C\u8F93\u5165\u540C\u8F93\u51FA",
    footR: "\u89C6\u7A97 2.4 m\u3000\u6DA1\u6570",
    footR2: "\u4E2A"
  };
  var CHARS = Object.values(TEXT).join("");
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var state = { ...DEFAULT_STATE };
  var FLD = { x: 60, y: 620, w: 870, h: 360 };
  var PPM = FLD.w / (WINDOW + L);
  var CAR_PX = L * PPM;
  var TAIL = FLD.x + FLD.w - CAR_PX;
  var CY = FLD.y + 150;
  var STRIP_Y = 916;
  var CH = { x: 170, y: 1036, w: 760, h: 170 };
  var MONO12 = `400 12px ${MONO2}`;
  var px = (xm) => TAIL - xm * PPM;
  var py = (ym) => CY + ym * PPM;
  function compose() {
    const m = model(state);
    backdrop(ctx);
    accentRule(ctx, SAFE2.x0, 300);
    kicker(ctx, TEXT.kicker, 334);
    title(ctx, [TEXT.t1, TEXT.t2], 410, { size: 56, lead: 66 });
    sub(ctx, TEXT.sub, 536);
    hairline(ctx, 564);
    label(ctx, TEXT.sec1, SAFE2.x0, 596, { color: rgba2(0.5) });
    label(
      ctx,
      `Re 2.23\xD710\u2075\u3000f ${m.f.toFixed(1)} Hz`,
      SAFE2.x1,
      596,
      { color: PAPER2, align: "right", font: `600 16px ${MONO2}`, spacing: 0 }
    );
    drawField(m);
    label(ctx, TEXT.sec2, SAFE2.x0, 1012, { color: rgba2(0.5) });
    label(ctx, TEXT.ax2, SAFE2.x0 + 178, 1012, { color: rgba2(0.32), font: MONO12, spacing: 0 });
    label(
      ctx,
      `${m.f.toFixed(2)} Hz`,
      SAFE2.x1,
      1012,
      { color: PAPER2, align: "right", font: `600 16px ${MONO2}`, spacing: 0 }
    );
    drawCurve(m);
    hairline(ctx, 1244);
    readout(ctx, {
      x: SAFE2.x0,
      y: 1280,
      value: m.f.toFixed(1),
      unit: "Hz",
      caption: TEXT.fCap,
      status: "DERIVED",
      color: PAPER2,
      size: 40
    });
    readout(ctx, {
      x: 348,
      y: 1280,
      value: m.lam.toFixed(3),
      unit: "m",
      caption: TEXT.lamCap2,
      status: `= ${m.lamOverL.toFixed(2)} L`,
      color: ACCENT2,
      size: 40
    });
    readout(ctx, {
      x: 664,
      y: 1280,
      value: (m.reL / 1e5).toFixed(2),
      unit: "\xD710\u2075",
      caption: TEXT.reCap,
      status: `${(m.period * 1e3).toFixed(1)} ms/\u6DA1`,
      color: PAPER2,
      size: 40
    });
    hairline(ctx, 1336);
    label(ctx, TEXT.paramLine, SAFE2.x0, 1360, { color: rgba2(0.45), font: MONO12, spacing: 0 });
    label(ctx, TEXT.paramLine2, SAFE2.x0, 1384, { color: rgba2(0.38), font: MONO12, spacing: 0 });
    hairline(ctx, 1420);
    label(ctx, TEXT.foot, SAFE2.x0, 1448, { color: rgba2(0.42) });
    label(
      ctx,
      `${TEXT.footR} ${m.vortices.length} ${TEXT.footR2}`,
      SAFE2.x1,
      1448,
      { color: rgba2(0.42), align: "right" }
    );
  }
  function drawField(m) {
    ctx.save();
    ctx.strokeStyle = rgba2(0.2);
    ctx.lineWidth = 1;
    ctx.strokeRect(FLD.x + 0.5, FLD.y + 0.5, FLD.w - 1, FLD.h - 1);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba2(0.16);
    ctx.setLineDash([2, 8]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(FLD.x, CY + 0.5);
    ctx.lineTo(TAIL, CY + 0.5);
    ctx.stroke();
    ctx.restore();
    const envTop = [], envBot = [];
    for (let i = 0; i <= 60; i++) {
      const x = WINDOW * i / 60;
      const h = width(x) / 2;
      envTop.push([px(x), py(-h)]);
      envBot.push([px(x), py(h)]);
    }
    ctx.save();
    ctx.strokeStyle = rgba2(0.34);
    {
      const gw = ctx.createLinearGradient(TAIL, 0, FLD.x, 0);
      gw.addColorStop(0, "rgba(242,240,235,0.155)");
      gw.addColorStop(0.45, "rgba(242,240,235,0.085)");
      gw.addColorStop(1, "rgba(242,240,235,0.028)");
      ctx.save();
      ctx.fillStyle = gw;
      ctx.beginPath();
      envTop.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      for (let i = envBot.length - 1; i >= 0; i--) ctx.lineTo(envBot[i][0], envBot[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.3;
    for (const arr of [envTop, envBot]) {
      ctx.beginPath();
      arr.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.stroke();
    }
    ctx.restore();
    for (const pts2 of m.streaks) {
      ctx.save();
      ctx.strokeStyle = rgba2(0.34);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      pts2.forEach(([xm, ym], i) => {
        const X = px(xm), Y = py(ym);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
      ctx.restore();
    }
    for (const v of m.vortices) {
      const cx = px(v.x), cy = py(v.y);
      const r = 5 + 3400 * v.r;
      const age = v.x / WINDOW;
      const warm = v.side > 0;
      const a0 = Math.max(0.1, (1 - 0.55 * age) * v.strength);
      drawVortex(cx, cy, r, warm, a0, v.side);
    }
    drawCar(m);
    const a = m.vortices[2], b = m.vortices[4];
    if (a && b) {
      const y = CY - width(a.x) / 2 * PPM - 44;
      const x1 = px(a.x), x2 = px(b.x);
      ctx.save();
      ctx.strokeStyle = accent2(0.85);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x1, y - 6);
      ctx.lineTo(x1, y + 6);
      ctx.moveTo(x2, y - 6);
      ctx.lineTo(x2, y + 6);
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.restore();
      text(
        ctx,
        `${TEXT.lamCap} ${m.lam.toFixed(3)} m`,
        (x1 + x2) / 2,
        y - 10,
        { font: `600 14px ${MONO2}`, color: ACCENT2, align: "center" }
      );
    }
    text(
      ctx,
      `${TEXT.env} ${m.widthEnd.toFixed(3)} m`,
      FLD.x + 10,
      py(-m.widthEnd / 2) - 8,
      { font: MONO12, color: rgba2(0.5) }
    );
    label(
      ctx,
      TEXT.coreCap,
      FLD.x + 10,
      FLD.y + FLD.h - 12,
      { color: rgba2(0.34), font: MONO12, spacing: 0 }
    );
    drawClock(m);
  }
  function drawVortex(cx, cy, r, warm, a, dir) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.9);
    const base = warm ? "232,89,12" : "242,240,235";
    g.addColorStop(0, `rgba(${base},${(0.52 * a).toFixed(3)})`);
    g.addColorStop(0.45, `rgba(${base},${(0.2 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${base},0)`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = warm ? `rgba(232,89,12,${(0.95 * a).toFixed(3)})` : `rgba(242,240,235,${(0.9 * a).toFixed(3)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    const turns = 1.5;
    const total = turns * 2 * Math.PI;
    for (let t = 0; t <= total; t += 0.1) {
      const rr = r * (0.22 + 0.78 * (t / total));
      const X = cx + Math.cos(t * dir) * rr;
      const Y = cy + Math.sin(t * dir) * rr;
      if (t === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawCar(m) {
    const halfW = D / 2 * PPM;
    ctx.save();
    ctx.fillStyle = rgba2(0.16);
    ctx.strokeStyle = PAPER2;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.rect(TAIL, CY - halfW, CAR_PX, halfW * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(TAIL + CAR_PX - 16, CY);
    ctx.lineTo(TAIL + CAR_PX - 5, CY);
    ctx.stroke();
    ctx.restore();
    label(
      ctx,
      TEXT.car,
      TAIL + 3,
      CY + halfW + 15,
      { color: rgba2(0.55), font: MONO12, spacing: 0 }
    );
  }
  function drawClock(m) {
    const x0 = 200, x1 = 900, span = 0.25;
    label(ctx, TEXT.clock, FLD.x + 10, STRIP_Y + 4, { color: rgba2(0.42), font: MONO12, spacing: 0 });
    const rows = [
      [m.v, m.f, ACCENT2, rgba2(0.9), `${m.v.toFixed(1)} m/s`],
      [m.v / 2, m.f / 2, PAPER2, rgba2(0.45), `${(m.v / 2).toFixed(1)} m/s`]
    ];
    rows.forEach(([v, f, col, lab, name], ri) => {
      const y = STRIP_Y + 16 + ri * 22;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, y + 10.5);
      ctx.lineTo(x1, y + 10.5);
      ctx.stroke();
      ctx.restore();
      const n = Math.round(f * span);
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        const X = x0 + i / Math.max(n, 1) * (x1 - x0);
        ctx.beginPath();
        ctx.moveTo(X, y);
        ctx.lineTo(X, y + 10);
        ctx.stroke();
      }
      ctx.restore();
      label(ctx, name, FLD.x + 10, y + 10, { color: lab, font: MONO12, spacing: 0 });
      text(ctx, `${n} \u4E2A`, x1 + 4, y + 10, { font: MONO12, color: lab });
    });
    label(ctx, "0.25 s", x1, STRIP_Y - 2, { color: rgba2(0.3), font: MONO12, align: "right", spacing: 0 });
  }
  function drawCurve(m) {
    const box = CH;
    const s = frame(ctx, box, { x0: 0, x1: 20, y0: 0, y1: 90 }, {
      yLabel: "f (Hz)",
      xTicks: 5,
      yTicks: 4,
      xFmt: (v) => v.toFixed(0),
      yFmt: (v) => v.toFixed(0)
    });
    const pts2 = [];
    for (let i = 0; i <= 120; i++) {
      const v = 20 * i / 120;
      pts2.push([v, freq(v)]);
    }
    area(ctx, s, pts2, { color: accent2(0.16) });
    line(ctx, s, pts2, { color: ACCENT2, width: 3 });
    const cx = s.sx(state.v), cy = s.sy(m.f);
    ctx.save();
    ctx.strokeStyle = rgba2(0.3);
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, box.y + box.h);
    ctx.lineTo(cx + 0.5, cy);
    ctx.stroke();
    ctx.restore();
    dot(ctx, cx, cy, 5.5, PAPER2, ACCENT2);
    label(
      ctx,
      `\u03BB = ${m.lam.toFixed(3)} m \u6052\u5B9A`,
      box.x + box.w - 4,
      box.y + 26,
      { color: rgba2(0.5), align: "right", font: MONO12, spacing: 0 }
    );
  }
  function selfTest() {
    const checks = assertions();
    const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} \u2014 ${c.detail}`);
    if (canvas.width !== W2 || canvas.height !== H2) errs.push(`\u753B\u5E03\u5C3A\u5BF8 ${canvas.width}\xD7${canvas.height}`);
    if (!(FLD.y > 564 && FLD.y + FLD.h < 1012)) errs.push("\u6DA1\u8857\u538B\u5230\u9875\u7709\u6216\u66F2\u7EBF\u533A");
    if (!(FLD.x >= SAFE2.x0 && FLD.x + FLD.w <= SAFE2.x1 + 1)) errs.push("\u6DA1\u8857\u538B\u51FA\u5B89\u5168\u533A");
    if (!(CH.y > FLD.y + FLD.h + 20 && CH.y + CH.h + 34 < 1244)) errs.push("\u9891\u7387\u66F2\u7EBF\u538B\u5230\u8BFB\u6570");
    if (!(TAIL + CAR_PX <= FLD.x + FLD.w + 1)) errs.push("\u8F66\u8EAB\u753B\u51FA\u4E86\u53F3\u8FB9\u754C");
    if (!(TAIL - WINDOW * PPM >= FLD.x - 1)) errs.push("\u89C6\u7A97\u8D85\u5DE6\u8FB9\u754C");
    {
      const m = model(state);
      const maxY = Math.max(...m.vortices.map((v) => Math.abs(v.y))) * PPM;
      if (!(CY - maxY > FLD.y && CY + maxY < STRIP_Y - 8)) errs.push(`\u6DA1\u5217\u6EA2\u51FA\u6846\uFF1A\xB1${maxY.toFixed(1)}px`);
    }
    if (JSON.stringify(street(state)) !== JSON.stringify(street(state, SEED))) {
      errs.push("\u540C\u79CD\u5B50\u4E24\u6B21\u751F\u6210\u7ED3\u679C\u4E0D\u4E00\u81F4");
    }
    return { ok: errs.length === 0, errs, checks };
  }
  window.__app = {
    canvas,
    canvasChars: CHARS,
    getState: () => ({ ...state }),
    getMetrics: () => {
      const m = model(state);
      return {
        v: m.v,
        f: m.f,
        lam: m.lam,
        period: m.period,
        uc: m.uc,
        reL: m.reL,
        reD: m.reD,
        widthEnd: m.widthEnd,
        rcEnd: m.rcEnd,
        vortices: m.vortices.length,
        streakCount: m.streaks.length,
        coreFreq: m.coreFreq,
        st: m.st,
        seed: SEED,
        jitter: state.jitter
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
    street: (s) => street(s ? { ...state, ...s } : state),
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
    downloadAll: () => exportEpisode(canvas, "turbulence-streak")
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
    const fmt = (v) => key === "v" ? v.toFixed(1) + L2.unit : v.toFixed(2);
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
  compose();
})();
