/* 画质：安全区内不许有 150px 连续死区，整体墨量 ≥ 8%
   "墨量" = 亮度 > 24 的采样点占比。深底作品里它直接反映排版有没有把画面填住。 */
import { open } from './platform.mjs';

const { browser, page, meta } = await open();

const r = await page.evaluate(({ safe }) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = (i) => 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];

  const rows = [];
  for (let y = safe.y0; y < safe.y1; y += 10) {
    let ink = 0, tot = 0;
    for (let yy = y; yy < Math.min(y + 10, safe.y1); yy += 2)
      for (let x = safe.x0; x < safe.x1; x += 6) { tot++; if (lum((yy * c.width + x) * 4) > 24) ink++; }
    rows.push({ y, pct: ink / tot });
  }

  const dead = []; let run = null;
  for (const rw of rows) {
    if (rw.pct < 0.008) { if (run === null) run = rw.y; }
    else { if (run !== null && rw.y - run >= 150) dead.push(run + '-' + rw.y); run = null; }
  }
  if (run !== null && safe.y1 - run >= 150) dead.push(run + '-' + safe.y1);

  let gI = 0, gT = 0;
  for (let y = safe.y0; y < safe.y1; y += 3)
    for (let x = safe.x0; x < safe.x1; x += 3) { gT++; if (lum((y * c.width + x) * 4) > 24) gI++; }
  return { dead, safeInkPct: +(gI / gT * 100).toFixed(2) };
}, { safe: meta.safe });

await browser.close();

console.log('安全区 ' + `x ${meta.safe.x0}-${meta.safe.x1} y ${meta.safe.y0}-${meta.safe.y1}`);
console.log('150px 连续死区: ' + (r.dead.length ? r.dead.join(', ') : '无'));
console.log('安全区整体墨量: ' + r.safeInkPct + '%');

const fail = [];
if (r.dead.length > 1) fail.push('死区 ' + r.dead.length + ' 处');
if (r.safeInkPct < 8) fail.push('墨量过低 ' + r.safeInkPct + '%');
if (fail.length) { console.error('画质不达标: ' + fail.join(' / ')); process.exit(1); }
console.log('画质检查通过');
