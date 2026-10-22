/* 门禁：不许报错、不许联网、导出的 PNG 必须是真 PNG 且不是空画布 */
import { mkdirSync } from 'node:fs';
import { open } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors, requests, meta } = await open();
const fails = [];

const st = await page.evaluate(() => window.__app.selfTest());
if (!st.ok) fails.push('selfTest: ' + st.errs.join(' / '));

const r = await page.evaluate(async () => ({
  main: await window.__app.exportPNG(),
  cover: await window.__app.exportCover(),
}));

const MIN = 4096;
if (!(r.main > MIN)) fails.push(`主图 PNG 过小 ${r.main} B（< ${MIN}）`);
if (!(r.cover > MIN)) fails.push(`封面 PNG 过小 ${r.cover} B（< ${MIN}）`);

if (errors.length) fails.push(...errors.slice(0, 6).map(e => '控制台 ' + e));
if (requests.length) fails.push(...requests.slice(0, 6).map(u => '外部请求 ' + u));

await page.screenshot({ path: 'qa/page.png', fullPage: false });
await browser.close();

if (fails.length) {
  console.error('GATE FAIL');
  fails.forEach(f => console.error('  ! ' + f));
  process.exit(1);
}
console.log(`GATE OK  |  画布 ${meta.w}×${meta.h}  主图 ${(r.main / 1024).toFixed(0)}KB  封面 ${(r.cover / 1024).toFixed(0)}KB  外部请求 0`);
