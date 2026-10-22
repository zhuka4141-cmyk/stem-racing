/* numbers.mjs — every figure quoted in README.md, reproducible from the model.
 *
 * Loads the browser sources under a fake window so the numbers in the README and
 * the numbers on screen can never be two different stories.
 *
 * Run: node tests/numbers.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function load(file) {
  const src = readFileSync(join(ROOT, 'src', file), 'utf8');
  new Function('window', src)(win);
}
const win = {};
load('core.js');
load('physics.js');
load('car.js');

const GT = win.GT;
const P = GT.PHYS;

const f = (v, d = 3) => Number(v).toFixed(d);
const pct = (n, t) => (100 * n / t).toFixed(1) + '%';

// ---- single-draw distribution -------------------------------------------
const N = 4000;
const times = [];
for (let i = 0; i < N; i++) times.push(GT.makeCar('dist-' + i).sim.time);
times.sort((a, b) => a - b);
const q = (p) => times[Math.min(N - 1, Math.floor(p * N))];
const inBand = times.filter((t) => t >= 1.0 && t <= 1.25).length;

// ---- accepted cars -------------------------------------------------------
let attempts = 0, maxAttempts = 0;
const accepted = [];
for (let i = 0; i < 2000; i++) {
  const car = GT.makeCar('acc-' + i);
  attempts += car.attempts;
  maxAttempts = Math.max(maxAttempts, car.attempts);
  accepted.push(car.sim.time);
}
accepted.sort((a, b) => a - b);

// ---- energy closure ------------------------------------------------------
let worstClosure = 0, worstSeed = '';
for (let i = 0; i < 500; i++) {
  const car = GT.makeCar('end-' + i);
  const e = car.energy;
  const err = Math.abs(e.ratio - 1);
  if (err > worstClosure) { worstClosure = err; worstSeed = car.seed; }
}

// ---- extremes ------------------------------------------------------------
const fast = P.simulate(Object.assign({}, P.BEST)).time;
const slow = P.simulate(Object.assign({}, P.BEST, {
  massG: P.RANGES.massG[1], wheelMassG: P.RANGES.wheelMassG[1],
  wheelRadiusMM: P.RANGES.wheelRadiusMM[0], cdaMM2: P.RANGES.cdaMM2[1],
  crr: P.RANGES.crr[1], impulseNS: P.RANGES.impulseNS[0],
  tauMs: P.RANGES.tauMs[0], toeDeg: P.RANGES.toeDeg[1]
})).time;

// ---- the demo car shown in the screenshots -------------------------------
const demo = GT.makeCar('4407');
const d = demo.sim;

console.log('band                 1.000 .. 1.250 s');
console.log(`single draw  min ${f(q(0))}  p05 ${f(q(0.05))}  p50 ${f(q(0.5))}  p95 ${f(q(0.95))}  max ${f(q(0.999))}`);
console.log(`single draw in band  ${pct(inBand, N)}   (${inBand}/${N})`);
console.log(`resample     mean ${f(attempts / 2000, 2)} attempts, max ${maxAttempts}`);
console.log(`accepted     min ${f(accepted[0])}  p50 ${f(accepted[Math.floor(accepted.length / 2)])}  max ${f(accepted[accepted.length - 1])}`);
console.log(`ablation extremes  all-best ${f(fast)}   all-worst ${f(slow)}`);
console.log(`energy closure  worst |ratio-1| = ${(worstClosure * 100).toFixed(2)}%  (seed ${worstSeed})`);
const e = demo.energy;
console.log(`  demo seed 4407: thrust ${f(e.in, 3)} J | KE ${f(e.parts.trans, 3)} spin ${f(e.parts.spin, 3)} drag ${f(e.parts.drag, 3)} roll ${f(e.parts.roll, 3)} scrub ${f(e.parts.scrub, 3)} | sum ${f(e.out, 3)} J | ratio ${f(e.ratio, 4)}`);
console.log('');
console.log(`demo car seed 4407`);
console.log(`  mass ${f(demo.p.massG, 2)} g  wheel ${f(demo.p.wheelMassG, 2)} g  r ${f(demo.p.wheelRadiusMM, 2)} mm`);
console.log(`  CdA ${f(demo.p.cdaMM2, 1)} mm^2  Crr ${f(demo.p.crr, 4)}  J ${f(demo.p.impulseNS, 4)} N.s  tau ${f(demo.p.tauMs, 1)} ms  toe ${f(demo.p.toeDeg, 2)} deg`);
console.log(`  effective mass ${f(d.effectiveMassKg * 1000, 2)} g  (wheels add ${pct(d.effectiveMassKg * 1000 - demo.p.massG, demo.p.massG)})`);
console.log(`  time ${f(d.time, 4)} s  finish ${f(d.finishSpeed, 2)} m/s  peak ${f(d.peakSpeed, 2)} m/s`);
console.log(`  peak thrust ${f(d.peakThrust, 2)} N  thrust over ${f(d.thrustDistance, 2)} m / ${(d.thrustTime * 1000).toFixed(0)} ms`);
console.log(`  contributions: ` + demo.contrib.factors.map((x) => `${x.label} ${(x.savedSeconds * 1000).toFixed(0)} ms`).join('  ') + `  | toe ${(demo.contrib.toeSaved * 1000).toFixed(0)} ms`);
console.log(`  windows: ` + demo.question.windows.map((w, i) => `[${w.lo.toFixed(2)}-${w.hi.toFixed(2)}]${i === demo.question.correctIndex ? '*' : ''}`).join('  '));
