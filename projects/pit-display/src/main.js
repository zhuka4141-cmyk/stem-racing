/* 维修区计时牌 —— 1080×1350 竖版分享卡
   排版按真实 LED 计时塔的分带走：抬头 / 编号带 / 时间带 / 分轮带 / 读数带 / 口径带 / 底条。
   时间不是字体，是七段数码管的真实几何：每段一个两端收尖的六边形（尖端 45°），
   没点亮的那几段留 9% 不透明度当余辉——真实数码管就是这个观感。 */
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import {
  createArtboard, frame, esc, fx, hatch, rasterize,
  INK, PAPER, ACCENT, ACCENT_DIM, LINE, MUTE, MUTE2, MONO, DISP,
} from './svg-artboard.js';

const W = 1080;
const X0 = 48, X1 = 1032, CW = X1 - X0;
const TRACK = 20.0;                       // 赛道长度，米
const RANK_X = 792;                       // 名次牌左边界，时间不允许越过它

const DEFAULTS = {
  car: '07',
  team: '长风 CZ-3',
  time: 1.142,
  rank: 1,
  field: 18,
  lead: 1.142,
  lane: 2,
  runs: [1.214, 1.186, 1.163, 1.142, 1.157, 1.149],
  date: '2025-11-08',
  rev: 'REV 03',
};
const state = JSON.parse(JSON.stringify(DEFAULTS));
let geo = {};

/* ---------- 七段数码管 ---------- */
const SEG_MAP = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};

function segShapes(x, y, w, h, t) {
  const k = t / 2;
  const hbar = (yy) => [
    [x + t, yy], [x + t + k, yy - k], [x + w - t - k, yy - k],
    [x + w - t, yy], [x + w - t - k, yy + k], [x + t + k, yy + k],
  ].map(p => p.join(',')).join(' ');
  const vbar = (xx, y0, y1) => [
    [xx, y0], [xx + k, y0 + k], [xx + k, y1 - k],
    [xx, y1], [xx - k, y1 - k], [xx - k, y0 + k],
  ].map(p => p.join(',')).join(' ');
  return {
    a: hbar(y + k),
    g: hbar(y + h / 2),
    d: hbar(y + h - k),
    f: vbar(x + k, y + t, y + h / 2 - k),
    b: vbar(x + w - k, y + t, y + h / 2 - k),
    e: vbar(x + k, y + h / 2 + k, y + h - t),
    c: vbar(x + w - k, y + h / 2 + k, y + h - t),
  };
}

function segWidth(str, { w, gap, dotAdv }) {
  let total = 0;
  for (const ch of str) total += ch === '.' ? dotAdv : w + gap;
  return total - gap;
}

function segMarkup(str, x0, y0, opt) {
  const { w, h, t, gap, dotAdv } = opt;
  let out = '', x = x0;
  for (const ch of str) {
    if (ch === '.') {
      out += `<rect x="${x + 3}" y="${y0 + h - t}" width="${t}" height="${t}" fill="${ACCENT}"/>`;
      x += dotAdv;
      continue;
    }
    const sh = segShapes(x, y0, w, h, t);
    const lit = SEG_MAP[ch];
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      out += `<polygon points="${sh[k]}" fill="${ACCENT}" fill-opacity="0.09"/>`;
    }
    if (lit) for (const k of lit) out += `<polygon points="${sh[k]}" fill="${ACCENT}"/>`;
    x += w + gap;
  }
  return out;
}

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
  const { stroke = LINE, w = 1, dash = null, op = 1 } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"`
    + `${dash ? ` stroke-dasharray="${dash}"` : ''}${op !== 1 ? ` stroke-opacity="${op}"` : ''}/>`;
};
const rect = (x, y, w, h, o = {}) => {
  const { fill = 'none', stroke = 'none', sw = 1, op = 1, fillOp = 1 } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"`
    + ` stroke-width="${sw}"${op !== 1 ? ` stroke-opacity="${op}"` : ''}${fillOp !== 1 ? ` fill-opacity="${fillOp}"` : ''}/>`;
};
const pad = (n, len = 2) => String(n).padStart(len, '0');

/* ---------- 两张版式的纵向骨架 ----------
   带序完全一样（抬头 / 车号 / 时间 / 逐轮 / 读数 / 口径 / 底条），
   变的是每条带落在哪一行、以及数码管和折线图各长多高。
   4:5 那张的数值就是原来写死在 build() 里的那些，所以它一个像素都不会动；
   9:16 是把 570px 的余量真的分给数码管、名次牌和折线图，不是上下补白。 */
const L45 = {
  H: 1350, frameH: 1294,
  eyebrow: 74, rule: 86, sub: 100, divA: 112,
  labelB: 148, hashY: 262, hashSize: 44, carY: 246, carSize: 116,
  vline0: 124, vline1: 272, teamY: 210, teamSize: 54, teamSub: 244,
  laneY: 196, laneSize: 44, laneSub: 228, divB: 286,
  labelC: 322, segTop: 336, seg: { h: 290, w: 156, t: 30, gap: 14, dotAdv: 34 }, unitSize: 30,
  rankY: 316, rankH: 204, rankSize: 96, rankLabY: 26, rankNumY: 144, rankOfY: 188,
  gapLab: 552, gapVal: 584, bestLab: 618, bestVal: 650, divC: 672,
  labelD: 708, plotTop: 726, axisY: 918, divD: 964,
  cellTop: 984, cellLabel: 1006, cellVal: 1066, cellSub: 1096, cellBot: 1118, cellSize: 36,
  labelF: 1148, notesTop: 1178, noteStep: 22, noteSize: 11.5,
  hatchY: 1284, footY: 1314,
};

const L916 = {
  H: 1920, frameH: 1864,
  eyebrow: 132, rule: 144, sub: 166, divA: 186,
  labelB: 226, hashY: 372, hashSize: 54, carY: 358, carSize: 150,
  vline0: 206, vline1: 392, teamY: 330, teamSize: 68, teamSub: 376,
  laneY: 306, laneSize: 56, laneSub: 350, divB: 412,
  labelC: 452, segTop: 470, seg: { h: 400, w: 156, t: 32, gap: 14, dotAdv: 34 }, unitSize: 34,
  rankY: 446, rankH: 300, rankSize: 132, rankLabY: 40, rankNumY: 210, rankOfY: 280,
  gapLab: 900, gapVal: 936, bestLab: 976, bestVal: 1012, divC: 1042,
  labelD: 1080, plotTop: 1098, axisY: 1490, divD: 1520,
  cellTop: 1532, cellLabel: 1556, cellVal: 1620, cellSub: 1652, cellBot: 1680, cellSize: 42,
  labelF: 1706, notesTop: 1736, noteStep: 23, noteSize: 12.5,
  hatchY: 1830, footY: 1874,
};

/* ---------- 派生量 ---------- */
function derive() {
  const runs = state.runs.slice();
  const best = Math.min(...runs);
  const worst = Math.max(...runs);
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const sd = Math.sqrt(runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length);
  return { runs, best, worst, mean, sd, avgSpeed: TRACK / state.time, gapToLead: state.time - state.lead };
}

/* ---------- 主排版 ---------- */
function render(L) {
  drawn = []; items = [];
  const d = derive();
  const p = [];

  p.push(`<defs>${hatch('hz', { step: 7, width: 1.6, color: 'rgba(242,240,235,0.42)' })}</defs>`);
  p.push(rect(28, 28, 1024, L.frameH, { stroke: PAPER, sw: 2, op: 0.8 }));

  /* 带 A · 抬头 */
  p.push(txt(X0, L.eyebrow, 'PIT BOARD', { size: 18, fill: ACCENT, weight: 700, ls: 3.6 }));
  p.push(rect(X0, L.rule, 138, 3, { fill: ACCENT }));
  p.push(txt(X0, L.sub, '维修区计时牌 · PIT-LANE TIMING', { size: 11.5, fill: MUTE, ls: 1.8 }));
  p.push(txt(X1, L.eyebrow, `STEM RACING · ${fx(TRACK, 3)} m`, { size: 12, fill: MUTE, anchor: 'end', ls: 1.4 }));
  p.push(txt(X1, L.sub, `${state.date} · R${pad(state.runs.length)} · LANE ${pad(state.lane)}`,
    { size: 12, fill: MUTE2, anchor: 'end', ls: 1.2 }));
  p.push(ln(X0, L.divA, X1, L.divA));

  /* 带 B · 车号与队名 */
  p.push(txt(X0, L.labelB, '车号 CAR NO.', { size: 11, fill: MUTE2, ls: 2.2 }));
  p.push(txt(X0 + 2, L.hashY, '#', { size: L.hashSize, fill: ACCENT_DIM, weight: 500 }));
  p.push(txt(X0 + 34, L.carY, state.car, { size: L.carSize, fill: ACCENT, weight: 700, ls: -2 }));
  p.push(ln(272, L.vline0, 272, L.vline1));
  p.push(txt(296, L.labelB, '车队 TEAM', { size: 11, fill: MUTE2, ls: 2.2 }));
  p.push(txt(296, L.teamY, state.team, { size: L.teamSize, font: DISP, weight: 600, fill: PAPER, ls: -0.4 }));
  p.push(txt(296, L.teamSub, 'CZ3-2025-R07 · STRAIGHT LINE', { size: 12, fill: MUTE, ls: 1.4 }));
  p.push(txt(X1, L.labelB, '车道 LANE', { size: 11, fill: MUTE2, anchor: 'end', ls: 2.2 }));
  p.push(txt(X1, L.laneY, pad(state.lane), { size: L.laneSize, fill: PAPER, weight: 600, anchor: 'end' }));
  p.push(txt(X1, L.laneSub, `第 ${pad(state.runs.length)} 轮 / 共 ${pad(state.runs.length)} 轮`,
    { size: 12, fill: MUTE, anchor: 'end' }));
  p.push(ln(X0, L.divB, X1, L.divB));

  /* 带 C · 时间 + 名次牌 */
  const timeStr = fx(state.time, 3);
  const SEG = L.seg;
  const segW = segWidth(timeStr, SEG);
  p.push(txt(X0, L.labelC, '成绩 TOTAL TIME', { size: 11, fill: MUTE2, ls: 2.6 }));
  p.push(segMarkup(timeStr, X0, L.segTop, SEG));
  p.push(txt(X0 + segW + 14, L.segTop + SEG.h, 's', { size: L.unitSize, fill: MUTE, weight: 500 }));

  const RP = { x: RANK_X, y: L.rankY, w: X1 - RANK_X, h: L.rankH };
  p.push(`<polygon points="${RP.x},${RP.y} ${RP.x + RP.w - 26},${RP.y} ${RP.x + RP.w},${RP.y + 26} `
    + `${RP.x + RP.w},${RP.y + RP.h} ${RP.x},${RP.y + RP.h}" fill="${ACCENT}"/>`);
  p.push(txt(RP.x + 16, RP.y + L.rankLabY, '名次 RANK', { size: 10.5, fill: INK, weight: 700, ls: 2, op: 0.72 }));
  p.push(txt(RP.x + 14, RP.y + L.rankNumY, pad(state.rank), { size: L.rankSize, fill: INK, weight: 700, ls: -3 }));
  p.push(txt(RP.x + RP.w - 14, RP.y + L.rankOfY, `/ ${state.field}`, { size: 22, fill: INK, anchor: 'end', op: 0.72, weight: 600 }));

  p.push(txt(RANK_X, L.gapLab, '与头名差距', { size: 10.5, fill: MUTE2, ls: 2 }));
  p.push(txt(RANK_X, L.gapVal, d.gapToLead > 0.0005 ? `+${fx(d.gapToLead, 3)}` : '— 头名 —',
    { size: 24, fill: PAPER, weight: 600 }));
  p.push(txt(RANK_X, L.bestLab, '个人最好', { size: 10.5, fill: MUTE2, ls: 2 }));
  p.push(txt(RANK_X, L.bestVal, fx(d.best, 3), { size: 24, fill: ACCENT, weight: 600 }));
  p.push(ln(X0, L.divC, X1, L.divC));

  /* 带 D · 逐轮成绩 */
  const lo = Math.floor(d.best * 100) / 100 - 0.01;
  const hi = Math.ceil(d.worst * 100) / 100 + 0.01;
  const AXX = L.axisY, AX0 = 110, PTOP = L.plotTop;
  const yOf = (v) => AXX - ((hi - v) / (hi - lo)) * (AXX - PTOP);
  p.push(txt(X0, L.labelD, '逐轮成绩 RUN HISTORY', { size: 11, fill: MUTE2, ls: 2.6 }));
  p.push(txt(X1, L.labelD, `纵轴 ${fx(lo, 2)}–${fx(hi, 2)} s 截断`, { size: 10, fill: MUTE2, anchor: 'end', ls: 1 }));

  for (let g = Math.ceil(lo * 100) / 100 + 0.0099; g < hi - 0.005; g += 0.02) {
    const y = yOf(g);
    if (y < PTOP - 1) continue;
    p.push(ln(AX0, y, X1, y, { stroke: LINE, dash: '3 5', w: 1 }));
    p.push(txt(AX0 - 12, y + 4, fx(g, 2), { size: 10, fill: MUTE2, anchor: 'end' }));
  }
  p.push(ln(AX0, AXX, X1, AXX, { stroke: MUTE2, w: 1 }));

  const cell = (X1 - AX0) / d.runs.length, barW = cell * 0.60;
  const yBest = yOf(d.best);
  p.push(ln(AX0, yBest, X1, yBest, { stroke: ACCENT, w: 1.5, dash: '6 4', op: 0.85 }));
  d.runs.forEach((v, i) => {
    const cx = AX0 + cell * i + cell / 2;
    const top = yOf(v);
    const isBest = Math.abs(v - d.best) < 1e-9;
    p.push(rect(cx - barW / 2, top, barW, AXX - top, { fill: isBest ? ACCENT : PAPER, fillOp: isBest ? 1 : 0.34 }));
    p.push(txt(cx, top - 9, fx(v, 3), { size: 12, fill: isBest ? ACCENT : MUTE, anchor: 'middle', weight: isBest ? 600 : 400 }));
    p.push(txt(cx, AXX + 22, `R${i + 1}`, { size: 10.5, fill: MUTE2, anchor: 'middle', ls: 1 }));
  });
  p.push(ln(X0, L.divD, X1, L.divD));

  /* 带 E · 读数格 */
  const cells = [
    ['平均速度 AVERAGE', fx(d.avgSpeed, 3), `m/s · ${fx(TRACK, 3)} m 全程`],
    ['逐轮最好 BEST', fx(d.best, 3), `s · 第 ${pad(d.runs.indexOf(d.best) + 1)} 轮`],
    ['逐轮极差 SPREAD', fx(d.worst - d.best, 3), 's · 最大减最小'],
    ['波动 STDEV', fx(d.sd, 3), 's · 总体标准差'],
  ];
  const cw = CW / 4;
  cells.forEach(([lab, val, sub], i) => {
    const x = X0 + cw * i;
    const ix = x + (i ? 20 : 0);
    if (i) p.push(ln(x, L.cellTop, x, L.cellBot, { stroke: LINE }));
    p.push(txt(ix, L.cellLabel, lab, { size: 10, fill: MUTE2, ls: 1.6 }));
    p.push(txt(ix, L.cellVal, val, { size: L.cellSize, fill: i === 1 ? ACCENT : PAPER, weight: 600, ls: -0.6 }));
    p.push(txt(ix, L.cellSub, sub, { size: 11, fill: MUTE }));
  });
  p.push(ln(X0, L.cellBot, X1, L.cellBot));

  /* 带 F · 记录口径 */
  p.push(txt(X0, L.labelF, '记录口径 DATA NOTES', { size: 10, fill: MUTE2, ls: 2.2 }));
  const notes = [
    '计时自起跑信号至终点光门，单次分辨率 0.001 s；所有轮次同车体、同组车轮、同配重。',
    '第 4 轮之后重做了一次轴对齐，0.072 s 的极差里约 0.04 s 来自对轴，不是配重。',
    '第 6 轮出闸后车体擦到导轨，成绩 1.149 s 记在册但未参与平均值计算。',
    '未做任何事后修正；名次按当轮全场最快排序，同秒按车号先后。',
  ];
  notes.forEach((n, i) => p.push(txt(X0, L.notesTop + i * L.noteStep, n, { size: L.noteSize, fill: MUTE })));

  /* 带 G · 底条 */
  p.push(rect(X0, L.hatchY, CW, 16, { fill: 'url(#hz)' }));
  p.push(rect(X0, L.hatchY, CW, 16, { stroke: LINE, sw: 1 }));
  p.push(txt(X0, L.footY, 'STEM RACING · CZ3-2025', { size: 10.5, fill: MUTE2, ls: 2.2 }));
  p.push(txt(X1, L.footY, `${state.rev} · ${state.date}`, { size: 10.5, fill: MUTE2, anchor: 'end', ls: 2.2 }));

  geo = { segRight: X0 + segW, rankLeft: RANK_X, notesBottom: L.notesTop + 3 * L.noteStep, hatchTop: L.hatchY, footBaseline: L.footY, frameBottom: L.H - 28 };
  return frame(W, L.H, p.join(''), INK);
}

/* ---------- 画板 ---------- */
const stage = document.getElementById('stage');
const board45 = createArtboard({ w: 1080, h: 1350 });
const board916 = createArtboard({ w: 1080, h: 1920 });
stage.replaceWith(board45.canvas);
board45.canvas.id = 'stage';

/* 两块板子每次都一起重画。4:5 后画，所以 geo / selfTest 描述的是它。 */
function compose() {
  const a = board916.paint(render(L916));
  const b = board45.paint(render(L45));
  return Promise.all([a, b]);
}

/* ---------- 控制面板 ---------- */
(() => {
  const g = (id) => document.getElementById(id);
  const sync = () => {
    state.car = g('car').value.trim() || DEFAULTS.car;
    state.team = g('team').value.trim() || DEFAULTS.team;
    state.time = Math.max(0.5, Number(g('time').value) || DEFAULTS.time);
    state.field = Math.max(2, Math.round(Number(g('field').value) || DEFAULTS.field));
    state.rank = Math.min(state.field, Math.max(1, Math.round(Number(g('rank').value) || 1)));
    state.lead = Math.max(0.5, Number(g('lead').value) || DEFAULTS.time);
    compose();
  };
  for (const id of ['car', 'team', 'time', 'rank', 'field', 'lead']) g(id).addEventListener('input', sync);
  g('reset').addEventListener('click', () => {
    Object.assign(state, JSON.parse(JSON.stringify(DEFAULTS)));
    for (const id of ['car', 'team', 'time', 'rank', 'field', 'lead']) g(id).value = state[id];
    compose();
  });
  g('export').addEventListener('click', () => exportEpisode(board916.canvas, 'pit-display', board45.canvas));
})();
compose();

/* ---------- 测试钩子 ---------- */
window.__app = {
  canvas: board45.canvas,
  ready: () => Promise.all([board45.ready(), board916.ready()]),
  safe: { x0: 60, x1: 1020, y0: 60, y1: 1290 },
  reel: { canvas: board916.canvas, safe: { x0: 60, x1: 1020, y0: 60, y1: 1892 } },
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
  items: () => items.map(i => ({ ...i })),
  getState: () => ({ ...state }),
  getMetrics: () => derive(),
  set: (k, v) => { state[k] = v; return compose(); },
  compose: () => compose(),
  selfTest: () => {
    const errs = [];
    const d = derive();
    if (!(state.time > 0.5 && state.time < 5)) errs.push('成绩超出合理区间');
    if (!(state.rank >= 1 && state.rank <= state.field)) errs.push('名次不在 1..参赛数');
    if (!state.runs.length) errs.push('逐轮数组为空');
    if (!Number.isFinite(d.sd)) errs.push('标准差非有限数');
    if (!Number.isFinite(d.avgSpeed)) errs.push('平均速度非有限数');
    if (!state.car.length) errs.push('车号为空');
    if (!drawn.length) errs.push('没有任何文字被绘制');
    // 几何自检：七段数字不许压到名次牌，文字不许压到底部危险条
    if (geo.segRight > geo.rankLeft - 8) errs.push(`时间宽度 ${geo.segRight.toFixed(0)} 侵占名次牌 ${geo.rankLeft}`);
    if (geo.notesBottom > geo.hatchTop - 6) errs.push('口径文字压到底条');
    if (geo.footBaseline + 8 > geo.frameBottom) errs.push('底条文字出框');
    return { ok: errs.length === 0, errs };
  },
  exportPNG: async () => {
    await compose();
    const b = await toPNG(board916.canvas, { width: 1080, height: 1920 });
    await assertPNG(b);
    return b.size;
  },
  exportCover: async () => {
    await compose();
    const b = await toPNG(board45.canvas, { width: 1080, height: 1350 });
    await assertPNG(b);
    return b.size;
  },
  downloadAll: () => exportEpisode(board916.canvas, 'pit-display', board45.canvas),
};