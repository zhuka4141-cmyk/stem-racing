/* turbulence-streak · 车尾的卡门涡街 —— 纯函数模型

   特征长度有两个，别混：
     L = 0.200 m  车长，只用来算雷诺数 Re = vL/ν
     D = 0.050 m  车宽，用来算脱落——Strouhal 数定义在横流尺寸上

   所以
     f  = St·v/D        脱落频率
     λ  = D/St = 0.250 m  涡的间距（同一列相邻两涡）

   λ 和速度无关，这是这一整套东西里最反直觉的一条：
   把车速从 10 提到 20，涡街在空间上几乎不变，变的是时间——每秒脱 34 个还是 68 个。

   Re = vL/ν：
     16.906 m/s → 2.230×10⁵
     20.000 m/s → 2.639×10⁵
   Re_D = vD/ν 只有 5.6×10⁴，落在亚临界区（10³–2×10⁵），
   所以 St ≈ 0.2 这个数在这个速度段是能站住的。

   尾流几何：
     包络全宽  h(x) = H0 + K·x,  H0 = 0.028 m, K = 0.32（张角 ≈ 18°）
     涡核半径  r_c(x) = √(4ν·x/u_c),  u_c = 0.85v（涡以 0.85 倍来流向下游走）
   h 由车身宽度决定，几乎不随速度变；r_c 随速度反比于 √v ——
   所以低速时涡核胖、高速时涡核瘦，这是图上唯一能看出速度的几何量。

   随机性：位置抖动和强度抖动都来自 mulberry32(SEED)，固定种子，
   同样的输入永远画出同样一张图。没有 Math.random()。 */

import { RHO, NU, flatParams, selfCheck, REFERENCE, sheddingFreq, sheddingFreqByLen } from './racing-core.js';
import { mulberry32 } from './reel-export.js';

export const L = 0.200;      // 车长 m（只进雷诺数）
export const D = 0.050;      // 车宽 m（进 Strouhal）
export const ST = 0.20;      // 斯特劳哈尔数
export const UC = 0.85;      // 涡的对流速度 / 来流
export const H0 = 0.028;     // 尾端包络全宽 m
export const K_SPREAD = 0.32;// 包络张开率（张角 ≈ 2·atan(0.16) ≈ 18°）
export const WINDOW = 2.4;   // 视窗长度 m

export const SEED = 0x5eed1e55;

export const DEFAULT_STATE = { v: REFERENCE.vFinish, jitter: 0.18 };

export const LIMITS = {
  v:      { min: 5, max: 20, step: 0.1, unit: 'm/s', label: '车速', status: 'DERIVED' },
  jitter: { min: 0, max: 0.35, step: 0.01, unit: '', label: '抖动幅度', status: 'TYPICAL' },
};

/* ---------- 基本量 ---------- */
export const wavelength = () => D / ST;
export const freq = (v) => (ST * v) / D;
export const reLength = (v) => (v * L) / NU;
export const reWidth = (v) => (v * D) / NU;
export const convect = (v) => UC * v;

/* 包络全宽 */
export function width(x) { return H0 + K_SPREAD * x; }

/* 涡核半径：黏性扩散，τ = x/u_c */
export function coreRadius(x, v) {
  return Math.sqrt((4 * NU * x) / convect(v));
}

/* ---------- 涡街 ---------- */
export function street(state, seed = SEED) {
  const rnd = mulberry32(seed);
  const half = wavelength() / 2;
  const n = Math.floor((WINDOW + half) / half);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const x = i * half;
    const side = i % 2 === 1 ? 1 : -1;      // 严格交替
    const jStr = (rnd() - 0.5) * 2 * state.jitter;   // 强度抖动
    const jLat = (rnd() - 0.5) * 2 * state.jitter;   // 横向抖动
    out.push({
      i,
      x,                                     // 下游距离 m，严格等距
      side,
      y: (side * width(x)) / 2 * (1 + jLat * 0.22),
      r: coreRadius(x, state.v),
      strength: 1 + jStr * 0.30,
    });
  }
  return out;
}

/* ---------- 迹线：三条绕过涡列的线 ---------- */
export function streaklines(state, seed = SEED) {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const lam = wavelength();
  const out = [];
  for (let k = 0; k < 5; k++) {
    const phase = rnd() * Math.PI * 2;
    const gain = 0.55 + rnd() * 0.5;
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const x = (WINDOW * i) / 90;
      const amp = (width(x) / 2) * 0.42 * gain;
      pts.push([x, amp * Math.sin((2 * Math.PI * x) / lam + phase)]);
    }
    out.push(pts);
  }
  return out;
}

export function model(state) {
  const v = state.v;
  const lam = wavelength();
  const f = freq(v);
  const rc = coreRadius(WINDOW, v);
  const p = flatParams();
  return {
    p, v, f, lam, uc: convect(v),
    reL: reLength(v), reD: reWidth(v),
    period: 1 / f,
    halfPeriod: 1 / (2 * f),
    widthEnd: width(WINDOW),
    width0: width(0),
    rcEnd: rc,
    rc0: coreRadius(0.05, v),
    lamOverL: lam / L,
    vortices: street(state),
    streaks: streaklines(state),
    coreFreq: sheddingFreq(v, p),   // 共用内核，现在也按车宽算了
    st: ST,
    D, L, WINDOW,
  };
}

export function runResult() { return selfCheck(flatParams()); }

/* ---------------- 断言 ---------------- */
export function assertions() {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });
  const state = { ...DEFAULT_STATE };

  // 1 雷诺数（车长）
  {
    const a = reLength(20), b = reLength(REFERENCE.vFinish);
    add('Re = vL/ν：20 m/s 处 2.6385×10⁵、16.906 处 2.2303×10⁵',
      Math.abs(a - 2.6385e5) < 5 && Math.abs(b - 2.2303e5) < 5,
      `${a.toExponential(4)} / ${b.toExponential(4)}`);
  }

  // 2 两个雷诺数之比正好是 L/D
  {
    const r = reLength(13) / reWidth(13);
    add('Re_L / Re_D = L / D = 4', Math.abs(r - L / D) < 1e-12, r.toFixed(9));
  }

  // 3 脱落频率
  {
    const f = freq(REFERENCE.vFinish);
    add('f = St·v/D = 67.62 Hz 于整跑末速', Math.abs(f - 67.62) < 0.02, f.toFixed(4));
  }

  // 4 波长与速度无关
  {
    const a = wavelength(), b = wavelength();
    add('λ = D/St = 0.2500 m，与速度无关', Math.abs(a - 0.25) < 1e-15 && a === b, a.toFixed(6));
  }

  // 5 f 与 v 严格成正比
  {
    const e = Math.abs(freq(2 * 7.3) - 2 * freq(7.3));
    add('f 与 v 严格成正比：f(2v) = 2f(v)', e < 1e-12, e.toExponential(2));
  }

  // 6 涡严格交替、间距正好半个波长
  {
    const s = street(state);
    let alt = true, gap = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i].side !== (i % 2 === 1 ? 1 : -1)) alt = false;
      if (i > 0) gap = Math.max(gap, Math.abs((s[i].x - s[i - 1].x) - wavelength() / 2));
    }
    add('相邻涡严格换边、间距 = λ/2 = 0.1250 m', alt && gap < 1e-12,
      `${s.length} 个涡，最大间距偏差 ${gap.toExponential(2)}`);
  }

  // 7 固定种子 → 完全一致；换种子 → 不一致
  {
    const a = JSON.stringify(street(state, SEED));
    const b = JSON.stringify(street(state, SEED));
    const c = JSON.stringify(street(state, SEED ^ 1));
    add('mulberry32 固定种子可复现（同种子逐字节相等，异种子不等）',
      a === b && a !== c, `${a.length} 字节`);
  }

  // 8 抖动为 0 时涡心正好落在包络线上
  {
    const s = street({ ...state, jitter: 0 });
    let worst = 0;
    for (const v of s) worst = Math.max(worst, Math.abs(Math.abs(v.y) - width(v.x) / 2));
    add('抖动 = 0 时涡心严格落在 h(x)/2 上', worst < 1e-15, worst.toExponential(2));
  }

  // 9 包络单调张开
  {
    let ok = true;
    for (let x = 0; x < WINDOW; x += 0.02) if (!(width(x + 0.02) > width(x))) ok = false;
    add('尾流包络随下游严格张开', ok, `${width(0).toFixed(3)} → ${width(WINDOW).toFixed(3)} m`);
  }

  // 10 空间快照与速度无关（涡数不变），时间上却翻倍
  {
    const a = street({ ...state, v: 5 }).length;
    const b = street({ ...state, v: 20 }).length;
    add('空间快照里涡数与速度无关，变的只是每秒脱几个',
      a === b && Math.abs(freq(20) / freq(5) - 4) < 1e-12, `都是 ${a} 个，频率差 4 倍`);
  }

  // 11 涡核半径按 √x 长
  {
    const r1 = coreRadius(0.4, 12), r2 = coreRadius(0.8, 12);
    add('涡核半径按 √x 增长：r(2x) = √2·r(x)', Math.abs(r2 / r1 - Math.SQRT2) < 1e-12,
      `${(r1 * 1000).toFixed(3)} → ${(r2 * 1000).toFixed(3)} mm`);
  }

  // 12 涡核半径与 √v 成反比
  {
    const a = coreRadius(1.2, 5), b = coreRadius(1.2, 20);
    add('涡核半径与 √v 成反比：v 翻 4 倍，核瘦一半', Math.abs(a / b - 2) < 1e-12,
      `${(a * 1000).toFixed(2)} / ${(b * 1000).toFixed(2)} mm`);
  }

  // 13 脱落处在亚临界区，St = 0.2 才有依据
  {
    const lo = reWidth(5), hi = reWidth(20);
    add('Re_D 落在亚临界脱落区（10³–2×10⁵）', lo > 1e3 && hi < 2e5,
      `${lo.toExponential(2)} – ${hi.toExponential(2)}`);
  }

  // 14 共用内核和本地实现必须完全一致——两边都改成按车宽算了
  {
    const p = flatParams();
    const r = freq(REFERENCE.vFinish) / sheddingFreq(REFERENCE.vFinish, p);
    add('共用内核与本地按车宽算的 f 完全一致',
      Math.abs(r - 1) < 1e-12, `ours/core = ${r.toFixed(9)}`);
  }

  // 14b 旧版按车长算的必须正好小 L/D 倍——证明差别只来自特征长度
  {
    const p = flatParams();
    const rLen = freq(REFERENCE.vFinish) / sheddingFreqByLen(REFERENCE.vFinish, p);
    add('旧版按车长算，正好比按车宽算小 L/D 倍（特征长度是唯一差异）',
      Math.abs(rLen - L / D) < 1e-12, `width/len = ${rLen.toFixed(9)}`);
  }

  // 15 参数组自洽
  {
    const sc = selfCheck(flatParams());
    add('参数组自洽（冲量·动量·距离·平均速度）', sc.ok,
      sc.ok ? `${sc.run.t.toFixed(4)} s / ${sc.run.v.toFixed(3)} m/s` : '有行不通过');
  }

  return out;
}