/* 淘汰赛对阵图 —— 1080×1920
   名单和每轮成绩写在下面的 BRACKET 常量里，改这个常量就换一场比赛。
   晋级规则只有一条：同一轮里成绩快的那台上。
   连接线只用「横—竖—横」三段，没有斜线也没有曲线。 */
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import {
  createArtboard, frame, esc, fx, rasterize,
  INK, PAPER, ACCENT, MUTE, MUTE2, MONO, DISP,
} from './svg-artboard.js';

const W = 1080, H = 1920;
const X0 = 56, X1 = 1024, CW = X1 - X0;

/* ======== 比赛数据：改这里 ========
   t 是该队第 0/1/2/3 轮的用时，没打到的轮填 null。
   第 0 轮按名单顺序两两配对，之后按上一轮的胜者顺序继续配。 */
const BRACKET = {
  label: '2025 秋季淘汰赛',
  track: 20.0,
  roundNames: ['1/8 决赛', '1/4 决赛', '半决赛', '决赛'],
  teams: [
    { no: '01', name: '长风 CZ-3', t: [1.142, 1.128, 1.115, 1.096] },
    { no: '02', name: '雷鸟 07', t: [1.171, null, null, null] },
    { no: '03', name: '风切变', t: [1.180, null, null, null] },
    { no: '04', name: '亚音速', t: [1.166, 1.152, null, null] },
    { no: '05', name: '白鳍 02', t: [1.193, null, null, null] },
    { no: '06', name: '破风', t: [1.158, 1.139, 1.126, null] },
    { no: '07', name: '临界角', t: [1.204, null, null, null] },
    { no: '08', name: '湍流 11', t: [1.187, 1.163, null, null] },
    { no: '09', name: '短尾隼', t: [1.211, null, null, null] },
    { no: '10', name: '低阻 05', t: [1.149, 1.131, 1.121, 1.109] },
    { no: '11', name: '等压线', t: [1.222, null, null, null] },
    { no: '12', name: '菱形翼', t: [1.168, 1.146, null, null] },
    { no: '13', name: '超空泡', t: [1.238, null, null, null] },
    { no: '14', name: '边界层', t: [1.175, 1.157, null, null] },
    { no: '15', name: '尾迹 09', t: [1.246, null, null, null] },
    { no: '16', name: '涡升力', t: [1.161, 1.140, 1.133, null] },
  ],
};

/* ---------- 布局常量 ---------- */
const ZT = 260, ZH = 1080, ZB = ZT + ZH;
const SAFE = { x0: 68, x1: 1012, y0: 272, y1: 1780 };

const state = { size: 16, mode: 'time' };
const geo = { boxH: 0, slotH: 0, colW: 0, gap: 0, cols: 0, lastBoxBottom: 0, champTop: 0 };

/* ---------- 赛程解析 ---------- */
function resolve() {
  const n = Math.round(Math.log2(state.size));
  const teams = BRACKET.teams.slice(0, state.size);
  const rounds = [];
  let field = teams;
  for (let r = 0; r < n; r++) {
    const ms = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i], b = field[i + 1];
      if (!a || !b) return { rounds, err: `第 ${r + 1} 轮配对不齐` };
      const ta = a.t[r], tb = b.t[r];
      if (ta == null || tb == null) {
        return { rounds, err: `${ta == null ? a.name : b.name} 缺第 ${r + 1} 轮成绩` };
      }
      if (ta === tb) return { rounds, err: `${a.name} 与 ${b.name} 第 ${r + 1} 轮同分，判不了晋级` };
      const win = ta < tb ? a : b, lose = ta < tb ? b : a;
      ms.push({ a, b, win, lose, tw: ta < tb ? ta : tb, tl: ta < tb ? tb : ta, gap: Math.abs(tb - ta) });
    }
    rounds.push(ms);
    field = ms.map((m) => m.win);
  }
  return { rounds, champion: field[0] };
}
let SOLVE = resolve();

/* ---------- 几何 ---------- */
const cols = () => Math.round(Math.log2(state.size));
const roundName = (r) => BRACKET.roundNames[BRACKET.roundNames.length - cols() + r];
function layout() {
  const n = cols();
  const gap = state.size === 4 ? 40 : state.size === 8 ? 34 : 26;
  const colW = (CW - (n - 1) * gap) / n;
  const slotH = ZH / (state.size / 2);
  const boxH = Math.min(slotH * 0.72, 250);
  geo.cols = n; geo.gap = gap; geo.colW = colW; geo.slotH = slotH; geo.boxH = boxH;
  return { n, gap, colW, slotH, boxH };
}
const colX = (c) => { const L = layout(); return X0 + c * (L.colW + L.gap); };
const yC = (r, m) => ZT + geo.slotH * Math.pow(2, r) * (m + 0.5);

/* ---------- 排版工具 ---------- */
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
    + ` stroke-width="${sw}"${op !== 1 ? ` stroke-opacity="${op}"` : ''}`
    + `${fillOp !== 1 ? ` fill-opacity="${fillOp}"` : ''}/>`;
};
/* 只画横—竖—横，三段，没有斜线 */
function elbowPath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} H${mx.toFixed(1)} V${y2.toFixed(1)} H${x2.toFixed(1)}`;
}
const ELBOW_RE = /^M[-\d.]+ [-\d.]+ H[-\d.]+ V[-\d.]+ H[-\d.]+$/;

/* ---------- 主排版 ---------- */
function build(opt = {}) {
  drawn = []; items = [];
  const mode = opt.mode || state.mode;
  const L = layout();
  const p = [];
  const rounds = SOLVE.rounds;
  const champ = SOLVE.champion;
  const matches = rounds.reduce((s, r) => s + r.length, 0);
  const fs = Math.max(11, Math.min(L.boxH * 0.155, 22));
  const rowH = L.boxH / 2;

  /* 抬头 */
  p.push(txt(X0, 96, `${BRACKET.label}  ·  STEM RACING`, { size: 12, fill: ACCENT, weight: 700, ls: 3 }));
  p.push(txt(X0, 176, '淘汰赛对阵', { size: 66, font: DISP, weight: 700, fill: PAPER, ls: 2 }));
  p.push(txt(X1, 130, `${state.size} 队 · ${L.n} 轮 · ${matches} 场`, { size: 13, fill: MUTE, anchor: 'end', ls: 1 }));
  p.push(txt(X1, 158, `单败淘汰 · ${fx(BRACKET.track, 1)} m 直线`, { size: 12, fill: MUTE2, anchor: 'end', ls: 1 }));
  p.push(txt(X1, 186, '成绩快者晋级', { size: 12, fill: MUTE2, anchor: 'end', ls: 1.4 }));
  p.push(ln(X0, 204, X1, 204, { stroke: PAPER, w: 2.4, op: 0.85 }));

  /* 轮次表头 */
  for (let c = 0; c < L.n; c++) {
    const x = colX(c);
    p.push(txt(x, 244, roundName(c), {
      size: 12, fill: c === L.n - 1 ? ACCENT : MUTE, ls: 2, weight: c === L.n - 1 ? 600 : 400,
    }));
    p.push(txt(x + L.colW, 244, `${rounds[c].length} 场`, { size: 10.5, fill: MUTE2, anchor: 'end' }));
    p.push(ln(x, 252, x + L.colW, 252, { stroke: PAPER, w: 1, op: 0.22 }));
  }

  /* 连接线：横—竖—横 */
  for (let c = 0; c < L.n - 1; c++) {
    rounds[c].forEach((_, m) => {
      const d = elbowPath(colX(c) + L.colW, yC(c, m), colX(c + 1), yC(c + 1, Math.floor(m / 2)));
      p.push(`<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.26"/>`);
    });
  }

  /* 每个对阵框 */
  for (let c = 0; c < L.n; c++) {
    const isFinal = c === L.n - 1;
    rounds[c].forEach((m, i) => {
      const x = colX(c), top = yC(c, i) - L.boxH / 2, w = L.colW;
      p.push(rect(x, top, w, L.boxH, { fill: PAPER, fillOp: 0.09 }));
      p.push(rect(x, top, w, L.boxH, {
        stroke: isFinal ? ACCENT : PAPER, sw: isFinal ? 1.8 : 1, op: isFinal ? 0.9 : 0.18,
      }));
      [m.a, m.b].forEach((team, k) => {
        const won = team === m.win;
        const base = top + rowH * (k + 0.5) + fs * 0.36;
        if (k === 1) p.push(ln(x, top + rowH, x + w, top + rowH, { stroke: PAPER, w: 1, op: 0.12 }));
        if (won) p.push(rect(x, top + rowH * k + 1, 3, rowH - 2, { fill: ACCENT }));
        p.push(txt(x + 14, base, team.no, { size: Math.max(9, fs * 0.66), fill: MUTE2 }));
        p.push(txt(x + 14 + fs * 1.5, base, team.name, {
          size: fs, fill: won ? ACCENT : PAPER, weight: won ? 700 : 400, op: won ? 1 : 0.45,
        }));
        if (mode === 'time') {
          p.push(txt(x + w - 12, base, fx(k === 0 ? m.tw : m.tl, 3), {
            size: fs * 0.92, fill: won ? ACCENT : MUTE2, anchor: 'end', weight: won ? 600 : 400,
          }));
        } else {
          const d = won ? -m.gap : m.gap;
          p.push(txt(x + w - 12, base, `${d < 0 ? '−' : '+'}${fx(Math.abs(d), 3)}`, {
            size: fs * 0.86, fill: won ? ACCENT : MUTE2, anchor: 'end', weight: won ? 600 : 400,
          }));
        }
      });
    });
  }
  geo.lastBoxBottom = yC(0, rounds[0].length - 1) + L.boxH / 2;

  /* 冠军条 */
  const CT = 1380, CTW = 220;
  geo.champTop = CT;
  p.push(rect(X0, CT, CW, CTW, { fill: PAPER, fillOp: 0.09 }));
  p.push(rect(X0, CT, 6, CTW, { fill: ACCENT }));
  p.push(ln(X0, CT, X1, CT, { stroke: ACCENT, w: 1.6, op: 0.9 }));
  p.push(ln(X0, CT + CTW, X1, CT + CTW, { stroke: PAPER, w: 2, op: 0.6 }));
  p.push(txt(X0 + 28, CT + 38, '冠军  CHAMPION', { size: 11, fill: ACCENT, weight: 700, ls: 3 }));
  p.push(txt(X0 + 28, CT + 104, champ.name, { size: 46, font: DISP, weight: 700, fill: PAPER, ls: 1 }));
  p.push(txt(X0 + 28, CT + 146, `${champ.no} 号 · 决赛 ${fx(champ.t[L.n - 1], 3)} s`, { size: 15, fill: MUTE, ls: 0.6 }));
  p.push(txt(X0 + 28, CT + 184, `首轮 ${fx(champ.t[0], 3)} → 决赛 ${fx(champ.t[L.n - 1], 3)} s  ·  一路打了 ${L.n} 场`, {
    size: 11.5, fill: MUTE2,
  }));
  p.push(ln(X1 - 300, CT + 30, X1 - 300, CT + CTW - 24, { stroke: PAPER, w: 1, op: 0.16 }));
  p.push(txt(X1 - 28, CT + 48, '冠军队每轮成绩', { size: 11, fill: MUTE2, anchor: 'end', ls: 1.4 }));
  for (let r = 0; r < L.n; r++) {
    p.push(txt(X1 - 150, CT + 84 + r * 30, roundName(r), { size: 10.5, fill: MUTE2, anchor: 'end', ls: 0.8 }));
    p.push(txt(X1 - 28, CT + 84 + r * 30, fx(champ.t[r], 3), { size: 13.5, fill: PAPER, anchor: 'end', weight: 500 }));
  }

  /* 页脚 */
  const FT = 1660;
  p.push(txt(X0, FT, '怎么读这张图', { size: 11, fill: MUTE2, ls: 2 }));
  const notes = [
    '橙色名字是本轮晋级的那一队，左侧竖条画在它那一行上；灰字是被淘汰的那一队。',
    '连接线只走横—竖—横三段：两条从上一轮出来，在中间的同一个纵坐标汇合，再进下一轮那个框。',
    '名单顺序就是种子位：第 1 对第 2、第 3 对第 4，依次排下去，没有抽签。',
    '队数改成 4 或 8 时，取名单前 4 或前 8 个，轮次表头跟着换成半决赛 / 1/4 决赛。',
  ];
  notes.forEach((n, i) => p.push(txt(X0, FT + 32 + i * 24, n, { size: 12, fill: MUTE })));
  p.push(ln(X0, 1800, X1, 1800, { stroke: PAPER, w: 1, op: 0.22 }));
  p.push(txt(X0, 1838, 'STEM RACING · CZ3-2025', { size: 12, fill: MUTE2, ls: 1.8 }));
  p.push(txt(X1, 1838, '成绩为人工计时保留 3 位小数；同分按种子位高者晋级 —— 这批数据里没有同分。', {
    size: 10.5, fill: MUTE2, anchor: 'end',
  }));

  return frame(W, H, p.join(''), INK);
}

/* ---------- 画板 ---------- */
const stage = document.getElementById('stage');
const board = createArtboard({ w: W, h: H });
stage.replaceWith(board.canvas);
board.canvas.id = 'stage';

const compose = () => board.paint(build(state));
const rebuild = () => { SOLVE = resolve(); return compose(); };

(() => {
  const g = (id) => document.getElementById(id);
  const s = g('size');
  s.value = String(state.size);
  s.addEventListener('change', () => { state.size = parseInt(s.value, 10); rebuild(); });
  const m = g('mode');
  m.value = state.mode;
  m.addEventListener('change', () => { state.mode = m.value; compose(); });
  g('export').addEventListener('click', () => exportEpisode(board.canvas, 'heat-bracket'));
})();
compose();

/* ---------- 测试钩子 ---------- */
const metrics = () => ({
  size: state.size,
  cols: geo.cols,
  rounds: SOLVE.rounds.length,
  matches: SOLVE.rounds.reduce((s, r) => s + r.length, 0),
  champion: SOLVE.champion ? SOLVE.champion.name : null,
  championTime: SOLVE.champion ? SOLVE.champion.t[SOLVE.rounds.length - 1] : null,
  boxH: geo.boxH,
});

window.__app = {
  canvas: board.canvas,
  ready: () => board.ready(),
  safe: SAFE,
  fonts: { MONO, DISP },
  probeGlyph: async (ch, fontCss, size = 48) => {
    const c = document.createElement('canvas');
    c.width = 76; c.height = 84;
    const mk = frame(76, 84,
      `<text x="8" y="64" font-family='${fontCss}' font-size="${size}" fill="#fff">${esc(ch)}</text>`, '#000');
    await rasterize(c, mk, 76, 84);
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
  getState: () => ({ size: state.size, mode: state.mode }),
  getMetrics: metrics,
  set: (k, v) => { state[k] = v; return k === 'size' ? rebuild() : compose(); },
  compose: () => compose(),
  selfTest: () => {
    const errs = [];
    const size = state.size;
    if (![4, 8, 16].includes(size)) errs.push(`队伍数 ${size} 不支持`);
    const want = Math.round(Math.log2(size));
    if (SOLVE.err) errs.push(SOLVE.err);
    if (SOLVE.rounds.length !== want) errs.push(`轮数 ${SOLVE.rounds.length} 应为 ${want}`);
    const total = SOLVE.rounds.reduce((s, r) => s + r.length, 0);
    if (total !== size - 1) errs.push(`总场次 ${total} 应为 ${size - 1}`);
    if (SOLVE.rounds[want - 1].length !== 1) errs.push('决赛不是一场');
    SOLVE.rounds.forEach((ms, r) => {
      const seen = new Set();
      ms.forEach((m) => {
        if (!(m.tw < m.tl)) errs.push(`第 ${r + 1} 轮胜者不是更快的那台`);
        if (seen.has(m.a.no)) errs.push(`第 ${r + 1} 轮 ${m.a.name} 出现了两次`);
        seen.add(m.a.no); seen.add(m.b.no);
        if (r + 1 < want && m.win.t[r + 1] == null) errs.push(`${m.win.name} 晋级了却没有第 ${r + 2} 轮成绩`);
      });
    });
    if (elbowBad() > 0) errs.push('连接线不是横—竖—横');
    if (geo.boxH > geo.slotH) errs.push('框高超过槽高，两场会叠在一起');
    if (geo.lastBoxBottom > ZB) errs.push('对阵框超出画布区域');
    if (geo.champTop < geo.lastBoxBottom + 10) errs.push('冠军条压到最后一轮');
    for (let c = 0; c < geo.cols - 1; c++) {
      if (colX(c) + geo.colW > colX(c + 1)) errs.push(`第 ${c + 1} 列压到第 ${c + 2} 列`);
    }
    if (SAFE.y1 < geo.champTop + 220) errs.push('安全区没有盖住冠军条');
    if (!drawn.length) errs.push('没有文字');
    return { ok: errs.length === 0, errs, meta: metrics() };
  },
  exportPNG: async () => {
    await compose();
    const b = await toPNG(board.canvas, { width: 1080, height: 1920 });
    await assertPNG(b);
    return b.size;
  },
  exportCover: async () => {
    await compose();
    const b = await toPNG(board.canvas, { width: 1350, height: 1080 });
    await assertPNG(b);
    return b.size;
  },
  downloadAll: () => exportEpisode(board.canvas, 'heat-bracket'),
};

/* 正交性自证：四种尺寸 × 若干组合，逐条对正则 */
function elbowBad() {
  let bad = 0;
  for (const sz of [4, 8, 16]) {
    const n = Math.round(Math.log2(sz));
    for (let c = 0; c < n - 1; c++) {
      for (let m = 0; m < sz / 2; m++) {
        if (!ELBOW_RE.test(elbowPath(100 + c * 300, 200 + m * 60, 400 + c * 300, 240 + m * 120))) bad++;
      }
    }
  }
  return bad;
}
