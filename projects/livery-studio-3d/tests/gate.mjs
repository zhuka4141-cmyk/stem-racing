/**
 * 门禁：证明涂装真的换得动，而不是每次都渲同一张图。
 *
 * 四条硬要求：
 *   1. 预设数量 ≥6
 *   2. 逻辑对（selfTest）
 *   3. 画面有内容（墨量 ≥8%、色彩 ≥48 种——量像素）
 *   4. 换配色后导出哈希必须变
 *   5. 结论行必须整体落在封面 1350 以内（发 IG 时封面是第一眼）
 *
 * 第 4 条是这个项目的核心断言。空壳也能导出合法 PNG、也能让 selfTest 返回
 * true，但换不了色——两次导出字节完全一致。这个项目最初就是 2660 字节的
 * 空壳，带着 `GATE OK 67KB / 13.38% / 60 色` 骗过一次。
 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const COVER_H = 1350;
const COVER_VIS_TOP = (1920 - COVER_H) / 2;   // cover 居中裁切，可见源行从这里开始

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

/* ---------- 2. 预设数量与内容 ---------- */
const meta = await page.evaluate(() => window.__app.getMetrics());
ok(meta.count >= 6, `预设 ${meta.count} 套（要求 ≥6）`);
ok(new Set(meta.ids).size === meta.count, '预设 id 无重复');
ok(new Set(meta.names).size === meta.count, '预设名字无重复:' + meta.names.join('/'));

/* ---------- 3. 每一套都必须能被选到，且材质参数必须真的推下去 ---------- */
const sweep = await page.evaluate(() => {
  const out = [];
  const n = window.__app.getMetrics().count;
  for (let i = 0; i < n; i++) {
    window.__app.set('idx', i);
    const m = window.__app.getMetrics();
    out.push({ i, id: m.id, name: m.name, body: m.body, accent: m.accent, rough: m.rough, metal: m.metal, stripe: m.stripe, hash: window.__app.pixelHash() });
  }
  window.__app.set('idx', 0);
  return out;
});
ok(sweep.length === meta.count, '每一套都能选中');

const hashSet = new Set(sweep.map((s) => s.hash));
ok(hashSet.size === sweep.length,
  `每套配色画面都不同（${hashSet.size}/${sweep.length} 个不同哈希）`);

const bodySet = new Set(sweep.map((s) => s.body));
ok(bodySet.size === sweep.length, `每套车身色都不同（${bodySet.size}/${sweep.length}）`);

/* ---------- 4. 导出字节 ---------- */
const pngBytes = await page.evaluate(() => window.__app.exportPNG());
const covBytes = await page.evaluate(() => window.__app.exportCover());
ok(pngBytes > 4096, `竖版导出 ${(pngBytes / 1024).toFixed(0)}KB`);
ok(covBytes > 4096, `封面导出 ${(covBytes / 1024).toFixed(0)}KB`);

/* ---------- 5. 换配色后导出的 PNG 字节哈希必须不同（防假绿核心） ---------- */
const drift = await page.evaluate(async () => {
  const grab = async () => {
    const blob = await new Promise((res) => window.__app.canvas.toBlob(res, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let h = 2166136261;
    for (let i = 0; i < buf.length; i += 13) { h ^= buf[i]; h = Math.imul(h, 16777619); }
    return { hash: (h >>> 0).toString(16), size: buf.length };
  };
  window.__app.set('idx', 0);
  const a = await grab();
  window.__app.set('idx', 1);
  const b = await grab();
  window.__app.set('idx', 0);
  return { a, b };
});
ok(drift.a.hash !== drift.b.hash,
  `切涂装后导出字节确实变了（${drift.a.hash} → ${drift.b.hash}）`);
ok(drift.a.size !== drift.b.size || drift.a.hash !== drift.b.hash,
  '两次导出不是同一份字节');

/* ---------- 6. 画面内容（量像素，不信字节数） ---------- */
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

/* ---------- 7. 封面可见性：结论行必须整体落在 1350 以内 ---------- */
/* 这条能反向验证：把 SPEC.noteBase 改回 1382，下面第一条立刻红。
   背景：封面 1080×1350 由 reel-export 的 cover 算法居中裁切，1920→1350 时
   可见源行是 285..1635。结论原来在 1382，其实仍在可见窗口里，但只富余 253 px，
   谁把裁切改成上对齐就没了。所以按 1350 卡死，比实际窗口再保守 285 px。 */
const bands = await page.evaluate(() => window.__app.getBands());
ok(!!bands.conclusion, '结论行包围盒有记录');
if (bands.conclusion) {
  const c = bands.conclusion;
  ok(c.y1 <= COVER_H,
    `结论行整体在封面 ${COVER_H} 以内（y ${c.y0.toFixed(0)}..${c.y1.toFixed(0)}，基线 ${c.baseline}）`);
}
ok(!!bands.accentBar && bands.accentBar.y0 >= COVER_VIS_TOP,
  `页眉强调条没被封面顶部切掉（y ${bands.accentBar ? bands.accentBar.y0 : '?'}，可见窗口从 ${COVER_VIS_TOP} 起）`);

/* 不只信数字：真按 cover 算法重采样一次，数结论那一带的墨 */
const covInk = await page.evaluate(() => {
  const src = window.__app.canvas;
  const W = src.width, H = src.height;
  const b = window.__app.getBands().conclusion;
  const out = document.createElement('canvas');
  out.width = 1080; out.height = 1350;
  const g = out.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(1080 / W, 1350 / H);
  const dw = W * scale, dh = H * scale, dy = (1350 - dh) / 2;
  g.drawImage(src, (1080 - dw) / 2, dy, dw, dh);
  const d = g.getImageData(0, 0, 1080, 1350).data;
  const y0 = Math.max(0, Math.floor(b.y0 * scale + dy));
  const y1 = Math.min(1349, Math.ceil(b.y1 * scale + dy));
  let ink = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < 1080; x++) {
      const i = (y * 1080 + x) * 4;
      if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 90) ink++;
    }
  return { ink, y0, y1 };
});
ok(covInk.ink > 200,
  `封面像素里确实有结论行（${covInk.ink} px，封面 y ${covInk.y0}..${covInk.y1}）`);

/* ---------- 8. 排版 ---------- */
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
  return { dead: bands.length ? best : 0 };
}, SAFE);
ok(dead.dead <= 150, `安全区内最长空白带 ${dead.dead}px（要求 ≤150）`);

/* ---------- 9. 干净 ---------- */
ok(errors.length === 0, errors.length ? '页面有报错：' + errors.join(' | ') : '无 console/pageerror');

await browser.close();

/* ---------- 结果 ---------- */
console.log('---------- 记录 ----------');
for (const n of notes) console.log('  · ' + n);
console.log('  · 预设：' + sweep.map((s) => s.name).join(' / '));

if (fails.length) {
  console.log('\nGATE FAIL');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log(`\nGATE OK  |  竖版 ${(pngBytes / 1024).toFixed(0)}KB  封面 ${(covBytes / 1024).toFixed(0)}KB  |  墨量 ${px.inkPct.toFixed(2)}%  ${px.colors} 色  |  ${meta.count} 套预设`);
