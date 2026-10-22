/* coast-decel · 烧完之后的那 19 米
   画布 1080×1920。三张图共用同一组解析解，滑杆只改终点和滚动系数。

   版面（横向 60–930，纵向 240–1480）：
     300–564   页眉
     596–830   ① v(t)
     856–1070  ② v–x 相图
     1096–1320 ③ 两股阻力的份额
     1362–1400 参数条
     1420–1460 页脚 */

import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import * as K from './plotkit.js';
import { frame, line, area, marker } from './plot.js';
import * as CD from './physics.js';

const { W, H, PAPER, ACCENT, MONO, SAFE, rgba, accent } = K;

const TEXT = {
  kicker: '溜车段 ／ COAST-DECEL',
  t1: '烧完还剩 19 米',
  t2: '速度自己往下掉',
  sub: '风阻正比于 v²，滚动是常数——两股阻力在 3.95 m/s 处交接',
  sec1: '① 溜车速度 v(t)',
  ax1: '横轴 t (s)',
  sec2: '② v–x 相图',
  ax2: '横轴 x (m)',
  sec3: '③ 两股阻力各占多少',
  ax3: '横轴 v (m/s)',
  fin: '终点',
  burn: '烧完',
  noStop: '渐近线 3.95 m/s 在框外——这条方程里车永远不会停',
  onlyDrag: '只算风阻',
  onlyRoll: '只算滚动',
  real: '两股一起',
  half: '各占一半',
  coastBand: '溜车段',
  dragCap: '风阻份额',
  paramLine: 'C_d 0.34 [TYPICAL]　　轮轨滚动 0.008 [VERIFY]　　等效惯性质量 79.876 g [DERIVED]',
  paramLine2: 'a = 4.1000×10⁻³ 1/m　　b = 6.3864×10⁻² m/s²　　v∞ = 3.9467 m/s',
  foot: '闭式解与 RK4 数值积分互验，误差 < 1×10⁻⁶',
  reFoot: '雷诺数',
  decel: '平均减速度',
};

const CHARS = Object.values(TEXT).join('');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const state = { ...CD.DEFAULT_STATE };

/* ---------- 几何 ---------- */
const V_LOW = 15.4;         // 两第一张图的纵轴下限，只为了让曲线占满高度
const B1 = { x: 170, y: 620, w: 760, h: 200 };
const B2 = { x: 170, y: 880, w: 760, h: 180 };
const B3 = { x: 170, y: 1120, w: 760, h: 190 };
const MONO13 = `400 13px ${MONO}`;
const MONO12 = `400 12px ${MONO}`;

/* ---------- 主绘制 ---------- */
function compose() {
  const m = CD.model(state);

  K.backdrop(ctx);

  /* --- 页眉 --- */
  K.accentRule(ctx, SAFE.x0, 300);
  K.kicker(ctx, TEXT.kicker, 334);
  K.title(ctx, [TEXT.t1, TEXT.t2], 410, { size: 56, lead: 66 });
  K.sub(ctx, TEXT.sub, 536);
  K.hairline(ctx, 564);

  drawVT(m);
  drawPhase(m);
  drawShare(m);

  /* --- 参数条 --- */
  K.hairline(ctx, 1338);
  K.label(ctx, TEXT.paramLine, SAFE.x0, 1364, { color: rgba(0.45), font: MONO13, spacing: 0 });
  K.label(ctx, TEXT.paramLine2, SAFE.x0, 1396, { color: rgba(0.38), font: MONO13, spacing: 0 });

  /* --- 页脚 --- */
  K.hairline(ctx, 1420);
  K.label(ctx, TEXT.foot, SAFE.x0, 1448, { color: rgba(0.42) });
  K.label(ctx, `${TEXT.decel} ${((m.burn.v - m.vEnd) / m.coastTime).toFixed(3)} m/s²　${TEXT.reFoot} ${m.re0.toExponential(2).replace('e+', 'E')}`,
    SAFE.x1, 1448, { color: rgba(0.42), align: 'right' });
}

/* ---------- ① v(t) ---------- */
function drawVT(m) {
  const box = B1;
  K.label(ctx, TEXT.sec1, SAFE.x0, 596, { color: rgba(0.5) });
  K.label(ctx, TEXT.ax1, SAFE.x0 + 178, 596, { color: rgba(0.32), font: MONO12, spacing: 0 });
  K.label(ctx, `${m.burn.v.toFixed(2)} → ${m.vEnd.toFixed(2)} m/s`, SAFE.x1, 596,
    { color: PAPER, align: 'right', font: `600 16px ${MONO}`, spacing: 0 });

  const s = frame(ctx, box, { x0: m.burn.t, x1: Math.max(m.tEnd, m.burn.t + 0.2), y0: V_LOW, y1: m.burn.v + 0.25 }, {
    yLabel: 'v (m/s)', xTicks: 5, yTicks: 4,
    xFmt: (v) => v.toFixed(2), yFmt: (v) => v.toFixed(1),
  });

  /* 采样：从终点速度倒推时间，闭式解在 v 上更稳 */
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const v = m.vEnd + (m.burn.v - m.vEnd) * (i / 160);
    pts.push([CD.tAt(v, state.crr), v]);
  }
  area(ctx, s, pts, { color: accent(0.16), base: V_LOW });
  line(ctx, s, pts, { color: ACCENT, width: 3 });

  /* 烧完点与终点 */
  const x0 = s.sx(m.burn.t), y0 = s.sy(m.burn.v);
  K.dot(ctx, x0, y0, 5, PAPER, ACCENT);
  K.text(ctx, `${TEXT.burn} ${m.burn.v.toFixed(2)}`, x0 + 10, y0 - 12,
    { font: `500 13px ${MONO}`, color: PAPER });

  const x1 = s.sx(m.tEnd), y1 = s.sy(m.vEnd);
  ctx.save();
  ctx.strokeStyle = rgba(0.3);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + 0.5, box.y + box.h);
  ctx.lineTo(x1 + 0.5, y1);
  ctx.stroke();
  ctx.restore();
  K.dot(ctx, x1, y1, 5.5, PAPER, ACCENT);
  marker(ctx, s, m.tEnd, { label: `${TEXT.fin} ${m.vEnd.toFixed(2)}`, color: PAPER });

  K.label(ctx, TEXT.noStop, box.x, box.y + 22, { color: rgba(0.36), font: MONO12, spacing: 0 });
}

/* ---------- ② v–x 相图 ---------- */
function drawPhase(m) {
  const box = B2;
  K.label(ctx, TEXT.sec2, SAFE.x0, 856, { color: rgba(0.5) });
  K.label(ctx, TEXT.ax2, SAFE.x0 + 178, 856, { color: rgba(0.32), font: MONO12, spacing: 0 });
  K.label(ctx, `${m.coastLen.toFixed(2)} m ／ ${m.coastTime.toFixed(3)} s`, SAFE.x1, 856,
    { color: PAPER, align: 'right', font: `600 16px ${MONO}`, spacing: 0 });

  const s = frame(ctx, box, { x0: 0, x1: CD.X_END, y0: V_LOW, y1: m.burn.v + 0.25 }, {
    yLabel: 'v (m/s)', xTicks: 4, yTicks: 4,
    xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(1),
  });

  const real = [], dOnly = [], rOnly = [];
  for (let i = 0; i <= 120; i++) {
    const x = m.burn.x + (CD.X_END - m.burn.x) * (i / 120);
    real.push([x, CD.vAt(x, state.crr)]);
    dOnly.push([x, CD.onlyDrag(x)]);
    rOnly.push([x, CD.onlyRolling(x, state.crr)]);
  }

  area(ctx, s, real, { color: accent(0.14), base: V_LOW });
  line(ctx, s, rOnly, { color: rgba(0.3), width: 1.2, dashed: true });
  line(ctx, s, dOnly, { color: rgba(0.45), width: 1.2, dashed: true });
  line(ctx, s, real, { color: ACCENT, width: 3 });

  K.dot(ctx, s.sx(m.burn.x), s.sy(m.burn.v), 4.5, PAPER, ACCENT);
  K.dot(ctx, s.sx(CD.X_END), s.sy(m.vEnd), 5.5, PAPER, ACCENT);

  /* 图例：三条线挤在右上角 */
  const lx = box.x + box.w - 300, ly = box.y + 26;
  const items = [
    [TEXT.real, ACCENT, false],
    [TEXT.onlyDrag, rgba(0.45), true],
    [TEXT.onlyRoll, rgba(0.3), true],
  ];
  items.forEach(([name, col, dash], i) => {
    const yy = ly + i * 20;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    if (dash) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, yy);
    ctx.lineTo(lx + 22, yy);
    ctx.stroke();
    ctx.restore();
    K.label(ctx, name, lx + 30, yy + 4, { color: rgba(0.5), font: MONO12, spacing: 0 });
  });
}

/* ---------- ③ 份额 ---------- */
function drawShare(m) {
  const box = B3;
  K.label(ctx, TEXT.sec3, SAFE.x0, 1096, { color: rgba(0.5) });
  K.label(ctx, TEXT.ax3, SAFE.x0 + 178, 1096, { color: rgba(0.32), font: MONO12, spacing: 0 });
  K.label(ctx, `${TEXT.dragCap} ${(m.share0 * 100).toFixed(1)} % → ${(m.shareEnd * 100).toFixed(1)} %`,
    SAFE.x1, 1096, { color: PAPER, align: 'right', font: `600 16px ${MONO}`, spacing: 0 });

  const vMax = 19;
  const s = frame(ctx, box, { x0: 0, x1: vMax, y0: 0, y1: 100 }, {
    yLabel: '份额 (%)', xTicks: 5, yTicks: 4,
    xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0),
  });

  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const v = (vMax * i) / 160;
    pts.push([v, CD.dragShare(v, state.crr) * 100]);
  }
  area(ctx, s, pts, { color: accent(0.15) });
  line(ctx, s, pts, { color: ACCENT, width: 3 });
  line(ctx, s, [[0, 50], [vMax, 50]], { color: PAPER, width: 1.2, dashed: true });

  /* 50 % 交点 */
  const vinf = m.vinf;
  const px = s.sx(vinf), py = s.sy(50);
  K.dot(ctx, px, py, 5, PAPER, ACCENT);
  K.callout(ctx, px, py, px + 60, py + 46,
    `${TEXT.half} v = ${vinf.toFixed(2)} m/s`, { color: PAPER });

  /* 实际溜车区间 */
  const xa = s.sx(m.vEnd), xb = s.sx(m.burn.v);
  ctx.save();
  ctx.fillStyle = accent(0.28);
  ctx.fillRect(xa, box.y + 6, xb - xa, 6);
  ctx.restore();
  K.label(ctx, TEXT.coastBand, (xa + xb) / 2, box.y + 30,
    { color: rgba(0.6), align: 'center', font: MONO12, spacing: 0 });
}

/* ---------- 自检 ---------- */
function selfTest() {
  const checks = CD.assertions();
  const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} — ${c.detail}`);
  if (canvas.width !== W || canvas.height !== H) errs.push(`画布尺寸 ${canvas.width}×${canvas.height}`);
  if (!(B1.y > 564 && B1.y + B1.h < 856)) errs.push('第一张图压到页眉或第二张');
  if (!(B2.y + B2.h < 1096)) errs.push('第二张图压到第三张');
  if (!(B3.y + B3.h + 34 < 1350)) errs.push('第三张图压到参数条');
  if (!(B1.x - 70 >= SAFE.x0)) errs.push('纵轴标签压出安全区');
  if (!(B3.x + B3.w <= SAFE.x1 + 1)) errs.push('第三张图压出安全区右边');
  if (!(CD.vAt(CD.X_END, state.crr) > V_LOW)) errs.push('末速掉出纵轴范围');
  return { ok: errs.length === 0, errs, checks };
}

/* ---------- 对外钩子 ---------- */
window.__app = {
  canvas,
  canvasChars: CHARS,
  getState: () => ({ ...state }),
  getMetrics: () => {
    const m = CD.model(state);
    return {
      vBurn: m.burn.v, vEnd: m.vEnd, tEnd: m.tEnd, coastLen: m.coastLen,
      coastTime: m.coastTime, avgV: m.avgV, vinf: m.vinf,
      a: m.a, b: m.b, crr: m.crr, dEnd: m.dEnd,
      share0: m.share0, shareEnd: m.shareEnd, dvPct: m.dvPct,
      mEff: m.mEff, re0: m.re0, reEnd: m.reEnd,
    };
  },
  set: (k, v) => { if (k in state) { state[k] = v; compose(); } },
  reset: () => { Object.assign(state, CD.DEFAULT_STATE); compose(); },
  selfTest,
  model: (s) => CD.model(s ? { ...state, ...s } : state),
  assertions: () => CD.assertions(),
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
  downloadAll: () => exportEpisode(canvas, 'coast-decel'),
};

/* ---------- 面板接线 ---------- */
for (const key of Object.keys(CD.LIMITS)) {
  const el = document.getElementById('in-' + key);
  const out = document.getElementById('out-' + key);
  if (!el) continue;
  const L = CD.LIMITS[key];
  el.min = L.min; el.max = L.max; el.step = L.step; el.value = state[key];
  const fmt = (v) => (key === 'crr' ? v.toFixed(4) : v.toFixed(1) + L.unit);
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