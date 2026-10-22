/* ascii.mjs — coarse luminance map of a PNG, for checking composition without
 * an image viewer. Wide cells are averaged, tall cells sampled, so a 1080x1920
 * frame lands in a terminal in one screen.
 *
 * Run: node tests/ascii.mjs qa/export.png [cols] [rows]
 */
import { readPng } from './png.mjs';

const RAMP = ' .:-=+*#%@';

const path = process.argv[2] || 'qa/export.png';
const cols = Number(process.argv[3] || 54);
const rows = Number(process.argv[4] || 48);

const img = await readPng(path);
const cw = img.width / cols;
const ch = img.height / rows;

const lines = [];
for (let ry = 0; ry < rows; ry++) {
  let line = '';
  for (let rx = 0; rx < cols; rx++) {
    const x0 = Math.floor(rx * cw), x1 = Math.min(img.width, Math.ceil((rx + 1) * cw));
    const y0 = Math.floor(ry * ch), y1 = Math.min(img.height, Math.ceil((ry + 1) * ch));
    let sum = 0, n = 0, max = 0;
    const stepX = Math.max(1, Math.floor((x1 - x0) / 6));
    const stepY = Math.max(1, Math.floor((y1 - y0) / 6));
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
        const p = img.pixel(x, y);
        const l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
        sum += l; n++;
        if (l > max) max = l;
      }
    }
    const avg = sum / n;
    // bias toward the peak so thin hairlines and text still register
    const v = Math.min(1, (avg * 0.45 + max * 0.55) / 255);
    line += RAMP[Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1)))];
  }
  lines.push(line);
}

// row index -> source y, so the reader can map a band back to the layout
const guide = [];
for (let ry = 0; ry < rows; ry += 4) guide.push(`y=${Math.round(ry * ch)}`);

console.log(`${path}  ${img.width}x${img.height}  -> ${cols}x${rows}`);
console.log('   ' + lines.join('\n   '));
console.log('rows top->bottom, cell height ' + ch.toFixed(1) + ' px');
console.log('  ' + guide.join('  '));
