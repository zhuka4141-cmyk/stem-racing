/* 门禁公共部分 · 五个项目共用
   每个项目自己的 tests/gate.mjs 只写「这个项目特有的断言」，
   通用的那几件事（静态扫描、运行时插桩、截图、导出取证、外站资源、外网请求）都在这里。

   用法：
     import { gate } from './core.mjs';
     await gate('项目名', async ({ page, fail, notes, guard, QA }) => { ... });
   body 里可以返回一行汇总字符串，打印在 GATE OK 后面。 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, isLocal } from './platform.mjs';

/* 只查 API 调用形态，不查孤立单词——页面上确实会出现「无本地存储」这种说明文字 */
const FORBIDDEN = [
  [/\bfetch\s*\(/, 'fetch('],
  [/new\s+XMLHttpRequest/, 'new XMLHttpRequest'],
  [/\.sendBeacon\s*\(/, 'sendBeacon('],
  [/localStorage\s*\.\s*set/, 'localStorage.set'],
  [/sessionStorage\s*\.\s*set/, 'sessionStorage.set'],
  [/indexedDB\s*\.\s*open/, 'indexedDB.open'],
  [/document\s*\.\s*cookie\s*=/, 'document.cookie='],
];

/* 在页面脚本之前插进去，把联网和存储入口全部记账 */
const SPY = () => {
  window.__spy = { fetch: 0, xhr: 0, beacon: 0, setItem: 0, idb: 0 };
  const f = window.fetch;
  window.fetch = function (...a) { window.__spy.fetch++; return f.apply(this, a); };
  const XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...a) { window.__spy.xhr++; return XO.apply(this, a); };
  const sb = navigator.sendBeacon;
  navigator.sendBeacon = function (...a) { window.__spy.beacon++; return sb.apply(this, a); };
  const si = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...a) { window.__spy.setItem++; return si.apply(this, a); };
  if (window.indexedDB) {
    const io = indexedDB.open;
    indexedDB.open = function (...a) { window.__spy.idb++; return io.apply(this, a); };
  }
};

export async function gate(name, body) {
  const ROOT = process.cwd();
  const QA = join(ROOT, 'qa');
  mkdirSync(QA, { recursive: true });

  const fails = [];
  const notes = [];
  const fail = m => { fails.push(m); };
  const guard = async (label, fn) => {
    try { return await fn(); }
    catch (e) { fail(`${label}: ${String(e.message).split('\n')[0].slice(0, 150)}`); return null; }
  };

  /* ---------- 1. 静态扫描 ---------- */
  let BUNDLE = '';
  try { BUNDLE = readFileSync(join(ROOT, 'dist', 'app.js'), 'utf8'); }
  catch { fail('读不到 dist/app.js，先跑 node build.mjs'); }
  let hits = 0;
  for (const [re, label] of FORBIDDEN) {
    if (re.test(BUNDLE)) { fail(`产物里出现禁用 API: ${label}`); hits++; }
  }
  notes.push(`dist/app.js ${(BUNDLE.length / 1024).toFixed(0)}KB 静态扫描：${FORBIDDEN.length} 条规则 ${hits} 命中`);

  /* ---------- 2. 起浏览器 ---------- */
  const { browser, page, errors, net } = await open({ initScript: SPY });
  await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 20000 })
    .catch(() => fail('20s 内没拿到 window.__app'));

  const ctx = { page, browser, errors, net, fail, notes, guard, QA, ROOT };

  /* ---------- 3. 项目自己的断言 ---------- */
  let summary = '';
  try {
    summary = (await body(ctx)) || '';
  } catch (e) {
    fail(`断言段抛异常: ${String(e.message).split('\n')[0].slice(0, 200)}`);
  }

  /* ---------- 4. 导出必须是真 PNG ---------- */
  const exp = await guard('导出', () => page.evaluate(() => window.__app.exportProbe()));
  if (exp) {
    for (const [k, v] of Object.entries(exp)) {
      if (!v.magic) fail(`${k} 导出不是 PNG`);
      if (v.size <= 4096) fail(`${k} 导出只有 ${v.size} B`);
    }
    writeFileSync(join(QA, 'export-size.json'), JSON.stringify(exp, null, 2));
    notes.push(`导出 竖版 ${(exp.vertical.size / 1024).toFixed(0)}KB / 封面 ${(exp.cover.size / 1024).toFixed(0)}KB`);
  }

  /* ---------- 5. 插桩计数必须全是 0 ---------- */
  const spy = await page.evaluate(() => window.__spy).catch(() => null);
  if (!spy) fail('读不到插桩计数');
  else for (const [k, v] of Object.entries(spy)) {
    if (v !== 0) fail(`运行时插桩 ${k} 被调用 ${v} 次`);
  }

  /* ---------- 6. 页面里不许有外站资源 ---------- */
  const foreign = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('img[src],script[src],link[href],iframe[src],video[src],audio[src]')) {
      const u = el.getAttribute('src') || el.getAttribute('href') || '';
      if (u && !/^(\.\/|\/|file:|data:|blob:|#)/.test(u)) bad.push(u);
    }
    return bad;
  }).catch(() => []);
  if (foreign.length) fail(`页面引用了外站资源: ${foreign.slice(0, 3).join(', ')}`);

  /* ---------- 7. 截图取证 ---------- */
  await page.setViewportSize({ width: 1080, height: 1920 }).catch(() => {});
  await page.screenshot({ path: join(QA, 'vertical.png') }).catch(e => fail(`竖版截图: ${e.message}`));
  await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await page.screenshot({ path: join(QA, 'desktop.png') }).catch(e => fail(`桌面截图: ${e.message}`));

  /* ---------- 8. 收尾 ---------- */
  if (errors.length) fail(...errors.slice(0, 6));
  const external = net.filter(u => !isLocal(u));
  if (external.length) fail(`外部网络请求: ${external.slice(0, 5).join(', ')}`);
  notes.push(`全程请求 ${net.length} 条，全部 file:// / data: / blob:`);

  await browser.close();

  if (fails.length) {
    console.log(`\nGATE FAIL · ${name}`);
    for (const m of fails) console.log(`  ✗ ${m}`);
    process.exit(1);
  }

  console.log(`---------- 记录 · ${name} ----------`);
  for (const n of notes) console.log(`  · ${n}`);
  console.log('');
  const e = exp || { vertical: { size: 0 }, cover: { size: 0 } };
  console.log(
    `GATE OK  |  竖版 ${(e.vertical.size / 1024).toFixed(0)}KB  封面 ${(e.cover.size / 1024).toFixed(0)}KB` +
    `  |  外网请求 0` + (summary ? `  |  ${summary}` : '')
  );
}
