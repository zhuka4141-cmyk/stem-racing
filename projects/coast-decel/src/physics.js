/* coast-decel · 烧完之后的那 19 米 —— 纯函数模型

   烧完那一刻（t = 0.1100 s，x = 1.0108 m）速度到顶 18.3468 m/s。
   然后车只剩两件事在拖它：

     阻力   F_d = ½ρ C_d A v²
     滚动   F_r = C_rr m g            （常数，跟速度无关）

   除以等效惯性质量（含四个轮子的转动惯量 I/r²）得运动方程：

     dv/dt = −(a v² + b)
     a = ½ρ C_d A / m_eff = 4.1000×10⁻³ 1/m
     b = C_rr m g / m_eff = 6.3864×10⁻² m/s²

   这个方程有闭式解，不用积分：

     x(v) = x₀ + (1/2a)·ln[(v₀² + v∞²)/(v² + v∞²)]
     t(v) = t₀ + 1/√(ab)·[atan(v₀·√(a/b)) − atan(v·√(a/b))]
     v∞   = √(b/a) = 3.9467 m/s

   注意 v∞ 不是零。风阻是 v²、滚动是常数，所以速度只会渐近到 v∞，
   **这辆车在这条方程里永远不会停**。它停在 20 m 是因为赛道只有 20 m。

   20 m 处的数（数值 RK4 与闭式解在 4 位小数上完全一致）：
     溜车段 18.9892 m，耗时 1.0785 s，末速 16.9063 m/s
     速度掉 1.4405 m/s = 7.85 %

   两股阻力在 v = v∞ = 3.9467 m/s 处交接：
     阻力份额 = a v²/(a v² + b)，v = 18.35 时 95.6 %，v = 3.95 时 50.0 % */

import { RHO, NU, flatParams, selfCheck, THRUST, REFERENCE } from './racing-core.js';

/* 烧完时刻的状态：来自 racing-core 的数值积分，不是实测 */
export const BURNOUT = { t: 0.1100, x: 1.0108, v: 18.3468 };
export const X_END = 20.0;

const P = flatParams();

export const M_EFF = P.m + (P.nWheel * P.iWheel) / (P.rWheel * P.rWheel);
export const A_DECAY = (0.5 * RHO * P.cd * P.area) / M_EFF;

/* b 里那个与 C_rr 无关的换算系数：m·g / m_eff */
export const B_PER_CRR = (P.m * 9.81) / M_EFF;

export function bOf(crr) { return crr * B_PER_CRR; }
export function vinfOf(crr) { return Math.sqrt(bOf(crr) / A_DECAY); }

export const DEFAULT_STATE = { dEnd: 20.0, crr: 0.008 };

export const LIMITS = {
  dEnd: { min: 12, max: 20, step: 0.1, unit: 'm', label: '终点位置', status: 'FIXED' },
  crr:  { min: 0.004, max: 0.014, step: 0.0005, unit: '', label: '轮轨滚动系数', status: 'VERIFY' },
};

/* ---------- 闭式解 ---------- */
export function vAt(x, crr) {
  const b = bOf(crr);
  const vinf2 = b / A_DECAY;
  const e = Math.exp(2 * A_DECAY * (x - BURNOUT.x));
  const v2 = (BURNOUT.v * BURNOUT.v + vinf2) / e - vinf2;
  return v2 > 0 ? Math.sqrt(v2) : 0;
}

export function xOf(v, crr) {
  const b = bOf(crr);
  const vinf2 = b / A_DECAY;
  return BURNOUT.x + (1 / (2 * A_DECAY)) * Math.log((BURNOUT.v ** 2 + vinf2) / (v * v + vinf2));
}

export function tAt(v, crr) {
  const b = bOf(crr);
  const k = Math.sqrt(A_DECAY / b);
  return BURNOUT.t + (1 / Math.sqrt(A_DECAY * b)) * (Math.atan(BURNOUT.v * k) - Math.atan(v * k));
}

/* 只算风阻、或只算滚动的两条参照曲线，用来在相图上分层 */
export function onlyDrag(x) { return BURNOUT.v * Math.exp(-A_DECAY * (x - BURNOUT.x)); }
export function onlyRolling(x, crr) {
  const s = BURNOUT.v ** 2 - 2 * bOf(crr) * (x - BURNOUT.x);
  return s > 0 ? Math.sqrt(s) : 0;
}

/* 风阻在两股阻力里占的份额 */
export function dragShare(v, crr) {
  const d = A_DECAY * v * v;
  const b = bOf(crr);
  return d / (d + b);
}

/* RK4：给断言用，和闭式解互相验证 */
export function integrate(crr, dt = 1e-6, xStop = X_END) {
  const b = bOf(crr);
  const f = (v) => -(A_DECAY * v * v + b);
  let v = BURNOUT.v, x = BURNOUT.x, t = BURNOUT.t;
  let guard = 0;
  while (x < xStop && guard < 4e7) {
    const k1 = f(v);
    const k2 = f(v + 0.5 * dt * k1);
    const k3 = f(v + 0.5 * dt * k2);
    const k4 = f(v + dt * k3);
    const vn = v + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    x += 0.5 * (v + vn) * dt;
    v = vn;
    t += dt;
    guard++;
  }
  return { v, x, t };
}

export function model(state) {
  const crr = state.crr;
  const a = A_DECAY;
  const b = bOf(crr);
  const vinf = Math.sqrt(b / a);
  const dEnd = state.dEnd;
  const vEnd = vAt(dEnd, crr);
  const tEnd = tAt(vEnd, crr);
  const coastLen = dEnd - BURNOUT.x;
  const coastTime = tEnd - BURNOUT.t;
  const avgV = coastLen / coastTime;
  const fDrag0 = 0.5 * RHO * P.cd * P.area * BURNOUT.v * BURNOUT.v;
  const fRoll = crr * P.m * 9.81;
  const re0 = (BURNOUT.v * P.len) / NU;
  const reEnd = (vEnd * P.len) / NU;

  return {
    p: P, a, b, vinf, crr, dEnd, vEnd, tEnd, coastLen, coastTime, avgV,
    fDrag0, fDragEnd: 0.5 * RHO * P.cd * P.area * vEnd * vEnd, fRoll, re0, reEnd,
    dv: BURNOUT.v - vEnd,
    dvPct: (BURNOUT.v - vEnd) / BURNOUT.v,
    share0: dragShare(BURNOUT.v, crr),
    shareEnd: dragShare(vEnd, crr),
    mEff: M_EFF,
    burn: BURNOUT,
    xEnd: X_END,
  };
}

export function runResult() { return selfCheck(P); }

/* ---------------- 断言 ---------------- */
export function assertions() {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });
  const crr = DEFAULT_STATE.crr;

  // 1 / 2 两个衰减系数的数值
  add('a = ½ρC_dA/m_eff = 4.1000×10⁻³ 1/m', Math.abs(A_DECAY - 4.1000e-3) < 5e-8,
    A_DECAY.toExponential(5));
  add('b = C_rr·mg/m_eff = 6.3864×10⁻² m/s² 于 C_rr = 0.008', Math.abs(bOf(0.008) - 6.3864e-2) < 5e-7,
    bOf(0.008).toExponential(5));

  // 3 渐近速度
  {
    const vinf = vinfOf(0.008);
    add('渐近速度 √(b/a) = 3.9467 m/s', Math.abs(vinf - 3.9467) < 1e-3, vinf.toFixed(5));
  }

  // 4 闭式解和 RK4 在 20 m 处一致
  {
    const num = integrate(crr, 2e-6, X_END);
    const cf = vAt(X_END, crr);
    add('闭式 v(x) 与 RK4 数值积分一致（20 m，误差 < 1e−6）',
      Math.abs(num.v - cf) < 1e-6, `闭式 ${cf.toFixed(6)} / RK4 ${num.v.toFixed(6)}`);
  }

  // 5 闭式时间和 RK4 一致
  {
    const num = integrate(crr, 2e-6, X_END);
    const cf = tAt(vAt(X_END, crr), crr);
    add('闭式 t(v) 与 RK4 一致（误差 < 1e−5 s）', Math.abs(num.t - cf) < 1e-5,
      `闭式 ${cf.toFixed(6)} / RK4 ${num.t.toFixed(6)}`);
  }

  // 6 x(v) 与 v(x) 互为反函数
  {
    let worst = 0;
    for (let i = 1; i <= 20; i++) {
      const x = BURNOUT.x + i * 0.9;
      const rt = xOf(vAt(x, crr), crr);
      worst = Math.max(worst, Math.abs(rt - x));
    }
    add('x(v) 与 v(x) 互为反函数（20 个点，误差 < 1e−9）', worst < 1e-9, worst.toExponential(2));
  }

  // 7 起点自洽
  {
    const e1 = Math.abs(vAt(BURNOUT.x, crr) - BURNOUT.v);
    const e2 = Math.abs(tAt(BURNOUT.v, crr) - BURNOUT.t);
    add('v(x₀) = v₀ 且 t(v₀) = t₀', e1 < 1e-9 && e2 < 1e-12,
      `${(e1).toExponential(2)} / ${(e2).toExponential(2)}`);
  }

  // 8 两股阻力份额加起来等于 1，且在 v∞ 处各占一半
  {
    let worst = 0;
    for (let i = 0; i <= 40; i++) {
      const v = 0.5 + i * 0.9;
      const s = dragShare(v, crr);
      worst = Math.max(worst, Math.abs(s - (1 - (1 - s))));
      if (!(s >= 0 && s <= 1)) worst = 1;
    }
    const half = dragShare(vinfOf(crr), crr);
    add('份额在 [0,1] 内且 v = v∞ 处正好一半',
      worst < 1e-12 && Math.abs(half - 0.5) < 1e-9, `v∞ 处 ${half.toFixed(9)}`);
  }

  // 9 速度单调递减
  {
    let prev = Infinity, ok = true;
    for (let x = BURNOUT.x; x <= X_END + 1e-9; x += 0.05) {
      const v = vAt(x, crr);
      if (!(v < prev)) ok = false;
      prev = v;
    }
    add('溜车段速度严格单调递减', ok, `${vAt(BURNOUT.x, crr).toFixed(3)} → ${vAt(X_END, crr).toFixed(3)}`);
  }

  // 10 20 m 处的末速与 racing-core 的整跑结果一致
  {
    const v = vAt(X_END, crr);
    add('20 m 末速吻合整跑结果 16.9063 m/s', Math.abs(v - REFERENCE.vFinish) < 2e-3,
      `${v.toFixed(4)} / 参考 ${REFERENCE.vFinish.toFixed(4)}`);
  }

  // 11 溜车段长度与时间
  {
    const len = X_END - BURNOUT.x;
    const tt = tAt(vAt(X_END, crr), crr) - BURNOUT.t;
    add('溜车段 18.99 m / 1.08 s', Math.abs(len - 18.9892) < 2e-3 && Math.abs(tt - 1.0785) < 2e-3,
      `${len.toFixed(4)} m / ${tt.toFixed(4)} s`);
  }

  // 12 风阻在烧完点 110.2 mN、到 20 m 处 93.6 mN，滚动始终 5.10 mN
  {
    const fd0 = 0.5 * RHO * P.cd * P.area * BURNOUT.v ** 2;
    const fd1 = 0.5 * RHO * P.cd * P.area * vAt(X_END, crr) ** 2;
    const fr = 0.008 * P.m * 9.81;
    add('风阻 110.2 → 93.6 mN（v² 掉 7.85 % 的两倍），滚动 5.10 mN',
      Math.abs(fd0 * 1000 - 110.23) < 0.05 && Math.abs(fd1 * 1000 - 93.60) < 0.05
      && Math.abs(fr * 1000 - 5.10) < 0.02,
      `${(fd0 * 1000).toFixed(2)} → ${(fd1 * 1000).toFixed(2)} / ${(fr * 1000).toFixed(2)} mN`);
  }

  // 13 等效惯性质量
  {
    const want = 0.065 + (4 * 4.5e-7) / (0.011 * 0.011);
    add('等效惯性质量 = m + 4I/r² = 79.876 g', Math.abs(M_EFF - want) < 1e-12,
      `${(M_EFF * 1000).toFixed(3)} g`);
  }

  // 14 参数组自洽
  {
    const sc = selfCheck(P);
    add('参数组自洽（冲量·动量·距离·平均速度）', sc.ok,
      sc.ok ? `${sc.run.t.toFixed(4)} s / ${sc.run.v.toFixed(3)} m/s` : '有行不通过');
  }

  return out;
}