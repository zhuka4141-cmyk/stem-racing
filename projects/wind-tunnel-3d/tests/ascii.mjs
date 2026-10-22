/* 把画布渲染成字符密度图 —— 在无法看图的情况下直接读布局
   每个字符 = 40x40 像素块的墨量
   跑法：node tests/ascii.mjs */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const URL = pathToFileURL(join(process.cwd(), 'index.html')).href;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const art = await page.evaluate(() => {
  const c = window.__windtunnel.canvas;
  const ctx = c.getContext('2d');
  const { width: W, height: H } = c;
  const img = ctx.getImageData(0, 0, W, H).data;
  const CELL = 40;
  const cols = Math.floor(W / CELL), rows = Math.floor(H / CELL);
  const ramp = ' .:-=+*#%@';
  const lines = [];

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      let sum = 0, n = 0;
      for (let y = r * CELL; y < (r + 1) * CELL; y += 4) {
        for (let x = col * CELL; x < (col + 1) * CELL; x += 4) {
          const i = (y * W + x) * 4;
          sum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      }
      const lum = sum / n;
      const idx = Math.min(ramp.length - 1, Math.max(0, Math.round(lum / 255 * (ramp.length - 1) * 2.2)));
      line += ramp[idx];
    }
    const yPx = r * CELL;
    const mark = (yPx <= 240) ? '  顶UI会盖' : (yPx >= 1480 ? '  ← IG说明会盖' : '');
    lines.push(String(yPx).padStart(4) + ' |' + line + '|' + mark);
  }
  return lines.join('\n');
});

await browser.close();
console.log('\n      ' + ' '.repeat(13) + 'x=60 安全区 930' + ' '.repeat(12));
console.log(art);
