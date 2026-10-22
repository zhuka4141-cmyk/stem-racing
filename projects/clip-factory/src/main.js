/* clip-factory —— 数据卡工厂
   一组数据点（用时 / 对手 / 分段 / 赛道条件），批量出 4 张 1080×1920。
   四张卡都从 ./points.js 同一组数字算出来，不是四份手写文案：
   改一个数，四张一起变，不可能出现「成绩卡改了、对手卡忘了改」。
   不联网、不存东西，点导出就是四次 download()。 */

import { resample, download } from './reel-export.js';
import { RUN, SEGMENTS } from './points.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC","Microsoft YaHei",sans-serif';

const ACCENT = '#e8590c';
const INK = '#0b0b0c';
const PAPER = '#f2f0eb';
const LINE = 'rgba(255,255,255,0.14)';
const LINE_SOFT = 'rgba(255,255,255,0.075)';
const MUTE = 'rgba(242,240,235,0.55)';
const MUTE2 = 'rgba(242,240,235,0.32)';
const ZEBRA = 'rgba(242,240,235,0.07)';

/* 版面骨架：四张卡共用同一副骨架，只有中间那块换 */
const VIS_Y0 = 496;
const VIS_Y1 = 832;
const TB_HDR = 864;
const TB_Y0 = 880;
const TB_ROWS = 5;
const TB_H = 60;
const TB_Y1 = TB_Y0 + TB_ROWS * TB_H;   // 1180
const TALLY_Y = 1232;
const FOOT_Y = 1394;

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const sec3 = t => t.toFixed(3);
const pct1 = v => `${(v * 100).toFixed(1)}%`;

/* 由数据点算出来的东西 —— 四张卡都读这里，不各算各的 */
const DERIVED = (() => {
  const faster = +(RUN.prev - RUN.time).toFixed(3);
  const vsRival = +(RUN.rival.time - RUN.time).toFixed(3);
  const total = +RUN.splits.reduce((a, b) => a + b, 0).toFixed(3);
  const best = RUN.splits.indexOf(Math.min(...RUN.splits));
  return { faster, vsRival, total, best };
})();

/* ---------- 绘制包围盒记录 ----------
   门禁要靠它回答「封面裁完还剩什么」，所以量的是真画出去的东西，
   不是另抄一份版面常数。改了排版，记录跟着变，断言不会撒谎。 */
let BANDS = [];

/* 封面 1080×1350 是从这块 1920 高的画布居中裁出来的：只留源图 y 285..1635，
   上下各切 285。版面原本从 y=104 起，正落在被切掉的那一段里，
   所以整块下移，让顶端正好贴到窗口上沿。数值由 srcWindow() 现算，不手抄。 */
const COVER = { w: 1080, h: 1350 };
const WIN = srcWindow(COVER.w, COVER.h);
const TOP_MARGIN = 104;
const YSHIFT = Math.round(WIN.y0 - TOP_MARGIN);

function pushBand(kind, x0, y0, x1, y1, text = '') {
  BANDS.push({ kind, text, x0, y0: y0 + YSHIFT, x1, y1: y1 + YSHIFT });
}

/* ---------- 画图小工具 ---------- */
function T(str, x, y, { f = `500 16px ${MONO}`, color = PAPER, a = 'left' } = {}) {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = a;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
  const m = ctx.measureText(str);
  const w = m.width;
  const bx0 = a === 'right' ? x - w : a === 'center' ? x - w / 2 : x;
  const asc = m.actualBoundingBoxAscent || 8;
  const desc = m.actualBoundingBoxDescent || 2;
  pushBand('text', bx0, y - asc, bx0 + w, y + desc, str);
}

function rule(y, color = LINE_SOFT) {
  ctx.fillStyle = color;
  ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);
  pushBand('rule', SAFE.x0, y, SAFE.x1, y + 1);
}

function vrule(x, y0, y1, color = LINE_SOFT) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y0, 1, y1 - y0);
  pushBand('rule', x, y0, x + 1, y1);
}

function box(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  pushBand('box', x, y, x + w, y + h);
}

/* resample() 是居中裁切：把目标尺寸反推成「源图上哪一段真的进了画面」。
   公式和 shared/reel-export.js 里那条一致，不另写一套，
   否则两边一改就对不上，断言会骗人。 */
function srcWindow(outW, outH, sw = W, sh = H) {
  const scale = Math.max(outW / sw, outH / sh);
  const dw = sw * scale, dh = sh * scale;
  const dx = (outW - dw) / 2, dy = (outH - dh) / 2;
  return {
    x0: -dx / scale, x1: (outW - dx) / scale,
    y0: -dy / scale, y1: (outH - dy) / scale,
  };
}

/* 一条横向条：w 是满宽，pct 是宽度比例 */
function bar(x, y, w, h, p, color) {
  box(x, y, w, h, 'rgba(255,255,255,0.06)');
  box(x, y, Math.max(2, w * p), h, color);
}

/* 五行的键值表，隔行底纹，和另外几张卡同一套 */
function table(rows, y0 = TB_Y0, rowH = TB_H) {
  rows.forEach(([k, v, hot], i) => {
    const y = y0 + i * rowH;
    if (i % 2 === 1) box(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH, ZEBRA);
    rule(y, LINE_SOFT);
    T(k, SAFE.x0, y + rowH * 0.64, { f: `400 14px ${MONO}`, color: MUTE });
    T(v, SAFE.x1, y + rowH * 0.64, {
      f: `500 20px ${MONO}`, color: hot ? ACCENT : PAPER, a: 'right',
    });
  });
  rule(y0 + rows.length * rowH, LINE);
}

/* ---------- 四张卡 ---------- */
const CARDS = [
  { id: 'result', label: '成绩', title: '本场成绩', sub: '和自己上一次比' },
  { id: 'rival', label: '对手', title: '两条线', sub: '同一场，同一条赛道' },
  { id: 'split', label: '分段', title: '20 m 分段', sub: '四段各自用掉多少时间' },
  { id: 'sheet', label: '汇总', title: '本场全量', sub: '一屏看完这组数' },
];

/* 1. 成绩：一个大数字 + 一把尺 */
function bodyResult() {
  T('本场用时', SAFE.x0, 546, { f: `500 13px ${MONO}`, color: MUTE2 });
  T(sec3(RUN.time).slice(0, 1), SAFE.x0, 700, { f: `600 150px ${DISP}`, color: PAPER });
  T(sec3(RUN.time).slice(1), SAFE.x0 + 78, 700, { f: `600 150px ${DISP}`, color: PAPER });
  T('s', SAFE.x1, 700, { f: `600 60px ${DISP}`, color: MUTE, a: 'right' });

  T(`上次 ${sec3(RUN.prev)} · ${RUN.prevLabel}`, SAFE.x0, 748, {
    f: `400 15px ${MONO}`, color: MUTE,
  });
  T(`快了 ${sec3(DERIVED.faster)} s`, SAFE.x0, 786, {
    f: `600 30px ${MONO}`, color: ACCENT,
  });

  // 尺：1.000 → 1.100，两条刻度分别是上次和这次
  const rx0 = SAFE.x0, rx1 = SAFE.x1;
  const pos = t => rx0 + (rx1 - rx0) * Math.min(Math.max((t - 1.000) / 0.100, 0), 1);
  rule(VIS_Y1 - 26, 'rgba(255,255,255,0.18)');
  for (let i = 0; i <= 10; i++) {
    vrule(rx0 + (rx1 - rx0) * i / 10, VIS_Y1 - 34, VIS_Y1 - 26,
      i % 5 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)');
  }
  box(pos(RUN.prev) - 1, VIS_Y1 - 56, 2, 30, 'rgba(242,240,235,0.45)');
  box(pos(RUN.time) - 1.5, VIS_Y1 - 66, 3, 40, ACCENT);
  T('1.000', rx0, VIS_Y1 - 2, { f: `400 11px ${MONO}`, color: MUTE2 });
  T('1.100', rx1, VIS_Y1 - 2, { f: `400 11px ${MONO}`, color: MUTE2, a: 'right' });

  table([
    ['车号 / 车道', `${RUN.car} 号 · ${RUN.lane} 道`],
    ['日期', RUN.date],
    ['场次', RUN.event],
    ['赛道温度', `${RUN.temp} ℃`],
    ['气瓶压力', `${RUN.pressure} g`],
  ]);
}

/* 2. 对手：两条长度不同的横条 */
function bodyRival() {
  const REF = 1.600;
  const span = REF - 1.000;
  const p = t => (REF - t) / span;

  T('07 号车 · 我们', SAFE.x0, 546, { f: `500 13px ${MONO}`, color: ACCENT });
  bar(SAFE.x0, 560, SAFE.x1 - SAFE.x0, 46, p(RUN.time), ACCENT);
  T(sec3(RUN.time), SAFE.x1, 546 + 78, { f: `500 24px ${MONO}`, color: PAPER, a: 'right' });

  T(`${RUN.rival.car} 号车 · ${RUN.rival.lane} 道`, SAFE.x0, 690, {
    f: `500 13px ${MONO}`, color: MUTE2,
  });
  bar(SAFE.x0, 704, SAFE.x1 - SAFE.x0, 46, p(RUN.rival.time), 'rgba(242,240,235,0.45)');
  T(sec3(RUN.rival.time), SAFE.x1, 690 + 78, { f: `500 24px ${MONO}`, color: MUTE, a: 'right' });

  T(`领先 ${sec3(DERIVED.vsRival)} s`, SAFE.x0, VIS_Y1 - 44, {
    f: `600 34px ${MONO}`, color: ACCENT,
  });
  T('条越长 = 用时越短', SAFE.x1, VIS_Y1 - 44, {
    f: `400 13px ${MONO}`, color: MUTE2, a: 'right',
  });

  table([
    ['我的用时', sec3(RUN.time), false],
    ['对手用时', sec3(RUN.rival.time)],
    ['差值', sec3(DERIVED.vsRival), true],
    ['结果', DERIVED.vsRival > 0 ? '赢' : '输', DERIVED.vsRival > 0],
    ['赛道', RUN.track],
  ]);
}

/* 3. 分段：四根竖条 */
function bodySplit() {
  const mx = Math.max(...RUN.splits);
  const n = RUN.splits.length;
  const gap = 22;
  const bw = (SAFE.x1 - SAFE.x0 - gap * (n - 1)) / n;
  const baseY = VIS_Y1 - 54;
  const topY = 566;

  RUN.splits.forEach((s, i) => {
    const x = SAFE.x0 + i * (bw + gap);
    const h = (baseY - topY) * (s / mx);
    const y = baseY - h;
    const isBest = i === DERIVED.best;

    box(x, y, bw, h, isBest ? 'rgba(232,89,12,0.85)' : 'rgba(242,240,235,0.22)');
    box(x, y, bw, 3, isBest ? ACCENT : 'rgba(242,240,235,0.5)');

    T(SEGMENTS[i], x, topY - 16, { f: `500 12px ${MONO}`, color: MUTE2 });
    T(sec3(s), x, y - 12, {
      f: `500 19px ${MONO}`, color: isBest ? ACCENT : PAPER,
    });
    T(pct1(s / DERIVED.total), x, baseY + 24, { f: `400 12px ${MONO}`, color: MUTE2 });
  });

  rule(baseY + 40, LINE);
  T(`四段加起来 ${sec3(DERIVED.total)} s，和总用时${DERIVED.total === RUN.time ? '对得上' : '对不上'}`,
    SAFE.x0, baseY + 68, { f: `400 13px ${MONO}`, color: MUTE });

  table(RUN.splits.map((s, i) => [
    `${SEGMENTS[i]}`, `${sec3(s)}  ·  ${pct1(s / DERIVED.total)}`,
    i === DERIVED.best,
  ]).slice(0, 4).concat([['合计', `${sec3(DERIVED.total)} s`, false]]));
}

/* 4. 汇总：四个关键数 + 一张全量表 */
function bodySheet() {
  const items = [
    ['用时', sec3(RUN.time), PAPER],
    ['快过上次', sec3(DERIVED.faster), ACCENT],
    ['领先对手', sec3(DERIVED.vsRival), ACCENT],
    ['赛道温度', `${RUN.temp} ℃`, PAPER],
  ];
  const gap = 20;
  const w = (SAFE.x1 - SAFE.x0 - gap * 3) / 4;

  items.forEach(([k, v, c], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, VIS_Y0 + 10, VIS_Y0 + 150);
    T(k, x, VIS_Y0 + 40, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, VIS_Y0 + 100, { f: `500 30px ${MONO}`, color: c });
    T(i === 0 ? 's' : '', x, VIS_Y0 + 130, { f: `400 11px ${MONO}`, color: MUTE2 });
  });

  rule(VIS_Y0 + 176, LINE);
  T('这组数的全部来源', SAFE.x0, VIS_Y0 + 214, { f: `400 13px ${MONO}`, color: MUTE });
  T(`${RUN.date} · ${RUN.event}`, SAFE.x1, VIS_Y0 + 214, {
    f: `400 13px ${MONO}`, color: MUTE2, a: 'right',
  });
  T('分段最快的一段', SAFE.x0, VIS_Y0 + 268, { f: `400 13px ${MONO}`, color: MUTE });
  T(`${SEGMENTS[DERIVED.best]} · ${sec3(RUN.splits[DERIVED.best])} s`, SAFE.x1, VIS_Y0 + 268, {
    f: `500 16px ${MONO}`, color: ACCENT, a: 'right',
  });

  table([
    ['车号 / 车道', `${RUN.car} 号 · ${RUN.lane} 道`],
    ['对手', `${RUN.rival.car} 号 · ${RUN.rival.lane} 道`],
    ['赛道', RUN.track],
    ['气瓶压力', `${RUN.pressure} g`],
    ['四段合计', `${sec3(DERIVED.total)} s`],
  ]);
}

const BODY = { result: bodyResult, rival: bodyRival, split: bodySplit, sheet: bodySheet };

/* ---------- 骨架 ---------- */
const state = { id: 'result' };

function compose() {
  const card = CARDS.find(c => c.id === state.id) || CARDS[0];

  BANDS = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(0, YSHIFT);

  // 顶部死区
  rule(104, LINE_SOFT);
  T('DATA CARD', 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
  T(`${CARDS.findIndex(c => c.id === card.id) + 1} / ${CARDS.length}`, 930, 136, {
    f: `500 13px ${MONO}`, color: MUTE2, a: 'right',
  });
  ctx.fillStyle = 'rgba(242,240,235,0.055)';
  ctx.font = `700 150px ${DISP}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(card.id.toUpperCase(), 930, 236);
  {
    const wm = ctx.measureText(card.id.toUpperCase());
    pushBand('text', 930 - wm.width, 236 - (wm.actualBoundingBoxAscent || 110),
      930, 236 + (wm.actualBoundingBoxDescent || 30), card.id.toUpperCase());
  }

  // 抬头
  rule(SAFE.y0, LINE);
  box(SAFE.x0, SAFE.y0, 46, 3, ACCENT);
  T('STEM RACING', 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
  T(RUN.track, 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: 'right' });

  T(card.title, 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
  T(card.sub, 60, 392, { f: `400 17px ${MONO}`, color: MUTE });

  T('数据点 / ITEMS', 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: 'right' });
  T(String(TB_ROWS).padStart(2, '0'), 930, 368, {
    f: `600 68px ${DISP}`, color: PAPER, a: 'right',
  });

  // 三列抬头
  rule(412, LINE);
  const cols = [
    ['车号', `${RUN.car} 号`],
    ['日期', RUN.date],
    ['车卡', card.label],
  ];
  const gap2 = 26;
  const cw = (SAFE.x1 - SAFE.x0 - gap2 * 2) / 3;
  cols.forEach(([k, v], i) => {
    const x = SAFE.x0 + i * (cw + gap2);
    if (i > 0) vrule(x - gap2 / 2, 418, 486);
    T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, 476, { f: `500 21px ${MONO}`, color: PAPER });
  });
  rule(486, LINE_SOFT);

  // 中间那块：四张卡唯一的区别
  BODY[card.id]();

  // 表头 + 汇总
  T('分段', SAFE.x0, TB_HDR, { f: `500 10px ${MONO}`, color: MUTE2 });
  T('全部四张卡用的是同一组数', 930, TB_HDR, {
    f: `500 10px ${MONO}`, color: MUTE2, a: 'right',
  });

  rule(TALLY_Y, LINE);
  const three = [
    ['用时', `${sec3(RUN.time)} s`, PAPER],
    ['快过上次', `−${sec3(DERIVED.faster)} s`, ACCENT],
    ['对对手', `+${sec3(DERIVED.vsRival)} s`, ACCENT],
  ];
  const g3 = 26;
  const w3 = (SAFE.x1 - SAFE.x0 - g3 * 2) / 3;
  three.forEach(([k, v, c], i) => {
    const x = SAFE.x0 + i * (w3 + g3);
    if (i > 0) vrule(x - g3 / 2, TALLY_Y + 6, TALLY_Y + 70);
    T(k, x, TALLY_Y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, TALLY_Y + 68, { f: `500 24px ${MONO}`, color: c });
  });

  // 页脚
  rule(FOOT_Y, LINE);
  T('数据来自 src/points.js · 不上传 · 不联网', 60, 1428, {
    f: `400 14px ${MONO}`, color: MUTE,
  });
  T(`CLIP-FACTORY · ${card.id.toUpperCase()}`, 930, 1428, {
    f: `400 14px ${MONO}`, color: MUTE2, a: 'right',
  });
  // 两行脚注挨得比原来紧 8 px：整块下移之后，末行正好卡在裁切窗口下沿 1635 以内
  T('这组数是编的，发之前换成自己记的', 60, 1450, {
    f: `400 13px ${MONO}`, color: MUTE2,
  });
  T('1080 × 1920', 930, 1450, { f: `400 13px ${MONO}`, color: MUTE2, a: 'right' });

  ctx.restore();
}

/* ---------- 面板 ---------- */
const $ = id => document.getElementById(id);
const elCards = $('cards');
const elTime = $('sTime');
const elDelta = $('sDelta');
const elRival = $('sRival');
const elN = $('nCards');

for (const c of CARDS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.card = c.id;
  b.textContent = c.label;
  b.setAttribute('aria-pressed', String(c.id === state.id));
  b.addEventListener('click', () => select(c.id));
  elCards.appendChild(b);
}

function select(id) {
  state.id = id;
  for (const b of elCards.children) b.setAttribute('aria-pressed', String(b.dataset.card === id));
  compose();
}

function syncPanel() {
  elN.textContent = String(CARDS.length);
  elTime.textContent = `${sec3(RUN.time)} s`;
  elDelta.textContent = `−${sec3(DERIVED.faster)} s`;
  elRival.textContent = `+${sec3(DERIVED.vsRival)} s`;
}

/* ---------- 导出 ---------- */
async function blobOf(id, w, h) {
  const prev = state.id;
  state.id = id;
  compose();
  const out = resample(stage, w, h);
  const b = await new Promise(r => out.toBlob(r, 'image/png'));
  state.id = prev;
  compose();
  return b;
}

const PNG_MAGIC = '137,80,78,71,13,10,26,10';
async function probe(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return {
    size: blob.size,
    magic: Array.from(buf.slice(0, 8)).join(',') === PNG_MAGIC,
    // IHDR 紧跟在 8 字节签名 + 4 字节长度 + 4 字节 'IHDR' 之后，宽高各占 4 字节大端。
    // 从真实文件的字节里读，不拿画布尺寸冒充导出尺寸。
    w: ((buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) >>> 0,
    h: ((buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]) >>> 0,
    hash: h.toString(16).padStart(8, '0'),
  };
}

/* 门禁用的：四张卡各出一遍，证明四张不是同一张图 */
async function renderAll() {
  const out = [];
  for (const c of CARDS) {
    const p = await probe(await blobOf(c.id, 1080, 1920));
    out.push({ id: c.id, ...p });
  }
  return out;
}

/* 真正的批量导出：一张一张按顺序 download() */
async function downloadAll() {
  const made = [];
  for (const c of CARDS) {
    const b = await blobOf(c.id, 1080, 1920);
    download(b, `clip-factory-${c.id}-1080x1920.png`);
    made.push({ id: c.id, size: b.size });
    // 给浏览器一点时间把上一张的下载排上队，不然后一张会把前一张顶掉
    await new Promise(r => setTimeout(r, 320));
  }
  return made;
}

$('exAll').addEventListener('click', async () => {
  const btn = $('exAll');
  btn.disabled = true;
  try { await downloadAll(); } finally { btn.disabled = false; }
});

$('ex1').addEventListener('click', async () => {
  download(await blobOf(state.id, 1080, 1920), `clip-factory-${state.id}-1080x1920.png`);
});
$('ex2').addEventListener('click', async () => {
  download(await blobOf(state.id, 1080, 1350), `clip-factory-${state.id}-1080x1350.png`);
});

/* ---------- 启动 ---------- */
compose();
syncPanel();

/* ---------- 测试钩子 ---------- */
const inkPct = () => {
  const d = ctx.getImageData(SAFE.x0, SAFE.y0, SAFE.x1 - SAFE.x0, SAFE.y1 - SAFE.y0).data;
  let ink = 0, tot = 0;
  for (let i = 0; i < d.length; i += 4) {
    tot++;
    if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 24) ink++;
  }
  return +(ink / tot * 100).toFixed(2);
};

window.__app = {
  canvas: stage,
  cards: () => CARDS.map(c => ({ id: c.id, label: c.label })),
  current: () => state.id,
  select,
  stats: () => ({ id: state.id, n: CARDS.length, time: RUN.time, faster: DERIVED.faster, vsRival: DERIVED.vsRival }),
  derived: () => ({ ...DERIVED }),
  renderAll,
  downloadAll,
  selfTest: () => {
    const errs = [];
    const sum = +RUN.splits.reduce((a, b) => a + b, 0).toFixed(3);
    if (Math.abs(sum - RUN.time) > 0.0005) errs.push(`四段加起来 ${sum}，总用时 ${RUN.time}，对不上`);
    if (RUN.prev <= RUN.time) errs.push('上一次没有比这次慢，"快了" 是假的');
    if (RUN.rival.time <= RUN.time) errs.push('对手没有比我们慢，"领先" 是假的');
    if (RUN.splits.some(s => s <= 0)) errs.push('有分段用时不是正数');
    if (CARDS.length !== 4) errs.push(`卡面是 ${CARDS.length} 张，应该 4 张`);
    if (new Set(CARDS.map(c => c.id)).size !== CARDS.length) errs.push('卡面 id 有重复');
    if (stage.width !== 1080 || stage.height !== 1920) errs.push('画布不是 1080×1920');
    return { ok: errs.length === 0, errs };
  },
  exportProbe: async () => ({
    vertical: await probe(await blobOf(state.id, 1080, 1920)),
    cover: await probe(await blobOf(state.id, 1080, 1350)),
  }),
  exportPNG: async () => (await blobOf(state.id, 1080, 1920)).size,
  exportCover: async () => (await blobOf(state.id, 1080, 1350)).size,
  inkPct,
  // 门禁靠这几个读真实包围盒，判断封面居中裁切之后还剩什么
  getBands: () => BANDS.map(b => ({ ...b })),
  srcWindow: (w, h) => srcWindow(w, h),
  coverReport: () => {
    const win = srcWindow(COVER.w, COVER.h);
    const lost = BANDS.filter(b => b.y1 < win.y0 || b.y0 > win.y1);
    const cut = BANDS.filter(b => !(b.y1 < win.y0 || b.y0 > win.y1)
      && (b.y0 < win.y0 || b.y1 > win.y1));
    return {
      window: win,
      total: BANDS.length,
      lost: lost.map(b => ({ kind: b.kind, text: b.text, y0: +b.y0.toFixed(1), y1: +b.y1.toFixed(1) })),
      cut: cut.map(b => ({ kind: b.kind, text: b.text, y0: +b.y0.toFixed(1), y1: +b.y1.toFixed(1) })),
    };
  },
  // 四张卡都真画一遍再停在第一张：字体检测靠拦截 fillText 收集字符，
  // 只画默认那张的话，另外三张的字根本不会被检查
  preview: () => {
    for (const c of CARDS) { state.id = c.id; compose(); }
    select('result');
  },
};
