/* race-calendar —— 赛历
   赛场次和日期来自 ./races.js 这个本地常量。
   状态不用写死：按这台机器的本地日期算出来。
   倒计时不查任何时间服务器，Date.now() 就是全部依据。 */

import { resample, download } from './reel-export.js';
import { RACES, SEASON } from './races.js';

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
const LIVE_BG = 'rgba(232,89,12,0.13)';

/* 版面骨架 */
const STRIP_Y = 412;
const TL_Y0 = 500;
const TL_Y1 = 1232;
const SPINE_X = 72;
const TEXT_X = 106;
const TALLY_Y = 1232;
const FOOT_Y = 1394;

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'done', label: '已完赛' },
  { id: 'live', label: '进行中' },
  { id: 'next', label: '待开赛' },
];

const state = {
  now: Date.now(),
  filter: 'all',
  rows: [],
};

/* 抬头那个大数字实际画出去的值，门禁拿它断言「屏幕上写的」 */
let hdr = 0;

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

/* ---------- 日期：只用本地日历，不做时区换算 ---------- */
function dayNum(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function localDayNum(ts) {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
function ymdOf(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const md = s => `${s.slice(5, 7)}/${s.slice(8, 10)}`;

/* ---------- 状态 ---------- */
function build(now) {
  const today = localDayNum(now);
  return RACES.map(r => {
    const s = dayNum(r.start), e = dayNum(r.end);
    let status;
    if (today < s) status = 'next';
    else if (today > e) status = 'done';
    else status = 'live';

    let right;
    if (status === 'next') right = `还有 ${s - today} 天`;
    else if (status === 'live') right = `第 ${today - s + 1} / ${e - s + 1} 天`;
    else right = `${today - e} 天前`;

    const span = r.start === r.end ? md(r.start) : `${md(r.start)}–${md(r.end)}`;
    return { ...r, status, right, span, today };
  });
}

const LABEL = { done: '已完赛', live: '进行中', next: '待开赛' };

/* 汇总口径：数的是「当前筛选出来的这批」，不是整个赛季 */
function countsOf(rows) {
  const c = { done: 0, live: 0, next: 0 };
  for (const r of rows) c[r.status]++;
  return c;
}

function apply() {
  const all = build(state.now);
  state.rows = state.filter === 'all' ? all : all.filter(r => r.status === state.filter);
  compose();
  syncPanel();
}

function rowLayout(n) {
  const rows = Math.max(n, 1);
  const rowH = Math.min(92, Math.floor((TL_Y1 - TL_Y0) / rows));
  return { rows: n, rowH };
}

/* ---------- 画 ---------- */
function compose() {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  drawTopBand();
  drawHeader();
  drawStrip();
  if (state.rows.length === 0) drawEmpty();
  else drawTimeline();
  drawTally();
  drawFooter();
}

function drawTopBand() {
  rule(104, LINE_SOFT);
  T('SEASON PLAN', 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
  T('日期按本机日历算', 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: 'right' });

  ctx.fillStyle = 'rgba(242,240,235,0.055)';
  ctx.font = `700 150px ${DISP}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SEASON', 930, 236);
}

function drawHeader() {
  rule(SAFE.y0, LINE);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);

  T('STEM RACING', 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
  T(ymdOf(state.now), 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: 'right' });

  T('赛历', 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
  T('一场一行，进行中的那一场单独标出来', 60, 392, {
    f: `400 17px ${MONO}`, color: MUTE,
  });

  // 场次跟着筛选走：筛完只剩几场，这里就写几场
  const n = state.rows.length;
  hdr = n;
  T(state.filter === 'all' ? '场次 / EVENTS' : '筛选后 / SHOWN', 930, 288, {
    f: `500 11px ${MONO}`, color: MUTE2, a: 'right',
  });
  T(n === 0 ? '0' : String(n).padStart(2, '0'), 930, 368, {
    f: `600 68px ${DISP}`, color: n === 0 ? MUTE2 : PAPER, a: 'right',
  });
}

function drawStrip() {
  rule(STRIP_Y, LINE);

  const all = build(state.now);
  const nextRace = all.find(r => r.status !== 'done');
  const cols = [
    ['赛季', SEASON],
    ['今天', ymdOf(state.now)],
    ['下一场', nextRace ? nextRace.span : '无'],
  ];
  const gap = 26;
  const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;

  cols.forEach(([k, v], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, STRIP_Y + 6, 486);
    T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, 476, { f: `500 21px ${MONO}`, color: PAPER });
  });
  rule(486, LINE_SOFT);
}

function drawTimeline() {
  const { rows, rowH } = rowLayout(state.rows.length);
  const yEnd = TL_Y0 + rows * rowH;

  // 竖脊线：整条时间轴的骨架
  vrule(SPINE_X, TL_Y0, yEnd, 'rgba(255,255,255,0.10)');

  state.rows.forEach((r, i) => {
    const y = TL_Y0 + i * rowH;
    const live = r.status === 'live';

    if (live) {
      ctx.fillStyle = LIVE_BG;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
    } else if (i % 2 === 1) {
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
    }
    rule(y, LINE_SOFT);

    // 节点：进行中是实心橙方，已完赛是空心小方，待开赛是空心白方
    const nx = SPINE_X - (live ? 6 : 4);
    if (live) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(nx, y + rowH / 2 - 6, 13, 13);
    } else {
      ctx.strokeStyle = r.status === 'done' ? MUTE2 : 'rgba(242,240,235,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(nx + 0.5, y + rowH / 2 - 3.5, 8, 8);
    }

    const l1 = y + rowH * 0.42;
    const l2 = y + rowH * 0.76;

    T(r.span, TEXT_X, l1, { f: `400 13px ${MONO}`, color: MUTE2 });
    T(`· ${r.place}`, TEXT_X + 112, l1, { f: `400 12px ${MONO}`, color: MUTE2 });

    T(r.name, TEXT_X, l2, {
      f: `500 22px ${MONO}`,
      color: r.status === 'done' ? MUTE : PAPER,
    });

    T(LABEL[r.status], SAFE.x1, l1, {
      f: `500 12px ${MONO}`,
      color: live ? ACCENT : MUTE2,
      a: 'right',
    });
    T(r.right, SAFE.x1, l2, {
      f: `500 15px ${MONO}`,
      color: live ? ACCENT : MUTE,
      a: 'right',
    });
  });

  rule(yEnd, LINE);
}

/* 筛选后一场都没有：照样画骨线和说明，不留空画布 */
function drawEmpty() {
  const n = RACES.length;
  const rowH = Math.min(92, Math.floor((TL_Y1 - TL_Y0) / n));
  const yEnd = TL_Y0 + n * rowH;

  vrule(SPINE_X, TL_Y0, yEnd, 'rgba(255,255,255,0.08)');

  for (let i = 0; i < n; i++) {
    const y = TL_Y0 + i * rowH;
    if (i % 2 === 1) {
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
    }
    rule(y, LINE_SOFT);
    ctx.strokeStyle = 'rgba(242,240,235,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(SPINE_X - 3.5, y + rowH / 2 - 3.5, 8, 8);
    T('- -', TEXT_X, y + rowH * 0.42, { f: `400 13px ${MONO}`, color: 'rgba(242,240,235,0.16)' });
    T('- - - - -', TEXT_X, y + rowH * 0.76, { f: `500 22px ${MONO}`, color: 'rgba(242,240,235,0.16)' });
  }

  const cy = TL_Y0 + (yEnd - TL_Y0) / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(SAFE.x0, cy - 60, SAFE.x1 - SAFE.x0, 120);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, cy - 60, 3, 120);

  const label = FILTERS.find(f => f.id === state.filter).label;
  T(`没有${{ done: '已完赛', live: '进行中', next: '待开赛' }[state.filter]}的比赛`, 78, cy - 6, {
    f: `600 32px ${DISP}`, color: MUTE,
  });
  T(`筛选「${label}」 · 赛季里共 ${RACES.length} 场，今天 ${ymdOf(state.now)}`, 78, cy + 24, {
    f: `400 14px ${MONO}`, color: MUTE2,
  });
  T('点回「全部」就都回来了', 78, cy + 48, { f: `400 13px ${MONO}`, color: MUTE2 });

  rule(yEnd, LINE);
}

function drawTally() {
  const y = TALLY_Y;
  rule(y, LINE);

  // 三列数的是当前筛选出来的这批，不是整个赛季
  const counts = countsOf(state.rows);

  const gap = 26;
  const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
  const cols = [
    ['已完赛', counts.done, MUTE],
    ['进行中', counts.live, ACCENT],
    ['待开赛', counts.next, PAPER],
  ];
  cols.forEach(([k, v, c], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, y + 6, y + 74);
    T(k, x, y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(String(v), x, y + 70, { f: `500 26px ${MONO}`, color: c });
  });

  T('状态按本机日期算，不联网校时', 60, y + 104, {
    f: `400 11px ${MONO}`, color: MUTE2,
  });
  const shown = state.rows.length;
  T(shown === 0
    ? `显示 0 / ${RACES.length} 场 · 这个筛选下没有比赛`
    : `显示 ${shown} / ${RACES.length} 场`, 60, y + 136, {
    f: `400 14px ${MONO}`, color: MUTE,
  });

  rule(FOOT_Y, LINE);
}

function drawFooter() {
  T('赛程写在 src/races.js · 不上传 · 不联网', 60, 1428, {
    f: `400 14px ${MONO}`, color: MUTE,
  });
  T('RACE-CALENDAR', 930, 1428, { f: `400 14px ${MONO}`, color: MUTE2, a: 'right' });
  T('日期是校历编的，用前先换成真的通知', 60, 1458, {
    f: `400 13px ${MONO}`, color: MUTE2,
  });
  T('1080 × 1920', 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: 'right' });
}

/* ---------- 面板 ---------- */
const $ = id => document.getElementById(id);
const elNow = $('now');
const elFilters = $('filters');
const elDone = $('sDone');
const elLive = $('sLive');
const elNext = $('sNext');

for (const f of FILTERS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.filter = f.id;
  b.textContent = f.label;
  b.setAttribute('aria-pressed', String(f.id === state.filter));
  b.addEventListener('click', () => setFilter(f.id));
  elFilters.appendChild(b);
}

function setFilter(id) {
  state.filter = id;
  for (const b of elFilters.children) b.setAttribute('aria-pressed', String(b.dataset.filter === id));
  apply();
}

function syncPanel() {
  elNow.textContent = ymdOf(state.now);
  const c = countsOf(state.rows);
  elDone.textContent = String(c.done);
  elLive.textContent = String(c.live);
  elNext.textContent = String(c.next);
}

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

$('ex1').addEventListener('click', () => exportOne(1080, 1920, 'race-calendar-1080x1920.png'));
$('ex2').addEventListener('click', () => exportOne(1080, 1350, 'race-calendar-1080x1350.png'));

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
  rows: () => state.rows.map(r => ({
    name: r.name, span: r.span, status: r.status, right: r.right,
  })),
  stats: () => ({
    filter: state.filter, shown: state.rows.length, header: hdr, total: RACES.length, ymd: ymdOf(state.now),
    ...countsOf(state.rows),
  }),
  // 门禁靠这个把「今天」钉死，否则测出来的结果每天都变
  setNow: ts => { state.now = Number(ts); apply(); },
  today: () => state.now,
  setFilter,
  reset: () => { state.now = Date.now(); setFilter('all'); },
  selfTest: () => {
    const errs = [];
    const today = localDayNum(state.now);
    for (const r of build(state.now)) {
      const s = dayNum(r.start), e = dayNum(r.end);
      const want = today < s ? 'next' : today > e ? 'done' : 'live';
      if (r.status !== want) errs.push(`${r.name} 状态 ${r.status}，按日期应该是 ${want}`);
      if (want === 'next' && r.right !== `还有 ${s - today} 天`) {
        errs.push(`${r.name} 倒计时写成「${r.right}」`);
      }
    }
    const order = build(state.now).map(r => r.start);
    for (let i = 1; i < order.length; i++) {
      if (order[i] < order[i - 1]) { errs.push('赛程没有按日期排'); break; }
    }
    if (stage.width !== 1080 || stage.height !== 1920) errs.push('画布不是 1080×1920');
    return { ok: errs.length === 0, errs };
  },
  exportProbe,
  exportPNG: async () => (await rawBlob(1080, 1920)).size,
  exportCover: async () => (await rawBlob(1080, 1350)).size,
  inkPct,
  preview: () => { state.now = Date.now(); setFilter('all'); },
};
