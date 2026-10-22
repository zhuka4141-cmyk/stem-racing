/* 涂装工作室 · livery-studio-3d
 *
 * 同一台三维车体，换八套涂装。每套有名字、有一句话说明、有配色来源。
 * 材质切换是实时的——门禁会比对切换前后导出的哈希，证明画面真的变了。
 *
 * 这里不画车「应该」长什么样，只画一套可换的板件。真实车体几何见
 * explode-view-3d 和 wind-tunnel-3d，那两个是量过的。
 */

import * as THREE from 'three';
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

/* 版式常量。结论行必须整体落在封面 1350 以内 —— 位置写在这里，门禁读同一份数，
   不靠注释约定。
   封面按 reel-export 的 cover 算法居中裁切，1920→1350 时可见源行是 285..1635，
   所以结论在 1382 其实没被切。但那样只富余 253 px，谁把裁切改成上对齐就没了；
   按 1350 卡死比实际窗口保守 285 px，换成任何裁切策略都安全。 */
const SPEC = { barY: 1314, barH: 34, noteBase: 1340, subBase: 1376 };
const MAT = { y0: 1174, step: 52 };
const HEAD = { barY: 296, barH: 3 };
const BANDS = {};

const INK = '#0B0B0C';
const PAPER = '#F2F0EB';
const ACCENT = '#E8590C';
const MUTED = 'rgba(242,240,235,0.55)';
const HAIR = 'rgba(242,240,235,0.16)';
const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';

/* ── 涂装预设 ──
   每套必须有：名字、一句话说明、车身色、点缀色、粗糙度、金属度。
   颜色不用紫色渐变——那是 AI 最容易生成的「科技感」，在真实赛道上不存在。 */
const PRESETS = [
  {
    id: 'carbon',
    name: '素碳',
    desc: '未涂装的裸碳布，能看见织纹方向。减重最省，但侧向可见度差。',
    body: 0x1a1a1f, accent: 0x5a5a62, rough: 0.72, metal: 0.28, stripe: 'none',
    note: '省掉面漆约 3–5 g',
  },
  {
    id: 'hivis',
    name: '警示橙',
    desc: '工业安全色。裁判在 20 米外能一眼看到车在哪。',
    body: 0xe8590c, accent: 0x0b0b0c, rough: 0.42, metal: 0.05, stripe: 'center',
    note: '面漆 +4 g，换判读速度',
  },
  {
    id: 'night',
    name: '夜巡黑',
    desc: '哑光黑打底，一条橙色细线。为了在灯光下不反光刺眼。',
    body: 0x111114, accent: 0xe8590c, rough: 0.88, metal: 0.0, stripe: 'hairline',
    note: '哑光面漆 +5 g',
  },
  {
    id: 'paper',
    name: '纸白',
    desc: '米白底配石墨编号。拍图最干净，代价是脏了洗不掉。',
    body: 0xece8e0, accent: 0x24242a, rough: 0.55, metal: 0.0, stripe: 'numeral',
    note: '浅色最显灰尘',
  },
  {
    id: 'olive',
    name: '军绿',
    desc: '哑光橄榄绿，低反光。车间灯光下不刺眼，长时间看眼睛舒服。',
    body: 0x4a5340, accent: 0xd8cfa8, rough: 0.80, metal: 0.0, stripe: 'none',
    note: '哑光 + 深色，最不显划痕',
  },
  {
    id: 'silver',
    name: '银灰',
    desc: '金属银，带一层清漆。能反射车间顶灯，方便看出车身有没有变形。',
    body: 0xb9bcc2, accent: 0x2a2a30, rough: 0.24, metal: 0.85, stripe: 'center',
    note: '清漆 +6 g，检形用',
  },
  {
    id: 'blue',
    name: '竞赛蓝',
    desc: '饱和的深蓝，配白字。蓝白是最容易认的组合，适合拍封面。',
    body: 0x1b3a6b, accent: 0xf2f0eb, rough: 0.30, metal: 0.10, stripe: 'numeral',
    note: '饱和色片拍出来最稳',
  },
  {
    id: 'stripe',
    name: '红白条',
    desc: '白底加两条红色纵条，从车头拉到车尾。最像「赛车」的一套。',
    body: 0xf0eee9, accent: 0xb4232a, rough: 0.48, metal: 0.0, stripe: 'twin',
    note: '双条要对称，偏一点就难看',
  },
];

const state = { idx: 0 };
const cur = () => PRESETS[state.idx];

/** 色相角度 0–360 与饱和度 0–1。只用来判「这是不是靛蓝/紫罗兰」。 */
function hueOf(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d === 0) return { h: 0, s: 0 };
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s };
}

/* ── 三维场景 ── */

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');

const gl = document.createElement('canvas');
gl.width = W; gl.height = H;

const renderer = new THREE.WebGLRenderer({
  canvas: gl, antialias: true, alpha: false, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x0b0b0c, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0b0c, 0.45, 1.20);

const camera = new THREE.PerspectiveCamera(30, W / H, 0.01, 10);
camera.position.set(0.26, 0.17, 0.30);
camera.lookAt(0, 0.022, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.36));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.40, 0.82, 0.40);
scene.add(key);
const rim = new THREE.DirectionalLight(0xE8590C, 1.3);
rim.position.set(-0.68, 0.22, -0.56);
scene.add(rim);
const fill = new THREE.DirectionalLight(0x8899bb, 0.50);
fill.position.set(-0.28, 0.14, 0.52);
scene.add(fill);
// 顶部灯板：金属漆要靠它才能看出清漆
const top = new THREE.DirectionalLight(0xffffff, 1.1);
top.position.set(0.0, 1.0, 0.05);
scene.add(top);

const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.94, metalness: 0.0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.0006;
scene.add(floor);

const grid = new THREE.GridHelper(1.0, 50, 0x2a2a32, 0x1b1b21);
grid.position.y = -0.0004;
scene.add(grid);

/* 车体：和 wheel-contact-3d 同一套尺寸，方便两套图放一起看 */
const L = 0.200, WB = 0.130, RW = 0.011;
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.7, metalness: 0.2 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0x5a5a62, roughness: 0.5, metalness: 0.3 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.95, metalness: 0.0 });
const pinMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.38, metalness: 0.7 });

const car = new THREE.Group();
scene.add(car);

const body = new THREE.Mesh(new THREE.BoxGeometry(L, 0.019, 0.030), bodyMat);
body.position.set(0, RW + 0.0095, 0);
car.add(body);

const nose = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.013, 0.024), bodyMat);
nose.position.set(0.104, RW + 0.0065, 0);
car.add(nose);

const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.008, 0.022), accentMat);
canopy.position.set(0.004, RW + 0.0225, 0);
car.add(canopy);

// 尾翼
const wing = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.0022, 0.036), accentMat);
wing.position.set(-0.096, RW + 0.030, 0);
car.add(wing);
const wingPost = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.004), accentMat);
wingPost.position.set(-0.096, RW + 0.022, 0);
car.add(wingPost);

// 四条纵条（用于 stripe 样式）
const stripeMeshes = [];
const STRIPE_Z = [-0.0082, 0.0082];
for (const z of STRIPE_Z) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, 0.0009, 0.0038), accentMat);
  s.position.set(0, RW + 0.0192, z);
  car.add(s);
  stripeMeshes.push(s);
}
// 中央单条
const centerStripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, 0.0009, 0.0072), accentMat);
centerStripe.position.set(0, RW + 0.0192, 0);
car.add(centerStripe);
// 细线
const hairStripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.98, 0.0006, 0.0016), accentMat);
hairStripe.position.set(0, RW + 0.0192, 0.0125);
car.add(hairStripe);

// 四个轮子
const wheelGeo = new THREE.CylinderGeometry(RW, RW, 0.006, 24);
wheelGeo.rotateX(Math.PI / 2);
for (const [x, z] of [[WB / 2, -0.0155], [WB / 2, 0.0155], [-WB / 2, -0.0155], [-WB / 2, 0.0155]]) {
  const m = new THREE.Mesh(wheelGeo, tyreMat);
  m.position.set(x, RW, z);
  car.add(m);
}

const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.030, 12), pinMat);
pin.position.set(WB / 2 - 0.0375, 0.015, 0);
car.add(pin);

/** 把配色推到材质上 */
function applyLivery() {
  const p = cur();
  bodyMat.color.setHex(p.body);
  bodyMat.roughness = p.rough;
  bodyMat.metalness = p.metal;
  nose.material = bodyMat;

  accentMat.color.setHex(p.accent);
  accentMat.roughness = Math.min(1, p.rough + 0.12);
  accentMat.metalness = Math.min(1, p.metal + 0.15);

  // 条纹按样式显隐
  const showTwin = p.stripe === 'twin';
  const showCenter = p.stripe === 'center';
  const showHair = p.stripe === 'hairline';
  const showNum = p.stripe === 'numeral';
  for (const s of stripeMeshes) { s.visible = showTwin; }
  centerStripe.visible = showCenter || showNum;
  hairStripe.visible = showHair || showNum;

  // 金属漆给轮子一点反光，看起来才像同一台车
  tyreMat.roughness = p.metal > 0.5 ? 0.80 : 0.95;

  body.material = bodyMat;
  canopy.material = accentMat;
  wing.material = accentMat;
  wingPost.material = accentMat;
  centerStripe.material = accentMat;
  hairStripe.material = accentMat;
  for (const s of stripeMeshes) s.material = accentMat;
}

applyLivery();

/* ── 二维叠加 ── */

function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

function compose() {
  const p = cur();

  renderer.render(scene, camera);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(gl, 0, 0, W, H);

  ctx.fillStyle = INK;
  ctx.fillRect(0, 1060, W, H - 1060);

  drawHeader(p);
  drawPalette(p);
  drawSpec(p);
  drawFooter(p);
}

function drawHeader(p) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, HEAD.barY, 46, HEAD.barH);

  ctx.fillStyle = MUTED;
  ctx.font = '500 17px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('LIVERY  ' + String(state.idx + 1).padStart(2, '0') + ' / ' + String(PRESETS.length).padStart(2, '0'), SAFE.x0, 330);

  ctx.fillStyle = PAPER;
  ctx.font = '600 64px ' + DISP;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
  ctx.fillText(p.name, SAFE.x0, 412);

  // 说明：两行，22px，行高 34
  ctx.fillStyle = MUTED;
  ctx.font = '500 22px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  const words = p.desc.split('');
  const maxW = SAFE.x1 - SAFE.x0;
  let line = '', ly = 458;
  for (const ch of words) {
    if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, SAFE.x0, ly); line = ch; ly += 34; }
    else line += ch;
  }
  if (line) ctx.fillText(line, SAFE.x0, ly);

  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, 500, SAFE.x1 - SAFE.x0, 1);
  ctx.restore();
}

function drawPalette(p) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = HAIR;
  ctx.fillRect(SAFE.x0, 1096, SAFE.x1 - SAFE.x0, 1);

  ctx.fillStyle = MUTED;
  ctx.font = '500 17px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('配色', SAFE.x0, 1140);

  // 两个大色块 + 十六进制
  const chips = [
    ['车身', p.body],
    ['点缀', p.accent],
  ];
  let x = SAFE.x0;
  for (const [lab, col] of chips) {
    ctx.fillStyle = hex(col);
    ctx.fillRect(x, 1162, 150, 92);
    ctx.strokeStyle = 'rgba(242,240,235,0.20)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, 1162.5, 149, 91);

    ctx.fillStyle = MUTED;
    ctx.font = '500 16px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText(lab, x, 1282);

    ctx.fillStyle = PAPER;
    ctx.font = '500 19px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillText(hex(col).toUpperCase(), x, 1308);

    x += 176;
  }

  // 材质参数
  ctx.textAlign = 'right';
  const rows = [
    ['粗糙度', p.rough.toFixed(2)],
    ['金属度', p.metal.toFixed(2)],
    ['条纹', { none: '无', center: '中单条', hairline: '细线', numeral: '编号条', twin: '双条' }[p.stripe]],
  ];
  let y = MAT.y0;
  for (const [k, val] of rows) {
    ctx.fillStyle = MUTED;
    ctx.font = '500 17px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText(k, SAFE.x1, y);
    ctx.fillStyle = PAPER;
    ctx.font = '500 21px ' + MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillText(val, SAFE.x1, y + 28);
    y += MAT.step;
  }
  ctx.restore();
}

function drawSpec(p) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, SPEC.barY, 3, SPEC.barH);

  ctx.fillStyle = PAPER;
  ctx.font = '600 24px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText(p.note, SAFE.x0 + 16, SPEC.noteBase);

  /* 记下结论行的真实墨迹包围盒。门禁拿它判「有没有整体落在封面里」，
     所以这里量的必须就是刚画出去的那一行，不能另写一个数。 */
  const mn = ctx.measureText(p.note);
  BANDS.conclusion = {
    text: p.note,
    baseline: SPEC.noteBase,
    y0: SPEC.noteBase - (mn.actualBoundingBoxAscent || 24 * 0.78),
    y1: SPEC.noteBase + (mn.actualBoundingBoxDescent || 24 * 0.22),
  };
  BANDS.accentBar = { y0: HEAD.barY, y1: HEAD.barY + HEAD.barH };

  ctx.fillStyle = MUTED;
  ctx.font = '500 18px ' + MONO;
  ctx.fillText('颜色只影响外观，不改质量与气动——真车这两件事要重新称重和重算', SAFE.x0 + 16, SPEC.subBase);
  ctx.restore();
}

function drawFooter(p) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = MUTED;
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('STEM RACING · LIVERY', SAFE.x0, 1472);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(242,240,235,0.32)';
  ctx.font = '500 15px ' + MONO;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillText('板件 ' + L.toFixed(3) + ' m · 轴距 ' + WB.toFixed(3) + ' m · 轮径 ' + (RW * 2000).toFixed(1) + ' mm', SAFE.x1, 1472);
  ctx.restore();
}

/* ── 交互 ── */

function bindUI() {
  const sel = document.getElementById('preset');
  if (sel) {
    sel.innerHTML = PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
    sel.value = String(state.idx);
    sel.addEventListener('change', () => { state.idx = parseInt(sel.value, 10); applyLivery(); compose(); });
  }
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const step = (d) => {
    state.idx = (state.idx + d + PRESETS.length) % PRESETS.length;
    if (sel) sel.value = String(state.idx);
    applyLivery(); compose();
  };
  if (prev) prev.addEventListener('click', () => step(-1));
  if (next) next.addEventListener('click', () => step(1));

  const btn = document.getElementById('export');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true; const old = btn.textContent; btn.textContent = '导出中…';
      try { compose(); await new Promise(r => setTimeout(r, 60)); await window.__app.downloadAll(); }
      finally { btn.disabled = false; btn.textContent = old; }
    });
  }
}

applyLivery();
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
  getBands: () => BANDS,
  ready: () => Promise.resolve(),
  getState: () => ({ idx: state.idx, id: cur().id, name: cur().name }),
  getMetrics: () => ({
    count: PRESETS.length,
    idx: state.idx,
    id: cur().id,
    name: cur().name,
    body: cur().body,
    accent: cur().accent,
    rough: cur().rough,
    metal: cur().metal,
    stripe: cur().stripe,
    names: PRESETS.map((p) => p.name),
    ids: PRESETS.map((p) => p.id),
  }),
  set: (k, val) => {
    if (k === 'idx') state.idx = Math.max(0, Math.min(PRESETS.length - 1, val | 0));
    else if (k === 'id') {
      const i = PRESETS.findIndex((p) => p.id === val);
      if (i >= 0) state.idx = i;
    }
    const sel = document.getElementById('preset');
    if (sel) sel.value = String(state.idx);
    applyLivery(); compose();
  },
  pixelHash: () => hashOf(stage),
  selfTest: () => {
    const errs = [];

    // 1. 预设数量
    if (PRESETS.length < 6) errs.push('预设少于 6 套，实际 ' + PRESETS.length);

    // 2. id 与名字都不能重复
    const ids = new Set(PRESETS.map((p) => p.id));
    const names = new Set(PRESETS.map((p) => p.name));
    if (ids.size !== PRESETS.length) errs.push('存在重复的 id');
    if (names.size !== PRESETS.length) errs.push('存在重复的名字');

    // 3. 每套必须有名字和说明
    for (const p of PRESETS) {
      if (!p.name || !p.name.trim()) errs.push('有预设缺名字');
      if (!p.desc || p.desc.trim().length < 8) errs.push(`「${p.name}」的说明太短`);
      if (!p.note || !p.note.trim()) errs.push(`「${p.name}」缺备注`);
    }

    // 4. 车身色和点缀色不能相同，否则看不出条纹
    for (const p of PRESETS) {
      if (p.body === p.accent) errs.push(`「${p.name}」车身色和点缀色相同`);
    }

    // 5. 相邻两套的配色必须真的不同
    for (let i = 0; i < PRESETS.length; i++) {
      const a = PRESETS[i], b = PRESETS[(i + 1) % PRESETS.length];
      if (a.body === b.body && a.accent === b.accent) {
        errs.push(`「${a.name}」和「${b.name}」配色完全一样`);
      }
    }

    // 6. 粗糙度/金属度必须在 [0,1]
    for (const p of PRESETS) {
      if (!(p.rough >= 0 && p.rough <= 1)) errs.push(`「${p.name}」粗糙度越界`);
      if (!(p.metal >= 0 && p.metal <= 1)) errs.push(`「${p.name}」金属度越界`);
    }

    // 7. 不许落在「科技感」默认色相带里
    //    要拦的是靛蓝→紫罗兰（hue 235–300，且饱和度够高），也就是 AI 生成
    //    界面最爱的 indigo-500 / violet-500 那一段。两个反例都不能误伤：
    //      深海军蓝 #1b3a6b  色相 217° —— 正经赛车色，色相就不同
    //      近黑 #1a1a1f      色相 240° —— 但饱和度只有 0.09，是灰不是紫
    //    所以色相和饱和度两个条件都要满足。
    for (const p of PRESETS) {
      const { h, s } = hueOf(p.body);
      if (h >= 235 && h <= 300 && s >= 0.30) {
        errs.push(`「${p.name}」hue ${h.toFixed(0)}° sat ${s.toFixed(2)} 落在靛蓝/紫罗兰带，容易被认成 AI 默认配色`);
      }
    }

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
  downloadAll: () => exportEpisode(stage, 'livery-studio-3d'),
};
