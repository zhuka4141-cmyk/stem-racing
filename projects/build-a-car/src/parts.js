/* 零件库和整车的实时计算。

   一条规矩：任何显示出来的数都必须从选中的零件算出来，不能是事先写死的
   常数。改一个零件，质量、质心、迎风面积、成绩全都跟着动，三条限值也重新
   判一遍。

   三个必须报警的量：
     1. 质心横向偏移 |dLat|      上限 0.568 mm（由 21 N 推力反推）
     2. 前轮抗偏航力矩需求 M_req  上限 5.96 mN·m
     3. 等效惯性质量比 m_eq / m   基准 1.229，上限 1.32

   第 3 条的上限是我们自己定的，队长只说了「偏离基准太多」没给数。基准
   1.229 来自队里标定车 79.88 g / 65 g。写在 README 里了，没有假装它是
   赛规。 */

import {
  A0, F_PEAK, AOA_CD_PER_DEG, WING_CD_PER_DEG,
  WHEEL_INERTIA_K, simulate, AXLE_F, AXLE_R, WHEELBASE,
  D_LAT_LIMIT, M_YAW_LIMIT,
} from './physics.js';

export const CLASS_MASS = 0.065;        // kg 组别限重
export const REF_MASS = 0.065;          // kg 标定车
export const REF_MEQ = 0.07988;         // kg 标定车等效惯性质量
export const REF_RATIO = REF_MEQ / REF_MASS;   // 1.2289
export const MEQ_RATIO_LIMIT = 1.32;    // 我们定的上限

/* 这两个是从 physics.js 引过来的，不在这里另写一份。 */
export { D_LAT_LIMIT, M_YAW_LIMIT };
export const WING_STATION = 0.188;      // m 尾翼安装位置

export const GROUPS = [
  {
    id: 'body', zh: '车身', en: 'BODY SHELL',
    options: [
      { id: 'std', name: '标准壳', mass: 0.02012, cd0: 0.300, aoa: 3.5, noseLen: 34, rideHeight: 4.0, areaK: 1.00, comStation: 0.100 },
      { id: 'short', name: '短鼻', mass: 0.01920, cd0: 0.325, aoa: 4.5, noseLen: 24, rideHeight: 4.2, areaK: 1.04, comStation: 0.096 },
      { id: 'long', name: '长尾低阻', mass: 0.02140, cd0: 0.285, aoa: 2.5, noseLen: 46, rideHeight: 3.4, areaK: 0.97, comStation: 0.106 },
    ],
  },
  {
    id: 'wheel', zh: '轮组', en: 'WHEEL SET',
    options: [
      { id: 'w26', name: '轻量 26', dia: 26, mass: 0.00279 },
      { id: 'w30', name: '标准 30', dia: 30, mass: 0.00372 },
      { id: 'w34', name: '宽体 34', dia: 34, mass: 0.00478 },
    ],
  },
  {
    id: 'ballast', zh: '配重', en: 'BALLAST',
    options: [
      { id: 'bL', name: '轻 16 g 前左', mass: 0.016, station: 0.116, lateral: -0.0026 },
      { id: 'bM', name: '标 30 g 中置', mass: 0.030, station: 0.150, lateral: 0.0 },
      { id: 'bH', name: '重 36 g 后右', mass: 0.036, station: 0.172, lateral: 0.0034 },
    ],
  },
  {
    id: 'wing', zh: '尾翼', en: 'REAR WING',
    options: [
      { id: 'none', name: '无尾翼', deg: 0, mass: 0.0 },
      { id: 'low', name: '低阻 4°', deg: 4, mass: 0.0016 },
      { id: 'big', name: '大尾翼 9°', deg: 9, mass: 0.0032 },
    ],
  },
];

export const DEFAULT_SEL = { body: 0, wheel: 1, ballast: 1, wing: 1 };

const pick = (group, i) => GROUPS.find((g) => g.id === group).options[i];

/* 车身侧面投影面积。离地每高 1 mm 多 1.0%，鼻锥每比 34 mm 短 1 mm 多 1.2%，
   再乘车壳自己的系数。这一条在 spot-diff-car 里已经和台架对过一次。 */
export function bodyArea(body) {
  return A0
    * (1 + 0.010 * (body.rideHeight - 4))
    * (1 + 0.012 * (34 - body.noseLen))
    * body.areaK;
}

export function evaluate(sel) {
  const body = pick('body', sel.body);
  const wheel = pick('wheel', sel.wheel);
  const ballast = pick('ballast', sel.ballast);
  const wing = pick('wing', sel.wing);

  const wheelMass = 4 * wheel.mass;
  const parts = [
    { group: 'body', name: body.name, mass: body.mass },
    { group: 'wheel', name: wheel.name, mass: wheelMass },
    { group: 'ballast', name: ballast.name, mass: ballast.mass },
    { group: 'wing', name: wing.name, mass: wing.mass },
  ];

  /* 质量求和。门禁里会拿这个和 parts 的逐项和对一遍，差一个 ulp 都算失败。 */
  const m = parts.reduce((s, p) => s + p.mass, 0);

  const rot = WHEEL_INERTIA_K * wheelMass;
  const mEq = m + rot;

  const cd = body.cd0 + AOA_CD_PER_DEG * body.aoa + WING_CD_PER_DEG * wing.deg;
  const area = bodyArea(body);

  /* 质心纵向：按质量加权。横向只有配重能挪，四个轮子左右对称不贡献。 */
  const comX = (
    body.mass * body.comStation
    + ballast.mass * ballast.station
    + wing.mass * WING_STATION
    + 2 * wheel.mass * AXLE_F
    + 2 * wheel.mass * AXLE_R
  ) / m;
  const comLat = ballast.mass * ballast.lateral / m;

  /* 前轴分担的偏航力矩：CoM 到后轴的距离占轴距的比例，正好是前轴荷。 */
  const b = Math.max(0, AXLE_R - comX);
  const frontShare = b / WHEELBASE;
  const mYaw = F_PEAK * Math.abs(comLat) * frontShare;

  const sim = simulate({ mEq, mBody: m, cd, area });
  const ratio = mEq / m;

  const warnings = [
    {
      id: 'lat', zh: '质心横向偏移', en: 'CoM LATERAL OFFSET',
      value: Math.abs(comLat) * 1000, limit: D_LAT_LIMIT * 1000, unit: 'mm', digits: 3,
      tripped: Math.abs(comLat) > D_LAT_LIMIT,
    },
    {
      id: 'yaw', zh: '前轮抗偏航力矩需求', en: 'FRONT YAW MOMENT',
      value: mYaw * 1000, limit: M_YAW_LIMIT * 1000, unit: 'mN·m', digits: 2,
      tripped: mYaw > M_YAW_LIMIT,
    },
    {
      id: 'meq', zh: '等效惯性质量比', en: 'EFFECTIVE INERTIA RATIO',
      value: ratio, limit: MEQ_RATIO_LIMIT, unit: '', digits: 3,
      tripped: ratio > MEQ_RATIO_LIMIT,
    },
  ];

  return {
    sel: { ...sel },
    parts, m, rot, mEq, cd, area, comX, comLat, frontShare, mYaw, ratio,
    time: sim.time, speed: sim.speed,
    massSum: parts.reduce((s, p) => s + p.mass, 0),
    overClassMass: m > CLASS_MASS + 1e-9,
    anyTripped: warnings.some((w) => w.tripped),
    warnings,
    body, wheel, ballast, wing,
  };
}

/* 给自检用的全组合遍历：3^4 = 81 种。用来证明三条限值都真的够得着，
   而不是写在那里永远亮不了。 */
export function allCombos() {
  const out = [];
  for (let a = 0; a < GROUPS[0].options.length; a++)
    for (let b = 0; b < GROUPS[1].options.length; b++)
      for (let c = 0; c < GROUPS[2].options.length; c++)
        for (let d = 0; d < GROUPS[3].options.length; d++)
          out.push(evaluate({ body: a, wheel: b, ballast: c, wing: d }));
  return out;
}
