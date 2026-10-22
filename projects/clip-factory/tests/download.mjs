/* 批量导出实测 · clip-factory
   跑法：node tests/download.mjs

   gate.mjs 验的是「四张卡各能出一张真 PNG」，验不了「连点四次会不会被浏览器吞掉」。
   这个脚本真的点「导出全部 4 张」，数浏览器收到了几次 download。 */

import { open } from './platform.mjs';

const { browser, page, errors } = await open({});

const got = [];
page.on('download', d => got.push(d.suggestedFilename()));

await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 20000 });

const before = got.length;
await page.evaluate(() => window.__app.downloadAll());

// 每张之间隔 320ms，四张至少要 1.3s；给到 6s 兜网络磁盘慢的情况
await page.waitForTimeout(6000);

const names = got.slice(before);
await browser.close();

const fails = [];
if (names.length !== 4) fails.push(`浏览器只收到 ${names.length} 次下载，应该 4 次`);
const uniq = new Set(names);
if (uniq.size !== names.length) fails.push(`下载文件名有重复：${names.join(', ')}`);
for (const n of names) {
  if (!/^clip-factory-\w+-1080x1920\.png$/.test(n)) fails.push(`文件名不像样：${n}`);
}
for (const k of ['result', 'rival', 'split', 'sheet']) {
  if (!names.some(n => n.includes(`-${k}-`))) fails.push(`四张里缺 ${k}`);
}
if (errors.length) fails.push(...errors.slice(0, 4));

if (fails.length) {
  console.log('\nDOWNLOAD FAIL');
  for (const m of fails) console.log(`  ✗ ${m}`);
  process.exit(1);
}

console.log(`  · 依次收到 ${names.length} 次下载`);
console.log(`  · ${names.join('\n  · ')}`);
console.log('');
console.log(`DOWNLOAD OK  |  连续导出 ${names.length} 张，文件名互不相同`);
