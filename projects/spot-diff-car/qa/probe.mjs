/* Ink-density map. Unlike the luminance ramp, this counts how much of each cell
   is above the ink threshold, so thin 12px text on a near-black field still
   registers instead of averaging away to nothing. */
import { open, SAFE } from '../tests/platform.mjs';

const CELL = 40;
const { browser, page } = await open();

const out = await page.evaluate(({ CELL, SAFE }) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

  const rows = [];
  for (let y = 0; y < c.height; y += CELL) {
    let line = '';
    for (let x = 0; x < c.width; x += CELL) {
      let ink = 0, n = 0, maxX = -1;
      for (let yy = y; yy < Math.min(y + CELL, c.height); yy += 2) {
        for (let xx = x; xx < Math.min(x + CELL, c.width); xx += 2) {
          n++;
          if (lum((yy * c.width + xx) * 4) > 30) { ink++; if (xx > maxX) maxX = xx; }
        }
      }
      const f = ink / n;
      const idx = f === 0 ? 0 : Math.min(9, 1 + Math.floor(f * 8));
      line += ' .:-=+*#%@'[idx];
    }
    rows.push({ y, line });
  }

  // where does ink actually stop on each of the key bands?
  function span(y0, y1) {
    let minX = 1e9, maxX = -1, count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < c.width; x++) {
        if (lum((y * c.width + x) * 4) > 30) { count++; if (x < minX) minX = x; if (x > maxX) maxX = x; }
      }
    }
    return { minX: maxX < 0 ? null : minX, maxX: maxX < 0 ? null : maxX, px: count };
  }

  const bands = {
    header: span(0, 148),
    panelA: span(156, 528),
    panelB: span(548, 920),
    reveal: span(952, 1248),
    checklist: span(1284, 1780),
    footer: span(1840, 1920),
  };
  return { rows, bands };
}, { CELL, SAFE });

await browser.close();

for (const r of out.rows) console.log(String(r.y).padStart(4) + ' |' + r.line + '|');
console.log('\n--- ink span per band (lum>30) ---');
for (const [k, v] of Object.entries(out.bands)) {
  console.log(`  ${k.padEnd(10)} x ${String(v.minX).padStart(4)}..${String(v.maxX).padStart(4)}   ${v.px} px`);
}
