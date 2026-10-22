import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page } = await open();
const r = await page.evaluate((S) => {
  const cv = window.__app.canvas;
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const lum = i => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const rows = [];
  for (let y = S.y0; y < S.y1; y += 8) {
    let ink = 0, tot = 0;
    for (let x = S.x0; x < S.x1; x += 4) { tot++; if (lum((y * cv.width + x) * 4) > 24) ink++; }
    rows.push({ y, pct: ink / tot });
  }
  const dead = [];
  let run = null;
  for (const rw of rows) {
    if (rw.pct < 0.008) { if (run === null) run = rw.y; }
    else { if (run !== null && rw.y - run >= 150) dead.push(run + '-' + rw.y); run = null; }
  }
  if (run !== null && S.y1 - run >= 150) dead.push(run + '-' + S.y1);
  return { dead };
}, SAFE);
await page.screenshot({ path: 'qa/visual.png' });
await browser.close();
console.log('安全区内 150px 空带: ' + (r.dead.length ? r.dead.join(', ') : '无'));
if (r.dead.length > 1) { console.error('空带过多: ' + r.dead.length); process.exit(1); }
console.log('视觉门禁通过');