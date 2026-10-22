/* 把导出的卡片渲染成字符密度图 —— 没有视觉模型时用它读布局：
   每个字符 = 40x40 像素块的墨量，能直接看出死区、对齐和块的边界。
   跑法：node tests/ascii.mjs [4:5|9:16] */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const EXE = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const URL_TARGET = pathToFileURL(path.join(process.cwd(), 'index.html')).href;
const variant = process.argv[2] || '4:5';

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(URL_TARGET, { waitUntil: 'load' });
await page.waitForFunction(() => window.__teamcard && window.__teamcard.ready(), null, { timeout: 15000 });

const art = await page.evaluate(async (v) => {
  const blob = await window.__teamcard.exportPng(v);
  const bmp = await createImageBitmap(blob);
  const W = bmp.width, H = bmp.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.drawImage(bmp, 0, 0);
  const img = cx.getImageData(0, 0, W, H).data;

  const CELL = 30;
  const cols = Math.floor(W / CELL), rows = Math.floor(H / CELL);
  const ramp = ' .:-=+*#%@';
  const lines = [];

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      let sum = 0, n = 0;
      for (let y = r * CELL; y < (r + 1) * CELL; y += 5) {
        for (let x = c * CELL; x < (c + 1) * CELL; x += 5) {
          const i = (y * W + x) * 4;
          sum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      }
      const lum = sum / n;
      const idx = Math.min(ramp.length - 1, Math.max(0, Math.round(lum / 255 * (ramp.length - 1))));
      line += ramp[idx];
    }
    lines.push(String(r * CELL).padStart(4) + ' |' + line + '|');
  }
  return { lines: lines.join('\n'), W, H };
}, variant);

await browser.close();
console.log(`\n  ${variant}  ${art.W}x${art.H}   (cell=30px, space=black  @=paper)`);
console.log(art.lines);
