/* Exact vertical extents of every drawn element, so layout collisions get found
   by measurement instead of by squinting at a density map. */
import { open } from '../tests/platform.mjs';

const { browser, page, errors } = await open();

const out = await page.evaluate(() => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

  /* ink run per row, split into horizontal segments so a car and a label on the
     same row are reported separately */
  const rows = [];
  for (let y = 0; y < c.height; y++) {
    let first = -1, last = -1, n = 0;
    for (let x = 0; x < c.width; x++) {
      if (lum((y * c.width + x) * 4) > 30) {
        n++;
        if (first < 0) first = x;
        last = x;
      }
    }
    rows.push({ y, first, last, n });
  }

  /* contiguous non-empty row runs = drawn bands */
  const bands = [];
  let cur = null;
  for (const r of rows) {
    if (r.n > 0) {
      if (!cur) cur = { y0: r.y, y1: r.y, first: r.first, last: r.last, px: 0 };
      cur.y1 = r.y;
      cur.first = Math.min(cur.first, r.first);
      cur.last = Math.max(cur.last, r.last);
      cur.px += r.n;
    } else if (cur) {
      if (cur.y1 - cur.y0 >= 2) bands.push(cur);
      cur = null;
    }
  }
  if (cur) bands.push(cur);

  const empty = [];
  let run = null;
  for (const r of rows) {
    if (r.n === 0) {
      if (!run) run = { y0: r.y, y1: r.y };
      run.y1 = r.y;
    } else if (run) {
      if (run.y1 - run.y0 >= 20) empty.push(run);
      run = null;
    }
  }
  if (run && run.y1 - run.y0 >= 20) empty.push(run);

  return { bands, empty };
});

await browser.close();
if (errors.length) console.log('errors:', errors);

console.log('drawn bands (y0..y1  height  x-range  ink px)');
for (const b of out.bands) {
  console.log(`  ${String(b.y0).padStart(4)}..${String(b.y1).padStart(4)}  h${String(b.y1 - b.y0 + 1).padStart(4)}   x ${String(b.first).padStart(4)}..${String(b.last).padStart(4)}   ${b.px}`);
}
console.log('\nempty gaps >= 20px');
for (const e of out.empty) {
  console.log(`  ${String(e.y0).padStart(4)}..${String(e.y1).padStart(4)}   ${e.y1 - e.y0 + 1} px`);
}
