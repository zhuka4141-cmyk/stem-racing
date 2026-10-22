/* parity.mjs — do the two render backends agree?
 *
 * The promise is that Canvas2D is a full substitute for WebGPU, not a degraded
 * one. That is only true if the same op list lands in the same places, so this
 * compares the two exported frames pixel by pixel and reports the disagreement.
 *
 * Run: node tests/parity.mjs
 */
import { readPng } from './png.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const a = await readPng(join(ROOT, 'qa', 'export.png'));        // webgpu
const b = await readPng(join(ROOT, 'qa', 'export-2d.png'));     // canvas2d

if (a.width !== b.width || a.height !== b.height) {
  console.log(`FAIL size ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  process.exit(1);
}

let diff = 0, big = 0, total = 0;
let worst = 0, worstAt = null;
const TOL = 40;      // per-channel tolerance; AA resolve order legitimately differs

for (let y = 0; y < a.height; y++) {
  for (let x = 0; x < a.width; x++) {
    const pa = a.pixel(x, y), pb = b.pixel(x, y);
    const d = Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2]));
    total++;
    if (d > 2) diff++;
    if (d > TOL) { big++; if (d > worst) { worst = d; worstAt = [x, y, [...pa].join(','), [...pb].join(',')]; } }
  }
}

const pct = (n) => (100 * n / total).toFixed(3) + '%';
console.log(`webgpu  ${a.width}x${a.height} ${a.bytes} B`);
console.log(`canvas2d ${b.width}x${b.height} ${b.bytes} B`);
console.log(`pixels differing >2   : ${diff}  (${pct(diff)})`);
console.log(`pixels differing >${TOL}  : ${big}  (${pct(big)})`);
if (worstAt) console.log(`worst ${worst} at ${worstAt[0]},${worstAt[1]}  gpu=${worstAt[2]}  2d=${worstAt[3]}`);

// A tiny fraction of edge pixels may resolve differently; a structural
// disagreement (missing shape, wrong position) would blow far past this.
const ok = big / total < 0.005;
console.log(ok ? '\nPARITY OK' : '\nPARITY FAIL — backends disagree structurally');
process.exit(ok ? 0 : 1);
