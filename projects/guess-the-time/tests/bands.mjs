/* bands.mjs — objective layout probe: for each horizontal band, the bounding box
 * of ink and how much of the band it covers. Catches "the car did not draw" and
 * "text fell outside the grid" without needing a picture.
 *
 * Run: node tests/bands.mjs qa/export.png
 */
import { readPng } from './png.mjs';

const BG = [11, 11, 12];
const THRESH = 26;   // luminance delta that counts as ink

const path = process.argv[2] || 'qa/export.png';
const img = await readPng(path);

function ink(x, y) {
  const p = img.pixel(x, y);
  return Math.abs(p[0] - BG[0]) + Math.abs(p[1] - BG[1]) + Math.abs(p[2] - BG[2]) > THRESH;
}

function scan(y0, y1) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < img.width; x++) {
      if (ink(x, y)) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const area = (y1 - y0) * img.width;
  return { minX, maxX, minY, maxY, count, cov: count / area };
}

const TOL = { ladder: 12, belowSafe: 0 };
const bands = [
  ['header', 240, 320],
  ['title', 326, 486],
  ['blockA', 486, 812],
  ['ladder', 830, 1112],
  ['lower', 1140, 1482],
  ['below-safe', 1482, 1590]
];

console.log(`${path}  ${img.width}x${img.height}`);
let bad = 0;
for (const [name, a, b] of bands) {
  const r = scan(a, b);
  const empty = r.maxX < 0;
  const txt = empty
    ? 'EMPTY'
    : `x ${String(r.minX).padStart(4)}..${String(r.maxX).padStart(4)}  y ${String(r.minY).padStart(4)}..${String(r.maxY).padStart(4)}  cov ${(r.cov * 100).toFixed(1)}%`;
  console.log(`  ${name.padEnd(11)} ${txt}`);
  if (empty && name !== 'below-safe') bad++;
  const tol = TOL[name] || 0;
  if (!empty && (r.minX < 60 - tol || r.maxX > 930 + tol)) bad++;
  if (name === 'below-safe' && !empty) bad++;
}

// horizontal ink profile inside block A: shows whether the car/bars sit centred
const prof = [];
for (let x = 0; x < img.width; x += 54) {
  let c = 0;
  for (let y = 486; y < 812; y++) if (ink(x, y)) c++;
  prof.push(c > 24 ? '#' : c > 6 ? '+' : c > 0 ? '.' : ' ');
}
console.log('  blockA cols   |' + prof.join('') + '|');

console.log(bad === 0 ? '\nBANDS OK' : `\nBANDS PROBLEM (${bad})`);
process.exit(bad === 0 ? 0 : 1);
