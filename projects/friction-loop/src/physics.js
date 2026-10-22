/* 摩擦圆（friction circle）—— 纯函数物理模型
   这个文件不碰 DOM，不碰 canvas。main.js 只负责把这里的数画出来。
   所有断言都在 assertions() 里，gate 直接调用。

   物理图像：
     一个轮子的接触斑上，纵向力 F_x 和侧向力 F_y 共用同一份摩擦，
     合成力的大小不能超过 μ·N。所以「极限」是一个圆，不是两条独立的线。

   前轮的侧向力从哪来：
     推力线（气瓶轴线）和质心横向错开 d，就产生偏航力矩 M = F·d。
     车靠两个前轮的侧向摩擦顶住这个力矩，每个轮子的力臂是「导轨销到前轴」
     armPin：2·f_y·armPin = F·d  →  f_y = F·d / (2·armPin)。
     前轮能提供的上限是 μ·N_w（单轮），临界偏移就是两个式子相等的地方：
       d_crit = μ·N_f·armPin / F
     代入这一组数：d_crit = 0.60 × 0.2869 × 0.0375 / 21 = 3.074e-4 m = 0.307 mm。

   为什么 d_crit 这么小：推力是 21 N，前轮总法向力只有 0.287 N。
   0.3 mm 的质心偏移就能换到 84 mN 的侧向力，而摩擦圆半径只有 86 mN。 */

import {
  flatParams, axleLoads, yawLimit, criticalOffset, selfCheck,
  THRUST,
} from './racing-core.js';

export const DEFAULT_STATE = { d: 0.30, toe: 0.0, mu: 0.60 };

/* d 的上限取约 2 倍 d_crit，滑过界之后还能看见「越过多少」 */
export const LIMITS = {
  d:   { min: 0, max: 0.60, step: 0.005, unit: 'mm', label: '质心横向偏移', status: 'TYPICAL' },
  toe: { min: 0, max: 5.00, step: 0.05, unit: '°',  label: '前轮前束角',   status: 'VERIFY' },
  mu:  { min: 0.35, max: 0.90, step: 0.01, unit: '', label: '轮轨摩擦系数', status: 'TYPICAL' },
};

/** 单个前轮的完整受力状态。state.d 单位 mm，state.toe 单位度。 */
export function model(state) {
  const p = flatParams({ mu: state.mu });
  const loads = axleLoads(p, 0, 0);
  const Nf = loads.nf;                        // 前轴静态轴荷 N
  const Nw = Nf / 2;                          // 单前轮 N
  const cap = p.mu * Nw;                      // 摩擦圆半径 N

  const dM = state.d / 1000;
  // 单轮侧向需求 = 偏航力矩 / (2 × 力臂)
  const fy = (THRUST.Fpeak * dM) / (2 * p.armPin);
  const roll = p.crr * Nw;                    // 单轮滚动阻力 N
  const scrub = p.mu * Nw * Math.abs(Math.sin((state.toe * Math.PI) / 180));
  const fx = roll + scrub;

  const mag = Math.hypot(fx, fy);
  const dCrit = criticalOffset(p, THRUST.Fpeak, Nf) * 1000;   // mm

  return {
    p, Nf, Nr: loads.nr, Nw, cap, fx, fy, roll, scrub, mag, dCrit,
    usage: mag / cap,
    lateralUsage: fy / cap,
    moment: THRUST.Fpeak * dM,        // N·m
    momentLimit: yawLimit(p, Nf),     // N·m
    margin: 1 - mag / cap,
    slipping: mag > cap,
    dRatio: dM / (dCrit / 1000),      // 当前偏移是临界的几倍
    forceRatio: mag / cap,
  };
}

/** 整跑成绩，界面底部拿来做 sanity 对照 */
export function runResult() {
  return selfCheck(flatParams());
}

/* ---------------- 断言 ----------------
   每一条都能被单独证伪。没过就是模型错了，不是「看起来还行」。 */
export function assertions() {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });

  // 1 摩擦圆半径对 μ 线性
  {
    const a = model({ d: 0.3, toe: 0, mu: 0.40 }).cap;
    const b = model({ d: 0.3, toe: 0, mu: 0.80 }).cap;
    const ratio = b / a;
    add('摩擦圆半径 ∝ μ（μ 加倍，半径加倍）', Math.abs(ratio - 2) < 1e-12, `比值 ${ratio.toFixed(12)}`);
  }

  // 2 半径对法向载荷线性
  {
    const m1 = model({ d: 0.3, toe: 0, mu: 0.6 });
    const half = 0.5 * m1.p.mu * (m1.Nf / 2);
    add('半径 = μ·N（单轮载荷减半，半径减半）', Math.abs(half - 0.5 * m1.cap) < 1e-12,
      `${(half * 1000).toFixed(4)} mN`);
  }

  // 3 侧向需求随 d 严格单调递增
  {
    let prev = -1, mono = true, at = 0;
    for (let i = 0; i <= 60; i++) {
      const d = i * 0.01;
      const v = model({ d, toe: 0, mu: 0.6 }).fy;
      if (v <= prev) { mono = false; at = d; }
      prev = v;
    }
    add('侧向需求 F_y 随质心偏移严格单调递增', mono, mono ? '61 个采样点全部递增' : `在 d=${at.toFixed(3)} mm 处失效`);
  }

  // 4 临界点上侧向力恰好填满摩擦圆半径（纯解析恒等式）
  {
    const m0 = model({ d: 0.3, toe: 0, mu: 0.6 });
    const mC = model({ d: m0.dCrit, toe: 0, mu: 0.6 });
    const err = Math.abs(mC.lateralUsage - 1);
    add('d = d_crit 处 F_y 恰好等于 μN', err < 1e-9, `偏差 ${err.toExponential(2)}`);
  }

  // 5 偏移为零时摩擦圆只剩滚动阻力
  {
    const m0 = model({ d: 0, toe: 0, mu: 0.6 });
    add('d = 0 时使用率 < 5 %', m0.usage < 0.05, `${(m0.usage * 100).toFixed(2)} %`);
  }

  // 6 加前束抬高纵向力，进而抬高使用率
  {
    const a = model({ d: 0.3, toe: 0, mu: 0.6 });
    const b = model({ d: 0.3, toe: 3, mu: 0.6 });
    add('前束 3° 使使用率上升', b.usage > a.usage,
      `${(a.usage * 100).toFixed(2)} % → ${(b.usage * 100).toFixed(2)} %`);
  }

  // 7 越过临界点后确实判定为打滑
  {
    const m0 = model({ d: 0.3, toe: 0, mu: 0.6 });
    const over = model({ d: m0.dCrit * 1.15, toe: 0, mu: 0.6 });
    add('d > d_crit 判定为打滑', over.slipping && !m0.slipping,
      `${(over.usage * 100).toFixed(1)} % > 100 %`);
  }

  // 8 两条独立路径算同一个临界偏移：
  //   路径 A：单轮侧向需求 = 摩擦圆半径；路径 B：偏航力矩 = 抗偏航上限
  {
    const p = flatParams();
    const Nf = axleLoads(p, 0, 0).nf;
    const dA = (p.mu * (Nf / 2) * 2 * p.armPin) / THRUST.Fpeak;
    const dB = yawLimit(p, Nf) / THRUST.Fpeak;
    add('两条路径算出的 d_crit 一致', Math.abs(dA - dB) < 1e-15,
      `${(dA * 1000).toFixed(6)} / ${(dB * 1000).toFixed(6)} mm`);
  }

  // 9 d_crit 对 μ 线性（μ 越高，抱得越紧）
  {
    const a = model({ d: 0, toe: 0, mu: 0.40 }).dCrit;
    const b = model({ d: 0, toe: 0, mu: 0.80 }).dCrit;
    add('d_crit ∝ μ', Math.abs(b / a - 2) < 1e-12, `比值 ${(b / a).toFixed(12)}`);
  }

  // 10 前束刮擦力 ∝ sinθ
  {
    const a = model({ d: 0.3, toe: 1, mu: 0.6 }).scrub;
    const b = model({ d: 0.3, toe: 2, mu: 0.6 }).scrub;
    const want = Math.sin((2 * Math.PI) / 180) / Math.sin((1 * Math.PI) / 180);
    add('前束刮擦力 ∝ sinθ', Math.abs(b / a - want) < 1e-12,
      `比值 ${(b / a).toFixed(6)} vs sin2°/sin1° ${want.toFixed(6)}`);
  }

  // 11 这一组数自身的自洽校验（冲量/动量/距离/平均速度）
  {
    const sc = selfCheck(flatParams());
    add('参数组自洽（冲量·动量·距离·平均速度）', sc.ok,
      sc.ok
        ? `${sc.run.t.toFixed(4)} s / ${sc.run.v.toFixed(3)} m/s`
        : sc.rows.filter((r) => !r.ok).map((r) => r.name).join('；'));
  }

  return out;
}
