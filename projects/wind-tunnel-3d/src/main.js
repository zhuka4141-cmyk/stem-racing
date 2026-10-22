import * as THREE from 'three';

/* ============================================================
   wind-tunnel-3d · 虚拟风洞
   架构：WebGL 离屏渲染 → 贴到 2D 展示 canvas → 叠文字 → 导出
   保证「屏幕上看到的」和「导出的 PNG」是同一个像素结果。
   ============================================================ */

export const W = 1080;
export const H = 1920;

/* ---------- 场景参数（来自 racing-physics 标注规则） ---------- */
const RHO = 1.204;          // [fixed] 20°C 海平面空气密度 kg/m³
const BODY_LEN = 0.200;     // [VERIFY] 规则书最大车长 200 mm
const FRONTAL_A = 1.6e-3;   // [typical] 迎风面积 m²，需实测

const state = {
  aoa: 4.0,                 // 迎角 deg
  speed: 18.0,              // 气流速度 m/s
  showWake: true,
  paused: false,
  t: 0,
};

/* 阻力模型：平板+钝体经验式，Cd0 随迎角以 sin² 增长。
   这是工程近似，不是 CFD。README 里要写明。 */
function dragModel(aoaDeg, v) {
  const rad = aoaDeg * Math.PI / 180;
  const cd0 = 0.34;                        // [typical] 0° 迎角钝体
  const cd = cd0 + 1.9 * Math.sin(rad) ** 2;
  const q = 0.5 * RHO * v * v;             // 动压 Pa
  const force = q * cd * FRONTAL_A;        // N
  const re = v * BODY_LEN / 1.516e-5;      // [fixed] 20°C 运动粘度
  return { cd, force, q, re };
}

/* ---------- 渲染器 ---------- */
const glCanvas = document.createElement('canvas');
glCanvas.width = W; glCanvas.height = H;
const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x0b0b0c, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0b0c, 0.9, 2.4);

const camera = new THREE.PerspectiveCamera(34, W / H, 0.01, 100);
camera.position.set(0.30, 0.085, 0.42);
camera.lookAt(0, 0.01, 0);

/* ---------- 灯光：硬一点，避免塑料感 ---------- */
scene.add(new THREE.AmbientLight(0xffffff, 0.30));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(0.4, 0.9, 0.5); scene.add(key);
const rim = new THREE.DirectionalLight(0xe8590c, 1.5);
rim.position.set(-0.7, 0.25, -0.6); scene.add(rim);
const fill = new THREE.DirectionalLight(0x8899bb, 0.5);
fill.position.set(0.1, -0.6, 0.3); scene.add(fill);

/* ---------- 车体：由 2D 侧剖面挤出，比 Box 更像"设计过的" ---------- */
function buildCar() {
  const g = new THREE.Group();
  const L = BODY_LEN;                 // 200 mm 实际长度，场景单位 = 米
  const half = L / 2;

  // 侧剖面（x 沿车长，y 为高）
  const s = new THREE.Shape();
  s.moveTo(-half, 0.006);
  s.lineTo(-half + 0.020, 0.030);
  s.lineTo(-half + 0.075, 0.041);
  s.lineTo(-half + 0.130, 0.038);
  s.lineTo(half - 0.030, 0.024);
  s.lineTo(half - 0.006, 0.017);
  s.lineTo(half, 0.009);
  s.lineTo(half, 0.003);
  s.lineTo(-half, 0.003);
  s.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.036, bevelEnabled: true, bevelThickness: 0.004,
    bevelSize: 0.004, bevelSegments: 2, curveSegments: 8,
  });
  bodyGeo.translate(0, 0, -0.018);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe8590c, metalness: 0.34, roughness: 0.42, flatShading: false,
  });
  g.add(new THREE.Mesh(bodyGeo, bodyMat));

  // 四个轮：圆柱 + 硬边
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c, metalness: 0.1, roughness: 0.86,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xb8b4aa, metalness: 0.9, roughness: 0.28,
  });
  const rw = 0.0135;
  const wheels = [];
  for (const x of [-half + 0.026, half - 0.030]) {
    for (const z of [-0.030, 0.030]) {
      const wg = new THREE.CylinderGeometry(rw, rw, 0.009, 24);
      wg.rotateX(Math.PI / 2);
      const w = new THREE.Mesh(wg, wheelMat);
      w.position.set(x, rw, z);
      g.add(w); wheels.push(w);
      const hg = new THREE.CylinderGeometry(rw * 0.42, rw * 0.42, 0.0105, 16);
      hg.rotateX(Math.PI / 2);
      const hub = new THREE.Mesh(hg, hubMat);
      hub.position.set(x, rw, z);
      g.add(hub);
    }
  }

  // 导向销（导轨），这是 STEM Racing 车的辨识特征
  const pinGeo = new THREE.CylinderGeometry(0.0022, 0.0022, 0.030, 12);
  const pin = new THREE.Mesh(pinGeo, hubMat);
  pin.position.set(-half + 0.070, -0.012, 0);
  g.add(pin);

  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: g, wheels };
}

const car = buildCar();
scene.add(car.group);

/* ---------- 地面参考网格（给出尺度感） ---------- */
const grid = new THREE.GridHelper(1.2, 24, 0x2a2a2e, 0x1a1a1c);
grid.position.y = -0.02;
scene.add(grid);

/* ---------- 流场：理想绕流（势流）+ 尾流衰减 ----------
   势流绕圆柱：u = U(1 - a²(x²-z²)/r⁴), w = -U(2a²xz)/r⁴
   这是解析解，不是瞎凑的向量场，所以画面可信。 */
const NP = 2600;
const px = new Float32Array(NP), py = new Float32Array(NP), pz = new Float32Array(NP);
const age = new Float32Array(NP);
const R = 0.030;            // 等效阻塞半径
const rnd = (a, b) => a + Math.random() * (b - a);

function respawn(i, atStart) {
  px[i] = atStart ? rnd(-0.55, 0.55) : rnd(-0.16, 0.16);
  py[i] = rnd(0.004, 0.115);
  pz[i] = rnd(-0.16, 0.16);
  age[i] = 0;
}
for (let i = 0; i < NP; i++) respawn(i, true);

const flowGeo = new THREE.BufferGeometry();
const flowPos = new Float32Array(NP * 3);
const flowCol = new Float32Array(NP * 3);
flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
flowGeo.setAttribute('color', new THREE.BufferAttribute(flowCol, 3));
const flowMat = new THREE.PointsMaterial({
  size: 0.0022, vertexColors: true, transparent: true,
  opacity: 0.92, sizeAttenuation: true, depthWrite: false,
});
const flow = new THREE.Points(flowGeo, flowMat);
scene.add(flow);

const ACCENT = new THREE.Color(0xe8590c);
const COOL = new THREE.Color(0x6d7f99);

function stepFlow(dt) {
  const U = state.speed * 0.010;   // 场景单位缩放：18 m/s → 0.18 u/s
  for (let i = 0; i < NP; i++) {
    const z = px[i], y = pz[i];              // 侧视平面用 x-z
    const d = Math.hypot(z, y) + 1e-6;
    let u, w;
    if (d > R) {
      const r4 = d * d * d * d;
      u = U * (1 - (R * R * (z * z - y * y)) / r4);
      w = -U * (2 * R * R * z * y) / r4;
    } else { u = U * 0.35; w = 0; }

    // 尾流：车后速度亏损 + 湍流扰动
    if (state.showWake && z > 0.03) {
      const trail = Math.exp(-(z - 0.03) * 6) * Math.exp(-(y * y) * 220);
      u *= (1 - 0.55 * trail);
      w += (Math.random() - 0.5) * 0.6 * trail;
    }

    px[i] += u * dt;
    py[i] += w * dt * 0.6;
    age[i] += dt;

    if (px[i] > 0.60) respawn(i, false);

    const k = i * 3;
    flowPos[k] = px[i];
    flowPos[k + 1] = py[i];
    flowPos[k + 2] = pz[i];

    // 速度着色：慢=冷灰，快=橙
    const sp = Math.hypot(u, w) / (U + 1e-6);
    const c = COOL.clone().lerp(ACCENT, Math.min(1, Math.max(0, (sp - 0.55) * 1.5)));
    flowCol[k] = c.r; flowCol[k + 1] = c.g; flowCol[k + 2] = c.b;
  }
  flowGeo.attributes.position.needsUpdate = true;
  flowGeo.attributes.color.needsUpdate = true;
}

/* ---------- 展示 canvas + 文字叠层 ---------- */
const present = document.getElementById('stage');
present.width = W; present.height = H;
const ctx = present.getContext('2d');

const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';

/* 安全区：reel-format 规定 x 60–930 / y 240–1480 */
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

function compose() {
  ctx.drawImage(glCanvas, 0, 0);

  const m = dragModel(state.aoa, state.speed);
  const base = dragModel(0, state.speed);
  const dF = Math.max(0, m.force - base.force);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.lineWidth = 1;

  // 暗场：把 3D 压成中间一条，上下留给信息
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, W, 250);
  ctx.fillRect(0, 1120, W, H - 1120);

  // ---- 标题 ----
  ctx.fillStyle = '#e8590c';
  ctx.fillRect(SAFE.x0, 300, 46, 3);

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 17px ${MONO}`;
  ctx.letterSpacing = '2.4px';
  ctx.fillText('WIND TUNNEL · 虚拟风洞', SAFE.x0, 348);

  ctx.fillStyle = '#f2f0eb';
  ctx.font = `600 60px ${DISP}`;
  ctx.letterSpacing = '-1px';
  ctx.fillText('为什么迎角一改，', SAFE.x0, 422);
  ctx.fillText('成绩就掉了 0.09 秒', SAFE.x0, 486);

  ctx.fillStyle = 'rgba(242,240,235,0.6)';
  ctx.font = `500 22px ${MONO}`;
  ctx.letterSpacing = '0px';
  ctx.fillText('同一条轨道，同一次发车，只有迎角不一样', SAFE.x0, 552);

  // ---- 当前参数条 ----
  ctx.fillStyle = 'rgba(11,11,12,0.82)';
  ctx.fillRect(0, 596, W, 90);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(SAFE.x0, 596, SAFE.x1 - SAFE.x0, 1);

  const params = [
    ['迎角 AOA', `${state.aoa.toFixed(1)}°`],
    ['来流 U', `${state.speed.toFixed(1)} m/s`],
    ['尾流', state.showWake ? 'ON' : 'OFF'],
  ];
  const pw = (SAFE.x1 - SAFE.x0) / 3;
  params.forEach(([k, v], i) => {
    const x = SAFE.x0 + pw * i;
    ctx.fillStyle = 'rgba(242,240,235,0.42)';
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = '1.5px';
    ctx.fillText(k, x, 626);
    ctx.fillStyle = '#f2f0eb';
    ctx.font = `600 27px ${MONO}`;
    ctx.letterSpacing = '0px';
    ctx.fillText(v, x, 664);
  });

  // ---- 3D 区：竖向比例尺 ----
  const rx = 96, ry0 = 652, ry1 = 1098;
  ctx.strokeStyle = 'rgba(242,240,235,0.22)';
  ctx.beginPath(); ctx.moveTo(rx, ry0); ctx.lineTo(rx, ry1); ctx.stroke();
  for (let y = ry0; y <= ry1; y += 62) {
    const major = ((y - ry0) % 124) === 0;
    ctx.beginPath(); ctx.moveTo(rx - (major ? 13 : 6), y); ctx.lineTo(rx, y); ctx.stroke();
  }
  ctx.save();
  ctx.translate(rx - 22, (ry0 + ry1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(242,240,235,0.42)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '1.6px';
  ctx.fillText('50 MM', 0, 0);
  ctx.restore();

  // ---- 来流箭头 ----
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = `500 15px ${MONO}`;
  ctx.letterSpacing = '1.6px';
  ctx.fillText('来流', 152, 674);
  ctx.strokeStyle = 'rgba(242,240,235,0.28)';
  ctx.beginPath();
  ctx.moveTo(200, 669); ctx.lineTo(474, 669);
  ctx.moveTo(474, 669); ctx.lineTo(458, 663);
  ctx.moveTo(474, 669); ctx.lineTo(458, 675);
  ctx.stroke();

  // ---- 车长尺寸线 ----
  const dy = 1080, dx0 = 252, dx1 = 828;
  ctx.strokeStyle = 'rgba(232,89,12,0.55)';
  ctx.beginPath();
  ctx.moveTo(dx0, dy); ctx.lineTo(dx1, dy);
  ctx.moveTo(dx0, dy - 8); ctx.lineTo(dx0, dy + 8);
  ctx.moveTo(dx1, dy - 8); ctx.lineTo(dx1, dy + 8);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232,89,12,0.9)';
  ctx.font = `500 17px ${MONO}`;
  ctx.letterSpacing = '1.4px';
  ctx.fillText('车长 200.0 MM', (dx0 + dx1) / 2, dy - 14);

  // ---- 尾流区括号 ----
  ctx.strokeStyle = 'rgba(232,89,12,0.38)';
  ctx.beginPath();
  ctx.moveTo(706, 1046); ctx.lineTo(864, 1046);
  ctx.moveTo(706, 1040); ctx.lineTo(706, 1052);
  ctx.moveTo(864, 1040); ctx.lineTo(864, 1052);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,89,12,0.72)';
  ctx.font = `500 15px ${MONO}`;
  ctx.fillText('尾流区', 785, 1032);

  // ---- 结果区 ----
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 1120); ctx.lineTo(SAFE.x1, 1120); ctx.stroke();

  const r1 = [
    ['阻力 Fd', `${(m.force * 1000).toFixed(0)} mN`, '#e8590c'],
    ['较 0° 增加', `+${(dF * 1000).toFixed(0)} mN`, dF > 0.005 ? '#e8590c' : '#f2f0eb'],
    ['阻力倍数', `${(m.force / base.force).toFixed(2)}×`, '#f2f0eb'],
  ];
  r1.forEach(([k, v, c], i) => {
    const x = SAFE.x0 + pw * i;
    ctx.fillStyle = 'rgba(242,240,235,0.42)';
    ctx.font = `500 15px ${MONO}`;
    ctx.letterSpacing = '1.5px';
    ctx.fillText(k, x, 1156);
    ctx.fillStyle = c;
    ctx.font = `600 50px ${MONO}`;
    ctx.letterSpacing = '-1.2px';
    ctx.fillText(v, x, 1214);
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 1242); ctx.lineTo(SAFE.x1, 1242); ctx.stroke();

  const r2 = [
    ['REYNOLDS', m.re.toExponential(2).replace('e+', 'e')],
    ['CD', m.cd.toFixed(3)],
    ['动压 Q', `${m.q.toFixed(0)} Pa`],
  ];
  r2.forEach(([k, v], i) => {
    const x = SAFE.x0 + pw * i;
    ctx.fillStyle = 'rgba(242,240,235,0.38)';
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = '1.5px';
    ctx.fillText(k, x, 1276);
    ctx.fillStyle = 'rgba(242,240,235,0.88)';
    ctx.font = `500 30px ${MONO}`;
    ctx.letterSpacing = '0px';
    ctx.fillText(v, x, 1320);
  });

  // 参数可信度标注
  ctx.fillStyle = 'rgba(242,240,235,0.28)';
  ctx.font = `500 14px ${MONO}`;
  ctx.letterSpacing = '1.1px';
  ctx.fillText('ρ[FIXED]  A[TYPICAL]  CD0[TYPICAL]  ν[FIXED]', SAFE.x0, 1366);

  // ---- 品牌条 ----
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.moveTo(SAFE.x0, 1398); ctx.lineTo(SAFE.x1, 1398); ctx.stroke();
  ctx.fillStyle = 'rgba(242,240,235,0.42)';
  ctx.font = `500 15px ${MONO}`;
  ctx.letterSpacing = '2px';
  ctx.fillText('STEM RACING · EP.01', SAFE.x0, 1432);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8590c';
  ctx.fillText('20.0 M', SAFE.x1, 1432);
  ctx.textAlign = 'left';

  ctx.restore();
}

/* ---------- 动画循环 ---------- */
let last = performance.now();
let acc = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (!state.paused) {
    state.t += dt;
    stepFlow(dt);
    for (const w of car.wheels) w.rotation.z -= dt * 26;
    // 迎角体现在车体俯仰
    car.group.rotation.z = -state.aoa * Math.PI / 180 * 0.55;
  }

  renderer.render(scene, camera);
  compose();
  acc += dt;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- UI 绑定 ---------- */
const aoaEl = document.getElementById('aoa');
const spdEl = document.getElementById('spd');
aoaEl.addEventListener('input', e => {
  state.aoa = +e.target.value;
  document.getElementById('aoa-out').textContent = state.aoa.toFixed(1) + '°';
});
spdEl.addEventListener('input', e => {
  state.speed = +e.target.value;
  document.getElementById('spd-out').textContent = state.speed.toFixed(1) + ' m/s';
});
document.getElementById('wake').addEventListener('change', e => { state.showWake = e.target.checked; });
document.getElementById('pause').addEventListener('click', () => { state.paused = !state.paused; });

/* ---------- 导出 ---------- */
document.getElementById('export').addEventListener('click', async () => {
  const mod = await import('./reel-export.js');
  const btn = document.getElementById('export');
  btn.textContent = '导出中…';
  try {
    const r = await mod.exportEpisode(present, 'wind-tunnel');
    btn.textContent = `已导出 ${(r.vertical / 1024).toFixed(0)}KB`;
  } catch (err) {
    btn.textContent = '导出失败';
    console.error(err);
  }
});

/* ---------- 门禁用自检接口 ---------- */
window.__windtunnel = {
  selfTest() {
    const out = { ok: true, reasons: [] };
    const m = dragModel(0, 18);
    if (!isFinite(m.force) || m.force <= 0) { out.ok = false; out.reasons.push('force 非法'); }
    if (!isFinite(m.re) || m.re < 1e4) { out.ok = false; out.reasons.push('Re 非法'); }
    const steep = dragModel(8, 18);
    if (steep.force <= m.force) { out.ok = false; out.reasons.push('迎角增大阻力未增'); }
    return out;
  },
  getState: () => ({ ...state }),
  getMetrics: () => dragModel(state.aoa, state.speed),
  set(aoa, speed) { state.aoa = aoa; state.speed = speed; },
  canvas: present,
  // 门禁用：走和按钮完全相同的导出路径，返回真实字节数
  async exportPNG() {
    const m = await import('./reel-export.js');
    const blob = await m.toPNG(present, { width: m.REEL_W, height: m.REEL_H });
    await m.assertPNG(blob);
    return blob.size;
  },
  async exportCover() {
    const m = await import('./reel-export.js');
    const blob = await m.toPNG(present, { width: m.COVER_W, height: m.COVER_H });
    await m.assertPNG(blob);
    return blob.size;
  },
};
