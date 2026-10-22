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
  function marker(ctx2, s, x, { label: label2, color = CHART.paper } = {}) {
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
    if (label2) {
      ctx2.fillStyle = color;
      ctx2.font = `500 15px ${CHART.mono}`;
      ctx2.textAlign = "center";
      ctx2.textBaseline = "bottom";
      ctx2.fillText(label2, px, s.box.y - 6);
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
  var BURNOUT = { t: 0.11, x: 1.0108, v: 18.3468 };
  var X_END = 20;
  var P = flatParams();
  var M_EFF = P.m + P.nWheel * P.iWheel / (P.rWheel * P.rWheel);
  var A_DECAY = 0.5 * RHO * P.cd * P.area / M_EFF;
  var B_PER_CRR = P.m * 9.81 / M_EFF;
  function bOf(crr) {
    return crr * B_PER_CRR;
  }
  function vinfOf(crr) {
    return Math.sqrt(bOf(crr) / A_DECAY);
  }
  var DEFAULT_STATE = { dEnd: 20, crr: 8e-3 };
  var LIMITS = {
    dEnd: { min: 12, max: 20, step: 0.1, unit: "m", label: "\u7EC8\u70B9\u4F4D\u7F6E", status: "FIXED" },
    crr: { min: 4e-3, max: 0.014, step: 5e-4, unit: "", label: "\u8F6E\u8F68\u6EDA\u52A8\u7CFB\u6570", status: "VERIFY" }
  };
  function vAt(x, crr) {
    const b = bOf(crr);
    const vinf2 = b / A_DECAY;
    const e = Math.exp(2 * A_DECAY * (x - BURNOUT.x));
    const v2 = (BURNOUT.v * BURNOUT.v + vinf2) / e - vinf2;
    return v2 > 0 ? Math.sqrt(v2) : 0;
  }
  function xOf(v, crr) {
    const b = bOf(crr);
    const vinf2 = b / A_DECAY;
    return BURNOUT.x + 1 / (2 * A_DECAY) * Math.log((BURNOUT.v ** 2 + vinf2) / (v * v + vinf2));
  }
  function tAt(v, crr) {
    const b = bOf(crr);
    const k = Math.sqrt(A_DECAY / b);
    return BURNOUT.t + 1 / Math.sqrt(A_DECAY * b) * (Math.atan(BURNOUT.v * k) - Math.atan(v * k));
  }
  function onlyDrag(x) {
    return BURNOUT.v * Math.exp(-A_DECAY * (x - BURNOUT.x));
  }
  function onlyRolling(x, crr) {
    const s = BURNOUT.v ** 2 - 2 * bOf(crr) * (x - BURNOUT.x);
    return s > 0 ? Math.sqrt(s) : 0;
  }
  function dragShare(v, crr) {
    const d = A_DECAY * v * v;
    const b = bOf(crr);
    return d / (d + b);
  }
  function integrate(crr, dt = 1e-6, xStop = X_END) {
    const b = bOf(crr);
    const f = (v2) => -(A_DECAY * v2 * v2 + b);
    let v = BURNOUT.v, x = BURNOUT.x, t = BURNOUT.t;
    let guard = 0;
    while (x < xStop && guard < 4e7) {
      const k1 = f(v);
      const k2 = f(v + 0.5 * dt * k1);
      const k3 = f(v + 0.5 * dt * k2);
      const k4 = f(v + dt * k3);
      const vn = v + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      x += 0.5 * (v + vn) * dt;
      v = vn;
      t += dt;
      guard++;
    }
    return { v, x, t };
  }
  function model(state2) {
    const crr = state2.crr;
    const a = A_DECAY;
    const b = bOf(crr);
    const vinf = Math.sqrt(b / a);
    const dEnd = state2.dEnd;
    const vEnd = vAt(dEnd, crr);
    const tEnd = tAt(vEnd, crr);
    const coastLen = dEnd - BURNOUT.x;
    const coastTime = tEnd - BURNOUT.t;
    const avgV = coastLen / coastTime;
    const fDrag0 = 0.5 * RHO * P.cd * P.area * BURNOUT.v * BURNOUT.v;
    const fRoll = crr * P.m * 9.81;
    const re0 = BURNOUT.v * P.len / NU;
    const reEnd = vEnd * P.len / NU;
    return {
      p: P,
      a,
      b,
      vinf,
      crr,
      dEnd,
      vEnd,
      tEnd,
      coastLen,
      coastTime,
      avgV,
      fDrag0,
      fDragEnd: 0.5 * RHO * P.cd * P.area * vEnd * vEnd,
      fRoll,
      re0,
      reEnd,
      dv: BURNOUT.v - vEnd,
      dvPct: (BURNOUT.v - vEnd) / BURNOUT.v,
      share0: dragShare(BURNOUT.v, crr),
      shareEnd: dragShare(vEnd, crr),
      mEff: M_EFF,
      burn: BURNOUT,
      xEnd: X_END
    };
  }
  function assertions() {
    const out = [];
    const add = (name, ok, detail) => out.push({ name, ok, detail });
    const crr = DEFAULT_STATE.crr;
    add(
      "a = \xBD\u03C1C_dA/m_eff = 4.1000\xD710\u207B\xB3 1/m",
      Math.abs(A_DECAY - 41e-4) < 5e-8,
      A_DECAY.toExponential(5)
    );
    add(
      "b = C_rr\xB7mg/m_eff = 6.3864\xD710\u207B\xB2 m/s\xB2 \u4E8E C_rr = 0.008",
      Math.abs(bOf(8e-3) - 0.063864) < 5e-7,
      bOf(8e-3).toExponential(5)
    );
    {
      const vinf = vinfOf(8e-3);
      add("\u6E10\u8FD1\u901F\u5EA6 \u221A(b/a) = 3.9467 m/s", Math.abs(vinf - 3.9467) < 1e-3, vinf.toFixed(5));
    }
    {
      const num = integrate(crr, 2e-6, X_END);
      const cf = vAt(X_END, crr);
      add(
        "\u95ED\u5F0F v(x) \u4E0E RK4 \u6570\u503C\u79EF\u5206\u4E00\u81F4\uFF0820 m\uFF0C\u8BEF\u5DEE < 1e\u22126\uFF09",
        Math.abs(num.v - cf) < 1e-6,
        `\u95ED\u5F0F ${cf.toFixed(6)} / RK4 ${num.v.toFixed(6)}`
      );
    }
    {
      const num = integrate(crr, 2e-6, X_END);
      const cf = tAt(vAt(X_END, crr), crr);
      add(
        "\u95ED\u5F0F t(v) \u4E0E RK4 \u4E00\u81F4\uFF08\u8BEF\u5DEE < 1e\u22125 s\uFF09",
        Math.abs(num.t - cf) < 1e-5,
        `\u95ED\u5F0F ${cf.toFixed(6)} / RK4 ${num.t.toFixed(6)}`
      );
    }
    {
      let worst = 0;
      for (let i = 1; i <= 20; i++) {
        const x = BURNOUT.x + i * 0.9;
        const rt = xOf(vAt(x, crr), crr);
        worst = Math.max(worst, Math.abs(rt - x));
      }
      add("x(v) \u4E0E v(x) \u4E92\u4E3A\u53CD\u51FD\u6570\uFF0820 \u4E2A\u70B9\uFF0C\u8BEF\u5DEE < 1e\u22129\uFF09", worst < 1e-9, worst.toExponential(2));
    }
    {
      const e1 = Math.abs(vAt(BURNOUT.x, crr) - BURNOUT.v);
      const e2 = Math.abs(tAt(BURNOUT.v, crr) - BURNOUT.t);
      add(
        "v(x\u2080) = v\u2080 \u4E14 t(v\u2080) = t\u2080",
        e1 < 1e-9 && e2 < 1e-12,
        `${e1.toExponential(2)} / ${e2.toExponential(2)}`
      );
    }
    {
      let worst = 0;
      for (let i = 0; i <= 40; i++) {
        const v = 0.5 + i * 0.9;
        const s = dragShare(v, crr);
        worst = Math.max(worst, Math.abs(s - (1 - (1 - s))));
        if (!(s >= 0 && s <= 1)) worst = 1;
      }
      const half = dragShare(vinfOf(crr), crr);
      add(
        "\u4EFD\u989D\u5728 [0,1] \u5185\u4E14 v = v\u221E \u5904\u6B63\u597D\u4E00\u534A",
        worst < 1e-12 && Math.abs(half - 0.5) < 1e-9,
        `v\u221E \u5904 ${half.toFixed(9)}`
      );
    }
    {
      let prev = Infinity, ok = true;
      for (let x = BURNOUT.x; x <= X_END + 1e-9; x += 0.05) {
        const v = vAt(x, crr);
        if (!(v < prev)) ok = false;
        prev = v;
      }
      add("\u6E9C\u8F66\u6BB5\u901F\u5EA6\u4E25\u683C\u5355\u8C03\u9012\u51CF", ok, `${vAt(BURNOUT.x, crr).toFixed(3)} \u2192 ${vAt(X_END, crr).toFixed(3)}`);
    }
    {
      const v = vAt(X_END, crr);
      add(
        "20 m \u672B\u901F\u543B\u5408\u6574\u8DD1\u7ED3\u679C 16.9063 m/s",
        Math.abs(v - REFERENCE.vFinish) < 2e-3,
        `${v.toFixed(4)} / \u53C2\u8003 ${REFERENCE.vFinish.toFixed(4)}`
      );
    }
    {
      const len = X_END - BURNOUT.x;
      const tt = tAt(vAt(X_END, crr), crr) - BURNOUT.t;
      add(
        "\u6E9C\u8F66\u6BB5 18.99 m / 1.08 s",
        Math.abs(len - 18.9892) < 2e-3 && Math.abs(tt - 1.0785) < 2e-3,
        `${len.toFixed(4)} m / ${tt.toFixed(4)} s`
      );
    }
    {
      const fd0 = 0.5 * RHO * P.cd * P.area * BURNOUT.v ** 2;
      const fd1 = 0.5 * RHO * P.cd * P.area * vAt(X_END, crr) ** 2;
      const fr = 8e-3 * P.m * 9.81;
      add(
        "\u98CE\u963B 110.2 \u2192 93.6 mN\uFF08v\xB2 \u6389 7.85 % \u7684\u4E24\u500D\uFF09\uFF0C\u6EDA\u52A8 5.10 mN",
        Math.abs(fd0 * 1e3 - 110.23) < 0.05 && Math.abs(fd1 * 1e3 - 93.6) < 0.05 && Math.abs(fr * 1e3 - 5.1) < 0.02,
        `${(fd0 * 1e3).toFixed(2)} \u2192 ${(fd1 * 1e3).toFixed(2)} / ${(fr * 1e3).toFixed(2)} mN`
      );
    }
    {
      const want = 0.065 + 4 * 45e-8 / (0.011 * 0.011);
      add(
        "\u7B49\u6548\u60EF\u6027\u8D28\u91CF = m + 4I/r\xB2 = 79.876 g",
        Math.abs(M_EFF - want) < 1e-12,
        `${(M_EFF * 1e3).toFixed(3)} g`
      );
    }
    {
      const sc = selfCheck(P);
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
    kicker: "\u6E9C\u8F66\u6BB5 \uFF0F COAST-DECEL",
    t1: "\u70E7\u5B8C\u8FD8\u5269 19 \u7C73",
    t2: "\u901F\u5EA6\u81EA\u5DF1\u5F80\u4E0B\u6389",
    sub: "\u98CE\u963B\u6B63\u6BD4\u4E8E v\xB2\uFF0C\u6EDA\u52A8\u662F\u5E38\u6570\u2014\u2014\u4E24\u80A1\u963B\u529B\u5728 3.95 m/s \u5904\u4EA4\u63A5",
    sec1: "\u2460 \u6E9C\u8F66\u901F\u5EA6 v(t)",
    ax1: "\u6A2A\u8F74 t (s)",
    sec2: "\u2461 v\u2013x \u76F8\u56FE",
    ax2: "\u6A2A\u8F74 x (m)",
    sec3: "\u2462 \u4E24\u80A1\u963B\u529B\u5404\u5360\u591A\u5C11",
    ax3: "\u6A2A\u8F74 v (m/s)",
    fin: "\u7EC8\u70B9",
    burn: "\u70E7\u5B8C",
    noStop: "\u6E10\u8FD1\u7EBF 3.95 m/s \u5728\u6846\u5916\u2014\u2014\u8FD9\u6761\u65B9\u7A0B\u91CC\u8F66\u6C38\u8FDC\u4E0D\u4F1A\u505C",
    onlyDrag: "\u53EA\u7B97\u98CE\u963B",
    onlyRoll: "\u53EA\u7B97\u6EDA\u52A8",
    real: "\u4E24\u80A1\u4E00\u8D77",
    half: "\u5404\u5360\u4E00\u534A",
    coastBand: "\u6E9C\u8F66\u6BB5",
    dragCap: "\u98CE\u963B\u4EFD\u989D",
    paramLine: "C_d 0.34 [TYPICAL]\u3000\u3000\u8F6E\u8F68\u6EDA\u52A8 0.008 [VERIFY]\u3000\u3000\u7B49\u6548\u60EF\u6027\u8D28\u91CF 79.876 g [DERIVED]",
    paramLine2: "a = 4.1000\xD710\u207B\xB3 1/m\u3000\u3000b = 6.3864\xD710\u207B\xB2 m/s\xB2\u3000\u3000v\u221E = 3.9467 m/s",
    foot: "\u95ED\u5F0F\u89E3\u4E0E RK4 \u6570\u503C\u79EF\u5206\u4E92\u9A8C\uFF0C\u8BEF\u5DEE < 1\xD710\u207B\u2076",
    reFoot: "\u96F7\u8BFA\u6570",
    decel: "\u5E73\u5747\u51CF\u901F\u5EA6"
  };
  var CHARS = Object.values(TEXT).join("");
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var state = { ...DEFAULT_STATE };
  var V_LOW = 15.4;
  var B1 = { x: 170, y: 620, w: 760, h: 200 };
  var B2 = { x: 170, y: 880, w: 760, h: 180 };
  var B3 = { x: 170, y: 1120, w: 760, h: 190 };
  var MONO13 = `400 13px ${MONO2}`;
  var MONO12 = `400 12px ${MONO2}`;
  function compose() {
    const m = model(state);
    backdrop(ctx);
    accentRule(ctx, SAFE2.x0, 300);
    kicker(ctx, TEXT.kicker, 334);
    title(ctx, [TEXT.t1, TEXT.t2], 410, { size: 56, lead: 66 });
    sub(ctx, TEXT.sub, 536);
    hairline(ctx, 564);
    drawVT(m);
    drawPhase(m);
    drawShare(m);
    hairline(ctx, 1338);
    label(ctx, TEXT.paramLine, SAFE2.x0, 1364, { color: rgba2(0.45), font: MONO13, spacing: 0 });
    label(ctx, TEXT.paramLine2, SAFE2.x0, 1396, { color: rgba2(0.38), font: MONO13, spacing: 0 });
    hairline(ctx, 1420);
    label(ctx, TEXT.foot, SAFE2.x0, 1448, { color: rgba2(0.42) });
    label(
      ctx,
      `${TEXT.decel} ${((m.burn.v - m.vEnd) / m.coastTime).toFixed(3)} m/s\xB2\u3000${TEXT.reFoot} ${m.re0.toExponential(2).replace("e+", "E")}`,
      SAFE2.x1,
      1448,
      { color: rgba2(0.42), align: "right" }
    );
  }
  function drawVT(m) {
    const box = B1;
    label(ctx, TEXT.sec1, SAFE2.x0, 596, { color: rgba2(0.5) });
    label(ctx, TEXT.ax1, SAFE2.x0 + 178, 596, { color: rgba2(0.32), font: MONO12, spacing: 0 });
    label(
      ctx,
      `${m.burn.v.toFixed(2)} \u2192 ${m.vEnd.toFixed(2)} m/s`,
      SAFE2.x1,
      596,
      { color: PAPER2, align: "right", font: `600 16px ${MONO2}`, spacing: 0 }
    );
    const s = frame(ctx, box, { x0: m.burn.t, x1: Math.max(m.tEnd, m.burn.t + 0.2), y0: V_LOW, y1: m.burn.v + 0.25 }, {
      yLabel: "v (m/s)",
      xTicks: 5,
      yTicks: 4,
      xFmt: (v) => v.toFixed(2),
      yFmt: (v) => v.toFixed(1)
    });
    const pts2 = [];
    for (let i = 0; i <= 160; i++) {
      const v = m.vEnd + (m.burn.v - m.vEnd) * (i / 160);
      pts2.push([tAt(v, state.crr), v]);
    }
    area(ctx, s, pts2, { color: accent2(0.16), base: V_LOW });
    line(ctx, s, pts2, { color: ACCENT2, width: 3 });
    const x0 = s.sx(m.burn.t), y0 = s.sy(m.burn.v);
    dot(ctx, x0, y0, 5, PAPER2, ACCENT2);
    text(
      ctx,
      `${TEXT.burn} ${m.burn.v.toFixed(2)}`,
      x0 + 10,
      y0 - 12,
      { font: `500 13px ${MONO2}`, color: PAPER2 }
    );
    const x1 = s.sx(m.tEnd), y1 = s.sy(m.vEnd);
    ctx.save();
    ctx.strokeStyle = rgba2(0.3);
    ctx.setLineDash([3, 5]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 + 0.5, box.y + box.h);
    ctx.lineTo(x1 + 0.5, y1);
    ctx.stroke();
    ctx.restore();
    dot(ctx, x1, y1, 5.5, PAPER2, ACCENT2);
    marker(ctx, s, m.tEnd, { label: `${TEXT.fin} ${m.vEnd.toFixed(2)}`, color: PAPER2 });
    label(ctx, TEXT.noStop, box.x, box.y + 22, { color: rgba2(0.36), font: MONO12, spacing: 0 });
  }
  function drawPhase(m) {
    const box = B2;
    label(ctx, TEXT.sec2, SAFE2.x0, 856, { color: rgba2(0.5) });
    label(ctx, TEXT.ax2, SAFE2.x0 + 178, 856, { color: rgba2(0.32), font: MONO12, spacing: 0 });
    label(
      ctx,
      `${m.coastLen.toFixed(2)} m \uFF0F ${m.coastTime.toFixed(3)} s`,
      SAFE2.x1,
      856,
      { color: PAPER2, align: "right", font: `600 16px ${MONO2}`, spacing: 0 }
    );
    const s = frame(ctx, box, { x0: 0, x1: X_END, y0: V_LOW, y1: m.burn.v + 0.25 }, {
      yLabel: "v (m/s)",
      xTicks: 4,
      yTicks: 4,
      xFmt: (v) => v.toFixed(0),
      yFmt: (v) => v.toFixed(1)
    });
    const real = [], dOnly = [], rOnly = [];
    for (let i = 0; i <= 120; i++) {
      const x = m.burn.x + (X_END - m.burn.x) * (i / 120);
      real.push([x, vAt(x, state.crr)]);
      dOnly.push([x, onlyDrag(x)]);
      rOnly.push([x, onlyRolling(x, state.crr)]);
    }
    area(ctx, s, real, { color: accent2(0.14), base: V_LOW });
    line(ctx, s, rOnly, { color: rgba2(0.3), width: 1.2, dashed: true });
    line(ctx, s, dOnly, { color: rgba2(0.45), width: 1.2, dashed: true });
    line(ctx, s, real, { color: ACCENT2, width: 3 });
    dot(ctx, s.sx(m.burn.x), s.sy(m.burn.v), 4.5, PAPER2, ACCENT2);
    dot(ctx, s.sx(X_END), s.sy(m.vEnd), 5.5, PAPER2, ACCENT2);
    const lx = box.x + box.w - 300, ly = box.y + 26;
    const items = [
      [TEXT.real, ACCENT2, false],
      [TEXT.onlyDrag, rgba2(0.45), true],
      [TEXT.onlyRoll, rgba2(0.3), true]
    ];
    items.forEach(([name, col, dash], i) => {
      const yy = ly + i * 20;
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      if (dash) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, yy);
      ctx.lineTo(lx + 22, yy);
      ctx.stroke();
      ctx.restore();
      label(ctx, name, lx + 30, yy + 4, { color: rgba2(0.5), font: MONO12, spacing: 0 });
    });
  }
  function drawShare(m) {
    const box = B3;
    label(ctx, TEXT.sec3, SAFE2.x0, 1096, { color: rgba2(0.5) });
    label(ctx, TEXT.ax3, SAFE2.x0 + 178, 1096, { color: rgba2(0.32), font: MONO12, spacing: 0 });
    label(
      ctx,
      `${TEXT.dragCap} ${(m.share0 * 100).toFixed(1)} % \u2192 ${(m.shareEnd * 100).toFixed(1)} %`,
      SAFE2.x1,
      1096,
      { color: PAPER2, align: "right", font: `600 16px ${MONO2}`, spacing: 0 }
    );
    const vMax = 19;
    const s = frame(ctx, box, { x0: 0, x1: vMax, y0: 0, y1: 100 }, {
      yLabel: "\u4EFD\u989D (%)",
      xTicks: 5,
      yTicks: 4,
      xFmt: (v) => v.toFixed(0),
      yFmt: (v) => v.toFixed(0)
    });
    const pts2 = [];
    for (let i = 0; i <= 160; i++) {
      const v = vMax * i / 160;
      pts2.push([v, dragShare(v, state.crr) * 100]);
    }
    area(ctx, s, pts2, { color: accent2(0.15) });
    line(ctx, s, pts2, { color: ACCENT2, width: 3 });
    line(ctx, s, [[0, 50], [vMax, 50]], { color: PAPER2, width: 1.2, dashed: true });
    const vinf = m.vinf;
    const px = s.sx(vinf), py = s.sy(50);
    dot(ctx, px, py, 5, PAPER2, ACCENT2);
    callout(
      ctx,
      px,
      py,
      px + 60,
      py + 46,
      `${TEXT.half} v = ${vinf.toFixed(2)} m/s`,
      { color: PAPER2 }
    );
    const xa = s.sx(m.vEnd), xb = s.sx(m.burn.v);
    ctx.save();
    ctx.fillStyle = accent2(0.28);
    ctx.fillRect(xa, box.y + 6, xb - xa, 6);
    ctx.restore();
    label(
      ctx,
      TEXT.coastBand,
      (xa + xb) / 2,
      box.y + 30,
      { color: rgba2(0.6), align: "center", font: MONO12, spacing: 0 }
    );
  }
  function selfTest() {
    const checks = assertions();
    const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} \u2014 ${c.detail}`);
    if (canvas.width !== W2 || canvas.height !== H2) errs.push(`\u753B\u5E03\u5C3A\u5BF8 ${canvas.width}\xD7${canvas.height}`);
    if (!(B1.y > 564 && B1.y + B1.h < 856)) errs.push("\u7B2C\u4E00\u5F20\u56FE\u538B\u5230\u9875\u7709\u6216\u7B2C\u4E8C\u5F20");
    if (!(B2.y + B2.h < 1096)) errs.push("\u7B2C\u4E8C\u5F20\u56FE\u538B\u5230\u7B2C\u4E09\u5F20");
    if (!(B3.y + B3.h + 34 < 1350)) errs.push("\u7B2C\u4E09\u5F20\u56FE\u538B\u5230\u53C2\u6570\u6761");
    if (!(B1.x - 70 >= SAFE2.x0)) errs.push("\u7EB5\u8F74\u6807\u7B7E\u538B\u51FA\u5B89\u5168\u533A");
    if (!(B3.x + B3.w <= SAFE2.x1 + 1)) errs.push("\u7B2C\u4E09\u5F20\u56FE\u538B\u51FA\u5B89\u5168\u533A\u53F3\u8FB9");
    if (!(vAt(X_END, state.crr) > V_LOW)) errs.push("\u672B\u901F\u6389\u51FA\u7EB5\u8F74\u8303\u56F4");
    return { ok: errs.length === 0, errs, checks };
  }
  window.__app = {
    canvas,
    canvasChars: CHARS,
    getState: () => ({ ...state }),
    getMetrics: () => {
      const m = model(state);
      return {
        vBurn: m.burn.v,
        vEnd: m.vEnd,
        tEnd: m.tEnd,
        coastLen: m.coastLen,
        coastTime: m.coastTime,
        avgV: m.avgV,
        vinf: m.vinf,
        a: m.a,
        b: m.b,
        crr: m.crr,
        dEnd: m.dEnd,
        share0: m.share0,
        shareEnd: m.shareEnd,
        dvPct: m.dvPct,
        mEff: m.mEff,
        re0: m.re0,
        reEnd: m.reEnd
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
    downloadAll: () => exportEpisode(canvas, "coast-decel")
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
    const fmt = (v) => key === "crr" ? v.toFixed(4) : v.toFixed(1) + L.unit;
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
