/* 字符密度图：把画布压成 ASCII，用眼睛确认画面被填满、层次分得开。
   亮度 → 字符，40px 一格，左侧标 y 坐标，方便和布局带对齐。 */
import { open } from './platform.mjs';

const { browser, page, meta } = await open();

const art = await page.evaluate(({ safe }) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const CELL = 30, ramp = ' .:-=+*#%@';
  const out = [];
  for (let y = 0; y < c.height; y += CELL) {
    let line = '';
    for (let x = 0; x < c.width; x += CELL) {
      let s = 0, n = 0;
      for (let yy = y; yy < Math.min(y + CELL, c.height); yy += 3)
        for (let xx = x; xx < Math.min(x + CELL, c.width); xx += 3) {
          const i = (yy * c.width + xx) * 4;
          s += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      const l = s / n;
      line += ramp[Math.min(9, Math.max(0, Math.round(l / 255 * 9 * 2.2)))];
    }
    const mark = y < safe.y0 ? ' ^上沿' : (y + CELL > safe.y1 ? ' v下沿' : '');
    out.push(String(y).padStart(4) + '|' + line + '|' + mark);
  }
  return out.join('\n');
}, { safe: meta.safe });

await browser.close();
console.log(`画布 ${meta.w}×${meta.h}  安全区 x ${meta.safe.x0}-${meta.safe.x1} y ${meta.safe.y0}-${meta.safe.y1}`);
console.log(art);
