/* 两车纵向动力学 · 纯函数，不碰 DOM，node 里也能直接跑
 *
 * (m + 4·I_w/r_w²)·dv/dt = F(t) − ½ρCdA·v² − Crr·m·g
 *
 * 半正弦推力：F(t) = F_peak·sin(πt/t_burn)，t ≥ t_burn 归零。
 * 转动动能折进等效质量：KE = ½(m + ΣI_w/r_w²)v²，所以能量账只有一个质量。
 */

export const CONST = {
  rho: 1.204,      // [FIXED]  kg/m³  20 °C 海平面
  A: 1.6e-3,       // [FIXED]  m²     迎风投影面积，车队给定
  Cd0: 0.34,       // [TYPICAL] —     整车阻力系数，风洞拟合值
  Crr: 0.008,      // [TYPICAL] —     滚动阻力系数
  Iw: 4.5e-7,      // [TYPICAL] kg·m² 单轮转动惯量
  rw: 0.011,       // [FIXED]  m      轮半径
  nw: 4,           // [FIXED]  个
  g: 9.81,         // [FIXED]  m/s²
  L: 20,           // [FIXED]  m      赛道长度
};

export const DT = 1e-3;          // [FIXED] s
export const T_MAX = 10;         // 求解上限，防止没跑完的车死循环

/** 等效惯性质量 [kg]。四轮圆盘轮代入后 I_w/r_w² 与轮半径无关，只剩 m_w/2 量级。 */
export function effMass(m) {
  return m + CONST.nw * CONST.Iw / (CONST.rw * CONST.rw);
}

/** 推力 [N]。半正弦，t_burn 之后严格为 0。 */
export function thrustAt(car, t) {
  if (!(t > 0) || t >= car.tburn) return 0;
  return car.Fpk * Math.sin(Math.PI * t / car.tburn);
}

/** 半正弦冲量 [N·s]，解析解，用来自检积分器 */
export function impulse(car) {
  return 2 * car.Fpk * car.tburn / Math.PI;
}

/**
 * RK4 积分到 20 m。
 * 返回 trace（x 单调递增）与终态、峰值、三份功。
 */
export function simulate(car, dt = DT) {
  const me = effMass(car.m);
  const CdA = car.Cd0 * CONST.A;
  const fRoll = CONST.Crr * car.m * CONST.g;
  const L = CONST.L;

  const acc = (t, v) => (thrustAt(car, t) - 0.5 * CONST.rho * CdA * v * v - fRoll) / me;

  const ts = [0], xs = [0], vs = [0];
  let t = 0, x = 0, v = 0;
  let vMax = 0, aMax = 0;
  let wThrust = 0, wDrag = 0, wRoll = 0;
  let done = false;

  while (t < T_MAX) {
    const k1x = v, k1v = acc(t, v);
    const k2x = v + dt / 2 * k1v, k2v = acc(t + dt / 2, v + dt / 2 * k1v);
    const k3x = v + dt / 2 * k2v, k3v = acc(t + dt / 2, v + dt / 2 * k2v);
    const k4x = v + dt * k3v, k4v = acc(t + dt, v + dt * k3v);
    const dx = dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    const dv = dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);

    if (k1v > aMax) aMax = k1v;

    // 功按中点算，二阶精度足够
    const tm = t + dt / 2, dm = x + dx / 2, vm = v + dv / 2;
    wThrust += thrustAt(car, tm) * dx;
    wDrag += 0.5 * CONST.rho * CdA * vm * vm * dx;
    wRoll += fRoll * dx;

    if (x + dx >= L) {
      const f = (L - x) / dx;
      t += dt * f;
      v += dv * f;
      x = L;
      ts.push(t); xs.push(x); vs.push(v);
      if (v > vMax) vMax = v;
      done = true;
      break;
    }

    t += dt; x += dx; v += dv;
    if (v > vMax) vMax = v;
    ts.push(t); xs.push(x); vs.push(v);
  }

  const ke = 0.5 * me * v * v;
  return {
    finished: done,
    time: t, vEnd: v, vMax, aMax,
    meff: me, CdA, fRoll,
    work: { thrust: wThrust, drag: wDrag, roll: wRoll },
    ke,
    closure: ke + wDrag + wRoll - wThrust,
    trace: { ts, xs, vs },
  };
}

/** 在 trace 上按位置线性插值取速度。x 超出范围时夹到端点。 */
export function vAtX(res, x) {
  const { xs, vs } = res.trace;
  if (x <= xs[0]) return vs[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return vs[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  const dx = xs[hi] - xs[lo] || 1;
  const f = (x - xs[lo]) / dx;
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}

/** 在 trace 上按时间插值取速度，用于动画 */
export function vAtT(res, t) {
  const { ts, vs } = res.trace;
  if (t <= ts[0]) return vs[0];
  const n = ts.length;
  if (t >= ts[n - 1]) return vs[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid; else hi = mid;
  }
  const dt = ts[hi] - ts[lo] || 1;
  const f = (t - ts[lo]) / dt;
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}

/** 在 trace 上按时间插值取位置 */
export function xAtT(res, t) {
  const { ts, xs } = res.trace;
  if (t <= ts[0]) return xs[0];
  const n = ts.length;
  if (t >= ts[n - 1]) return xs[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid; else hi = mid;
  }
  const dt = ts[hi] - ts[lo] || 1;
  const f = (t - ts[lo]) / dt;
  return xs[lo] + (xs[hi] - xs[lo]) * f;
}

export const GRID_N = 401;   // 20 m 上每 0.05 m 一个采样

/** 两车比较：共同位置网格上的速度差曲线 + 冲线处斜率 */
export function compare(A, B) {
  const rA = simulate(A);
  const rB = simulate(B);
  const xs = [], dv = [], vA = [], vB = [];
  for (let i = 0; i < GRID_N; i++) {
    const x = CONST.L * i / (GRID_N - 1);
    const a = vAtX(rA, x), b = vAtX(rB, x);
    xs.push(x); vA.push(a); vB.push(b); dv.push(a - b);
  }
  return {
    A: rA, B: rB,
    dTime: rA.time - rB.time,          // 负 = A 更快
    xs, dv, vA, vB,
    slopeFinish: slopeOver(xs, dv, CONST.L * 0.9, CONST.L),
  };
}

/** 最小二乘斜率，只在 [x0, x1] 区间内的点上算 */
export function slopeOver(xs, ys, x0, x1) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < x0 || xs[i] > x1) continue;
    n++; sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  if (n < 2) return 0;
  const d = n * sxx - sx * sx;
  if (!d) return 0;
  return (n * sxy - sx * sy) / d;
}
