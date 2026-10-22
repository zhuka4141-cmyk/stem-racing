/**
 * 门禁：证明这个项目真的画了东西，而不是一张空壳。
 *
 * 三件事必须同时成立：
 *   1. 逻辑对（selfTest + 物理断言）
 *   2. 画面有内容（安全区墨量 ≥8%、色彩 ≥48 种——量像素，不看字节数）
 *   3. 画面随参数真的变（换偏移后导出哈希必须不同）
 *
 * 第 3 条是防「假绿」的：空壳也能导出合格 PNG，也能让 selfTest 返回 true，
 * 但改参数画面不会变。
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

/* ---------- 2. 物理断言 ---------- */
const phys = await page.evaluate(() => {
  const g = (d) => { window.__app.set('offset', d); return window.__app.getMetrics(); };

  const out = {};

  // 载荷转移：偏移变大时偏航需求必须单调增
  const a = g(0.10), b = g(1.00), c = g(4.00);
  out.monotone = a.demand < b.demand && b.demand < c.demand;

  // 偏移 0 时无偏航需求
  const z = g(0);
  out.zeroQuiet = z.demand < 1e-12 && !z.alarm;

  // 临界点两侧报警必须翻转
  const dc = z.dcritMM;
  out.belowOK = !g(dc * 0.8).alarm;
  out.aboveOK = g(dc * 1.2).alarm;

  // 4.0 mm 时必须报警（远超临界），且比值 = 4.0 / dcrit
  const four = g(4.0);
  out.fourAlarms = four.alarm;
  out.ratioMatches = Math.abs(four.ratio - (4.0 / dc)) < 1e-6;

  // 轴荷守恒
  out.loadSum = Math.abs(four.nf + four.nr - four.total) < 1e-12;

  // 关掉推力后全部归零
  window.__app.set('thrustOn', false);
  const off = window.__app.getMetrics();
  out.thrustOffQuiet = off.demand < 1e-12 && !off.alarm;
  window.__app.set('thrustOn', true);

  out.dcritMM = z.dcritMM;
  out.ratioAt4 = four.ratio;
  window.__app.set('offset', 0.40);
  return out;
});

ok(phys.monotone, '偏航需求随偏移单调递增');
ok(phys.zeroQuiet, '偏移 0 时无偏航需求且不报警');
ok(phys.belowOK, '低于临界偏移不报警');
ok(phys.aboveOK, '高于临界偏移要报警');
ok(phys.fourAlarms, '4.00 mm 时必须报警');
ok(phys.ratioMatches, '比值等于 偏移 / 临界偏移');
ok(phys.loadSum, '前后轴荷加起来等于整车重');
ok(phys.thrustOffQuiet, '推力关断后无侧向需求');

/* ---------- 3. 导出字节 ---------- */
const pngBytes = await page.evaluate(() => window.__app.exportPNG());
const covBytes = await page.evaluate(() => window.__app.exportCover());
ok(pngBytes > 4096, `竖版导出 ${(pngBytes / 1024).toFixed(0)}KB`);
ok(covBytes > 4096, `封面导出 ${(covBytes / 1024).toFixed(0)}KB`);

/* ---------- 4. 画面内容（量像素，不信字节数） ---------- */
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
      const l = lum(d[i], d[i + 1], d[i + 2]);
      if (l > 24) ink++;
      tot++;
      set.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
    }
  }
  return { inkPct: ink / tot * 100, colors: set.size };
}, SAFE);

ok(px.inkPct >= 8, `安全区墨量 ${px.inkPct.toFixed(2)}%（要求 ≥8%）`);
ok(px.colors >= 48, `色彩层次 ${px.colors} 种（要求 ≥48）`);

/* ---------- 5. 画面必须随参数变（防假绿） ---------- */
const drift = await page.evaluate(async () => {
  const grab = async () => {
    const blob = await new Promise((res) => window.__app.canvas.toBlob(res, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let h = 2166136261;
    for (let i = 0; i < buf.length; i += 13) { h ^= buf[i]; h = Math.imul(h, 16777619); }
    return { hash: (h >>> 0).toString(16), size: buf.length };
  };
  window.__app.set('offset', 0.0);
  const a = await grab();
  window.__app.set('offset', 4.0);
  const b = await grab();
  window.__app.set('offset', 0.40);
  return { a, b };
});
ok(drift.a.hash !== drift.b.hash,
  `改偏移后画面确实变了（${drift.a.hash} → ${drift.b.hash}）`);

/* ---------- 6. 封面可见窗口 ----------
   封面 1080×1350 是居中裁切，不是上对齐：可见源行 = 285..1635，上下各切 285 px。
   落在窗口外的元素在 IG 首图上直接消失。
   这里量的是 main.js 绘制时记下的真实包围盒（measureText / fillRect 实参），
   不是另抄一份 y 值表——抄一份就会和代码不同步。 */
const cov = await page.evaluate(() => {
  const scale = Math.max(1080 / 1080, 1350 / 1920);
  const dh = 1920 * scale;
  const top = -(1350 - dh) / 2;
  const bottom = top + 1350;
  const bands = window.__app.getBands();
  return {
    top, bottom, n: bands.length,
    out: bands.filter((b) => b.y1 <= top || b.y0 >= bottom),
    verdict: bands.find((b) => /超限|在限内/.test(b.s)) ?? null,
  };
});
ok(cov.n > 10, `记录到 ${cov.n} 个绘制包围盒（要求 >10，太少说明记录器没挂上）`);
ok(cov.out.length === 0,
  cov.out.length
    ? `有 ${cov.out.length} 个元素整体落在封面窗口 ${cov.top}..${cov.bottom} 外：` +
      cov.out.map((b) => `${b.kind} y${b.y0.toFixed(0)}-${b.y1.toFixed(0)}${b.s ? ' ' + JSON.stringify(b.s) : ''}`).join('；')
    : `全部 ${cov.n} 个元素都在封面窗口 ${cov.top}..${cov.bottom} 内`);
ok(!!cov.verdict, '判决行必须被记录器抓到（找不到说明文案变了）');
if (cov.verdict) {
  ok(cov.verdict.y0 >= cov.top && cov.verdict.y1 <= cov.bottom,
    `判决行 y ${cov.verdict.y0.toFixed(1)}..${cov.verdict.y1.toFixed(1)} 在封面窗口内`);
}

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
  // 找最长连续空白
  let best = 0, cur = 0, prev = null;
  for (const y of bands) {
    cur = (prev !== null && y - prev === STEP) ? cur + STEP : STEP;
    prev = y;
    if (cur > best) best = cur;
  }
  return { dead: bands.length ? best : 0, firstBand: bands[0] ?? null };
}, SAFE);
ok(dead.dead <= 150, `安全区内最长空白带 ${dead.dead}px（要求 ≤150）`);

/* ---------- 8. 干净 ---------- */
ok(errors.length === 0, errors.length ? '页面有报错：' + errors.join(' | ') : '无 console/pageerror');

await browser.close();

/* ---------- 结果 ---------- */
console.log('---------- 记录 ----------');
for (const n of notes) console.log('  · ' + n);
console.log('  · 临界偏移 ' + phys.dcritMM.toFixed(3) + ' mm，4.00 mm 时超限 ×' + phys.ratioAt4.toFixed(1));

if (fails.length) {
  console.log('\nGATE FAIL');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log(`\nGATE OK  |  竖版 ${(pngBytes / 1024).toFixed(0)}KB  封面 ${(covBytes / 1024).toFixed(0)}KB  |  墨量 ${px.inkPct.toFixed(2)}%  ${px.colors} 色`);
