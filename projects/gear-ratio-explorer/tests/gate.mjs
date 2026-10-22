import { mkdirSync } from 'node:fs';
import { open, SAFE } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

/* 1. 项目自己的自检 */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st || !st.ok) fails.push('selfTest: ' + (st ? st.errs.join(', ') : '未返回'));

/* 2. 数值断言：齿比的权衡必须真的存在 */
const m = await page.evaluate(() => { window.__app.setI(1); return window.__app.getMetrics(); });
const nums = [];
const chk = (name, ok, got) => { nums.push([name, ok, got]); if (!ok) fails.push(`${name}：实测 ${got}`); };

chk('i=1 完赛时间 = 1.1885 s（和基线一致）', Math.abs(m.t - 1.1885) < 4e-3, m.t.toFixed(4) + ' s');
chk('i=1 到头速度 = 16.91 m/s（和基线一致）', Math.abs(m.v - 16.906) < 0.06, m.v.toFixed(3) + ' m/s');
chk('终点位移 = 20.00 m ± 0.05', Math.abs(m.x - 20) < 0.05, m.x.toFixed(4) + ' m');
chk('等效惯性质量 79–81 g', m.meff * 1000 > 79 && m.meff * 1000 < 81, (m.meff * 1000).toFixed(2) + ' g');
chk('冲量 = 1.47 N·s（与 i 无关）', Math.abs(m.impulse - 1.4699) < 0.002, m.impulse.toFixed(4) + ' N·s');

// 三条定性性质，缺一条这个图就没有说服力
const sw = await page.evaluate(() => window.__app.sweep());
const decr = sw.every((s, k) => k === 0 || s.v <= sw[k - 1].v + 1e-6);
chk('到头速度随 i 单调下降', decr,
  `${sw[0].v.toFixed(2)} → ${sw[sw.length - 1].v.toFixed(2)} m/s`);

const bi = sw.reduce((best, s, k) => (s.t < sw[best].t ? k : best), 0);
chk('完赛时间存在 U 形最优（不在端点）', bi > 0 && bi < sw.length - 1,
  `i*=${sw[bi].i.toFixed(2)} t=${sw[bi].t.toFixed(3)} s`);
chk('最优点在 i = 0.8–1.6 之间', sw[bi].i > 0.8 && sw[bi].i < 1.6, 'i* = ' + sw[bi].i.toFixed(3));

// 两头都要更慢，这才是权衡
const lo = sw[0], hi = sw[sw.length - 1];
chk('小齿比更慢（起步太软）', lo.t > sw[bi].t, `i=${lo.i.toFixed(2)} → ${lo.t.toFixed(3)} s`);
chk('大齿比更慢（撞速度上限）', hi.t > sw[bi].t, `i=${hi.i.toFixed(2)} → ${hi.t.toFixed(3)} s`);

chk('大齿比起步更猛（峰值加速度更大）', hi.peakA > sw[bi].peakA * 1.5,
  `i=${hi.i.toFixed(2)} → ${(hi.peakA / 9.81).toFixed(0)} g`);
chk('推荐带包住最优点', m.band.lo <= m.band.iBest && m.band.iBest <= m.band.hi,
  `i = ${m.band.lo.toFixed(2)} – ${m.band.hi.toFixed(2)}`);

// 分两段验单调：上限没咬住时靠推力，咬住后靠速度，两段形状必须相反
const ci = sw.findIndex((s) => s.ceil);
const iClip = ci < 0 ? null : sw[ci].i;
chk('速度上限在一个明确档位开始生效', ci > 0, iClip === null ? '从未生效' : 'i > ' + iClip.toFixed(2));
const leftOk = ci > 0 && sw.slice(1, ci).every((s, k) => s.t < sw[k].t);
chk('未顶上限段：时间随 i 严格下降', leftOk,
  ci > 0 ? `i ${sw[0].i.toFixed(2)}→${sw[ci - 1].i.toFixed(2)}：${sw[0].t.toFixed(3)}→${sw[ci - 1].t.toFixed(3)} s` : 'n/a');
const rightOk = ci > 0 && sw.slice(ci + 1).every((s, k) => s.t > sw[ci + k].t);
chk('顶上限段：时间随 i 严格上升', rightOk,
  ci > 0 ? `i ${sw[ci].i.toFixed(2)}→${sw[sw.length - 1].i.toFixed(2)}：${sw[ci].t.toFixed(3)}→${sw[sw.length - 1].t.toFixed(3)} s` : 'n/a');
chk('最优点就落在上限开始咬住的位置（±1 档）', ci > 0 && Math.abs(ci - bi) <= 1,
  `i*=${sw[bi].i.toFixed(2)} · 上限起点=${iClip === null ? 'n/a' : iClip.toFixed(2)}`);

// 模型的两端行为：高齿比必须撞上限，低齿比不许撞
const ceil = await page.evaluate(() => ({
  hi: window.__app.run(3.0),
  lo: window.__app.run(0.3),
  mid: window.__app.run(1.0),
}));
chk('i=3 撞上速度上限', ceil.hi.hitCeil === true && ceil.hi.vCeil < 9,
  `上限 ${ceil.hi.vCeil.toFixed(2)} m/s`);
chk('i=0.3 不撞上限', ceil.lo.hitCeil === false, `上限 ${ceil.lo.vCeil.toFixed(1)} m/s`);
chk('i=1 不撞上限（基线没被模型污染）', ceil.mid.hitCeil === false, `上限 ${ceil.mid.vCeil.toFixed(1)} m/s`);

// 拖动滑块必须真的改画面：曲线位置变了
const moved = await page.evaluate(() => {
  const cv = window.__app.canvas, ctx = cv.getContext('2d');
  const sig = () => {
    const d = ctx.getImageData(176, 802, 700, 150).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 41) h = (h * 31 + d[i]) >>> 0;
    return h;
  };
  window.__app.setI(1.0); const a = sig();
  window.__app.setI(2.4); const b = sig();
  window.__app.setI(1.0);
  return { a, b };
});
chk('传动比改变后曲线区域像素真的变了', moved.a !== moved.b, `${moved.a} vs ${moved.b}`);

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

/* 5. 运行期报错 */
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
