/**
 * 门禁：装车台。
 *
 * 六件事必须同时成立：
 *   1. 逻辑对（selfTest + 81 组合遍历）
 *   2. 三条限值都真的够得着（否则只是画在纸上的红线）
 *   3. 换零件画面必须变（防假绿：空壳也能导出合法 PNG）
 *   4. 画面有内容（安全区墨量 ≥8%、色彩 ≥48 种——量像素，不看字节数）
 *   5. 排版没有大块空白
 *   6. 无 console/pageerror
 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };

const fails = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else notes.push(msg); };

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });
await page.waitForTimeout(1200);

/* ---------- 1. selfTest ---------- */
const st = await page.evaluate(() => window.__app.selfTest());
if (!st || typeof st.ok !== 'boolean') fails.push('selfTest 没有返回 {ok, errs}');
else if (!st.ok) fails.push('selfTest 失败：' + st.errs.join(' / '));
else notes.push('selfTest 全部通过');

/* ---------- 2. 限值必须自洽，不能是旧的那对 ---------- */
const lim = await page.evaluate(() => window.__app.getMetrics());
const D_LAT = lim.limits.D_LAT;
ok(Math.abs(D_LAT - 5.96e-3 / (21 * 0.5)) < 1e-9,
  `偏移上限 ${(D_LAT * 1000).toFixed(3)} mm = 5.96 mN·m ÷ (21 N × 0.5)`);
ok(Math.abs(D_LAT - 1.32e-3) > 1e-6,
  '偏移上限不再是旧 4.5 N 推力下的 1.32 mm');

/* ---------- 3. 81 组合：成绩带、限值可达 ---------- */
const sweep = await page.evaluate(() => {
  const out = [];
  const g = window.__app.getMetrics().groups;
  for (let a = 0; a < g[0].options.length; a++)
    for (let b = 0; b < g[1].options.length; b++)
      for (let c = 0; c < g[2].options.length; c++)
        for (let d = 0; d < g[3].options.length; d++) {
          window.__app.set('body', a);
          window.__app.set('wheel', b);
          window.__app.set('ballast', c);
          window.__app.set('wing', d);
          const m = window.__app.getMetrics();
          out.push({
            s: [a, b, c, d],
            time: m.time, speed: m.speed, mass: m.m, ratio: m.ratio,
            comLat: m.comLat, mYaw: m.mYaw,
            tripped: m.warnings.filter((w) => w.tripped).map((w) => w.id),
          });
        }
  window.__app.set('body', 0); window.__app.set('wheel', 1);
  window.__app.set('ballast', 1); window.__app.set('wing', 1);
  return out;
});

ok(sweep.length === 81, `全组合 ${sweep.length} / 81`);
const tMin = Math.min(...sweep.map((r) => r.time));
const tMax = Math.max(...sweep.map((r) => r.time));
ok(sweep.every((r) => r.time > 0.9 && r.time < 1.6), `成绩带 ${tMin.toFixed(3)}–${tMax.toFixed(3)} s`);

for (const id of ['lat', 'yaw', 'meq']) {
  const hits = sweep.filter((r) => r.tripped.includes(id)).length;
  ok(hits > 0, `限值「${id}」在 ${hits} 种装法里触发过（不是画在纸上的红线）`);
}

// 成绩必须随质量增加而变慢——不然物理是假的
const byMass = sweep.slice().sort((a, b) => a.mass - b.mass);
const light = byMass[0], heavy = byMass[byMass.length - 1];
ok(heavy.time > light.time,
  `最重装法比最轻装法慢（${(heavy.mass * 1000).toFixed(1)} g ${heavy.time.toFixed(3)} s > ${(light.mass * 1000).toFixed(1)} g ${light.time.toFixed(3)} s）`);

/* ---------- 4. 换零件画面必须变（防假绿核心） ---------- */
const drift = await page.evaluate(async () => {
  const grab = async () => {
    const blob = await new Promise((res) => window.__app.canvas.toBlob(res, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let h = 2166136261;
    for (let i = 0; i < buf.length; i += 13) { h ^= buf[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  window.__app.set('ballast', 0);
  const a = await grab();
  window.__app.set('ballast', 2);
  const b = await grab();
  window.__app.set('ballast', 1);
  return { a, b };
});
ok(drift.a !== drift.b, `换配重后导出字节确实变了（${drift.a} → ${drift.b}）`);

/* ---------- 5. 导出字节 ---------- */
const pngBytes = await page.evaluate(() => window.__app.exportPNG());
const covBytes = await page.evaluate(() => window.__app.exportCover());
ok(pngBytes > 4096, `竖版导出 ${(pngBytes / 1024).toFixed(0)}KB`);
ok(covBytes > 4096, `封面导出 ${(covBytes / 1024).toFixed(0)}KB`);

/* ---------- 6. 画面内容 ---------- */
const px = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const g = c.getContext('2d');
  const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const set = new Set();
  let ink = 0, tot = 0;
  for (let y = SAFE.y0; y < SAFE.y1; y += 3) {
    for (let x = SAFE.x0; x < SAFE.x1; x += 3) {
      const i = (y * c.width + x) * 4;
      if (lum(d[i], d[i + 1], d[i + 2]) > 24) ink++;
      tot++;
      set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
    }
  }
  return { inkPct: ink / tot * 100, colors: set.size };
}, SAFE);
ok(px.inkPct >= 8, `安全区墨量 ${px.inkPct.toFixed(2)}%（要求 ≥8%）`);
ok(px.colors >= 48, `色彩层次 ${px.colors} 种（要求 ≥48）`);

/* ---------- 7. 排版 ---------- */
mkdirSync('qa', { recursive: true });
await page.screenshot({ path: 'qa/vertical.png' });

const dead = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const bands = [];
  const STEP = 25;
  for (let y = SAFE.y0; y < SAFE.y1; y += STEP) {
    let hit = 0;
    for (let yy = y; yy < Math.min(y + STEP, SAFE.y1); yy += 4) {
      for (let x = SAFE.x0; x < SAFE.x1; x += 4) {
        const i = (yy * c.width + x) * 4;
        if (lum(d[i], d[i + 1], d[i + 2]) > 24) hit++;
      }
    }
    if (hit === 0) bands.push(y);
  }
  let best = 0, cur = 0, prev = null;
  for (const y of bands) {
    cur = (prev !== null && y - prev === STEP) ? cur + STEP : STEP;
    prev = y;
    if (cur > best) best = cur;
  }
  return { dead: bands.length ? best : 0, bandList: bands };
}, SAFE);
ok(dead.dead <= 150, `安全区内最长空白带 ${dead.dead}px（要求 ≤150）`);

/* ---------- 8. 干净 ---------- */
ok(errors.length === 0, errors.length ? '页面有报错：' + errors.join(' | ') : '无 console/pageerror');

await browser.close();

/* ---------- 结果 ---------- */
console.log('---------- 记录 ----------');
for (const n of notes) console.log('  · ' + n);
console.log('  · 偏移上限 ' + (D_LAT * 1000).toFixed(3) + ' mm（旧值 1.32 mm 已废弃）');
console.log('  · 成绩范围 ' + tMin.toFixed(3) + '–' + tMax.toFixed(3) + ' s');
if (dead.bandList.length) console.log('  · 空白带起点 ' + dead.bandList.join(','));

if (fails.length) {
  console.log('\nGATE FAIL');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log(`\nGATE OK  |  竖版 ${(pngBytes / 1024).toFixed(0)}KB  封面 ${(covBytes / 1024).toFixed(0)}KB  |  墨量 ${px.inkPct.toFixed(2)}%  ${px.colors} 色  |  81 组合`);
