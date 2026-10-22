/* 把画布渲染成字符密度图 —— 看不到图的时候用这个直接读版面。
   一个字符 = 40×40 像素块的墨量。左边是 y 像素，右边标注 IG 会盖住的区域。
   跑法：node tests/ascii.mjs */
import { open, SAFE } from './probe.mjs';

const { browser, page } = await open();
// 停在中间某一帧，别让它在动
await page.evaluate((h) => { window[h].setPaused(true); window[h].setProgress(0.42); }, '__track');
await page.waitForTimeout(200);

const art = await page.evaluate((SAFE) => {
  const c = window.__track.canvas;
  const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const CELL = 40;
  const ramp = ' .:-=+*#%@';
  const cols = Math.floor(c.width / CELL);
  const rows = Math.floor(c.height / CELL);
  const lines = [];

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      let sum = 0, n = 0;
      for (let y = r * CELL; y < (r + 1) * CELL; y += 4) {
        for (let x = col * CELL; x < (col + 1) * CELL; x += 4) {
          const i = (y * c.width + x) * 4;
          sum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      }
      const lum = sum / n;
      const idx = Math.min(ramp.length - 1, Math.max(0, Math.round((lum / 255) * (ramp.length - 1) * 2.2)));
      line += ramp[idx];
    }
    const yPx = r * CELL;
    const mark = yPx + CELL <= SAFE.y0 ? '  ↑ 顶 UI 会盖'
      : (yPx >= SAFE.y1 ? '  ← IG 说明会盖' : '');
    lines.push(String(yPx).padStart(4) + ' |' + line + '|' + mark);
  }

  // 横向占用率：每列里有多少行是有东西的。用来看左右是否失衡。
  const occ = [];
  for (let col = 0; col < cols; col++) {
    let hit = 0, tot = 0;
    for (let y = SAFE.y0; y < SAFE.y1; y += 8) {
      let sum = 0, n = 0;
      for (let x = col * CELL; x < (col + 1) * CELL; x += 8) {
        const i = (y * c.width + x) * 4;
        sum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
        n++;
      }
      tot++;
      if (sum / n > 22) hit++;
    }
    occ.push(' .:-=+*#%@'[Math.min(9, Math.round((hit / tot) * 9))]);
  }
  lines.push('');
  lines.push('   列占用 |' + occ.join('') + '|');
  return lines.join('\n');
}, SAFE);

await browser.close();
console.log('\n        ' + ' '.repeat(11) + 'x=60 安全区 930' + ' '.repeat(11));
console.log(art);
