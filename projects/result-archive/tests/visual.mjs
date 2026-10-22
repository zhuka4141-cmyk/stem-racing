/* 版面体检 —— 安全区内不许有大片空白，墨量要够
   安全区 = x 60–930 / y 240–1480（IG Reels 的可视区）
   跑法：node tests/visual.mjs */

import { open, SAFE } from './platform.mjs';

const { browser, page } = await open();

const r = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = i => 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];

  // 逐 10px 水平带统计墨量，找连续空带
  const rows = [];
  for (let y = SAFE.y0; y < SAFE.y1; y += 10) {
    let ink = 0, tot = 0;
    for (let yy = y; yy < Math.min(y + 10, SAFE.y1); yy += 2) {
      for (let x = SAFE.x0; x < SAFE.x1; x += 6) {
        tot++;
        if (lum((yy * c.width + x) * 4) > 24) ink++;
      }
    }
    rows.push({ y, pct: ink / tot });
  }

  const dead = [];
  let run = null;
  for (const rw of rows) {
    if (rw.pct < 0.008) { if (run === null) run = rw.y; }
    else { if (run !== null && rw.y - run >= 150) dead.push(run + '-' + rw.y); run = null; }
  }
  if (run !== null && SAFE.y1 - run >= 150) dead.push(run + '-' + SAFE.y1);

  let gI = 0, gT = 0;
  for (let y = SAFE.y0; y < SAFE.y1; y += 3) {
    for (let x = SAFE.x0; x < SAFE.x1; x += 3) {
      gT++;
      if (lum((y * c.width + x) * 4) > 24) gI++;
    }
  }

  // 顺便报一下最空的 5 条带，调版面时看这个比看总墨量有用
  const emptiest = [...rows].sort((a, b) => a.pct - b.pct).slice(0, 5)
    .map(rw => `${rw.y}:${(rw.pct * 100).toFixed(1)}%`);

  return { dead, safeInkPct: +(gI / gT * 100).toFixed(2), emptiest };
}, SAFE);

await browser.close();

console.log('安全区内 150px 死区: ' + (r.dead.length ? r.dead.join(', ') : '无'));
console.log('安全区整体墨量: ' + r.safeInkPct + '%');
console.log('最空的 5 条带: ' + r.emptiest.join('  '));

const fail = [];
if (r.dead.length > 1) fail.push('死区 ' + r.dead.length + ' 处');
if (r.safeInkPct < 8) fail.push('墨量过低 ' + r.safeInkPct + '%');
if (fail.length) { console.error('画质问题: ' + fail.join(' / ')); process.exit(1); }
console.log('画质检查通过');
