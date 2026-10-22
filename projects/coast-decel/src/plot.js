/* 手写 Canvas 图表模块 · 共用
   为什么不用图表库：Chart.js/ECharts 的体积、默认配色（紫蓝渐变+圆角）和
   动画缓动，恰好是「AI 生成」最明显的三个特征。手写一百多行就能完全控制。
   风格约定：细网格、单一强调色、等宽刻度数字、无阴影无圆角。 */

export const CHART = {
  ink: '#0b0b0c',
  paper: '#f2f0eb',
  accent: '#e8590c',
  grid: 'rgba(242,240,235,0.10)',
  gridMajor: 'rgba(242,240,235,0.20)',
  axis: 'rgba(242,240,235,0.38)',
  label: 'rgba(242,240,235,0.55)',
  mono: '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace',
  sans: '"IBM Plex Sans","Noto Sans SC","Microsoft YaHei",sans-serif',
};

/** 在 box 内建立数据坐标 → 像素坐标的映射。返回 sx/sy 两个函数。
 *  box 是绘图区（不含坐标轴标签），domain 是数据范围。 */
export function scale(box, domain) {
  const { x0, x1, y0, y1 } = domain;
  const dx = x1 - x0 || 1;
  const dy = y1 - y0 || 1;
  return {
    sx: (v) => box.x + ((v - x0) / dx) * box.w,
    sy: (v) => box.y + box.h - ((v - y0) / dy) * box.h,
    domain,
    box,
  };
}

/** 好看的刻度步长：1/2/5 × 10^n */
export function niceStep(range, target = 5) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
  return step * mag;
}

/** 画网格 + 坐标轴 + 刻度数字。返回实际用的 s。
 *  opts: { xLabel, yLabel, xFmt, yFmt, xTicks, yTicks } */
export function frame(ctx, box, domain, opts = {}) {
  const s = scale(box, domain);
  const xf = opts.xFmt || ((v) => fmtNum(v));
  const yf = opts.yFmt || ((v) => fmtNum(v));
  const xs = niceStep(domain.x1 - domain.x0, opts.xTicks || 5);
  const ys = niceStep(domain.y1 - domain.y0, opts.yTicks || 5);

  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `500 15px ${CHART.mono}`;
  ctx.letterSpacing = '0px';

  // 横向网格 + y 轴刻度
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yStart = Math.ceil(domain.y0 / ys) * ys;
  for (let v = yStart; v <= domain.y1 + ys * 1e-6; v += ys) {
    const y = Math.round(s.sy(v)) + 0.5;
    const major = Math.abs(v) < ys * 1e-6;
    ctx.strokeStyle = major ? CHART.gridMajor : CHART.grid;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
    ctx.fillStyle = CHART.label;
    ctx.fillText(yf(v), box.x - 10, y);
  }

  // 纵向网格 + x 轴刻度
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xStart = Math.ceil(domain.x0 / xs) * xs;
  for (let v = xStart; v <= domain.x1 + xs * 1e-6; v += xs) {
    const x = Math.round(s.sx(v)) + 0.5;
    ctx.strokeStyle = CHART.grid;
    ctx.beginPath(); ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); ctx.stroke();
    ctx.fillStyle = CHART.label;
    ctx.fillText(xf(v), x, box.y + box.h + 10);
  }

  // 轴线
  ctx.strokeStyle = CHART.axis;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y + box.h + 0.5); ctx.lineTo(box.x + box.w, box.y + box.h + 0.5);
  ctx.moveTo(box.x + 0.5, box.y); ctx.lineTo(box.x + 0.5, box.y + box.h);
  ctx.stroke();

  // 轴标题
  if (opts.xLabel) {
    ctx.fillStyle = CHART.label;
    ctx.font = `500 15px ${CHART.mono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opts.xLabel, box.x + box.w, box.y + box.h + 44);
  }
  if (opts.yLabel) {
    ctx.save();
    ctx.translate(box.x - 62, box.y);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = CHART.label;
    ctx.fillText(opts.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  return s;
}

/** 折线。points 是 [[x,y], ...]。dashed 用于预测/参考线。 */
export function line(ctx, s, points, { color = CHART.accent, width = 3, dashed = false, glow = false } = {}) {
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([10, 10]);
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.beginPath();
  pts(ctx, s, points);
  ctx.stroke();
  ctx.restore();
}

/** 面积填充（到 y=0 或到指定基线） */
export function area(ctx, s, points, { color = 'rgba(232,89,12,0.16)', base = 0 } = {}) {
  if (points.length < 2) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = s.sx(x), py = s.sy(y);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.lineTo(s.sx(points[points.length - 1][0]), s.sy(base));
  ctx.lineTo(s.sx(points[0][0]), s.sy(base));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 散点 */
export function dots(ctx, s, points, { color = CHART.accent, r = 4 } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(s.sx(x), s.sy(y), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 竖直标注线（当前帧、最佳值等） */
export function marker(ctx, s, x, { label, color = CHART.paper } = {}) {
  const px = Math.round(s.sx(x)) + 0.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(px, s.box.y);
  ctx.lineTo(px, s.box.y + s.box.h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (label) {
    ctx.fillStyle = color;
    ctx.font = `500 15px ${CHART.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, px, s.box.y - 6);
  }
  ctx.restore();
}

/** 横条图（用于质量分配之类）。items: [{label, value, color?}] */
export function hbars(ctx, box, items, { max, fmt = (v) => fmtNum(v), gap = 14 } = {}) {
  const m = max || Math.max(...items.map((i) => i.value));
  const rowH = (box.h - gap * (items.length - 1)) / items.length;
  ctx.save();
  ctx.font = `500 17px ${CHART.mono}`;
  ctx.textBaseline = 'middle';
  items.forEach((it, i) => {
    const y = box.y + i * (rowH + gap);
    const w = Math.max(1, (it.value / m) * (box.w - 210));
    ctx.fillStyle = 'rgba(242,240,235,0.06)';
    ctx.fillRect(box.x + 190, y, box.w - 210, rowH);
    ctx.fillStyle = it.color || CHART.accent;
    ctx.fillRect(box.x + 190, y, w, rowH);
    ctx.fillStyle = CHART.label;
    ctx.textAlign = 'right';
    ctx.fillText(it.label, box.x + 176, y + rowH / 2);
    ctx.fillStyle = CHART.paper;
    ctx.textAlign = 'left';
    ctx.fillText(fmt(it.value), box.x + 200 + w + 10, y + rowH / 2);
  });
  ctx.restore();
}

/** 图例。items: [{label, color}] */
export function legend(ctx, x, y, items, { columns = 1, rowH = 26 } = {}) {
  ctx.save();
  ctx.font = `500 16px ${CHART.mono}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  items.forEach((it, i) => {
    const cx = x + Math.floor(i / columns) * 0; // 单列，多列自己排
    const cy = y + i * rowH;
    ctx.fillStyle = it.color;
    ctx.fillRect(cx, cy - 2, 18, 4);
    ctx.fillStyle = CHART.label;
    ctx.fillText(it.label, cx + 28, cy);
  });
  ctx.restore();
}

/** 数字格式化：去掉多余的 0，大数加单位前缀 */
export function fmtNum(v, digits = 2) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'k';
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(digits).replace(/\.?0+$/, '');
  return v.toFixed(digits + 1);
}

/** 内部：把点列表建成路径 */
function pts(ctx, s, points) {
  points.forEach(([x, y], i) => {
    const px = s.sx(x), py = s.sy(y);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
}

/** 把一组 [t, v] 采样成密集点，用于平滑曲线 */
export function sample(fn, t0, t1, n = 200) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    out.push([t, fn(t)]);
  }
  return out;
}
