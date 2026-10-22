import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import { CHART } from './plot.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const MONO = CHART.mono;
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
const ACCENT = CHART.accent;
const INK = CHART.ink;
const PAPER = CHART.paper;

const F_PEAK = 21;          // [VERIFY] 推力峰值 N，和 accel-curve-lab 同一组参数
const TRACK = 42;           // [VERIFY] 轮距 mm
const LIMIT = 1.32;         // [VERIFY] 临界横向重心偏移 mm，车队实测值

/* ───────────────── 部件表 ─────────────────
   y 是横向偏移（+ 向右），z 是离地高度，单位都是 mm。
   没有一项是称过的，所以全部 [TYPICAL] 或 [VERIFY]。 */
export const COMP = [
  { key: 'body', name: '车体', mass: 18.0, y: 0.15, z: 10.0, tag: '[TYPICAL]' },
  { key: 'wheels', name: '车轮 ×4', mass: 9.5, y: 0.00, z: 11.0, tag: '[TYPICAL]' },
  { key: 'axle', name: '轮轴 ×2', mass: 4.2, y: 0.00, z: 11.0, tag: '[TYPICAL]' },
  { key: 'mech', name: '机构', mass: 19.3, y: -0.40, z: 14.0, tag: '[VERIFY]' },
];
const BALLAST_INDEX = 3;
export const BAL = { mass: 14.0, y: 4.0, z: 8.0 };

const state = { mass: BAL.mass, y: BAL.y, z: BAL.z };

export function parts(s = state) {
  const list = COMP.map((c) => ({ ...c }));
  list.splice(BALLAST_INDEX, 0, {
    key: 'ballast', name: '配重', mass: s.mass, y: s.y, z: s.z,
    tag: '[VERIFY]', movable: true,
  });
  return list;
}

/** 质量、横向重心、重心高度、占比、左右轮法向力 */
export function budget(s = state) {
  const list = parts(s);
  const total = list.reduce((a, c) => a + c.mass, 0);
  const ycg = list.reduce((a, c) => a + c.mass * c.y, 0) / total;
  const zcg = list.reduce((a, c) => a + c.mass * c.z, 0) / total;
  const shares = list.map((c) => (c.mass / total) * 100);
  const contrib = list.map((c) => (c.mass * c.y) / total);
  const nL = 0.5 + ycg / TRACK;
  const nR = 0.5 - ycg / TRACK;
  return {
    list, total, ycg, zcg, shares, contrib, nL, nR,
    dNpct: Math.abs(nL - nR) * 100,
    yaw: F_PEAK * ycg,                       // 推力峰值时的偏航力矩 mN·m
    over: Math.abs(ycg) > LIMIT,
    margin: LIMIT - Math.abs(ycg),
    limit: LIMIT, track: TRACK, fPeak: F_PEAK,
  };
}

let B = budget();

/* ───────────────── 版面 ───────────────── */

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const BAR = { x0: 320, w: 430, y: 534, h: 288, gap: 22 };
const BAR_MAX = 34;
const PIE = { cx: 246, cy: 976, r: 104 };
const GAUGE = { cy: 1196, span: 34, half: 12 };
const VERDICT = { y: 1356, h: 80 };

const SLICE = [
  'rgba(242,240,235,0.92)',
  'rgba(242,240,235,0.70)',
  'rgba(242,240,235,0.50)',
  'rgba(242,240,235,0.30)',
  'rgba(242,240,235,0.16)',
];

/* ───────────────── 合成 ───────────────── */

function compose() {
  B = budget();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  drawHeader();
  drawBars();
  drawPie();
  drawLedger();
  drawGauge();
  drawLoadSplit();
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
  ctx.fillText('MASS BUDGET · CHASSIS 02', SAFE.x0, 330);

  ctx.fillStyle = PAPER;
  ctx.font = `600 56px ${DISP}`;
  ctx.letterSpacing = '1px';
  ctx.fillText('这 ' + B.total.toFixed(1) + ' 克都在哪儿', SAFE.x0, 402);

  ctx.fillStyle = 'rgba(242,240,235,0.55)';
  ctx.font = `500 20px ${MONO}`;
  ctx.letterSpacing = '0px';
  ctx.fillText('挪一块配重，重心和左右轮载荷立刻跟着动', SAFE.x0, 448);

  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, 486, SAFE.x1 - SAFE.x0, 1);
  ctx.restore();
}

function sectionLabel(y, left, right) {
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

function drawBars() {
  sectionLabel(518, '部件质量', '合计 ' + B.total.toFixed(1) + ' g');

  const rowH = (BAR.h - BAR.gap * (B.list.length - 1)) / B.list.length;
  B.list.forEach((c, i) => {
    const y = BAR.y + i * (rowH + BAR.gap);
    const mid = y + rowH / 2;
    const isBallast = c.key === 'ballast';

    ctx.save();
    ctx.font = `500 17px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = isBallast ? PAPER : CHART.label;
    ctx.fillText(c.name, BAR.x0 - 16, mid);

    ctx.fillStyle = 'rgba(242,240,235,0.055)';
    ctx.fillRect(BAR.x0, y, BAR.w, rowH);
    const w = Math.max(2, (c.mass / BAR_MAX) * BAR.w);
    ctx.fillStyle = isBallast ? ACCENT : 'rgba(242,240,235,0.34)';
    ctx.fillRect(BAR.x0, y, w, rowH);

    // 每 5 g 一根压暗刻度，条长可以直接数
    ctx.fillStyle = 'rgba(11,11,12,0.45)';
    for (let g = 5; g <= BAR_MAX; g += 5) {
      const gx = BAR.x0 + (g / BAR_MAX) * BAR.w;
      if (gx < BAR.x0 + w) ctx.fillRect(gx, y, 1, rowH);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = PAPER;
    ctx.font = `500 18px ${MONO}`;
    ctx.fillText(c.mass.toFixed(1) + ' g', BAR.x0 + BAR.w + 16, mid);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(242,240,235,0.45)';
    ctx.font = `500 16px ${MONO}`;
    ctx.fillText(B.shares[i].toFixed(1) + '%', SAFE.x1, mid);
    ctx.restore();
  });
}

function drawPie() {
  sectionLabel(848, '质量占比', '合计 ' + B.shares.reduce((a, b) => a + b, 0).toFixed(1) + '%');

  let a0 = -Math.PI / 2;
  B.shares.forEach((pct, i) => {
    const a1 = a0 + (pct / 100) * Math.PI * 2;
    const isBallast = B.list[i].key === 'ballast';
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(PIE.cx, PIE.cy);
    ctx.arc(PIE.cx, PIE.cy, PIE.r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = isBallast ? ACCENT : SLICE[i % SLICE.length];
    ctx.fill();
    ctx.restore();
    a0 = a1;
  });

  // 硬边分隔线，不用描边光晕
  a0 = -Math.PI / 2;
  B.shares.forEach((pct) => {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PIE.cx, PIE.cy);
    ctx.lineTo(PIE.cx + Math.cos(a0) * PIE.r, PIE.cy + Math.sin(a0) * PIE.r);
    ctx.stroke();
    ctx.restore();
    a0 += (pct / 100) * Math.PI * 2;
  });

  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(PIE.cx, PIE.cy, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.font = `600 40px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(B.total.toFixed(0), PIE.cx, PIE.cy - 8);
  ctx.fillStyle = 'rgba(242,240,235,0.42)';
  ctx.font = `500 14px ${MONO}`;
  ctx.fillText('克 · 总计', PIE.cx, PIE.cy + 24);
  ctx.restore();

  const lx = 404, ly0 = 916, dy = 34;
  B.list.forEach((c, i) => {
    const y = ly0 + i * dy;
    const isBallast = c.key === 'ballast';
    ctx.save();
    ctx.fillStyle = isBallast ? ACCENT : SLICE[i % SLICE.length];
    ctx.fillRect(lx, y - 6, 18, 12);
    ctx.font = `500 16px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = isBallast ? PAPER : CHART.label;
    ctx.fillText(c.name, lx + 30, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = PAPER;
    ctx.fillText(c.mass.toFixed(1) + ' g', lx + 330, y);
    ctx.fillStyle = 'rgba(242,240,235,0.45)';
    ctx.fillText(B.shares[i].toFixed(1) + '%', SAFE.x1, y);
    ctx.restore();
  });
}

/** 饼图和横向量表之间的空档，用一行账目摘要填掉 */
function drawLedger() {
  const y = 1108;
  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.16)';
  ctx.fillRect(SAFE.x0, y - 22, SAFE.x1 - SAFE.x0, 1);

  ctx.font = `500 14px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242,240,235,0.38)';
  ctx.letterSpacing = '2px';
  ctx.fillText('账目合计', SAFE.x0, y);

  ctx.letterSpacing = '0px';
  ctx.font = `600 17px ${MONO}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(B.total.toFixed(1) + ' g', SAFE.x0 + 108, y);

  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = 'rgba(242,240,235,0.38)';
  ctx.fillText('y_cg', SAFE.x0 + 232, y);
  ctx.font = `600 17px ${MONO}`;
  ctx.fillStyle = B.over ? ACCENT : PAPER;
  ctx.fillText((B.ycg >= 0 ? '+' : '') + B.ycg.toFixed(2) + ' mm', SAFE.x0 + 296, y);

  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = 'rgba(242,240,235,0.38)';
  ctx.fillText('z_cg', SAFE.x0 + 500, y);
  ctx.font = `600 17px ${MONO}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(B.zcg.toFixed(2) + ' mm', SAFE.x0 + 560, y);

  ctx.font = `500 14px ${MONO}`;
  ctx.fillStyle = 'rgba(242,240,235,0.38)';
  ctx.textAlign = 'right';
  ctx.fillText('5 件 · 轮距 42 mm', SAFE.x1, y);
  ctx.restore();
}

function drawGauge() {
  const over = B.over;
  sectionLabel(1128, '横向重心 y_cg → 偏航力矩', '临界 ±' + LIMIT.toFixed(2) + ' mm');

  const cx = SAFE.x0 + (SAFE.x1 - SAFE.x0) / 2;
  const X = (mm) => cx + mm * GAUGE.span;
  const bandTop = GAUGE.cy - 42, bandH = 84;

  ctx.save();
  ctx.fillStyle = 'rgba(242,240,235,0.045)';
  ctx.fillRect(X(-GAUGE.half), bandTop, X(GAUGE.half) - X(-GAUGE.half), bandH);

  ctx.fillStyle = 'rgba(232,89,12,0.10)';
  ctx.fillRect(X(-LIMIT), bandTop, X(LIMIT) - X(-LIMIT), bandH);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(Math.round(X(-LIMIT)) + 0.5, bandTop);
  ctx.lineTo(Math.round(X(-LIMIT)) + 0.5, bandTop + bandH);
  ctx.moveTo(Math.round(X(LIMIT)) + 0.5, bandTop);
  ctx.lineTo(Math.round(X(LIMIT)) + 0.5, bandTop + bandH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(242,240,235,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(X(0)) + 0.5, bandTop - 8);
  ctx.lineTo(Math.round(X(0)) + 0.5, bandTop + bandH + 8);
  ctx.stroke();

  ctx.font = `500 14px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let mm = -12; mm <= 12; mm += 4) {
    const tx = X(mm);
    if (tx < SAFE.x0 + 12 || tx > SAFE.x1 - 12) continue;
    ctx.fillStyle = CHART.label;
    ctx.fillText(mm > 0 ? '+' + mm : String(mm), tx, bandTop + bandH + 12);
    ctx.fillStyle = CHART.axis;
    ctx.fillRect(Math.round(tx), bandTop + bandH, 1, 6);
  }
  ctx.restore();

  ctx.save();
  const px = X(B.ycg);
  ctx.fillStyle = over ? ACCENT : PAPER;
  ctx.fillRect(px - 7, bandTop - 12, 14, bandH + 24);
  ctx.fillStyle = INK;
  ctx.fillRect(px - 2, bandTop - 12, 4, bandH + 24);
  ctx.restore();

  // 每个部件对 y_cg 的贡献，加起来就是 y_cg
  ctx.save();
  ctx.font = `500 14px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let tx = SAFE.x0;
  B.list.forEach((c, i) => {
    const v = B.contrib[i];
    const s = c.name + ' ' + (v > 0 ? '+' : '') + v.toFixed(2);
    ctx.fillStyle = c.key === 'ballast' ? PAPER : 'rgba(242,240,235,0.45)';
    ctx.fillText(s, tx, 1252);
    tx += ctx.measureText(s).width + 18;
  });
  ctx.restore();
}

function drawLoadSplit() {
  sectionLabel(1278, '左右轮法向力', '载荷差 ' + B.dNpct.toFixed(1) + '%');

  const rows = [['左轮 N_L', B.nL], ['右轮 N_R', B.nR]];
  const bx = SAFE.x0 + 150, bw = 470;
  rows.forEach(([label, f], i) => {
    const y = 1306 + i * 26;
    ctx.save();
    ctx.font = `500 15px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(242,240,235,0.55)';
    ctx.fillText(label, SAFE.x0, y);
    ctx.fillStyle = 'rgba(242,240,235,0.055)';
    ctx.fillRect(bx, y - 8, bw, 16);
    ctx.fillStyle = 'rgba(242,240,235,0.42)';
    ctx.fillRect(bx, y - 8, bw * f, 16);
    ctx.fillStyle = 'rgba(242,240,235,0.5)';
    ctx.fillRect(bx + bw / 2, y - 12, 1, 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = PAPER;
    ctx.font = `500 16px ${MONO}`;
    ctx.fillText((f * 100).toFixed(2) + '%', SAFE.x1, y);
    ctx.restore();
  });
}

function drawVerdict() {
  const over = B.over;
  const { y, h } = VERDICT;

  ctx.save();
  if (over) {
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, h);
  } else {
    ctx.strokeStyle = 'rgba(232,89,12,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(SAFE.x0 + 0.5, y + 0.5, SAFE.x1 - SAFE.x0 - 1, h - 1);
  }

  ctx.fillStyle = over ? INK : PAPER;
  ctx.font = `500 13px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(over ? '越界' : '判定', SAFE.x0 + 22, y + 28);

  ctx.letterSpacing = '0px';
  ctx.font = `600 34px ${MONO}`;
  ctx.fillText(
    over
      ? '超限 ' + (Math.abs(B.ycg) - LIMIT).toFixed(2) + ' mm'
      : '在 ' + LIMIT.toFixed(2) + ' mm 以内 · 余量 ' + B.margin.toFixed(2) + ' mm',
    SAFE.x0 + 22, y + 64
  );

  ctx.textAlign = 'right';
  ctx.font = `500 15px ${MONO}`;
  ctx.fillStyle = over ? 'rgba(11,11,12,0.75)' : 'rgba(242,240,235,0.5)';
  ctx.fillText('y_cg ' + (B.ycg >= 0 ? '+' : '') + B.ycg.toFixed(2) + ' mm', SAFE.x1 - 22, y + 28);
  ctx.fillText('力矩 ' + B.yaw.toFixed(1) + ' mN·m', SAFE.x1 - 22, y + 56);
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
  ctx.fillText('STEM RACING · EP.04', SAFE.x0, 1496);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.3)';
  ctx.letterSpacing = '0px';
  ctx.fillText('m y z 全部 [TYPICAL] / [VERIFY] · 还没逐件称过', SAFE.x1, 1496);
  ctx.restore();
}

/* ───────────────── 交互 ───────────────── */

function sync() {
  B = budget();
  const el = (id) => document.getElementById(id);
  if (el('massOut')) el('massOut').textContent = state.mass.toFixed(0);
  if (el('yOut')) el('yOut').textContent = (state.y >= 0 ? '+' : '') + state.y.toFixed(1);
  if (el('zOut')) el('zOut').textContent = state.z.toFixed(0);
  compose();
}

function pushSliders() {
  for (const [id, k] of [['balMass', 'mass'], ['balY', 'y'], ['balZ', 'z']]) {
    const el = document.getElementById(id);
    if (el) el.value = String(state[k]);
  }
}

function bindSlider(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(state[key]);
  el.addEventListener('input', () => {
    state[key] = parseFloat(el.value);
    sync();
  });
}
bindSlider('balMass', 'mass');
bindSlider('balY', 'y');
bindSlider('balZ', 'z');
sync();

/** 扫一遍配重横移，返回 y_cg 轨迹（selfTest 和 gate 都用） */
function sweepY(from, to, n = 41) {
  const out = [];
  const keep = state.y;
  for (let i = 0; i < n; i++) {
    const y = from + ((to - from) * i) / (n - 1);
    const b = budget({ ...state, y });
    out.push({ y, ycg: b.ycg, over: b.over });
  }
  state.y = keep;
  return out;
}

const resetBtn = document.getElementById('reset');
if (resetBtn) resetBtn.addEventListener('click', () => {
  state.mass = BAL.mass; state.y = BAL.y; state.z = BAL.z;
  pushSliders();
  sync();
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

/* ───────────────── 测试钩子 ───────────────── */

const threshold = (v) => Math.abs(v) > LIMIT;

window.__app = {
  canvas: stage,
  params: { F_PEAK, TRACK, LIMIT, COMP, BAL },
  budget: () => budget(),
  getMetrics: () => ({
    total: B.total,
    ycg: B.ycg,
    zcg: B.zcg,
    yaw: B.yaw,
    margin: B.margin,
    over: B.over,
    limit: B.limit,
    dNpct: B.dNpct,
    nL: B.nL,
    nR: B.nR,
    shares: B.shares.slice(),
    contrib: B.contrib.slice(),
    masses: B.list.map((c) => c.mass),
    names: B.list.map((c) => c.name),
  }),
  setBallast: (p) => {
    if (p.mass !== undefined) state.mass = p.mass;
    if (p.y !== undefined) state.y = p.y;
    if (p.z !== undefined) state.z = p.z;
    pushSliders();
    sync();
    return { ycg: B.ycg, over: B.over, yaw: B.yaw, margin: B.margin };
  },
  reset: () => {
    state.mass = BAL.mass; state.y = BAL.y; state.z = BAL.z;
    pushSliders();
    sync();
    return { ycg: B.ycg };
  },
  sweepY,
  selfTest: () => {
    const errs = [];
    const b = budget();

    const sum = b.shares.reduce((a, c) => a + c, 0);
    if (Math.abs(sum - 100) > 1e-6) errs.push('占比合计 ' + sum.toFixed(6) + '%，不是 100%');

    const msum = b.list.reduce((a, c) => a + c.mass, 0);
    if (Math.abs(msum - b.total) > 1e-9) errs.push('总质量与分项之和不一致');

    const recompute = b.list.reduce((a, c) => a + c.mass * c.y, 0) / msum;
    if (Math.abs(recompute - b.ycg) > 1e-9) errs.push('y_cg 与加权平均不符');

    const csum = b.contrib.reduce((a, c) => a + c, 0);
    if (Math.abs(csum - b.ycg) > 1e-9) errs.push('贡献分解之和与 y_cg 不符');

    if (Math.abs(b.nL + b.nR - 1) > 1e-12) errs.push('左右轮载荷不守恒');

    if (threshold(1.32)) errs.push('恰好 1.32 mm 不该报警');
    if (!threshold(1.33)) errs.push('1.33 mm 必须报警');
    if (!threshold(-1.5)) errs.push('负向越界也必须报警');

    const sw = sweepY(-8, 8, 33);
    for (let i = 1; i < sw.length; i++) {
      if (sw[i].ycg <= sw[i - 1].ycg) { errs.push('y_cg 不随配重横移单调变化'); break; }
    }
    const overCount = sw.filter((s) => s.over).length;
    const shouldOver = sw.filter((s) => Math.abs(s.ycg) > LIMIT).length;
    if (overCount !== shouldOver) errs.push('报警数量和实际越界数量对不上');

    if (b.zcg < 2 || b.zcg > 16) errs.push('z_cg 超出部件高度区间：' + b.zcg.toFixed(3));

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
  downloadAll: () => exportEpisode(stage, 'mass-budget'),
};

compose();
