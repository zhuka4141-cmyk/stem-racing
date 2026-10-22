import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import { CHART, frame, line, area, marker } from './plot.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const MONO = CHART.mono;
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
const ACCENT = CHART.accent;
const INK = CHART.ink;
const PAPER = CHART.paper;

/* ───────────────────────── 物理模型 ─────────────────────────
   二十米直线，CO₂ 一次性爆发推力，之后全程滑行。
   参数来源标注：[FIXED] 物理常数 / [TYPICAL] 文献中值 / [VERIFY] 待车队实测 */

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

/** 等效惯性质量：平动质量 + 四个轮子的转动惯量折算 */
export function effMass(p = P) {
  return p.mass + (p.wheels * p.wheelI) / (p.wheelR * p.wheelR);
}

/** 推力曲线：半正弦爆发，烧完即零 */
export function thrust(t, p = P) {
  if (t >= p.tBurn) return 0;
  return p.fPeak * Math.sin((Math.PI * t) / p.tBurn);
}

/** 气动阻力 */
export function dragF(v, p = P) {
  return 0.5 * RHO * p.cd0 * p.area * v * v;
}

/** 滚动阻力（近似恒定，见 README 已知问题） */
export function rollF(p = P) {
  return p.crr * p.mass * G;
}

/** 定步长积分。返回逐帧记录 + 汇总。 */
export function simulate(p = P, dt = 1e-4) {
  const me = effMass(p);
  let t = 0, x = 0, v = 0;
  const rec = { t: [], x: [], v: [], a: [], ft: [], fd: [], fr: [] };
  const fr = rollF(p);
  let peakA = 0, peakAat = 0;
  let dragWork = 0, rollWork = 0, thrustWork = 0;

  for (let i = 0; i < 4000000 && x < DIST; i++) {
    const ft = thrust(t, p);
    const fd = dragF(v, p);
    const a = (ft - fd - fr) / me;

    if (a > peakA) { peakA = a; peakAat = t; }

    if (i % 50 === 0) {
      rec.t.push(t); rec.x.push(x); rec.v.push(v); rec.a.push(a);
      rec.ft.push(ft); rec.fd.push(fd); rec.fr.push(fr);
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

let BASE = simulate(P);

/* ───────────────────────── 画布与状态 ───────────────────────── */

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const state = {
  mass: P.mass,
  cd0: P.cd0,
  fPeak: P.fPeak,
  tBurn: P.tBurn,
  show: { thrust: true, drag: true, roll: true, net: true },
  paused: false,
  tNow: 0,
};

function currentParams() {
  return { ...P, mass: state.mass, cd0: state.cd0, fPeak: state.fPeak, tBurn: state.tBurn };
}

function rerun() {
  BASE = simulate(currentParams());
  if (state.tNow > BASE.tTotal) state.tNow = 0;
}

/* ───────────────────────── 合成 ───────────────────────── */

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

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 17px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ACCEL CURVE LAB', SAFE.x0, 330);

  ctx.fillStyle = PAPER;
  ctx.font = `600 58px ${DISP}`;
  ctx.letterSpacing = '1px';
  ctx.fillText('二十米里，每一牛都去哪儿了', SAFE.x0, 406);

  ctx.fillStyle = 'rgba(242,240,235,0.55)';
  ctx.font = `500 22px ${MONO}`;
  ctx.letterSpacing = '0px';
  ctx.fillText('推力只给 ' + (state.tBurn * 1000).toFixed(0) + ' 毫秒，剩下全程只有阻力在咬', SAFE.x0, 452);

  ctx.fillStyle = 'rgba(242,240,235,0.16)';
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
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 16px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.fillText('受力分解 · F(t)', SAFE.x0, 552);

  const s = frame(ctx, box, { x0: 0, x1: tMax, y0: 0, y1: yMax }, {
    xLabel: '时间 t (s)',
    yLabel: '力 F (N)',
    xTicks: 5,
    yTicks: 5,
    xFmt: (v) => v.toFixed(2),
    yFmt: (v) => v.toFixed(v < 10 ? 1 : 0),
  });

  const pts = (arr) => r.t.map((t, i) => [t, arr[i]]);

  if (state.show.roll) line(ctx, s, pts(r.fr), { color: 'rgba(242,240,235,0.42)', width: 2, dashed: true });
  if (state.show.drag) line(ctx, s, pts(r.fd), { color: 'rgba(232,89,12,0.55)', width: 2 });
  if (state.show.thrust) {
    area(ctx, s, pts(r.ft), { color: 'rgba(232,89,12,0.20)' });
    line(ctx, s, pts(r.ft), { color: ACCENT, width: 3 });
  }
  if (state.show.net) line(ctx, s, pts(r.a), { color: PAPER, width: 2, dashed: true });

  /* 速度曲线叠在右轴。工程图里双纵轴是常规做法，
     既补上「加速曲线」这个名字本该有的东西，也让暗区有视觉密度。 */
  const syV = (v) => box.y + box.h - (v / vTop) * box.h;
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
    ctx.fillStyle = 'rgba(124,168,214,0.10)';
    ctx.fill();

    ctx.beginPath();
    vPts.forEach(([t, v], i) => {
      const px = s.sx(t), py = syV(v);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.strokeStyle = 'rgba(150,190,232,0.9)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 右轴刻度
    ctx.fillStyle = 'rgba(150,190,232,0.62)';
    ctx.font = '500 15px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const vv = (vTop / 4) * k;
      ctx.fillText(vv.toFixed(0), box.x + box.w + 12, syV(vv));
    }
    ctx.save();
    ctx.translate(box.x + box.w + 62, box.y);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(150,190,232,0.5)';
    ctx.fillText('速度 v (m/s)', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  if (state.tNow > 0 && state.tNow <= tMax) {
    marker(ctx, s, state.tNow, { label: `${state.tNow.toFixed(2)}s` });
  }

  const items = [
    ['推力 F_thrust (N)', ACCENT, state.show.thrust],
    ['气动阻力 F_drag (N)', 'rgba(232,89,12,0.55)', state.show.drag],
    ['滚阻 F_roll (N)', 'rgba(242,240,235,0.42)', state.show.roll],
    ['净加速度 a (m/s²)', PAPER, state.show.net],
    ['速度 v (m/s) 右轴', 'rgba(150,190,232,0.9)', true],
    ['', 'transparent', true],
  ];
  ctx.font = `500 16px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  items.forEach(([label, color, on], i) => {
    const lx = SAFE.x0 + (i % 2) * 430;
    const yy = 1112 + Math.floor(i / 2) * 32;
    ctx.globalAlpha = on ? 1 : 0.28;
    ctx.fillStyle = color;
    ctx.fillRect(lx, yy - 2, 18, 4);
    ctx.fillStyle = 'rgba(242,240,235,0.62)';
    ctx.fillText(label, lx + 28, yy);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

function drawMetrics() {
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 1192, SAFE.x1 - SAFE.x0, 1);

  const items = [
    ['完赛用时', BASE.tTotal.toFixed(3), 's', BASE.tTotal >= 1.0 && BASE.tTotal <= 1.25],
    ['末速度', BASE.vExit.toFixed(2), 'm/s', BASE.vExit >= 15 && BASE.vExit <= 22],
    ['阻力耗功', BASE.dragWork.toFixed(2), 'J', true],
  ];

  const colW = (SAFE.x1 - SAFE.x0) / 3;
  items.forEach(([label, val, unit, inBand], i) => {
    const x = SAFE.x0 + i * colW;
    ctx.fillStyle = 'rgba(242,240,235,0.45)';
    ctx.font = `500 15px ${MONO}`;
    ctx.letterSpacing = '1px';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, 1236);

    ctx.fillStyle = inBand ? PAPER : '#ff5a3c';
    ctx.font = `600 46px ${MONO}`;
    ctx.letterSpacing = '0px';
    ctx.fillText(val, x, 1296);

    ctx.fillStyle = 'rgba(242,240,235,0.4)';
    ctx.font = `500 16px ${MONO}`;
    ctx.fillText(unit, x, 1326);

    ctx.fillStyle = inBand ? ACCENT : '#ff5a3c';
    ctx.fillRect(x, 1342, inBand ? 54 : 92, 2);
  });

  const bad = !(BASE.tTotal >= 1.0 && BASE.tTotal <= 1.25);
  if (bad) {
    ctx.fillStyle = '#ff5a3c';
    ctx.font = `500 17px ${MONO}`;
    ctx.letterSpacing = '0px';
    ctx.fillText('结果超出 1.000–1.250 s 合理区间，参数可能不真实', SAFE.x0, 1384);
  } else {
    ctx.fillStyle = 'rgba(242,240,235,0.38)';
    ctx.font = `500 15px ${MONO}`;
    ctx.letterSpacing = '0px';
    ctx.fillText(
      `m ${(state.mass * 1000).toFixed(0)} g   Cd0 ${state.cd0.toFixed(2)}   F_peak ${state.fPeak.toFixed(0)} N   t_burn ${(state.tBurn * 1000).toFixed(0)} ms`,
      SAFE.x0, 1378
    );
    ctx.fillText(`等效惯性质量 ${(BASE.me * 1000).toFixed(1)} g   ·   推进功 ${BASE.thrustWork.toFixed(2)} J`, SAFE.x0, 1406);
  }
  ctx.restore();
}

function drawBrand() {
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 1430, SAFE.x1 - SAFE.x0, 1);

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 15px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('STEM RACING · EP.02', SAFE.x0, 1458);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.3)';
  ctx.letterSpacing = '0px';
  ctx.fillText('ρ[FIXED] Cd0[TYPICAL] m[VERIFY]', SAFE.x1, 1458);
  ctx.restore();
}

/* ───────────────────────── 动画 ───────────────────────── */

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!state.paused) {
    state.tNow += dt * 0.6;
    if (state.tNow > BASE.tTotal) state.tNow = 0;
  }
  compose();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ───────────────────────── 控件 ───────────────────────── */

function bind(id, key, scale = 1, digits = 2) {
  const el = document.getElementById(id);
  if (!el) return;
  const out = document.getElementById(id + 'Out');
  const sync = () => { if (out) out.textContent = (state[key] / scale).toFixed(digits); };
  sync();
  el.addEventListener('input', () => {
    state[key] = parseFloat(el.value) * scale;
    rerun();
    sync();
  });
}

bind('mass', 'mass', 1e-3, 0);
bind('cd0', 'cd0', 1, 2);
bind('fPeak', 'fPeak', 1, 0);
bind('tBurn', 'tBurn', 1e-3, 0);

for (const k of ['thrust', 'drag', 'roll', 'net']) {
  const el = document.getElementById('tog-' + k);
  if (el) el.addEventListener('change', () => { state.show[k] = el.checked; compose(); });
}

const pauseBtn = document.getElementById('pause');
if (pauseBtn) pauseBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '继续' : '暂停';
});

const exportBtn = document.getElementById('export');
if (exportBtn) exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  exportBtn.textContent = '导出中…';
  try {
    compose();
    await new Promise(r => setTimeout(r, 60));
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
    tTotal: BASE.tTotal,
    vExit: BASE.vExit,
    peakA: BASE.peakA,
    effMass: BASE.me,
    dragWork: BASE.dragWork,
    rollWork: BASE.rollWork,
    thrustWork: BASE.thrustWork,
    ok: BASE.ok,
  }),
  set: (k, v) => { state[k] = v; rerun(); compose(); },
  setShow: (k, v) => { state.show[k] = v; compose(); },
  simulate,
  selfTest: () => {
    const errs = [];
    if (thrust(0.001, P) <= 0) errs.push('推力起点非正');
    if (thrust(P.tBurn + 0.01, P) !== 0) errs.push('推力未在烧完后归零');
    if (!(dragF(20, P) > dragF(10, P) * 3.9)) errs.push('阻力不随速度平方增长');
    if (!(effMass(P) > P.mass)) errs.push('等效惯性质量应大于平动质量');
    if (!BASE.ok) errs.push('基线未跑完 20 米');
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
  downloadAll: () => exportEpisode(stage, 'accel-curve-lab'),
};
