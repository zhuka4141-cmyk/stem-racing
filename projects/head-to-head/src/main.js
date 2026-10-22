/* head-to-head · 两车同跑 20 m
 *
 * 全部绘制在 compose() 里。画布就是 1080×1920 的成片，
 * 侧栏只放滑杆，不参与构图。
 */
import { frame, line, area } from './plot.js';
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import {
  CONST, DT, simulate, compare, effMass, impulse,
  xAtT, vAtT, GRID_N,
} from './physics.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const SW = SAFE.x1 - SAFE.x0;

const INK = '#0b0b0c';
const PAPER = '#f2f0eb';
const ACCENT = '#e8590c';
const TRACK = '#1c1c20';
const MUTE = 'rgba(242,240,235,0.55)';
const FAINT = 'rgba(242,240,235,0.34)';
const HAIR = 'rgba(242,240,235,0.16)';

// 中文族必须排在通用族前面，否则 Consolas / Bahnschrift 会静默吞字
const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Bahnschrift","Barlow Condensed","Archivo Narrow",Oswald,"Microsoft YaHei","Noto Sans SC",sans-serif';

const CO = {
  A: { line: ACCENT, fill: 'rgba(232,89,12,0.20)' },
  B: { line: '#b9b4ab', fill: 'rgba(185,180,171,0.15)' },
};

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const state = {
  A: { m: 0.065, Cd0: 0.34, Fpk: 21, tburn: 0.11 },
  B: { m: 0.068, Cd0: 0.35, Fpk: 20.8, tburn: 0.109 },
  displayT: 0,
  running: true,
};

let cmp = compare(state.A, state.B);
let tStart = 0;

const tEnd = () => Math.max(cmp.A.time, cmp.B.time);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const aEq = (r) => r.vEnd * r.vEnd / (2 * CONST.L);

/* ---------------- 绘图基件 ---------------- */

function rule(c, y, color = HAIR) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(SAFE.x0, y + 0.5);
  c.lineTo(SAFE.x1, y + 0.5);
  c.stroke();
}

function label(c, txt, x, y, { size = 15, color = MUTE, align = 'left', weight = 400, font = MONO } = {}) {
  c.font = weight + ' ' + size + 'px ' + font;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillText(txt, x, y);
}

/* ---------------- 顶栏 ---------------- */

function header(c) {
  rule(c, 240);
  label(c, 'HEAD TO HEAD · 20 m 直道', SAFE.x0, 268, { size: 15 });
  label(c, 'RK4 · Δt 1.0 ms · 半正弦推力', SAFE.x1, 268, { size: 15, align: 'right' });

  c.font = '600 46px ' + DISP;
  c.fillStyle = PAPER;
  c.textAlign = 'left';
  c.fillText('两车同跑，谁先到线', SAFE.x0, 324);

  label(c, '推力 F_peak·sin(πt/t_burn) 逐毫秒积分，t_burn 之后严格归零', SAFE.x0, 354, { size: 15 });
  rule(c, 374);
}

/* ---------------- 主读数 ---------------- */

function readout(c) {
  const done = state.displayT >= tEnd() - 1e-9;
  const t = Math.min(state.displayT, tEnd());

  let big, unit, dir;
  if (done) {
    const dMs = cmp.dTime * 1000;
    big = Math.abs(dMs).toFixed(1);
    unit = 'ms';
    dir = dMs < 0
      ? 'B 慢 ' + Math.abs(dMs / cmp.B.time * 100).toFixed(1) + ' %'
      : 'A 慢 ' + Math.abs(dMs / cmp.A.time * 100).toFixed(1) + ' %';
  } else {
    const xa = xAtT(cmp.A, Math.min(t, cmp.A.time));
    const xb = xAtT(cmp.B, Math.min(t, cmp.B.time));
    const lead = xa - xb;
    big = Math.abs(lead).toFixed(2);
    unit = 'm';
    dir = lead >= 0 ? 'A 在前' : 'B 在前';
  }

  label(c, done ? '冲线成绩差' : '实时领先', SAFE.x0, 404, { size: 15 });

  c.font = '500 76px ' + MONO;
  c.fillStyle = ACCENT;
  c.textAlign = 'left';
  c.fillText(big, SAFE.x0 - 3, 478);
  const w = c.measureText(big).width;

  c.font = '400 30px ' + MONO;
  c.fillStyle = MUTE;
  c.fillText(unit, SAFE.x0 + w + 10, 478);

  label(c, dir, SAFE.x0, 512, { size: 17, color: PAPER });

  const va = vAtT(cmp.A, Math.min(t, cmp.A.time));
  const vb = vAtT(cmp.B, Math.min(t, cmp.B.time));
  const rows = [['A 速度', va, CO.A.line], ['B 速度', vb, CO.B.line]];
  rows.forEach(function (r, i) {
    const y = 404 + i * 34;
    label(c, r[0], SAFE.x1 - 200, y, { size: 14, color: FAINT });
    c.textAlign = 'right';
    c.font = '500 19px ' + MONO;
    c.fillStyle = r[2];
    c.fillText(r[1].toFixed(2) + ' m/s', SAFE.x1, y);
  });
  c.textAlign = 'left';
}

/* ---------------- 关键指标条 ---------------- */

function kpi(c) {
  const cells = [
    ['峰值速度', cmp.A.vMax.toFixed(2) + ' / ' + cmp.B.vMax.toFixed(2), 'm/s'],
    ['峰值加速度', (cmp.A.aMax / CONST.g).toFixed(1) + ' / ' + (cmp.B.aMax / CONST.g).toFixed(1), 'g'],
    ['等效平均加速度', aEq(cmp.A).toFixed(2) + ' / ' + aEq(cmp.B).toFixed(2), 'm/s²'],
    ['燃烧距离', xAtT(cmp.A, state.A.tburn).toFixed(2) + ' / ' + xAtT(cmp.B, state.B.tburn).toFixed(2), 'm'],
  ];
  const cw = SW / 4;

  label(c, '关键指标', SAFE.x0, 540, { size: 14, color: FAINT });
  label(c, 'A / B', SAFE.x1, 540, { size: 14, color: FAINT, align: 'right' });

  cells.forEach(function (cell, i) {
    const x = SAFE.x0 + i * cw;
    label(c, cell[0], x, 564, { size: 13, color: FAINT });
    c.textAlign = 'left';
    c.font = '500 21px ' + MONO;
    c.fillStyle = PAPER;
    c.fillText(cell[1], x - 1, 590);
    const w = c.measureText(cell[1]).width;
    c.font = '400 13px ' + MONO;
    c.fillStyle = FAINT;
    c.fillText(cell[2], x + w + 6, 590);
  });
  c.textAlign = 'left';
}

/* ---------------- 赛道 ---------------- */

function lane(c, car, res, y, key, name) {
  const h = 64;
  const px = (m) => SAFE.x0 + SW * (m / CONST.L);

  label(
    c,
    name + '   ' + (car.m * 1000).toFixed(1) + ' g  ·  Cd0 ' + car.Cd0.toFixed(2) +
    '  ·  F_peak ' + car.Fpk.toFixed(1) + ' N  ·  t_burn ' + (car.tburn * 1000).toFixed(0) + ' ms',
    SAFE.x0, y - 12,
    { size: 14, color: FAINT }
  );

  c.fillStyle = TRACK;
  c.fillRect(SAFE.x0, y, SW, h);

  for (let m = 0; m <= CONST.L + 1e-9; m += 2.5) {
    const x = Math.round(px(m)) + 0.5;
    c.strokeStyle = m % 5 === 0 ? 'rgba(242,240,235,0.16)' : 'rgba(242,240,235,0.07)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y + h);
    c.stroke();
  }

  const xt = clamp(xAtT(res, Math.min(state.displayT, res.time)), 0, CONST.L);
  const xEnd = px(xt);
  c.fillStyle = CO[key].fill;
  c.fillRect(SAFE.x0, y, Math.max(0, xEnd - SAFE.x0), h);

  // 赛车：楔形，车头压在当前位置
  const nose = clamp(xEnd, SAFE.x0 + 52, SAFE.x1);
  const cy = y + h / 2;
  c.fillStyle = CO[key].line;
  c.beginPath();
  c.moveTo(nose, cy);
  c.lineTo(nose - 15, cy - 12);
  c.lineTo(nose - 42, cy - 12);
  c.lineTo(nose - 49, cy);
  c.lineTo(nose - 42, cy + 12);
  c.lineTo(nose - 15, cy + 12);
  c.closePath();
  c.fill();

  c.font = '600 13px ' + MONO;
  c.fillStyle = INK;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(key, nose - 30, cy + 1);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
}

function lanes(c) {
  lane(c, state.A, cmp.A, 632, 'A', '车 A');
  lane(c, state.B, cmp.B, 720, 'B', '车 B');

  // 只在下面一条轨道标数字，两条共用同一把尺
  const px = (m) => SAFE.x0 + SW * (m / CONST.L);
  for (let m = 0; m <= CONST.L; m += 5) {
    label(c, String(m), px(m), 808, {
      size: 14, color: FAINT,
      align: m === 0 ? 'left' : m === CONST.L ? 'right' : 'center',
    });
  }
  label(c, '距离 [m]', SAFE.x0 + 300, 808, { size: 14, color: FAINT, align: 'left' });
}

/* ---------------- 冲线成绩 ---------------- */

function stats(c) {
  const dMs = cmp.dTime * 1000;

  const cols = [
    { x: SAFE.x0, name: '车 A 冲线', time: cmp.A.time, v: cmp.A.vEnd, color: CO.A.line },
    { x: SAFE.x0 + 300, name: '车 B 冲线', time: cmp.B.time, v: cmp.B.vEnd, color: CO.B.line },
    { x: SAFE.x1, name: '差值', time: null, v: null, color: ACCENT, right: true },
  ];

  cols.forEach(function (col, i) {
    label(c, col.name, col.x, 848, { size: 15, color: FAINT, align: col.right ? 'right' : 'left' });
    c.textAlign = col.right ? 'right' : 'left';
    if (i < 2) {
      c.font = '500 38px ' + MONO;
      c.fillStyle = col.color;
      c.textAlign = 'left';
      c.fillText(col.time.toFixed(4), col.x - 2, 892);
      const wv = c.measureText(col.time.toFixed(4)).width;
      c.font = '400 19px ' + MONO;
      c.fillStyle = MUTE;
      c.fillText('s', col.x - 2 + wv + 6, 892);
      label(c, col.v.toFixed(2) + ' m/s 末速', col.x, 920, { size: 15, color: MUTE });
    } else {
      const txt = (dMs >= 0 ? '+' : '−') + Math.abs(dMs).toFixed(1);
      c.font = '500 38px ' + MONO;
      c.fillStyle = ACCENT;
      c.textAlign = 'left';
      c.fillText(txt, col.x, 892);
      c.font = '400 19px ' + MONO;
      c.fillStyle = MUTE;
      c.fillText('ms', col.x - c.measureText(txt).width * 2.1 - 6, 892);
      // 先冲线的那台到线瞬间，另一台还在多少米外 —— 直接查轨迹，不做近似
      const lead = cmp.dTime < 0
        ? CONST.L - xAtT(cmp.B, cmp.A.time)
        : CONST.L - xAtT(cmp.A, cmp.B.time);
      label(c, '冲线时相距 ' + lead.toFixed(2) + ' m', col.x, 920, { size: 15, color: MUTE, align: 'right' });
    }
  });
  c.textAlign = 'left';
}

/* ---------------- 速度差曲线 ---------------- */

function chart(c) {
  label(c, '速度差 Δv = v_A − v_B', SAFE.x0, 964, { size: 17, color: PAPER, weight: 500 });

  const neg = cmp.slopeFinish < 0;
  label(
    c,
    '冲线处 dΔv/dx = ' + (neg ? '−' : '+') + Math.abs(cmp.slopeFinish).toFixed(4) + ' (m/s)/m',
    SAFE.x1, 964,
    { size: 15, color: neg ? ACCENT : MUTE, align: 'right' }
  );
  label(
    c,
    neg ? '负斜率 → 领先在收窄' : '正斜率 → 领先在扩大',
    SAFE.x1, 986,
    { size: 14, color: FAINT, align: 'right' }
  );

  const dvMax = Math.max.apply(null, cmp.dv);
  const dvMin = Math.min.apply(null, cmp.dv);
  const box = { x: SAFE.x0 + 56, y: 1004, w: SW - 56 - 8, h: 214 };
  const domain = {
    x0: 0, x1: CONST.L,
    y0: Math.min(0, dvMin * 1.25),
    y1: Math.max(0.2, dvMax * 1.25),
  };

  c.fillStyle = '#141417';
  c.fillRect(box.x, box.y, box.w, box.h);

  const s = frame(c, box, domain, { xTicks: 4, yTicks: 4, xLabel: '距离 x [m]' });

  // y 轴单位做成水平标注，避免旋转文字压到上面的区块
  label(c, 'Δv [m/s]', box.x, box.y - 10, { size: 14, color: FAINT });

  const pts = cmp.xs.map(function (x, i) { return [x, cmp.dv[i]]; });
  area(c, s, pts, { color: 'rgba(232,89,12,0.18)', base: 0 });
  line(c, s, pts, { color: ACCENT, width: 3 });

  const yl = cmp.dv[cmp.dv.length - 1];
  c.fillStyle = ACCENT;
  c.beginPath();
  c.arc(s.sx(CONST.L), s.sy(yl), 6, 0, Math.PI * 2);
  c.fill();

  label(c, '峰值 Δv ' + dvMax.toFixed(2) + ' m/s', box.x + 12, box.y + 26, { size: 14, color: FAINT });
}

/* ---------------- 参数对照 ---------------- */

function params(c) {
  rule(c, 1306);

  const CX = [SAFE.x0, SAFE.x0 + 330, SAFE.x0 + 580, SAFE.x1];
  label(c, '参数', CX[0], 1320, { size: 14, color: FAINT });
  label(c, '车 A', CX[1], 1320, { size: 14, color: CO.A.line, align: 'right' });
  label(c, '车 B', CX[2], 1320, { size: 14, color: CO.B.line, align: 'right' });
  label(c, '差值 B−A', CX[3], 1320, { size: 14, color: FAINT, align: 'right' });

  const rows = [
    ['车体质量 m', state.A.m, state.B.m,
      function (v) { return (v * 1000).toFixed(1) + ' g'; },
      function (d) { return (d * 1000 >= 0 ? '+' : '−') + Math.abs(d * 1000).toFixed(1) + ' g'; }],
    ['阻力系数 Cd0', state.A.Cd0, state.B.Cd0,
      function (v) { return v.toFixed(3); },
      function (d) { return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(3); }],
    ['峰值推力 F_peak', state.A.Fpk, state.B.Fpk,
      function (v) { return v.toFixed(2) + ' N'; },
      function (d) { return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2) + ' N'; }],
    ['燃烧时长 t_burn', state.A.tburn, state.B.tburn,
      function (v) { return (v * 1000).toFixed(1) + ' ms'; },
      function (d) { return (d * 1000 >= 0 ? '+' : '−') + Math.abs(d * 1000).toFixed(1) + ' ms'; }],
  ];

  rows.forEach(function (row, i) {
    const y = 1350 + i * 26;
    label(c, row[0], CX[0], y, { size: 14, color: FAINT });
    c.font = '400 15px ' + MONO;
    c.textAlign = 'right';
    c.fillStyle = CO.A.line;
    c.fillText(row[3](row[1]), CX[1], y);
    c.fillStyle = CO.B.line;
    c.fillText(row[3](row[2]), CX[2], y);
    c.fillStyle = MUTE;
    c.fillText(row[4](row[2] - row[1]), CX[3], y);
    c.textAlign = 'left';
  });

  label(
    c,
    '等效惯性质量 ' + (effMass(state.A.m) * 1000).toFixed(1) + ' / ' + (effMass(state.B.m) * 1000).toFixed(1) +
    ' g   ·   冲量 ' + impulse(state.A).toFixed(3) + ' / ' + impulse(state.B).toFixed(3) + ' N·s',
    SAFE.x0, 1458,
    { size: 14, color: MUTE }
  );
  rule(c, 1472);
}

/* ---------------- 合成 ---------------- */

function compose() {
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = INK;
  c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';

  header(c);
  readout(c);
  kpi(c);
  lanes(c);
  stats(c);
  chart(c);
  params(c);
}

/* ---------------- 动画 ---------------- */

function tick(now) {
  if (state.running) {
    if (!tStart) tStart = now;
    state.displayT = (now - tStart) / 1000;
    if (state.displayT >= tEnd()) {
      state.displayT = tEnd();
      state.running = false;
    }
    compose();
  }
  requestAnimationFrame(tick);
}

function restart() {
  cmp = compare(state.A, state.B);
  state.displayT = 0;
  state.running = true;
  tStart = 0;
  compose();
}

function finish() {
  state.displayT = tEnd();
  state.running = false;
  compose();
}

/* ---------------- 自检 ---------------- */

function selfTest() {
  const errs = [];
  const chk = function (ok, name) { if (!ok) errs.push(name); };

  const rA = simulate(state.A);
  chk([rA.time, rA.vEnd, rA.vMax, rA.closure, rA.aMax].every(Number.isFinite), '出现 NaN / Infinity');

  const me = effMass(0.065);
  chk(Math.abs(me - 0.079876) < 1e-6, '有效惯性质量不是 m + 4I_w/r_w²');
  chk(Math.abs(me - (0.065 + 4 * CONST.Iw / (CONST.rw * CONST.rw))) < 1e-12, '有效质量公式与常数不符');

  chk(Math.abs(impulse({ Fpk: 21, tburn: 0.11 }) - 2 * 21 * 0.11 / Math.PI) < 1e-12, '半正弦冲量解析式错误');

  const base = simulate({ m: 0.065, Cd0: 0.34, Fpk: 21, tburn: 0.11 });
  chk(Math.abs(base.time - 1.1885) < 2e-3, '基准成绩偏离 1.1885 s：' + base.time.toFixed(4));
  chk(Math.abs(base.vEnd - 16.91) < 0.02, '基准末速偏离 16.91 m/s：' + base.vEnd.toFixed(3));
  chk(Math.abs(base.aMax / CONST.g - 26.8) < 0.3, '基准峰值加速度偏离 26.8 g：' + (base.aMax / CONST.g).toFixed(2));

  chk(Math.abs(rA.time - simulate(state.A, DT / 2).time) < 1e-3, '步长减半成绩未收敛');

  const same = compare(state.A, { ...state.A });
  chk(same.dTime === 0, '同参数两车成绩不相等');
  chk(same.dv.every(function (v) { return v === 0; }), '同参数两车速度差不为 0');

  chk(simulate({ ...state.A, m: state.A.m * 1.2 }).time > rA.time, '质量变大成绩没有变差');
  chk(simulate({ ...state.A, Fpk: state.A.Fpk * 1.1 }).time < rA.time, '推力变大成绩没有变好');

  const ctl = compare({ ...state.A, m: 0.065 }, { ...state.A, m: 0.075 });
  chk(ctl.dTime < 0, '轻车没有比重车快');
  chk(ctl.slopeFinish < 0, '速度差曲线冲线处斜率不是负的：' + ctl.slopeFinish.toFixed(5));

  chk(Math.abs(rA.closure) / rA.work.thrust < 1e-4, '能量收支残差过大：' + Math.abs(rA.closure / rA.work.thrust).toExponential(2));

  chk(rA.time > state.A.tburn, '成绩短于燃烧时长');
  chk(rA.vMax > vAtT(rA, state.A.tburn) - 1e-6, '峰值速度低于燃烧末速度');

  chk(simulate(state.A).time === rA.time, '同参数两次积分结果不一致');

  return { ok: errs.length === 0, errs };
}

/* ---------------- 对外钩子 ---------------- */

window.__app = {
  canvas: stage,
  selfTest,
  getState: function () {
    return { A: { ...state.A }, B: { ...state.B }, displayT: state.displayT, running: state.running };
  },
  getMetrics: function () {
    return {
      tA: cmp.A.time, tB: cmp.B.time,
      vA: cmp.A.vEnd, vB: cmp.B.vEnd,
      dTimeMs: cmp.dTime * 1000,
      slopeFinish: cmp.slopeFinish,
      dvMax: Math.max.apply(null, cmp.dv),
      gapM: cmp.dTime < 0
        ? CONST.L - xAtT(cmp.B, cmp.A.time)
        : CONST.L - xAtT(cmp.A, cmp.B.time),
      meffA: effMass(state.A.m), meffB: effMass(state.B.m),
      gridN: GRID_N,
      finished: state.displayT >= tEnd() - 1e-9,
    };
  },
  set: function (path, value) {
    const parts = String(path).split('.');
    if (parts.length === 2 && (parts[0] === 'A' || parts[0] === 'B')) {
      state[parts[0]][parts[1]] = Number(value);
    } else if (path === 'displayT') {
      state.displayT = Number(value);
      state.running = false;
      compose();
      return;
    } else {
      throw new Error('未知参数 ' + path);
    }
    restart();
  },
  setCar: function (key, obj) {
    Object.assign(state[key], obj);
    restart();
  },
  restart,
  finish,
  compose,
  exportPNG: async function () { finish(); const b = await toPNG(stage, { width: 1080, height: 1920 }); await assertPNG(b); return b.size; },
  exportCover: async function () { finish(); const b = await toPNG(stage, { width: 1080, height: 1350 }); await assertPNG(b); return b.size; },
  downloadAll: function () { finish(); return exportEpisode(stage, 'head-to-head'); },
};

/* ---------------- 侧栏 ---------------- */

const FIELDS = [
  ['a-m', 'A', 'm', 0.001, function (v) { return v.toFixed(1) + ' g'; }],
  ['a-cd', 'A', 'Cd0', 1, function (v) { return v.toFixed(3); }],
  ['a-f', 'A', 'Fpk', 1, function (v) { return v.toFixed(1) + ' N'; }],
  ['a-t', 'A', 'tburn', 0.001, function (v) { return (v * 1000).toFixed(0) + ' ms'; }],
  ['b-m', 'B', 'm', 0.001, function (v) { return v.toFixed(1) + ' g'; }],
  ['b-cd', 'B', 'Cd0', 1, function (v) { return v.toFixed(3); }],
  ['b-f', 'B', 'Fpk', 1, function (v) { return v.toFixed(1) + ' N'; }],
  ['b-t', 'B', 'tburn', 0.001, function (v) { return (v * 1000).toFixed(0) + ' ms'; }],
];

FIELDS.forEach(function (f) {
  const el = document.getElementById(f[0]);
  const out = document.getElementById('o-' + f[0]);
  if (!el) return;
  const paint = function () {
    const v = Number(el.value) * f[3];
    state[f[1]][f[2]] = v;
    if (out) out.textContent = f[4](v);
  };
  el.addEventListener('input', function () { paint(); restart(); });
  paint();
});

const bx = document.getElementById('export');
if (bx) bx.addEventListener('click', function () { window.__app.downloadAll(); });
const br = document.getElementById('restart');
if (br) br.addEventListener('click', restart);

compose();
requestAnimationFrame(tick);
