/* 20 m CO2 dragster physics.
   Governing equation, straight line, along track:

     (m + Σ I_w/r_w²) · a = F(t) − ½ρC_dA·v² − C_rr·m·g

   The bracket is the effective mass: the wheels must be spun up as well as the
   body accelerated. Rolling resistance uses the body mass, not the effective
   mass — the wheels' inertia resists angular acceleration, it does not add
   normal load. That choice is what reproduces the team's bench figure of
   1.188 s / 16.91 m/s at F_peak = 21 N, t_burn = 110 ms.

   Thrust is a half sine, not a constant. Integrating a constant average force
   is the classic way to get a prediction that is 5 % optimistic. */

export const RHO = 1.204;        // kg/m³, 20 °C sea level
export const G = 9.81;           // m/s²
export const TRACK_LEN = 20.0;   // m
export const CD0 = 0.34;         // body baseline, before AoA / wing corrections
export const A0 = 1.6e-3;        // m²
export const CRR = 0.008;
export const F_PEAK = 21;        // N
export const T_BURN = 0.110;     // s
export const CAR_LEN = 0.200;    // m
export const WHEELBASE = 0.170;  // m, front axle to rear axle

/* Induced drag grows steeply past a few degrees. This is a bench fit, not a
   wind-tunnel result: +1° of body attitude is worth roughly 4.5 % of C_d over
   the range we actually run. */
export const AOA_CD_PER_DEG = 0.045;
export const WING_CD_PER_DEG = 0.038;

/* Wheel inertia as I_w = k·m_w·r². A moulded wheel with a thin rim and a light
   hub behaves like a ring, k ≈ 1.0. That is the value which reproduces the
   team's measured I_w = 4.5e-7 kg·m² at r = 0.011 m with a 3.72 g wheel:
   I = m·r² = 3.72e-3 × 1.21e-4 = 4.50e-7.
   Dropping k below 1 here silently shrinks the rotational term while leaving the
   wheel mass alone, so the pair (k, m_w) has to stay consistent with it. */
export const WHEEL_INERTIA_K = 1.0;

/* Effective mass. rotational part = Σ k·m_w, since I_w/r_w² = k·m_w. */
export function effectiveMass(bodyMass, wheels) {
  let rot = 0;
  for (const w of wheels) rot += WHEEL_INERTIA_K * w.mass;
  return { body: bodyMass, rot, total: bodyMass + rot };
}

export function dragForce(v, cd, area) {
  return 0.5 * RHO * cd * area * v * v;
}

export function cdFor(aoaDeg, wingDeg, baseCd = CD0) {
  return baseCd + AOA_CD_PER_DEG * Math.abs(aoaDeg) + WING_CD_PER_DEG * Math.abs(wingDeg);
}

/* Numerically integrated with symplectic Euler. The closed form only exists for
   constant thrust, which is exactly the assumption that makes student models
   disagree with the track. */
export function simulate(opts) {
  const {
    mEq,
    mBody,
    cd = CD0,
    area = A0,
    fPeak = F_PEAK,
    tBurn = T_BURN,
    len = TRACK_LEN,
    dt = 5e-5,
  } = opts;

  const k = 0.5 * RHO * cd * area;
  const roll = CRR * mBody * G;

  let v = 0, s = 0, t = 0;
  const thrust = (tt) => (tt < tBurn ? fPeak * Math.sin((Math.PI * tt) / tBurn) : 0);

  while (s < len && t < 8) {
    const a = (thrust(t) - k * v * v - roll) / mEq;
    v += a * dt;
    s += v * dt;
    t += dt;
  }
  return { time: t, speed: v, dragAtEnd: dragForce(v, cd, area) };
}

/* Cartesian CoM of mounted parts. Each part: {mass, x, y} in metres, x forward
   from the nose, y positive to the right. */
export function centreOfMass(parts) {
  let m = 0, mx = 0, my = 0;
  for (const p of parts) {
    m += p.mass;
    mx += p.mass * p.x;
    my += p.mass * p.y;
  }
  if (m <= 0) return { mass: 0, x: 0, y: 0 };
  return { mass: m, x: mx / m, y: my / m };
}

/* Front-wheel yaw-moment demand.

   Thrust acts along the cartridge axis. If the CoM sits `dLat` off that axis,
   the thrust tries to rotate the car by F_peak·dLat. The rear axle, being much
   closer to the thrust line, carries most of that reaction; the front axle sees
   the share set by the CoM's distance to the rear axle over the wheelbase.

   M_req = F_peak · dLat · (b / wheelbase),  b = CoM to rear axle.

   Threshold is the team's bench number. At dLat = 1.32 mm this lands near
   4 mN·m, i.e. just inside 5.96, which is why both limits are worth showing:
   which one binds first depends on where the CoM sits. */
export const M_YAW_LIMIT = 5.96e-3;   // N·m
export const D_LAT_LIMIT = 1.32e-3;   // m
export const MEQ_RATIO_LIMIT = 1.32;  // effective mass / body mass

export function yawDemand(dLat, comX, fPeak = F_PEAK) {
  const b = Math.max(0, WHEELBASE - (comX - (CAR_LEN - WHEELBASE) / 2));
  return fPeak * Math.abs(dLat) * (b / WHEELBASE);
}
