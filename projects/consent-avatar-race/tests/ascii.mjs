/* 把画布渲染成字符密度图 —— 没有视觉模型也能读版面
   每个字符 = 40x40 像素块的墨量，越亮字符越密。
   跑法：node tests/ascii.mjs */

import { open, SAFE } from './platform.mjs';

const { browser, page } = await open();

const art = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = c;
  const img = ctx.getImageData(0, 0, W, H).data;
  const CELL = 40;
  const ramp = ' .:-=+*#%@';
  const lines = [];

  for (let y = 0; y < H; y += CELL) {
    let line = '';
    for (let x = 0; x < W; x += CELL) {
      let sum = 0, n = 0;
      for (let yy = y; yy < Math.min(y + CELL, H); yy += 4) {
        for (let xx = x; xx < Math.min(x + CELL, W); xx += 4) {
          const i = (yy * W + xx) * 4;
          sum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      }
      const lum = sum / n;
      const idx = Math.min(ramp.length - 1, Math.max(0, Math.round(lum / 255 * (ramp.length - 1) * 2.2)));
      line += ramp[idx];
    }
    const mark = (y < SAFE.y0) ? '  顶部死区' : (y >= SAFE.y1 ? '  IG 说明会盖' : '');
    lines.push(String(y).padStart(4) + ' |' + line + '|' + mark);
  }
  return lines.join('\n');
}, SAFE);

await browser.close();
console.log('\n      ' + ' '.repeat(9) + 'x=60' + ' '.repeat(12) + 'x=930');
console.log(art);
