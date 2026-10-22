/* 画面质量量化检查 —— 无法看图，就用像素统计代替
   判定标准按「真实缺陷」设，不按「每个字都要填满」设 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const URL = pathToFileURL(join(process.cwd(), 'index.html')).href;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const r = await page.evaluate((SAFE) => {
  const c = window.__windtunnel.canvas;
  const ctx = c.getContext('2d');
  const { width: W, height: H } = c;
  const img = ctx.getImageData(0, 0, W, H).data;
  const lum = i => 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];

  const band = (y0, y1, label) => {
    let ink = 0, tot = 0;
    for (let y = y0; y < y1; y += 2)
      for (let x = 0; x < W; x += 2) {
        tot++;
        if (lum((y * W + x) * 4) > 24) ink++;
      }
    return { label, inkPct: +(ink / tot * 100).toFixed(2) };
  };

  // 真死区 = 连续 150px 内几乎没有任何内容。40px 空隙是字间呼吸，不算缺陷。
  const rows = [];
  for (let y = SAFE.y0; y < SAFE.y1; y += 10) {
    let ink = 0, tot = 0;
    for (let yy = y; yy < Math.min(y + 10, SAFE.y1); yy += 2)
      for (let x = SAFE.x0; x < SAFE.x1; x += 6) {
        tot++;
        if (lum((yy * W + x) * 4) > 24) ink++;
      }
    rows.push({ y, pct: ink / tot });
  }
  const dead = [];
  let run = null;
  for (const rw of rows) {
    if (rw.pct < 0.008) { if (run === null) run = rw.y; }
    else { if (run !== null && rw.y - run >= 150) dead.push(`${run}-${rw.y}`); run = null; }
  }
  if (run !== null && SAFE.y1 - run >= 150) dead.push(`${run}-${SAFE.y1}`);

  let gInk = 0, gTot = 0;
  for (let y = SAFE.y0; y < SAFE.y1; y += 3)
    for (let x = SAFE.x0; x < SAFE.x1; x += 3) {
      gTot++;
      if (lum((y * W + x) * 4) > 24) gInk++;
    }

  const colors = new Set();
  for (let i = 0; i < img.length; i += 4 * 331) colors.add(`${img[i]},${img[i + 1]},${img[i + 2]}`);

  return {
    bands: [
      band(240, 500, '标题区'),
      band(500, 700, '副标题+参数条'),
      band(700, 1120, '3D 场景'),
      band(1120, 1400, '指标区'),
      band(1400, 1480, '品牌条'),
    ],
    dead,
    safeInkPct: +(gInk / gTot * 100).toFixed(2),
    uniqueColors: colors.size,
  };
}, SAFE);

await browser.close();

console.log('=== 区域墨量 ===');
for (const b of r.bands) {
  const v = b.inkPct < 0.5 ? '空' : b.inkPct < 3 ? '稀' : '正常';
  console.log(`  ${b.label.padEnd(12)} ${String(b.inkPct).padStart(6)}%  ${v}`);
}
console.log('=== 安全区内连续 150px 死区 ===');
console.log(r.dead.length ? '  ' + r.dead.join(', ') : '  无');
console.log('=== 安全区整体墨量 ===');
console.log(`  ${r.safeInkPct}%` + (r.safeInkPct < 8 ? '  (过低)' : '  (合格)'));
console.log('=== 色彩层次 ===');
console.log(`  采样唯一色 ${r.uniqueColors} 种`);

const fail = [];
if (r.dead.length > 1) fail.push(`死区 ${r.dead.length} 处`);
if (r.safeInkPct < 8) fail.push(`墨量过低 ${r.safeInkPct}%`);
if (r.uniqueColors < 80) fail.push(`色彩单薄 ${r.uniqueColors}`);
for (const b of r.bands) if (b.inkPct < 0.5) fail.push(`${b.label} 空`);

if (fail.length) { console.error('\n画质问题: ' + fail.join(' / ')); process.exit(1); }
console.log('\n画质检查通过');
