/* turbulence-streak · 车尾的卡门涡街
   画布 1080×1920。视觉核心是一张俯视涡街，下面是频率随速度的曲线。

   版面（横向 60–930，纵向 240–1480）：
     300–564   页眉
     596–980   ① 俯视涡街（含包络、迹线、λ 标注、脱落节拍条）
     1012–1216 ② 脱落频率随车速
     1260–1305 三个读数
     1336–1390 参数条
     1420–1460 页脚

   随机性全部来自 mulberry32(SEED)，没有 Math.random()，
   所以同一组滑杆永远画出同一张图，导出可以逐像素比对。 */

import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import * as K from './plotkit.js';
import { frame, line, area } from './plot.js';
import * as TS from './physics.js';

const { W, H, PAPER, ACCENT, MONO, SAFE, rgba, accent } = K;

const TEXT = {
  kicker: '尾流 ／ TURBULENCE-STREAK',
  t1: '车尾每秒甩出 68 个涡',
  t2: '上下两列反着转',
  sub: '卡门涡街：涡间距 λ = D/St = 0.250 m 跟速度无关，变的是每秒脱几个',
  sec1: '① 俯视涡街（车向 →）',
  sec2: '② 脱落频率 f 随车速',
  ax2: '横轴 v (m/s)',
  pos: '正涡（逆时针）',
  neg: '负涡（顺时针）',
  env: '尾流包络 h(x)',
  car: '车尾',
  lamCap: '涡间距 λ',
  clock: '脱落节拍　0.25 s 窗口',
  coreCap: '涡核 r = √(4νx/u_c)，速度越低长得越胖',
  fCap: '脱落频率',
  lamCap2: '涡间距',
  reCap: '雷诺数 Re_L',
  bands: '上下两列交替脱落，间距半个波长 = 0.125 m',
  paramLine: 'St 0.20 [TYPICAL]　　D 0.050 m [FIXED]　　ν 1.516×10⁻⁵ m²/s [FIXED]　　u_c 0.85v [TYPICAL]',
  paramLine2: 'Re_D 5.58×10⁴ → 落在亚临界脱落区，St ≈ 0.2 才有依据',
  foot: '随机量全部来自 mulberry32(0x5EED1E55)，同输入同输出',
  footR: '视窗 2.4 m　涡数',
  footR2: '个',
};

const CHARS = Object.values(TEXT).join('');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const state = { ...TS.DEFAULT_STATE };

/* ---------- 几何 ---------- */
const FLD = { x: 60, y: 620, w: 870, h: 360 };
const PPM = FLD.w / (TS.WINDOW + TS.L);      // 每米多少像素（车长 0.2 m 也在框内）
const CAR_PX = TS.L * PPM;
const TAIL = FLD.x + FLD.w - CAR_PX;         // 车尾，也就是尾流的原点
const CY = FLD.y + 150;
const STRIP_Y = 916;                          // 脱落节拍条
const CH = { x: 170, y: 1036, w: 760, h: 170 };
const MONO12 = `400 12px ${MONO}`;

const px = (xm) => TAIL - xm * PPM;          // 下游 x 米 → 画布 x
const py = (ym) => CY + ym * PPM;

/* ---------- 主绘制 ---------- */
function compose() {
  const m = TS.model(state);

  K.backdrop(ctx);

  /* --- 页眉 --- */
  K.accentRule(ctx, SAFE.x0, 300);
  K.kicker(ctx, TEXT.kicker, 334);
  K.title(ctx, [TEXT.t1, TEXT.t2], 410, { size: 56, lead: 66 });
  K.sub(ctx, TEXT.sub, 536);
  K.hairline(ctx, 564);

  /* --- ① 涡街 --- */
  K.label(ctx, TEXT.sec1, SAFE.x0, 596, { color: rgba(0.5) });
  K.label(ctx, `Re 2.23×10⁵　f ${m.f.toFixed(1)} Hz`, SAFE.x1, 596,
    { color: PAPER, align: 'right', font: `600 16px ${MONO}`, spacing: 0 });
  drawField(m);

  /* --- ② 频率曲线 --- */
  K.label(ctx, TEXT.sec2, SAFE.x0, 1012, { color: rgba(0.5) });
  K.label(ctx, TEXT.ax2, SAFE.x0 + 178, 1012, { color: rgba(0.32), font: MONO12, spacing: 0 });
  K.label(ctx, `${m.f.toFixed(2)} Hz`, SAFE.x1, 1012,
    { color: PAPER, align: 'right', font: `600 16px ${MONO}`, spacing: 0 });
  drawCurve(m);

  /* --- 读数 --- */
  K.hairline(ctx, 1244);
  K.readout(ctx, {
    x: SAFE.x0, y: 1280, value: m.f.toFixed(1), unit: 'Hz',
    caption: TEXT.fCap, status: 'DERIVED', color: PAPER, size: 40,
  });
  K.readout(ctx, {
    x: 348, y: 1280, value: m.lam.toFixed(3), unit: 'm',
    caption: TEXT.lamCap2, status: `= ${(m.lamOverL).toFixed(2)} L`, color: ACCENT, size: 40,
  });
  K.readout(ctx, {
    x: 664, y: 1280, value: (m.reL / 1e5).toFixed(2), unit: '×10⁵',
    caption: TEXT.reCap, status: `${(m.period * 1000).toFixed(1)} ms/涡`, color: PAPER, size: 40,
  });

  /* --- 参数条 --- */
  K.hairline(ctx, 1336);
  K.label(ctx, TEXT.paramLine, SAFE.x0, 1360, { color: rgba(0.45), font: MONO12, spacing: 0 });
  K.label(ctx, TEXT.paramLine2, SAFE.x0, 1384, { color: rgba(0.38), font: MONO12, spacing: 0 });

  /* --- 页脚 --- */
  K.hairline(ctx, 1420);
  K.label(ctx, TEXT.foot, SAFE.x0, 1448, { color: rgba(0.42) });
  K.label(ctx, `${TEXT.footR} ${m.vortices.length} ${TEXT.footR2}`, SAFE.x1, 1448,
    { color: rgba(0.42), align: 'right' });
}

/* ---------- 涡街 ---------- */
function drawField(m) {
  ctx.save();
  ctx.strokeStyle = rgba(0.2);
  ctx.lineWidth = 1;
  ctx.strokeRect(FLD.x + 0.5, FLD.y + 0.5, FLD.w - 1, FLD.h - 1);
  ctx.restore();

  /* 中线 */
  ctx.save();
  ctx.strokeStyle = rgba(0.16);
  ctx.setLineDash([2, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(FLD.x, CY + 0.5);
  ctx.lineTo(TAIL, CY + 0.5);
  ctx.stroke();
  ctx.restore();

  /* 包络 h(x) —— 两条张开的外扩线 */
  const envTop = [], envBot = [];
  for (let i = 0; i <= 60; i++) {
    const x = (TS.WINDOW * i) / 60;
    const h = TS.width(x) / 2;
    envTop.push([px(x), py(-h)]);
    envBot.push([px(x), py(h)]);
  }
  ctx.save();
  ctx.strokeStyle = rgba(0.34);
  /* 尾流本体的平均速度亏损：靠车浓、往下游淡。这条渐变就是"尾流有多宽"的填充版 */
  {
    const gw = ctx.createLinearGradient(TAIL, 0, FLD.x, 0);
    gw.addColorStop(0, 'rgba(242,240,235,0.155)');
    gw.addColorStop(0.45, 'rgba(242,240,235,0.085)');
    gw.addColorStop(1, 'rgba(242,240,235,0.028)');
    ctx.save();
    ctx.fillStyle = gw;
    ctx.beginPath();
    envTop.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = envBot.length - 1; i >= 0; i--) ctx.lineTo(envBot[i][0], envBot[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.3;
  for (const arr of [envTop, envBot]) {
    ctx.beginPath();
    arr.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();

  /* 迹线：三条绕过涡列的线 */
  for (const pts of m.streaks) {
    ctx.save();
    ctx.strokeStyle = rgba(0.34);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pts.forEach(([xm, ym], i) => {
      const X = px(xm), Y = py(ym);
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.stroke();
    ctx.restore();
  }

  /* 涡 */
  for (const v of m.vortices) {
    const cx = px(v.x), cy = py(v.y);
    const r = 5 + 3400 * v.r;
    const age = v.x / TS.WINDOW;
    const warm = v.side > 0;                       // 下排 = 正涡，用橙色
    const a0 = Math.max(0.10, (1 - 0.55 * age) * v.strength);
    drawVortex(cx, cy, r, warm, a0, v.side);
  }

  /* 车 */
  drawCar(m);

  /* λ 标注：取同侧相邻两涡 */
  const a = m.vortices[2], b = m.vortices[4];
  if (a && b) {
    const y = CY - TS.width(a.x) / 2 * PPM - 44;
    const x1 = px(a.x), x2 = px(b.x);
    ctx.save();
    ctx.strokeStyle = accent(0.85);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y + 6);
    ctx.moveTo(x2, y - 6); ctx.lineTo(x2, y + 6);
    ctx.moveTo(x1, y); ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
    K.text(ctx, `${TEXT.lamCap} ${m.lam.toFixed(3)} m`, (x1 + x2) / 2, y - 10,
      { font: `600 14px ${MONO}`, color: ACCENT, align: 'center' });
  }

  /* 包络标注，放在最左端 */
  K.text(ctx, `${TEXT.env} ${m.widthEnd.toFixed(3)} m`, FLD.x + 10, py(-m.widthEnd / 2) - 8,
    { font: MONO12, color: rgba(0.5) });

  /* 涡核说明 */
  K.label(ctx, TEXT.coreCap, FLD.x + 10, FLD.y + FLD.h - 12,
    { color: rgba(0.34), font: MONO12, spacing: 0 });

  /* 脱落节拍条 */
  drawClock(m);
}

function drawVortex(cx, cy, r, warm, a, dir) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.9);
  const base = warm ? '232,89,12' : '242,240,235';
  g.addColorStop(0, `rgba(${base},${(0.52 * a).toFixed(3)})`);
  g.addColorStop(0.45, `rgba(${base},${(0.20 * a).toFixed(3)})`);
  g.addColorStop(1, `rgba(${base},0)`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
  ctx.fill();

  /* 涡心螺旋：两列转向相反 */
  ctx.strokeStyle = warm ? `rgba(232,89,12,${(0.95 * a).toFixed(3)})`
    : `rgba(242,240,235,${(0.9 * a).toFixed(3)})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const turns = 1.5;
  const total = turns * 2 * Math.PI;
  for (let t = 0; t <= total; t += 0.10) {
    const rr = r * (0.22 + 0.78 * (t / total));
    const X = cx + Math.cos(t * dir) * rr;
    const Y = cy + Math.sin(t * dir) * rr;
    if (t === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCar(m) {
  const halfW = (TS.D / 2) * PPM;
  ctx.save();
  ctx.fillStyle = rgba(0.16);
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.rect(TAIL, CY - halfW, CAR_PX, halfW * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(TAIL + CAR_PX - 16, CY);
  ctx.lineTo(TAIL + CAR_PX - 5, CY);
  ctx.stroke();
  ctx.restore();
  K.label(ctx, TEXT.car, TAIL + 3, CY + halfW + 15,
    { color: rgba(0.55), font: MONO12, spacing: 0 });
}

/* ---------- 脱落节拍 ---------- */
function drawClock(m) {
  const x0 = 200, x1 = 900, span = 0.25;
  K.label(ctx, TEXT.clock, FLD.x + 10, STRIP_Y + 4, { color: rgba(0.42), font: MONO12, spacing: 0 });

  const rows = [
    [m.v, m.f, ACCENT, rgba(0.9), `${m.v.toFixed(1)} m/s`],
    [m.v / 2, m.f / 2, PAPER, rgba(0.45), `${(m.v / 2).toFixed(1)} m/s`],
  ];
  rows.forEach(([v, f, col, lab, name], ri) => {
    const y = STRIP_Y + 16 + ri * 22;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y + 10.5);
    ctx.lineTo(x1, y + 10.5);
    ctx.stroke();
    ctx.restore();
    const n = Math.round(f * span);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      const X = x0 + (i / Math.max(n, 1)) * (x1 - x0);
      ctx.beginPath();
      ctx.moveTo(X, y);
      ctx.lineTo(X, y + 10);
      ctx.stroke();
    }
    ctx.restore();
    K.label(ctx, name, FLD.x + 10, y + 10, { color: lab, font: MONO12, spacing: 0 });
    K.text(ctx, `${n} 个`, x1 + 4, y + 10, { font: MONO12, color: lab });
  });
  K.label(ctx, '0.25 s', x1, STRIP_Y - 2, { color: rgba(0.3), font: MONO12, align: 'right', spacing: 0 });
}

/* ---------- 频率曲线 ---------- */
function drawCurve(m) {
  const box = CH;
  const s = frame(ctx, box, { x0: 0, x1: 20, y0: 0, y1: 90 }, {
    yLabel: 'f (Hz)', xTicks: 5, yTicks: 4,
    xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
  });

  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const v = (20 * i) / 120;
    pts.push([v, TS.freq(v)]);
  }
  area(ctx, s, pts, { color: accent(0.16) });
  line(ctx, s, pts, { color: ACCENT, width: 3 });

  /* 当前车速 */
  const cx = s.sx(state.v), cy = s.sy(m.f);
  ctx.save();
  ctx.strokeStyle = rgba(0.3);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, box.y + box.h);
  ctx.lineTo(cx + 0.5, cy);
  ctx.stroke();
  ctx.restore();
  K.dot(ctx, cx, cy, 5.5, PAPER, ACCENT);

  /* λ 与速度无关，写在图里最省地方 */
  K.label(ctx, `λ = ${m.lam.toFixed(3)} m 恒定`, box.x + box.w - 4, box.y + 26,
    { color: rgba(0.5), align: 'right', font: MONO12, spacing: 0 });
}

/* ---------- 自检 ---------- */
function selfTest() {
  const checks = TS.assertions();
  const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} — ${c.detail}`);
  if (canvas.width !== W || canvas.height !== H) errs.push(`画布尺寸 ${canvas.width}×${canvas.height}`);
  if (!(FLD.y > 564 && FLD.y + FLD.h < 1012)) errs.push('涡街压到页眉或曲线区');
  if (!(FLD.x >= SAFE.x0 && FLD.x + FLD.w <= SAFE.x1 + 1)) errs.push('涡街压出安全区');
  if (!(CH.y > FLD.y + FLD.h + 20 && CH.y + CH.h + 34 < 1244)) errs.push('频率曲线压到读数');
  if (!(TAIL + CAR_PX <= FLD.x + FLD.w + 1)) errs.push('车身画出了右边界');
  if (!(TAIL - TS.WINDOW * PPM >= FLD.x - 1)) errs.push('视窗超左边界');
  {
    const m = TS.model(state);
    const maxY = Math.max(...m.vortices.map((v) => Math.abs(v.y))) * PPM;
    if (!(CY - maxY > FLD.y && CY + maxY < STRIP_Y - 8)) errs.push(`涡列溢出框：±${maxY.toFixed(1)}px`);
  }
  if (JSON.stringify(TS.street(state)) !== JSON.stringify(TS.street(state, TS.SEED))) {
    errs.push('同种子两次生成结果不一致');
  }
  return { ok: errs.length === 0, errs, checks };
}

/* ---------- 对外钩子 ---------- */
window.__app = {
  canvas,
  canvasChars: CHARS,
  getState: () => ({ ...state }),
  getMetrics: () => {
    const m = TS.model(state);
    return {
      v: m.v, f: m.f, lam: m.lam, period: m.period, uc: m.uc,
      reL: m.reL, reD: m.reD, widthEnd: m.widthEnd, rcEnd: m.rcEnd,
      vortices: m.vortices.length, streakCount: m.streaks.length,
      coreFreq: m.coreFreq, st: m.st, seed: TS.SEED, jitter: state.jitter,
    };
  },
  set: (k, v) => { if (k in state) { state[k] = v; compose(); } },
  reset: () => { Object.assign(state, TS.DEFAULT_STATE); compose(); },
  selfTest,
  model: (s) => TS.model(s ? { ...state, ...s } : state),
  assertions: () => TS.assertions(),
  street: (s) => TS.street(s ? { ...state, ...s } : state),
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
  downloadAll: () => exportEpisode(canvas, 'turbulence-streak'),
};

/* ---------- 面板接线 ---------- */
for (const key of Object.keys(TS.LIMITS)) {
  const el = document.getElementById('in-' + key);
  const out = document.getElementById('out-' + key);
  if (!el) continue;
  const L = TS.LIMITS[key];
  el.min = L.min; el.max = L.max; el.step = L.step; el.value = state[key];
  const fmt = (v) => (key === 'v' ? v.toFixed(1) + L.unit : v.toFixed(2));
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

compose();