import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

/* 1. 项目自己的自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st || !st.ok) fails.push('selfTest: ' + (st ? st.errs.join(', ') : '未返回'));

/* 2. 数值断言：模型本身要对，不是「画面能看」就算过 */
const m = await page.evaluate(() => window.__app.getMetrics());
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const nums = [];
const chk = (name, ok, got) => { nums.push([name, ok, got]); if (!ok) fails.push(`${name}：实测 ${got}`); };

chk('位置积分终点 = 20.00 m ± 0.05', near(m.xExit, 20.0, 0.05), m.xExit.toFixed(4) + ' m');
chk('末速 15–20 m/s（racing-physics  sanity 带）', m.vExit > 15 && m.vExit < 20, m.vExit.toFixed(3) + ' m/s');
chk('完赛时间 1.0–1.25 s（同上一带）', m.tTotal > 1.0 && m.tTotal < 1.25, m.tTotal.toFixed(4) + ' s');
chk('等效惯性质量 79–81 g', m.effMass * 1000 > 79 && m.effMass * 1000 < 81, (m.effMass * 1000).toFixed(2) + ' g');
chk('速度峰值出现在推力段内', m.peakVat <= 0.110, m.peakVat.toFixed(4) + ' s');

// 能量账本：∫F_thrust dx − ∫F_drag dx − ∫F_roll dx = ½ m_eff v²
const resid = Math.abs(m.wThrust - m.wDrag - m.wRoll - m.kekin);
const tolE = Math.max(0.02, m.wThrust * 0.01);
chk('能量账本闭合（残差 < 1%）', resid <= tolE,
  `${resid.toFixed(4)} J / ${m.wThrust.toFixed(3)} J`);

// 逐帧落盘：帧数要和帧率、总时长对得上
chk('帧数 = 总时长 × 帧率 ± 2',
  Math.abs(m.frameCount - Math.round(m.tTotal * m.frameHz)) <= 2,
  `${m.frameCount} 帧 @ ${m.frameHz} Hz`);

// 拖动时间轴要真的换帧：位置、速度都跟着变
const scrub = await page.evaluate(() => {
  const pick = (f) => { const r = window.__app.scrubFrac(f); return { i: r.i, t: r.t, v: r.v, x: r.x }; };
  return { early: pick(0.03), peak: pick(0.09), late: pick(0.95), total: window.__app.getMetrics().tTotal };
});
chk('拖动到不同位置落在不同帧', scrub.peak.i > scrub.early.i && scrub.late.i > scrub.peak.i,
  `${scrub.early.i} → ${scrub.peak.i} → ${scrub.late.i}`);
chk('速度峰值段读数高于起步段', scrub.peak.v > scrub.early.v + 5,
  `${scrub.early.v.toFixed(2)} → ${scrub.peak.v.toFixed(2)} m/s`);
chk('离开推力段后读数回落（末段低于峰值）', scrub.late.v < scrub.peak.v - 0.5,
  `${scrub.peak.v.toFixed(2)} → ${scrub.late.v.toFixed(2)} m/s`);
chk('拖动后位置读数同时变化', scrub.late.x > scrub.peak.x + 5,
  `${scrub.peak.x.toFixed(2)} → ${scrub.late.x.toFixed(2)} m`);
chk('拖动定位的 t 与目标比例一致',
  Math.abs(scrub.early.t - 0.03 * scrub.total) <= 2 / m.frameHz &&
  Math.abs(scrub.late.t - 0.95 * scrub.total) <= 2 / m.frameHz,
  `${scrub.early.t.toFixed(4)} / ${(0.03 * scrub.total).toFixed(4)} s`);

// 速度曲线：到峰值前单调递增，峰值之后单调递减（一次进页面算完，别来回 IPC）
const mono = await page.evaluate(() => {
  const r = window.__app.simulate(window.__app.params);
  const v = r.F.v;
  let pk = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[pk]) pk = i;
  let rise = 0, fall = 0;
  for (let i = 1; i <= pk; i++) if (v[i] < v[i - 1] - 1e-9) rise++;
  for (let i = pk + 2; i < v.length; i++) if (v[i] > v[i - 1] + 1e-9) fall++;
  return { rise, fall, pk, n: v.length, vpk: v[pk] };
});
chk('峰值前速度单调递增', mono.rise === 0, mono.rise + ' 处回落');
chk('峰值后速度单调递减（无抖振）', mono.fall === 0, mono.fall + ' 处回升');

/* 3. 导出必须是真 PNG */
const v = await page.evaluate(async () => await window.__app.exportPNG());
const c = await page.evaluate(async () => await window.__app.exportCover());
if (!(v > 4096)) fails.push(`竖版导出过小 ${v} B`);
if (!(c > 4096)) fails.push(`封面导出过小 ${c} B`);

/* 3. 内容断言
   空壳项目同样能导出合格大小的 PNG、selfTest 同样返回 true，
   所以字节数完全证明不了做完了。这里直接量画面本身。 */
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

/* 4. 运行期报错 */
if (errors.length) fails.push(...errors.slice(0, 5));

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
