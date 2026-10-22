/* 画布工具 · 四个项目共用
   设计底座在这里落地：墨/纸/测绘橙、8px 基线、圆角 0、数字全走等宽。
   规范来源：anti-slop-design skill。改这里等于改四个项目。

   build.mjs 会从 ../../shared/ 覆盖进项目，要改就改 shared 这份。 */

export const INK = '#0b0b0c';
export const PAPER = '#f2f0eb';
export const ACCENT = '#e8590c';

/* 等宽栈必须带中文字形回退，否则 Consolas 会静默丢字 */
export const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
export const DISP = '"Bahnschrift Condensed","Bahnschrift","Arial Narrow","Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';

export const W = 1080;
export const H = 1920;
export const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

export const rgba = (a) => `rgba(242,240,235,${a})`;
export const accent = (a) => `rgba(232,89,12,${a})`;

/* 网格亮度是量化过的：纸色 240、墨色 11，透明度 0.075 时合成亮度 28，
   刚好在 tests/visual.mjs 的 24 阈值之上。不要往下调。 */
export function backdrop(ctx) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(0.075);
  ctx.beginPath();
  for (let x = 0; x <= W; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = rgba(0.105);
  ctx.beginPath();
  for (let x = 0; x <= W; x += 200) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 200) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  ctx.restore();
}

export function hairline(ctx, y, x0 = SAFE.x0, x1 = SAFE.x1, a = 0.14) {
  ctx.save();
  ctx.strokeStyle = rgba(a);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 0.5);
  ctx.lineTo(x1, y + 0.5);
  ctx.stroke();
  ctx.restore();
}

export function accentRule(ctx, x, y, w = 46, h = 3) {
  ctx.save();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function text(ctx, s, x, y, {
  font = `500 17px ${MONO}`, color = PAPER, align = 'left', baseline = 'alphabetic', spacing = 0,
} = {}) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (spacing && 'letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** 微标签：大写 + 追踪字距。工程标注感的来源 */
export function label(ctx, s, x, y, o = {}) {
  return text(ctx, s.toUpperCase(), x, y, {
    font: o.font ?? `500 15px ${MONO}`,
    color: o.color ?? rgba(0.5),
    spacing: o.spacing ?? 1.6,
    align: o.align,
  });
}

export function kicker(ctx, s, y = 348, x = SAFE.x0) {
  label(ctx, s, x, y, { color: rgba(0.5), font: `500 17px ${MONO}` });
}

export function title(ctx, lines, y = 418, { size = 62, color = PAPER, lead = 72 } = {}) {
  ctx.save();
  ctx.font = `600 ${size}px ${DISP}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, SAFE.x0, y + i * lead));
  ctx.restore();
  return y + (lines.length - 1) * lead;
}

export function sub(ctx, s, y, { size = 21, color = rgba(0.62), x = SAFE.x0, align = 'left' } = {}) {
  return text(ctx, s, x, y, { font: `400 ${size}px ${MONO}`, color, align });
}

export function bigNum(ctx, s, x, y, { size = 84, color = ACCENT, align = 'left' } = {}) {
  return text(ctx, s, x, y, { font: `600 ${size}px ${MONO}`, color, align });
}

/** 带单位的大读数：数字 + 单位 + 说明 + 来源标注 */
export function readout(ctx, { x, y, value, unit, caption, status, color = PAPER, size = 52 }) {
  ctx.save();
  ctx.font = `600 ${size}px ${MONO}`;
  const vw = ctx.measureText(value).width;
  ctx.restore();
  bigNum(ctx, value, x, y, { size, color });
  if (unit) text(ctx, unit, x + vw + 7, y, { font: `400 19px ${MONO}`, color: rgba(0.45) });
  if (caption) label(ctx, caption, x, y + 24, { color: rgba(0.45) });
  if (status) label(ctx, status, x, y + 45, { color: ACCENT, font: `500 13px ${MONO}` });
}

export function axisFrame(ctx, box) {
  const { x0, y0, x1, y1 } = box;
  ctx.save();
  ctx.strokeStyle = rgba(0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y1 + 0.5); ctx.lineTo(x1, y1 + 0.5);
  ctx.moveTo(x0 + 0.5, y0); ctx.lineTo(x0 + 0.5, y1);
  ctx.stroke();
  ctx.restore();
}

export function plotGrid(ctx, box, nx = 6, ny = 5) {
  const { x0, y0, x1, y1 } = box;
  ctx.save();
  ctx.strokeStyle = rgba(0.075);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= nx; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / nx) + 0.5;
    ctx.moveTo(x, y0); ctx.lineTo(x, y1);
  }
  for (let i = 0; i <= ny; i++) {
    const y = Math.round(y0 + (y1 - y0) * i / ny) + 0.5;
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.restore();
}

export const mapRange = (v, a, b, c, d) => c + (v - a) / (b - a) * (d - c);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function polyline(ctx, pts, { color = PAPER, width = 2, dash = null, alpha = 1 } = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

export function dot(ctx, x, y, r = 4, color = ACCENT, ring = null) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

/** 硬边箭头：不用圆头，和整体几何一致 */
export function arrow(ctx, x0, y0, x1, y1, { color = ACCENT, width = 3, head = 13 } = {}) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.40) * head, y1 - Math.sin(a - 0.40) * head);
  ctx.lineTo(x1 - Math.cos(a + 0.40) * head, y1 - Math.sin(a + 0.40) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 引出标注：小折线 + 文字。工程制图的做法 */
export function callout(ctx, x0, y0, x1, y1, s, { color = rgba(0.55), align = 'left', font = `400 15px ${MONO}` } = {}) {
  ctx.save();
  ctx.strokeStyle = rgba(0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
  const tx = align === 'right' ? x1 - 8 : x1 + 8;
  text(ctx, s, tx, y1 + 5, { font, color, align });
}

export function footer(ctx, { left, right, y = 1440 }) {
  hairline(ctx, y - 28);
  label(ctx, left, SAFE.x0, y, { color: rgba(0.42) });
  label(ctx, right, SAFE.x1, y, { color: rgba(0.42), align: 'right' });
}

/** 报警条：sanity band 破了就在这里亮着说，不许装作正常 */
export function warnBand(ctx, y, { ok, text: msg, detail }) {
  const x0 = SAFE.x0, w = SAFE.x1 - SAFE.x0, h = 62;
  ctx.save();
  ctx.fillStyle = ok ? 'rgba(242,240,235,0.06)' : 'rgba(232,89,12,0.22)';
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = ok ? rgba(0.32) : ACCENT;
  ctx.fillRect(x0, y, 4, h);
  ctx.restore();
  label(ctx, ok ? 'SANITY BAND  ·  OK' : 'SANITY BAND  ·  VIOLATED', x0 + 18, y + 24, {
    color: ok ? rgba(0.55) : ACCENT, font: `600 15px ${MONO}`,
  });
  text(ctx, msg, x0 + 18, y + 48, { font: `400 17px ${MONO}`, color: PAPER });
  if (detail) {
    text(ctx, detail, SAFE.x1 - 14, y + 48, { font: `400 15px ${MONO}`, color: rgba(0.5), align: 'right' });
  }
}
