/* team-directory —— 队员名录
   数据全部来自 ./team.js 这个本地常量，页面不读外部文件、不联网。
   面板负责筛选，画布只负责出一张 1080×1920 的卡。 */

import { resample, download } from './reel-export.js';
import { TEAM, ROLES } from './team.js';

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
const ROW_Y0 = 496;
const ROW_AREA = 736;                 // 496 → 1232，表格可用的高度
const ROW_MAX_H = 92;                 // 人少时一行给足
const ROW_MIN_H = 56;                 // 人多时最多压到这里，再多就截断
const TALLY_Y = 1232;
const FOOT_Y = 1394;

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const state = {
  q: '',
  role: '全部',
  all: TEAM,
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

/* ---------- 筛选 ---------- */
function apply() {
  const q = state.q.trim().toLowerCase();
  state.shown = state.all.filter(m =>
    (state.role === '全部' || m.role === state.role) &&
    (!q || m.name.toLowerCase().includes(q)
        || m.role.toLowerCase().includes(q)
        || m.line.toLowerCase().includes(q)));
  compose();
  syncPanel();
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
  drawTally();
  drawFooter();
}

/* 0–240 是 IG 状态栏死区，只放水印 */
function drawTopBand() {
  rule(104, LINE_SOFT);
  T('ROSTER SHEET', 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
  T('本机数据 · 无网络', 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: 'right' });

  ctx.fillStyle = 'rgba(242,240,235,0.055)';
  ctx.font = `700 150px ${DISP}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ROSTER', 930, 236);
}

function drawHeader() {
  rule(SAFE.y0, LINE);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);

  T('STEM RACING', 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
  T('本机数据 · 无网络', 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: 'right' });

  T('队员名录', 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
  T('按角色筛选，按姓名、角色或一句话搜索', 60, 392, { f: `400 17px ${MONO}`, color: MUTE });

  T('在册 / MEMBERS', 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: 'right' });
  T(pad2(state.all.length), 930, 368, { f: `600 68px ${DISP}`, color: PAPER, a: 'right' });
}

function drawStrip() {
  rule(STRIP_Y, LINE);
  const cols = [
    ['赛季', '2026 秋季'],
    ['筛选', state.role],
    ['显示', `${Math.min(state.shown.length, rowLayout(state.shown.length).rows)} / ${state.all.length}`],
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
}

/* 行高跟着人数走：人少就用满 92px，人多就压到 56px 为止。
   最多能塞 13 行，超出去的部分不画，靠 footer 那句提示。 */
function rowLayout(n) {
  const rows = Math.min(n, Math.floor(ROW_AREA / ROW_MIN_H));
  const rowH = Math.min(ROW_MAX_H, Math.floor(ROW_AREA / Math.max(rows, 1)));
  return { rows: Math.max(rows, 0), rowH };
}

function drawRows() {
  const { rows, rowH } = rowLayout(state.shown.length);
  const list = state.shown.slice(0, rows);

  for (let i = 0; i < rows; i++) {
    const y = ROW_Y0 + i * rowH;
    const m = list[i];

    if (i % 2 === 1) {
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
    }
    rule(y, LINE_SOFT);
    if (!m) continue;

    const lead = m.role === '队长';
    ctx.fillStyle = lead ? ACCENT : 'rgba(242,240,235,0.20)';
    ctx.fillRect(SAFE.x0, y + 18, 3, rowH - 36);

    T(pad2(i + 1), 76, y + rowH * 0.46, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(m.name, 110, y + rowH * 0.46, { f: `600 25px ${MONO}`, color: PAPER });
    T(m.role, 930, y + rowH * 0.46, {
      f: `500 12px ${MONO}`, color: lead ? ACCENT : MUTE, a: 'right',
    });
    T(cut(m.line, 22), 110, y + rowH * 0.74, { f: `400 13px ${MONO}`, color: MUTE });
    T(m.join, 930, y + rowH * 0.74, { f: `400 12px ${MONO}`, color: MUTE2, a: 'right' });
  }
  rule(ROW_Y0 + rows * rowH, LINE);
}

/* 搜不到人的时候不能留一张空卡。
   做法：照样画 8 条空行（隔行底纹 + 行号 + 破折号），
   中间再压一条说明。这样版面仍然是一张满的表格，不会变成空画布。 */
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
    T(pad2(i + 1), 76, y + rowH * 0.46, { f: `500 11px ${MONO}`, color: MUTE2 });
    T('- - -', 110, y + rowH * 0.46, { f: `500 22px ${MONO}`, color: 'rgba(242,240,235,0.18)' });
    T('--', 930, y + rowH * 0.46, { f: `500 12px ${MONO}`, color: MUTE2, a: 'right' });
  }

  // 中间压一块底色，把底纹打断，字才读得出来
  const cy = ROW_Y0 + (y1 - ROW_Y0) / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(SAFE.x0, cy - 74, SAFE.x1 - SAFE.x0, 148);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, cy - 74, 3, 148);

  T('没有匹配的队员', 76, cy - 14, { f: `600 34px ${DISP}`, color: MUTE });
  T(`筛选「${state.role}」 · 搜索「${state.q.trim() || '空'}」 · 在册 ${state.all.length} 人`, 76, cy + 22, {
    f: `400 14px ${MONO}`, color: MUTE2,
  });
  T('清掉筛选和搜索词就回来', 76, cy + 50, { f: `400 13px ${MONO}`, color: MUTE2 });

  rule(y1, LINE);
}

function drawTally() {
  const y = TALLY_Y;
  rule(y, LINE);

  const gap = 26;
  const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
  const first = state.all.reduce((a, b) => (a.join < b.join ? a : b), state.all[0]);
  const cols = [
    ['显示', String(state.shown.length)],
    ['在册', String(state.all.length)],
    ['最早入队', first ? first.join : '--'],
  ];
  cols.forEach(([k, v], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, y + 6, y + 74);
    T(k, x, y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, y + 70, { f: `500 26px ${MONO}`, color: PAPER });
  });

  const tally = ROLES
    .map(r => `${r} ${state.all.filter(m => m.role === r).length}`)
    .join(' · ');
  T('角色分布', 60, y + 104, { f: `500 11px ${MONO}`, color: MUTE2 });
  T(tally, 60, y + 136, { f: `400 15px ${MONO}`, color: MUTE });

  rule(FOOT_Y, LINE);
}

function drawFooter() {
  const { rows } = rowLayout(state.shown.length);
  const over = state.shown.length - rows;
  T('数据写死在 src/team.js · 不上传 · 不联网', 60, 1428, {
    f: `400 14px ${MONO}`, color: MUTE,
  });
  T('TEAM-DIRECTORY', 930, 1428, { f: `400 14px ${MONO}`, color: MUTE2, a: 'right' });
  // 人在 13 个以上的时候这张卡放不下，得说清楚，别让人以为全在上面
  T(over > 0 ? `还有 ${over} 人没上卡` : '示例名单，换成自己队的再发', 60, 1458, {
    f: `400 13px ${MONO}`, color: over > 0 ? ACCENT : MUTE2,
  });
  T('1080 × 1920', 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: 'right' });
}

/* ---------- 面板 ---------- */
const $ = id => document.getElementById(id);
const elQ = $('q');
const elRoles = $('roles');
const elQHit = $('qHit');
const elSTotal = $('sTotal');
const elSShown = $('sShown');
const elSRole = $('sRole');

for (const r of ['全部', ...ROLES]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.role = r;
  b.textContent = r;
  b.setAttribute('aria-pressed', String(r === state.role));
  b.addEventListener('click', () => setRole(r));
  elRoles.appendChild(b);
}

function setRole(r) {
  state.role = r;
  for (const b of elRoles.children) b.setAttribute('aria-pressed', String(b.dataset.role === r));
  apply();
}

function syncPanel() {
  elQHit.textContent = String(state.shown.length);
  elSTotal.textContent = String(state.all.length);
  elSShown.textContent = String(state.shown.length);
  elSRole.textContent = state.q.trim() ? `${state.role} + 搜索` : state.role;
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

$('ex1').addEventListener('click', () => exportOne(1080, 1920, 'team-directory-1080x1920.png'));
$('ex2').addEventListener('click', () => exportOne(1080, 1350, 'team-directory-1080x1350.png'));

/* ---------- 启动 ---------- */
apply();

/* ---------- 测试钩子 ---------- */
window.__app = {
  canvas: stage,
  getState: () => ({ q: state.q, role: state.role,
                     shown: state.shown.map(m => m.name), total: state.all.length }),
  stats: () => ({ q: state.q, role: state.role,
                  shown: state.shown.length, total: state.all.length }),
  setQuery: s => { state.q = String(s); elQ.value = state.q; apply(); },
  setRole,
  reset: () => { state.q = ''; elQ.value = ''; setRole('全部'); },
  selfTest: () => {
    const errs = [];
    if (state.all.length !== TEAM.length) errs.push('在册人数和数据源不一致');
    if (state.shown.length > state.all.length) errs.push('显示人数超过在册人数');
    if (state.role !== '全部' && state.shown.some(m => m.role !== state.role)) {
      errs.push('筛选结果里混进了别的角色');
    }
    const q = state.q.trim().toLowerCase();
    if (q && state.shown.some(m =>
      !(m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
        || m.line.toLowerCase().includes(q)))) {
      errs.push('搜索结果里混进了不含关键词的人');
    }
    if (stage.width !== 1080 || stage.height !== 1920) errs.push('画布不是 1080×1920');
    return { ok: errs.length === 0, errs };
  },
  exportProbe,
  exportPNG: async () => (await rawBlob(1080, 1920)).size,
  exportCover: async () => (await rawBlob(1080, 1350)).size,
  inkPct: () => {
    const d = ctx.getImageData(SAFE.x0, SAFE.y0, SAFE.x1 - SAFE.x0, SAFE.y1 - SAFE.y0).data;
    let ink = 0, tot = 0;
    for (let i = 0; i < d.length; i += 4) {
      tot++;
      if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 24) ink++;
    }
    return +(ink / tot * 100).toFixed(2);
  },
};
