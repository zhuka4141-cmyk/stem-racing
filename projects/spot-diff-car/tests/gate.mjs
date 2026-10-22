/* 硬门禁。像素断言照抄 accel-curve-lab：安全区内墨量 ≥8%、色彩 ≥48，
   空壳一定过不去。下面另外加了几条，都是被真实 bug 咬过才加的，不是凑数。

   1. 自检
   2. 两种比例都能导出真 PNG
   3. 安全区墨量 / 色数（核心，不许放宽）
   4. 点遍 12 个热点，6 处差异必须全部点得出来——否则这是静态图，不是找不同
   5. 点空白必须只记一次失误，不许误判成命中
   6. 纸色结果带上的文字必须真的画出来——曾经整条页脚是浅色压在浅底上，
      一个字看不见，而像素密度断言完全测不出来
   7. 结果带以外不许有内容越过页边距
   8. 没有运行时报错 */

import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

/* 1. 自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st || !st.ok) fails.push('selfTest: ' + (st ? st.errs.join(', ') : '没有返回'));

/* 2. 导出真 PNG */
const v = await page.evaluate(async () => await window.__app.exportPNG());
const c = await page.evaluate(async () => await window.__app.exportCover());
if (!(v > 4096)) fails.push(`竖版导出字节 ${v} B`);
if (!(c > 4096)) fails.push(`封面导出字节 ${c} B`);

/* 3. 像素 —— 与 accel-curve-lab 逐字一致 */
const px = await page.evaluate((S) => {
  const cv = window.__app.canvas;
  if (!cv) return { err: '没有 window.__app.canvas' };
  const ctx = cv.getContext('2d');
  if (!ctx) return { err: '不是 2D 上下文，无法量像素' };
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let ink = 0, tot = 0;
  const cols = new Set();
  for (let y = S.y0; y < S.y1; y += 3) {
    for (let x = S.x0; x < S.x1; x += 3) {
      const i = (y * cv.width + x) * 4;
      tot++;
      if (lum(i) > 24) {
        ink++;
        cols.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
      }
    }
  }
  return { inkPct: +((ink / tot) * 100).toFixed(2), colors: cols.size };
}, SAFE);

if (px.err) {
  fails.push(px.err);
} else {
  if (px.inkPct < 8) fails.push(`安全区墨量 ${px.inkPct}%，下限 8%（空壳通常 1-2%）`);
  if (px.colors < 48) fails.push(`色彩只有 ${px.colors} 种，下限 48（空壳 < 20）`);
}

/* 4/5. 交互：六处差异必须点得出来，点空白不许算命中 */
const hs = await page.evaluate(() => window.__app.hotspots());
const box = await page.evaluate(() => {
  const r = window.__app.canvas.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
if (!hs || hs.length !== 12) {
  fails.push(`热点 ${hs ? hs.length : 0} 个，期望 12（6 处差异 × 两台车）`);
} else {
  await page.evaluate(() => window.__app.set('reset'));
  for (const h of hs) {
    await page.mouse.click(box.x + (h.x / 1080) * box.w, box.y + (h.y / 1920) * box.h);
  }
  const after = await page.evaluate(() => window.__app.getState());
  if (after.found.length !== 6) {
    fails.push(`遍历点击后只找到 ${after.found.length} / 6：${after.found.join(',')}`);
  }
  if (after.misses !== 0) fails.push(`点热点却记了 ${after.misses} 次失误`);

  await page.evaluate(() => window.__app.set('reset'));
  await page.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.05);
  const miss = await page.evaluate(() => window.__app.getState());
  if (miss.found.length !== 0) fails.push('点空白被当成了命中');
  if (miss.misses !== 1) fails.push(`点空白失误计数 ${miss.misses}，期望 1`);
}

/* 6. 纸色结果带上的文字必须真的可见。分两块量：正文，和页脚那一行。
   页脚曾经是浅色压在浅色底上，一个字都看不见，整带像素密度断言完全测不出来。 */
const bandDark = await page.evaluate(() => {
  const cv = window.__app.canvas;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const count = (y0, y1, x0, x1) => {
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (lum((y * cv.width + x) * 4) < 150) n++;
    }
    return n;
  };
  return { text: count(1626, 1920, 56, 1024), colophon: count(1890, 1918, 56, 1024) };
});
if (bandDark.text < 6000) fails.push(`结果带正文只有 ${bandDark.text} 个深色像素，基本空白`);
if (bandDark.colophon < 150) fails.push(`结果带页脚只有 ${bandDark.colophon} 个深色像素——浅色字压在浅底上看不见`);

/* 7. 结果带以外不许越界 */
const bleed = await page.evaluate(() => {
  const cv = window.__app.canvas;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  let minX = 1e9, maxX = -1;
  for (let y = 0; y < 1620; y++) {
    for (let x = 0; x < cv.width; x++) {
      if (lum((y * cv.width + x) * 4) > 30) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return { minX, maxX };
});
if (bleed.minX < 55) fails.push(`有内容画到 x=${bleed.minX}，越过左边距 56`);
if (bleed.maxX > 1025) fails.push(`有内容画到 x=${bleed.maxX}，越过右边距 1024`);

/* 8. 运行时报错 */
if (errors.length) fails.push(...errors.slice(0, 5));

/* 出图：先拍全找到的样子，再复位拍初始态 */
await page.evaluate(() => window.__app.revealAll());
await page.waitForTimeout(150);
await page.screenshot({ path: 'qa/found.png' });
await page.evaluate(() => window.__app.set('reset'));
await page.waitForTimeout(150);
await page.screenshot({ path: 'qa/vertical.png' });
await browser.close();

if (fails.length) {
  console.error('GATE FAIL');
  fails.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(
  `GATE OK  |  竖版 ${(v / 1024).toFixed(0)}KB  封面 ${(c / 1024).toFixed(0)}KB` +
  `  |  墨量 ${px.inkPct}%  ${px.colors} 色`,
);
