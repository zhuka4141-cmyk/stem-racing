/* 把画布本身存成 PNG，用来人眼过一遍版面。
   走的是和导出完全一样的像素：canvas.toDataURL()。
   跑法：node tests/preview.mjs [进度...]   默认存 0 / 0.42 / 1 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { open, HOOK } from './probe.mjs';

const stops = process.argv.slice(2).map(Number);
const list = stops.length ? stops : [0, 0.42, 1];

mkdirSync(join(process.cwd(), 'qa'), { recursive: true });
const { browser, page } = await open();
await page.evaluate((h) => window[h].setPaused(true), HOOK);

for (const p of list) {
  await page.evaluate(({ h, p }) => window[h].setProgress(p), { h: HOOK, p });
  await page.waitForTimeout(150);
  const url = await page.evaluate((h) => window[h].canvas.toDataURL('image/png'), HOOK);
  const file = join(process.cwd(), 'qa', `stage-${String(p).replace('.', '_')}.png`);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`qa/stage-${String(p).replace('.', '_')}.png`);
}

await browser.close();
