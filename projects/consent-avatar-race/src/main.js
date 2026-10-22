/* consent-avatar-race —— 起跑线
   重做版：不下载、不抓取任何真人照片。
   照片只能由用户在本机用 <input type=file> 选，只在内存里裁成圆形头像。

   落盘边界（这个文件里能控制的部分）：
   - 不调用 fetch / XMLHttpRequest / sendBeacon
   - 不写 localStorage / sessionStorage / indexedDB
   - 每个 URL.createObjectURL 都在同一个 try/finally 里 revoke
   - 解码出的 Image 不保留引用，只保留裁好的离屏 canvas
   - 文件名不显示、也不带进导出图（文件名本身可能就是真名）

   改这里之前先读 README 的「怎么保证不落盘」。 */

import { resample, download, mulberry32 } from './reel-export.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC","Microsoft YaHei",sans-serif';

const ACCENT = '#e8590c';
const INK = '#0b0b0c';
const INK2 = '#151517';
const PAPER = '#f2f0eb';
const LINE = 'rgba(255,255,255,0.14)';
const LINE_SOFT = 'rgba(255,255,255,0.075)';
const MUTE = 'rgba(242,240,235,0.55)';
const MUTE2 = 'rgba(242,240,235,0.32)';
const ZEBRA = 'rgba(242,240,235,0.07)';

const SLOTS = 8;

/* 版面骨架：全部落在安全区 x 60–930 / y 240–1480 内 */
const STRIP_Y = 412;
const LANE_Y0 = 500;
const LANE_Y1 = 1220;
const LANE_H = (LANE_Y1 - LANE_Y0) / SLOTS;   // 90
const RESULT_Y = LANE_Y1;
const FOOT_Y = 1394;

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const state = {
  seed: 0xC0FFEE,
  consent: false,
  // 甲乙丙丁是占位符，不是真人；真名由使用者在面板里自己填
  names: ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'],
  crops: [],       // 只存裁好的 256x256 离屏 canvas，不存 Image / File
  slots: [],
  results: null,
  heat: 1,
  objectUrlCreated: 0,
  objectUrlRevoked: 0,
  blockedRuns: 0,
};

/* ---------- 文本小工具：每次重置对齐，避免上一次的 textAlign 漏到下一次 ---------- */
function T(str, x, y, { f = `500 16px ${MONO}`, color = PAPER, a = 'left' } = {}) {
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = a;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function rule(y, color = LINE_SOFT, x0 = SAFE.x0, x1 = SAFE.x1) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, x1 - x0, 1);
}

function vrule(x, y0, y1, color = LINE_SOFT) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y0, 1, y1 - y0);
}

const pad2 = n => String(n).padStart(2, '0');
const fmt = t => (t == null ? '--.---' : t.toFixed(3));
const hex6 = n => '0x' + n.toString(16).toUpperCase().padStart(6, '0');

/* ---------- 槽位 ---------- */
function rebuild() {
  const names = state.names;
  const count = Math.min(SLOTS, Math.max(names.length, state.crops.length, 1));
  const slots = [];
  for (let i = 0; i < SLOTS; i++) {
    if (i >= count) { slots.push({ kind: 'empty' }); continue; }
    const name = (names[i] || '').trim() || `P${pad2(i + 1)}`;
    if (i < state.crops.length) slots.push({ kind: 'photo', crop: state.crops[i], name });
    else slots.push({ kind: 'block', name });
  }
  state.slots = slots;
  state.results = null;      // 名单变了，上一次的名次作废
  compose();
  syncPanel();
}

/* ---------- 发车：确定性伪随机，同种子同结果 ---------- */
function race() {
  if (!state.consent) {      // 没勾同意：按钮本来就是 disabled，这里再兜一层
    state.blockedRuns++;
    syncPanel();
    return false;
  }

  const rand = mulberry32(state.seed);
  const rows = [];
  for (let i = 0; i < SLOTS; i++) {
    const s = state.slots[i];
    if (!s || s.kind === 'empty') continue;
    // 20 m 直线的示意用时：基准 1.12 s，随机波动，再叠一点起跑反应
    const t = 1.12 + (rand() - 0.5) * 0.18 + rand() * 0.07;
    rows.push({ i, t, name: s.name });
  }
  if (!rows.length) return false;

  const order = [...rows].sort((a, b) => a.t - b.t);
  order.forEach((r, k) => { r.rank = k + 1; });

  const tMin = order[0].t;
  const tMax = order[order.length - 1].t;
  const span = tMax - tMin;
  for (const r of rows) {
    r.prog = span < 1e-6 ? 1 : 0.15 + (1 - (r.t - tMin) / span) * 0.85;
  }

  const bySlot = new Array(SLOTS).fill(null);
  for (const r of rows) bySlot[r.i] = r;

  state.results = { rows: bySlot, winner: order[0] };
  state.heat++;
  compose();
  syncPanel();
  return true;
}

/* ---------- 画：斜线阴影（空位） ---------- */
function hatch(x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1;
  for (let i = -h; i < w + h; i += 11) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAvatar(cx, cy, r, slot) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (slot.kind === 'photo') {
    ctx.drawImage(slot.crop, cx - r, cy - r, r * 2, r * 2);
  } else if (slot.kind === 'block') {
    ctx.fillStyle = INK2;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const ch = [...slot.name][0] || '?';   // 只画首字，长名字不会把圆撑变形
    T(ch.toUpperCase(), cx, cy + 1, { f: `700 26px ${MONO}`, color: PAPER, a: 'center' });
  } else {
    ctx.fillStyle = 'rgba(242,240,235,0.04)';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    hatch(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();

  ctx.strokeStyle = slot.kind === 'empty' ? 'rgba(255,255,255,0.16)' : 'rgba(242,240,235,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

/* ---------- 画：整张卡 ---------- */
function compose() {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  drawTopBand();
  drawHeader();
  drawStrip();
  drawLanes();
  drawResult();
  drawFooter();
}

/* 0–240 是 IG 状态栏死区，只放水印和极淡的批次号 */
function drawTopBand() {
  rule(104, LINE_SOFT);
  T('RACE SHEET', 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
  T('本机渲染 · 无网络', 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: 'right' });

  ctx.fillStyle = 'rgba(242,240,235,0.055)';
  ctx.font = `700 150px ${DISP}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(state.heat).padStart(2, '0'), 872, 236);

  T('HEAT', 930, 236, { f: `500 12px ${MONO}`, color: MUTE2, a: 'right' });
}

function drawHeader() {
  rule(SAFE.y0, LINE);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);

  T('STEM RACING', 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
  T('本机渲染 · 无网络', 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: 'right' });

  T('起跑线', 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
  T('照片只在这台机器上，刷新就没了', 60, 392, { f: `400 17px ${MONO}`, color: MUTE });

  // 右上大号道数：计时表上「本组几条道」就是这个位置
  T('道 / LANES', 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: 'right' });
  T(pad2(SLOTS), 930, 368, { f: `600 68px ${DISP}`, color: PAPER, a: 'right' });
}

/* 三列信息条：计时表抬头那种东西 */
function drawStrip() {
  rule(STRIP_Y, LINE);
  const cols = [
    ['赛事', '校内测试 #4'],
    ['赛道', '20 m 直线'],
    ['用时来源', '伪随机 · 可复现'],
  ];
  const gap = 26;
  const w = (SAFE.x1 - SAFE.x0 - gap * (cols.length - 1)) / cols.length;

  cols.forEach(([k, v], i) => {
    const x = SAFE.x0 + i * (w + gap);
    if (i > 0) vrule(x - gap / 2, STRIP_Y + 6, 486);
    T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(v, x, 476, { f: `500 21px ${MONO}`, color: PAPER });
  });
  rule(486, LINE_SOFT);
}

function drawLanes() {
  for (let i = 0; i < SLOTS; i++) {
    const y = LANE_Y0 + i * LANE_H;
    const slot = state.slots[i] || { kind: 'empty' };

    if (i % 2 === 1) {          // 隔行底纹：计时表本来就这么读
      ctx.fillStyle = ZEBRA;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, LANE_H);
    }
    rule(y, LINE_SOFT);

    drawAvatar(92, y + 44, 28, slot);

    const res = state.results ? state.results.rows[i] : null;

    if (slot.kind === 'empty') {
      T('空位', 138, y + 48, { f: `500 14px ${MONO}`, color: MUTE2 });
      T('--.---', 930, y + 39, { f: `500 22px ${MONO}`, color: MUTE2, a: 'right' });
      continue;
    }

    T(slot.name, 138, y + 39, { f: `600 23px ${MONO}`, color: PAPER });
    T(slot.kind === 'photo' ? '本机照片' : '色块', 138, y + 58, {
      f: `400 11.5px ${MONO}`, color: MUTE2,
    });

    T(res ? fmt(res.t) : '--.---', 930, y + 39, {
      f: `500 22px ${MONO}`, color: res ? PAPER : MUTE2, a: 'right',
    });
    T(res ? `P${res.rank}` : '待发车', 930, y + 58, {
      f: `500 11.5px ${MONO}`,
      color: res && res.rank === 1 ? ACCENT : MUTE2,
      a: 'right',
    });

    // 相对位置条：6px 才看得见，3px 在手机上是噪点
    const bx = 138, bw = SAFE.x1 - bx, by = y + 72;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(bx, by, bw, 6);
    if (res) {
      ctx.fillStyle = res.rank === 1 ? ACCENT : 'rgba(242,240,235,0.55)';
      ctx.fillRect(bx, by, Math.max(6, bw * res.prog), 6);
    }
  }
  rule(LANE_Y1, LINE);
}

function drawResult() {
  const w = state.results && state.results.winner;
  const y = RESULT_Y;

  vrule(590, y + 22, y + 150);

  T('WINNER', 60, y + 38, { f: `500 11px ${MONO}`, color: MUTE2 });
  if (w) {
    T(w.name, 60, y + 78, { f: `600 44px ${DISP}`, color: PAPER });
    T(fmt(w.t), 60, y + 118, { f: `600 34px ${MONO}`, color: ACCENT });
    ctx.font = `600 34px ${MONO}`;
    const tw = ctx.measureText(fmt(w.t)).width;
    T('s', 60 + tw + 8, y + 118, { f: `500 15px ${MONO}`, color: MUTE2 });
  } else {
    T('待发车', 60, y + 78, { f: `600 44px ${DISP}`, color: MUTE2 });
    T('--.---', 60, y + 118, { f: `600 34px ${MONO}`, color: MUTE2 });
  }
  T('20 m 直线', 60, y + 148, { f: `400 12px ${MONO}`, color: MUTE2 });

  const rx = SAFE.x1;
  T('SEED', rx, y + 38, { f: `500 11px ${MONO}`, color: MUTE2, a: 'right' });
  T(hex6(state.seed), rx, y + 70, { f: `500 21px ${MONO}`, color: PAPER, a: 'right' });
  T('判定', rx, y + 102, { f: `500 11px ${MONO}`, color: MUTE2, a: 'right' });
  T('固定种子', rx, y + 130, { f: `500 21px ${MONO}`, color: PAPER, a: 'right' });
  T('名次由种子决定，不是实测', rx, y + 152, {
    f: `400 11.5px ${MONO}`, color: MUTE2, a: 'right',
  });
}

function drawFooter() {
  rule(FOOT_Y, LINE);
  T('内存内处理 · 不上传 · 不写盘 · 刷新即失效', 60, 1428, {
    f: `400 14px ${MONO}`, color: MUTE,
  });
  T('CONSENT-AVATAR-RACE', 930, 1428, {
    f: `400 14px ${MONO}`, color: MUTE2, a: 'right',
  });
  T('版式沿用队内计时表', 60, 1458, { f: `400 13px ${MONO}`, color: MUTE2 });
  T('1080 × 1920', 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: 'right' });
}

/* ---------- 照片入口：唯一入口，且全程在内存里 ---------- */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('decode failed'));
    im.src = url;
  });
}

/** 居中裁成正方形并缩到 256，之后原图就可以丢 */
function cropSquare(img, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c = cv.getContext('2d');
  const iw = img.naturalWidth || size;
  const ih = img.naturalHeight || size;
  const s = Math.min(iw, ih);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, size, size);
  return cv;
}

let loadError = false;

async function addFiles(fileList) {
  loadError = false;
  const files = [...fileList].filter(f => String(f.type).startsWith('image/'));
  for (const f of files) {
    if (state.crops.length >= SLOTS) break;
    const url = URL.createObjectURL(f);
    state.objectUrlCreated++;
    try {
      const img = await loadImage(url);
      state.crops.push(cropSquare(img, 256));
      // img 出了作用域没人引用，GC 就收走；我们只留裁剪结果
    } catch {
      loadError = true;
    } finally {
      URL.revokeObjectURL(url);   // 成功失败都回收，不许留悬空 blob
      state.objectUrlRevoked++;
    }
  }
  rebuild();
}

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const elConsent = $('consent');
const elFile = $('file');
const elNames = $('names');
const elRace = $('race');
const elClear = $('clear');
const elReseed = $('reseed');
const elSeedOut = $('seedOut');
const elPhotoN = $('photoN');
const elSMade = $('sMade');
const elSRev = $('sRevoked');
const elSBlocked = $('sBlocked');

function syncPanel() {
  elRace.disabled = !state.consent;
  elSeedOut.textContent = hex6(state.seed);
  elPhotoN.textContent = loadError
    ? `${state.crops.length} / ${SLOTS} 有文件没解码`
    : `${state.crops.length} / ${SLOTS}`;
  elSMade.textContent = String(state.objectUrlCreated);
  elSRev.textContent = String(state.objectUrlRevoked);
  elSBlocked.textContent = String(state.blockedRuns);
}

function parseNames(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, SLOTS);
}

/* 同意的唯一入口：勾选框和测试钩子都必须走这里，
   否则「撤销同意」这条规则就会被绕过。 */
function applyConsent(on) {
  state.consent = !!on;
  elConsent.checked = state.consent;
  // 撤掉同意就等于撤回授权：已有的成绩一起清掉，不能留在卡上
  if (!state.consent && state.results) {
    state.results = null;
    compose();
  }
  syncPanel();
}

elConsent.addEventListener('change', () => applyConsent(elConsent.checked));

elFile.addEventListener('change', () => { addFiles(elFile.files); });

elClear.addEventListener('click', () => {
  state.crops = [];
  state.results = null;
  elFile.value = '';
  rebuild();
});

elNames.addEventListener('input', () => {
  state.names = parseNames(elNames.value);
  rebuild();
});

elReseed.addEventListener('click', () => {
  state.seed = ((state.seed * 1664525) + 1013904223) >>> 0;
  state.results = null;
  compose();
  syncPanel();
});

elRace.addEventListener('click', () => { race(); });

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

$('ex1').addEventListener('click', () => exportOne(1080, 1920, 'consent-race-1080x1920.png'));
$('ex2').addEventListener('click', () => exportOne(1080, 1350, 'consent-race-1080x1350.png'));

/* ---------- 启动 ---------- */
elNames.value = state.names.join('\n');
rebuild();
syncPanel();

/* ---------- 对外测试钩子 ---------- */
window.__app = {
  canvas: stage,
  getState: () => ({
    seed: state.seed,
    heat: state.heat,
    consent: state.consent,
    names: state.names.slice(),
    results: state.results
      ? state.results.rows.filter(Boolean).map(r => ({ name: r.name, t: r.t, rank: r.rank }))
      : null,
  }),
  stats: () => ({
    photos: state.crops.length,
    objectUrlCreated: state.objectUrlCreated,
    objectUrlRevoked: state.objectUrlRevoked,
    blockedRuns: state.blockedRuns,
    consent: state.consent,
    hasResults: !!state.results,
    slotsFilled: state.slots.filter(s => s.kind !== 'empty').length,
  }),
  setConsent: applyConsent,
  setSeed: n => {
    state.seed = n >>> 0;
    state.results = null;
    compose();
    syncPanel();
  },
  race,
  clearPhotos: () => elClear.click(),
  selfTest: () => {
    const errs = [];
    if (state.slots.length !== SLOTS) errs.push('槽位数不是 8');
    if (state.objectUrlCreated !== state.objectUrlRevoked) {
      errs.push(`blob URL 未回收 ${state.objectUrlCreated} 建 / ${state.objectUrlRevoked} 收`);
    }
    if (!state.consent && state.results) errs.push('未勾同意却出了成绩');
    if (!state.slots.some(s => s.kind !== 'empty')) errs.push('没有可发的车');
    return { ok: errs.length === 0, errs };
  },
  exportProbe,
  exportPNG: async () => (await rawBlob(1080, 1920)).size,
  exportCover: async () => (await rawBlob(1080, 1350)).size,
  rawSize: async (w, h) => (await rawBlob(w, h)).size,
};
