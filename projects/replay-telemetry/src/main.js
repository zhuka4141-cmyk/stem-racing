import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import { CHART, scale, niceStep, line, area, fmtNum } from './plot.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const MONO = CHART.mono;
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
const ACCENT = CHART.accent;
const INK = CHART.ink;
const PAPER = CHART.paper;

/* ───────────────────────── 物理模型 ─────────────────────────
   和 accel-curve-lab 同一套方程，区别是这一期按帧落盘而不是只算汇总。
   来源标注：[FIXED] 物理常数 / [TYPICAL] 文献中值 / [VERIFY] 待车队实测 */

const RHO = 1.204;          // [FIXED] 空气密度 kg/m³ @20°C 海平面
const G = 9.81;             // [FIXED] 重力加速度
const DIST = 20.0;          // [FIXED] 赛道全长 m

export const P = {
  mass: 0.065,      // [VERIFY] 整车质量 kg
  cd0: 0.34,        // [TYPICAL] 零迎角阻力系数
  area: 1.6e-3,     // [TYPICAL] 迎风面积 m²
  crr: 0.008,       // [TYPICAL] 滚动阻力系数
  fPeak: 21,        // [VERIFY] 推力峰值 N
  tBurn: 0.110,     // [VERIFY] 推力持续时间 s
  wheelI: 4.5e-7,   // [TYPICAL] 单轮转动惯量 kg·m²
  wheelR: 0.011,    // [TYPICAL] 轮半径 m
  wheels: 4,
};

const FRAME_HZ = 240;               // 记录帧率
const SUBSTEPS = 50;                // 每帧内部积分步数
const DT = 1 / (FRAME_HZ * SUBSTEPS);

export function effMass(p = P) {
  return p.mass + (p.wheels * p.wheelI) / (p.wheelR * p.wheelR);
}
export function thrust(t, p = P) {
  return t >= p.tBurn ? 0 : p.fPeak * Math.sin((Math.PI * t) / p.tBurn);
}
export function dragF(v, p = P) {
  return 0.5 * RHO * p.cd0 * p.area * v * v;
}
export function rollF(p = P) {
  return p.crr * p.mass * G;
}

/** 定步长欧拉，每 SUBSTEPS 步落一帧。返回逐帧遥测与能量账本。 */
export function simulate(p = P) {
  const me = effMass(p);
  const fr = rollF(p);
  let t = 0, x = 0, v = 0;
  const F = { t: [], x: [], v: [], a: [], ft: [], fd: [], fr: [], fnet: [] };
  let peakA = 0, peakAat = 0, peakV = 0, peakVat = 0;
  let wThrust = 0, wDrag = 0, wRoll = 0;

  for (let i = 0; i < 8000000 && x < DIST; i++) {
    const ft = thrust(t, p);
    const fd = dragF(v, p);
    const a = (ft - fd - fr) / me;
    if (a > peakA) { peakA = a; peakAat = t; }
    if (v > peakV) { peakV = v; peakVat = t; }
    wThrust += ft * v * DT;
    wDrag += fd * v * DT;
    wRoll += fr * v * DT;

    v += a * DT;
    if (v < 0) v = 0;
    x += v * DT;
    t += DT;

    if (i % SUBSTEPS === SUBSTEPS - 1) {
      F.t.push(t); F.x.push(x); F.v.push(v); F.a.push(a);
      F.ft.push(ft); F.fd.push(fd); F.fr.push(fr);
      F.fnet.push(ft - fd - fr);
    }
  }

  return {
    F, tTotal: t, vExit: v, xExit: x,
    peakA, peakAat, peakV, peakVat, me,
    wThrust, wDrag, wRoll,
    kekin: 0.5 * me * v * v,
    frameHz: FRAME_HZ,
    ok: x >= DIST,
  };
}

let RUN = simulate(P);

/* ───────────────────────── 状态 ───────────────────────── */

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');
const scrubEl = document.getElementById('scrub');
const scrubOut = document.getElementById('scrubOut');

const state = {
  mass: P.mass,
  fPeak: P.fPeak,
  tBurn: P.tBurn,
  tNow: 0,
  playing: true,
  dragging: false,
  show: { thrust: true, drag: true, roll: true },
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
    const mid = (lo + hi) >> 1;
    if (arr[mid] < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}
function frameNow() {
  const i = frameIndexAt(state.tNow);
  const F = RUN.F;
  return {
    i, frameCount: F.t.length,
    t: F.t[i], x: F.x[i], v: F.v[i], a: F.a[i],
    ft: F.ft[i], fd: F.fd[i], fr: F.fr[i], fnet: F.fnet[i],
  };
}

/* ───────────────────────── 版面 ───────────────────────── */

const X0 = 176, XW = 700;
const BARS = {
  x: { x: X0, y: 548, w: XW, h: 78 },
  v: { x: X0, y: 660, w: XW, h: 148 },
  a: { x: X0, y: 842, w: XW, h: 78 },
  f: { x: X0, y: 954, w: XW, h: 118 },
};
const PLAY_TO = BARS.x.y;
const PLAY_BOTTOM = BARS.f.y + BARS.f.h;
const AXIS_Y = PLAY_BOTTOM;
const SCRUB_LABEL_Y = 1168;
const SCRUB_Y = 1206;
const PANEL_RULE = 1248;
const PANEL_LABEL = 1274;
const NUM_BASE = 1310;
const ROW0 = 1354, ROW_DY = 28;

/* ───────────────────────── 轻量条带框 ───────────────────────── */

/** 只画横向网格 + 左侧刻度；时间轴留到底部统一画一次 */
function band(box, domain, opts = {}) {
  const s = scale(box, domain);
  const ys = niceStep(domain.y1 - domain.y0, opts.yTicks || 3);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `500 14px ${MONO}`;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(domain.y0 / ys) * ys; v <= domain.y1 + ys * 1e-6; v += ys) {
    const y = Math.round(s.sy(v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < ys * 1e-6 ? CHART.gridMajor : CHART.grid;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
    ctx.fillStyle = CHART.label;
    ctx.fillText(opts.yFmt ? opts.yFmt(v) : fmtNum(v), box.x - 10, y);
  }

  const xs = niceStep(domain.x1 - domain.x0, 6);
  for (let v = Math.ceil(domain.x0 / xs) * xs; v <= domain.x1 + xs * 1e-6; v += xs) {
    const px = Math.round(s.sx(v)) + 0.5;
    ctx.strokeStyle = CHART.grid;
    ctx.beginPath(); ctx.moveTo(px, box.y); ctx.lineTo(px, box.y + box.h); ctx.stroke();
  }

  ctx.strokeStyle = CHART.axis;
  ctx.beginPath();
  ctx.moveTo(box.x + 0.5, box.y); ctx.lineTo(box.x + 0.5, box.y + box.h);
  ctx.stroke();
  ctx.restore();
  return s;
}

function stripTag(box, name, unit, color) {
  ctx.save();
  ctx.font = `500 15px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = color || 'rgba(242,240,235,0.55)';
  ctx.fillText(name, box.x + 2, box.y - 8);
  const w = ctx.measureText(name).width;
  ctx.fillStyle = 'rgba(242,240,235,0.28)';
  ctx.font = `400 13px ${MONO}`;
  ctx.fillText(unit, box.x + 12 + w, box.y - 8);
  ctx.restore();
}

/* ───────────────────────── 合成 ───────────────────────── */

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

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 17px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('REPLAY TELEMETRY · RUN 0417', SAFE.x0, 330);

  ctx.fillStyle = PAPER;
  ctx.font = `600 56px ${DISP}`;
  ctx.letterSpacing = '1px';
  ctx.fillText('逐帧拆开这 ' + RUN.tTotal.toFixed(2) + ' 秒', SAFE.x0, 402);

  ctx.fillStyle = 'rgba(242,240,235,0.55)';
  ctx.font = `500 20px ${MONO}`;
  ctx.letterSpacing = '0px';
  ctx.fillText('240 帧/秒 落盘 · 拖时间轴看每一帧的受力构成', SAFE.x0, 448);

  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 486, SAFE.x1 - SAFE.x0, 1);

  /* 条带区小标题 */
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('帧级遥测 · 四条带共用一条时间轴', SAFE.x0, 518);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.32)';
  ctx.fillText(RUN.F.t.length + ' 帧 / ' + RUN.frameHz + ' Hz', SAFE.x1, 518);
  ctx.restore();
}

/** 推力段底色：一眼看出哪一段有推力 */
function drawBurnBand() {
  const tMax = Math.max(RUN.tTotal, 1e-6);
  const px0 = X0;
  const px1 = X0 + (state.tBurn / tMax) * XW;
  ctx.save();
  ctx.fillStyle = 'rgba(232,89,12,0.055)';
  ctx.fillRect(px0, PLAY_TO, px1 - px0, PLAY_BOTTOM - PLAY_TO);
  ctx.strokeStyle = 'rgba(232,89,12,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(px1) + 0.5, PLAY_TO);
  ctx.lineTo(Math.round(px1) + 0.5, PLAY_BOTTOM);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,89,12,0.62)';
  ctx.font = `500 13px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('推力段 ' + (state.tBurn * 1000).toFixed(0) + ' ms', px0 + 8, PLAY_TO + 6);
  ctx.restore();
}

function drawStrips() {
  const F = RUN.F;
  const tMax = Math.max(RUN.tTotal, 0.01);
  const tDom = { x0: 0, x1: tMax };

  const xTop = Math.max(...F.x) * 1.06;
  const vTop = Math.max(...F.v) * 1.12;
  const aTop = Math.max(...F.a) * 1.10;
  const fTop = Math.max(state.fPeak, ...F.ft) * 1.10;

  /* 位置 */
  stripTag(BARS.x, '位置 x', 'm', 'rgba(242,240,235,0.55)');
  const sx = band(BARS.x, { ...tDom, y0: 0, y1: xTop }, { yTicks: 3 });
  line(ctx, sx, F.t.map((t, i) => [t, F.x[i]]), { color: 'rgba(242,240,235,0.55)', width: 2 });
  ctx.save();
  ctx.strokeStyle = 'rgba(232,89,12,0.45)';
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(BARS.x.x, sx.sy(DIST) + 0.5);
  ctx.lineTo(BARS.x.x + BARS.x.w, sx.sy(DIST) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,89,12,0.7)';
  ctx.font = `500 13px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('终点 20.00 m', BARS.x.x + BARS.x.w - 4, sx.sy(DIST) - 5);
  ctx.restore();

  /* 速度 */
  stripTag(BARS.v, '速度 v', 'm/s', ACCENT);
  const sv = band(BARS.v, { ...tDom, y0: 0, y1: vTop }, { yTicks: 4 });
  const vPts = F.t.map((t, i) => [t, F.v[i]]);
  area(ctx, sv, vPts, { color: 'rgba(232,89,12,0.13)', base: 0 });
  line(ctx, sv, vPts, { color: ACCENT, width: 3 });

  ctx.save();
  ctx.strokeStyle = 'rgba(242,240,235,0.32)';
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(BARS.v.x, sv.sy(RUN.peakV) + 0.5);
  ctx.lineTo(BARS.v.x + BARS.v.w, sv.sy(RUN.peakV) + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 14px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('v_max ' + RUN.peakV.toFixed(2) + ' m/s  @ ' + RUN.peakVat.toFixed(3) + ' s',
    BARS.v.x + BARS.v.w - 4, sv.sy(RUN.peakV) - 6);
  ctx.restore();

  /* 加速度 */
  stripTag(BARS.a, '加速度 a', 'm/s²', 'rgba(242,240,235,0.72)');
  const sa = band(BARS.a, { ...tDom, y0: 0, y1: aTop }, { yTicks: 3 });
  line(ctx, sa, F.t.map((t, i) => [t, F.a[i]]), { color: 'rgba(242,240,235,0.72)', width: 2 });

  /* 受力 */
  stripTag(BARS.f, '受力 F', 'N');
  const sf = band(BARS.f, { ...tDom, y0: 0, y1: fTop }, { yTicks: 3 });
  if (state.show.roll) line(ctx, sf, F.t.map((t, i) => [t, F.fr[i]]), { color: 'rgba(242,240,235,0.40)', width: 2, dashed: true });
  if (state.show.drag) line(ctx, sf, F.t.map((t, i) => [t, F.fd[i]]), { color: 'rgba(242,240,235,0.72)', width: 2 });
  if (state.show.thrust) {
    const tp = F.t.map((t, i) => [t, F.ft[i]]);
    area(ctx, sf, tp, { color: 'rgba(232,89,12,0.20)' });
    line(ctx, sf, tp, { color: ACCENT, width: 3 });
  }

  /* 共享时间轴，只画一次 */
  ctx.save();
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(BARS.f.x, AXIS_Y + 0.5);
  ctx.lineTo(BARS.f.x + BARS.f.w, AXIS_Y + 0.5);
  ctx.stroke();
  ctx.fillStyle = CHART.label;
  ctx.font = `500 14px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xs = niceStep(tMax, 6);
  for (let v = 0; v <= tMax + xs * 1e-6; v += xs) {
    ctx.fillText(v.toFixed(2), sf.sx(v), AXIS_Y + 8);
    ctx.fillStyle = CHART.axis;
    ctx.fillRect(Math.round(sf.sx(v)), AXIS_Y, 1, 5);
    ctx.fillStyle = CHART.label;
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.45)';
  ctx.fillText('时间 t / s', BARS.f.x + BARS.f.w, AXIS_Y + 30);
  ctx.restore();

  /* 播放头：一条竖线贯穿四个条带 */
  const px = Math.round(sv.sx(state.tNow)) + 0.5;
  ctx.save();
  ctx.strokeStyle = 'rgba(242,240,235,0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, PLAY_TO);
  ctx.lineTo(px, PLAY_BOTTOM);
  ctx.stroke();
  ctx.restore();

  /* 速度曲线上的当前点 */
  const cur = frameNow();
  ctx.save();
  ctx.strokeStyle = 'rgba(232,89,12,0.5)';
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

  /* 图例 */
  const legend = [
    ['位置 x', 'rgba(242,240,235,0.55)'],
    ['速度 v', ACCENT],
    ['加速度 a', 'rgba(242,240,235,0.72)'],
    ['推力 F_thrust', ACCENT],
    ['气动阻力 F_drag', 'rgba(242,240,235,0.72)'],
    ['滚动阻力 F_roll', 'rgba(242,240,235,0.40)'],
  ];
  ctx.save();
  ctx.font = `500 14px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  legend.forEach(([label, color], i) => {
    const lx = SAFE.x0 + (i % 3) * 292;
    const ly = 1132;
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 2, 16, 4);
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
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
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('时间轴 · 拖动定位到任意一帧', SAFE.x0, SCRUB_LABEL_Y);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.32)';
  ctx.fillText('0 — ' + span.toFixed(3) + ' s', SAFE.x1, SCRUB_LABEL_Y);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.07)';
  ctx.fillRect(SAFE.x0, SCRUB_Y - 18, w, 36);

  // 一帧一根刻度
  for (let i = 0; i < n; i++) {
    const px = SAFE.x0 + (F.t[i] / span) * w;
    ctx.fillStyle = F.t[i] <= state.tNow ? 'rgba(232,89,12,0.6)' : 'rgba(242,240,235,0.18)';
    ctx.fillRect(px, SCRUB_Y - 13, 1, 26);
  }

  const px = SAFE.x0 + (state.tNow / span) * w;
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
  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, PANEL_RULE, SAFE.x1 - SAFE.x0, 1);

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('当前帧', SAFE.x0, PANEL_LABEL);

  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(242,240,235,0.42)';
  ctx.textAlign = 'right';
  ctx.fillText('第 ' + (cur.i + 1) + ' / ' + cur.frameCount + ' 帧', SAFE.x1, PANEL_LABEL);

  const cells = [
    ['t', cur.t.toFixed(4), 's'],
    ['x', cur.x.toFixed(3), 'm'],
    ['v', cur.v.toFixed(2), 'm/s'],
    ['a', (cur.a / G).toFixed(1), 'g'],
  ];
  const colW = (SAFE.x1 - SAFE.x0) / 4;
  cells.forEach(([k, val, unit], i) => {
    const cx = SAFE.x0 + i * colW;
    ctx.fillStyle = 'rgba(242,240,235,0.38)';
    ctx.font = `500 13px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(k, cx, NUM_BASE - 52);
    ctx.fillStyle = i === 2 ? ACCENT : PAPER;
    ctx.font = `600 42px ${MONO}`;
    ctx.fillText(val, cx, NUM_BASE);
    ctx.fillStyle = 'rgba(242,240,235,0.38)';
    ctx.font = `500 14px ${MONO}`;
    ctx.fillText(unit, cx, NUM_BASE + 22);
  });

  /* 当前帧受力构成：按当前帧最大项归一。
     推力 21 N 与滚阻 0.005 N 差四个数量级，用固定刻度的话后段四条全是空条。 */
  const rows = [
    ['推力 F_thrust', cur.ft, ACCENT],
    ['气动阻力 F_drag', cur.fd, 'rgba(242,240,235,0.72)'],
    ['滚动阻力 F_roll', cur.fr, 'rgba(242,240,235,0.40)'],
    ['合力 F_net', cur.fnet, PAPER],
  ];
  const frameMax = Math.max(1e-9, Math.abs(cur.ft), Math.abs(cur.fd), Math.abs(cur.fr), Math.abs(cur.fnet));
  const barX = SAFE.x0 + 244, barW = 452;
  rows.forEach(([label, val, color], i) => {
    const ry = ROW0 + i * ROW_DY;
    ctx.fillStyle = 'rgba(242,240,235,0.5)';
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, SAFE.x0, ry);

    ctx.fillStyle = 'rgba(242,240,235,0.06)';
    ctx.fillRect(barX, ry - 7, barW, 14);
    const wpx = Math.max(2, (Math.abs(val) / frameMax) * barW);
    ctx.fillStyle = color;
    ctx.fillRect(barX, ry - 7, wpx, 14);

    ctx.fillStyle = PAPER;
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(2) + ' N', SAFE.x1, ry);
  });
  ctx.restore();
}

function drawBrand() {
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 1470, SAFE.x1 - SAFE.x0, 1);

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('STEM RACING · EP.03', SAFE.x0, 1496);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.3)';
  ctx.letterSpacing = '0px';
  ctx.fillText('ρ g L [FIXED]  Cd0 Crr A I_w r_w [TYPICAL]  m F_peak t_burn [VERIFY]', SAFE.x1, 1496);
  ctx.restore();
}

/* ───────────────────────── 交互 ───────────────────────── */

function scrubTo(px) {
  const w = SAFE.x1 - SAFE.x0;
  const f = Math.min(1, Math.max(0, (px - SAFE.x0) / w));
  state.tNow = f * RUN.tTotal;
  syncScrub();
}

function syncScrub() {
  if (scrubEl) scrubEl.value = String(Math.round((state.tNow / Math.max(RUN.tTotal, 1e-6)) * 1000));
  if (scrubOut) scrubOut.textContent = state.tNow.toFixed(4) + ' s';
}

function toCanvas(e) {
  const r = stage.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * W,
    y: ((e.clientY - r.top) / r.height) * H,
  };
}
function inScrubBand(y) {
  return y >= SCRUB_Y - 26 && y <= SCRUB_Y + 26;
}

stage.addEventListener('pointerdown', (e) => {
  const p = toCanvas(e);
  if (!inScrubBand(p.y)) return;
  state.dragging = true;
  state.playing = false;
  setBtnText();
  stage.setPointerCapture(e.pointerId);
  scrubTo(p.x);
});
stage.addEventListener('pointermove', (e) => {
  const p = toCanvas(e);
  if (state.dragging) { scrubTo(p.x); return; }
  stage.style.cursor = inScrubBand(p.y) ? 'ew-resize' : 'default';
});
stage.addEventListener('pointerup', (e) => {
  state.dragging = false;
  try { stage.releasePointerCapture(e.pointerId); } catch { /* 指针已释放 */ }
});
stage.addEventListener('pointercancel', () => { state.dragging = false; });

if (scrubEl) {
  scrubEl.addEventListener('input', () => {
    state.playing = false;
    setBtnText();
    state.tNow = (parseFloat(scrubEl.value) / 1000) * RUN.tTotal;
    if (scrubOut) scrubOut.textContent = state.tNow.toFixed(4) + ' s';
  });
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
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

/* 控件 */
function bind(id, key, k = 1, digits = 2) {
  const el = document.getElementById(id);
  if (!el) return;
  const out = document.getElementById(id + 'Out');
  const sync = () => { if (out) out.textContent = (state[key] / k).toFixed(digits); };
  sync();
  el.addEventListener('input', () => {
    state[key] = parseFloat(el.value) * k;
    rerun();
    sync();
  });
}
bind('mass', 'mass', 1e-3, 0);
bind('fPeak', 'fPeak', 1, 0);
bind('tBurn', 'tBurn', 1e-3, 0);

for (const k of ['thrust', 'drag', 'roll']) {
  const el = document.getElementById('tog-' + k);
  if (el) el.addEventListener('change', () => { state.show[k] = el.checked; compose(); });
}

const pauseBtn = document.getElementById('pause');
function setBtnText() { if (pauseBtn) pauseBtn.textContent = state.playing ? '暂停' : '继续'; }
setBtnText();
if (pauseBtn) pauseBtn.addEventListener('click', () => {
  state.playing = !state.playing;
  setBtnText();
});

const exportBtn = document.getElementById('export');
if (exportBtn) exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  exportBtn.textContent = '导出中…';
  try {
    compose();
    await new Promise((r) => setTimeout(r, 60));
    await window.__app.downloadAll();
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '导出 9:16';
  }
});

/* ───────────────────────── 测试钩子 ───────────────────────── */

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
    ok: RUN.ok,
  }),
  frameAt: (t) => { state.tNow = t; compose(); return frameNow(); },
  scrubFrac: (f) => { state.tNow = f * RUN.tTotal; compose(); return frameNow(); },
  setPlaying: (v) => { state.playing = v; setBtnText(); },
  set: (k, v) => { state[k] = v; rerun(); compose(); },
  setShow: (k, v) => { state.show[k] = v; compose(); },
  simulate,
  selfTest: () => {
    const errs = [];
    const F = RUN.F;
    if (thrust(P.tBurn + 0.01) !== 0) errs.push('推力在 t_burn 之后没有归零');
    if (thrust(0.001) <= 0) errs.push('推力起点非正');
    if (!(dragF(20) > dragF(10) * 3.9)) errs.push('阻力不随速度平方增长');
    if (!(effMass() > P.mass)) errs.push('等效惯性质量应大于平动质量');

    // 速度曲线单调递增到峰值，之后单调递减
    let pk = 0;
    for (let i = 1; i < F.v.length; i++) if (F.v[i] > F.v[pk]) pk = i;
    for (let i = 1; i <= pk; i++) if (F.v[i] < F.v[i - 1] - 1e-9) { errs.push('峰值之前速度不单调'); break; }
    for (let i = pk + 2; i < F.v.length; i++) if (F.v[i] > F.v[i - 1] + 1e-9) { errs.push('峰值之后速度回升'); break; }
    if (!(RUN.peakVat > 0 && RUN.peakVat <= P.tBurn + 1e-9)) errs.push('速度峰值没有落在推力段内');

    // 位置积分到终点 = 20 m
    if (Math.abs(RUN.xExit - DIST) > 0.05) errs.push('位移积分终点偏离 20 m：' + RUN.xExit.toFixed(4));

    // 能量账本闭合
    const bal = Math.abs(RUN.wThrust - RUN.wDrag - RUN.wRoll - RUN.kekin);
    if (bal > Math.max(0.02, RUN.wThrust * 0.01)) errs.push('能量账本不闭合，残差 ' + bal.toFixed(4) + ' J');

    // 帧数与帧率一致
    if (Math.abs(F.t.length - Math.round(RUN.tTotal * RUN.frameHz)) > 2) errs.push('帧数与帧率不一致');
    if (!RUN.ok) errs.push('基线未跑完 20 米');
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
  downloadAll: () => exportEpisode(stage, 'replay-telemetry'),
};
