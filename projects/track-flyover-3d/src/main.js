import * as THREE from 'three';
import { toPNG, assertPNG, exportEpisode, REEL_W, REEL_H, COVER_W, COVER_H } from './reel-export.js';

/* ============================================================
   track-flyover-3d · 20 m 直线赛道三维漫游
   架构照抄 wind-tunnel-3d：WebGL 离屏渲染 → 贴到 2D 展示 canvas
   → 在 2D 上叠文字和标注 → 导出这个 2D canvas。
   导出结果和屏幕所见是同一批像素。
   ============================================================ */

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';

const ACCENT = '#e8590c';
const PAPER = '#f2f0eb';
const INK = '#0b0b0c';

/* 3D 只渲染这一条横带，其余由 2D 层盖住。
   只渲染带子 = 相机 aspect 用带子的比例（宽银幕），画面不会被竖直拉扁。 */
const BAND = { y0: 668, y1: 1092 };
BAND.h = BAND.y1 - BAND.y0;

/* ---------- 车队给定值（每个都在界面上标来源） ---------- */
const P = {
  L: 20.00,          // [FIXED] 比赛赛道全长 m
  laneW: 0.180,      // [VERIFY] 跑道宽 m（自己拿卡尺量一次）
  gatePitch: 5.00,   // [FIXED] 计时门间距 m
  carLen: 0.200,     // [FIXED] 车长 m
  rho: 1.204,        // [FIXED] 20 °C 空气密度 kg/m³
  nu: 1.516e-5,      // [FIXED] 运动粘度 m²/s
  cd0: 0.34,         // [TYPICAL] 钝体 Cd
  area: 1.6e-3,      // [TYPICAL] 迎风面积 m²
};
P.gateCount = 5;
P.gates = Array.from({ length: P.gateCount }, (_, i) => +(i * P.gatePitch).toFixed(2));

/* ---------- 速度剖面 ----------
   以前这里用单指数 v(t) = v∞(1 − e^(−t/τ)) 去套三个数。那个模型是错的：
   它假设推力一直作用、速度渐近逼近 v∞，而真车是「CO₂ 气瓶 110 ms 烧完 + 滑行」。
   单指数跑不出「峰值后下降」的形状，反解时 z 要推到 200 以上才勉强收敛，
   说明那对数字根本不是它长出来的。

   现在直接积分，和其余 29 个项目同一套方程：
     推力  F(t) = F_peak · sin(π t / t_burn)      0 ≤ t ≤ t_burn
     阻力  D    = ½ ρ Cd A v²
     滚阻  R    = Crr · m · g
     m_eq       = m + 4·I_wheel / r_wheel²        轮子转动惯量的等效平移质量
   RK4，dt = 1e-5，冲线那一步线性插值（不然终点时间被 dt 量化）。
   出来的数和 accel-curve-lab / lap-time-lab 逐位一致。 */
const PHYS = {
  Fpeak: 21.0,     // [VERIFY] 推力峰值 N —— 队里没实测过，是估的
  tBurn: 0.110,    // [VERIFY] 燃烧时长 s
  m: 0.065,        // [FIXED] 整车质量 kg
  mEq: 0.079876,   // [DERIVED] m + 4·I/r² = 0.065 + 4×4.5e-7/0.011²
  crr: 0.008,      // [TYPICAL] 滚动阻力系数
  g: 9.81,         // [FIXED]
};

function simulateProfile(dt = 1e-5) {
  const { Fpeak, tBurn, m, mEq, crr, g } = PHYS;
  const accel = (t, v) => {
    const F = t < tBurn ? Fpeak * Math.sin((Math.PI * t) / tBurn) : 0;
    const drag = 0.5 * P.rho * P.cd0 * P.area * v * v;
    return (F - drag - crr * m * g) / mEq;
  };
  const tab = [{ t: 0, x: 0, v: 0, a: accel(0, 0) }];
  let t = 0, x = 0, v = 0, vMax = 0, tMax = 0;
  for (let i = 0; i < 4e6; i++) {
    const k1v = accel(t, v);                    const k1x = v;
    const k2v = accel(t + dt / 2, v + k1v * dt / 2); const k2x = v + k1v * dt / 2;
    const k3v = accel(t + dt / 2, v + k2v * dt / 2); const k3x = v + k2v * dt / 2;
    const k4v = accel(t + dt, v + k3v * dt);         const k4x = v + k3v * dt;
    const vN = v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    const xN = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    if (vN > vMax) { vMax = vN; tMax = t + dt; }
    if (xN >= P.L) {
      const f = (P.L - x) / (xN - x);
      t = t + dt * f; v = v + (vN - v) * f; x = P.L;
      tab.push({ t, x, v, a: accel(t, v) });
      return { tab, t, v, vMax, tMax };
    }
    t += dt; x = xN; v = vN;
    tab.push({ t, x, v, a: accel(t, v) });
  }
  throw new Error('积分没在 40 s 内冲线');
}
const SIM = simulateProfile();

/* 这三个数现在由积分得出，不是给定的 */
P.T = SIM.t;         // 20 m 冲线时间 s
P.V = SIM.v;         // 冲线速度 m/s
P.vMax = SIM.vMax;   // 峰值速度（燃尽时刻）
P.tMax = SIM.tMax;

/** 按时间在积分表上线性插值 */
function atTime(t) {
  const tab = SIM.tab;
  if (t <= 0) return { x: 0, v: 0, a: tab[0].a };
  if (t >= SIM.t) { const e = tab[tab.length - 1]; return { x: e.x, v: e.v, a: e.a }; }
  let lo = 0, hi = tab.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid].t < t) lo = mid; else hi = mid; }
  const A = tab[lo], B = tab[hi];
  const f = (t - A.t) / (B.t - A.t);
  return { x: A.x + (B.x - A.x) * f, v: A.v + (B.v - A.v) * f, a: A.a + (B.a - A.a) * f };
}
const vAt = (t) => atTime(t).v;
const xAt = (t) => atTime(t).x;
const aAt = (t) => atTime(t).a;

/** 反解 t(x)：x(t) 在 0..T 上单调，二分 60 次够到 1e-12 */
function tAt(x) {
  if (x <= 0) return 0;
  if (x >= P.L) return P.T;
  let lo = 0, hi = P.T;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (xAt(mid) < x) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
const SPLITS = P.gates.map((g) => tAt(g));

/* ---------- 状态 ---------- */
const state = {
  progress: 0,    // 0..1 → 相机沿赛道的比例
  slow: 0.25,     // 慢放系数：0.25 表示 1.1885 s 的实跑被拉成 4.75 s 播放
  paused: false,
};

/* ============================================================
   三维场景（单位 = 米，1:1）
   ============================================================ */
const glCanvas = document.createElement('canvas');
glCanvas.width = W; glCanvas.height = H;
const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x0b0b0c, 1);
// 只往 band 里画：视口原点在左下角
renderer.setScissorTest(true);
renderer.setScissor(0, H - BAND.y1, W, BAND.h);
renderer.setViewport(0, H - BAND.y1, W, BAND.h);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0b0c, 5.0, 30.0);

/* 机位：升到 0.52 m 并往下压 18°，地平线就被推出画面顶部，
   整条带子里只剩跑道，不留空天。 */
const camera = new THREE.PerspectiveCamera(42, W / BAND.h, 0.005, 120);
const CAM = { back: 0.86, up: 0.52, side: 0.36, ahead: 1.55 };
camera.position.set(-CAM.back, CAM.up, CAM.side);
camera.lookAt(CAM.ahead, 0.0, 0);

/* 灯：一盏硬主光 + 橙色轮廓 + 冷补光，避免塑料感 */
scene.add(new THREE.AmbientLight(0xffffff, 0.34));
const key = new THREE.DirectionalLight(0xfff4e8, 2.3);
key.position.set(2.2, 4.0, 2.4); scene.add(key);
const rim = new THREE.DirectionalLight(0xe8590c, 1.7);
rim.position.set(-3.0, 1.4, -2.2); scene.add(rim);
const fill = new THREE.DirectionalLight(0x9fb2cc, 0.55);
fill.position.set(1.0, -1.8, 1.4); scene.add(fill);

/* ---------- 跑道 ---------- */
const track = new THREE.Group();
scene.add(track);

// 铝型材跑道面。真实赛道是银灰铝挤出件，就按铝做，别刷成黑的
const MAT_ALU = new THREE.MeshStandardMaterial({ color: 0x9a9ea4, metalness: 0.22, roughness: 0.44 });
const MAT_ALU_DARK = new THREE.MeshStandardMaterial({ color: 0x5c5f66, metalness: 0.20, roughness: 0.52 });
const MAT_DARK = new THREE.MeshStandardMaterial({ color: 0x2a2b30, metalness: 0.10, roughness: 0.78 });
const MAT_WHITE = new THREE.MeshStandardMaterial({ color: 0xe8e5dc, metalness: 0.05, roughness: 0.62 });
const MAT_ORANGE = new THREE.MeshStandardMaterial({ color: 0xe8590c, metalness: 0.12, roughness: 0.48 });

const RUNOUT = 1.30;               // 终点后的缓冲段
const TRACK_END = P.L + RUNOUT;

const slab = new THREE.Mesh(new THREE.BoxGeometry(TRACK_END, 0.012, P.laneW), MAT_ALU);
slab.position.set(TRACK_END / 2, -0.006, 0);
track.add(slab);

// 中央导轨：车上的导向销就卡在这条缝里，这是这类车的辨识特征
const rail = new THREE.Mesh(new THREE.BoxGeometry(TRACK_END, 0.013, 0.006), MAT_DARK);
rail.position.set(TRACK_END / 2, 0.0065, 0);
track.add(rail);

// 两侧护栏。做高一点，透视里能一直收到灭点，画面上下两半都有结构
for (const z of [-1, 1]) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(TRACK_END, 0.034, 0.005), MAT_ALU_DARK);
  c.position.set(TRACK_END / 2, 0.017, z * (P.laneW / 2 - 0.0025));
  track.add(c);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(TRACK_END, 0.003, 0.008), MAT_ALU);
  lip.position.set(TRACK_END / 2, 0.034, z * (P.laneW / 2 - 0.004));
  track.add(lip);
}

// 每 1 m 一道刻度；5 m 处有计时门，跳过别和门座重叠
for (let m = 1; m < P.L; m++) {
  if (m % 5 === 0) continue;
  const tick = new THREE.Mesh(
    new THREE.BoxGeometry(0.0018, 0.0012, P.laneW - 0.010), MAT_DARK,
  );
  tick.position.set(m, 0.0006, 0);
  track.add(tick);
}

// 起跑线 / 终点线
const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0014, P.laneW), MAT_WHITE);
startLine.position.set(0.004, 0.0008, 0);
track.add(startLine);
const finishLine = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0014, P.laneW), MAT_ORANGE);
finishLine.position.set(P.L, 0.0008, 0);
track.add(finishLine);

// 终点缓冲垫：告诉观众车到 20 m 之后还得停下来
const brakeMat = new THREE.Mesh(new THREE.BoxGeometry(RUNOUT, 0.004, P.laneW - 0.004), MAT_DARK);
brakeMat.position.set(P.L + RUNOUT / 2, 0.002, 0);
track.add(brakeMat);

/* ---------- 计时门 ---------- */
const GATE_H = 0.152;
for (let i = 0; i < P.gateCount; i++) {
  const x = P.gates[i];
  const isEnd = i === 0 || i === P.gateCount - 1;
  const mat = i === 0 ? MAT_WHITE : (i === P.gateCount - 1 ? MAT_ORANGE : MAT_ALU_DARK);

  for (const z of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.0045, GATE_H, 0.0045), mat);
    post.position.set(x, GATE_H / 2, z * (P.laneW / 2 + 0.018));
    track.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0045, P.laneW + 0.040), mat);
  beam.position.set(x, GATE_H, 0);
  track.add(beam);

  // 门楣挂牌：远处一串退过去的实心块，是这道门上唯一在远处还看得见的东西
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.026, 0.046), mat);
  sign.position.set(x, GATE_H - 0.017, 0);
  track.add(sign);

  // 计时光束：车切过去就算一次。自发光，不受灯光影响，远处也能看见
  const rayMat = new THREE.MeshBasicMaterial({
    color: i === P.gateCount - 1 ? 0xff7a33 : 0xe8590c,
    transparent: true, opacity: isEnd ? 0.85 : 0.40,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const ray = new THREE.Mesh(new THREE.PlaneGeometry(P.laneW, 0.0018), rayMat);
  ray.rotation.x = -Math.PI / 2;
  ray.rotation.z = Math.PI / 2;
  ray.position.set(x, 0.011, 0);
  track.add(ray);

  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.0012, P.laneW + 0.036), mat);
  pad.position.set(x, 0.0006, 0);
  track.add(pad);
}

/* ---------- 车 ---------- */
function buildCar() {
  const g = new THREE.Group();
  const half = P.carLen / 2;

  const s = new THREE.Shape();
  s.moveTo(-half, 0.004);
  s.lineTo(-half + 0.020, 0.024);
  s.lineTo(-half + 0.072, 0.034);
  s.lineTo(-half + 0.128, 0.031);
  s.lineTo(half - 0.028, 0.019);
  s.lineTo(half - 0.006, 0.012);
  s.lineTo(half, 0.006);
  s.lineTo(half, 0.002);
  s.lineTo(-half, 0.002);
  s.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.030, bevelEnabled: true, bevelThickness: 0.003,
    bevelSize: 0.003, bevelSegments: 2, curveSegments: 6,
  });
  bodyGeo.translate(0, 0, -0.015);
  g.add(new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({
    color: 0xe8590c, metalness: 0.30, roughness: 0.38,
  })));

  const rw = 0.0125;
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.08, roughness: 0.88 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8b4aa, metalness: 0.55, roughness: 0.30 });
  for (const wx of [-half + 0.024, half - 0.028]) {
    for (const wz of [-0.026, 0.026]) {
      const wg = new THREE.CylinderGeometry(rw, rw, 0.008, 18);
      wg.rotateX(Math.PI / 2);
      const w = new THREE.Mesh(wg, wheelMat);
      w.position.set(wx, rw, wz);
      g.add(w);
      const hg = new THREE.CylinderGeometry(rw * 0.40, rw * 0.40, 0.0092, 12);
      hg.rotateX(Math.PI / 2);
      const hub = new THREE.Mesh(hg, hubMat);
      hub.position.set(wx, rw, wz);
      g.add(hub);
    }
  }
  // 导向销
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.022, 10), hubMat);
  pin.position.set(-half + 0.062, -0.010, 0);
  g.add(pin);
  return g;
}
const car = buildCar();
track.add(car);

/* ---------- 地面：给一点空间参考，别让跑道浮在纯黑里 ---------- */
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 4),
  new THREE.MeshStandardMaterial({ color: 0x141418, metalness: 0.0, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(P.L / 2, -0.075, 0);
scene.add(floor);

const grid = new THREE.GridHelper(60, 120, 0x232329, 0x1a1a1e);
grid.position.set(P.L / 2, -0.074, 0);
scene.add(grid);

/* ============================================================
   相机：跟着车走，把车放在画面里，前方留出赛道
   ============================================================ */
const camTarget = new THREE.Vector3();
function updateCamera() {
  const cx = state.progress * P.L;
  car.position.x = cx;
  camera.position.set(cx - CAM.back, CAM.up, CAM.side);
  camTarget.set(cx + CAM.ahead, 0.0, 0);
  camera.lookAt(camTarget);
  camera.updateMatrixWorld();
}

/* ============================================================
   2D 展示层
   ============================================================ */
const present = document.getElementById('stage');
present.width = W; present.height = H;
const ctx = present.getContext('2d');

const _v = new THREE.Vector3();
/** 世界坐标 → 画布像素 */
function project(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, z: _v.z };
}

/* 每次 txt() 都把包围盒记下来。门禁据此断言「版面里没有两块字压在一起」，
   比人眼看图可靠：改字号、改文案之后重叠会立刻被抓到。 */
const BOXES = [];

function txt(text, x, y, { font, color, ls = '0px', align = 'left' } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.letterSpacing = ls;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);

  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
  const w = ctx.measureText(text).width;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  BOXES.push({ t: text, x: x0, y: y - size * 0.80, w, h: size * 1.02, align });
  ctx.textAlign = 'left';
}

const n2 = (v) => v.toFixed(2);
const n3 = (v) => v.toFixed(3);

function compose() {
  BOXES.length = 0;
  updateCamera();
  renderer.render(scene, camera);

  // 只把 band 那块贴过来，band 以外用墨色盖死，保证没有残留像素
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(glCanvas, 0, BAND.y0, W, BAND.h, 0, BAND.y0, W, BAND.h);

  const x = state.progress * P.L;
  const t = tAt(x);
  const v = vAt(t);
  const avgV = P.L / P.T;
  // 半正弦推力在 t=0 时为 0，a(0) 是负的（只有滚阻）。真峰值在燃尽中点。
  const peakA = aAt(PHYS.tBurn / 2);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.lineWidth = 1;

  /* ---- 标题 ---- */
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, 296, 46, 3);

  txt('TRACK FLYOVER · 直线赛道三维漫游', SAFE.x0, 346,
    { font: `500 16px ${MONO}`, color: 'rgba(242,240,235,0.52)', ls: '2.4px' });

  txt('20.00 米直线', SAFE.x0, 424,
    { font: `600 70px ${DISP}`, color: PAPER, ls: '-0.5px' });

  txt(`${P.T.toFixed(3)} s 跑完 · 末速 ${P.V.toFixed(2)} m/s`, SAFE.x0, 486,
    { font: `600 30px ${MONO}`, color: ACCENT, ls: '0px' });

  txt('相机跟着车走，五道计时门各报一次分段', SAFE.x0, 524,
    { font: `500 19px ${MONO}`, color: 'rgba(242,240,235,0.46)', ls: '0.4px' });

  /* 右侧规格表：标题左对齐会空出右半边，用一张对齐的表把它压住 */
  const SPEC_X = 700;
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.moveTo(SPEC_X - 34, 344); ctx.lineTo(SPEC_X - 34, 470); ctx.stroke();

  const specRows = [
    ['赛道全长', '20.00 m', 'rgba(242,240,235,0.88)'],
    ['计时门', '5 × 5.00 m', 'rgba(242,240,235,0.88)'],
    ['跑道宽', '0.180 m', ACCENT],
  ];
  specRows.forEach(([k, val, col], i) => {
    const ry = 372 + i * 40;
    txt(k, SPEC_X, ry, { font: `500 14px ${MONO}`, color: 'rgba(242,240,235,0.36)', ls: '1.4px' });
    txt(val, SAFE.x1, ry, { font: `600 20px ${MONO}`, color: col, ls: '-0.2px', align: 'right' });
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(SPEC_X, ry + 12); ctx.lineTo(SAFE.x1, ry + 12);
    ctx.stroke();
  });
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 556); ctx.lineTo(SAFE.x1, 556); ctx.stroke();

  /* ---- 参数条 ---- */
  const barY = 576, barH = 76;
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fillRect(SAFE.x0, barY, SAFE.x1 - SAFE.x0, barH);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, barY, 3, barH);

  const pw = (SAFE.x1 - SAFE.x0) / 4;
  const cells = [
    ['相机进度', `${(state.progress * 100).toFixed(0)}%`],
    ['赛道位置', `${n2(x)} m`],
    ['此刻车速', `${n2(v)} m/s`],
    ['慢放', `${state.slow.toFixed(2)}×`],
  ];
  cells.forEach(([k, val], i) => {
    const px = SAFE.x0 + 16 + pw * i;
    txt(k, px, barY + 28, { font: `500 13px ${MONO}`, color: 'rgba(242,240,235,0.44)', ls: '1.5px' });
    txt(val, px, barY + 60, { font: `600 27px ${MONO}`, color: PAPER, ls: '-0.4px' });
  });

  /* ---- 3D 区标注 ---- */
  // 车在屏幕上很小，画一条引线指过去，否则观众找不到
  const carScreen = project(x, 0.030, 0);
  if (carScreen.z < 1 && carScreen.y > BAND.y0 && carScreen.y < BAND.y1) {
    const lx = Math.min(Math.max(carScreen.x + 18, SAFE.x0 + 20), SAFE.x1 - 170);
    const ly = Math.max(carScreen.y - 34, BAND.y0 + 42);
    ctx.strokeStyle = 'rgba(232,89,12,0.8)';
    ctx.beginPath();
    ctx.moveTo(carScreen.x, carScreen.y - 10);
    ctx.lineTo(carScreen.x, ly + 12);
    ctx.lineTo(lx - 8, ly + 12);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(carScreen.x, carScreen.y - 2);
    ctx.lineTo(carScreen.x - 5, carScreen.y - 12);
    ctx.lineTo(carScreen.x + 5, carScreen.y - 12);
    ctx.closePath(); ctx.fill();

    txt(`车 @ ${n2(x)} m`, lx, ly,
      { font: `600 20px ${MONO}`, color: ACCENT, ls: '0.6px' });
    txt(`${n2(v)} m/s · t = ${n2(t)} s`, lx, ly + 26,
      { font: `500 15px ${MONO}`, color: 'rgba(242,240,235,0.68)', ls: '0.4px' });
  }

  // 跑道宽度标尺：在车的横截面上量，投影后画的是真实宽度
  const pA = project(x, 0.0008, -P.laneW / 2);
  const pB = project(x, 0.0008, P.laneW / 2);
  if (pA.y > BAND.y0 + 30 && pA.y < BAND.y1 - 34) {
    const mx = (pA.x + pB.x) / 2;
    const my = Math.max(pA.y, pB.y) + 44;
    ctx.strokeStyle = 'rgba(242,240,235,0.40)';
    ctx.beginPath();
    ctx.moveTo(mx - 52, my); ctx.lineTo(mx + 52, my);
    ctx.moveTo(mx - 52, my - 6); ctx.lineTo(mx - 52, my + 6);
    ctx.moveTo(mx + 52, my - 6); ctx.lineTo(mx + 52, my + 6);
    ctx.stroke();
    txt('跑道宽 0.180 m [VERIFY]', mx, my + 24,
      { font: `500 14px ${MONO}`, color: 'rgba(242,240,235,0.55)', ls: '1.1px', align: 'center' });
  }

  txt('1:1 三维场景 · 单位米', SAFE.x0, BAND.y0 + 30,
    { font: `500 13px ${MONO}`, color: 'rgba(242,240,235,0.34)', ls: '1.4px' });

  /* ---- 计时门时间轴 ---- */
  const ax0 = SAFE.x0, ax1 = SAFE.x1, axY = 1230;
  const gx = (i) => ax0 + (P.gates[i] / P.L) * (ax1 - ax0);

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 1108); ctx.lineTo(SAFE.x1, 1108); ctx.stroke();

  txt('TIMING GATES · 五道门，间距 5.00 m', SAFE.x0, 1140,
    { font: `500 15px ${MONO}`, color: 'rgba(242,240,235,0.52)', ls: '1.8px' });

  // 进度条：已跑过的部分填橙色
  const carPx = ax0 + (x / P.L) * (ax1 - ax0);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(ax0, axY, ax1 - ax0, 5);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(ax0, axY, Math.max(0, carPx - ax0), 5);

  for (let i = 0; i < P.gateCount; i++) {
    const gxp = gx(i);
    const passed = x >= P.gates[i] - 1e-9;
    ctx.fillStyle = passed ? ACCENT : 'rgba(242,240,235,0.55)';
    ctx.fillRect(gxp - 1, axY - 7, 2, 19);

    const align = i === 0 ? 'left' : (i === P.gateCount - 1 ? 'right' : 'center');

    txt(`G${i + 1}`, gxp, 1180,
      { font: `500 13px ${MONO}`, color: 'rgba(242,240,235,0.40)', ls: '1.4px', align });

    txt(i === 0 ? '0.000' : n3(SPLITS[i]), gxp, 1212,
      { font: `600 22px ${MONO}`, color: passed ? ACCENT : 'rgba(242,240,235,0.62)', ls: '-0.3px', align });

    txt(`${n2(P.gates[i])} m`, gxp, 1258,
      { font: `500 13px ${MONO}`, color: 'rgba(242,240,235,0.38)', ls: '0.8px', align });
  }
  ctx.textAlign = 'left';

  /* ---- 关键数字 ---- */
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 1284); ctx.lineTo(SAFE.x1, 1284); ctx.stroke();

  const cw = (SAFE.x1 - SAFE.x0) / 3;
  const stats = [
    ['全长 L', '20.00 m', PAPER],
    ['推力峰值', `${peakA.toFixed(1)} m/s²`, ACCENT],
    ['平均速度', `${n2(avgV)} m/s`, PAPER],
  ];
  stats.forEach(([k, val, col], i) => {
    const sx = SAFE.x0 + cw * i;
    txt(k, sx, 1312, { font: `500 13px ${MONO}`, color: 'rgba(242,240,235,0.42)', ls: '1.5px' });
    txt(val, sx, 1352, { font: `600 32px ${MONO}`, color: col, ls: '-0.6px' });
  });

  txt(`21 N / 110 ms 积分得 ${P.T.toFixed(3)} s · 末速 ${P.V.toFixed(2)} · 峰值 ${P.vMax.toFixed(2)} [DERIVED]`,
    SAFE.x0, 1390,
    { font: `500 13px ${MONO}`, color: 'rgba(242,240,235,0.34)', ls: '0.9px' });

  /* ---- 品牌条 ---- */
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 1424); ctx.lineTo(SAFE.x1, 1424); ctx.stroke();
  txt('STEM RACING · TRACK FLYOVER', SAFE.x0, 1452,
    { font: `500 15px ${MONO}`, color: 'rgba(242,240,235,0.42)', ls: '2px' });
  txt('车长 0.200 m', SAFE.x1, 1452,
    { font: `500 15px ${MONO}`, color: ACCENT, ls: '2px', align: 'right' });
  ctx.textAlign = 'left';

  ctx.restore();
}

/* ---------- 动画循环 ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!state.paused) {
    // 进度按真实车速推进，再乘慢放系数：slow=0.25 → 1.1885 s 的实跑播 4.75 s
    const vNow = vAt(tAt(state.progress * P.L));
    state.progress += (vNow / P.L) * state.slow * dt;
    if (state.progress >= 1) state.progress = 0;   // 到终点回到起点循环
    syncUI();
  }
  compose();
  requestAnimationFrame(loop);
}

/* ---------- UI ---------- */
const progEl = document.getElementById('prog');
const slowEl = document.getElementById('slow');
const progOut = document.getElementById('prog-out');
const slowOut = document.getElementById('slow-out');
const pauseBtn = document.getElementById('pause');

let dragging = false;
progEl.addEventListener('pointerdown', () => { dragging = true; });
window.addEventListener('pointerup', () => { dragging = false; });
progEl.addEventListener('input', (e) => {
  state.progress = +e.target.value / 1000;
  compose();
});
slowEl.addEventListener('input', (e) => {
  state.slow = +e.target.value / 100;
  slowOut.textContent = `${state.slow.toFixed(2)}×`;
});
pauseBtn.addEventListener('click', () => {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '继续' : '暂停';
});

function syncUI() {
  if (!dragging) progEl.value = String(Math.round(state.progress * 1000));
  progOut.textContent = `${(state.progress * 100).toFixed(0)}%`;
  slowOut.textContent = `${state.slow.toFixed(2)}×`;
}

/* ---------- 导出 ---------- */
document.getElementById('export').addEventListener('click', async () => {
  const btn = document.getElementById('export');
  btn.textContent = '导出中…';
  try {
    const r = await exportEpisode(present, 'track-flyover');
    btn.textContent = `已导出 ${(r.vertical / 1024).toFixed(0)} KB`;
  } catch (err) {
    btn.textContent = '导出失败';
    console.error(err);
  }
});

/* ---------- 门禁钩子 ---------- */
window.__track = {
  canvas: present,
  stacks: { MONO, DISP },
  getState: () => ({ ...state }),
  boxes: () => BOXES.map((b) => ({ ...b })),
  setProgress(p) { state.progress = Math.min(1, Math.max(0, p)); syncUI(); compose(); },
  setSlow(s) { state.slow = s; slowOut.textContent = `${s.toFixed(2)}×`; },
  setPaused(p) { state.paused = p; },
  getMetrics() {
    const x = state.progress * P.L;
    const t = tAt(x);
    return { x, t, v: vAt(t), a: aAt(t) };
  },
  profileAt(t) { return { x: xAt(t), v: vAt(t), a: aAt(t) }; },
  sim: () => ({ t: SIM.t, v: SIM.v, vMax: SIM.vMax, tMax: SIM.tMax, steps: SIM.tab.length }),
  splits: () => SPLITS.slice(),
  gates: () => P.gates.slice(),
  params: () => ({ ...P }),
  selfTest() {
    const errs = [];
    if (!(SIM.t > 0 && SIM.t < 5)) errs.push(`冲线时间非法 ${SIM.t}`);
    if (Math.abs(xAt(SIM.t) - P.L) > 1e-6) {
      errs.push(`t=${SIM.t.toFixed(4)} 时 x=${xAt(SIM.t).toFixed(6)}，不是 20 m`);
    }
    // 半正弦推力在 t=0 时为 0，起步瞬间只有滚阻——这是形状决定的，不是错。
    // 要验的是燃尽前的峰值加速度：21 N / 0.079876 kg ≈ 262.9 m/s²。
    const aPeak = aAt(PHYS.tBurn / 2);
    if (!(aPeak > 0)) errs.push('燃烧中点加速度非正');
    if (Math.abs(aPeak - 262.9) > 1.0) errs.push(`峰值加速度 ${aPeak.toFixed(1)} 和基准 262.9 差太多`);

    // 峰值必须出现在燃尽附近，之后必须减速——这才叫「脉冲 + 滑行」
    if (!(SIM.tMax > 0.09 && SIM.tMax < 0.13)) errs.push(`峰值时刻 ${SIM.tMax.toFixed(3)} 不在燃尽区间`);
    if (!(SIM.vMax > SIM.v)) errs.push('峰值速度不比末速大，说明没在滑行');
    if (!(vAt(SIM.t - 0.05) > vAt(SIM.t))) errs.push('冲线前没减速，模型不是脉冲 + 滑行');

    // 必须和共用内核给出的基准逐位对上，否则又是另一个模型
    if (Math.abs(SIM.t - 1.1885) > 2e-3) errs.push(`冲线 ${SIM.t.toFixed(4)} s 和基准 1.1885 差太多`);
    if (Math.abs(SIM.v - 16.906) > 5e-3) errs.push(`末速 ${SIM.v.toFixed(4)} 和基准 16.906 差太多`);
    if (Math.abs(SIM.vMax - 18.347) > 5e-3) errs.push(`峰值 ${SIM.vMax.toFixed(4)} 和基准 18.347 差太多`);
    for (let i = 1; i < SPLITS.length; i++) {
      if (!(SPLITS[i] > SPLITS[i - 1])) errs.push('分段成绩非单调');
    }
    return { ok: errs.length === 0, errs };
  },
  async exportPNG() {
    compose();
    const b = await toPNG(present, { width: REEL_W, height: REEL_H });
    await assertPNG(b);
    return b.size;
  },
  async exportCover() {
    compose();
    const b = await toPNG(present, { width: COVER_W, height: COVER_H });
    await assertPNG(b);
    return b.size;
  },
};

compose();
requestAnimationFrame(loop);
