/* wake-drafting · 尾流跟车
   画布 1080×1920。视觉核心是一张俯视速度场，下面是阻力随间距的曲线。

   版面（横向 60–930，纵向 240–1480）：
     300–564   页眉
     594–980   ① 俯视速度场（含两台车、间距标注、三条横向速度剖面）
     1040–1254 ② 尾车阻力随跟车距离
     1310–1400 三个读数
     1420–1460 页脚

   速度场的栅格只跟空间有关，和滑杆无关，所以只算一次、存进离屏画布。 */

import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import * as K from './plotkit.js';
import { frame, line, area } from './plot.js';
import * as WD from './physics.js';
import { THRUST, REFERENCE } from './racing-core.js';

const { W, H, PAPER, ACCENT, MONO, SAFE, rgba, accent } = K;

const TEXT = {
  kicker: '尾流跟车 ／ WAKE-DRAFTING',
  t1: '跟到半个车身',
  t2: '风阻只剩',
  sub: '前车拖出的低速区同时压低动压和阻力系数，两件事相乘才是阻力比',
  sec1: '① 俯视速度场 u / U',
  sec1r: 'PSEUDO-COLOR · 无因次',
  sec2: '② 尾车阻力随跟车距离',
  lead: '前车',
  fol: '尾车',
  gapDim: '跟车距离',
  core: '尾流核心 u/U',
  prof: '横向速度剖面',
  legend: 'u/U 色标 0.88 → 1.00，γ 已提亮',
  coef: '等值线 u/U 0.99／0.97／0.95　动压赤字 0.22 e^(−g/0.85)　阻力系数折减 0.38 e^(−g/1.15)　[TYPICAL]',
  noWake: '前车（无尾流）',
  dragCap: '尾车阻力',
  ratioCap: '相对前车',
  savingCap: '省下的力',
  thrustShare: '占峰值推力',
  foot: '准静态远场尾流模型 · 非 CFD · 非实测',
  reFoot: '雷诺数',
  shedFoot: '脱落频率',
  station: 'x =',
  c0: 'L',
};

const CHARS = Object.values(TEXT).join('');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const state = { ...WD.DEFAULT_STATE };

/* ---------- 几何 ---------- */
const FLD = { x: 60, y: 610, w: 870, h: 370 };
const PPL = FLD.w / 7;                 // 每车长多少像素（横向纵向同比例）
const TAIL = FLD.x + FLD.w;            // 前车尾端
const CY = FLD.y + FLD.h / 2;
const HALF = 0.14 * PPL;               // 车身半宽（0.28 L 宽）
const CH = { x: 150, y: 1040, w: 780, h: 170 };

/* ---------- 速度场贴图（只算一次） ---------- */
const field = document.createElement('canvas');
field.width = FLD.w;
field.height = FLD.h;

function buildField() {
  const g = field.getContext('2d');
  g.clearRect(0, 0, FLD.w, FLD.h);
  const step = 5;
  for (let px = 0; px < FLD.w; px += step) {
    const xL = (TAIL - (FLD.x + px + step / 2)) / PPL;
    if (xL < 0) continue;
    for (let py = 0; py < FLD.h; py += step) {
      const yL = (FLD.y + py + step / 2 - CY) / PPL;
      const d = WD.deficit(xL, yL);
      if (d < 1e-4) continue;
      const a = 0.60 * Math.sqrt(Math.min(1, d / WD.AU));
      g.fillStyle = `rgba(242,240,235,${Math.min(0.62, a).toFixed(4)})`;
      g.fillRect(px, py, step, step);
    }
  }
}

/* ---------- 主绘制 ---------- */
function compose() {
  const m = WD.model(state);
  const run = WD.runResult();

  K.backdrop(ctx);

  /* --- 页眉 --- */
  K.accentRule(ctx, SAFE.x0, 300);
  K.kicker(ctx, TEXT.kicker, 334);
  K.title(ctx, [TEXT.t1, `${TEXT.t2} ${(m.dR * 100).toFixed(1)} %`], 410, { size: 58, lead: 68 });
  K.sub(ctx, TEXT.sub, 536);
  K.hairline(ctx, 564);

  /* --- ① 速度场 --- */
  K.label(ctx, TEXT.sec1, SAFE.x0, 594, { color: rgba(0.5) });
  K.label(ctx, TEXT.sec1r, SAFE.x1, 594, { color: rgba(0.32), align: 'right' });
  drawField(m);

  /* --- ② 阻力曲线 --- */
  K.label(ctx, TEXT.sec2, SAFE.x0, 1014, { color: rgba(0.5) });
  K.label(ctx, `${(m.fFol * 1000).toFixed(1)} mN`, SAFE.x1, 1014,
    { color: m.gapL < 0.3 ? ACCENT : PAPER, align: 'right', font: `600 16px ${MONO}`, spacing: 0 });
  drawCurve(m);

  /* --- 三个读数 --- */
  K.hairline(ctx, 1290);
  K.readout(ctx, {
    x: SAFE.x0, y: 1330, value: (m.fFol * 1000).toFixed(1), unit: 'mN',
    caption: TEXT.dragCap, status: 'TYPICAL', color: PAPER, size: 40,
  });
  K.readout(ctx, {
    x: 348, y: 1330, value: (m.dR * 100).toFixed(1), unit: '%',
    caption: TEXT.ratioCap, status: 'DERIVED', color: m.gapL < 0.3 ? ACCENT : PAPER, size: 40,
  });
  K.readout(ctx, {
    x: 664, y: 1330, value: (m.saving * 1000).toFixed(1), unit: 'mN',
    caption: TEXT.savingCap, status: `${TEXT.thrustShare} ${(m.savingShare * 100).toFixed(2)} %`,
    color: ACCENT, size: 40,
  });

  /* --- 页脚 --- */
  K.hairline(ctx, 1420);
  K.label(ctx, TEXT.foot, SAFE.x0, 1448, { color: rgba(0.42) });
  K.label(ctx, `${TEXT.reFoot} ${m.re.toExponential(2).replace('e+', 'E')}　${TEXT.shedFoot} ${m.fShed.toFixed(2)} Hz`,
    SAFE.x1, 1448, { color: rgba(0.42), align: 'right' });
}

/* ---------- 速度场 ---------- */
function drawField(m) {
  /* 贴图 */
  ctx.drawImage(field, FLD.x, FLD.y);

  /* 边框 + 中线 */
  ctx.save();
  ctx.strokeStyle = rgba(0.22);
  ctx.lineWidth = 1;
  ctx.strokeRect(FLD.x + 0.5, FLD.y + 0.5, FLD.w - 1, FLD.h - 1);
  ctx.setLineDash([2, 8]);
  ctx.beginPath();
  ctx.moveTo(FLD.x, CY + 0.5);
  ctx.lineTo(FLD.x + FLD.w, CY + 0.5);
  ctx.stroke();
  ctx.restore();

  /* 三条横向速度剖面：曲线往左凸出的长度正比于速度赤字 */
  const K_BULGE = 1500;
  for (const xs of [0.6, 1.6, 3.0]) {
    const bx = TAIL - xs * PPL;
    if (bx < FLD.x + 8) continue;
    ctx.save();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    for (let py = 6; py <= FLD.h - 6; py += 4) {
      const yL = (FLD.y + py - CY) / PPL;
      const d = WD.deficit(xs, yL);
      const px = bx - d * K_BULGE;
      if (py === 6) ctx.moveTo(px, FLD.y + py); else ctx.lineTo(px, FLD.y + py);
    }
    ctx.stroke();
    ctx.restore();
    K.label(ctx, `${TEXT.station} ${xs.toFixed(1)}${TEXT.c0}`, bx + 6, FLD.y + 24,
      { color: rgba(0.42), font: `400 12px ${MONO}`, spacing: 0 });
  }

  /* 等值线：u/U = 0.99 / 0.97 / 0.95。赤字在横向是高斯的，所以 y 能直接解析解出来：
     d = Au·e^(−x/τ)·e^(−y²/2σ²) = 目标赤字  ⇒  y = σ·sqrt(2·ln(amp/目标)) */
  for (const c of [0.99, 0.97, 0.95]) {
    const target = 1 - c;
    const xmax = WD.WAKE.qTau * Math.log(WD.AU / target);
    if (!(xmax > 0.02)) continue;
    ctx.save();
    ctx.strokeStyle = c === 0.95 ? accent(0.55) : rgba(c === 0.97 ? 0.46 : 0.3);
    ctx.lineWidth = 1.4;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const x = (xmax * i) / 48;
        const amp = WD.AU * Math.exp(-x / WD.WAKE.qTau);
        const y = WD.sigma(x) * Math.sqrt(2 * Math.log(amp / target));
        const px = TAIL - x * PPL;
        const py = CY + sign * y * PPL;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  /* 前车 */
  drawCar(TAIL - PPL, CY, TEXT.lead, false);
  /* 尾车 */
  const nose = TAIL - PPL * (1 + state.gap);
  drawCar(nose - PPL, CY, TEXT.fol, true);
  K.text(ctx, `${TEXT.core} ${m.uCore.toFixed(3)}`, nose - 4, CY - HALF - 12,
    { font: `500 13px ${MONO}`, color: PAPER, align: 'right' });

  /* 间距标注 */
  const dimY = CY + HALF + 46;
  ctx.save();
  ctx.strokeStyle = accent(0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nose + 0.5, dimY);
  ctx.lineTo(nose + 0.5, CY + HALF + 6);
  ctx.moveTo(nose + 0.5, dimY);
  ctx.lineTo(TAIL - PPL - 0.5, dimY);
  ctx.moveTo(TAIL - PPL - 0.5, dimY);
  ctx.lineTo(TAIL - PPL - 0.5, CY + HALF + 6);
  ctx.stroke();
  ctx.restore();
  K.arrow(ctx, TAIL - PPL - 6, dimY, TAIL - PPL - 26, dimY, { color: accent(0.9), width: 1.5, head: 8 });
  K.arrow(ctx, nose + 6, dimY, nose + 26, dimY, { color: accent(0.9), width: 1.5, head: 8 });
  K.text(ctx, `${TEXT.gapDim} g = ${state.gap.toFixed(2)} L = ${m.gapMm.toFixed(0)} mm`,
    (nose + TAIL - PPL) / 2, dimY - 10,
    { font: `600 15px ${MONO}`, color: PAPER, align: 'center' });

  /* 色标 */
  const lgY = FLD.y + FLD.h - 42;
  for (let i = 0; i < 24; i++) {
    const a = 0.60 * Math.sqrt(1 - i / 24);
    ctx.save();
    ctx.fillStyle = `rgba(242,240,235,${a.toFixed(3)})`;
    ctx.fillRect(FLD.x + 16 + i * 9, lgY, 9, 12);
    ctx.restore();
  }
  K.label(ctx, TEXT.legend, FLD.x + 16, lgY + 30, { color: rgba(0.42), font: `400 12px ${MONO}`, spacing: 0 });
  K.label(ctx, TEXT.coef, FLD.x + 300, lgY + 30, { color: rgba(0.34), font: `400 12px ${MONO}`, spacing: 0 });
}

function drawCar(x0, cy, labelStr, isFollower) {
  ctx.save();
  ctx.fillStyle = rgba(0.13);
  ctx.strokeStyle = isFollower ? ACCENT : PAPER;
  ctx.lineWidth = isFollower ? 2 : 1.5;
  ctx.beginPath();
  ctx.rect(x0, cy - HALF, PPL, HALF * 2);
  ctx.fill();
  ctx.stroke();
  /* 车头方向线 */
  ctx.beginPath();
  ctx.moveTo(x0 + PPL - 14, cy);
  ctx.lineTo(x0 + PPL - 4, cy);
  ctx.stroke();
  ctx.restore();
  K.label(ctx, labelStr, x0 + 4, cy + HALF + 16,
    { color: isFollower ? ACCENT : rgba(0.5), font: `500 12px ${MONO}`, spacing: 0 });
}

/* ---------- 阻力曲线 ---------- */
function drawCurve(m) {
  const box = CH;
  const gMax = WD.LIMITS.gap.max;
  const fMax = 100;   // mN
  const s = frame(ctx, box, { x0: 0, x1: gMax, y0: 0, y1: fMax }, {
    xLabel: '跟车距离 g (车长)',
    yLabel: '尾车阻力 (mN)',
    xTicks: 5,
    yTicks: 4,
    xFmt: (v) => v.toFixed(0),
    yFmt: (v) => v.toFixed(0),
  });

  const pts = [];
  for (let i = 0; i <= 150; i++) {
    const g = (gMax * i) / 150;
    pts.push([g, WD.model({ gap: g, v: state.v }).fFol * 1000]);
  }
  area(ctx, s, pts, { color: accent(0.15) });
  line(ctx, s, pts, { color: ACCENT, width: 3 });

  /* 前车阻力：水平虚线 */
  const fl = m.fLead * 1000;
  line(ctx, s, [[0, fl], [gMax, fl]], { color: PAPER, width: 1.5, dashed: true });
  K.label(ctx, TEXT.noWake, box.x + box.w - 4, s.sy(fl) - 9,
    { color: rgba(0.6), align: 'right', font: `500 13px ${MONO}`, spacing: 0 });

  /* 当前点 */
  const cx = s.sx(state.gap);
  const cy = s.sy(m.fFol * 1000);
  ctx.save();
  ctx.strokeStyle = rgba(0.32);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, box.y + box.h);
  ctx.lineTo(cx + 0.5, cy);
  ctx.stroke();
  ctx.restore();
  K.dot(ctx, cx, cy, 5.5, PAPER, ACCENT);
}

/* ---------- 自检 ---------- */
function selfTest() {
  const checks = WD.assertions();
  const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} — ${c.detail}`);
  if (canvas.width !== W || canvas.height !== H) errs.push(`画布尺寸 ${canvas.width}×${canvas.height}`);
  if (!(FLD.y > 564 && FLD.y + FLD.h < 1014)) errs.push('速度场压到页眉或曲线区');
  if (!(FLD.x >= SAFE.x0 && FLD.x + FLD.w <= SAFE.x1 + 1)) errs.push('速度场压出安全区');
  if (!(CH.y > FLD.y + FLD.h + 40)) errs.push('曲线压到速度场');
  if (!(CH.y + CH.h + 50 < 1330 - 40)) errs.push('曲线压到读数');
  /* 尾车不能被画到场地左边之外 */
  const nose = TAIL - PPL * (1 + WD.LIMITS.gap.max);
  if (!(nose - PPL >= FLD.x - 1)) errs.push(`最大间距时尾车出框：${(nose - PPL).toFixed(1)}`);
  if (!(WD.model({ gap: 0, v: 12 }).saving >= 0)) errs.push('省下的力出现负值');
  return { ok: errs.length === 0, errs, checks };
}

/* ---------- 对外钩子 ---------- */
window.__app = {
  canvas,
  canvasChars: CHARS,
  getState: () => ({ ...state }),
  getMetrics: () => {
    const m = WD.model(state);
    const run = WD.runResult();
    return {
      gapL: m.gapL, gapMm: m.gapMm, fLead: m.fLead, fFol: m.fFol,
      qR: m.qR, cR: m.cR, dR: m.dR, saving: m.saving, savingShare: m.savingShare,
      uCore: m.uCore, re: m.re, fShed: m.fShed, v: m.v,
      tTotal: run.run.t, vExit: run.run.v, bandOk: run.ok, thrust: THRUST.Fpeak,
    };
  },
  set: (k, v) => { if (k in state) { state[k] = v; compose(); } },
  reset: () => { Object.assign(state, WD.DEFAULT_STATE); compose(); },
  selfTest,
  model: (s) => WD.model(s ? { ...state, ...s } : state),
  assertions: () => WD.assertions(),
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
  downloadAll: () => exportEpisode(canvas, 'wake-drafting'),
};

/* ---------- 面板接线 ---------- */
for (const key of Object.keys(WD.LIMITS)) {
  const el = document.getElementById('in-' + key);
  const out = document.getElementById('out-' + key);
  if (!el) continue;
  const L = WD.LIMITS[key];
  el.min = L.min; el.max = L.max; el.step = L.step; el.value = state[key];
  const fmt = (v) => (key === 'gap' ? v.toFixed(2) + L.unit : v.toFixed(1) + L.unit);
  const sync = () => {
    state[key] = parseFloat(el.value);
    if (out) out.textContent = fmt(state[key]);
    compose();
  };
  el.addEventListener('input', sync);
  if (out) out.textContent = fmt(state[key]);
}

const btn = document.getElementById('export');
if (btn) btn.addEventListener('click', () => {
  window.__app.downloadAll().catch((e) => console.error(e));
});

buildField();
compose();