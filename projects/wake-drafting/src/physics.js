/* wake-drafting · 尾流跟车 —— 纯函数模型
   不碰 DOM、不碰 canvas。

   物理图像：
     前车在身后拖出一团低速区。跟得越近，尾车吃到的两件事同时变好：
       ① 来流动压掉了：q/q∞ = 1 − 0.22·e^(−g/0.85)
       ② 阻力系数也掉了：Cd/Cd0 = 1 − 0.38·e^(−g/1.15)
     g 是跟前车尾端的距离，单位是车长 L = 0.200 m。
     两件事相乘才是阻力比，所以近场叠加很猛，稍远就迅速失效。

   速度场用同一套参数，保证和阻力模型对得上：
       u/U(x,y) = 1 − Au·e^(−x/0.85)·e^(−y²/2σ(x)²)
       σ(x) = 0.50 + 0.21x        （尾流半宽，随下游距离线性张开）
       Au = 1 − sqrt(1 − 0.22) = 0.1167
     中线上的 (1 − Au)² 正好等于 0.78，和上面 ① 完全一致。
     这不是巧合，是按这个约束反解 Au 的。

   数值（v = 16.906 m/s，即整跑末速）：
     q∞ = ½ρv² = 172.0 Pa
     前车阻力 = 172.0 × 0.34 × 1.6e−3 = 93.6 mN
     g = 0：93.6 × 0.78 × 0.62 = 45.3 mN（−51.6 %）
     g = 1：93.6 × 0.9324 × 0.8409 = 71.6 mN（−23.5 %）
     g = 5：93.6 × 0.9995 × 0.9947 = 93.1 mN（−0.6 %）

   一句话结论，也是这个项目存在的理由：
     半个车身能省 32 mN，而峰值推力是 21 N = 21000 mN。
     省下来的那点力只占 0.15 %。跟车是个心理收益，不是成绩收益。 */

import { RHO, NU, flatParams, selfCheck, THRUST, REFERENCE } from './racing-core.js';

export const L = 0.200;                 // 车长 m

export const WAKE = {
  qAmp: 0.22,   // 中线动压赤字幅值
  qTau: 0.85,   // 动压恢复长度尺度（车长）
  cAmp: 0.38,   // 阻力系数折减幅值
  cTau: 1.15,   // 折减恢复长度尺度（车长）
  sigma0: 0.50, // 尾端半宽（车长）
  spread: 0.21, // 半宽增长率
};

/* 由 ① 反解出来的速度赤字幅值：让中线 (1−Au)² 等于 1−qAmp */
export const AU = 1 - Math.sqrt(1 - WAKE.qAmp);

export const DEFAULT_STATE = { gap: 0.50, v: REFERENCE.vFinish };

export const LIMITS = {
  gap: { min: 0, max: 5.0, step: 0.05, unit: 'L', label: '跟车距离', status: 'TYPICAL' },
  v:   { min: 5, max: 20, step: 0.1, unit: 'm/s', label: '车队速度', status: 'DERIVED' },
};

export function qRatio(gapL) {
  return 1 - WAKE.qAmp * Math.exp(-gapL / WAKE.qTau);
}

export function cdRatio(gapL) {
  return 1 - WAKE.cAmp * Math.exp(-gapL / WAKE.cTau);
}

export function dragRatio(gapL) {
  return qRatio(gapL) * cdRatio(gapL);
}

/* 尾流半宽，单位车长 */
export function sigma(xL) {
  return WAKE.sigma0 + WAKE.spread * Math.max(xL, 0);
}

/* 无因次速度 u/U。xL 是尾端下游距离（车长），yL 是横向偏离（车长） */
export function velocityRatio(xL, yL) {
  const x = Math.max(xL, 0);
  const s = sigma(x);
  return 1 - AU * Math.exp(-x / WAKE.qTau) * Math.exp(-(yL * yL) / (2 * s * s));
}

/* 下游 xL 处的速度赤字（中线），0..AU */
export function deficit(xL, yL = 0) {
  return 1 - velocityRatio(xL, yL);
}

export function model(state) {
  const p = flatParams();
  const v = state.v;
  const gapL = state.gap;

  const qInf = 0.5 * RHO * v * v;              // Pa
  const fLead = qInf * p.cd * p.area;          // N
  const qR = qRatio(gapL);
  const cR = cdRatio(gapL);
  const dR = qR * cR;
  const fFol = dR * fLead;
  const saving = fLead - fFol;

  return {
    p, v, gapL,
    gapMm: gapL * L * 1000,
    qInf, fLead, fFol, qR, cR, dR, saving,
    dropPct: 1 - dR,
    savingShare: saving / THRUST.Fpeak,
    re: (v * L) / NU,
    fShed: (0.2 * v) / L,
    lambda: L / 0.2,
    uCore: velocityRatio(0, 0),
    sigma0: sigma(0),
    sigmaAt1: sigma(1),
  };
}

export function runResult() {
  return selfCheck(flatParams());
}

/* ---------------- 断言 ---------------- */
export function assertions() {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });

  // 1 中线动压赤字在三处解析值
  {
    const e0 = Math.abs(qRatio(0) - 0.78);
    const e1 = Math.abs(qRatio(WAKE.qTau) - (1 - 0.22 * Math.exp(-1)));
    add('q/q∞ 在 g=0 处等于 0.78、在 g=τ 处等于 1−0.22/e',
      e0 < 1e-12 && e1 < 1e-12, `${qRatio(0).toFixed(6)} / ${qRatio(WAKE.qTau).toFixed(6)}`);
  }

  // 2 速度场与阻力模型必须自洽：中线 (1−Au)² === qRatio(0)
  {
    const err = Math.abs(Math.pow(velocityRatio(0, 0), 2) - qRatio(0));
    add('速度场中线平方等于动压比（两套参数同源）', err < 1e-12, `偏差 ${err.toExponential(2)}`);
  }

  // 3 阻力比随间距单调递增
  {
    let prev = -1, mono = true, at = 0;
    for (let i = 0; i <= 200; i++) {
      const g = i * 0.025;
      const v = dragRatio(g);
      if (v <= prev) { mono = false; at = g; }
      prev = v;
    }
    add('阻力比随跟车距离严格单调递增', mono, mono ? '201 个采样点全部递增' : `在 g=${at.toFixed(3)} L 处失效`);
  }

  // 4 g = 0 的乘积是 0.78 × 0.62
  {
    const want = (1 - WAKE.qAmp) * (1 - WAKE.cAmp);
    add('g = 0 时阻力比为 0.78 × 0.62', Math.abs(dragRatio(0) - want) < 1e-15,
      `${dragRatio(0).toFixed(9)}`);
  }

  // 5 远端回到 1
  {
    const far = dragRatio(40);
    add('g → ∞ 时阻力比回到 1', Math.abs(far - 1) < 1e-6, `${far.toFixed(9)}`);
  }

  // 6 前车阻力与间距无关
  {
    const a = model({ gap: 0.2, v: 16.906 }).fLead;
    const b = model({ gap: 4.5, v: 16.906 }).fLead;
    add('前车阻力与跟车距离无关', Math.abs(a - b) < 1e-15, `${(a * 1000).toFixed(4)} mN`);
  }

  // 7 前车阻力在末速处等于 93.6 mN
  {
    const f = model({ gap: 1, v: REFERENCE.vFinish }).fLead;
    add('前车阻力在 16.906 m/s 处等于 93.6 mN', Math.abs(f * 1000 - 93.6) < 0.15,
      `${(f * 1000).toFixed(3)} mN`);
  }

  // 8 省下来的力永远非负、且小于前车阻力
  {
    let ok = true;
    for (let i = 0; i <= 100; i++) {
      const m = model({ gap: i * 0.05, v: 12 });
      if (!(m.saving >= 0 && m.saving < m.fLead)) ok = false;
    }
    add('省下的力非负且小于前车阻力', ok, `${(model({ gap: 0.5, v: 12 }).saving * 1000).toFixed(2)} mN（g=0.5 L）`);
  }

  // 9 跟车收益占峰值推力不到 1 %
  {
    const m = model({ gap: 0, v: REFERENCE.vFinish });
    add('跟车收益不足峰值推力的 1 %', m.savingShare < 0.01, `${(m.savingShare * 100).toFixed(3)} %`);
  }

  // 10 尾流半宽线性张开
  {
    const d = sigma(2) - sigma(0);
    add('尾流半宽随下游线性张开', Math.abs(d - 2 * WAKE.spread) < 1e-12, `σ(2) − σ(0) = ${d.toFixed(4)}`);
  }

  // 11 远下游速度回到自由流
  {
    const far = velocityRatio(30, 0);
    add('远下游 u/U 回到 1', Math.abs(far - 1) < 1e-6, `${far.toFixed(9)}`);
  }

  // 12 雷诺数处于湍流尾流区
  {
    const m = model({ gap: 1, v: REFERENCE.vFinish });
    add('雷诺数处于湍流尾流区（Re > 1e4）', m.re > 1e4, `Re = ${m.re.toExponential(3)}`);
  }

  // 13 参数组自洽
  {
    const sc = selfCheck(flatParams());
    add('参数组自洽（冲量·动量·距离·平均速度）', sc.ok,
      sc.ok ? `${sc.run.t.toFixed(4)} s / ${sc.run.v.toFixed(3)} m/s`
        : sc.rows.filter((r) => !r.ok).map((r) => r.name).join('；'));
  }

  return out;
}