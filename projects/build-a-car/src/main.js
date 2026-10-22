/* 装车台 · build-a-car
 *
 * 四组零件各三选一，3⁴ = 81 种装法。换一个零件，质量、质心、迎风面积、
 * 成绩、三条限值全部重算——没有任何一个显示出来的数是可以写死的。
 *
 * 三条限值里，只有「前轮抗偏航力矩 5.96 mN·m」是队里的台架数，是真锚。
 * 「质心横向偏移 1.32 mm」原来被当成独立的第二个锚，其实它是从旧 4.5 N
 * 推力反推出来的（5.96e-3 / 1.32e-3 = 4.52 N），换成 21 N 之后必须重算
 * 成 0.568 mm。见 physics.js 里的注释。
 */

import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import { drawCar, tracked } from './car.js';
import {
  GROUPS, evaluate, DEFAULT_SEL, CLASS_MASS, REF_RATIO,
  MEQ_RATIO_LIMIT, D_LAT_LIMIT, M_YAW_LIMIT,
} from './parts.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const INK = '#0B0B0C';
const PAPER = '#F2F0EB';
const ACCENT = '#E8590C';
const ALARM = '#FF3B30';
const OK = '#4FA65B';
const MUTED = 'rgba(242,240,235,0.55)';
const DIM = 'rgba(242,240,235,0.34)';
const HAIR = 'rgba(242,240,235,0.16)';
const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow",Oswald,"Microsoft YaHei","Noto Sans SC",sans-serif';

const PAL = {
  line: 'rgba(242,240,235,0.50)',
  lineFaint: 'rgba(242,240,235,0.18)',
  lineStrong: 'rgba(242,240,235,0.80)',
  body: '#2a2a32',
  hatch: 'rgba(242,240,235,0.12)',
  edge: 'rgba(242,240,235,0.42)',
  ballast: '#E8590C',
  wing: '#3a3a44',
  wheel: '#151518',
};

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const state = { sel: { ...DEFAULT_SEL } };
const cur = () => evaluate(state.sel);

/* ── 绘图 ── */

function compose() {
  const r = cur();

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  drawHeader(r);
  drawCarPanel(r);
  drawWarnings(r);
  drawKPI(r);
  drawParts(r);
  drawFooter(r);
}

function drawHeader(r) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, 296, 46, 3);

  ctx.fillStyle = DIM;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('组别限重 65 g · 标定车 79.88 g · 21 N / 110 ms', SAFE.x0, 316);

  ctx.fillStyle = MUTED;
  ctx.font = '500 17px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('ASSEMBLY BAY', SAFE.x0, 348);

  ctx.fillStyle = PAPER;
  ctx.font = '600 60px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  ctx.fillText('装车台', SAFE.x0, 424);

  // 右上角：整车质量，超组别限重就变红
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('整车质量', SAFE.x1, 348);

  ctx.fillStyle = r.overClassMass ? ALARM : PAPER;
  ctx.font = '600 54px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText((r.m * 1000).toFixed(1), SAFE.x1, 406);
  const mw = ctx.measureText((r.m * 1000).toFixed(1)).width;
  ctx.fillStyle = r.overClassMass ? ALARM : MUTED;
  ctx.font = '500 22px ' + MONO;
  ctx.fillText('g', SAFE.x1 - mw - 6, 406);

  ctx.fillStyle = DIM;
  ctx.font = '500 15px ' + MONO;
  ctx.fillText('组别限重 ' + (CLASS_MASS * 1000).toFixed(0) + ' g', SAFE.x1, 430);

  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, 458, SAFE.x1 - SAFE.x0, 1);
  ctx.restore();
}

function drawCarPanel(r) {
  const p = {
    wheelDia: r.wheel.dia,
    rideHeight: r.body.rideHeight,
    aoa: r.body.aoa,
    noseLen: r.body.noseLen,
    ballastX: r.ballast.station * 1000,
    wingDeg: r.wing.deg,
  };
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = DIM;
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('车长 200 mm', SAFE.x0, 516);
  ctx.fillText('轴距 ' + (140).toFixed(0) + ' mm', SAFE.x0 + 250, 516);
  ctx.fillText('轮径 ' + r.wheel.dia + ' mm', SAFE.x0 + 520, 516);
  ctx.fillText('迎风 ' + (r.area * 1e6).toFixed(0) + ' cm²', SAFE.x0 + 730, 516);
  ctx.restore();

  ctx.save();
  drawCar(ctx, { ox: SAFE.x0 + 8, oy: 742, scale: 5.20, p, pal: PAL });
  ctx.restore();
}

function drawWarnings(r) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const top = 812;
  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, top, SAFE.x1 - SAFE.x0, 1);

  ctx.fillStyle = MUTED;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('三条限值', SAFE.x0, top + 34);

  let y = top + 82;
  for (const w of r.warnings) {
    // 左边一条竖线表示状态
    ctx.fillStyle = w.tripped ? ALARM : OK;
    ctx.fillRect(SAFE.x0, y - 19, 3, 28);

    ctx.fillStyle = w.tripped ? ALARM : PAPER;
    ctx.font = '500 24px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillText(w.zh, SAFE.x0 + 16, y);

    // 数值 / 上限
    ctx.textAlign = 'right';
    ctx.fillStyle = w.tripped ? ALARM : PAPER;
    ctx.font = '600 27px ' + MONO;
    ctx.fillText(w.value.toFixed(w.digits), SAFE.x1 - 132, y);
    ctx.fillStyle = DIM;
    ctx.font = '500 18px ' + MONO;
    ctx.fillText('/ ' + w.limit.toFixed(w.digits), SAFE.x1 - 62, y);
    ctx.fillStyle = MUTED;
    ctx.font = '500 17px ' + MONO;
    ctx.fillText(w.unit || '—', SAFE.x1, y);

    ctx.textAlign = 'left';
    y += 62;
  }
  ctx.restore();
}

function drawKPI(r) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const y = 1064;
  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);

  // 成绩
  ctx.fillStyle = MUTED;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('20 m 成绩', SAFE.x0, y + 34);

  ctx.fillStyle = PAPER;
  ctx.font = '600 76px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(r.time.toFixed(3), SAFE.x0, y + 108);
  const tw = ctx.measureText(r.time.toFixed(3)).width;
  ctx.fillStyle = MUTED;
  ctx.font = '500 24px ' + MONO;
  ctx.fillText('s', SAFE.x0 + tw + 8, y + 108);

  // 末速度
  ctx.fillStyle = MUTED;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('末速度', SAFE.x0 + 380, y + 34);
  ctx.fillStyle = PAPER;
  ctx.font = '600 56px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(r.speed.toFixed(2), SAFE.x0 + 380, y + 96);
  ctx.fillStyle = MUTED;
  ctx.font = '500 20px ' + MONO;
  ctx.fillText('m/s', SAFE.x0 + 380 + ctx.measureText(r.speed.toFixed(2)).width * 1.6 + 68, y + 96);

  // 等效惯性质量比
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('等效惯性比', SAFE.x1, y + 34);
  const over = r.ratio > MEQ_RATIO_LIMIT;
  ctx.fillStyle = over ? ALARM : PAPER;
  ctx.font = '600 56px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(r.ratio.toFixed(3), SAFE.x1, y + 96);
  ctx.fillStyle = DIM;
  ctx.font = '500 15px ' + MONO;
  ctx.fillText('基准 ' + REF_RATIO.toFixed(3) + ' · 上限 ' + MEQ_RATIO_LIMIT.toFixed(2), SAFE.x1, y + 122);
  ctx.restore();
}

function drawParts(r) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const y = 1222;
  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);

  ctx.fillStyle = MUTED;
  ctx.font = '500 16px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('当前装法', SAFE.x0, y + 32);

  const rows = [
    ['车身', r.body.name, (r.body.mass * 1000).toFixed(2) + ' g'],
    ['车轮 ×4', r.wheel.name, (r.wheel.mass * 4 * 1000).toFixed(2) + ' g'],
    ['配重', r.ballast.name, (r.ballast.mass * 1000).toFixed(2) + ' g'],
    ['尾翼', r.wing.name, (r.wing.mass * 1000).toFixed(2) + ' g'],
  ];
  let ry = y + 74;
  for (const [lab, name, mass] of rows) {
    ctx.fillStyle = DIM;
    ctx.font = '500 18px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText(lab, SAFE.x0, ry);

    ctx.fillStyle = PAPER;
    ctx.font = '500 22px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillText(name, SAFE.x0 + 148, ry);

    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = '500 20px ' + MONO;
    ctx.fillText(mass, SAFE.x1, ry);
    ctx.textAlign = 'left';

    ry += 46;
  }
  ctx.restore();
}

function drawFooter(r) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = MUTED;
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('STEM RACING · ASSEMBLY', SAFE.x0, 1472);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.32)';
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const ci = r.sel.body * 27 + r.sel.wheel * 9 + r.sel.ballast * 3 + r.sel.wing + 1;
  ctx.fillText('装法 ' + ci + ' / 81 · 质心站 ' + (r.comX * 1000).toFixed(1) + ' mm · 横向 ' + (r.comLat * 1000).toFixed(3) + ' mm', SAFE.x1, 1472);
  ctx.restore();
}

/* ── 交互 ── */

function buildPanel() {
  const panel = document.getElementById('panel');
  if (!panel) return;
  const selEls = {};

  const host = document.createElement('div');
  panel.insertBefore(host, panel.querySelector('#export') || null);

  GROUPS.forEach((g, gi) => {
    const row = document.createElement('div');
    row.className = 'row';

    const lab = document.createElement('span');
    lab.className = 'lab';
    lab.textContent = g.label || g.id;
    row.appendChild(lab);

    const bar = document.createElement('div');
    bar.className = 'seg';

    g.options.forEach((o, oi) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'segbtn';
      b.dataset.group = g.id;
      b.dataset.index = String(oi);
      b.textContent = o.name;
      b.addEventListener('click', () => {
        state.sel[g.id] = oi;
        syncPanel();
        compose();
      });
      bar.appendChild(b);
    });

    row.appendChild(bar);
    host.appendChild(row);
    selEls[g.id] = bar;
  });

  function syncPanel() {
    for (const g of GROUPS) {
      const bar = selEls[g.id];
      if (!bar) continue;
      for (const b of bar.children) {
        const on = Number(b.dataset.index) === Number(state.sel[g.id]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
  }

  const btn = document.getElementById('export');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = '导出中…';
      try {
        compose();
        await new Promise((r) => setTimeout(r, 60));
        await window.__app.downloadAll();
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  }

  syncPanel();
}

/* ── 测试钩子 ── */

function hashOf(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i += 97) { h ^= d[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

window.__app = {
  canvas: stage,
  safe: SAFE,
  ready: () => Promise.resolve(),
  getState: () => ({ sel: { ...state.sel } }),
  getMetrics: () => {
    const r = cur();
    return {
      sel: { ...state.sel },
      m: r.m, mEq: r.mEq, ratio: r.ratio,
      comX: r.comX, comLat: r.comLat, frontShare: r.frontShare,
      mYaw: r.mYaw, cd: r.cd, area: r.area,
      time: r.time, speed: r.speed,
      overClassMass: r.overClassMass,
      anyTripped: r.anyTripped,
      warnings: r.warnings.map((w) => ({ id: w.id, value: w.value, limit: w.limit, tripped: w.tripped })),
      limits: { D_LAT: D_LAT_LIMIT, M_YAW: M_YAW_LIMIT, MEQ: MEQ_RATIO_LIMIT },
      groups: GROUPS.map((g) => ({ id: g.id, options: g.options.map((o) => o.name) })),
    };
  },
  set: (k, val) => {
    if (k === 'sel') state.sel = { ...state.sel, ...val };
    else if (GROUPS.some((g) => g.id === k)) state.sel[k] = val;
    buildPanel.sync && buildPanel.sync();
    compose();
    const panel = document.getElementById('panel');
    if (panel) {
      for (const b of panel.querySelectorAll('.segbtn')) {
        const on = Number(b.dataset.index) === Number(state.sel[b.dataset.group]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
  },
  pixelHash: () => hashOf(stage),
  selfTest: () => {
    const errs = [];

    // 1. 三条限值必须自洽：偏移上限由偏航力矩上限反推
    const derived = M_YAW_LIMIT / (21.0 * 0.5);
    if (Math.abs(D_LAT_LIMIT - derived) > 1e-12) {
      errs.push(`D_LAT_LIMIT ${D_LAT_LIMIT} 与反推值 ${derived} 不符`);
    }
    // 旧的那对数字（1.32 mm / 5.96 mN·m）只有在 4.52 N 推力下才成立
    if (Math.abs(D_LAT_LIMIT - 1.32e-3) < 1e-6) {
      errs.push('D_LAT_LIMIT 还是旧的 1.32 mm，没换成 21 N 下的值');
    }

    // 2. 质量守恒
    const r0 = evaluate(DEFAULT_SEL);
    if (Math.abs(r0.parts.reduce((s, p) => s + p.mass, 0) - r0.m) > 1e-12) {
      errs.push('零件质量之和与整车质量不符');
    }

    // 3. 全组合遍历：成绩都必须落在合理带内
    const all = [];
    for (let a = 0; a < GROUPS[0].options.length; a++)
      for (let b = 0; b < GROUPS[1].options.length; b++)
        for (let c = 0; c < GROUPS[2].options.length; c++)
          for (let d = 0; d < GROUPS[3].options.length; d++)
            all.push(evaluate({ body: a, wheel: b, ballast: c, wing: d }));

    if (all.length !== 81) errs.push('组合数不是 81，实际 ' + all.length);

    for (const r of all) {
      if (!(r.time > 0.9 && r.time < 1.6)) errs.push(`组合成绩越界 ${r.time.toFixed(3)} s`);
    }

    // 4. 三条限值都必须真的够得着，不能写在那里永远亮不了
    for (const id of ['lat', 'yaw', 'meq']) {
      const hits = all.filter((r) => r.warnings.find((w) => w.id === id).tripped).length;
      if (hits === 0) errs.push(`限值「${id}」在 81 种装法里一次都没触发，等于没有约束`);
    }

    // 5. 质心横向偏移的符号必须跟配重的横向位置一致
    for (const r of all) {
      if (r.ballast.lateral > 0 && r.comLat < -1e-12) errs.push('配重偏右但质心偏左');
      if (r.ballast.lateral < 0 && r.comLat > 1e-12) errs.push('配重偏左但质心偏右');
    }

    // 6. 偏航需求必须随横向偏移单调
    const t = all.slice().sort((x, y) => Math.abs(x.comLat) - Math.abs(y.comLat));
    let prev = -1;
    for (const r of t) {
      const expectMono = Math.abs(r.comLat) >= prev - 1e-12;
      if (!expectMono) { errs.push('偏航需求不随横向偏移单调'); break; }
      prev = Math.abs(r.comLat);
    }

    // 7. 换轮子必须改变等效惯性质量比
    const w0 = evaluate({ ...DEFAULT_SEL, wheel: 0 });
    const w2 = evaluate({ ...DEFAULT_SEL, wheel: 2 });
    if (Math.abs(w2.ratio - w0.ratio) < 1e-6) errs.push('换轮子没有改变等效惯性质量比');

    return { ok: errs.length === 0, errs };
  },
  exportPNG: async () => {
    compose();
    const b = await toPNG(stage, { width: 1080, height: 1920 });
    await assertPNG(b);
    return b.size;
  },
  exportCover: async () => {
    compose();
    const b = await toPNG(stage, { width: 1080, height: 1350 });
    await assertPNG(b);
    return b.size;
  },
  downloadAll: () => exportEpisode(stage, 'build-a-car'),
};

compose();
buildPanel();
