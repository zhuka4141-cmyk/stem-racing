/* head-to-head 门禁
 * 1. selfTest 必须全绿
 * 2. 两次导出必须真出 PNG 字节
 * 3. 安全区墨量 ≥ 8%、色彩层次 ≥ 48 种（空壳通常 1.4% / 16 色）
 * 4. 本项目专属物理断言：同参数成绩相等、质量方向正确、冲线斜率向下、曲线采样数正确
 */
import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

/* 1. 自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st.ok) fails.push('selfTest: ' + st.errs.join(', '));

/* 2. 导出 */
const v = await page.evaluate(async () => await window.__app.exportPNG());
const c = await page.evaluate(async () => await window.__app.exportCover());
if (!(v > 4096)) fails.push(`竖版导出过小 ${v} B`);
if (!(c > 4096)) fails.push(`封面导出过小 ${c} B`);

/* 3. 本项目物理断言 */
const phy = await page.evaluate(() => {
  const app = window.__app;
  const out = {};

  out.gridN = app.getMetrics().gridN;

  app.finish();
  out.finished = app.getMetrics().finished;

  const def = app.getState();
  const defA = { ...def.A };
  const defB = { ...def.B };
  out.tADefault = app.getMetrics().tA;

  // 同参数：B 设成和 A 完全一样，成绩必须一模一样
  app.setCar('B', { ...defA });
  app.finish();
  const m1 = app.getMetrics();
  out.sameTimeDiff = Math.abs(m1.tA - m1.tB);
  out.sameDvMax = Math.abs(m1.dvMax);

  // 质量方向：A 加重 20%，成绩必须变差
  app.setCar('B', { ...defB });
  app.setCar('A', { m: defA.m * 1.2 });
  app.finish();
  out.tAHeavy = app.getMetrics().tA;

  // 冲线斜率：等阻力只改质量，快车的领先必须在冲线处收窄
  app.setCar('A', { ...defA });
  app.setCar('B', { ...defA, m: defA.m * 1.15 });
  app.finish();
  const m3 = app.getMetrics();
  out.ctlSlope = m3.slopeFinish;
  out.ctlDTime = m3.dTimeMs;

  // 还原默认，锁在终局帧
  app.setCar('A', { ...defA });
  app.setCar('B', { ...defB });
  app.finish();
  out.dTimeMs = app.getMetrics().dTimeMs;
  return out;
});

if (phy.gridN !== 401) fails.push(`Δv 曲线采样点数 ${phy.gridN}，应为 401`);
if (!phy.finished) fails.push('默认状态没有跑完，终局帧不可复现');
if (phy.sameTimeDiff !== 0) fails.push(`同参数两车成绩不等，差 ${phy.sameTimeDiff} s`);
if (phy.sameDvMax !== 0) fails.push(`同参数两车速度差不为 0，最大 ${phy.sameDvMax} m/s`);
if (!(phy.tAHeavy > phy.tADefault)) {
  fails.push(`质量加重 20% 后成绩没变差：${phy.tADefault.toFixed(4)} → ${phy.tAHeavy.toFixed(4)} s`);
}
if (!(phy.ctlDTime < 0)) fails.push(`等阻力时轻车没跑赢重车，Δt ${phy.ctlDTime.toFixed(2)} ms`);
if (!(phy.ctlSlope < 0)) fails.push(`冲线处 dΔv/dx = ${phy.ctlSlope.toFixed(5)}，不是负的`);

/* 4. 安全区像素 */
const px = await page.evaluate((S) => {
  const cv = window.__app.canvas;
  if (!cv) return { err: '拿不到 __app.canvas' };
  const ctx = cv.getContext('2d');
  if (!ctx) return { err: '画布不是 2D 上下文' };
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
  if (px.inkPct < 8) fails.push(`安全区墨量 ${px.inkPct}%，低于 8%（空壳通常在 1-2%）`);
  if (px.colors < 48) fails.push(`色彩层次只有 ${px.colors} 种，低于 48（空壳通常 < 20）`);
}

/* 5. 控制台 */
if (errors.length) fails.push(...errors.slice(0, 5));

await page.screenshot({ path: 'qa/vertical.png' });
await browser.close();

if (fails.length) {
  console.error('GATE FAIL');
  fails.forEach((f) => console.error('  ' + f));
  process.exit(1);
}

console.log(
  `GATE OK  |  竖版 ${(v / 1024).toFixed(0)}KB  封面 ${(c / 1024).toFixed(0)}KB` +
  `  |  墨量 ${px.inkPct}%  ${px.colors} 色` +
  `  |  同参数差 ${phy.sameTimeDiff} s  冲线斜率 ${phy.ctlSlope.toFixed(4)}` +
  `  |  默认差 ${phy.dTimeMs.toFixed(1)} ms`
);
