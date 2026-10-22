/* result-archive —— 成绩档案
   数据来自 ./results.js 这个本地常量。页面不读外部文件、不联网。
   面板负责搜索和排序，画布出一张 1080×1920：上半是成绩表，下半是用时趋势。 */

import { resample, download } from './reel-export.js';
import { RESULTS } from './results.js';

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

/* 版面骨架 */
const STRIP_Y = 412;
const ROW_Y0 = 524;
const ROW_AREA = 1000 - ROW_Y0;      // 524 → 1000 是表格区
const ROW_MAX_H = 62;
const ROW_MIN_H = 56;                 // 一屏最多 8 行，再压就看不清了
const CH_HDR_Y = 1012;
const CH_Y0 = 1040;                   // 折线区顶
const CH_Y1 = 1180;                   // 折线区底
const CH_FOOT_Y = 1208;
const TALLY_Y = 1232;
const FOOT_Y = 1394;

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const SORTS = [
  { id: 'date', label: '日期' },
  { id: 'time', label: '用时' },
  { id: 'place', label: '名次' },
];

const state = {
  q: '',
  sort: 'date',
  all: RESULTS,
  shown: [],
};

/* ---------- 文本 ---------- */
function T(str, x, y, { f = `500 16px ${MONO}`, color = PAPER, a = 'left' } = {}) {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = a;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function rule(y, color = LINE_SOFT) {
  ctx.fillStyle = color;
  ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);
}

function vrule(x, y0, y1, color = LINE_SOFT) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y0, 1, y1 - y0);
}

const pad2 = n => String(n).padStart(2, '0');
const cut = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);
const sec3 = t => t.toFixed(3);
const md = d => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

/* ---------- 筛选 + 排序 ---------- */
function apply() {
  const q = state.q.trim().toLowerCase();
  const hit = state.all.filter(r =>
    !q || r.event.toLowerCase().includes(q) || r.car.toLowerCase().includes(q));

  if (state.sort === 'date') hit.sort((a, b) => (a.date < b.date ? 1 : -1));
  else if (state.sort === 'time') hit.sort((a, b) => a.time - b.time);
  else hit.sort((a, b) => a.place - b.place || a.time - b.time);

  state.shown = hit;
  compose();
  syncPanel();
}

function rowLayout(n) {
  const rows = Math.min(n, Math.floor(ROW_AREA / ROW_MIN_H));
  const rowH = Math.min(ROW_MAX_H, Math.floor(ROW_AREA / Math.max(rows, 1)));
  return { rows: Math.max(rows, 0), rowH };
}

/* ---------- 画 ---------- */
function compose() {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  drawTopBand();
  drawHeader();
  drawStrip();
  if (state.shown.length === 0) drawEmpty();
  else drawRows();
  drawChart();
  drawTally();
  drawFooter();
}

function drawTopBand() {
  rule(104, LINE_SOFT);
  T('TIMING SHEET', 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
  T('本机数据 · 无网络', 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: 'right' });

  ctx.fillStyle = 'rgba(242,240,235,0.055)';
  ctx.font = `700 150px ${DISP}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ARCHIVE', 930, 236);
}

function drawHeader() {
  rule(SAFE.y0, LINE);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);

  T('STEM RACING', 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
  T('20 m 直线 · 单位秒', 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: 'right' });

  T('成绩档案', 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
  T(`共 ${state.all.length} 站记录，按日期、用时或名次排`, 60, 392, {
    f: `400 17px ${MONO}`, color: MUTE,
  });

  T('记录 / RUNS', 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: 'right' });
  T(pad2(state.all.length), 930, 368, { f: `600 68px ${DISP}`, color: PAPER, a: 'right' });
}

function drawStrip() {
  rule(STRIP_Y, LINE);
  const sortLabel = SORTS.find(s => s.id === state.sort).label;
  const cols = [
    ['赛季', '2025 → 2026'],
    ['车型', 'CO₂ 组'],
    ['排序', sortLabel],
  ];
  const gap = 26;
  const w = (SAFE.x1 - SAFE.x0 - gap * (cols.length - 1)) / cols.length;

  cols.forEach(([k, v], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, STRIP_Y + 6, 486);
    T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(cut(v, 12), x, 476, { f: `500 21px ${MONO}`, color: PAPER });
  });
  rule(486, LINE_SOFT);

  // 表头
  T('赛事', SAFE.x0, 508, { f: `500 10px ${MONO}`, color: MUTE2 });
  T('日期', 172, 508, { f: `500 10px ${MONO}`, color: MUTE2 });
  T('车', 566, 508, { f: `500 10px ${MONO}`, color: MUTE2 });
  T('用时', 830, 508, { f: `500 10px ${MONO}`, color: MUTE2, a: 'right' });
  T('名次', 930, 508, { f: `500 10px ${MONO}`, color: MUTE2, a: 'right' });
}

function drawRows() {
  const { rows, rowH } = rowLayout(state.shown.length);
  const list = state.shown.slice(0, rows);

  for (let i = 0; i < rows; i++) {
    const y = ROW_Y0 + i * rowH;
    const r = list[i];

    if (i % 2 === 1) {
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
    }
    rule(y, LINE_SOFT);
    if (!r) continue;

    const best = r.place === 1;
    // 冠名站用橙色短杠标记，一眼能扫到
    if (best) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(SAFE.x0, y + rowH * 0.28, 3, rowH * 0.44);
    }

    const by = y + rowH * 0.63;
    T(cut(r.event, 11), best ? 78 : SAFE.x0, by, { f: `500 20px ${MONO}`, color: PAPER });
    T(md(r.date), 172, by, { f: `400 12px ${MONO}`, color: MUTE2 });
    T(r.car, 566, by, { f: `400 12px ${MONO}`, color: MUTE2 });
    T(sec3(r.time), 830, by, { f: `500 22px ${MONO}`, color: PAPER, a: 'right' });
    T(pad2(r.place), 930, by, {
      f: `500 13px ${MONO}`, color: best ? ACCENT : MUTE, a: 'right',
    });
  }
  rule(ROW_Y0 + rows * rowH, LINE);
}

/* 搜不到的时候照样把表格画满，不留空画布 */
function drawEmpty() {
  const { rows, rowH } = rowLayout(state.all.length);
  const y1 = ROW_Y0 + rows * rowH;

  for (let i = 0; i < rows; i++) {
    const y = ROW_Y0 + i * rowH;
    if (i % 2 === 1) {
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
    }
    rule(y, LINE_SOFT);
    T('- - -', SAFE.x0, y + rowH * 0.62, {
      f: `500 15px ${MONO}`, color: 'rgba(242,240,235,0.18)',
    });
    T('--/--', 172, y + rowH * 0.62, { f: `400 11px ${MONO}`, color: MUTE2 });
    T('--', 566, y + rowH * 0.62, { f: `400 11px ${MONO}`, color: MUTE2 });
  }

  const cy = ROW_Y0 + (y1 - ROW_Y0) / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(SAFE.x0, cy - 62, SAFE.x1 - SAFE.x0, 124);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, cy - 62, 3, 124);

  T('没有匹配的记录', 78, cy - 8, { f: `600 32px ${DISP}`, color: MUTE });
  T(`搜索「${state.q.trim() || '空'}」 · 档案里 ${state.all.length} 站`, 78, cy + 24, {
    f: `400 14px ${MONO}`, color: MUTE2,
  });
  T('换个赛事名或车号试试', 78, cy + 48, { f: `400 13px ${MONO}`, color: MUTE2 });

  rule(y1, LINE);
}

/* 用时趋势：不管表格怎么排，折线永远按日期从左到右 */
function drawChart() {
  rule(CH_HDR_Y, LINE);

  const asc = [...state.shown].sort((a, b) => (a.date < b.date ? -1 : 1));
  T('用时趋势', SAFE.x0, CH_HDR_Y + 26, { f: `500 11px ${MONO}`, color: MUTE2 });

  if (asc.length === 0) {
    T('无数据', SAFE.x1, CH_HDR_Y + 26, { f: `500 12px ${MONO}`, color: MUTE2, a: 'right' });
    rule(CH_Y1, LINE_SOFT);
    T('--', SAFE.x0, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2 });
    T('--', SAFE.x1, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2, a: 'right' });
    return;
  }

  const times = asc.map(r => r.time);
  const mn = Math.min(...times);
  const mx = Math.max(...times);
  const span = Math.max(mx - mn, 0.001);

  T(`${sec3(mn)} – ${sec3(mx)} s · ${asc.length} 站`, SAFE.x1, CH_HDR_Y + 26, {
    f: `400 11px ${MONO}`, color: MUTE2, a: 'right',
  });

  // 上下两条参考线
  rule(CH_Y0, LINE_SOFT);
  rule(CH_Y1, LINE);

  const px = i => (asc.length === 1
    ? (SAFE.x0 + SAFE.x1) / 2
    : SAFE.x0 + (SAFE.x1 - SAFE.x0) * i / (asc.length - 1));
  const py = t => CH_Y1 - (CH_Y1 - CH_Y0) * (t - mn) / span;

  // 每一站一条竖网格线。不画这个，折线就是一条飘在黑底上的细线
  asc.forEach((r, i) => {
    vrule(px(i), CH_Y0, CH_Y1, 'rgba(255,255,255,0.045)');
  });

  // 折线下方面积填一层极淡的橙，把趋势的体量撑起来
  ctx.beginPath();
  ctx.moveTo(px(0), CH_Y1);
  asc.forEach((r, i) => ctx.lineTo(px(i), py(r.time)));
  ctx.lineTo(px(asc.length - 1), CH_Y1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(232,89,12,0.14)';
  ctx.fill();

  // 折线
  ctx.beginPath();
  asc.forEach((r, i) => {
    const x = px(i), y = py(r.time);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 点：最后一站实心，其余空心
  asc.forEach((r, i) => {
    const x = px(i), y = py(r.time);
    const last = i === asc.length - 1;
    ctx.beginPath();
    ctx.arc(x, y, last ? 5 : 3, 0, Math.PI * 2);
    if (last) {
      ctx.fillStyle = ACCENT;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(242,240,235,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // 最后一站标个数值，省得人对刻度
  const last = asc[asc.length - 1];
  T(sec3(last.time), px(asc.length - 1), py(last.time) - 12, {
    f: `500 13px ${MONO}`, color: ACCENT, a: 'right',
  });

  T(asc[0].date, SAFE.x0, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2 });
  T(last.date, SAFE.x1, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2, a: 'right' });
}

function drawTally() {
  const y = TALLY_Y;
  rule(y, LINE);

  const times = state.all.map(r => r.time);
  const mn = Math.min(...times);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const wins = state.all.filter(r => r.place === 1).length;

  const gap = 26;
  const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
  const cols = [
    ['最快', `${sec3(mn)} s`],
    ['平均', `${sec3(avg)} s`],
    ['第一名', `${wins} 站`],
  ];
  cols.forEach(([k, v], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, y + 6, y + 74);
    T(k, x, y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, y + 70, { f: `500 26px ${MONO}`, color: PAPER });
  });

  T('全部为 20 m 直线；数据是队内记录，不是官方计时', 60, y + 104, {
    f: `400 11px ${MONO}`, color: MUTE2,
  });
  T(`显示 ${Math.min(state.shown.length, rowLayout(state.shown.length).rows)} / ${state.all.length}`,
    60, y + 136, { f: `400 14px ${MONO}`, color: MUTE });

  rule(FOOT_Y, LINE);
}

function drawFooter() {
  T('数据写死在 src/results.js · 不上传 · 不联网', 60, 1428, {
    f: `400 14px ${MONO}`, color: MUTE,
  });
  T('RESULT-ARCHIVE', 930, 1428, { f: `400 14px ${MONO}`, color: MUTE2, a: 'right' });
  T('示例数据，换成自己队记的表再发', 60, 1458, { f: `400 13px ${MONO}`, color: MUTE2 });
  T('1080 × 1920', 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: 'right' });
}

/* ---------- 面板 ---------- */
const $ = id => document.getElementById(id);
const elQ = $('q');
const elSorts = $('sorts');
const elQHit = $('qHit');
const elSTotal = $('sTotal');
const elSShown = $('sShown');
const elSSort = $('sSort');

for (const s of SORTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.sort = s.id;
  b.textContent = s.label;
  b.setAttribute('aria-pressed', String(s.id === state.sort));
  b.addEventListener('click', () => setSort(s.id));
  elSorts.appendChild(b);
}

function setSort(id) {
  state.sort = id;
  for (const b of elSorts.children) b.setAttribute('aria-pressed', String(b.dataset.sort === id));
  apply();
}

function syncPanel() {
  elQHit.textContent = String(state.shown.length);
  elSTotal.textContent = String(state.all.length);
  elSShown.textContent = String(state.shown.length);
  elSSort.textContent = SORTS.find(s => s.id === state.sort).label;
}

elQ.addEventListener('input', () => { state.q = elQ.value; apply(); });

/* ---------- 导出 ---------- */
async function rawBlob(w, h) {
  compose();
  const out = resample(stage, w, h);
  return await new Promise(r => out.toBlob(r, 'image/png'));
}

const PNG_MAGIC = '137,80,78,71,13,10,26,10';
async function probe(blob) {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return { size: blob.size, magic: head.join(',') === PNG_MAGIC };
}

async function exportProbe() {
  const v = await probe(await rawBlob(1080, 1920));
  const c = await probe(await rawBlob(1080, 1350));
  return { vertical: v, cover: c };
}

async function exportOne(w, h, name) {
  const b = await rawBlob(w, h);
  const p = await probe(b);
  if (!p.magic) throw new Error('不是合法 PNG');
  download(b, name);
  return b.size;
}

$('ex1').addEventListener('click', () => exportOne(1080, 1920, 'result-archive-1080x1920.png'));
$('ex2').addEventListener('click', () => exportOne(1080, 1350, 'result-archive-1080x1350.png'));

/* ---------- 启动 ---------- */
apply();

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
  getState: () => ({
    q: state.q, sort: state.sort,
    shown: state.shown.map(r => `${r.date} ${r.event} ${r.time}`),
    total: state.all.length,
  }),
  stats: () => ({ q: state.q, sort: state.sort, shown: state.shown.length, total: state.all.length }),
  // 原始行，给门禁验排序用；字符串版看不出名次
  rows: () => state.shown.map(r => ({ ...r })),
  setQuery: s => { state.q = String(s); elQ.value = state.q; apply(); },
  setSort,
  reset: () => { state.q = ''; elQ.value = ''; setSort('date'); },
  selfTest: () => {
    const errs = [];
    if (state.shown.length > state.all.length) errs.push('显示数超过总数');
    if (state.sort === 'date' && state.shown.length > 1) {
      for (let i = 1; i < state.shown.length; i++) {
        if (state.shown[i].date > state.shown[i - 1].date) { errs.push('日期没有从新到旧'); break; }
      }
    }
    if (state.sort === 'time' && state.shown.length > 1) {
      for (let i = 1; i < state.shown.length; i++) {
        if (state.shown[i].time < state.shown[i - 1].time) { errs.push('用时没有从快到慢'); break; }
      }
    }
    if (state.sort === 'place' && state.shown.length > 1) {
      for (let i = 1; i < state.shown.length; i++) {
        if (state.shown[i].place < state.shown[i - 1].place) { errs.push('名次没有从好到差'); break; }
      }
    }
    const q = state.q.trim().toLowerCase();
    if (q && state.shown.some(r =>
      !(r.event.toLowerCase().includes(q) || r.car.toLowerCase().includes(q)))) {
      errs.push('搜索结果里混进了不匹配的记录');
    }
    if (stage.width !== 1080 || stage.height !== 1920) errs.push('画布不是 1080×1920');
    return { ok: errs.length === 0, errs };
  },
  exportProbe,
  exportPNG: async () => (await rawBlob(1080, 1920)).size,
  exportCover: async () => (await rawBlob(1080, 1350)).size,
  inkPct,
  preview: () => { state.q = ''; elQ.value = ''; setSort('date'); },
};
