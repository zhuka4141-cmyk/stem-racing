import { open, SAFE } from './platform.mjs';

const { browser, page } = await open();
const art = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const CELL = 40, ramp = ' .:-=+*#%@';
  const out = [];
  for (let y = 0; y < c.height; y += CELL) {
    let line = '';
    for (let x = 0; x < c.width; x += CELL) {
      let s = 0, n = 0;
      for (let yy = y; yy < y + CELL; yy += 4)
        for (let xx = x; xx < x + CELL; xx += 4) {
          const i = (yy * c.width + xx) * 4;
          s += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      const l = s / n;
      line += ramp[Math.min(9, Math.max(0, Math.round(l / 255 * 9 * 2.2)))];
    }
    const mark = y <= SAFE.y0 ? '  顶UI会盖' : (y >= SAFE.y1 ? '  ← IG说明会盖' : '');
    out.push(String(y).padStart(4) + ' |' + line + '|' + mark);
  }
  return out.join('\n');
}, SAFE);
await browser.close();
console.log(art);
