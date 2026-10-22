/* physics.js — 20 m CO2 dragster, 1-D along the track.
 *
 *   (m + sum(Iw)/rw^2) * a = F(t) - 0.5*rho*CdA*v^2 - Crr*m*g - F_scrub
 *
 * Every constant is tagged in README.md:
 *   [fixed]   physics/geometry we trust
 *   [typical] plausible, not measured by us
 *   [VERIFY]  comes from a rulebook we did not re-read
 */
(function () {
  'use strict';
  var GT = (window.GT = window.GT || {});

  var RHO = 1.204;    // kg/m^3 air @ 20 C, sea level                     [fixed]
  var G = 9.81;       // m/s^2                                            [fixed]
  var TRACK = 20.0;   // m                                                [VERIFY]

  // Lumped rail-normal load amplification for toe scrub. Not a first-principles
  // contact model: the yaw moment against the guide rail loads the wheels far
  // above their static share. Chosen so ~0.7 deg of toe costs the few hundredths
  // of a second we actually see on the track.                          [typical]
  var C_ALIGN = 4.0;

  // One cartridge class for the whole series. The impulse spread is manufacturing
  // scatter between cartridges, not a design choice. Everything else is the build.
  var RANGES = {
    massG:         [52.0, 64.0],     // total, wheels included          [VERIFY]
    wheelMassG:    [2.4, 3.6],       // each                            [typical]
    wheelRadiusMM: [12.0, 18.0],     //                                 [typical]
    cdaMM2:        [380, 1300],      // Cd*A in mm^2 = 3.8e-4..1.3e-3   [typical]
    crr:           [0.0020, 0.0100], //                                 [typical]
    impulseNS:     [1.18, 1.30],     // integral of F dt                [VERIFY]
    tauMs:         [45, 72],         // thrust decay constant           [typical]
    toeDeg:        [0.05, 0.80]      // static toe per wheel            [typical]
  };

  // "Best in range" value per parameter, used for the one-at-a-time ablation.
  var BEST = {
    massG:         RANGES.massG[0],
    wheelMassG:    RANGES.wheelMassG[0],
    wheelRadiusMM: RANGES.wheelRadiusMM[1],
    cdaMM2:        RANGES.cdaMM2[0],
    crr:           RANGES.crr[0],
    impulseNS:     RANGES.impulseNS[1],
    tauMs:         RANGES.tauMs[1],
    toeDeg:        RANGES.toeDeg[0]
  };

  // I_w = 0.5*m_w*r^2 (disc). Four wheels -> sum(I_w)/r^2 = 2*m_w.
  // Ignoring this term overestimates acceleration by ~8% for these cars.
  function effectiveMassKg(p) {
    return p.massG / 1000 + 2 * (p.wheelMassG / 1000);
  }

  // F(t) = (J/tau)*exp(-t/tau), so the integral over t >= 0 is exactly J.
  // Peak thrust and impulse stay separate quantities, which is the whole point.
  function thrustAt(p, t) {
    var tau = p.tauMs / 1000;
    return (p.impulseNS / tau) * Math.exp(-t / tau);
  }

  function forces(p, t, v) {
    var m = p.massG / 1000;
    var cda = p.cdaMM2 * 1e-6;
    return {
      thrust: thrustAt(p, t),
      drag: 0.5 * RHO * cda * v * v,
      roll: p.crr * m * G,
      scrub: C_ALIGN * m * G * Math.sin((p.toeDeg * Math.PI) / 180)
    };
  }

  function accel(p, t, v) {
    var f = forces(p, t, v);
    return (f.thrust - f.drag - f.roll - f.scrub) / effectiveMassKg(p);
  }

  // RK4 on y = [x, v], h = 0.5 ms.
  function simulate(p) {
    var h = 0.0005;
    var t = 0, x = 0, v = 0;
    var peakV = 0;
    var perMetre = [];
    var nextMark = 1;
    var stopThrustAt = 6 * (p.tauMs / 1000); // past this the remaining impulse is <0.25%
    var thrustDistance = 0, thrustTime = 0;
    var workThrust = 0, workDrag = 0, workRoll = 0, workScrub = 0;
    var limit = 60;
    var steps = 0;
    var last = null;

    while (x < TRACK && t < limit && steps < 400000) {
      var a1 = accel(p, t, v);
      var v1 = v + (h / 2) * a1;
      var a2 = accel(p, t + h / 2, v1);
      var v2 = v + (h / 2) * a2;
      var a3 = accel(p, t + h / 2, v2);
      var v3 = v + h * a3;
      var a4 = accel(p, t + h, v3);

      var dx = (h / 6) * (v + 2 * v1 + 2 * v2 + v3);
      var dv = (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);

      // Energy accounting on the same midpoint the RK4 step uses.
      var fm = forces(p, t + h / 2, v1);
      var dxm = dx;   // must match the RK4 increment or the work integral drifts
      workThrust += fm.thrust * dxm;
      workDrag += fm.drag * dxm;
      workRoll += fm.roll * dxm;
      workScrub += fm.scrub * dxm;

      var xPrev = x, vPrev = v, tPrev = t;
      last = { xPrev: xPrev, vPrev: vPrev, tPrev: tPrev, dx: dx, dv: dv };

      x += dx;
      v += dv;
      t += h;
      steps++;

      if (v > peakV) peakV = v;
      if (t <= stopThrustAt) { thrustDistance = Math.min(x, TRACK); thrustTime = t; }

      while (x >= nextMark && nextMark <= TRACK && x > xPrev) {
        var f = (nextMark - xPrev) / (x - xPrev);
        perMetre.push({ m: nextMark, t: tPrev + f * h, v: vPrev + f * dv });
        nextMark += 1;
      }
    }

    var frac = last && last.dx > 0 ? (TRACK - last.xPrev) / last.dx : 1;
    frac = Math.max(0, Math.min(1, frac));
    var time = last.tPrev + frac * h;
    var finishV = last.vPrev + frac * last.dv;

    return {
      time: time,
      finishSpeed: finishV,
      peakSpeed: peakV,
      peakThrust: thrustAt(p, 0),
      thrustDistance: thrustDistance,
      thrustTime: thrustTime,
      impulse: p.impulseNS,
      effectiveMassKg: effectiveMassKg(p),
      work: { thrust: workThrust, drag: workDrag, roll: workRoll, scrub: workScrub },
      perMetre: perMetre,
      finished: x >= TRACK
    };
  }

  // Energy closure: thrust work must equal translation + wheel spin + losses.
  function energyClosure(p, r) {
    var m = p.massG / 1000;
    var vf = r.finishSpeed;
    var trans = 0.5 * m * vf * vf;
    // Per wheel I = 0.5*m_w*r^2 at omega = v/r, so 0.25*m_w*v^2; four wheels -> m_w*v^2.
    var spin = (p.wheelMassG / 1000) * vf * vf;
    var out = trans + spin + r.work.drag + r.work.roll + r.work.scrub;
    return {
      in: r.work.thrust,
      out: out,
      ratio: r.work.thrust > 0 ? out / r.work.thrust : 0,
      parts: { trans: trans, spin: spin, drag: r.work.drag, roll: r.work.roll, scrub: r.work.scrub }
    };
  }

  var FACTORS = [
    { key: 'massG',     label: '质量',  sym: 'm',     unit: 'g',   digits: 1 },
    { key: 'cdaMM2',    label: 'CdA',   sym: 'CdA',   unit: 'mm²', digits: 0 },
    { key: 'crr',       label: 'Crr',   sym: 'Crr',   unit: '',    digits: 4 },
    { key: 'impulseNS', label: '冲量',  sym: '∫F dt', unit: 'N·s', digits: 3 }
  ];

  // One-at-a-time ablation. Each delta is what that single change alone saves;
  // the deltas are NOT additive and the screen says so.
  function contributions(p, baseTime) {
    var out = [];
    for (var i = 0; i < FACTORS.length; i++) {
      var f = FACTORS[i];
      var q = Object.assign({}, p);
      q[f.key] = BEST[f.key];
      out.push({
        key: f.key, label: f.label, sym: f.sym, unit: f.unit, digits: f.digits,
        value: p[f.key], best: BEST[f.key],
        savedSeconds: baseTime - simulate(q).time
      });
    }
    var qt = Object.assign({}, p);
    qt.toeDeg = BEST.toeDeg;
    return { factors: out, toeSaved: baseTime - simulate(qt).time };
  }

  GT.PHYS = {
    RHO: RHO, G: G, TRACK: TRACK, C_ALIGN: C_ALIGN,
    RANGES: RANGES, BEST: BEST, FACTORS: FACTORS,
    effectiveMassKg: effectiveMassKg,
    thrustAt: thrustAt,
    forces: forces,
    accel: accel,
    simulate: simulate,
    energyClosure: energyClosure,
    contributions: contributions
  };
})();
