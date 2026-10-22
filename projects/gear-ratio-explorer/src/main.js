import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import { CHART, scale, niceStep, line, area, fmtNum } from './plot.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const MONO = CHART.mono;
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
const ACCENT = CHART.accent;
const INK = CHART.ink;
const PAPER = CHART.paper;

/* ───────────────── 物理模型 ─────────────────
   和 accel-curve-lab 同一台车，只多一个等效传动比 i。
   i = 1 时必须逐位退回原参数，这是 selfTest 的第一条。 */

const RHO = 1.204;        // [FIXED]
const G = 9.81;           // [FIXED]
const DIST = 20.0;        // [FIXED] 赛道全长 m
const MASS = 0.065;       // [VERIFY] 整车质量 kg
const CD0 = 0.34;         // [TYPICAL]
const AREA = 1.6e-3;      // [TYPICAL] 迎风面积 m²
const CRR = 0.008;        // [TYPICAL]
const WHEEL_I = 4.5e-7;   // [TYPICAL] 单轮转动惯量 kg·m²
const WHEEL_R = 0.011;    // [TYPICAL] 轮半径 m
const N_WHEEL = 4;

const F_PEAK_REF = 21;    // [VERIFY] i = 1 时推力峰值 N
const T_BURN_REF = 0.110; // [VERIFY] i = 1 时推力时长 s
const V_CEIL_REF = 26.0;  // [VERIFY] i = 1 时车轮速度上限 m/s

export const MEFF = MASS + (N_WHEEL * WHEEL_I) / (WHEEL_R * WHEEL_R);
export const IMPULSE = (2 * F_PEAK_REF * T_BURN_REF) / Math.PI;

export const I_MIN = 0.20, I_MAX = 3.00, I_DEF = 1.00;

/** 传动比一改，这三个量一起变；冲量 F_peak·t_burn 保持不变 */
export function paramsAt(i) {
  return {
    i,
    fPeak: F_PEAK_REF * i,
    tBurn: T_BURN_REF / i,
    vCeil: V_CEIL_REF / i,
    impulse: IMPULSE,
  };
}

export function thrust(t, v, p) {
  if (t >= p.tBurn || v >= p.vCeil) return 0;
  return p.fPeak * Math.sin((Math.PI * t) / p.tBurn);
}
export function dragF(v) {
  return 0.5 * RHO * CD0 * AREA * v * v;
}
export function rollF() {
  return CRR * MASS * G;
}

/** 定步长欧拉积分，跑到 20 m 为止 */
export function run(i, { dt = 1 / 8000, maxT = 8, traceN = 220 } = {}) {
  const p = paramsAt(i);
  const fr = rollF();
  let t = 0, x = 0, v = 0;
  let peakA = 0, peakAat = 0, peakV = 0, peakVat = 0;
  const trace = [];
  const every = Math.max(1, Math.round(0.004 / dt));

  let done = false;
  for (let s = 0; s < 4e7 && !done && t < maxT; s++) {
    const ft = thrust(t, v, p);
    const fd = dragF(v);
    const a = (ft - fd - fr) / MEFF;
    if (a > peakA) { peakA = a; peakAat = t; }
    if (v > peakV) { peakV = v; peakVat = t; }
    if (s % every === 0) trace.push([t, v, x]);

    let vN = v + a * dt;
    if (vN < 0) vN = 0;
    const xN = x + vN * dt;
    // 恰好跨过 20 m 的那一步线性插值，否则终点时间被 dt 量化，
    // 扫 i 的时候 t(i) 和 v_exit(i) 会出现假抖动
    if (xN >= DIST) {
      const f = (DIST - x) / (xN - x);
      t = t + dt * f;
      v = v + (vN - v) * f;
      x = DIST;
      done = true;
    } else {
      v = vN; x = xN; t += dt;
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
    p, t, x, v, peakA, peakAat, peakV, peakVat, trace: out,
    hitCeil: peakV >= p.vCeil - 1e-6,
  };
}

/* ───────────────── 扫传动比，找最优点 ───────────────── */

const SWEEP_N = 57;
const SWEEP = [];
for (let k = 0; k < SWEEP_N; k++) {
  const i = I_MIN + ((I_MAX - I_MIN) * k) / (SWEEP_N - 1);
  const r = run(i, { dt: 1 / 12000, traceN: 2 });
  SWEEP.push({ i, t: r.t, v: r.v, peakA: r.peakA, ceil: r.hitCeil });
}

let BEST = SWEEP[0];
for (const s of SWEEP) if (s.t < BEST.t) BEST = s;

/* 车轮速度上限从哪一档开始真的咬住。
   这是整张图最关键的一条线：它左边是「推力不够」，右边是「速度顶死」。 */
const clipIdx = SWEEP.findIndex((s) => s.ceil);
export const CLIP_I = clipIdx < 0 ? I_MAX : SWEEP[clipIdx].i;

const BAND_TOL = 1.02;
const inBand = SWEEP.filter((s) => s.t <= BEST.t * BAND_TOL);
export const BAND = {
  lo: inBand[0].i,
  hi: inBand[inBand.length - 1].i,
  tBest: BEST.t,
  iBest: BEST.i,
  vBest: BEST.v,
};

/* 参考族线只算一次，滑块拖动时不能重算 */
const GHOSTS = [0.3, 0.5, 0.8, 1.6, 2.4];
const GHOST_RUNS = GHOSTS.map((gi) => ({ i: gi, r: run(gi, { dt: 1 / 3000, traceN: 110 }) }));
const GHOST_VMAX = Math.max(...GHOST_RUNS.map((g) => g.r.peakV));
const GHOST_TMAX = Math.max(...GHOST_RUNS.map((g) => g.r.t));

/* ───────────────── 状态 ───────────────── */

const state = { i: I_DEF };
let R = run(state.i);

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

/* ───────────────── 版面 ───────────────── */

const X0 = 176, XW = 700;
const C1 = { x: X0, y: 548, w: XW, h: 200 };
const C2 = { x: X0, y: 802, w: XW, h: 150 };
const C3 = { x: X0, y: 1012, w: XW, h: 150 };
const I_DOM = { x0: I_MIN, x1: I_MAX };
const X_AXIS_Y = C3.y + C3.h;

/* ───────────────── 合成 ───────────────── */

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

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 17px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('GEAR RATIO · WHAT-IF', SAFE.x0, 330);

  ctx.fillStyle = PAPER;
  ctx.font = `600 56px ${DISP}`;
  ctx.letterSpacing = '1px';
  ctx.fillText('齿比再大一点，真的更快吗', SAFE.x0, 402);

  ctx.fillStyle = 'rgba(242,240,235,0.55)';
  ctx.font = `500 20px ${MONO}`;
  ctx.letterSpacing = '0px';
  ctx.fillText('同一份冲量换个放法：换更大的力，还是换更长的时间', SAFE.x0, 448);

  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 486, SAFE.x1 - SAFE.x0, 1);
  ctx.restore();
}

function tag(y, left, right) {
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(left, SAFE.x0, y);
  if (right) {
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242,240,235,0.32)';
    ctx.fillText(right, SAFE.x1, y);
  }
  ctx.restore();
}

/** 只画横向网格 + 左侧 y 刻度，三条曲线共用同一套写法 */
function gridY(box, dom, yTicks = 4) {
  const s = scale(box, dom);
  const ys = niceStep(dom.y1 - dom.y0, yTicks);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `500 14px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = Math.ceil(dom.y0 / ys) * ys; v <= dom.y1 + ys * 1e-6; v += ys) {
    const y = Math.round(s.sy(v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < ys * 1e-6 ? CHART.gridMajor : CHART.grid;
    ctx.beginPath(); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); ctx.stroke();
    ctx.fillStyle = CHART.label;
    ctx.fillText(fmtNum(v), box.x - 10, y);
  }
  ctx.strokeStyle = CHART.axis;
  ctx.beginPath();
  ctx.moveTo(box.x + 0.5, box.y); ctx.lineTo(box.x + 0.5, box.y + box.h);
  ctx.stroke();
  ctx.restore();
  return s;
}

function drawCurve() {
  tag(524, '① 速度曲线 v(t)', '冲量固定 ' + IMPULSE.toFixed(2) + ' N·s');

  // x 轴跟着当前这一趟走，曲线永远填满画幅；比当前更慢的参考线在图右缘被裁掉
  const dom = {
    x0: 0,
    x1: Math.max(0.6, Math.ceil(R.t * 1.06 * 10) / 10),
    y0: 0,
    y1: Math.ceil((GHOST_VMAX * 1.05) / 2) * 2,
  };
  const s = gridY(C1, dom, 4);

  ctx.save();
  const xs = niceStep(dom.x1, 6);
  ctx.font = `500 14px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = 0; v <= dom.x1 + 1e-9; v += xs) {
    const px = Math.round(s.sx(v)) + 0.5;
    ctx.strokeStyle = CHART.grid;
    ctx.beginPath(); ctx.moveTo(px, C1.y); ctx.lineTo(px, C1.y + C1.h); ctx.stroke();
    ctx.fillStyle = CHART.label;
    ctx.fillText(v.toFixed(1), px, C1.y + C1.h + 8);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.42)';
  ctx.fillText('t / s', C1.x + C1.w, C1.y + C1.h + 30);
  ctx.restore();

  // x 轴跟着当前这一趟缩，跑得更久的参考线会被画到框外，必须先裁到框内
  ctx.save();
  ctx.beginPath();
  ctx.rect(C1.x, C1.y, C1.w, C1.h);
  ctx.clip();

  for (const g of GHOST_RUNS) {
    line(ctx, s, g.r.trace.map((p) => [p[0], p[1]]), { color: 'rgba(242,240,235,0.26)', width: 2 });
  }

  const pts = R.trace.map((p) => [p[0], p[1]]);
  area(ctx, s, pts, { color: 'rgba(232,89,12,0.13)', base: 0 });
  line(ctx, s, pts, { color: ACCENT, width: 3 });
  ctx.restore();

  if (R.p.vCeil < dom.y1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,89,12,0.6)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    const yy = Math.round(s.sy(R.p.vCeil)) + 0.5;
    ctx.beginPath(); ctx.moveTo(C1.x, yy); ctx.lineTo(C1.x + C1.w, yy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(232,89,12,0.85)';
    ctx.font = `500 13px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('车轮速度上限 ' + R.p.vCeil.toFixed(1) + ' m/s', C1.x + 6, yy - 4);
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
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(242,240,235,0.38)';
  ctx.fillText('灰线 = i = ' + GHOSTS.join(' / ') + '  橙色 = 当前', SAFE.x0, C1.y + C1.h + 50);
  ctx.restore();
}

/** 上限生效区间：从 CLIP_I 到右端全部顶死，标出来免得看着像模型抖动 */
function shadeClip(box, s, label) {
  if (CLIP_I >= I_MAX) return;
  const x0 = s.sx(CLIP_I);
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.05)';
  ctx.fillRect(x0, box.y, box.x + box.w - x0, box.h);
  ctx.strokeStyle = 'rgba(242,240,235,0.30)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(Math.round(x0) + 0.5, box.y);
  ctx.lineTo(Math.round(x0) + 0.5, box.y + box.h);
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    ctx.fillStyle = 'rgba(242,240,235,0.42)';
    ctx.font = `500 12px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('速度上限生效 i > ' + CLIP_I.toFixed(2), x0 + 8, box.y + 5);
  }
  ctx.restore();
}

function drawTimeTradeoff() {
  tag(786, '② 完赛时间 t(i) · 越低越好', '最优 i* = ' + BEST.i.toFixed(2) + ' · ' + BEST.t.toFixed(3) + ' s');

  const tMax = SWEEP[SWEEP.length - 1].t;
  const dom = { ...I_DOM, y0: 1.10, y1: Math.ceil(tMax * 1.06 * 10) / 10 };
  const s = gridY(C2, dom, 3);
  shadeClip(C2, s, false);

  ctx.save();
  ctx.fillStyle = 'rgba(232,89,12,0.10)';
  ctx.fillRect(s.sx(BAND.lo), C2.y, s.sx(BAND.hi) - s.sx(BAND.lo), C2.h);
  ctx.strokeStyle = 'rgba(232,89,12,0.45)';
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

  const pts = SWEEP.map((p) => [p.i, p.t]);
  area(ctx, s, pts, { color: 'rgba(242,240,235,0.07)', base: dom.y0 });
  line(ctx, s, pts, { color: 'rgba(242,240,235,0.70)', width: 2 });

  const cx = s.sx(state.i), cy = s.sy(R.t);
  ctx.save();
  ctx.strokeStyle = 'rgba(242,240,235,0.28)';
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
  ctx.fillStyle = 'rgba(232,89,12,0.85)';
  ctx.font = `500 13px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('推荐 ' + BAND.lo.toFixed(2) + '–' + BAND.hi.toFixed(2), s.sx((BAND.lo + BAND.hi) / 2), C2.y + 6);
  ctx.restore();
}

function drawSpeedTradeoff() {
  tag(996, '③ 到头速度 v_exit(i) · 越高越好', 'i 越大掉得越快');

  const vTop = Math.max(...SWEEP.map((s) => s.v));
  const dom = { ...I_DOM, y0: 0, y1: Math.ceil((vTop * 1.12) / 4) * 4 };
  const s = gridY(C3, dom, 3);
  shadeClip(C3, s, true);

  ctx.save();
  ctx.fillStyle = 'rgba(232,89,12,0.10)';
  ctx.fillRect(s.sx(BAND.lo), C3.y, s.sx(BAND.hi) - s.sx(BAND.lo), C3.h);
  ctx.restore();

  const pts = SWEEP.map((p) => [p.i, p.v]);
  area(ctx, s, pts, { color: 'rgba(242,240,235,0.06)', base: 0 });
  line(ctx, s, pts, { color: 'rgba(242,240,235,0.70)', width: 2 });

  ctx.save();
  ctx.strokeStyle = CHART.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(C3.x, X_AXIS_Y + 0.5);
  ctx.lineTo(C3.x + C3.w, X_AXIS_Y + 0.5);
  ctx.stroke();
  ctx.font = `500 14px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
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
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.45)';
  ctx.fillText('等效传动比 i', C3.x + C3.w, X_AXIS_Y + 32);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(s.sx(state.i) - 6, s.sy(R.v) - 6, 12, 12);
  ctx.restore();
}

function drawReadouts() {
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 1200, SAFE.x1 - SAFE.x0, 1);
  ctx.restore();

  tag(1226, '当前传动比', R.hitCeil ? '已撞上速度上限' : '未撞上限');

  const cells = [
    ['i', state.i.toFixed(2), '等效传动比', PAPER],
    ['t', R.t.toFixed(3), 's · 跑完 20 m', PAPER],
    ['v_exit', R.v.toFixed(1), 'm/s · 冲到', ACCENT],
    ['a_max', (R.peakA / G).toFixed(0), 'g · 起步', PAPER],
  ];
  const colW = (SAFE.x1 - SAFE.x0) / 4;
  cells.forEach(([k, val, unit, color], idx) => {
    const cx = SAFE.x0 + idx * colW;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(242,240,235,0.38)';
    ctx.font = `500 13px ${MONO}`;
    ctx.fillText(k, cx, 1256);
    ctx.fillStyle = color;
    ctx.font = `600 38px ${MONO}`;
    ctx.fillText(val, cx, 1296);
    ctx.fillStyle = 'rgba(242,240,235,0.38)';
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
    ctx.strokeStyle = 'rgba(232,89,12,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(SAFE.x0 + 0.5, y + 0.5, SAFE.x1 - SAFE.x0 - 1, 75.5);
  } else {
    ctx.fillStyle = 'rgba(242,240,235,0.055)';
    ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 76);
  }

  ctx.fillStyle = inside ? PAPER : 'rgba(242,240,235,0.62)';
  ctx.font = `500 13px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(inside ? '在推荐带内' : '偏离推荐带', SAFE.x0 + 20, y + 26);

  ctx.letterSpacing = '0px';
  ctx.font = `600 27px ${MONO}`;
  const dt = (R.t - BAND.tBest) * 1000;
  ctx.fillText(
    '比最优点慢 ' + Math.abs(dt).toFixed(0) + ' ms · 到头速度少 ' +
    Math.max(0, BAND.vBest - R.v).toFixed(2) + ' m/s',
    SAFE.x0 + 20, y + 60
  );

  ctx.textAlign = 'right';
  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.fillText('推荐 i = ' + BAND.lo.toFixed(2) + ' – ' + BAND.hi.toFixed(2), SAFE.x1 - 20, y + 26);
  ctx.fillText('i < ' + BAND.lo.toFixed(2) + ' 起步太软 · i > ' + BAND.hi.toFixed(2) + ' 撞上限', SAFE.x1 - 20, y + 60);
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
  ctx.fillText('STEM RACING · EP.05', SAFE.x0, 1496);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.3)';
  ctx.letterSpacing = '0px';
  ctx.fillText('真车没有变速器 · 纯假设 · V_CEIL 26 m/s [VERIFY]', SAFE.x1, 1496);
  ctx.restore();
}

/* ───────────────── 交互 ───────────────── */

const slider = document.getElementById('ratio');
const ratioOut = document.getElementById('ratioOut');

function setI(v) {
  state.i = Math.min(I_MAX, Math.max(I_MIN, v));
  R = run(state.i);
  if (slider) slider.value = String(state.i);
  if (ratioOut) ratioOut.textContent = state.i.toFixed(2);
  compose();
}

if (slider) slider.addEventListener('input', () => setI(parseFloat(slider.value)));
setI(I_DEF);

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

const bestBtn = document.getElementById('best');
if (bestBtn) bestBtn.addEventListener('click', () => setI(BEST.i));

/* ───────────────── 测试钩子 ───────────────── */

window.__app = {
  canvas: stage,
  params: { MASS, CD0, AREA, CRR, MEFF, IMPULSE, F_PEAK_REF, T_BURN_REF, V_CEIL_REF, I_MIN, I_MAX },
  run: (i) => {
    const r = run(i, { traceN: 20 });
    return {
      i, t: r.t, x: r.x, v: r.v, peakA: r.peakA, peakAat: r.peakAat,
      peakV: r.peakV, hitCeil: r.hitCeil, vCeil: r.p.vCeil,
      fPeak: r.p.fPeak, tBurn: r.p.tBurn,
    };
  },
  sweep: () => SWEEP.map((s) => ({ ...s })),
  band: () => ({ ...BAND }),
  setI: (v) => { setI(v); return { i: state.i, t: R.t, v: R.v, peakA: R.peakA, hitCeil: R.hitCeil }; },
  getMetrics: () => ({
    i: state.i, t: R.t, x: R.x, v: R.v,
    peakA: R.peakA, peakAat: R.peakAat, peakV: R.peakV,
    vCeil: R.p.vCeil, fPeak: R.p.fPeak, tBurn: R.p.tBurn,
    impulse: R.p.impulse, hitCeil: R.hitCeil, meff: MEFF,
    clipI: CLIP_I, band: { ...BAND }, sweepN: SWEEP.length,
  }),
  selfTest: () => {
    const errs = [];

    const base = run(1, { traceN: 20 });
    if (Math.abs(base.t - 1.1885) > 4e-3) errs.push('i=1 完赛时间偏离基线：' + base.t.toFixed(4));
    if (Math.abs(base.v - 16.906) > 0.06) errs.push('i=1 末速偏离基线：' + base.v.toFixed(3));
    if (Math.abs(base.x - DIST) > 0.05) errs.push('i=1 位移终点偏离 20 m');

    for (const i of [0.4, 1, 2.5]) {
      const p = paramsAt(i);
      const imp = (2 * p.fPeak * p.tBurn) / Math.PI;
      if (Math.abs(imp - IMPULSE) > 1e-9) errs.push('i=' + i + ' 的冲量不守恒');
    }

    for (let k = 1; k < SWEEP.length; k++) {
      if (SWEEP[k].v > SWEEP[k - 1].v + 1e-6) {
        errs.push('到头速度不随 i 单调下降，断在 i=' + SWEEP[k].i.toFixed(2));
        break;
      }
    }

    const bi = SWEEP.indexOf(BEST);
    if (bi <= 0 || bi >= SWEEP.length - 1) errs.push('最优点落在定义域边界，说明没有 U 形');
    for (let k = 1; k <= bi; k++) if (SWEEP[k].t >= SWEEP[k - 1].t) { errs.push('最优点左侧时间不单调下降'); break; }
    for (let k = bi + 1; k < SWEEP.length; k++) if (SWEEP[k].t <= SWEEP[k - 1].t) { errs.push('最优点右侧时间不单调上升'); break; }

    // 两段各自单调：上限没咬住时靠推力，咬住后靠速度，形状必须反过来
    const ci = SWEEP.findIndex((s) => s.ceil);
    if (ci < 0) errs.push('整个定义域都没撞上限，模型没起作用');
    else {
      for (let k = 1; k < ci; k++) {
        if (SWEEP[k].t >= SWEEP[k - 1].t) { errs.push('未顶上限区间时间不随 i 下降，断在 ' + SWEEP[k].i.toFixed(2)); break; }
      }
      for (let k = ci + 1; k < SWEEP.length; k++) {
        if (SWEEP[k].t <= SWEEP[k - 1].t) { errs.push('顶上限区间时间不随 i 上升，断在 ' + SWEEP[k].i.toFixed(2)); break; }
      }
    }

    if (!(BAND.lo <= BAND.iBest && BAND.iBest <= BAND.hi)) errs.push('推荐带没有包住最优点');
    if (BAND.vBest < 16.5) errs.push('最优点到头速度偏低：' + BAND.vBest.toFixed(2));

    if (!run(3.0, { traceN: 10 }).hitCeil) errs.push('i=3 没有撞上速度上限，模型没起作用');
    if (run(0.3, { traceN: 10 }).hitCeil) errs.push('i=0.3 不该撞上限');

    if (Math.abs(MEFF * 1000 - 79.88) > 0.05) errs.push('等效惯性质量不对：' + (MEFF * 1000).toFixed(2));

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
  downloadAll: () => exportEpisode(stage, 'gear-ratio-explorer'),
};
