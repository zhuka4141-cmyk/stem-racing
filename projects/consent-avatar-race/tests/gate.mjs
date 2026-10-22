/* 回归门禁 · consent-avatar-race
   跑法：node tests/gate.mjs
   失败即非零退出码。

   这个项目光看「页面能不能开」不够。它要证明的是：
   1) 页面上根本没有联网出口
   2) 照片只能从 <input type=file> 进来
   3) 没勾同意生不出东西
   4) blob URL 建了几个就收几个
   5) 刷新之后照片不在了
   6) 导出的是真 PNG，不是空文件

   每一条都是可执行的断言，不是注释。 */

import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, isLocal } from './platform.mjs';
import { writeTestPNG } from './pngfixture.mjs';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const ROOT = process.cwd();
const URL = pathToFileURL(join(ROOT, 'index.html')).href;
const QA = join(ROOT, 'qa');
mkdirSync(QA, { recursive: true });

const fails = [];
const notes = [];
const fail = m => { fails.push(m); };

/* ---------- 0. 准备一张合成测试图（不是真人照片） ---------- */
const FIXTURE = join(QA, 'test-input.png');
const fxBytes = writeTestPNG(FIXTURE, 512, 512);
if (fxBytes < 1000) fail(`测试图太小 ${fxBytes} B`);
notes.push(`测试图 qa/test-input.png ${(fxBytes / 1024).toFixed(0)}KB（合成色块，非真人照片）`);

/* ---------- 1. 静态扫描：源码里不许有联网 / 存储 API ---------- */
// 只查 API 调用形态，不查孤立单词——页面上确实写着「无本地存储」这种说明文字
const BUNDLE = readFileSync(join(ROOT, 'dist', 'app.js'), 'utf8');
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch('],
  [/new\s+XMLHttpRequest/, 'new XMLHttpRequest'],
  [/\.sendBeacon\s*\(/, 'sendBeacon('],
  [/localStorage\s*\.\s*set/, 'localStorage.set'],
  [/sessionStorage\s*\.\s*set/, 'sessionStorage.set'],
  [/indexedDB\s*\.\s*open/, 'indexedDB.open'],
  [/document\s*\.\s*cookie\s*=/, 'document.cookie='],
];
for (const [re, label] of FORBIDDEN) {
  if (re.test(BUNDLE)) fail(`产物里出现禁用 API: ${label}`);
}
notes.push(`dist/app.js ${(BUNDLE.length / 1024).toFixed(0)}KB 静态扫描：${FORBIDDEN.length} 条规则 0 命中`);

/* ---------- 2. 运行时插桩：任何联网/存储调用都会被记账 ---------- */
const SPY = () => {
  window.__spy = { fetch: 0, xhr: 0, beacon: 0, setItem: 0, idb: 0 };
  const f = window.fetch;
  window.fetch = function (...a) { window.__spy.fetch++; return f.apply(this, a); };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...a) { window.__spy.xhr++; return XO.apply(this, a); };
  const sb = navigator.sendBeacon;
  if (sb) navigator.sendBeacon = function (...a) { window.__spy.beacon++; return sb.apply(this, a); };
  for (const store of ['localStorage', 'sessionStorage']) {
    try {
      const s = window[store];
      const si = s.setItem.bind(s);
      s.setItem = function (...a) { window.__spy.setItem++; return si(...a); };
    } catch { /* 某些上下文里 storage 不可用，忽略 */ }
  }
  try {
    const io = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (...a) { window.__spy.idb++; return io(...a); };
  } catch { /* 同上 */ }
};

/* ---------- 3. 跑起来 ---------- */
let browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
let page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

const errors = [];
const net = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => { if (!isLocal(r.url())) errors.push(`requestfailed: ${r.url()}`); });
page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
page.on('request', r => {
  net.push(r.url());
  if (!isLocal(r.url())) errors.push(`外部网络请求（必须离线）: ${r.url()}`);
});
await page.addInitScript(SPY);
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 15000 })
  .catch(() => fail('15s 内没拿到 window.__app'));

/* ---------- 4. 初始状态 ---------- */
const st0 = await page.evaluate(() => ({
  ...window.__app.stats(),
  disabled: document.getElementById('race').disabled,
}));
if (st0.photos !== 0) fail(`初始就有照片: ${st0.photos}`);
if (st0.consent !== false) fail('初始同意状态必须是 false');
if (st0.disabled !== true) fail('未勾同意时「发车」按钮必须是 disabled');

/* ---------- 5. 不勾同意 → 发不出去 ---------- */
const blocked = await page.evaluate(() => {
  const before = window.__app.stats().blockedRuns;
  const ret = window.__app.race();          // 直接调函数，绕过 disabled
  const s = window.__app.stats();
  return { ret, before, after: s.blockedRuns, hasResults: s.hasResults };
});
if (blocked.ret !== false) fail('未勾同意时 race() 必须返回 false');
if (blocked.hasResults) fail('未勾同意却生成了成绩');
if (blocked.after !== blocked.before + 1) fail('未勾同意没被计数拦截');

// 真去点一下被禁用的按钮，结果必须一样
await page.click('#race', { force: true }).catch(() => {});
const afterClick = await page.evaluate(() => window.__app.stats().hasResults);
if (afterClick) fail('点被禁用的按钮也生成了成绩');

/* ---------- 6. 塞一张本机测试图 ---------- */
await page.setInputFiles('#file', FIXTURE);
await page.waitForFunction(() => window.__app.stats().photos > 0, null, { timeout: 8000 })
  .catch(() => fail('setInputFiles 之后没有记录到照片'));

const st1 = await page.evaluate(() => window.__app.stats());
if (st1.photos < 1) fail('照片没进内存');
if (st1.objectUrlCreated < 1) fail('没有走 createObjectURL 路径');
if (st1.objectUrlCreated !== st1.objectUrlRevoked) {
  fail(`blob URL 没回收: 建 ${st1.objectUrlCreated} / 收 ${st1.objectUrlRevoked}`);
}
notes.push(`照片入内存 ${st1.photos} 张，blob URL 建 ${st1.objectUrlCreated} 收 ${st1.objectUrlRevoked}`);

/* ---------- 7. 页面里不能有指向外部的资源 ---------- */
const foreign = await page.evaluate(() =>
  [...document.querySelectorAll('img,video,audio,iframe,script,link[rel=stylesheet]')]
    .map(el => el.getAttribute('src') || el.getAttribute('href') || '')
    .filter(u => /^(https?:)?\/\//i.test(u) || /^[a-z]+:\/\//i.test(u) && !/^(file|data|blob):/i.test(u)));
if (foreign.length) fail(`页面里有外部资源: ${foreign.join(', ')}`);

/* ---------- 8. 勾同意 → 发车 ---------- */
await page.evaluate(() => window.__app.setConsent(true));
const enabled = await page.evaluate(() => document.getElementById('race').disabled);
if (enabled !== false) fail('勾了同意「发车」按钮还是 disabled');

await page.click('#race');
const st2 = await page.evaluate(() => window.__app.getState());
if (!st2.results || st2.results.length < 1) fail('发车之后没有成绩');
const ranks = (st2.results || []).map(r => r.rank).sort((a, b) => a - b);
if (ranks.join(',') !== ranks.map((_, i) => i + 1).join(',')) {
  fail(`名次不是 1..n 连续排列: ${ranks.join(',')}`);
}
const ts = (st2.results || []).map(r => r.t);
if (ts.some(t => !(t > 0.5 && t < 3))) fail(`用时越界: ${ts.join(', ')}`);

/* ---------- 9. 确定性：同种子同结果 ---------- */
const det = await page.evaluate(() => {
  window.__app.setSeed(12345);
  window.__app.race();
  const a = window.__app.getState().results.map(r => r.name + ':' + r.t.toFixed(6)).join('|');
  window.__app.race();
  const b = window.__app.getState().results.map(r => r.name + ':' + r.t.toFixed(6)).join('|');
  window.__app.setSeed(12345);
  window.__app.race();
  const c = window.__app.getState().results.map(r => r.name + ':' + r.t.toFixed(6)).join('|');
  return { a, b, c };
});
if (det.a !== det.b) fail('同种子连续两次结果不一致');
if (det.a !== det.c) fail('重置到同一种子后结果不一致');

/* ---------- 10. 导出：字节数 + PNG 魔数 ---------- */
const exp = await page.evaluate(async () => await window.__app.exportProbe())
  .catch(e => { fail('导出抛错: ' + e.message); return null; });
if (exp) {
  if (!(exp.vertical.size > 4096)) fail(`竖版导出过小: ${exp.vertical.size} B`);
  if (!(exp.vertical.magic)) fail('竖版导出不是 PNG（魔数不对）');
  if (!(exp.cover.size > 4096)) fail(`封面导出过小: ${exp.cover.size} B`);
  if (!(exp.cover.magic)) fail('封面导出不是 PNG（魔数不对）');
}

/* ---------- 11. 运行时插桩必须还是 0 ---------- */
const spy = await page.evaluate(() => window.__spy);
for (const [k, v] of Object.entries(spy)) {
  if (v !== 0) fail(`运行期调用了 ${k} ${v} 次（必须为 0）`);
}

/* ---------- 12. 截图证据 ---------- */
await page.screenshot({ path: join(QA, 'vertical.png'), fullPage: false });
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: join(QA, 'desktop.png'), fullPage: false });
await page.setViewportSize({ width: 1080, height: 1920 });

/* ---------- 12.5 撤销同意必须同时撤销成绩 ---------- */
const withdrawn = await page.evaluate(() => {
  window.__app.setConsent(true);
  window.__app.race();
  const had = window.__app.stats().hasResults;
  window.__app.setConsent(false);
  return { had, after: window.__app.stats().hasResults,
           disabled: document.getElementById('race').disabled };
});
if (!withdrawn.had) fail('撤销同意前本来应该有成绩');
if (withdrawn.after) fail('撤销同意后成绩还留在卡上');
if (withdrawn.disabled !== true) fail('撤销同意后「发车」按钮没变回 disabled');
notes.push('撤销同意后成绩清空、按钮回到 disabled');

/* ---------- 13. 刷新之后照片必须消失 ---------- */
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 15000 })
  .catch(() => fail('刷新后 15s 内没拿到 window.__app'));
const st3 = await page.evaluate(() => window.__app.stats());
if (st3.photos !== 0) fail(`刷新后还有 ${st3.photos} 张照片（说明被持久化了）`);
if (st3.hasResults) fail('刷新后成绩还在');
notes.push('刷新后 photos=0 / results=null');

/* ---------- 14. 全程零外网 ---------- */
if (errors.length) fail(...errors.slice(0, 6));
const external = net.filter(u => !isLocal(u));
if (external.length) fail(`全程出现外部请求: ${external.join(', ')}`);
notes.push(`全程请求 ${net.length} 条，全部 file:// / data: / blob:`);

/* ---------- 收尾 ---------- */
await browser.close();

console.log('---------- 记录 ----------');
notes.forEach(n => console.log('  · ' + n));

if (fails.length) {
  console.error('\nGATE FAIL');
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log(`\nGATE OK  |  竖版 ${(exp.vertical.size / 1024).toFixed(0)}KB  封面 ${(exp.cover.size / 1024).toFixed(0)}KB  |  外网请求 0  |  blob 建${st1.objectUrlCreated}/收${st1.objectUrlRevoked}`);
