/* reaction-trainer 门禁
 * 1. selfTest 必须全绿
 * 2. 两次导出必须真出 PNG 字节（> 4096）
 * 3. 安全区墨量 ≥ 8%、色彩层次 ≥ 48 种（空壳通常 1.4% / 16 色）
 * 4. 本项目专属断言：样本数正好 5、抢跑不进样本、平均落在 150–600 ms、状态机不被时钟打乱
 */
import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];
let paint = null;

/* 1. 自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st.ok) fails.push('selfTest: ' + st.errs.join(', '));

/* 2. 导出 */
const v = await page.evaluate(async () => await window.__app.exportPNG());
const c = await page.evaluate(async () => await window.__app.exportCover());
if (!(v > 4096)) fails.push(`竖版导出过小 ${v} B`);
if (!(c > 4096)) fails.push(`封面导出过小 ${c} B`);

/* 3. 本项目断言 */
const rec = await page.evaluate(() => {
  const app = window.__app;
  const out = {};

  // 3.1 默认帧：5 次样本、状态 idle
  const m0 = app.getMetrics();
  out.n0 = m0.n;
  out.mode0 = m0.mode;
  out.avg0 = m0.avg;
  out.delayMin = m0.delayMin;
  out.delayMax = m0.delayMax;
  out.trialTarget = m0.trialTarget;

  // 3.2 抢跑：只加犯规，样本数和平均值都不许动
  app.addFoul();
  const m1 = app.getMetrics();
  out.afterFoulN = m1.n;
  out.afterFoulAvg = m1.avg;
  out.fouls = m1.fouls;

  // 3.3 清空后必须真的是 0
  app.reset();
  out.afterResetN = app.getMetrics().n;

  // 3.4 逐条灌 5 次，样本数必须精确等于目标数
  const feed = [188, 243, 205, 267, 219];
  feed.forEach((ms) => app.addTrial(ms));
  const m2 = app.getMetrics();
  out.nFull = m2.n;
  out.avgFull = m2.avg;
  out.bestFull = m2.best;
  out.worstFull = m2.worst;
  out.spreadFull = m2.spread;
  out.expectedAvg = feed.reduce((a, b) => a + b, 0) / feed.length;

  // 3.5 满额之后再灌，样本数不许超过 5（不能无限滚）
  app.addTrial(999);
  out.nOver = app.getMetrics().n;

  // 3.6 还原成默认那一组，锁住导出帧
  app.reset();
  [240, 214, 255, 202, 219].forEach((ms) => app.addTrial(ms));
  out.nFinal = app.getMetrics().n;
  out.avgFinal = app.getMetrics().avg;
  out.bestFinal = app.getMetrics().best;
  out.worstFinal = app.getMetrics().worst;
  return out;
});

if (rec.n0 !== 5) fails.push(`默认样本数 ${rec.n0}，应为 5`);
if (rec.trialTarget !== 5) fails.push(`目标样本数 ${rec.trialTarget}，应为 5`);
if (rec.mode0 !== 'idle') fails.push(`默认状态是 ${rec.mode0}，应为 idle`);

if (!(rec.avg0 >= 150 && rec.avg0 <= 600)) {
  fails.push(`默认平均值 ${rec.avg0.toFixed(1)} ms，不在 150–600 ms 内`);
}
if (rec.afterFoulN !== rec.n0) {
  fails.push(`抢跑改变了样本数：${rec.n0} → ${rec.afterFoulN}`);
}
if (Math.abs(rec.afterFoulAvg - rec.avg0) > 1e-9) {
  fails.push(`抢跑改变了平均值：${rec.avg0} → ${rec.afterFoulAvg}`);
}
if (rec.fouls !== 1) fails.push(`犯规计数 ${rec.fouls}，应为 1`);
if (rec.afterResetN !== 0) fails.push(`清空后样本数 ${rec.afterResetN}，应为 0`);
if (rec.nFull !== 5) fails.push(`灌满后样本数 ${rec.nFull}，应为 5`);
if (Math.abs(rec.avgFull - rec.expectedAvg) > 1e-9) {
  fails.push(`平均值算错：${rec.avgFull} vs ${rec.expectedAvg}`);
}
if (rec.bestFull !== 188 || rec.worstFull !== 267) {
  fails.push(`最快/最慢取错：${rec.bestFull} / ${rec.worstFull}，应为 188 / 267`);
}
if (Math.abs(rec.spreadFull - 79) > 1e-9) fails.push(`极差 ${rec.spreadFull}，应为 79`);
if (rec.nOver <= 5) fails.push(`样本没有上限，灌到 ${rec.nOver} 条`);
if (!(rec.delayMin === 1500 && rec.delayMax === 4000)) {
  fails.push(`随机延迟区间 ${rec.delayMin}–${rec.delayMax} ms，应为 1500–4000`);
}
if (rec.nFinal !== 5) fails.push(`导出帧样本数 ${rec.nFinal}，应为 5`);
if (!(rec.avgFinal >= 150 && rec.avgFinal <= 600)) {
  fails.push(`导出帧平均值 ${rec.avgFinal.toFixed(1)} ms 越界`);
}

/* 3.7 真跑一轮状态机：arm → 等闪灯 → 点击，全程走真实时钟 */
await page.evaluate(() => window.__app.reset());

const run = await page.evaluate(async () => {
  const app = window.__app;
  const t0 = performance.now();
  app.arm();
  const armedMode = app.getState().mode;

  while (app.getState().mode !== 'lit') {
    if (performance.now() - t0 > 6000) break;
    await new Promise((r) => setTimeout(r, 8));
  }
  const litMode = app.getState().mode;
  const waited = performance.now() - t0;

  app.hit();
  const st = app.getState();
  return {
    armedMode, litMode, waited,
    n: st.trials.length, mode: st.mode, ms: st.last, fouls: st.fouls,
  };
});

if (run.armedMode !== 'armed') fails.push(`arm() 之后状态是 ${run.armedMode}，应为 armed`);
if (run.litMode !== 'lit') fails.push(`等 6 秒也没等到闪灯，状态停在 ${run.litMode}`);
if (!(run.waited >= 1500 && run.waited <= 4200)) {
  fails.push(`随机等待 ${run.waited.toFixed(0)} ms，不在 1500–4000 ms 内`);
}
if (run.n !== 1) fails.push(`闪灯后点击没有记下样本，样本数 ${run.n}`);
if (run.mode !== 'result') fails.push(`点完之后状态是 ${run.mode}，应为 result`);
if (!(run.ms >= 0 && run.ms < 200)) {
  fails.push(`反应时间 ${run.ms == null ? 'null' : run.ms.toFixed(1)} ms 不合理`);
}

/* 3.8 真抢跑：闪灯之前点，这一次必须判负且不进样本 */
const foul = await page.evaluate(() => {
  const app = window.__app;
  app.reset();
  app.arm();
  app.hit();
  const st = app.getState();
  return { mode: st.mode, fouls: st.fouls, n: st.trials.length };
});

if (foul.mode !== 'foul') fails.push(`闪灯前点击状态是 ${foul.mode}，应为 foul`);
if (foul.fouls !== 1) fails.push(`抢跑计数 ${foul.fouls}，应为 1`);
if (foul.n !== 0) fails.push(`抢跑后样本数 ${foul.n}，应为 0`);

/* 3.9 还原默认那一组，锁住导出帧 */
paint = await page.evaluate(() => {
  const app = window.__app;
  app.reset();
  [240, 214, 255, 202, 219].forEach((ms) => app.addTrial(ms));
  const m = app.getMetrics();
  return { n: m.n, avg: m.avg, best: m.best, worst: m.worst };
});
if (paint.n !== 5) fails.push(`导出帧样本数 ${paint.n}，应为 5`);

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
  `  |  样本 ${rec.nFinal}/${rec.trialTarget}  平均 ${rec.avgFinal.toFixed(0)} ms` +
  `  最快 ${rec.bestFinal}  最慢 ${rec.worstFinal}  抢跑 ${rec.fouls} 次不进样本` +
  `  |  随机等 ${run.waited.toFixed(0)} ms 后闪灯，点击记 ${run.ms.toFixed(0)} ms`
);
