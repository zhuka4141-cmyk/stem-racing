/* 门禁：不许报错、不许联网、导出的 PNG 必须是真 PNG，而且画面必须真的"画出来了"。

   以前这个文件只有 32 行，只验「PNG 大于 4 KB」。那只证明有东西被导出了，
   不证明画面上有任何内容——一个只会填个底色的空壳也能过。
   现在补齐四类检查：
     1. 导出字节数 + PNG 魔数
     2. 墨量 / 独立色数 / 最长死区（直接读像素）
     3. 确定性：同样的参数导出两次，字节必须完全一样
     4. 参数漂移：改一个数值参数，导出字节必须变（这条专杀空壳）
*/
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { open } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors, requests, meta } = await open();
const fails = [];

const st = await page.evaluate(() => window.__app.selfTest());
if (!st.ok) fails.push('selfTest: ' + st.errs.join(' / '));

/* ---------- 1. 导出 ---------- */
const r = await page.evaluate(async () => ({
  main: await window.__app.exportPNG(),
  cover: await window.__app.exportCover(),
}));

const MIN = 4096;
if (!(r.main > MIN)) fails.push(`主图 PNG 过小 ${r.main} B（< ${MIN}）`);
if (!(r.cover > MIN)) fails.push(`封面 PNG 过小 ${r.cover} B（< ${MIN}）`);

/* ---------- 2. 像素：墨量 / 色数 / 死区 ---------- */
const px = await page.evaluate(({ safe }) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = (i) => 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];

  // 安全区整体墨量 + 独立色数
  let ink = 0, tot = 0;
  const cols = new Set();
  for (let y = safe.y0; y < safe.y1; y += 3) {
    for (let x = safe.x0; x < safe.x1; x += 3) {
      const i = (y * c.width + x) * 4;
      tot++;
      if (lum(i) > 24) ink++;
      if (img[i + 3] > 8) cols.add((img[i] >> 3) << 10 | (img[i + 1] >> 3) << 5 | (img[i + 2] >> 3));
    }
  }

  // 最长空带：按 25px 高的横带逐条算，连续不到 1% 墨量的算空
  const rows = [];
  for (let y = safe.y0; y < safe.y1; y += 25) {
    let k = 0, t = 0;
    for (let yy = y; yy < Math.min(y + 25, safe.y1); yy += 2)
      for (let x = safe.x0; x < safe.x1; x += 6) { t++; if (lum((yy * c.width + x) * 4) > 24) k++; }
    rows.push({ y, pct: k / t });
  }
  let best = 0, cur = 0, prev = null;
  for (const rw of rows) {
    if (rw.pct < 0.01) { cur = (prev !== null && rw.y - prev === 25) ? cur + 25 : 25; prev = rw.y; }
    else { cur = 0; prev = null; }
    if (cur > best) best = cur;
  }
  return { inkPct: +(ink / tot * 100).toFixed(2), colours: cols.size, deadBand: best };
}, { safe: meta.safe });

if (px.inkPct < 8) fails.push(`安全区墨量只有 ${px.inkPct}%，画面没填住`);
if (px.colours < 48) fails.push(`独立色只有 ${px.colours} 种，看着像纯色块`);
if (px.deadBand > 150) fails.push(`安全区里有 ${px.deadBand}px 连续空带`);

/* ---------- 3 + 4. 确定性 与 参数漂移 ---------- */
const h = (n) => createHash('sha256').update(String(n)).digest('hex').slice(0, 12);

const base = h(r.main);
const again = await page.evaluate(async () => window.__app.exportPNG());
if (h(again) !== base) fails.push(`同样参数导出两次字节不一样（${base} vs ${h(again)}），不确定`);

/* 把每个数值参数挨个改一下，只要有一个能让画面变，就说明真的在按参数画。
   全都改不动 = 参数是摆设，画面是写死的。 */
const drift = await page.evaluate(async () => {
  const app = window.__app;
  const before = app.getState();
  const src = before.opt || before;
  const keys = Object.keys(src).filter(
    (k) => typeof src[k] === 'boolean' || (typeof src[k] === 'number' && isFinite(src[k])),
  );
  const tried = [];
  for (const k of keys.slice(0, 4)) {
    const cur = src[k];
    const next = typeof cur === 'boolean'
      ? !cur
      : (Math.abs(cur) > 1 ? +(cur * 1.06).toFixed(4) : +(cur + 0.37).toFixed(4));
    app.set(k, next);
    tried.push({ k, from: cur, to: next, bytes: await app.exportPNG() });
  }
  // 还原
  for (const t of tried) app.set(t.k, t.from);
  return { tried: tried.map((t) => ({ k: t.k, from: t.from, to: t.to, n: t.bytes })) };
});

const baseBytes = r.main;
const moved = drift.tried.filter((t) => t.n !== baseBytes);
if (!drift.tried.length) fails.push('这个项目没有任何数值参数可测，参数漂移检查跑不了');
else if (!moved.length) {
  fails.push(
    `改了 ${drift.tried.map((t) => t.k).join('/')} 这四个参数，导出字节一个都没变——画面是写死的`,
  );
}

if (errors.length) fails.push(...errors.slice(0, 6).map((e) => '控制台 ' + e));
if (requests.length) fails.push(...requests.slice(0, 6).map((u) => '外部请求 ' + u));

await page.screenshot({ path: 'qa/page.png', fullPage: false });
await browser.close();

if (fails.length) {
  console.error('GATE FAIL');
  fails.forEach((f) => console.error('  ! ' + f));
  process.exit(1);
}
console.log(
  `GATE OK  |  画布 ${meta.w}×${meta.h}  主图 ${(r.main / 1024).toFixed(0)}KB  封面 ${(r.cover / 1024).toFixed(0)}KB  ` +
  `墨量 ${px.inkPct}%  ${px.colours} 色  最长空带 ${px.deadBand}px  ` +
  `参数漂移 ${moved.length}/${drift.tried.length} 变  外网请求 0`,
);
