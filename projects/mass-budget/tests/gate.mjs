import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

/* 1. 项目自己的自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st || !st.ok) fails.push('selfTest: ' + (st ? st.errs.join(', ') : '未返回'));

/* 2. 数值断言：配重账本身要对 */
const m = await page.evaluate(() => { window.__app.reset(); return window.__app.getMetrics(); });
const nums = [];
const chk = (name, ok, got) => { nums.push([name, ok, got]); if (!ok) fails.push(`${name}：实测 ${got}`); };

const shareSum = m.shares.reduce((a, b) => a + b, 0);
chk('质量占比合计 = 100%', Math.abs(shareSum - 100) < 1e-6, shareSum.toFixed(4) + ' %');

const massSum = m.masses.reduce((a, b) => a + b, 0);
chk('各件质量之和 = 总质量', Math.abs(massSum - m.total) < 1e-9,
  `${massSum.toFixed(3)} / ${m.total.toFixed(3)} g`);

// y_cg 必须等于独立算的加权平均，不能是画上去的假数
const contribSum = m.contrib.reduce((a, b) => a + b, 0);
chk('各部件贡献之和 = y_cg', Math.abs(contribSum - m.ycg) < 1e-9,
  `${contribSum.toFixed(4)} / ${m.ycg.toFixed(4)} mm`);

// 手算校验：配重拆掉后总重是 51.0 g，光靠另外四件应该是 (2.70 − 7.72)/51.0 = −0.0984 mm
const zeroed = await page.evaluate(() => window.__app.setBallast({ mass: 0, y: 4, z: 8 }));
await page.evaluate(() => window.__app.reset());
chk('配重拆掉后 y_cg = −0.0984 mm（手算，除以 51 g 不是 65 g）',
  Math.abs(zeroed.ycg + 0.0984) < 2e-4, zeroed.ycg.toFixed(4) + ' mm');
await page.evaluate(() => window.__app.reset());

chk('左右轮载荷合计 = 100%', Math.abs((m.nL + m.nR) * 100 - 100) < 1e-9,
  ((m.nL + m.nR) * 100).toFixed(6) + ' %');
chk('重心高度落在部件高度区间内', m.zcg > 2 && m.zcg < 16, m.zcg.toFixed(3) + ' mm');
chk('初始配重下不报警', m.over === false, `y_cg ${m.ycg.toFixed(3)} mm / 限 ${m.limit} mm`);

// 阈值必须严格：1.32 不报，1.33 报
const edge = await page.evaluate((L) => {
  const r = [];
  for (const y of [6.0, 6.5, 7.0, 8.0]) r.push({ y, ...window.__app.setBallast({ y }) });
  return r;
}, m.limit);
chk('配重右移后 y_cg 单调增大',
  edge.every((e, i) => i === 0 || e.ycg > edge[i - 1].ycg),
  edge.map((e) => e.ycg.toFixed(2)).join(' → '));
chk('至少一个位置真的越界并报警',
  edge.some((e) => Math.abs(e.ycg) > m.limit && e.over === true),
  edge.map((e) => `${e.ycg.toFixed(2)}${e.over ? '⚠' : ''}`).join(' '));

// 报警不是只改个变量，画面上必须真的变色
const alarm = await page.evaluate(() => {
  const cv = window.__app.canvas;
  const ctx = cv.getContext('2d');
  const sample = () => {
    const d = ctx.getImageData(60, 1396, 870, 1).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return { r: r / n, g: g / n, b: b / n };
  };
  window.__app.setBallast({ y: 4 });
  const safe = sample();
  window.__app.setBallast({ y: 8 });
  const over = sample();
  const mm = window.__app.getMetrics();
  return { safe, over, mm };
});
const dR = alarm.over.r - alarm.safe.r;
chk('越界后判定条整条变强调色（画面上真的变了）', dR > 60,
  `R ${alarm.safe.r.toFixed(0)} → ${alarm.over.r.toFixed(0)}（Δ${dR.toFixed(0)}）`);
chk('越界时余量为负', alarm.mm.margin < 0, alarm.mm.margin.toFixed(3) + ' mm');
chk('越界时偏航力矩超过 25 mN·m', Math.abs(alarm.mm.yaw) > 25, alarm.mm.yaw.toFixed(2) + ' mN·m');

// 负方向也必须报
const neg = await page.evaluate(() => window.__app.setBallast({ y: -8 }));
chk('配重左移同样越界并报警', neg.over === true, `y_cg ${neg.ycg.toFixed(3)} mm`);

/* 3. 导出必须是真 PNG */
const v = await page.evaluate(async () => await window.__app.exportPNG());
const c = await page.evaluate(async () => await window.__app.exportCover());
if (!(v > 4096)) fails.push(`竖版导出过小 ${v} B`);
if (!(c > 4096)) fails.push(`封面导出过小 ${c} B`);

/* 4. 内容断言：量的是用户打开时看到的那一帧（默认配重，不报警）
   空壳项目同样能导出合格大小的 PNG、selfTest 同样返回 true，
   所以字节数完全证明不了做完了。这里直接量画面本身。 */
// 前面的断言把配重推到了越界态，量墨量前先复位到默认态
await page.evaluate(() => window.__app.reset());
const px = await page.evaluate((S) => {
  const cv = window.__app.canvas;
  if (!cv) return { err: '拿不到 __app.canvas' };
  const ctx = cv.getContext('2d');
  if (!ctx) return { err: '画布不是 2D 上下文，无法采样' };
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

/* 5. 运行期报错 */
if (errors.length) fails.push(...errors.slice(0, 5));

// 截图和导出都用越界那一帧，因为报警态才是这个工具存在的理由
await page.evaluate(() => window.__app.setBallast({ y: 8 }));
await page.screenshot({ path: 'qa/vertical.png' });
await browser.close();

console.log('数值断言：');
for (const [name, ok, got] of nums) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}  →  ${got}`);
}

if (fails.length) {
  console.error('GATE FAIL');
  fails.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(
  `GATE OK  |  竖版 ${(v / 1024).toFixed(0)}KB  封面 ${(c / 1024).toFixed(0)}KB` +
  `  |  墨量 ${px.inkPct}%  ${px.colors} 色`
);
