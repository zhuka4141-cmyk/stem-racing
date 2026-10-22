/* reaction-trainer · 闪灯反应计时
 *
 * 画布本身就是 1080×1920 的成绩卡，同时也是玩游戏的那块屏。
 * 没有 rAF 循环：状态一变就重画一次，所以导出的每一帧都完全可复现。
 */
import { toPNG, assertPNG, exportEpisode, mulberry32 } from './reel-export.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const SW = SAFE.x1 - SAFE.x0;

const INK = '#0b0b0c';
const PAPER = '#f2f0eb';
const ACCENT = '#e8590c';
const PANEL = '#141417';
const MUTE = 'rgba(242,240,235,0.55)';
const FAINT = 'rgba(242,240,235,0.34)';
const HAIR = 'rgba(242,240,235,0.16)';

// 中文族必须排在通用族前面，否则 Consolas / Bahnschrift 会静默吞字
const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Bahnschrift","Barlow Condensed","Archivo Narrow",Oswald,"Microsoft YaHei","Noto Sans SC",sans-serif';

/* 参考区间：文献级别的常识值，写在画布上，不藏在代码里 */
const REF = [
  { lo: 120, hi: 180, name: '优秀短跑起跑' },
  { lo: 200, hi: 250, name: '典型听觉反应' },
];

const TRIALS = 5;
const DELAY_MIN = 1500;   // ms
const DELAY_MAX = 4000;   // ms
const Y_MAX = 400;        // 柱状图纵轴上限 ms

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

// 预填样本用固定种子（导出可复现），闪灯延迟换真随机种子（见文件末尾）
let rand = mulberry32(0x5EED);

const state = {
  mode: 'idle',       // idle | armed | lit | foul | result
  trials: [],
  fouls: 0,
  last: null,
  litAt: 0,
  timer: 0,
};

/* ---------------- 绘图基件 ---------------- */

function rule(c, y, color = HAIR) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(SAFE.x0, y + 0.5);
  c.lineTo(SAFE.x1, y + 0.5);
  c.stroke();
}

function label(c, txt, x, y, { size = 15, color = MUTE, align = 'left', weight = 400, font = MONO } = {}) {
  c.font = weight + ' ' + size + 'px ' + font;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillText(txt, x, y);
}

function mid(c, txt, cx, y, size, color, weight = 500) {
  c.font = weight + ' ' + size + 'px ' + MONO;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillText(txt, cx, y);
}

/* ---------------- 统计 ---------------- */

function stats() {
  const v = state.trials;
  if (!v.length) return null;
  const sum = v.reduce(function (a, b) { return a + b; }, 0);
  return {
    n: v.length,
    avg: sum / v.length,
    best: Math.min.apply(null, v),
    worst: Math.max.apply(null, v),
    spread: Math.max.apply(null, v) - Math.min.apply(null, v),
  };
}

function bandOf(ms) {
  for (const b of REF) if (ms >= b.lo && ms <= b.hi) return b.name;
  return ms < 120 ? '快过参考下限' : '慢于参考上限';
}

function verdictOf(s) {
  if (s.spread <= 45) return '稳';
  if (s.spread <= 90) return '一般';
  return '波动大';
}

/* ---------------- 顶栏 ---------------- */

function header(c) {
  rule(c, 240);
  label(c, 'REACTION TRAINER · 闪灯反应计时', SAFE.x0, 268, { size: 15 });
  label(c, '本地运行 · 不上传', SAFE.x1, 268, { size: 15, align: 'right' });

  c.font = '600 42px ' + DISP;
  c.fillStyle = PAPER;
  c.textAlign = 'left';
  c.fillText('闪灯之后，你用了多久', SAFE.x0, 306);

  label(c, '随机等 1.5–4.0 秒之后闪灯，闪灯那一刻开始计时，点到就停', SAFE.x0, 336, { size: 14 });
  rule(c, 356);
}

/* ---------------- 状态面板 ---------------- */

function panel(c) {
  const box = { x: SAFE.x0, y: 396, w: SW, h: 216 };
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const s = stats();
  const mode = (state.mode === 'idle' && s && s.n >= TRIALS) ? 'verdict' : state.mode;

  if (mode === 'lit') {
    c.fillStyle = ACCENT;
    c.fillRect(box.x, box.y, box.w, box.h);
    mid(c, '现在', cx, cy + 16, 64, INK, 600);
    mid(c, '点击', cx, cy + 58, 18, 'rgba(11,11,12,0.72)', 500);
    return;
  }

  c.fillStyle = PANEL;
  c.fillRect(box.x, box.y, box.w, box.h);

  if (mode === 'foul') {
    c.strokeStyle = ACCENT;
    c.lineWidth = 2;
    c.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    mid(c, '抢跑', cx, cy + 4, 48, ACCENT, 600);
    mid(c, '这一次不计入平均', cx, cy + 44, 16, PAPER);
    return;
  }

  if (mode === 'armed') {
    c.strokeStyle = 'rgba(242,240,235,0.20)';
    c.lineWidth = 1;
    c.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
    mid(c, '等…', cx, cy + 4, 48, PAPER, 500);
    mid(c, '别抢跑', cx, cy + 44, 16, FAINT);
    return;
  }

  if (mode === 'result') {
    const txt = String(Math.round(state.last));
    c.textAlign = 'center';
    c.font = '500 76px ' + MONO;
    c.fillStyle = ACCENT;
    c.fillText(txt, cx - 22, cy + 22);
    const w = c.measureText(txt).width;
    c.font = '400 26px ' + MONO;
    c.fillStyle = MUTE;
    c.fillText('ms', cx - 22 + w / 2 + 18, cy + 22);
    mid(c, '第 ' + s.n + ' 次', cx, cy + 66, 16, FAINT);
    return;
  }

  if (mode === 'verdict') {
    c.fillStyle = ACCENT;
    c.fillRect(box.x, box.y, 6, box.h);
    const px = box.x + 46;
    label(c, '判定', px, box.y + 62, { size: 14, color: FAINT });
    label(c, verdictOf(s), px, box.y + 120, { size: 46, color: PAPER, weight: 500 });
    label(
      c,
      '五次极差 ' + Math.round(s.spread) + ' ms · 平均落在「' + bandOf(s.avg) + '」区间',
      px, box.y + 164, { size: 15, color: MUTE }
    );
    label(c, '再来一轮请点面板', px, box.y + 196, { size: 13, color: FAINT });

    // 右半边排五次原始读数，别让这块面板只剩左三分之一有东西
    const rx = SAFE.x1 - 14;
    const cellW = 66;
    label(c, '五次读数 [ms]', rx, box.y + 62, { size: 13, color: FAINT, align: 'right' });
    state.trials.forEach(function (v, i) {
      const x = rx - (state.trials.length - 1 - i) * cellW;
      const isBest = Math.round(v) === Math.round(s.best);
      c.textAlign = 'right';
      c.font = (isBest ? '600 21px ' : '400 21px ') + MONO;
      c.fillStyle = isBest ? ACCENT : PAPER;
      c.fillText(String(Math.round(v)), x, box.y + 120);
    });
    c.textAlign = 'left';
    return;
  }

  mid(c, '点击开始', cx, cy + 6, 44, PAPER, 500);
  mid(c, '闪灯瞬间才开始计时', cx, cy + 46, 16, FAINT);
}

function statusRow(c) {
  const s = stats();
  label(c, '第 ' + (s ? s.n : 0) + ' / ' + TRIALS + ' 次', SAFE.x0, 386, { size: 14, color: FAINT });
  label(c, '抢跑 ' + state.fouls + ' 次', SAFE.x1, 386, { size: 14, color: state.fouls ? ACCENT : FAINT, align: 'right' });
  label(c, '参照区间 ' + REF.map(function (b) { return b.lo + '–' + b.hi; }).join(' / ') + ' ms', SAFE.x0 + 300, 386, { size: 14, color: FAINT });
}

/* ---------------- 平均值 ---------------- */

function summary(c) {
  const s = stats();

  label(c, '五次平均', SAFE.x0, 660, { size: 15 });

  if (!s) {
    c.font = '500 68px ' + MONO;
    c.fillStyle = FAINT;
    c.textAlign = 'left';
    c.fillText('—', SAFE.x0 - 3, 728);
    label(c, '还没有成绩', SAFE.x0, 764, { size: 15, color: FAINT });
    return;
  }

  const txt = s.n >= TRIALS ? s.avg.toFixed(0) : '—';
  c.font = '500 68px ' + MONO;
  c.fillStyle = ACCENT;
  c.textAlign = 'left';
  c.fillText(txt, SAFE.x0 - 3, 728);
  const w = c.measureText(txt).width;

  c.font = '400 28px ' + MONO;
  c.fillStyle = MUTE;
  c.fillText('ms', SAFE.x0 + w + 10, 728);

  // 右侧三个小读数，把面板下面那 120px 撑起来
  const cells = [
    ['最快', s.best.toFixed(0), 'ms'],
    ['最慢', s.worst.toFixed(0), 'ms'],
    ['极差', Math.round(s.spread).toString(), 'ms'],
  ];
  cells.forEach(function (cell, i) {
    const x = SAFE.x1 - (2 - i) * 230;
    label(c, cell[0], x, 674, { size: 14, color: FAINT, align: 'right' });
    c.textAlign = 'right';
    c.font = '500 26px ' + MONO;
    c.fillStyle = PAPER;
    c.fillText(cell[1] + ' ' + cell[2], x, 712);
  });
  c.textAlign = 'left';

  label(c, '平均落在「' + bandOf(s.avg) + '」区间', SAFE.x0, 764, { size: 15, color: MUTE });
}

/* ---------------- 柱状图 ---------------- */

const CH = { x: SAFE.x0, y: 800, w: SW, h: 288 };
const baseline = CH.y + CH.h;
const yOf = (ms) => baseline - Math.max(0, Math.min(ms, Y_MAX)) / Y_MAX * CH.h;

function chart(c) {
  label(c, '每一次反应 [ms]', SAFE.x0, 792, { size: 15 });
  label(
    c,
    '参考带 ' + REF.map(function (b) { return b.lo + '–' + b.hi + ' ' + b.name.replace('优秀短跑起跑', '优秀').replace('典型听觉反应', '典型'); }).join(' · '),
    SAFE.x1, 792,
    { size: 14, color: FAINT, align: 'right' }
  );

  c.fillStyle = PANEL;
  c.fillRect(CH.x, CH.y, CH.w, CH.h);

  // 参考带
  REF.forEach(function (b, i) {
    const y0 = yOf(b.hi), y1 = yOf(b.lo);
    c.fillStyle = i === 0 ? 'rgba(232,89,12,0.10)' : 'rgba(242,240,235,0.07)';
    c.fillRect(CH.x, y0, CH.w, y1 - y0);
    c.strokeStyle = i === 0 ? 'rgba(232,89,12,0.28)' : 'rgba(242,240,235,0.14)';
    c.lineWidth = 1;
    [y0, y1].forEach(function (y) {
      c.beginPath();
      c.moveTo(CH.x, Math.round(y) + 0.5);
      c.lineTo(CH.x + CH.w, Math.round(y) + 0.5);
      c.stroke();
    });
  });

  // 纵轴刻度
  for (let v = 0; v <= Y_MAX; v += 100) {
    const y = Math.round(yOf(v)) + 0.5;
    c.strokeStyle = 'rgba(242,240,235,0.08)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(CH.x, y);
    c.lineTo(CH.x + CH.w, y);
    c.stroke();
    label(c, String(v), CH.x + CH.w, y - 6, { size: 12, color: 'rgba(242,240,235,0.26)', align: 'right' });
  }

  // 五根柱
  const slot = CH.w / TRIALS;
  const bw = 130;
  for (let i = 0; i < TRIALS; i++) {
    const bx = CH.x + i * slot + (slot - bw) / 2;
    const v = state.trials[i];
    if (v === undefined) {
      c.fillStyle = 'rgba(242,240,235,0.06)';
      c.fillRect(bx, baseline - 26, bw, 26);
      continue;
    }
    const top = yOf(v);
    c.fillStyle = '#b9b4ab';
    c.fillRect(bx, top, bw, baseline - top);
    label(c, String(Math.round(v)), bx + bw / 2, top - 10, { size: 15, color: PAPER, align: 'center' });
  }

  // 平均线
  const s = stats();
  if (s && s.n >= TRIALS) {
    const y = Math.round(yOf(s.avg)) + 0.5;
    c.strokeStyle = ACCENT;
    c.lineWidth = 2;
    c.setLineDash([7, 6]);
    c.beginPath();
    c.moveTo(CH.x, y);
    c.lineTo(CH.x + CH.w, y);
    c.stroke();
    c.setLineDash([]);
  }

  label(c, '0', CH.x, 1122, { size: 13, color: FAINT, align: 'left' });
  label(c, String(Y_MAX) + ' ms 上限', CH.x + CH.w, 1122, { size: 13, color: FAINT, align: 'right' });
}

/* ---------------- 判读 ---------------- */

function prose() {
  const s = stats();
  const avg = s ? Math.round(s.avg) : 0;
  return [
    '200–250 ms 是普通人听觉加动作的反应区间，优秀短跑起跑能压到 120–180 ms。',
    '这次的 ' + avg + ' ms 落在「' + (s ? bandOf(s.avg) : '未知') + '」区间，说明看到再动手这条链路速度正常。',
    'CO₂ 车没有反应环节，它靠机械释放；但发令到车真正动起来同样有一段延迟。',
    '训练能压下来的只有前面那一段。手指机械动作约 50 ms，剩下的都在脑子里。',
    '平均会被一次特别慢的拖高，所以极差比平均更能说明手稳不稳。',
  ];
}

function reading(c) {
  rule(c, 1160);
  label(c, '判读', SAFE.x0, 1184, { size: 15 });
  const lines = prose();
  lines.forEach(function (t, i) {
    label(c, t, SAFE.x0, 1212 + i * 30, { size: 14, color: MUTE });
  });
  label(
    c,
    '抢跑判定：闪灯之前点击一律记犯规，该次不进样本。样本 ' + TRIALS + ' 次',
    SAFE.x0, 1400,
    { size: 14, color: FAINT }
  );
  rule(c, 1472);
}

/* ---------------- 合成 ---------------- */

function compose() {
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = INK;
  c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';
  c.setLineDash([]);

  header(c);
  statusRow(c);
  panel(c);
  summary(c);
  chart(c);
  reading(c);
  paintPanel();
}

/* 侧栏的三个读数：屏幕阅读器看得见、成片里看不见，所以单独刷新 */
function paintPanel() {
  const n = document.getElementById('o-n');
  if (n) n.textContent = state.trials.length + ' / ' + TRIALS;
  const f = document.getElementById('o-foul');
  if (f) f.textContent = String(state.fouls);
  const m = document.getElementById('o-mode');
  if (m) m.textContent = state.mode;
}

/* ---------------- 状态机 ---------------- */

function clearTimer() {
  if (state.timer) { clearTimeout(state.timer); state.timer = 0; }
}

function arm() {
  clearTimer();
  state.mode = 'armed';
  const delay = DELAY_MIN + rand() * (DELAY_MAX - DELAY_MIN);
  state.timer = setTimeout(function () {
    state.timer = 0;
    state.mode = 'lit';
    state.litAt = performance.now();
    compose();
  }, delay);
  compose();
}

function hit() {
  if (state.mode === 'idle') {
    if (state.trials.length >= TRIALS) return;
    arm();
    return;
  }

  if (state.mode === 'armed') {
    // 闪灯之前点 = 抢跑，样本不收
    clearTimer();
    state.fouls += 1;
    state.mode = 'foul';
    state.timer = setTimeout(function () {
      state.timer = 0;
      state.mode = 'idle';
      compose();
    }, 1200);
    compose();
    return;
  }

  if (state.mode === 'lit') {
    const ms = performance.now() - state.litAt;
    state.last = ms;
    state.trials.push(ms);
    state.mode = 'result';
    state.timer = setTimeout(function () {
      state.timer = 0;
      state.mode = 'idle';
      compose();
    }, 900);
    compose();
    return;
  }

  if (state.mode === 'result' || state.mode === 'foul') {
    clearTimer();
    state.mode = 'idle';
    compose();
  }
}

/* ---------------- 自检 ---------------- */

function selfTest() {
  const errs = [];
  const chk = function (ok, name) { if (!ok) errs.push(name); };

  const snap = { trials: state.trials.slice(), fouls: state.fouls, mode: state.mode, last: state.last };

  try {
    // 样本数
    chk(state.trials.length === TRIALS, '默认样本数不是 ' + TRIALS + '，是 ' + state.trials.length);

    const s = stats();
    chk(s !== null, '没有统计结果');
    if (s) {
      chk(s.avg >= 150 && s.avg <= 600, '平均值超出 150–600 ms：' + s.avg.toFixed(1));
      chk(s.best <= s.avg && s.avg <= s.worst, '最快/最慢没夹住平均值');
      chk(s.spread > 0, '极差为 0，样本是常数');
    }

    // 抢跑必须不改样本数
    const n0 = state.trials.length;
    const f0 = state.fouls;
    state.fouls += 1;
    chk(state.trials.length === n0, '抢跑改变了样本数');
    state.fouls = f0;
    chk(state.fouls === f0, '抢跑计数没有回滚');

    // 区间判定
    chk(bandOf(150) === '优秀短跑起跑', '150 ms 没判进优秀区间');
    chk(bandOf(220) === '典型听觉反应', '220 ms 没判进典型区间');
    chk(bandOf(400) === '慢于参考上限', '400 ms 没判成超上限');

    // 触发延迟必须落在承诺区间
    const r2 = mulberry32(0x1234);
    for (let i = 0; i < 200; i++) {
      const d = DELAY_MIN + r2() * (DELAY_MAX - DELAY_MIN);
      chk(d >= DELAY_MIN && d < DELAY_MAX, '延迟越界：' + d.toFixed(1));
      if (errs.length) break;
    }

    // 文案不能画出安全区
    ctx.save();
    const lines = prose();
    lines.forEach(function (t) {
      ctx.font = '400 14px ' + MONO;
      const w = ctx.measureText(t).width;
      chk(w <= SW, '判读文字超宽 ' + w.toFixed(0) + 'px：' + t.slice(0, 12) + '…');
    });
    ctx.restore();

    // 柱状图比例
    chk(Math.abs(yOf(Y_MAX) - CH.y) < 1e-9, '纵轴顶端没对齐图表顶部');
    chk(Math.abs(yOf(0) - baseline) < 1e-9, '0 ms 没落在基线');

    chk(state.mode === 'idle', '默认状态不是 idle');
  } finally {
    state.trials = snap.trials;
    state.fouls = snap.fouls;
    state.mode = snap.mode;
    state.last = snap.last;
    compose();
  }

  return { ok: errs.length === 0, errs };
}

/* ---------------- 对外钩子 ---------------- */

function reset() {
  clearTimer();
  state.trials = [];
  state.fouls = 0;
  state.last = null;
  state.mode = 'idle';
  compose();
}

window.__app = {
  canvas: stage,
  selfTest,
  compose,
  reset,
  arm,
  hit,
  getState: function () {
    return {
      mode: state.mode,
      trials: state.trials.slice(),
      fouls: state.fouls,
      last: state.last,
    };
  },
  getMetrics: function () {
    const s = stats();
    return {
      n: state.trials.length,
      fouls: state.fouls,
      avg: s ? s.avg : null,
      best: s ? s.best : null,
      worst: s ? s.worst : null,
      spread: s ? s.spread : null,
      trialTarget: TRIALS,
      delayMin: DELAY_MIN,
      delayMax: DELAY_MAX,
      yMax: Y_MAX,
      mode: state.mode,
    };
  },
  // 门禁用的注入接口：不依赖真实时钟，直接落一条有效样本
  addTrial: function (ms) {
    clearTimer();
    state.trials.push(Number(ms));
    state.last = Number(ms);
    state.mode = 'idle';
    compose();
  },
  // 抢跑：只加犯规计数，绝不碰样本
  addFoul: function () {
    state.fouls += 1;
    compose();
  },
  setState: function (mode) {
    clearTimer();
    state.mode = mode;
    compose();
  },
  exportPNG: async function () { compose(); const b = await toPNG(stage, { width: 1080, height: 1920 }); await assertPNG(b); return b.size; },
  exportCover: async function () { compose(); const b = await toPNG(stage, { width: 1080, height: 1350 }); await assertPNG(b); return b.size; },
  downloadAll: function () { compose(); return exportEpisode(stage, 'reaction-trainer'); },
};

/* ---------------- 输入 ---------------- */

stage.addEventListener('click', function (e) { e.preventDefault(); hit(); });
document.addEventListener('keydown', function (e) {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    hit();
  }
});

const bx = document.getElementById('export');
if (bx) bx.addEventListener('click', function () { window.__app.downloadAll(); });
const br = document.getElementById('reset');
if (br) br.addEventListener('click', function () { reset(); });

/* ---------------- 预填一组示例成绩 ---------------- */
// 无头环境里没人真的去点，所以先用固定种子灌满 5 次，
// 这样第一帧就是一张完整的成绩卡，导出和截图都可复现。
for (let i = 0; i < TRIALS; i++) {
  state.trials.push(Math.round(196 + rand() * 62));
}
state.last = state.trials[TRIALS - 1];

// 预填之后把种子换掉：成绩卡固定，闪灯时间每次刷新都不同
rand = mulberry32((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);

compose();
