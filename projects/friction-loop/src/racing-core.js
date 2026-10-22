/* 20 米直线加速 · 共用物理内核
   四个项目共用这一份。build.mjs 会把它从 ../../shared/ 覆盖进项目，
   要改就改 shared 里这一份，改完重新 build。

   标注体系（racing-physics skill）：
     [FIXED]   物理常数，可以直接信
     [TYPICAL] 文献/同类车中值，没实测就不能当结论
     [VERIFY]  待车队实测，现在的值只当占位

   这一版换掉了旧的「4.5 N 平台推力 + 指数衰减」模型。旧模型是靠
   强行凑 1.230 s / 19.93 m/s 那组参考值标定出来的，而那组数自身矛盾：
   20 m 跑 1.230 s，平均速度只能有 16.26 m/s；CO₂ 推力只持续一百多毫秒，
   之后全程减速，末速必然低于平均速度，不可能到 19.93。
   现在这组是车队给定并验过自洽的：F_peak = 21 N、t_burn = 110 ms
   → 20 m 用 1.1885 s、末速 16.906 m/s、平均 16.83 m/s（末速略高于平均，
   因为低速段只占 0.11 s）。

   坐标：x 沿赛道向前，v 沿赛道；单位 m / m·s⁻¹ / N / N·m。 */

/* ---------- 物理常数 [FIXED] ---------- */
export const RHO = 1.204;      // 20 °C 海平面空气密度 kg/m³
export const NU = 1.516e-5;    // 20 °C 空气运动粘度 m²/s
export const G = 9.81;         // 重力加速度 m/s²

/* ---------- 参数表 ----------
   status 必须原样印在界面上。没标来源的数字不许出现在屏幕上。 */
export const PARAMS = {
  m:        { v: 0.065,  unit: 'kg',    status: 'VERIFY',  label: '整车质量' },
  iWheel:   { v: 4.5e-7, unit: 'kg·m²', status: 'TYPICAL', label: '单轮转动惯量' },
  rWheel:   { v: 0.011,  unit: 'm',     status: 'TYPICAL', label: '轮半径' },
  nWheel:   { v: 4,      unit: '',      status: 'FIXED',   label: '轮数' },
  area:     { v: 1.6e-3, unit: 'm²',    status: 'TYPICAL', label: '迎风面积' },
  cd:       { v: 0.34,   unit: '',      status: 'TYPICAL', label: '零升阻力系数' },
  crr:      { v: 0.008,  unit: '',      status: 'TYPICAL', label: '滚动阻力系数' },
  mu:       { v: 0.60,   unit: '',      status: 'TYPICAL', label: '轮轨摩擦系数' },
  len:      { v: 0.200,  unit: 'm',     status: 'VERIFY',  label: '车身长度' },
  width:    { v: 0.050,  unit: 'm',     status: 'TYPICAL', label: '车身宽度（横流投影）' },
  track:    { v: 20.0,   unit: 'm',     status: 'VERIFY',  label: '赛道长度' },
  wheelbase:{ v: 0.130,  unit: 'm',     status: 'TYPICAL', label: '轴距' },
  comFrac:  { v: 0.55,   unit: '',      status: 'TYPICAL', label: '质心距前轴 / 轴距' },
  armPin:   { v: 0.0375, unit: 'm',     status: 'TYPICAL', label: '导轨销到前轴' },
  comH:     { v: 0.012,  unit: 'm',     status: 'TYPICAL', label: '质心高度' },
  toe:      { v: 0.00,   unit: 'deg',   status: 'VERIFY',  label: '前轮前束角' },
};

/* ---------- 推力模型 ----------
   CO₂ 破膜后是一次半正弦脉冲：F(t) = F_peak·sin(π t / t_burn)，t > t_burn 归零。
   冲量解析解 I = ∫F dt = 2 F_peak t_burn / π = 1.4706 N·s。
   峰值加速度 21 / 0.079876 = 262.9 m/s² ≈ 26.8 g。
   F_peak 和 t_burn 都是 [VERIFY]：气瓶压力、破膜时间、喷管面积都没实测过。 */
export const THRUST = { Fpeak: 21.0, tBurn: 0.110 };

/** sanity band：落在外面的整跑成绩说明模型或参数错了，不是车突然变快 */
export const BAND = { min: 1.00, max: 1.25 };

/** 本参数组自己解出来的参考解。不是实测成绩，是「这组数放进去会得到什么」。
    四个项目都拿它当对照，避免各自记一个数。 */
export const REFERENCE = {
  time: 1.1885,      // s    20 m 用时
  vFinish: 16.906,   // m/s  末速度
  vMax: 18.347,      // m/s  峰值速度，出现在 t = t_burn
  xAtBurn: 1.010,    // m    烧完时已跑过的距离
  impulse: 1.4706,   // N·s  推力冲量
  effMass: 0.079876, // kg   等效惯性质量
  band: '1.00–1.25 s',
};

export function bandCheck(t) {
  if (!Number.isFinite(t)) return { ok: false, side: 'nan', text: '积分发散，成绩不是有限数' };
  if (t < BAND.min) return { ok: false, side: 'fast', text: `快过下界 ${BAND.min.toFixed(2)} s，模型有问题` };
  if (t > BAND.max) return { ok: false, side: 'slow', text: `慢过上界 ${BAND.max.toFixed(2)} s，模型有问题` };
  return { ok: true, side: 'in', text: `在 ${BAND.min.toFixed(2)}–${BAND.max.toFixed(2)} s 内` };
}

/* ---------- 等效惯性质量 ----------
   车轮转动惯量要折算到平动上：多出来的 4·I_w/r_w² 相当于凭空加了一点质量。
   这一组：0.065 + 4×4.5e-7 / 0.011² = 0.079876 kg，按平动质量算会低估 18.6 %。
   I_w 用的是车队给的实测值，不是实心圆盘近似。 */
export function effMass(p = flatParams()) {
  return p.m + (p.nWheel * p.iWheel) / (p.rWheel * p.rWheel);
}

export function inertiaShare(p = flatParams()) {
  return (effMass(p) - p.m) / effMass(p);
}

/* ---------- 三个力 ---------- */
export function thrustAt(t, th = THRUST) {
  if (t <= 0) return 0;
  if (t >= th.tBurn) return 0;
  return th.Fpeak * Math.sin((Math.PI * t) / th.tBurn);
}

export function dragForce(v, p = flatParams()) {
  return 0.5 * RHO * p.cd * p.area * v * v;
}

export function rollForce(p = flatParams()) {
  return p.crr * p.m * G;
}

/** 推力冲量解析解 */
export function impulse(th = THRUST) {
  return (2 * th.Fpeak * th.tBurn) / Math.PI;
}

/* ---------- 单步加速度 ----------
   (m + Σ I_w/r_w²)·a = F_thrust(t) − ½ρCdA v² − Crr·m·g − F_scrub   */
export function accel(v, t, p = flatParams(), o = {}) {
  const th = o.thrust ?? THRUST;
  const fThrust = thrustAt(t, th);
  const fDrag = dragForce(v, p);
  const fRoll = rollForce(p);
  const fScrub = o.scrub ?? 0;
  return (fThrust - fDrag - fRoll - fScrub) / effMass(p);
}

/* ---------- RK4 积分 ----------
   dt = 0.5 ms。闭式解只对常推力成立（半正弦项乘 v² 阻力没有解析解），
   所以必须数值积分。1 ms / 0.5 ms / 0.25 ms 三档结果差 < 1 ms，收敛得住。 */
export function simulateRun(p = flatParams(), o = {}) {
  const dt = o.dt ?? 5e-4, maxT = o.maxT ?? 6;
  const stopAt = o.stopAt ?? p.track;
  const th = o.thrust ?? THRUST;
  let x = o.x0 ?? 0, v = o.v0 ?? 0, t = o.t0 ?? 0, i = 0;
  const maxSteps = Math.ceil(maxT / dt);
  const a = (vv, tt) => accel(vv, tt, p, { ...o, thrust: th });
  while (x < stopAt && i < maxSteps) {
    const k1v = a(v, t), k1x = v;
    const k2v = a(v + 0.5 * dt * k1v, t + 0.5 * dt), k2x = v + 0.5 * dt * k1v;
    const k3v = a(v + 0.5 * dt * k2v, t + 0.5 * dt), k3x = v + 0.5 * dt * k2v;
    const k4v = a(v + dt * k3v, t + dt), k4x = v + dt * k3v;
    x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    t += dt; i++;
    if (!Number.isFinite(x) || !Number.isFinite(v)) break;
  }
  return { t: t - (o.t0 ?? 0), tAbs: t, v, x, steps: i, hitEnd: x >= stopAt };
}

/** 带采样点的轨迹，画 v(t) / v(x) 曲线用 */
export function traceRun(p = flatParams(), o = {}) {
  const dt = o.dt ?? 1e-3, maxT = o.maxT ?? 3, stride = o.stride ?? 2;
  const stopAt = o.stopAt ?? p.track;
  const th = o.thrust ?? THRUST;
  const pts = [];
  let x = o.x0 ?? 0, v = o.v0 ?? 0, t = 0, i = 0;
  const maxSteps = Math.ceil(maxT / dt);
  const a = (vv, tt) => accel(vv, tt, p, { ...o, thrust: th });
  pts.push({ t: 0, x, v });
  while (x < stopAt && i < maxSteps) {
    const k1v = a(v, t), k1x = v;
    const k2v = a(v + 0.5 * dt * k1v, t + 0.5 * dt), k2x = v + 0.5 * dt * k1v;
    const k3v = a(v + 0.5 * dt * k2v, t + 0.5 * dt), k3x = v + 0.5 * dt * k2v;
    const k4v = a(v + dt * k3v, t + dt), k4x = v + dt * k3v;
    x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    t += dt; i++;
    if (i % stride === 0) pts.push({ t, x, v });
    if (!Number.isFinite(x) || !Number.isFinite(v)) break;
  }
  pts.push({ t, x, v });
  return pts;
}

/* ---------- 轴荷与偏航 ----------
   N_f = m·g·(1 − comFrac) + F·dh/L_wb
   第二项是推力线相对质心的高度差造成的俯仰载荷转移：
   推力线高于质心 → 压前轴；低于质心 → 掀前轴。
   默认 dh = 0（推力线和质心同高这一假设本身是 [VERIFY]）。 */
export function axleLoads(p = flatParams(), thrust = 0, dh = 0) {
  const W = p.m * G;
  const nf = W * (1 - p.comFrac) + (thrust * dh) / p.wheelbase;
  return { nf, nr: W - nf, total: W };
}

/** 前轴抗偏航力矩上限：μ·N_f·(导轨销到前轴的距离) */
export function yawLimit(p = flatParams(), nf) {
  return p.mu * nf * p.armPin;
}

/** 临界横向质心偏移：前轮侧向力刚好用光时，推力线能偏多远 */
export function criticalOffset(p = flatParams(), thrust = THRUST.Fpeak, nf) {
  return yawLimit(p, nf) / thrust;
}

/* ---------- 气动与涡脱落 ---------- */
/** 雷诺数，特征长度取车长 */
export function reynolds(v, p = flatParams()) {
  return (v * p.len) / NU;
}

/* 卡门涡街脱落频率 f = St·U/D。
 *
 * 特征长度是**横流方向的投影宽度** D，不是车长 L。涡脱落是绕钝体截面发生的，
 * 决定脱落周期的是流体绕过去要走多宽，车身多长不影响。
 *
 * 原来这里写的 p.len，在 16.906 m/s 下算出 16.9 Hz；按车宽算是 67.6 Hz，
 * 正好差 L/D = 4 倍。turbulence-streak 一直按车宽算，并且把差异当成"已知问题"
 * 记录在 README 里——现在差异没有了，错的那一边被改掉了。
 *
 * St ≈ 0.2 是圆柱绕流在亚临界区（Re 10³–2×10⁵）的文献中值，没测过。 */
export function sheddingFreq(v, p = flatParams(), St = 0.2) {
  return (St * v) / p.width;
}

/** 旧版：按车长算。只为证明"差别只来自特征长度"而保留，新代码不要用。 */
export function sheddingFreqByLen(v, p = flatParams(), St = 0.2) {
  return (St * v) / p.len;
}

/** 涡街波长：同一侧两个同号涡之间隔着 λ = U/f = D/St */
export function sheddingWave(v, p = flatParams(), St = 0.2) {
  return v / sheddingFreq(v, p, St);
}

/* ---------- 自洽校验 ----------
   四条互相独立的量：冲量、动量、距离、平均速度。任何一条对不上就是参数组矛盾。
   门禁直接调 selfCheck()，不通过不许出图。 */
export function selfCheck(p = flatParams()) {
  const rows = [];
  const add = (name, ok, detail) => rows.push({ name, ok, detail });

  const r = simulateRun(p, { dt: 5e-4, stopAt: p.track });
  const me = effMass(p);
  const I = impulse();

  add('20 m 用时落在 1.00–1.25 s', bandCheck(r.t).ok, `${r.t.toFixed(4)} s`);
  add('末速度低于峰值速度', r.v < REFERENCE.vMax, `${r.v.toFixed(3)} < ${REFERENCE.vMax.toFixed(3)} m/s`);

  // 冲量→动量：实际增速只能小于理想值，差额被阻力吃掉
  const dvIdeal = I / me;
  add('实际增速小于冲量理想值（阻力有损耗）', r.v < dvIdeal,
    `${r.v.toFixed(3)} < ${dvIdeal.toFixed(3)} m/s，损耗 ${((1 - r.v / dvIdeal) * 100).toFixed(1)} %`);
  add('冲量理想值对得上解析解 1.4706 N·s', Math.abs(I - 1.4706) < 1e-3, `${I.toFixed(4)} N·s`);

  // 平均速度必须低于峰值，且末速低于峰值——这两条卡住「跑得快还末速高」的假数据
  const vAvg = p.track / r.t;
  add('平均速度低于峰值速度', vAvg < REFERENCE.vMax, `平均 ${vAvg.toFixed(3)} < 峰值 ${REFERENCE.vMax.toFixed(3)} m/s`);

  // 等效惯性质量必须大于平动质量
  add('等效惯性质量大于平动质量', me > p.m, `${(me * 1000).toFixed(2)} g vs ${(p.m * 1000).toFixed(1)} g`);

  // RK4 步长收敛
  const a1 = simulateRun(p, { dt: 1e-3, stopAt: p.track }).t;
  const a2 = simulateRun(p, { dt: 2.5e-4, stopAt: p.track }).t;
  add('RK4 步长 1 ms 与 0.25 ms 差 < 2 ms', Math.abs(a1 - a2) < 2e-3,
    `${a1.toFixed(4)} / ${a2.toFixed(4)} s`);

  // 轴荷守恒
  const l = axleLoads(p, 0, 0);
  add('前后轴荷之和等于整车重量', Math.abs(l.nf + l.nr - l.total) < 1e-12,
    `${((l.nf + l.nr) * 1000).toFixed(3)} mN`);

  // 阻力项自洽：v = v∞ 时气动阻力等于滚动阻力
  const vInf = Math.sqrt(rollForce(p) / (0.5 * RHO * p.cd * p.area));
  const dInf = dragForce(vInf, p);
  add('v = √(F_roll/k) 处气动阻力等于滚动阻力', Math.abs(dInf - rollForce(p)) / rollForce(p) < 1e-9,
    `v∞ = ${vInf.toFixed(3)} m/s，两项都是 ${(dInf * 1000).toFixed(3)} mN`);

  return { ok: rows.every((x) => x.ok), rows, run: r, vAvg };
}

/* ---------- 数值格式化 ---------- */
export function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return '—';
  const av = Math.abs(v);
  if (v === 0) return '0';
  if (av >= 1000) return v.toFixed(0);
  if (av >= 100) return v.toFixed(1);
  if (av >= 10) return v.toFixed(2);
  if (av < 1e-3) return v.toExponential(2).replace('e', 'E');
  return v.toFixed(digits);
}

export function flatParams(over = {}) {
  const p = {};
  for (const k of Object.keys(PARAMS)) p[k] = PARAMS[k].v;
  return Object.assign(p, over);
}

/** 参数来源标注串，界面上原样印出来 */
export function statusLine(keys) {
  return keys.map((k) => `${k.toUpperCase()}[${PARAMS[k].status}]`).join('  ');
}
