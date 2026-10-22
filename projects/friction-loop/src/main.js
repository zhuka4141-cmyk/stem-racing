/* friction-loop · 前轮摩擦圆
   画布 1080×1920。这里只做可视化和交互，物理量全部来自 physics.js。

   版面（横向 60–930 是安全区，纵向 240–1480）：
     300–564   页眉：强调线 / 微标签 / 两行标题 / 副题
     596–938   ① 摩擦圆（左，圆心 292,790 半径 148）＋ 俯视示意（右列 522–930）
     944–990   合力与分量读数
     1016–1098 ② 摩擦圆使用率横条 + 刻度
     1130–1306 使用率随偏移变化的走向曲线
     1352–1400 三个读数
     1420–1460 页脚 */

import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import * as K from './plotkit.js';
import { frame, line, area, marker } from './plot.js';
import * as PH from './physics.js';
import { THRUST, REFERENCE } from './racing-core.js';

const { W, H, PAPER, ACCENT, MONO, SAFE, rgba, accent } = K;

/* 画在 canvas 上的全部中文。tests/fonts.mjs 读 canvasChars 做豆腐块检测，
   否则画布里的字永远走不到缺字检查。 */
const TEXT = {
  kicker: '前轮摩擦圆 ／ FRICTION-LOOP',
  t1: '前轮离侧滑',
  t2: '只差',
  mm: '毫米',
  sub: '纵向力和侧向力共用同一份摩擦，极限是一个圆，不是两条独立的线',
  sec1: '① 单个前轮接触斑',
  sec1r: 'FRICTION CIRCLE · Fx / Fy',
  capLabel: '摩擦圆 μ·N',
  fyAxis: '侧向力 Fy',
  fxAxis: '纵向力 Fx',
  rollLabel: '滚动阻力',
  top: '俯视 · 推力线相对质心',
  pin: '导轨销',
  com: '质心',
  yaw: '偏航力矩',
  exag: '横向放大',
  e1: '推力线偏出质心 d，产生偏航力矩 M = F·d',
  e2: '两个前轮用侧向摩擦顶住它，上限 μ·Nf·arm',
  e3: 'd 越过临界值，前轮抱不住，车头开始摆',
  sec2: '② 摩擦圆使用率',
  limit: '100 % 极限',
  curve: '使用率随质心偏移 d 的走向',
  dCap: '当前横向偏移',
  dCritCap: '临界偏移',
  marginCap: '剩余余量',
  sliding: '已侧滑',
  held: '还抱得住',
  magCap: '合力',
  foot: '轮轨摩擦系数取文献中值，赛前必须重测',
  sanity: '整跑',
  sanityOk: '参数组自洽',
  sanityBad: '参数组矛盾',
  derived: '推导量',
  typical: '文献中值',
};

const CHARS = Object.values(TEXT).join('');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

const state = { ...PH.DEFAULT_STATE };

/* ---------- 几何 ---------- */
const C = { x: 292, y: 790, r: 148 };                   // 摩擦圆
const SCH = { x0: 522, x1: 930, cy: 700, halfW: 24 };   // 俯视示意
const BAR = { x0: 60, x1: 930, y: 1046, h: 26, max: 200 };
const CH = { x: 150, y: 1116, w: 780, h: 144 };         // 走向曲线绘图区

/* ---------- 主绘制 ---------- */
function compose() {
  const m = PH.model(state);
  const run = PH.runResult();

  K.backdrop(ctx);

  /* --- 页眉 --- */
  K.accentRule(ctx, SAFE.x0, 300);
  K.kicker(ctx, TEXT.kicker, 334);
  K.title(ctx, [TEXT.t1, TEXT.t2 + ' ' + m.dCrit.toFixed(3) + ' ' + TEXT.mm], 410, { size: 58, lead: 68 });
  K.sub(ctx, TEXT.sub, 536);
  K.hairline(ctx, 564);

  /* --- ① 摩擦圆 --- */
  K.label(ctx, TEXT.sec1, SAFE.x0, 596, { color: rgba(0.5) });
  K.label(ctx, TEXT.sec1r, SAFE.x1, 596, { color: rgba(0.32), align: 'right' });
  drawCircle(m);

  /* --- 右侧俯视示意 --- */
  K.label(ctx, TEXT.top, SCH.x0, 640, { color: rgba(0.5) });
  drawSchematic(m);

  K.text(ctx, TEXT.e1, SCH.x0, 790, { font: `400 15px ${MONO}`, color: rgba(0.62) });
  K.text(ctx, TEXT.e2, SCH.x0, 816, { font: `400 15px ${MONO}`, color: rgba(0.62) });
  K.text(ctx, TEXT.e3, SCH.x0, 842, { font: `400 15px ${MONO}`, color: m.slipping ? ACCENT : rgba(0.62) });

  K.text(ctx, `M = ${(m.moment * 1000).toFixed(3)} mN·m`, SCH.x0, 884,
    { font: `600 21px ${MONO}`, color: PAPER });
  K.label(ctx, `M_lim = ${(m.momentLimit * 1000).toFixed(3)} mN·m`, SCH.x0 + 250, 884,
    { color: rgba(0.45), font: `400 15px ${MONO}`, spacing: 0 });
  K.label(ctx, `d / d_crit = ${m.dRatio.toFixed(3)}`, SCH.x0, 914,
    { color: m.slipping ? ACCENT : rgba(0.55), font: `500 15px ${MONO}`, spacing: 0 });

  /* --- 合力与参数条 --- */
  K.label(ctx, `${TEXT.magCap} |F| = ${(m.mag * 1000).toFixed(2)} mN`, SAFE.x0, 968,
    { color: m.slipping ? ACCENT : rgba(0.7), font: `500 16px ${MONO}`, spacing: 0 });
  K.label(ctx, `d / d_crit = ${m.dRatio.toFixed(3)}`, SAFE.x1, 968,
    { color: m.slipping ? ACCENT : rgba(0.6), font: `500 16px ${MONO}`, spacing: 0, align: 'right' });
  K.label(ctx, `Fy ${(m.fy * 1000).toFixed(2)}   Fx ${(m.fx * 1000).toFixed(2)}   μN ${(m.cap * 1000).toFixed(2)}   (mN)`,
    SAFE.x0, 990, { color: rgba(0.45), font: `400 15px ${MONO}`, spacing: 0 });
  K.label(ctx, `Nf ${m.Nf.toFixed(3)} N   Nw ${m.Nw.toFixed(3)} N   arm ${(m.p.armPin * 1000).toFixed(1)} mm`,
    SAFE.x1, 990, { color: rgba(0.45), font: `400 15px ${MONO}`, spacing: 0, align: 'right' });

  /* --- ② 使用率 --- */
  K.label(ctx, TEXT.sec2, SAFE.x0, 1016, { color: rgba(0.5) });
  K.bigNum(ctx, (m.usage * 100).toFixed(1) + ' %', SAFE.x1, 1026,
    { size: 42, color: m.slipping ? ACCENT : PAPER, align: 'right' });
  drawBar(m);
  drawCurve(m);

  /* --- 三个读数 --- */
  K.hairline(ctx, 1322);
  K.readout(ctx, {
    x: SAFE.x0, y: 1358, value: state.d.toFixed(3), unit: 'mm',
    caption: TEXT.dCap, status: TEXT.typical, color: PAPER, size: 40,
  });
  K.readout(ctx, {
    x: 348, y: 1358, value: m.dCrit.toFixed(3), unit: 'mm',
    caption: TEXT.dCritCap, status: TEXT.derived, color: ACCENT, size: 40,
  });
  K.readout(ctx, {
    x: 664, y: 1358, value: (m.margin * 100).toFixed(1), unit: '%',
    caption: TEXT.marginCap, status: m.slipping ? TEXT.sliding : TEXT.held,
    color: m.slipping ? ACCENT : PAPER, size: 40,
  });

  /* --- 页脚 --- */
  K.hairline(ctx, 1420);
  K.label(ctx, TEXT.foot, SAFE.x0, 1448, { color: rgba(0.42) });
  K.label(ctx, `${TEXT.sanity} ${run.run.t.toFixed(4)} s · ${run.ok ? TEXT.sanityOk : TEXT.sanityBad}`,
    SAFE.x1, 1448, { color: run.ok ? rgba(0.42) : ACCENT, align: 'right' });
}

/* ---------- 摩擦圆 ---------- */
function drawCircle(m) {
  const s = C.r / m.cap;   // px per N

  /* 圆盘底色：把「圆的内部就是可用摩擦」这句话画出来，不是装饰 */
  ctx.save();
  ctx.fillStyle = rgba(0.062);
  ctx.beginPath();
  ctx.arc(C.x, C.y, C.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* 坐标轴 */
  ctx.save();
  ctx.strokeStyle = rgba(0.24);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(C.x - C.r - 26, C.y + 0.5); ctx.lineTo(C.x + C.r + 26, C.y + 0.5);
  ctx.moveTo(C.x + 0.5, C.y - C.r - 26); ctx.lineTo(C.x + 0.5, C.y + C.r + 26);
  ctx.stroke();
  ctx.restore();

  /* 25 / 50 / 75 % 参考圈 */
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.save();
    ctx.strokeStyle = rgba(0.13);
    ctx.setLineDash([3, 7]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(C.x, C.y, C.r * f, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* 极限圆 */
  ctx.save();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(C.x, C.y, C.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  /* 扇形：从纵轴到当前合力方向张开的量 */
  const theta = Math.atan2(m.fy, m.fx);
  if (Math.abs(theta) > 1e-4) {
    ctx.save();
    ctx.fillStyle = accent(m.slipping ? 0.30 : 0.15);
    ctx.beginPath();
    ctx.moveTo(C.x, C.y);
    ctx.arc(C.x, C.y, C.r, 0, -theta, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const px = C.x + m.fx * s;
  const py = C.y - m.fy * s;

  /* 分量虚线 */
  ctx.save();
  ctx.strokeStyle = rgba(0.25);
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py); ctx.lineTo(px, C.y);
  ctx.moveTo(px, py); ctx.lineTo(C.x, py);
  ctx.stroke();
  ctx.restore();

  K.arrow(ctx, C.x, C.y, px, py, { color: ACCENT, width: 3, head: 14 });
  K.dot(ctx, px, py, 5, ACCENT);
  if (m.slipping) {
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* 极限圆引出标注 */
  const ra = -Math.PI / 4;
  K.callout(ctx,
    C.x + Math.cos(ra) * C.r, C.y + Math.sin(ra) * C.r,
    C.x + Math.cos(ra) * C.r - 40, C.y + Math.sin(ra) * C.r + 34,
    `${TEXT.capLabel} = ${(m.cap * 1000).toFixed(2)} mN`,
    { align: 'right', color: rgba(0.62) });

  K.text(ctx, TEXT.fyAxis, C.x, C.y - C.r - 36, { font: `500 15px ${MONO}`, color: rgba(0.55), align: 'center' });
  K.text(ctx, TEXT.fxAxis, C.x + C.r + 30, C.y + 6, { font: `500 15px ${MONO}`, color: rgba(0.55) });

  K.text(ctx, '0', C.x - 10, C.y + 22, { font: `400 13px ${MONO}`, color: rgba(0.38), align: 'right' });
  K.text(ctx, `+${(m.cap * 1000).toFixed(1)}`, C.x + C.r, C.y + 22,
    { font: `400 13px ${MONO}`, color: rgba(0.38), align: 'center' });
  K.text(ctx, `+${(m.cap * 1000).toFixed(1)}`, C.x - 10, C.y - C.r + 6,
    { font: `400 13px ${MONO}`, color: rgba(0.38), align: 'right' });
  K.label(ctx, 'mN', C.x + C.r + 30, C.y + 26, { color: rgba(0.3), font: `400 13px ${MONO}`, spacing: 0 });

  /* 滚动阻力：几乎贴着横轴那一点点 */
  K.callout(ctx, C.x + m.fx * s, C.y - 3, C.x + 66, C.y + 104,
    `${TEXT.rollLabel} ${(m.roll * 1000).toFixed(2)} mN`, { color: rgba(0.5) });
}

/* ---------- 俯视示意 ---------- */
function drawSchematic(m) {
  const x0 = SCH.x0, x1 = SCH.x1, cy = SCH.cy;
  const scaleX = (x1 - x0) / 0.200;     // px per m（纵向按真实比例）
  const scaleY = 22;                    // px per mm（横向放大）
  const exag = (scaleY * 1000) / scaleX;

  /* 导轨中线 */
  ctx.save();
  ctx.strokeStyle = accent(0.55);
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 - 8, cy + 0.5);
  ctx.lineTo(x1 + 8, cy + 0.5);
  ctx.stroke();
  ctx.restore();

  /* 车身俯视轮廓 */
  ctx.save();
  ctx.fillStyle = rgba(0.09);
  ctx.strokeStyle = rgba(0.5);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x0, cy - SCH.halfW, x1 - x0, SCH.halfW * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  /* 导轨销 */
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(x0 + 12, cy - 4, 8, 8);
  ctx.restore();
  K.text(ctx, TEXT.pin, x0 + 8, cy - SCH.halfW - 10, { font: `400 12px ${MONO}`, color: rgba(0.45) });

  /* 行驶方向 */
  K.arrow(ctx, x1 - 140, cy, x1 - 20, cy, { color: accent(0.55), width: 2, head: 11 });

  /* 质心横向偏移 */
  const comX = x0 + (x1 - x0) * m.p.comFrac;
  const dy = K.clamp(state.d * scaleY, -70, 70);
  const comY = cy + dy;

  ctx.save();
  ctx.strokeStyle = rgba(0.3);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(comX + 0.5, cy);
  ctx.lineTo(comX + 0.5, comY);
  ctx.stroke();
  ctx.restore();

  if (Math.abs(dy) > 2) {
    ctx.save();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(comX + 46, cy); ctx.lineTo(comX + 46, comY);
    ctx.moveTo(comX + 40, cy + 0.5); ctx.lineTo(comX + 52, cy + 0.5);
    ctx.moveTo(comX + 40, comY + 0.5); ctx.lineTo(comX + 52, comY + 0.5);
    ctx.stroke();
    ctx.restore();
    K.text(ctx, `${TEXT.com} ${state.d.toFixed(3)} mm`, comX + 58, (cy + comY) / 2 + (dy >= 0 ? 18 : -8),
      { font: `500 13px ${MONO}`, color: PAPER });
  }

  /* 质心十字 */
  ctx.save();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(comX - 9, comY); ctx.lineTo(comX + 9, comY);
  ctx.moveTo(comX, comY - 9); ctx.lineTo(comX, comY + 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(comX, comY, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  /* 偏航方向 */
  ctx.save();
  ctx.strokeStyle = accent(0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0 + 30, cy, 34, -1.95, -0.34);
  ctx.stroke();
  ctx.restore();
  const ea = -0.34;
  K.arrow(ctx, x0 + 30 + Math.cos(ea) * 34, cy + Math.sin(ea) * 34,
    x0 + 30 + Math.cos(ea) * 46, cy + Math.sin(ea) * 46,
    { color: accent(0.85), width: 2, head: 9 });
  K.text(ctx, TEXT.yaw, x0 + 2, cy + 62, { font: `400 12px ${MONO}`, color: rgba(0.45) });

  K.label(ctx, `${TEXT.exag} ${exag.toFixed(1)}×`, SCH.x1, cy + SCH.halfW + 24,
    { color: rgba(0.34), align: 'right', font: `400 12px ${MONO}`, spacing: 0 });
}

/* ---------- 使用率横条 ---------- */
function drawBar(m) {
  const { x0, x1, y, h, max } = BAR;
  const px = (pct) => x0 + (Math.min(pct, max) / max) * (x1 - x0);

  ctx.save();
  ctx.fillStyle = rgba(0.07);
  ctx.fillRect(x0, y, x1 - x0, h);
  if (m.usage > 0.002) {
    ctx.fillStyle = m.slipping ? ACCENT : accent(0.85);
    ctx.fillRect(x0, y, (Math.min(m.usage * 100, max) / max) * (x1 - x0), h);
  }
  ctx.restore();

  /* 100 % 极限线 */
  ctx.save();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px(100) + 0.5, y - 14);
  ctx.lineTo(px(100) + 0.5, y + h + 12);
  ctx.stroke();
  ctx.restore();
  K.label(ctx, TEXT.limit, px(100) + 8, y - 18, { color: PAPER, font: `500 13px ${MONO}`, spacing: 0 });

  /* 刻度 */
  for (let pct = 0; pct <= max; pct += 25) {
    const x = px(pct);
    ctx.save();
    ctx.strokeStyle = rgba(0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h);
    ctx.lineTo(x + 0.5, y + h + 6);
    ctx.stroke();
    ctx.restore();
    K.text(ctx, String(pct), x, y + h + 26,
      { font: `400 13px ${MONO}`, color: rgba(0.38), align: pct === 0 ? 'left' : 'center' });
  }

  /* 当前值指针 */
  const xNow = px(m.usage * 100);
  ctx.save();
  ctx.fillStyle = m.slipping ? ACCENT : PAPER;
  ctx.beginPath();
  ctx.moveTo(xNow, y - 3);
  ctx.lineTo(xNow - 6, y - 13);
  ctx.lineTo(xNow + 6, y - 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------- 使用率随 d 的走向 ---------- */
function drawCurve(m) {
  const box = CH;
  const dMax = PH.LIMITS.d.max;
  const s = frame(ctx, box, { x0: 0, x1: dMax, y0: 0, y1: 220 }, {
    xLabel: '质心横向偏移 d (mm)',
    yLabel: '使用率 (%)',
    xTicks: 6,
    yTicks: 4,
    xFmt: (v) => v.toFixed(1),
    yFmt: (v) => v.toFixed(0),
  });

  /* 每个 x 采样一次模型 */
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const d = (dMax * i) / 120;
    pts.push([d, PH.model({ d, toe: state.toe, mu: state.mu }).usage * 100]);
  }

  area(ctx, s, pts, { color: accent(m.slipping ? 0.24 : 0.15) });
  line(ctx, s, pts, { color: ACCENT, width: 3 });

  /* 100 % 极限线 */
  line(ctx, s, [[0, 100], [dMax, 100]], { color: PAPER, width: 1.5, dashed: true });
  K.label(ctx, TEXT.limit, box.x + box.w - 4, s.sy(100) - 8,
    { color: rgba(0.6), align: 'right', font: `500 13px ${MONO}`, spacing: 0 });

  /* 当前点 */
  const cx = s.sx(state.d);
  const cy = s.sy(m.usage * 100);
  ctx.save();
  ctx.strokeStyle = rgba(0.32);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, box.y + box.h);
  ctx.lineTo(cx + 0.5, cy);
  ctx.lineTo(box.x, cy);
  ctx.stroke();
  ctx.restore();
  K.dot(ctx, cx, cy, 5.5, m.slipping ? ACCENT : PAPER, m.slipping ? ACCENT : null);

  K.label(ctx, TEXT.curve, box.x, box.y - 22, { color: rgba(0.5), spacing: 1.4 });
  K.label(ctx, (m.usage * 100).toFixed(1) + ' %', box.x + box.w, box.y - 22,
    { color: m.slipping ? ACCENT : PAPER, align: 'right', font: `600 15px ${MONO}`, spacing: 0 });
}

/* ---------- 自检 ---------- */
function selfTest() {
  const checks = PH.assertions();
  const errs = checks.filter((c) => !c.ok).map((c) => `${c.name} — ${c.detail}`);
  if (canvas.width !== W || canvas.height !== H) errs.push(`画布尺寸 ${canvas.width}×${canvas.height}`);
  if (!(C.y - C.r > 600)) errs.push('摩擦圆压到页眉');
  if (!(C.y + C.r < 1000)) errs.push('摩擦圆压到使用率区');
  if (!(C.x - C.r >= SAFE.x0)) errs.push('摩擦圆压出安全区左边');
  if (!(BAR.y + BAR.h < CH.y - 30)) errs.push('横条压到曲线区');
  if (!(CH.y + CH.h + 50 < 1358 - 40)) errs.push('曲线压到读数区');
  const m = PH.model(state);
  if (!(Math.abs(m.usage - Math.hypot(m.fx, m.fy) / m.cap) < 1e-12)) errs.push('使用率与合力不自洽');
  if (!(Math.abs(m.dCrit - PH.model({ d: 0.3, toe: 0, mu: state.mu }).dCrit) < 1e-12)) errs.push('临界偏移随 d 漂移');
  return { ok: errs.length === 0, errs, checks };
}

/* ---------- 对外钩子 ---------- */
window.__app = {
  canvas,
  canvasChars: CHARS,
  getState: () => ({ ...state }),
  getMetrics: () => {
    const m = PH.model(state);
    const run = PH.runResult();
    return {
      usage: m.usage, mag: m.mag, cap: m.cap, fy: m.fy, fx: m.fx,
      dCrit: m.dCrit, moment: m.moment, momentLimit: m.momentLimit,
      margin: m.margin, slipping: m.slipping,
      tTotal: run.run.t, vExit: run.run.v, effMass: REFERENCE.effMass,
      bandOk: run.ok, thrust: THRUST.Fpeak, tBurn: THRUST.tBurn,
    };
  },
  set: (k, v) => { if (k in state) { state[k] = v; compose(); } },
  reset: () => { Object.assign(state, PH.DEFAULT_STATE); compose(); },
  selfTest,
  model: (s) => PH.model(s ? { ...state, ...s } : state),
  assertions: () => PH.assertions(),
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
  downloadAll: () => exportEpisode(canvas, 'friction-loop'),
};

/* ---------- 面板接线 ---------- */
for (const key of Object.keys(PH.LIMITS)) {
  const el = document.getElementById('in-' + key);
  const out = document.getElementById('out-' + key);
  if (!el) continue;
  const L = PH.LIMITS[key];
  el.min = L.min; el.max = L.max; el.step = L.step; el.value = state[key];
  const sync = () => {
    state[key] = parseFloat(el.value);
    if (out) out.textContent = state[key].toFixed(3) + L.unit;
    compose();
  };
  el.addEventListener('input', sync);
  if (out) out.textContent = state[key].toFixed(3) + L.unit;
}

const btn = document.getElementById('export');
if (btn) btn.addEventListener('click', () => {
  window.__app.downloadAll().catch((e) => console.error(e));
});

compose();
