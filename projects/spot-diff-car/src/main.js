/* 找不同 —— 两台车的侧视图，六处工程参数差异。
   每处差异都是 car.js 真正读取的参数，点中之后给出两台车的数值和这个差值
   带来的物理后果。没有一处是「这里涂个色」制造出来的。 */

import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import {
  F_PEAK, dragForce, effectiveMass, simulate,
  AOA_CD_PER_DEG, WING_CD_PER_DEG, CD0, A0,
} from './physics.js';
import { drawCar, tracked, FONT_MONO, FONT_DISP } from './car.js';

const W = 1080, H = 1920;
const M = 56;
const R = W - M;

const PAL = {
  ink: '#0B0B0C',
  panel: '#111114',
  panelEdge: 'rgba(242,240,235,0.16)',
  line: 'rgba(242,240,235,0.20)',
  lineFaint: 'rgba(242,240,235,0.09)',
  lineStrong: 'rgba(242,240,235,0.34)',
  paper: '#F2F0EB',
  paperDim: '#B9B6AF',
  body: '#E8E5DE',
  hatch: 'rgba(11,11,12,0.085)',
  edge: '#0B0B0C',
  ballast: '#E8590C',
  wing: '#D6D2C9',
  wheel: '#1D1D20',
  accent: '#E8590C',
  accentLit: '#FF6B1A',
  good: '#16D97F',
  inkOnPaper: '#0B0B0C',
  muteOnPaper: '#4A4A50',
};

/* ---- the two parameter sets ------------------------------------------------ */
/* Only these six keys differ. Everything else is shared, so both drawings come
   out of one code path and cannot drift apart. */
const A = { aoa: 4.0, wheelDia: 30.0, ballastX: 152, wingDeg: 0, rideHeight: 4.0, noseLen: 34 };
const B = { aoa: 2.0, wheelDia: 26.0, ballastX: 118, wingDeg: 8, rideHeight: 7.5, noseLen: 28 };

const BODY_MASS0 = 0.02012;   // kg, shell at the reference nose length
const CLASS_MASS = 0.065;     // kg 组别限重，配重补到这条线
const WHEEL_M = 0.00372;      // kg per wheel at the reference diameter
const AXLE_F = 0.030, AXLE_R = 0.170, WHEELBASE = AXLE_R - AXLE_F;

function wheelsFor(diaMm) {
  const m = WHEEL_M * Math.pow(diaMm / 30, 2);
  return [0, 1, 2, 3].map(() => ({ mass: m, dia: diaMm }));
}

function areaFor(rideHeight, noseLen) {
  return A0 * (1 + 0.010 * (rideHeight - 4)) * (1 + 0.012 * (34 - noseLen));
}

function metrics(p) {
  const cd = CD0 + AOA_CD_PER_DEG * Math.abs(p.aoa) + WING_CD_PER_DEG * Math.abs(p.wingDeg);
  const area = areaFor(p.rideHeight, p.noseLen);
  const bodyM = BODY_MASS0 + (p.noseLen - 34) * 0.00015;

  const wheels = wheelsFor(p.wheelDia);
  const wheelTotal = wheels.reduce((s, w) => s + w.mass, 0);
  /* 组别限重 65 g。轮子轻就多塞配重补回来，总质量不动，两台车才在同一个
     重量级里比，剩下的差异只剩气动和转动惯量。 */
  const totalMass = CLASS_MASS;
  const ballast = Math.max(0, CLASS_MASS - bodyM - wheelTotal);
  const em = effectiveMass(totalMass, wheels);

  const comX = (bodyM * 0.100 + ballast * (p.ballastX / 1000)
    + (wheelTotal / 2) * AXLE_F + (wheelTotal / 2) * AXLE_R) / totalMass;
  const frontShare = (WHEELBASE - (comX - AXLE_F)) / WHEELBASE;

  const sim = simulate({ mEq: em.total, mBody: totalMass, cd, area });
  return {
    cd, area, bodyM, ballast, totalMass, mEq: em.total, rot: em.rot,
    comX, frontShare, time: sim.time, speed: sim.speed,
    dragEnd: dragForce(sim.speed, cd, area),
  };
}

const MA = metrics(A);
const MB = metrics(B);

const pct = (x, y) => ((x - y) / y) * 100;
const f3 = (v) => v.toFixed(3);
const DT = MB.time - MA.time;

/* ---- difference definitions ------------------------------------------------ */
const DIFFS = [
  {
    id: 'aoa', zh: '迎角', en: 'ANGLE OF ATTACK', unit: '°',
    a: A.aoa, b: B.aoa,
    why: () => {
      const cA = CD0 + AOA_CD_PER_DEG * A.aoa + WING_CD_PER_DEG * B.wingDeg;
      const cB = CD0 + AOA_CD_PER_DEG * B.aoa + WING_CD_PER_DEG * B.wingDeg;
      const dA = dragForce(MB.speed, cA, MA.area), dB = dragForce(MB.speed, cB, MA.area);
      return `Cd ${f3(cA)} → ${f3(cB)}。16.9 m/s 时气动阻力 ${f3(dA)} N → ${f3(dB)} N，差 ${Math.abs(pct(dB, dA)).toFixed(1)}%`;
    },
  },
  {
    id: 'wheelDia', zh: '轮径', en: 'WHEEL DIAMETER', unit: ' mm',
    a: A.wheelDia, b: B.wheelDia,
    why: () => `轮子要跟着转，等效惯性质量里多了 ${(MA.rot * 1000).toFixed(1)} g → ${(MB.rot * 1000).toFixed(1)} g。小轮起步少吃转动惯量的亏，但同样的轮重压在更小的接地面上，比压升高`,
  },
  {
    id: 'ballastX', zh: '配重位置', en: 'BALLAST STATION', unit: ' mm',
    a: A.ballastX, b: B.ballastX,
    why: () => `配重往后挪 ${A.ballastX - B.ballastX} mm，质心在 200 mm 车身上后移 ${((MA.comX - MB.comX) * 1000).toFixed(1)} mm。前轴荷 ${(MA.frontShare * 100).toFixed(1)}% → ${(MB.frontShare * 100).toFixed(1)}%，压不住头就更容易蹭导轨`,
  },
  {
    id: 'wingDeg', zh: '尾翼角度', en: 'REAR WING ANGLE', unit: '°',
    a: A.wingDeg, b: B.wingDeg,
    why: () => {
      const cA = CD0 + AOA_CD_PER_DEG * A.aoa + WING_CD_PER_DEG * A.wingDeg;
      const cB = CD0 + AOA_CD_PER_DEG * B.aoa + WING_CD_PER_DEG * B.wingDeg;
      const dA = dragForce(MB.speed, cA, MA.area), dB = dragForce(MB.speed, cB, MA.area);
      return `尾翼从 ${A.wingDeg}° 掀到 ${B.wingDeg}°，Cd 多 ${f3(cB - cA)}，阻力 ${f3(dA)} N → ${f3(dB)} N，高出 ${Math.abs(pct(dB, dA)).toFixed(0)}%`;
    },
  },
  {
    id: 'rideHeight', zh: '离地间隙', en: 'RIDE HEIGHT', unit: ' mm',
    a: A.rideHeight, b: B.rideHeight,
    why: () => `车抬高 ${(B.rideHeight - A.rideHeight).toFixed(1)} mm，迎风面积 ${(areaFor(A.rideHeight, A.noseLen) * 1e4).toFixed(2)} → ${(areaFor(B.rideHeight, A.noseLen) * 1e4).toFixed(2)} ×10⁻⁴ m²。这一项纯亏，没有任何补偿`,
  },
  {
    id: 'noseLen', zh: '鼻锥长度', en: 'NOSE LENGTH', unit: ' mm',
    a: A.noseLen, b: B.noseLen,
    why: () => `鼻锥短 ${(A.noseLen - B.noseLen).toFixed(0)} mm，收不尖，迎风面积 ${(areaFor(A.rideHeight, A.noseLen) * 1e4).toFixed(2)} → ${(areaFor(A.rideHeight, B.noseLen) * 1e4).toFixed(2)} ×10⁻⁴ m²。车体轻了 ${((MA.bodyM - MB.bodyM) * 1000).toFixed(1)} g，抵不过多出来的面积`,
  },
];

const FOUND = new Set();
let lastFound = null;
let misses = 0;
let missAt = null;

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

/* ---- layout ---------------------------------------------------------------- */
const PANEL_A = { x: M, y: 168, w: R - M, h: 302 };
const PANEL_B = { x: M, y: 486, w: R - M, h: 302 };
const REVEAL = { x: M, y: 806, w: R - M, h: 322 };
const LIST = { x: M, y: 1170, w: R - M, h: 432 };
const BAND = { y: 1626, h: 294 };

const SCALE = 3.85;
let hotspots = [];

function carOrigin(panel) {
  const drawn = 236 * SCALE;
  return { ox: panel.x + (panel.w - drawn) / 2 + 10 * SCALE, oy: panel.y + 226 };
}

function T(str, x, y, size, weight, font, color, spacing = 0, align = 'left') {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillStyle = color;
  return tracked(ctx, str, x, y, spacing, align);
}

function hair(y, x0 = M, x1 = R, c = PAL.panelEdge) {
  ctx.strokeStyle = c;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.5, y + 0.5);
  ctx.lineTo(x1 + 0.5, y + 0.5);
  ctx.stroke();
}

function panelBox(p) {
  ctx.fillStyle = PAL.panel;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = PAL.panelEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
}

/* word wrap that respects the tracking, since measureText does not know about it */
function wrapText(str, x, y, maxW, lineH, size, weight, font, color, spacing) {
  ctx.font = `${weight} ${size}px ${font}`;
  let line = '';
  let cy = y;
  for (const ch of [...str]) {
    const test = line + ch;
    if (ctx.measureText(test).width + spacing * test.length > maxW && line) {
      T(line, x, cy, size, weight, font, color, spacing);
      cy += lineH;
      line = ch;
    } else line = test;
  }
  if (line) T(line, x, cy, size, weight, font, color, spacing);
  return cy;
}

/* ---- compose --------------------------------------------------------------- */
function compose() {
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, 0, W, H);

  /* header */
  T('SPOT THE DIFFERENCE', M, 84, 13, 700, FONT_MONO, PAL.accentLit, 2.6);
  T('两台车，六个工程参数不一样', M, 126, 32, 600, FONT_DISP, PAL.paper, 0.4);
  T(`${FOUND.size} / ${DIFFS.length}`, R, 104, 46, 700, FONT_MONO, PAL.paper, -1.2, 'right');
  T('已找到', R - 122, 104, 13, 400, FONT_MONO, PAL.paperDim, 1.8, 'right');
  hair(146);

  /* the two cars */
  hotspots = [];
  for (const [panel, p, tag, met] of [[PANEL_A, A, 'CAR A', MA], [PANEL_B, B, 'CAR B', MB]]) {
    panelBox(panel);
    T(tag, panel.x + 22, panel.y + 34, 15, 700, FONT_MONO, PAL.accentLit, 2.4);
    T(`ρ 1.204 · L 20.0 m · Fp ${F_PEAK} N`, panel.x + panel.w - 22, panel.y + 34, 11, 400, FONT_MONO, PAL.paperDim, 1.2, 'right');

    const { ox, oy } = carOrigin(panel);
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 1, panel.y + 1, panel.w - 2, panel.h - 2);
    ctx.clip();
    const out = drawCar(ctx, { ox, oy, scale: SCALE, p, pal: PAL });
    ctx.restore();
    for (const cand of out.anchors) hotspots.push({ id: cand.id, x: cand.x, y: cand.y, r: 40 });

    const sy = panel.y + 266;
    const cells = [
      ['Cd', f3(met.cd)],
      ['A /10⁻⁴m²', (met.area * 1e4).toFixed(2)],
      ['m_eq /g', (met.mEq * 1000).toFixed(1)],
      ['CoM /mm', (met.comX * 1000).toFixed(1)],
      ['t /s', f3(met.time)],
    ];
    const cw = (panel.w - 44) / cells.length;
    cells.forEach(([k, v], i) => {
      const cx = panel.x + 22 + i * cw;
      T(k, cx, sy - 15, 10, 400, FONT_MONO, PAL.paperDim, 1.1);
      T(v, cx, sy + 13, 21, 700, FONT_MONO, PAL.paper, -0.6);
    });
  }

  for (const h of hotspots) {
    if (!FOUND.has(h.id)) continue;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 25, 0, Math.PI * 2);
    ctx.strokeStyle = PAL.good;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(h.x - 9, h.y);
    ctx.lineTo(h.x - 2, h.y + 7);
    ctx.lineTo(h.x + 10, h.y - 8);
    ctx.strokeStyle = PAL.good;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (missAt) {
    ctx.beginPath();
    ctx.arc(missAt.x, missAt.y, 18, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,89,12,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* reveal card */
  panelBox(REVEAL);
  const segY = REVEAL.y + REVEAL.h - 46;
  const segW = (REVEAL.w - 88 - 5 * 8) / 6;
  DIFFS.forEach((d, i) => {
    const sx = REVEAL.x + 34 + i * (segW + 8);
    ctx.fillStyle = FOUND.has(d.id) ? PAL.accent : 'rgba(242,240,235,0.10)';
    ctx.fillRect(sx, segY, segW, 10);
  });

  if (lastFound) {
    const d = DIFFS.find((x) => x.id === lastFound);
    ctx.fillStyle = PAL.accent;
    ctx.fillRect(REVEAL.x + 1, REVEAL.y + 1, 7, REVEAL.h - 2);
    T(d.zh, REVEAL.x + 34, REVEAL.y + 58, 34, 600, FONT_DISP, PAL.paper, 0.4);
    T(d.en, REVEAL.x + 34, REVEAL.y + 84, 11, 400, FONT_MONO, PAL.accentLit, 2.4);

    T('CAR A', REVEAL.x + 34, REVEAL.y + 138, 10, 700, FONT_MONO, PAL.paperDim, 2.2);
    T(`${d.a}${d.unit}`, REVEAL.x + 34, REVEAL.y + 178, 30, 700, FONT_MONO, PAL.paper, -0.8);
    T('CAR B', REVEAL.x + 246, REVEAL.y + 138, 10, 700, FONT_MONO, PAL.paperDim, 2.2);
    T(`${d.b}${d.unit}`, REVEAL.x + 246, REVEAL.y + 178, 30, 700, FONT_MONO, PAL.accentLit, -0.8);

    ctx.strokeStyle = PAL.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(REVEAL.x + 474.5, REVEAL.y + 108);
    ctx.lineTo(REVEAL.x + 474.5, REVEAL.y + 196);
    ctx.stroke();

    wrapText(d.why(), REVEAL.x + 502, REVEAL.y + 124, REVEAL.w - 540, 23, 14, 400, FONT_MONO, PAL.paper, 1.4);
  } else {
    T('点出两台车不一样的地方', REVEAL.x + 34, REVEAL.y + 62, 26, 600, FONT_DISP, PAL.paper, 0.4);
    wrapText('每一处差异都对应一个真实参数：迎角、轮径、配重位置、尾翼角度、离地间隙、鼻锥长度。点中之后这里给出两台车的数值和它带来的后果。点错不扣分，只计数。',
      REVEAL.x + 34, REVEAL.y + 108, REVEAL.w - 68, 25, 15, 400, FONT_MONO, PAL.paperDim, 1.4);
    T('进度', REVEAL.x + 34, segY - 16, 10, 400, FONT_MONO, PAL.paperDim, 1.8);
  }

  /* checklist */
  T('检查表  CHECKLIST', M, LIST.y - 22, 11, 700, FONT_MONO, PAL.paperDim, 2.4);
  const rowH = 72;
  DIFFS.forEach((d, i) => {
    const ry = LIST.y + i * rowH;
    const got = FOUND.has(d.id);
    if (i > 0) hair(ry - 14, M, R, PAL.lineFaint);
    /* 没找到的那几行不能压到看不见。0.20 的透明度在多暗底上合成出来只有 57 亮度，
       整张表在初始态读起来像空表格。0.40 还压得住主次，同时看得出这是六行。 */
    T(String(i + 1).padStart(2, '0'), M, ry + 36, 15, 700, FONT_MONO, got ? PAL.accentLit : 'rgba(242,240,235,0.40)', 1.6);
    T(d.zh, M + 50, ry + 30, 20, 600, FONT_DISP, got ? PAL.paper : 'rgba(242,240,235,0.56)', 0.3);
    T(d.en, M + 50, ry + 50, 10, 400, FONT_MONO, got ? PAL.paperDim : 'rgba(242,240,235,0.32)', 1.6);
    T(got ? `${d.a}${d.unit}  /  ${d.b}${d.unit}` : '—  /  —', R, ry + 36, 17, got ? 700 : 400,
      FONT_MONO, got ? PAL.paper : 'rgba(242,240,235,0.40)', got ? -0.4 : 1.2, 'right');
  });

  /* paper result band — anchors the bottom and states what the six differences
     add up to, which is the part a viewer actually wants */
  ctx.fillStyle = PAL.paper;
  ctx.fillRect(0, BAND.y, W, BAND.h);
  ctx.fillStyle = PAL.accent;
  ctx.fillRect(0, BAND.y, 12, BAND.h);

  T('六项差异合计  TOTAL EFFECT ON THE RUN', M, BAND.y + 44, 11, 700, FONT_MONO, PAL.muteOnPaper, 2.2);

  const cols = [
    ['CAR A', f3(MA.time)],
    ['CAR B', f3(MB.time)],
    [DT >= 0 ? 'B 慢于 A' : 'B 快于 A', Math.abs(DT).toFixed(3)],
  ];
  cols.forEach(([label, val], i) => {
    const cx = M + i * 336;
    T(label, cx, BAND.y + 88, 10, 700, FONT_MONO, PAL.muteOnPaper, 2.2);
    const wv = T(val, cx, BAND.y + 146, 50, 700, FONT_MONO, PAL.inkOnPaper, -1.6);
    T(' s', cx + wv + 6, BAND.y + 146, 22, 700, FONT_MONO, PAL.muteOnPaper, 0);
  });

  ctx.strokeStyle = 'rgba(11,11,12,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(M + 0.5, BAND.y + 172);
  ctx.lineTo(R + 0.5, BAND.y + 172);
  ctx.stroke();

  T(`Cd ${f3(MA.cd)} → ${f3(MB.cd)}    A/10⁻⁴m² ${(MA.area * 1e4).toFixed(2)} → ${(MB.area * 1e4).toFixed(2)}    m_eq/g ${(MA.mEq * 1000).toFixed(1)} → ${(MB.mEq * 1000).toFixed(1)}`,
    M, BAND.y + 204, 14, 400, FONT_MONO, PAL.inkOnPaper, 1.2);
  T('B 赢在迎角和轮径，输在尾翼、离地间隙和鼻锥三项。',
    M, BAND.y + 234, 14, 400, FONT_MONO, PAL.muteOnPaper, 1.2);

  ctx.strokeStyle = 'rgba(11,11,12,0.14)';
  ctx.beginPath();
  ctx.moveTo(M + 0.5, BAND.y + 254);
  ctx.lineTo(R + 0.5, BAND.y + 254);
  ctx.stroke();

  T(`MISCLICKS ${misses}`, M, BAND.y + 278, 11, 400, FONT_MONO, PAL.muteOnPaper, 2.2);
  T(FOUND.size === DIFFS.length ? 'ALL 6 FOUND' : '1080 × 1920 · PNG · LOCAL RENDER',
    R, BAND.y + 278, 11, FOUND.size === DIFFS.length ? 700 : 400, FONT_MONO,
    FOUND.size === DIFFS.length ? PAL.accent : PAL.muteOnPaper, 2.2, 'right');
}

/* ---- interaction ------------------------------------------------------------ */
function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) / r.width) * W,
    y: ((ev.clientY - r.top) / r.height) * H,
  };
}

canvas.addEventListener('click', (ev) => {
  const p = canvasPoint(ev);
  let best = null, bestD = Infinity;
  for (const h of hotspots) {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < h.r && d < bestD) { best = h; bestD = d; }
  }
  if (best && FOUND.has(best.id)) {
    /* 同一处差异在两台车上都能点。点第二台不算失误，也不再重复计数。 */
    lastFound = best.id;
    missAt = null;
  } else if (best) {
    FOUND.add(best.id);
    lastFound = best.id;
    missAt = null;
  } else {
    misses += 1;
    missAt = p;
    clearTimeout(missAt._t);
    missAt._t = setTimeout(() => { missAt = null; compose(); }, 380);
  }
  const el = document.getElementById('count');
  if (el) el.textContent = `${FOUND.size} / ${DIFFS.length}`;
  compose();
});

canvas.addEventListener('mousemove', (ev) => {
  const p = canvasPoint(ev);
  const over = hotspots.some((h) => !FOUND.has(h.id) && Math.hypot(h.x - p.x, h.y - p.y) < h.r);
  canvas.style.cursor = over ? 'crosshair' : 'default';
});

/* ---- public contract -------------------------------------------------------- */
const errs = [];
if (DIFFS.length !== 6) errs.push(`期望 6 处差异，实际 ${DIFFS.length}`);
for (const d of DIFFS) {
  if (!Number.isFinite(d.a) || !Number.isFinite(d.b)) errs.push(`${d.id} 不是数值`);
  if (d.a === d.b) errs.push(`${d.id} 两边一样，不构成差异`);
}
for (const m of [MA, MB]) {
  for (const [k, v] of Object.entries(m)) {
    if (!Number.isFinite(v)) errs.push(`metrics.${k} 不是有限数`);
  }
}

window.__app = {
  canvas,
  hotspots: () => hotspots.map(({ id, x, y, r }) => ({ id, x, y, r })),
  getState: () => ({ found: [...FOUND], misses, lastFound }),
  getMetrics: () => ({
    A: { ...MA, params: { ...A } },
    B: { ...MB, params: { ...B } },
    diffs: DIFFS.length,
    found: FOUND.size,
    deltaT: DT,
  }),
  set: (k, v) => {
    if (k === 'found') { FOUND.clear(); for (const id of v || []) FOUND.add(id); lastFound = (v || [])[v.length - 1] || null; }
    if (k === 'reset') { FOUND.clear(); lastFound = null; misses = 0; missAt = null; }
    compose();
  },
  revealAll: () => {
    for (const d of DIFFS) FOUND.add(d.id);
    lastFound = DIFFS[DIFFS.length - 1].id;
    compose();
    return FOUND.size;
  },
  selfTest: () => {
    const e = [...errs];
    if (hotspots.length !== DIFFS.length * 2) e.push(`热点 ${hotspots.length} 个，期望 ${DIFFS.length * 2}`);
    for (const h of hotspots) {
      if (!(h.x > 0 && h.x < W && h.y > 0 && h.y < H)) e.push(`热点 ${h.id} 越界 (${h.x.toFixed(0)},${h.y.toFixed(0)})`);
    }
    if (!(MA.time > 0.5 && MA.time < 4)) e.push(`A 成绩 ${MA.time} 不合理`);
    if (!(MB.time > 0.5 && MB.time < 4)) e.push(`B 成绩 ${MB.time} 不合理`);
    return { ok: e.length === 0, errs: e };
  },
  exportPNG: async () => { compose(); const b = await toPNG(canvas, { width: 1080, height: 1920 }); await assertPNG(b); return b.size; },
  exportCover: async () => { compose(); const b = await toPNG(canvas, { width: 1080, height: 1350 }); await assertPNG(b); return b.size; },
  downloadAll: () => exportEpisode(canvas, 'spot-diff-car'),
};

compose();
