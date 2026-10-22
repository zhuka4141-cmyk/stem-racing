/* 回归门禁 · track-flyover-3d
   跑法：node tests/gate.mjs
   失败即非零退出码。断言的是物理，不是「没报错」。 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { open, HOOK } from './probe.mjs';

mkdirSync(join(process.cwd(), 'qa'), { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

/* ---------- 自检 ---------- */
const self = await page.evaluate((h) => window[h].selfTest(), HOOK);
if (!self) fails.push(`缺少 window.${HOOK}.selfTest`);
else if (!self.ok) fails.push(`selfTest 失败: ${self.errs.join(' / ')}`);

/* ---------- 物理断言 1：必须和共用内核给出的基准逐位对上 ----------
   以前这里锁的是「1.230 s / 19.93 m/s」这对手写数，配一个单指数拟合。
   那对数字算术上讲不通（单指数跑不出峰值后下降的形状），所以换成了
   和其余 29 个项目同一套「脉冲 + 滑行」积分。基准因此变成
   1.1885 s / 16.906 m/s / 峰值 18.347 m/s，由 21 N / 110 ms 积出来。 */
const REF = { t: 1.1885, v: 16.906, vMax: 18.347, tBurn: 0.110, a0: 262.9 };

const prof = await page.evaluate((h) => {
  const t = window[h];
  const at = t.profileAt(t.params().T);
  return {
    x: at.x, v: at.v,
    a0: t.profileAt(0.055).a,        // 燃烧中点的加速度
    aStart: t.profileAt(0).a,        // 起步瞬间（半正弦下应≈0 甚至为负）
    sim: t.sim(),
    splits: t.splits(),
    gates: t.gates(),
    params: t.params(),
  };
}, HOOK);

if (Math.abs(prof.x - 20.0) > 1e-6) fails.push(`冲线时 x=${prof.x.toFixed(6)}，不是 20.000000 m`);
if (Math.abs(prof.v - REF.v) > 5e-3) fails.push(`末速 ${prof.v.toFixed(4)} 和基准 ${REF.v} 差太多`);
if (Math.abs(prof.sim.vMax - REF.vMax) > 5e-3) fails.push(`峰值 ${prof.sim.vMax.toFixed(4)} 和基准 ${REF.vMax} 差太多`);
if (Math.abs(prof.sim.t - REF.t) > 2e-3) fails.push(`冲线 ${prof.sim.t.toFixed(4)} s 和基准 ${REF.t} 差太多`);
if (Math.abs(prof.a0 - REF.a0) > 1.0) fails.push(`峰值加速度 ${prof.a0.toFixed(1)} 和基准 ${REF.a0} 差太多`);

/* 峰值必须落在燃尽附近，之后必须减速——这才叫「脉冲 + 滑行」。
   如果哪天有人把它改回单指数，tMax 会跑到无穷大，这条立刻炸。 */
if (!(prof.sim.tMax > 0.09 && prof.sim.tMax < 0.13)) {
  fails.push(`峰值时刻 ${prof.sim.tMax.toFixed(4)} s 不在燃尽区间 0.09–0.13`);
}
if (!(prof.sim.vMax > prof.v)) fails.push('峰值速度不比末速大，说明模型没在滑行减速');

/* ---------- 物理断言 2：均匀加速必须被模型排除 ----------
   均匀加速跑 20 m 用 1.1885 s，末速会是 2L/T = 33.7 m/s，而模型给 16.9。
   差 2 倍，说明推力确实是前载的。这条在守「剖面没悄悄退化成匀速」。 */
const uniformEnd = (2 * 20.0) / REF.t;
if (!(uniformEnd > prof.v * 1.4)) fails.push('均匀加速对照值算错，剖面检验失效');

/* ---------- 物理断言 3：分段成绩单调递增，终点门正好是冲线时间 ---------- */
for (let i = 1; i < prof.splits.length; i++) {
  if (!(prof.splits[i] > prof.splits[i - 1])) {
    fails.push(`G${i + 1} 分段成绩 ${prof.splits[i].toFixed(3)} 没有晚于 G${i}`);
  }
}
if (Math.abs(prof.splits[prof.splits.length - 1] - prof.sim.t) > 1e-9) {
  fails.push(`终点门时间 ${prof.splits[prof.splits.length - 1].toFixed(4)} 不是冲线时间 ${prof.sim.t.toFixed(4)}`);
}
if (Math.abs(prof.gates[prof.gates.length - 1] - 20.0) > 1e-9) fails.push('末道门不在 20.00 m');
for (let i = 1; i < prof.gates.length; i++) {
  if (Math.abs(prof.gates[i] - prof.gates[i - 1] - 5.0) > 1e-9) fails.push('计时门间距不是 5.00 m');
}

/* ---------- 物理断言 4：车速随里程单调增 ---------- */
const mono = await page.evaluate((h) => {
  const t = window[h];
  const out = [];
  for (let x = 0; x <= 20.0001; x += 1) {
    t.setProgress(x / 20);
    out.push(t.getMetrics().v);
  }
  t.setProgress(0);
  return out;
}, HOOK);
/* 旧断言写的是「速度随里程单调增」。那只对渐近的指数模型成立——
   换成脉冲 + 滑行之后，燃尽（约 1.3 m 处）以后车是在减速的，
   等速上升本身就不该发生。所以改成两段：
     燃尽前严格增，燃尽后严格减，且峰值只出现一次。
   这比原来严格：原来允许一直涨到终点，现在要求必须出现下降。 */
const peakIdx = mono.indexOf(Math.max(...mono));
if (peakIdx <= 0) fails.push(`峰值不在中间：出现在 x=${peakIdx} m`);
if (peakIdx >= mono.length - 1) fails.push(`峰值出现在终点 x=${peakIdx} m，模型没在滑行减速`);
for (let i = 1; i <= peakIdx; i++) {
  if (!(mono[i] > mono[i - 1])) fails.push(`燃尽前 x=${i} m 处速度没有继续上升`);
}
for (let i = peakIdx + 1; i < mono.length; i++) {
  if (!(mono[i] < mono[i - 1])) fails.push(`燃尽后 x=${i} m 处速度没有继续下降`);
}
// 峰值必须在燃尽对应的里程附近，不能跑到半路上
if (!(peakIdx >= 1 && peakIdx <= 3)) fails.push(`峰值出现在 x=${peakIdx} m，离燃尽位置 (约 1.3 m) 太远`);

/* ---------- 物理断言 5：相机进度和车位置线性绑定 ---------- */
const bind = await page.evaluate((h) => {
  const t = window[h];
  t.setProgress(0.5);
  const mid = t.getMetrics();
  t.setProgress(0);
  return mid;
}, HOOK);
if (Math.abs(bind.x - 10.0) > 1e-9) fails.push(`进度 0.5 应对应 10.00 m，实际 ${bind.x}`);

/* ---------- 断言：屏幕上显示的峰值加速度必须是真的峰值 ----------
   这条是补的。原来界面取 aAt(0) 当"起步峰值"，而半正弦推力在 t=0 时为 0，
   屏幕上就显示 −0.1 m/s²。门禁当时查的是 profileAt(0.055).a，是另一个变量，
   所以一路绿。现在直接读 BOXES 里的渲染文字来验。 */
const shown = await page.evaluate((h) => {
  const bs = window[h].boxes();
  const k = bs.findIndex((b) => b.t.includes('推力峰值') || b.t.includes('起步峰值'));
  return k < 0 ? null : { label: bs[k].t, value: bs[k + 1] && bs[k + 1].t };
}, HOOK);
if (!shown) fails.push('界面上找不到「推力峰值」这一格');
else {
  const num = parseFloat(String(shown.value).replace(/[^\d.\-]/g, ''));
  if (!(num > 200)) {
    fails.push(`屏幕上的峰值加速度显示 ${shown.value}，不是真峰值（应约 262.5）`);
  }
  if (!shown.label.includes('推力')) {
    fails.push(`标签还写着「${shown.label}」，应该叫「推力峰值」`);
  }
}

/* ---------- 版面断言：安全区里任意两块字都不许压在一起 ---------- */
// 人眼看图靠不住，直接把每次 fillText 的包围盒拿出来两两求交。
// 允许 25% 以内的交叠：中文字身留白多，包围盒略碰不算糊。
const overlaps = await page.evaluate((h) => {
  const b = window[h].boxes();
  const out = [];
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const a = b[i], c = b[j];
      const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
      const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (ox <= 0 || oy <= 0) continue;
      const frac = (ox * oy) / Math.min(a.w * a.h, c.w * c.h);
      if (frac > 0.25) {
        out.push(`${a.t} ↔ ${c.t}  重叠 ${(frac * 100).toFixed(0)}%`);
      }
    }
  }
  return out;
}, HOOK);
overlaps.slice(0, 5).forEach((o) => fails.push(`文字重叠: ${o}`));

/* ---------- 版面断言：文字不许越出安全区 ---------- */
const bleed = await page.evaluate(({ h, SAFE }) => {
  return window[h].boxes()
    .filter((b) => b.x < SAFE.x0 - 2 || b.x + b.w > SAFE.x1 + 2)
    .map((b) => `${b.t} [${b.x.toFixed(0)}..${(b.x + b.w).toFixed(0)}]`);
}, { h: HOOK, SAFE: { x0: 60, x1: 930 } });
bleed.slice(0, 5).forEach((b) => fails.push(`文字出界: ${b}`));

/* ---------- 导出必须产出真实字节 ---------- */
const exp = await page.evaluate(async (h) => {
  const t = window[h];
  return { vertical: await t.exportPNG(), cover: await t.exportCover() };
}, HOOK).catch((e) => { fails.push(`导出抛错: ${e.message}`); return null; });

if (exp) {
  if (!(exp.vertical > 4096)) fails.push(`竖版导出过小: ${exp.vertical} B`);
  if (!(exp.cover > 4096)) fails.push(`封面导出过小: ${exp.cover} B`);
}

/* ---------- 改参数后画面必须变 ---------- */
await page.setViewportSize({ width: 1080, height: 1920 });
await page.evaluate((h) => { window[h].setPaused(true); window[h].setProgress(0.02); }, HOOK);
await page.waitForTimeout(150);
const before = await page.screenshot();
await page.evaluate((h) => window[h].setProgress(0.78), HOOK);
await page.waitForTimeout(150);
const after = await page.screenshot();
if (Buffer.compare(before, after) === 0) fails.push('拖动相机进度后画面无变化');

await page.evaluate((h) => window[h].setProgress(0.42), HOOK);
await page.screenshot({ path: join(process.cwd(), 'qa', 'vertical.png') });

await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: join(process.cwd(), 'qa', 'desktop.png') });

await browser.close();

if (errors.length) fails.push(...errors.slice(0, 6));
if (fails.length) {
  console.error('\n门禁失败：');
  fails.forEach((f) => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log(
  `GATE OK  |  竖版 ${(exp.vertical / 1024).toFixed(0)}KB  封面 ${(exp.cover / 1024).toFixed(0)}KB  ` +
  `冲线 ${prof.sim.t.toFixed(4)} s  末速 ${prof.v.toFixed(3)} m/s  峰值 ${prof.sim.vMax.toFixed(3)} m/s  ` +
  `峰值时刻 ${prof.sim.tMax.toFixed(4)} s  a0=${prof.a0.toFixed(1)} m/s²`,
);
