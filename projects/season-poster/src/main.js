/* 赛季成绩单 —— 1080×1920 海报
   数据全在下面的 SEASON 常量里，改这一个常量就换赛季，代码不用动。
   图上的结论（首末差、降幅、拟合斜率、最快最慢）都是从这里现算的，
   没有一个写死 —— 改完数据，结论会跟着变，selfTest 会拦住自相矛盾的情况。 */
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import {
  createArtboard, frame, esc, fx, hatch, rasterize,
  INK, PAPER, ACCENT, ACCENT_DIM, MUTE, MUTE2, MONO, DISP,
} from './svg-artboard.js';

const W = 1080, H = 1920;
const X0 = 72, X1 = 1008, CW = X1 - X0;

/* ======== 赛季数据：要换赛季就改这里 ========
   t 该站最好一轮（秒）；rank/field 该站名次与参赛队数；
   mass 整车质量 g；cg 质心高 mm；align 前后轮对齐偏差 ° */
const SEASON = {
  team: '长风 CZ-3',
  label: '2025 赛季',
  track: 20.0,
  events: [
    { d: '2025-03-15', name: '校内试跑', t: 1.284, rank: 14, field: 24, mass: 58.4, cg: 24.8, align: 0.40 },
    { d: '2025-04-12', name: '区预选', t: 1.271, rank: 11, field: 24, mass: 58.2, cg: 24.6, align: 0.38 },
    { d: '2025-05-10', name: '区决赛', t: 1.243, rank: 8, field: 24, mass: 57.9, cg: 24.1, align: 0.33 },
    { d: '2025-06-14', name: '市预选', t: 1.228, rank: 6, field: 32, mass: 57.6, cg: 23.8, align: 0.31 },
    { d: '2025-06-28', name: '市决赛', t: 1.196, rank: 4, field: 32, mass: 57.1, cg: 23.2, align: 0.26 },
    { d: '2025-09-20', name: '省预选', t: 1.152, rank: 3, field: 40, mass: 56.4, cg: 22.6, align: 0.22 },
    { d: '2025-10-18', name: '省决赛', t: 1.121, rank: 2, field: 40, mass: 55.2, cg: 21.9, align: 0.15 },
    { d: '2025-11-08', name: '全国总决赛', t: 1.096, rank: 1, field: 48, mass: 54.1, cg: 21.4, align: 0.10 },
  ],
};

/* ---------- 派生量 ---------- */
const E = SEASON.events;
const N = E.length;
const times = E.map((e) => e.t);
const best = Math.min(...times);
const worst = Math.max(...times);
const first = times[0], last = times[N - 1];
const delta = last - first;
const pct = (delta / first) * 100;
const fit = (() => {
  const mi = (N - 1) / 2;
  const mt = times.reduce((a, b) => a + b, 0) / N;
  let num = 0, den = 0;
  for (let i = 0; i < N; i++) { num += (i - mi) * (times[i] - mt); den += (i - mi) ** 2; }
  const b = num / den;
  return { b, a: mt - b * mi };
})();
const speed = (t) => SEASON.track / t;
const sgn = (v) => (v > 0 ? '+' : '−');

/* ---------- 画布几何 ---------- */
const PLOT = { x0: 176, x1: 968, y0: 530, y1: 1064 };
const LO = 1.07, HI = 1.306;
const px = (i) => PLOT.x0 + (i * (PLOT.x1 - PLOT.x0)) / (N - 1);
const py = (t) => PLOT.y1 - ((t - LO) / (HI - LO)) * (PLOT.y1 - PLOT.y0);

/* ---------- 排版小工具 ---------- */
let drawn = [], items = [];
const T = (s) => { drawn.push(String(s)); return esc(s); };
function txt(x, y, s, o = {}) {
  const { size = 13, font = MONO, fill = PAPER, weight = 400, anchor = 'start', ls = 0, op = 1 } = o;
  items.push({ s: String(s), x, y, size, font, weight, anchor, ls });
  return `<text x="${x}" y="${y}" font-family='${font}' font-size="${size}" font-weight="${weight}"`
    + ` letter-spacing="${ls}" fill="${fill}"${op !== 1 ? ` fill-opacity="${op}"` : ''}`
    + `${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${T(s)}</text>`;
}
const ln = (x1, y1, x2, y2, o = {}) => {
  const { stroke = MUTE2, w = 1, dash = null, op = 1 } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"`
    + `${dash ? ` stroke-dasharray="${dash}"` : ''}${op !== 1 ? ` stroke-opacity="${op}"` : ''}/>`;
};
const rect = (x, y, w, h, o = {}) => {
  const { fill = 'none', stroke = 'none', sw = 1, op = 1, fillOp = 1 } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"`
    + ` stroke-width="${sw}"${op !== 1 ? ` stroke-opacity="${op}"` : ''}${fillOp !== 1 ? ` fill-opacity="${fillOp}"` : ''}/>`;
};
/* 箭头画成几何，不依赖字体里有没有 → 字形 */
const arrowR = (xa, xb, y, color = MUTE, w = 1.4) =>
  ln(xa, y, xb - 9, y, { stroke: color, w, op: 0.9 })
  + `<polygon points="${xb},${y} ${xb - 12},${y - 5} ${xb - 12},${y + 5}" fill="${color}" fill-opacity=".9"/>`;
/* 图例：线段样板 + 说明文字 */
const legend = (x, y, kind, label, color = MUTE) => {
  const sw = 26;
  const mk = kind === 'solid'
    ? `<line x1="${x}" y1="${y}" x2="${x + sw}" y2="${y}" stroke="${color}" stroke-width="2.6"/>`
    : `<line x1="${x}" y1="${y}" x2="${x + sw}" y2="${y}" stroke="${color}" stroke-width="1.8" stroke-dasharray="${kind === 'accent' ? '10 5' : '14 6'}"/>`;
  return mk + txt(x + sw + 10, y + 4, label, { size: 11, fill: color === MUTE ? MUTE2 : color, ls: 0.4 });
};

/* ---------- 主排版 ---------- */
function build(opt = {}) {
  drawn = []; items = [];
  const { fitLine = true, values = true } = opt;
  const p = [];

  p.push(`<defs>${hatch('hzArea', { step: 7, width: 1.2, color: 'rgba(242,240,235,0.20)' })}</defs>`);

  /* 抬头 */
  p.push(txt(X0, 96, `${SEASON.label}  ·  ${SEASON.team}`, { size: 12, fill: ACCENT, weight: 700, ls: 3 }));
  p.push(txt(X0, 174, '赛季成绩单', { size: 68, font: DISP, weight: 700, fill: PAPER, ls: 2 }));
  p.push(txt(X1, 128, E[0].d, { size: 13, fill: MUTE, anchor: 'end', ls: 1 }));
  p.push(txt(X1, 150, `至 ${E[N - 1].d}`, { size: 13, fill: MUTE, anchor: 'end', ls: 1 }));
  p.push(txt(X1, 184, `${N} 站 · ${N * 2} 轮`, { size: 12, fill: MUTE2, anchor: 'end', ls: 1.4 }));
  p.push(ln(X0, 200, X1, 200, { stroke: PAPER, w: 2.4, op: 0.85 }));

  /* 头条：首站 → 末站 */
  p.push(txt(X0, 240, '最好一轮 · 首站与末站', { size: 11, fill: MUTE2, ls: 2 }));
  p.push(txt(X0, 330, fx(first, 3), { size: 58, fill: PAPER, weight: 700, ls: -1, op: 0.62 }));
  p.push(arrowR(276, 348, 310, ACCENT, 2));
  p.push(txt(364, 330, fx(last, 3), { size: 58, fill: ACCENT, weight: 700, ls: -1 }));
  p.push(txt(X0 + 6, 362, `${E[0].name} · 第 ${E[0].rank} 名`, { size: 12, fill: MUTE2 }));
  p.push(txt(370, 362, `${E[N - 1].name} · 第 ${E[N - 1].rank} 名`, { size: 12, fill: ACCENT, op: 0.85 }));

  p.push(ln(672, 252, 672, 452, { stroke: PAPER, w: 1, op: 0.22 }));
  p.push(txt(704, 274, '整个赛季', { size: 11, fill: MUTE2, ls: 2 }));
  p.push(txt(704, 330, `${sgn(delta)}${fx(Math.abs(delta), 3)}`, { size: 46, fill: ACCENT, weight: 700, ls: -1 }));
  p.push(txt(704, 352, '秒', { size: 13, fill: MUTE }));
  p.push(txt(704, 400, `${sgn(pct)}${fx(Math.abs(pct), 1)}`, { size: 38, fill: PAPER, weight: 600, ls: -1 }));
  p.push(txt(704, 422, '%  用时降幅', { size: 12, fill: MUTE }));
  p.push(txt(X0, 402, `20 m 平均 ${fx(speed(first), 2)} m/s → ${fx(speed(last), 2)} m/s`, { size: 12, fill: MUTE }));
  p.push(txt(X0, 426, '平均速度 = 20 m ÷ 用时，把加速段和末段一起抹平了。', { size: 11, fill: MUTE2 }));
  p.push(ln(X0, 452, X1, 452, { stroke: PAPER, w: 1, op: 0.22 }));

  /* 曲线 */
  p.push(txt(X0, 470, '逐站最好成绩  BEST RUN PER EVENT', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(X1, 470, `出口速度 ${fx(speed(first), 2)} → ${fx(speed(last), 2)} m/s`, { size: 11, fill: MUTE2, anchor: 'end', ls: 0.6 }));

  for (const tv of [1.10, 1.15, 1.20, 1.25, 1.30]) {
    const y = py(tv);
    p.push(ln(PLOT.x0 - 14, y, PLOT.x1, y, { stroke: PAPER, w: 0.9, dash: '6 6', op: 0.16 }));
    p.push(txt(PLOT.x0 - 26, y + 4, fx(tv, 2), { size: 11, fill: MUTE2, anchor: 'end' }));
  }
  p.push(txt(PLOT.x0 - 26, PLOT.y0 - 14, '秒', { size: 10, fill: MUTE2, anchor: 'end' }));
  p.push(legend(PLOT.x0, 508, 'solid', '逐站最好一轮'));
  p.push(legend(PLOT.x0 + 124, 508, 'dash', '线性拟合'));
  p.push(legend(PLOT.x0 + 256, 508, 'accent', '赛季最好成绩', ACCENT));

  const areaD = `M${px(0).toFixed(1)} ${PLOT.y1}`
    + E.map((e, i) => ` L${px(i).toFixed(1)} ${py(e.t).toFixed(1)}`).join('')
    + ` L${px(N - 1).toFixed(1)} ${PLOT.y1} Z`;
  p.push(`<path d="${areaD}" fill="${PAPER}" fill-opacity="0.075"/>`);
  p.push(`<path d="${areaD}" fill="url(#hzArea)"/>`);
  p.push(ln(PLOT.x0 - 14, PLOT.y1, PLOT.x1, PLOT.y1, { stroke: PAPER, w: 1.4, op: 0.5 }));

  const by = py(best);
  p.push(ln(PLOT.x0 - 14, by, PLOT.x1, by, { stroke: ACCENT, w: 1.2, dash: '10 5', op: 0.7 }));
  p.push(txt(PLOT.x0 - 26, by + 4, fx(best, 3), { size: 11, fill: ACCENT, anchor: 'end', weight: 600 }));

  E.forEach((e, i) => p.push(ln(px(i), py(e.t), px(i), PLOT.y1, { stroke: PAPER, w: 1, op: 0.14 })));

  if (fitLine) {
    p.push(ln(px(0), py(fit.a), px(N - 1), py(fit.a + fit.b * (N - 1)), { stroke: ACCENT_DIM, w: 1.8, dash: '14 6', op: 0.85 }));
    p.push(txt(X1, 508, `拟合 ${sgn(fit.b)}${fx(Math.abs(fit.b), 4)} s/站`, { size: 11, fill: ACCENT_DIM, anchor: 'end', ls: 0.4 }));
  }

  p.push(`<polyline points="${E.map((e, i) => `${px(i).toFixed(1)},${py(e.t).toFixed(1)}`).join(' ')}"`
    + ` fill="none" stroke="${PAPER}" stroke-width="2.6" stroke-linejoin="miter" stroke-linecap="butt"/>`);

  E.forEach((e, i) => {
    const cx = px(i), cy = py(e.t);
    const isBest = e.t === best;
    p.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isBest ? 7 : 4.4}"`
      + ` fill="${isBest ? ACCENT : INK}" stroke="${isBest ? ACCENT : PAPER}" stroke-width="${isBest ? 2 : 1.8}"/>`);
    if (values) {
      p.push(txt(cx, cy - (isBest ? 18 : 14), fx(e.t, 3), {
        size: isBest ? 14 : 12.5, fill: isBest ? ACCENT : PAPER,
        anchor: 'middle', weight: isBest ? 700 : 500, op: isBest ? 1 : 0.9,
      }));
    }
  });

  E.forEach((e, i) => {
    const cx = px(i);
    p.push(ln(cx, PLOT.y1 + 6, cx, PLOT.y1 + 12, { stroke: PAPER, w: 1, op: 0.32 }));
    p.push(txt(cx, PLOT.y1 + 32, `${e.d.slice(5, 7)}月`, { size: 11, fill: MUTE2, anchor: 'middle' }));
    p.push(txt(cx, PLOT.y1 + 52, e.name, { size: 12.5, fill: PAPER, anchor: 'middle', op: 0.86 }));
    p.push(txt(cx, PLOT.y1 + 72, `${e.rank}/${e.field}`, {
      size: 11, fill: i === N - 1 ? ACCENT : MUTE2, anchor: 'middle', weight: i === N - 1 ? 600 : 400,
    }));
  });
  p.push(txt(X1, PLOT.y1 + 86, '名次/参赛队数', { size: 9.5, fill: MUTE2, anchor: 'end', ls: 0.6 }));
  p.push(ln(X0, PLOT.y1 + 94, X1, PLOT.y1 + 94, { stroke: PAPER, w: 1, op: 0.22 }));

  /* 三个辅助指标 */
  const spark = (vals, x0, y0, w, h) => {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const sx = (i) => x0 + (i * (w - 10)) / (N - 1);
    const sy = (v) => y0 + h - (hi === lo ? h / 2 : ((v - lo) / (hi - lo)) * h);
    const o = [];
    o.push(ln(x0, y0 + h, x0 + w, y0 + h, { stroke: PAPER, w: 1, op: 0.18 }));
    vals.forEach((v, i) => o.push(ln(sx(i), sy(v), sx(i), y0 + h, { stroke: PAPER, w: 1, op: 0.1 })));
    o.push(`<polyline points="${vals.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')}"`
      + ` fill="none" stroke="${PAPER}" stroke-width="2" stroke-opacity=".85"/>`);
    vals.forEach((v, i) => o.push(`<circle cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.6" fill="${i === N - 1 ? ACCENT : MUTE}"/>`));
    return o.join('');
  };

  const groups = [
    { k: 'mass', label: '整车质量', unit: 'g' },
    { k: 'cg', label: '质心高', unit: 'mm' },
    { k: 'align', label: '前后轮对齐偏差', unit: '°' },
  ];
  const colW = (CW - 2 * 32) / 3;
  p.push(txt(X0, 1186, '同时改的三件事', { size: 11, fill: MUTE2, ls: 2 }));
  groups.forEach((g, gi) => {
    const cx0 = X0 + gi * (colW + 32);
    const vals = E.map((e) => e[g.k]);
    const dp = g.k === 'align' ? 2 : 1;
    p.push(txt(cx0, 1222, `${g.label} / ${g.unit}`, { size: 11, fill: MUTE, ls: 0.6 }));
    p.push(txt(cx0, 1264, fx(vals[0], dp), { size: 21, fill: MUTE2, weight: 500 }));
    p.push(arrowR(cx0 + 64, cx0 + 102, 1257, MUTE2, 1.2));
    p.push(txt(cx0 + 114, 1264, fx(vals[N - 1], dp), { size: 29, fill: PAPER, weight: 700, ls: -0.5 }));
    p.push(spark(vals, cx0, 1290, colW - 8, 70));
    const dv = vals[N - 1] - vals[0];
    p.push(txt(cx0, 1386, `${sgn(dv)}${fx(Math.abs(dv), dp)} ${g.unit}`, { size: 12, fill: ACCENT, weight: 500 }));
    if (gi < 2) p.push(ln(cx0 + colW + 8, 1206, cx0 + colW + 8, 1394, { stroke: PAPER, w: 1, op: 0.14 }));
  });

  /* 口径与页脚 */
  p.push(ln(X0, 1418, X1, 1418, { stroke: PAPER, w: 1, op: 0.22 }));
  p.push(txt(X0, 1452, '口径', { size: 11, fill: MUTE2, ls: 2 }));
  const notes = [
    `每站跑 2 轮取最好一轮；首站 ${E[0].d}，末站 ${E[N - 1].d}，共 ${N} 站。`,
    '用时降幅按 (末站 − 首站) ÷ 首站 算，不是平均值的差。',
    `拟合线是过这 ${N} 个成绩的最小二乘直线，只看趋势，不预测后面能跑多少。`,
    `出口速度按 ${fx(SEASON.track, 1)} m 轨道 ÷ 用时 粗算，忽略了加速过程，比真实出闸速度偏高。`,
  ];
  notes.forEach((n, i) => p.push(txt(X0, 1484 + i * 26, n, { size: 12, fill: MUTE })));

  p.push(ln(X0, 1600, X1, 1600, { stroke: PAPER, w: 2, op: 0.5 }));
  p.push(txt(X0, 1642, `最快 ${fx(best, 3)} s`, { size: 15, fill: PAPER, weight: 600 }));
  p.push(txt(X0 + 214, 1642, `最慢 ${fx(worst, 3)} s`, { size: 15, fill: MUTE }));
  p.push(txt(X0 + 434, 1642, `极差 ${fx(worst - best, 3)} s`, { size: 15, fill: MUTE }));
  p.push(txt(X1, 1642, 'STEM RACING · CZ3-2025', { size: 12, fill: MUTE2, anchor: 'end', ls: 1.6 }));

  p.push(ln(X0, 1690, X1, 1690, { stroke: PAPER, w: 1, op: 0.16 }));
  p.push(txt(X0, 1718, '逐站', { size: 10, fill: MUTE2, ls: 1.6 }));
  E.forEach((e, i) => {
    const cx = X0 + 96 + (i * (CW - 96)) / N;
    p.push(txt(cx, 1718, fx(e.t, 3), {
      size: 12, fill: i === N - 1 ? ACCENT : MUTE, weight: i === N - 1 ? 600 : 400, ls: 0.4,
    }));
  });
  p.push(rect(X0, 1752, CW, 3, { fill: PAPER, fillOp: 0.1 }));
  p.push(txt(X0, 1796, '数据来源：本队计时器与赛会公布成绩，两条对不上的以赛会为准。', { size: 11, fill: MUTE2 }));

  return frame(W, H, p.join(''), INK);
}

/* ---------- 画板 ---------- */
const stage = document.getElementById('stage');
const board = createArtboard({ w: W, h: H });
stage.replaceWith(board.canvas);
board.canvas.id = 'stage';

const opt = { fitLine: true, values: true };
const compose = () => board.paint(build(opt));

(() => {
  const g = (id) => document.getElementById(id);
  g('fit').addEventListener('change', (e) => { opt.fitLine = e.target.checked; compose(); });
  g('vals').addEventListener('change', (e) => { opt.values = e.target.checked; compose(); });
  g('export').addEventListener('click', () => exportEpisode(board.canvas, 'season-poster'));
})();
compose();

/* ---------- 测试钩子 ---------- */
window.__app = {
  canvas: board.canvas,
  ready: () => board.ready(),
  safe: { x0: 82, x1: 998, y0: 300, y1: 1660 },
  fonts: { MONO, DISP },
  probeGlyph: async (ch, fontCss, size = 48) => {
    const c = document.createElement('canvas');
    c.width = 76; c.height = 84;
    const m = frame(76, 84,
      `<text x="8" y="64" font-family='${fontCss}' font-size="${size}" fill="#fff">${esc(ch)}</text>`, '#000');
    await rasterize(c, m, 76, 84);
    const dd = c.getContext('2d').getImageData(0, 0, 76, 84).data;
    let h = 2166136261, ink = 0;
    for (let i = 0; i < dd.length; i += 4) {
      if (dd[i] > 8) ink++;
      h ^= dd[i]; h = Math.imul(h, 16777619) >>> 0;
    }
    return { hash: h, ink };
  },
  texts: () => drawn.join('\n'),
  items: () => items.map((i) => ({ ...i })),
  getState: () => ({ opt: { ...opt }, n: N, best, worst, delta, pct, slope: fit.b }),
  set: (k, v) => { opt[k] = v; return compose(); },
  compose: () => compose(),
  selfTest: () => {
    const errs = [];
    if (N < 2) errs.push('赛季至少要有 2 站');
    if (!times.every((t) => t > 0)) errs.push('有非正用时');
    if (!E.every((e) => e.rank >= 1 && e.rank <= e.field)) errs.push('名次超出参赛队数');
    if (best !== Math.min(...times)) errs.push('最好成绩算错');
    if (delta !== last - first) errs.push('差值算错');
    if (Math.abs(pct - (delta / first) * 100) > 1e-9) errs.push('百分比算错');
    if (!(fit.b < 0)) errs.push('拟合斜率为正：赛季没变快，海报结论会自相矛盾');
    if (py(best) < PLOT.y0 - 1 || py(worst) > PLOT.y1 + 1) errs.push('曲线跑出纵轴范围');
    const xs = E.map((_, i) => px(i));
    if (xs.some((v, i) => i && v - xs[i - 1] < 90)) errs.push('站点间距过窄，站名会挤在一起');
    if (xs[0] < X0 || xs[N - 1] > X1 - 30) errs.push('曲线超出安全区');
    const steps = { mass: 0.1, cg: 0.1, align: 0.01 };
    for (const [k, q] of Object.entries(steps)) {
      if (!E.every((e) => typeof e[k] === 'number')) errs.push(`缺少字段 ${k}`);
      else if (E.some((e) => Math.abs(e[k] / q - Math.round(e[k] / q)) > 1e-6)) errs.push(`${k} 小数位超过显示精度`);
    }
    if (!drawn.length) errs.push('没有文字');
    return { ok: errs.length === 0, errs, meta: { N, best, worst, delta, pct, slope: fit.b } };
  },
  exportPNG: async () => {
    await compose();
    const b = await toPNG(board.canvas, { width: 1080, height: 1920 });
    await assertPNG(b);
    return b.size;
  },
  exportCover: async () => {
    await compose();
    const b = await toPNG(board.canvas, { width: 1080, height: 1350 });
    await assertPNG(b);
    return b.size;
  },
  downloadAll: () => exportEpisode(board.canvas, 'season-poster'),
};
