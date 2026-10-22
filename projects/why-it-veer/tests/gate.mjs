import { mkdirSync, readFileSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors, external } = await open();
const fails = [];

/* 1. 页面自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st || !st.ok) fails.push('selfTest: ' + (st ? st.errs.join(' / ') : 'null'));

/* 2. 导出两条路都必须出真 PNG */
const v = await page.evaluate(() => window.__app.exportPNG());
const c = await page.evaluate(() => window.__app.exportCover());
if (!(v > 4096)) fails.push(`竖版导出于 ${v} B`);
if (!(c > 4096)) fails.push(`封面导出于 ${c} B`);

const magic = await page.evaluate(() => {
  const u = window.__app.canvas.toDataURL('image/png');
  return { head: u.slice(0, 22), bytes: [0x89, 0x50, 0x4e, 0x47] };
});
if (magic.head !== 'data:image/png;base64,') fails.push('导出不是 PNG: ' + magic.head);

/* 3. 直接量像素：安全区墨量与色彩数 */
const px = await page.evaluate((S) => {
  const cv = window.__app.canvas;
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const lum = i => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let ink = 0, tot = 0;
  const cols = new Set();
  for (let y = S.y0; y < S.y1; y += 3) {
    for (let x = S.x0; x < S.x1; x += 3) {
      const i = (y * cv.width + x) * 4;
      tot++;
      if (lum(i) > 24) { ink++; cols.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)); }
    }
  }
  return { inkPct: +((ink / tot) * 100).toFixed(2), colours: cols.size };
}, SAFE);
if (px.inkPct < 8) fails.push(`安全区墨量不足 ${px.inkPct}% (要 >=8%)`);
if (px.colours < 48) fails.push(`安全区色彩不够 ${px.colours} 种 (要 >=48)`);

/* 4. 物理断言，数字一律从 out/physics.json 读，页面自己不能自说自话 */
const ph = JSON.parse(readFileSync('out/physics.json', 'utf8'));
const t20 = ph.run.run_time_s, vEnd = ph.run.exit_speed_ms;
const dNow = ph.cm_offset_mm, dCrit = ph.critical_offset_mm;
if (!(t20 >= 1.0 && t20 <= 1.25)) fails.push(`20 m 成绩 ${t20} s 不在 1.0-1.25 s`);
if (!(vEnd >= 15 && vEnd <= 22)) fails.push(`末速 ${vEnd} m/s 不在 15-22 m/s`);
const alertFlag = dNow > dCrit;
if (!alertFlag) fails.push(`质心偏移 ${dNow} mm 未超临界 ${dCrit} mm，报警标志应为 true`);

const pageNum = await page.evaluate(() => window.__app.data.num);
if (Math.abs(pageNum.t20 - t20) > 1e-3) fails.push(`页面 t20 ${pageNum.t20} 与 physics.json ${t20} 不一致`);
if (Math.abs(pageNum.v - vEnd) > 1e-2) fails.push(`页面末速 ${pageNum.v} 与 physics.json ${vEnd} 不一致`);

/* 5. 无 console.error / pageerror / 外部请求 */
if (errors.length) fails.push(...errors.slice(0, 5));
if (external.length) fails.push('外部请求: ' + external.slice(0, 3).join(', '));

await page.screenshot({ path: 'qa/vertical.png' });
await browser.close();

if (fails.length) {
  console.error('GATE FAIL');
  fails.forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log(`GATE OK  |  竖版 ${(v / 1024).toFixed(1)} KB  |  封面 ${(c / 1024).toFixed(1)} KB  |  安全区墨量 ${px.inkPct}%  色彩 ${px.colours} 种  |  20 m ${t20} s  末速 ${vEnd} m/s  偏移 ${dNow} mm > 临界 ${dCrit} mm  |  console 0  外部请求 0`);