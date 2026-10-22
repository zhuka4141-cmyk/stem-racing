/* 20 m 直线加速 · 一维纵向动力学模型
 * 规范来源：racing-physics skill
 *   (m + Σ I_w/r_w²)·a = F_thrust(t) − ½ρCdA v² − Crr·m·g − F_scrub
 * 推力按指数衰减曲线积分，不使用平均值。
 * 经典脚本（非 ES module）—— file:// 下 module 会被 CORS 拦掉。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LabPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 常数与它们的可信度 ---------- */
  /* status: fixed = 物理/几何，可以直接信
   *         typical = 量级合理但必须自己测
   *         VERIFY = 来自会变的赛规/器材说明，发布前重读现行规定 */
  var CONSTS = {
    L:      { sym: 'L',   label: '赛道长度',      value: 20.0,    unit: 'm',
              status: 'VERIFY',  note: '赛规数字，会随赛事改。我们的赛道实测 20.00 m（卷尺两次取平均，差 4 mm）。参赛前按当年规则再核一遍。' },
    RHO:    { sym: 'ρ',   label: '空气密度',      value: 1.204,   unit: 'kg/m³',
              status: 'fixed',   note: '20 °C、海平面、50 % 相对湿度的查表值。室温 15–25 °C 之间变化不到 2 %，对成绩影响 < 3 ms。' },
    G:      { sym: 'g',   label: '重力加速度',    value: 9.81,    unit: 'm/s²',
              status: 'fixed',   note: '标准重力。本地纬度修正约 0.1 %，本项目忽略。' },
    NW:     { sym: 'n_w', label: '轮数',          value: 4,       unit: '个',
              status: 'fixed',   note: '两台车都是四轮。' },
    MW:     { sym: 'm_w', label: '单轮质量',      value: 1.8,     unit: 'g',
              status: 'typical', note: '我们用的尼龙轮称 1.7–1.9 g，取 1.8 g。换轮子必须重称——它直接进有效质量。' },
    IW:     { sym: 'I_w', label: '轮转动惯量',    value: null,    unit: 'kg·m²',
              status: 'fixed',   note: '按圆盘近似 I_w = ½·m_w·r_w²。真轮子辐条挖空会更小，误差 < 10 %。' },
    TAU_B0: { sym: 'τ_b0',label: '轴承启动力矩',  value: 1.5e-5,  unit: 'N·m/轮',
              status: 'typical', note: '新轴承手测启动力矩，用鱼线吊砝码法称的。旧轴承实测到过 1.2e-4，差一个数量级。' },
    CV_B:   { sym: 'c_v', label: '轴承黏性系数',  value: 3.0e-8,  unit: 'N·m·s/rad',
              status: 'typical', note: '转速越高阻尼越大。20 m 末端轮子转约 1200 rad/s，这一项和启动力矩同量级。没做过转速台架，估的。' },
    MU_RAIL:{ sym: 'μ_rail',label:'导轨摩擦系数', value: 0.20,    unit: '—',
              status: 'typical', note: '黄铜导孔对单丝鱼线，干摩擦。没实测，按塑料对金属的常见量级取。' },
    L_REAR: { sym: 'L_rear',label:'导孔到后轴力臂',value: 55,     unit: 'mm',
              status: 'typical', note: '导孔中心到后轴中心的三维距离。车是同一副模板，卡尺量 55.2 mm。' },
    K_PIN:  { sym: 'k_pin',label:'导孔转动刚度',  value: 1.5,     unit: 'N·m/rad',
              status: 'typical', note: '导孔顶住鱼线后还能再转多少，弹性接触估的。这是全模型里最没底的一个数，台架上没测出来——见 README 已知问题。' },
    TH_TAU: { sym: 'τ_d', label: '推力衰减时间常数',value: 0.05,  unit: 's',
              status: 'VERIFY', note: '气瓶放气曲线。按厂家给的推力曲线拟合，换气瓶批号必须重拟合。' },
    TH_CUT: { sym: 't_cut',label: '推力截止时刻', value: 0.30,    unit: 's',
              status: 'VERIFY', note: '气瓶在 0.30 s 后推力归零（数据手册曲线末端）。这条线画在速度图上，能看出车从哪一点开始只减速。' },
    DT:     { sym: 'Δt',  label: '时间步长',      value: 1.0,     unit: 'ms',
              status: 'fixed',   note: 'RK4 四阶。步长减半成绩变化 < 0.1 ms，已经收敛。' },
    BAND_T: { sym: '',    label: '成绩合理区间',  value: [1.00, 1.25], unit: 's',
              status: 'typical', note: '20 m 气动车的常见完赛时间。落到区间外说明模型或参数错了，不是车快——界面会直接报警。' },
    GUIDE:  { sym: '\u0394g', label: '导孔单侧余量',  value: 0.30,    unit: 'mm',
              status: 'VERIFY',  note: '导孔内径 1.2 mm、鱼线直径 0.6 mm 算出来的单侧间隙。超过这个数，导孔就顶死鱼线，横向力全部由导轨承担。另一个独立模型给出的临界横向偏移是 1.32 mm，差 4 倍——谁对要靠实测，见 README。' },
    BAND_V: { sym: '',    label: '末速度合理区间',value: [15, 20], unit: 'm/s',
              status: 'typical', note: '对应 54–72 km/h。' }
  };

  /* 滑块参数（也会在界面上带状态标注） */
  var PARAMS = {
    m:   { sym: 'm',    label: '车体质量',       unit: 'g',  min: 50,  max: 75,   step: 0.5,  def: 60,
           scale: 0.001,
           status: 'VERIFY', note: '赛规有最低质量。这里是车体加配重的总质量，不含轮组——轮组的滚动惯量由有效质量另行计入。' },
    CdA: { sym: 'CdA',  label: '迎面阻力面积',   unit: 'cm²', min: 3.0, max: 13.0, step: 0.1,  def: 6.5,
           scale: 1e-4,
           status: 'typical', note: 'Cd 乘迎风面积。Cd 0.30–0.60、A 1.2–2.2×10⁻³ m² 是钝体在这一尺寸段的常见范围。我们的壳在风洞里没吹过，按同类车体估的。' },
    Crr: { sym: 'Crr',  label: '滚动阻力系数',   unit: '—',  min: 0.002, max: 0.020, step: 0.0005, def: 0.0035,
           scale: 1,
           status: 'typical', note: '硬轮在硬道上。好轴承约 0.003，磨过的轮面能到 0.02。用斜面下滑法可以测。' },
    J:   { sym: 'J',    label: '推力冲量',       unit: 'N·s', min: 0.80, max: 2.00, step: 0.01, def: 1.30,
           scale: 1,
           status: 'VERIFY', note: '∫F dt，气瓶的能量预算。同一批气瓶之间能差 15 %，比任何几何参数都影响成绩。' },
    rw:  { sym: 'r_w',  label: '轮半径',         unit: 'mm',  min: 12,  max: 18,   step: 0.5,  def: 15,
           scale: 0.001,
           status: 'typical', note: '越大转速越低。注意：圆盘轮的 I_w/r_w² = m_w/2，半径在有效质量里完全抵消——这个滑杆只通过轴承力矩的力臂起作用。' },
    d:   { sym: 'd',    label: '质心横向偏移',   unit: 'mm',  min: 0,   max: 3.0,  step: 0.05, def: 0.5,
           scale: 0.001,
           status: 'typical', note: '质心相对导孔中心线的左右偏移。用两根细线把车吊起来找竖直基准，再量到底面的距离差。' }
  };

  /* 队内基准车：上一版拿去跑区赛的那台 */
  var BASELINE = { m: 0.064, CdA: 8.0e-4, Crr: 0.0050, J: 1.31, rw: 0.013, d: 0.0015 };

  /* 导孔对单丝鱼线的单侧余量，超出即顶死 [VERIFY：取决于鱼线直径和导孔内径] */
  var GUIDE_CLEAR = 0.30; // mm

  var RHO = 1.204, G = 9.81, L = 20.0, DT = 1e-3;
  var NW = 4, MW = 1.8e-3;
  var TAU_B0 = 1.5e-5, CV_B = 3.0e-8;
  var MU_RAIL = 0.20, L_REAR = 0.055, K_PIN = 1.5;
  var TH_TAU = 0.05, TH_CUT = 0.30;
  var BAND_T = [1.00, 1.25], BAND_V = [15, 20];

  function thrustPeak(J) {
    return J / (TH_TAU * (1 - Math.exp(-TH_CUT / TH_TAU)));
  }
  function thrustAt(t, J) {
    if (t < 0 || t > TH_CUT) return 0;
    return thrustPeak(J) * Math.exp(-t / TH_TAU);
  }
  function effMass(m) {
    return m + NW * 0.5 * MW;           // I_w/r_w² = m_w/2，半径抵消
  }

  /* ---------- 主积分 ---------- */
  function simulate(p, opts) {
    opts = opts || {};
    var ideal = !!opts.ideal;           // 关掉全部阻力，画对照曲线用
    var J = p.J, m = p.m, rw = p.rw;
    var CdA = ideal ? 0 : p.CdA;
    var Crr = ideal ? 0 : p.Crr;
    var d = ideal ? 0 : p.d;

    var fp = thrustPeak(J);
    var meff = effMass(m);

    var work = { thrust: 0, drag: 0, roll: 0, bear: 0, scrub: 0 };

    function forces(v, t) {
      var fT = (t < 0 || t > TH_CUT) ? 0 : fp * Math.exp(-t / TH_TAU);
      var fD = 0.5 * RHO * CdA * v * v;
      var fR = Crr * m * G;
      var fB = NW * (TAU_B0 + CV_B * (v / rw)) / rw;
      var fS = MU_RAIL * fT * d / L_REAR;
      return { fT: fT, fD: fD, fR: fR, fB: fB, fS: fS,
               a: (fT - fD - fR - fB - fS) / meff };
    }

    var dt = opts.dt || DT;

    var x = 0, v = 0, t = 0;
    var vmax = 0, aMax = -Infinity, MMax = 0;
    var xs = [0], vs = [0], ts = [0];

    while (x < L && t < 8) {
      var k1 = forces(v, t);
      var k2 = forces(v + 0.5 * dt * k1.a, t + 0.5 * dt);
      var k3 = forces(v + 0.5 * dt * k2.a, t + 0.5 * dt);
      var k4 = forces(v + dt * k3.a, t + dt);

      var vNew = v + dt * (k1.a + 2 * k2.a + 2 * k3.a + k4.a) / 6;
      var dx = dt * (v + dt * (k1.a + k2.a + k3.a) / 6);

      // 中点法累加各分项做功（能量收支靠这个闭合）
      var vm = 0.5 * (v + vNew);
      var fm = forces(vm, t + 0.5 * dt);
      work.thrust += fm.fT * dx;
      work.drag   += fm.fD * dx;
      work.roll   += fm.fR * dx;
      work.bear   += fm.fB * dx;
      work.scrub  += fm.fS * dx;
      if (fm.fT > 0) {
        var M = fm.fT * d;                 // 绕导孔的偏航力矩
        if (M > MMax) MMax = M;
      }
      if (k1.a > aMax) aMax = k1.a;

      // 最后一步穿过终点线 → 插值，避免 1 ms 的量化误差
      if (x + dx >= L && x < L) {
        var frac = (L - x) / dx;
        t = t + frac * dt;
        v = v + frac * (vNew - v);
        x = L;
        if (v > vmax) vmax = v;
        xs.push(x); vs.push(v); ts.push(t);
        break;
      }

      v = vNew; x += dx; t += dt;
      if (v > vmax) vmax = v;
      xs.push(x); vs.push(v); ts.push(t);
    }

    var keTrans = 0.5 * m * v * v;
    var keWheel = 0.5 * NW * (0.5 * MW * rw * rw) * Math.pow(v / rw, 2);
    var keTotal = keTrans + keWheel;
    var losses = work.drag + work.roll + work.bear + work.scrub;

    // 偏航：准静态，力矩由导孔弹性接触承担
    var yawRad = MMax / K_PIN;
    var latDev = L_REAR * Math.tan(yawRad) * 1000;      // mm
    var railN = MMax / L_REAR;

    var inBandT = t >= BAND_T[0] && t <= BAND_T[1];
    var inBandV = v >= BAND_V[0] && v <= BAND_V[1];

    return {
      t: t, v: v, x: x, vmax: vmax, aMax: aMax,
      fp: fp, meff: meff, J: J,
      work: work,
      keTrans: keTrans, keWheel: keWheel, keTotal: keTotal,
      losses: losses,
      closureErr: (keTotal + losses - work.thrust),
      MMax: MMax, yawRad: yawRad, yawDeg: yawRad * 180 / Math.PI,
      latDev: latDev, railN: railN,
      inBandT: inBandT, inBandV: inBandV, inBand: inBandT,
      trace: { xs: xs, vs: vs, ts: ts }
    };
  }

  /* 把滑杆的显示值换成 SI */
  function toSI(key, displayValue) {
    return displayValue * PARAMS[key].scale;
  }
  function toDisplay(key, siValue) {
    return siValue / PARAMS[key].scale;
  }
  function defaultParams() {
    var p = {};
    for (var k in PARAMS) p[k] = PARAMS[k].def * PARAMS[k].scale;
    return p;
  }
  function baselineParams() { return JSON.parse(JSON.stringify(BASELINE)); }

  /* 单参数敏感度：把第 i 个参数换成基准值，看成绩差多少 */
  function compareToBaseline(p) {
    var base = BASELINE;
    var cur = simulate(p);
    var ref = simulate(base);
    var rows = [];
    var KEYS = ['m', 'CdA', 'Crr', 'J', 'rw', 'd'];
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      var q = {};
      for (var kk in p) q[kk] = p[kk];
      q[k] = base[k];
      var alt = simulate(q);
      rows.push({
        key: k,
        label: PARAMS[k].label,
        sym: PARAMS[k].sym,
        current: p[k],
        base: base[k],
        deltaMs: (cur.t - alt.t) * 1000    // 负 = 当前更快
      });
    }
    return {
      currentT: cur.t,
      baseT: ref.t,
      totalMs: (cur.t - ref.t) * 1000,
      rows: rows,
      refV: ref.v
    };
  }

  /* 跑偏敏感度曲线：d 从 0 到 3 mm */
  function lateralCurve(p, n) {
    n = n || 25;
    var fp = thrustPeak(p.J);
    var out = [];
    for (var i = 0; i <= n; i++) {
      var dMM = 3.0 * i / n;
      var M = fp * dMM * 1e-3;
      var yaw = M / K_PIN;
      out.push({ dMM: dMM, latMM: L_REAR * Math.tan(yaw) * 1000, M: M });
    }
    return out;
  }

  /* ---------- 自检 ---------- */
  function selfTest() {
    var checks = [];
    function chk(name, ok, detail) {
      checks.push({ name: name, ok: !!ok, detail: detail });
    }

    var p = defaultParams();
    var r = simulate(p);

    /* 1. 无 NaN / 无 Infinity */
    var fields = ['t', 'v', 'vmax', 'aMax', 'fp', 'meff', 'keTotal', 'latDev', 'MMax', 'railN'];
    var bad = fields.filter(function (k) { return !isFinite(r[k]); });
    var badTrace = r.trace.vs.some(function (q) { return !isFinite(q); }) ||
                   r.trace.xs.some(function (q) { return !isFinite(q); });
    chk('无 NaN / Infinity', bad.length === 0 && !badTrace,
        bad.length ? '异常字段: ' + bad.join(',') : '全部 ' + r.trace.vs.length + ' 个轨迹点有限');

    /* 2. 量纲：有效质量 = m + Σ I_w/r_w²，且半径抵消 */
    var meffFromContain = r.meff - p.m;                       // 轮组贡献 (kg)
    var expect = NW * 0.5 * MW;                               // 圆盘轮：I/r² = m_w/2
    chk('有效质量 [kg] 结构正确',
        Math.abs(meffFromContain - expect) < 1e-12 && r.meff > p.m,
        'Σ I_w/r_w² = ' + meffFromContain.toFixed(5) + ' kg，理论 ' + expect.toFixed(5) +
        ' kg；比车体质量重 ' + (100 * meffFromContain / p.m).toFixed(1) + ' %');

    var r12 = simulate(Object.assign({}, p, { rw: 0.012 }));
    var r18 = simulate(Object.assign({}, p, { rw: 0.018 }));
    chk('轮半径在有效质量中抵消', Math.abs(r12.meff - r18.meff) < 1e-15,
        'r_w=12 mm 与 18 mm 的有效质量同为 ' + r12.meff.toFixed(6) + ' kg');

    /* 3. 加速度量纲：a = ΣF / m_eff。在 t=0、v=0 把五项逐一手算核对 */
    var f0 = thrustAt(0, p.J);
    var t0Drag = 0.5 * RHO * p.CdA * 0 * 0;
    var t0Roll = p.Crr * p.m * G;
    var t0Bear = NW * TAU_B0 / p.rw;
    var t0Scrub = MU_RAIL * f0 * p.d / L_REAR;
    var aHand = (f0 - t0Drag - t0Roll - t0Bear - t0Scrub) / r.meff;
    chk('a = ΣF / m_eff [m/s²]', Math.abs(r.aMax - aHand) / aHand < 1e-9,
        't=0 手算 ' + aHand.toFixed(1) + ' m/s² (推力 ' + f0.toFixed(2) + ' N − 滚动 ' +
        t0Roll.toFixed(4) + ' − 轴承 ' + t0Bear.toFixed(4) + ' − 擦阻 ' + t0Scrub.toFixed(4) +
        ')，积分峰值 ' + r.aMax.toFixed(1) + ' m/s²');

    /* 4. 冲量积分等于滑杆的 J（推力曲线归一化正确） */
    var acc = 0, h = 1e-6;
    for (var t = 0; t < TH_CUT; t += h) acc += thrustAt(t + h / 2, p.J) * h;
    chk('∫F dt 收敛到设定冲量 [N·s]', Math.abs(acc - p.J) / p.J < 1e-4,
        '数值积分 ' + acc.toFixed(4) + ' N·s，设定 ' + p.J.toFixed(4) + ' N·s');

    /* 5. 推力确实在衰减，不是常数 */
    var decayOk = thrustAt(0.01, p.J) > thrustAt(0.10, p.J) &&
                  thrustAt(0.10, p.J) > thrustAt(0.25, p.J) &&
                  thrustAt(TH_CUT + 0.01, p.J) === 0;
    chk('推力按衰减曲线而非平均值',
        decayOk,
        'F(0.01)=' + thrustAt(0.01, p.J).toFixed(1) + ' N > F(0.10)=' +
        thrustAt(0.10, p.J).toFixed(1) + ' N > F(0.25)=' +
        thrustAt(0.25, p.J).toFixed(1) + ' N，t_cut 后为 0');

    /* 6. 能量闭合：∫F dx = ΔKE + Σ阻力做功 */
    var resid = Math.abs(r.keTotal + r.losses - r.work.thrust) / r.work.thrust;
    chk('能量收支闭合 [J]', resid < 0.01,
        '做功 ' + r.work.thrust.toFixed(3) + ' J = 动能 ' + r.keTotal.toFixed(3) +
        ' J + 阻耗 ' + r.losses.toFixed(3) + ' J，残差 ' + (resid * 100).toFixed(3) + ' %');

    /* 7. 动能拆分自洽 */
    chk('平移动能 + 轮转动能 = 总动能 [J]',
        Math.abs(r.keTrans + r.keWheel - r.keTotal) < 1e-12,
        r.keTrans.toFixed(3) + ' + ' + r.keWheel.toFixed(3) + ' = ' + r.keTotal.toFixed(3));

    /* 8. 默认参数落在合理区间 */
    chk('默认成绩落在 1.00–1.25 s', r.inBandT, 't = ' + r.t.toFixed(4) + ' s');
    chk('默认末速度落在 15–20 m/s', r.inBandV, 'v = ' + r.v.toFixed(2) + ' m/s');

    /* 9. 单调性：加重必变慢，加冲量必变快 */
    var heavier = simulate(Object.assign({}, p, { m: p.m + 0.005 }));
    var punchier = simulate(Object.assign({}, p, { J: p.J + 0.20 }));
    chk('模型单调性 (m↑ ⇒ 慢, J↑ ⇒ 快)',
        heavier.t > r.t && punchier.t < r.t,
        'm+5 g → ' + heavier.t.toFixed(4) + ' s，J+0.2 N·s → ' + punchier.t.toFixed(4) + ' s');

    /* 10. 时间步长 ≤ 1 ms，且把步长减半成绩不再变 → 积分已收敛 */
    var half = simulate(p, { dt: DT / 2 });
    chk('时间步长 ≤ 1 ms 且已收敛',
        DT <= 1e-3 && Math.abs(half.t - r.t) < 5e-4,
        'Δt = ' + (DT * 1000).toFixed(2) + ' ms (RK4)；步长减半后成绩差 ' +
        Math.abs(half.t - r.t).toExponential(1) + ' s');

    /* 11. 区间外必须报警 */
    var hot = simulate(Object.assign({}, p, { J: 2.0 }));
    chk('超区间触发警告', hot.inBandT === false,
        'J = 2.00 N·s → t = ' + hot.t.toFixed(4) + ' s，已判为区间外');

    /* 12. 确定性：两次结果逐位相同 */
    var a2 = simulate(defaultParams());
    chk('结果可复现', a2.t === r.t && a2.v === r.v,
        '两次运行 t 完全一致 (' + r.t.toFixed(6) + ')');

    var ok = checks.every(function (c) { return c.ok; });
    return {
      ok: ok,
      checks: checks,
      values: {
        time: r.t, vEnd: r.v, vMax: r.vmax, aMax: r.aMax,
        meff: r.meff, fp: r.fp, keTotal: r.keTotal, losses: r.losses,
        workThrust: r.work.thrust, latDev: r.latDev, yawDeg: r.yawDeg,
        inBand: r.inBand, steps: r.trace.vs.length
      }
    };
  }

  return {
    CONSTS: CONSTS, PARAMS: PARAMS, BASELINE: BASELINE,
    GUIDE_CLEAR: GUIDE_CLEAR,
    BAND_T: BAND_T, BAND_V: BAND_V,
    DT: DT, TRACK: L,
    thrustAt: thrustAt, thrustPeak: thrustPeak, effMass: effMass,
    simulate: simulate, selfTest: selfTest,
    toSI: toSI, toDisplay: toDisplay,
    defaultParams: defaultParams, baselineParams: baselineParams,
    compareToBaseline: compareToBaseline, lateralCurve: lateralCurve
  };
});
