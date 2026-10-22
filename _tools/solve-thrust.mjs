/* 反解：要同时满足「20 m / 1.230 s / 末速 19.93 m/s」，
   (F_peak, t_burn) 应该是多少？
   —— 用和项目里完全一样的那套积分，不做任何近似。 */
const P = { L: 20.0, rho: 1.204, cd0: 0.34, area: 1.6e-3 };
const PHYS = { m: 0.065, mEq: 0.079876, crr: 0.008, g: 9.81 };

function run(Fpeak, tBurn, dt = 2e-5) {
  const { m, mEq, crr, g } = PHYS;
  const accel = (t, v) => {
    const F = t < tBurn ? Fpeak * Math.sin((Math.PI * t) / tBurn) : 0;
    const drag = 0.5 * P.rho * P.cd0 * P.area * v * v;
    return (F - drag - crr * m * g) / mEq;
  };
  let t = 0, x = 0, v = 0;
  for (let i = 0; i < 3e6; i++) {
    const k1v = accel(t, v), k1x = v;
    const k2v = accel(t + dt / 2, v + k1v * dt / 2), k2x = v + k1v * dt / 2;
    const k3v = accel(t + dt / 2, v + k2v * dt / 2), k3x = v + k2v * dt / 2;
    const k4v = accel(t + dt, v + k3v * dt), k4x = v + k3v * dt;
    const vN = v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    const xN = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    if (xN >= P.L) {
      const f = (P.L - x) / (xN - x);
      return { t: t + dt * f, v: v + (vN - v) * f };
    }
    t += dt; x = xN; v = vN;
  }
  return null;
}

/* 先验一下现有参数：应得 1.1885 / 16.906 */
const base = run(21.0, 0.110);
console.log(`现有参数 21 N / 110 ms  →  ${base.t.toFixed(4)} s  ${base.v.toFixed(4)} m/s`);

/* 二维反解：
   给定 tBurn，用二分找 Fpeak 让冲线时间 = 1.230；
   再对 tBurn 二分，让末速 = 19.93。 */
const T_TARGET = 1.230, V_TARGET = 19.93;

function fpeakForTime(tBurn, dt = 2e-5) {
  let lo = 5, hi = 80;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = run(mid, tBurn, dt);
    if (!r) return NaN;
    if (r.t > T_TARGET) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function vForBurn(tBurn) {
  const F = fpeakForTime(tBurn);
  const r = run(F, tBurn);
  return { F, ...r };
}

let lo = 0.02, hi = 0.60;
for (let i = 0; i < 40; i++) {
  const mid = (lo + hi) / 2;
  const r = vForBurn(mid);
  if (r.v < V_TARGET) lo = mid; else hi = mid;
}
const tBurn = (lo + hi) / 2;
const sol = vForBurn(tBurn);

console.log(`\n反解结果（同时命中 1.230 s 和 19.93 m/s）：`);
console.log(`  F_peak  = ${sol.F.toFixed(2)} N      （现在是 21 N）`);
console.log(`  t_burn  = ${(tBurn * 1000).toFixed(1)} ms     （现在是 110 ms）`);
console.log(`  校核    = ${sol.t.toFixed(4)} s  ${sol.v.toFixed(4)} m/s`);

/* 固定 t_burn = 110 ms，只让 F_peak 去凑 1.230 s，看末速差多少 */
const fOnly = fpeakForTime(0.110);
const rOnly = run(fOnly, 0.110);
console.log(`\n只动 F_peak（t_burn 保持 110 ms）：`);
console.log(`  F_peak  = ${fOnly.toFixed(2)} N → ${rOnly.t.toFixed(4)} s  ${rOnly.v.toFixed(4)} m/s`);

/* 固定 F_peak = 21 N，只让 t_burn 去凑 1.230 s */
let a = 0.02, b = 0.60;
for (let i = 0; i < 40; i++) {
  const mid = (a + b) / 2;
  const r = run(21, mid);
  if (r.t > T_TARGET) a = mid; else b = mid;
}
const tb21 = (a + b) / 2;
const r21 = run(21, tb21);
console.log(`\n只动 t_burn（F_peak 保持 21 N）：`);
console.log(`  t_burn  = ${(tb21 * 1000).toFixed(1)} ms → ${r21.t.toFixed(4)} s  ${r21.v.toFixed(4)} m/s`);
