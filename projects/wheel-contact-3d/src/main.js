/* 轮轨接触受力 · wheel-contact-3d
 *
 * 三维画出车在导轨上时，左前轮接地点上的三个力：
 *   法向力 N      竖直向上，压在地面上
 *   切向摩擦力 Ff 沿赛道向后，来自驱动/滚动
 *   侧向力 Fl    横向，质心偏移造成偏航，要靠前轮横向摩擦扛住
 *
 * 物理内核与 ../../shared/racing-core.js 同源。这里内联而不是 import，
 * 是因为 build.mjs 不会把 racing-core.js 拷进项目目录（它只拷
 * reel-export.js 和 design-tokens.css）。要改公式请同步改 shared 那份。
 */

import * as THREE from 'three';
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const INK = '#0B0B0C';
const PAPER = '#F2F0EB';
const ACCENT = '#E8590C';
const ALARM = '#FF3B30';
const MUTED = 'rgba(242,240,235,0.55)';
const HAIR = 'rgba(242,240,235,0.16)';
const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';

/* ── 参数（与 racing-core.js 的 PARAMS 逐项一致） ──
   status 用 [FIXED] / [TYPICAL] / [VERIFY] 标注，界面上按这个印。 */
const G = 9.81;
const P = {
  m:         { v: 0.065,  st: 'VERIFY',  label: '整车质量' },
  iWheel:    { v: 4.5e-7, st: 'TYPICAL', label: '单轮转动惯量' },
  rWheel:    { v: 0.011,  st: 'TYPICAL', label: '轮半径' },
  area:      { v: 1.6e-3, st: 'TYPICAL', label: '迎风面积' },
  cd:        { v: 0.34,   st: 'TYPICAL', label: '零升阻力系数' },
  mu:        { v: 0.60,   st: 'TYPICAL', label: '轮轨摩擦系数' },
  wheelbase: { v: 0.130,  st: 'TYPICAL', label: '轴距' },
  comFrac:   { v: 0.55,   st: 'TYPICAL', label: '质心距前轴 / 轴距' },
  armPin:    { v: 0.0375, st: 'TYPICAL', label: '导轨销到前轴' },
};
const THRUST = { Fpeak: 21.0, tBurn: 0.110 };   // [VERIFY] 21 N / 110 ms

const v = (k) => P[k].v;

/** 轴荷：N_f = m·g·(1 − comFrac) + F·dh/L_wb。这里 dh = 0。 */
function axleLoads(thrust = 0, dh = 0) {
  const Wt = v('m') * G;
  const nf = Wt * (1 - v('comFrac')) + (thrust * dh) / v('wheelbase');
  return { nf, nr: Wt - nf, total: Wt };
}
/** 前轴抗偏航力矩上限 μ·N_f·armPin */
function yawLimit(nf) { return v('mu') * nf * v('armPin'); }
/** 临界横向偏移：偏航力矩需求刚好等于上限 */
function criticalOffset(thrust = THRUST.Fpeak, nf) { return yawLimit(nf) / thrust; }

/** 某一横向偏移（mm）下的全部量 */
function solve(offsetMM, thrust = THRUST.Fpeak) {
  const { nf, nr, total } = axleLoads(thrust, 0);
  const d = offsetMM / 1000;                     // m
  const demand = thrust * d;                     // N·m  偏航力矩需求
  const limit = yawLimit(nf);                    // N·m  前轮能给的上限
  const fl = d > 0 ? demand / v('armPin') : 0;   // N    销上需要的侧向反力
  const dcrit = criticalOffset(thrust, nf);      // m
  const ratio = limit > 0 ? demand / limit : Infinity;
  return {
    offsetMM, nf, nr, total, demand, limit, fl,
    dcritMM: dcrit * 1000,
    ratio,
    alarm: demand > limit,
    // 侧向摩擦可用量：μ·N_f
    flAvail: v('mu') * nf,
    ff: v('mu') * nf,                            // 切向摩擦上限
  };
}

const state = { offset: 0.40, thrustOn: true };
const cur = () => solve(state.offset, state.thrustOn ? THRUST.Fpeak : 0);

/* ── 三维场景 ── */

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

/* 记下每一次真实绘制的包围盒。
   封面是居中裁切（1080×1920 → 1080×1350 只看得见源图 y 285..1635），
   靠手抄一份 y 值表去核版面对不上，所以直接量 measureText / fillRect 的实参。 */
const BANDS = [];
(() => {
  const ft = ctx.fillText.bind(ctx);
  ctx.fillText = function (s, x, y) {
    const m = ctx.measureText(String(s));
    const w = m.width;
    const l = ctx.textAlign === 'right' ? x - w : ctx.textAlign === 'center' ? x - w / 2 : x;
    BANDS.push({
      kind: 'text', s: String(s).slice(0, 20),
      x0: l, x1: l + w,
      y0: y - (m.actualBoundingBoxAscent ?? 0),
      y1: y + (m.actualBoundingBoxDescent ?? 0),
    });
    return ft(s, x, y);
  };
  const fr = ctx.fillRect.bind(ctx);
  ctx.fillRect = function (x, y, w, h) {
    // 满幅底衬不算版面元素
    if (w < stage.width) {
      BANDS.push({ kind: 'rect', s: '', x0: x, x1: x + w, y0: y, y1: y + h });
    }
    return fr(x, y, w, h);
  };
})();

const gl = document.createElement('canvas');
gl.width = W; gl.height = H;

const renderer = new THREE.WebGLRenderer({
  canvas: gl, antialias: true, alpha: false, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x0b0b0c, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0b0c, 0.42, 1.15);

const camera = new THREE.PerspectiveCamera(32, W / H, 0.01, 10);
camera.position.set(0.30, 0.20, 0.30);
camera.lookAt(0, 0.02, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.34));
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(0.36, 0.80, 0.42);
scene.add(key);
const rim = new THREE.DirectionalLight(0xe8590c, 1.5);
rim.position.set(-0.66, 0.24, -0.54);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x8899bb, 0.55);
fill.position.set(-0.30, 0.16, 0.50);
scene.add(fill);

const railMat = new THREE.MeshStandardMaterial({ color: 0x232329, roughness: 0.92, metalness: 0.0 });
const pinMat  = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.38, metalness: 0.7 });
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.55, metalness: 0.15 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.95, metalness: 0.0 });

// 地面
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), railMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.0006;
scene.add(floor);

// 网格：沿赛道每 20 mm 一条，帮助判断尺度
const grid = new THREE.GridHelper(0.9, 45, 0x2a2a31, 0x1b1b20);
grid.position.y = -0.0004;
scene.add(grid);

// 导轨
const rail = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.0016, 0.0032), pinMat);
rail.position.set(0, 0.0008, 0);
scene.add(rail);

// 车身
const carGroup = new THREE.Group();
scene.add(carGroup);

const bodyGeo = new THREE.BoxGeometry(0.200, 0.019, 0.030);
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.position.set(0, 0.011 + 0.0095, 0);
carGroup.add(body);

// 车头削一块，别让它像一块砖
const noseGeo = new THREE.BoxGeometry(0.052, 0.013, 0.024);
const nose = new THREE.Mesh(noseGeo, bodyMat);
nose.position.set(0.104, 0.011 + 0.0065, 0);
carGroup.add(nose);

// 四个轮子：轮轴沿 z
const R_W = v('rWheel');
const wheelGeo = new THREE.CylinderGeometry(R_W, R_W, 0.006, 22);
wheelGeo.rotateX(Math.PI / 2);
const HALF_WB = v('wheelbase') / 2;
const WHEELS = [
  { x: +HALF_WB, z: -0.0155, name: '左前' },
  { x: +HALF_WB, z: +0.0155, name: '右前' },
  { x: -HALF_WB, z: -0.0155, name: '左后' },
  { x: -HALF_WB, z: +0.0155, name: '右后' },
];
for (const w of WHEELS) {
  const m = new THREE.Mesh(wheelGeo, tyreMat);
  m.position.set(w.x, R_W, w.z);
  carGroup.add(m);
}

// 导轨销：位于前轴后方 armPin 处
const PIN_X = HALF_WB - v('armPin');
const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.030, 12), pinMat);
pin.position.set(PIN_X, 0.015, 0);
carGroup.add(pin);

/* 三个力矢量。长度以「整车重力」为 1 个单位，
   超过 1 个单位就截断并画成报警色——超限本身就是结论。 */
const ARMORIGIN = new THREE.Vector3(HALF_WB, 0.0008, -0.0155);

function makeArrow(color) {
  const a = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0), ARMORIGIN, 0.02, color, 0.020, 0.012
  );
  scene.add(a);
  return a;
}
const arrowN = makeArrow(0x6ec1ff);
const arrowFf = makeArrow(0xe8590c);
const arrowFl = makeArrow(0xffd166);

const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(-1, 0, 0);   // 赛道向前是 +x，摩擦向后
const SIDE = new THREE.Vector3(0, 0, 1);

let lastOps = null;

/** 把当前状态推到三维场景里 */
function applyScene() {
  const s = cur();
  const unit = s.total;                       // 1 单位 = 整车重力
  const clamp = (x) => Math.min(1.0, Math.max(0, x));

  // 车身横向偏移：真实只有零点几毫米，画面上放大 40 倍才看得见
  carGroup.position.z = -(s.offsetMM / 1000) * 40;

  // 法向力
  const nLen = clamp(s.nf / unit) * 0.085;
  arrowN.setDirection(UP);
  arrowN.setLength(Math.max(0.012, nLen), 0.018, 0.010);

  // 切向摩擦
  const fLen = clamp(s.ff / unit) * 0.085;
  arrowFf.setDirection(BACK);
  arrowFf.setLength(Math.max(0.012, fLen), 0.018, 0.010);

  // 侧向力：超过上限就截断变红
  const latOver = s.fl / (v('mu') * s.nf) > 1;
  const lLen = clamp(s.fl / unit) * 0.085;
  arrowFl.setDirection(SIDE);
  arrowFl.setLength(Math.max(0.012, lLen), 0.018, 0.010);
  arrowFl.setColor(new THREE.Color(latOver ? ALARM : 0xffd166));

  lastOps = { unit, latOver };
}

applyScene();

/* ── 二维叠加层 ── */

function compose() {
  const s = cur();
  BANDS.length = 0;

  renderer.render(scene, camera);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(gl, 0, 0, W, H);

  // 下方文字区压一层实底，3D 只露在 y 500..1060
  ctx.fillStyle = INK;
  ctx.fillRect(0, 1060, W, H - 1060);

  drawHeader(s);
  drawNumbers(s);
  drawVerdict(s);
  drawFooter(s);
}

function drawHeader(s) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = ACCENT;
  // 封面可见窗口从 y=285 起（1080×1920 → 1080×1350 居中裁切），
  // 原来画在 282 会让这根条整根落在窗口外。292 留 7px 余量。
  ctx.fillRect(SAFE.x0, 292, 46, 3);

  ctx.fillStyle = MUTED;
  ctx.font = '500 17px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('CONTACT PATCH', SAFE.x0, 330);

  ctx.fillStyle = PAPER;
  ctx.font = '600 58px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  ctx.fillText('一个轮子扛多少', SAFE.x0, 406);

  ctx.fillStyle = MUTED;
  ctx.font = '500 22px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(
    '左前轮接地点 · 三力分解 · 质心偏移已放大 40 倍',
    SAFE.x0, 452
  );

  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, 490, SAFE.x1 - SAFE.x0, 1);
  ctx.restore();
}

function drawNumbers(s) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, 1096, SAFE.x1 - SAFE.x0, 1);

  // 大数：横向偏移
  ctx.fillStyle = MUTED;
  ctx.font = '500 17px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('质心横向偏移', SAFE.x0, 1140);

  ctx.fillStyle = s.alarm ? ALARM : PAPER;
  ctx.font = '600 96px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const offTxt = s.offsetMM.toFixed(2);
  ctx.fillText(offTxt, SAFE.x0, 1230);
  const offW = ctx.measureText(offTxt).width;
  ctx.fillStyle = MUTED;
  ctx.font = '500 30px ' + MONO;
  ctx.fillText('mm', SAFE.x0 + offW + 10, 1230);

  // 右列：临界值
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = '500 17px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('临界偏移', SAFE.x1, 1140);

  ctx.fillStyle = PAPER;
  ctx.font = '600 56px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(s.dcritMM.toFixed(3), SAFE.x1, 1200);
  ctx.fillStyle = MUTED;
  ctx.font = '500 20px ' + MONO;
  ctx.fillText('mm', SAFE.x1, 1230);

  // 三行数值
  const rows = [
    ['法向力 N', (s.nf * 1000).toFixed(1) + ' mN', '总重 ' + (s.total * 1000).toFixed(1) + ' mN'],
    ['偏航需求 M', (s.demand * 1000).toFixed(2) + ' mN·m', '上限 ' + (s.limit * 1000).toFixed(2) + ' mN·m'],
    ['侧向需求 F', (s.fl * 1000).toFixed(2) + ' mN', '可用 ' + (s.flAvail * 1000).toFixed(1) + ' mN'],
  ];
  let y = 1300;
  for (let i = 0; i < rows.length; i++) {
    const [lab, val, ref] = rows[i];
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = '500 21px ' + MONO;
    ctx.fillText(lab, SAFE.x0, y);

    ctx.fillStyle = i === 1 && s.alarm ? ALARM : PAPER;
    ctx.fillText(val, SAFE.x0 + 230, y);

    ctx.fillStyle = 'rgba(242,240,235,0.34)';
    ctx.font = '500 19px ' + MONO;
    ctx.fillText(ref, SAFE.x0 + 560, y);

    y += 44;
  }
  ctx.restore();
}

function drawVerdict(s) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const y = 1430;
  ctx.fillStyle = s.alarm ? ALARM : ACCENT;
  ctx.fillRect(SAFE.x0, y - 22, 3, 34);

  ctx.fillStyle = s.alarm ? ALARM : PAPER;
  ctx.font = '600 26px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(
    s.alarm
      ? '超限 ×' + s.ratio.toFixed(1) + '　前轮横向摩擦不够，车会跑偏'
      : '在限内 ×' + s.ratio.toFixed(2) + '　前轮还扛得住',
    SAFE.x0 + 16, y
  );
  ctx.restore();
}

function drawFooter(s) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = MUTED;
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('STEM RACING · WHEEL CONTACT', SAFE.x0, 1472);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.32)';
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(
    'μ=' + v('mu').toFixed(2) + ' · 销臂 ' + (v('armPin') * 1000).toFixed(1) +
    ' mm · F=' + (state.thrustOn ? THRUST.Fpeak.toFixed(0) : '0') + ' N',
    SAFE.x1, 1472
  );
  ctx.restore();
}

/* ── 交互 ── */

function bindUI() {
  const sl = document.getElementById('offset');
  if (sl) {
    sl.value = String(state.offset);
    sl.addEventListener('input', () => {
      state.offset = parseFloat(sl.value);
      const lab = document.getElementById('offsetVal');
      if (lab) lab.textContent = state.offset.toFixed(2) + ' mm';
      applyScene(); compose();
    });
  }
  const tb = document.getElementById('thrust');
  if (tb) {
    tb.checked = state.thrustOn;
    tb.addEventListener('change', () => {
      state.thrustOn = tb.checked; applyScene(); compose();
    });
  }
  const btn = document.getElementById('export');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true; const old = btn.textContent; btn.textContent = '导出中…';
      try { compose(); await new Promise(r => setTimeout(r, 60)); await window.__app.downloadAll(); }
      finally { btn.disabled = false; btn.textContent = old; }
    });
  }
}

applyScene();
compose();
bindUI();

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
  getBands: () => BANDS.map((b) => ({ ...b })),
  getState: () => ({ offset: state.offset, thrustOn: state.thrustOn }),
  getMetrics: () => {
    const s = cur();
    return {
      offsetMM: s.offsetMM,
      nf: s.nf, nr: s.nr, total: s.total,
      demand: s.demand, limit: s.limit,
      ratio: s.ratio,
      dcritMM: s.dcritMM,
      alarm: s.alarm,
      fl: s.fl, flAvail: s.flAvail,
    };
  },
  set: (k, val) => {
    if (k === 'offset') state.offset = val;
    else if (k === 'thrustOn') state.thrustOn = !!val;
    const sl = document.getElementById('offset');
    if (k === 'offset' && sl) sl.value = String(val);
    applyScene(); compose();
  },
  pixelHash: () => hashOf(stage),
  selfTest: () => {
    const errs = [];

    // 1. 轴荷守恒
    const a = axleLoads(0, 0);
    if (Math.abs(a.nf + a.nr - a.total) > 1e-12) errs.push('轴荷加起来不等于整车重');

    // 2. 偏移为 0 时不该有偏航需求
    const s0 = solve(0);
    if (s0.demand > 1e-12) errs.push('偏移 0 却有偏航力矩需求');
    if (s0.alarm) errs.push('偏移 0 就报警');

    // 3. 临界点上需求必须正好等于上限
    const sc = solve(s0.dcritMM);
    if (Math.abs(sc.ratio - 1) > 1e-6) errs.push(`临界点上比值应为 1，实际 ${sc.ratio.toFixed(6)}`);

    // 4. 临界点两侧必须翻转
    if (solve(s0.dcritMM * 0.9).alarm) errs.push('低于临界值也报警');
    if (!solve(s0.dcritMM * 1.1).alarm) errs.push('高于临界值没报警');

    // 5. 比值必须随偏移严格单调递增
    let prev = -1;
    for (let d = 0; d <= 8.0001; d += 0.25) {
      const r = solve(d).ratio;
      if (r <= prev) errs.push(`比值在 d=${d.toFixed(2)} 处不单调`);
      prev = r;
    }

    // 6. 侧向需求必须随偏移线性增长
    const r1 = solve(1).fl, r2 = solve(2).fl;
    if (Math.abs(r2 / r1 - 2) > 1e-9) errs.push('侧向需求不随偏移线性');

    // 7. 侧向需求在临界点必须等于可用横向摩擦
    if (Math.abs(sc.fl - sc.flAvail) > 1e-9) {
      errs.push(`临界点侧向需求 ${sc.fl} 与可用摩擦 ${sc.flAvail} 不等`);
    }

    // 8. 推力关掉后所有力都该归零
    const so = solve(4, 0);
    if (so.demand > 1e-12 || so.fl > 1e-12) errs.push('推力为 0 仍有侧向需求');
    if (so.alarm) errs.push('推力为 0 却报警');

    // 9. 临界偏移必须落在滑块量程内，否则界面无法表达超限
    if (!(s0.dcritMM > 0 && s0.dcritMM < 8)) errs.push('临界偏移不在 0–8 mm 量程内');

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
  downloadAll: () => exportEpisode(stage, 'wheel-contact-3d'),
};
