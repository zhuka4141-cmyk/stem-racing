/* 回归门禁 · team-directory
   跑法：node tests/gate.mjs

   这个项目要证明的：
   1) 数据只来自本地常量，页面没有联网出口
   2) 按角色筛选和按关键词搜索都对，且不会混进不该有的人
   3) 搜不到人的时候卡上不是一片空白（这是最容易糊弄过去的一条）
   4) 导出的是真 PNG
   5) 刷新之后状态回到默认

   每一条都是可执行的断言。 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, isLocal } from './platform.mjs';

const ROOT = process.cwd();
const QA = join(ROOT, 'qa');
mkdirSync(QA, { recursive: true });

const fails = [];
const notes = [];
const fail = m => { fails.push(m); };

/* ---------- 1. 静态扫描：产物里不许有联网 / 存储 API ---------- */
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
let hits = 0;
for (const [re, label] of FORBIDDEN) {
  if (re.test(BUNDLE)) { fail(`产物里出现禁用 API: ${label}`); hits++; }
}
notes.push(`dist/app.js ${(BUNDLE.length / 1024).toFixed(0)}KB 静态扫描：${FORBIDDEN.length} 条规则 ${hits} 命中`);

/* ---------- 2. 运行时插桩 ---------- */
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

const { browser, page, errors, net } = await open({ initScript: SPY });

const guard = async (label, fn) => {
  try { return await fn(); }
  catch (e) { fail(`${label}: ${String(e.message).split('\n')[0].slice(0, 140)}`); return null; }
};

await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 15000 })
  .catch(() => fail('15s 内没拿到 window.__app'));

/* ---------- 3. 默认状态 ---------- */
const d0 = await guard('默认状态', () => page.evaluate(() => ({
  ...window.__app.stats(), self: window.__app.selfTest(),
  cw: window.__app.canvas.width, ch: window.__app.canvas.height,
})));
if (d0) {
  if (d0.total !== 10) fail(`默认在册 ${d0.total} 人，应该是 10`);
  if (d0.shown !== d0.total) fail(`默认只显示 ${d0.shown} 人，应该全部显示`);
  if (d0.role !== '全部') fail(`默认筛选是「${d0.role}」，应该是「全部」`);
  if (!d0.self.ok) fail(`selfTest: ${d0.self.errs.join(' / ')}`);
  if (d0.cw !== 1080 || d0.ch !== 1920) fail(`画布 ${d0.cw}x${d0.ch}，应该是 1080x1920`);
  notes.push(`默认在册 ${d0.total} 人，全部显示`);
}

/* ---------- 4. 按角色筛选 ---------- */
const byRole = await guard('角色筛选', () => page.evaluate(() => {
  const out = {};
  for (const r of ['队长', '机械', '电控', '设计', '数据']) {
    window.__app.setRole(r);
    out[r] = window.__app.stats().shown;
  }
  window.__app.setRole('机械');
  const names = window.__app.getState();
  return { counts: out, shownNames: names.shown };
}));
if (byRole) {
  const sum = Object.values(byRole.counts).reduce((a, b) => a + b, 0);
  if (sum !== 10) fail(`各角色人数加起来是 ${sum}，不等于在册 10 人`);
  if (byRole.counts['机械'] !== 3) fail(`机械组 ${byRole.counts['机械']} 人，数据里是 3 人`);
  if (byRole.counts['队长'] !== 1) fail(`队长 ${byRole.counts['队长']} 人，应该正好 1 人`);
  if (!byRole.shownNames.includes('周牧野')) fail('机械组里没有周牧野');
  if (byRole.shownNames.includes('陈以理')) fail('机械组里混进了队长陈以理');
  notes.push(`角色筛选：${Object.entries(byRole.counts).map(([k, v]) => `${k}${v}`).join(' ')}，合计 ${sum}`);
}

/* ---------- 5. 搜索 ---------- */
const byQuery = await guard('搜索', () => page.evaluate(() => {
  window.__app.setRole('全部');
  window.__app.setQuery('林');
  const a = window.__app.getState();
  window.__app.setQuery('电控');
  const b = window.__app.getState();
  window.__app.setQuery('气瓶');
  const c = window.__app.getState();
  return { a, b, c };
}));
if (byQuery) {
  if (!byQuery.a.shown.includes('林知远')) fail('搜「林」没搜到林知远');
  if (byQuery.b.shown.length !== 2) fail(`搜「电控」出 ${byQuery.b.shown.length} 人，应该是 2`);
  if (!byQuery.c.shown.includes('林知远')) fail('搜一句话里的「气瓶」没搜到人');
  if (byQuery.a.shown.length === 0 || byQuery.c.shown.length === 0) fail('搜索命中为空');
  notes.push(`搜索：林→${byQuery.a.shown.length} 人 / 电控→${byQuery.b.shown.length} 人 / 气瓶→${byQuery.c.shown.length} 人`);
}

/* ---------- 6. 搜不到人时卡面不能是空的 ---------- */
const empty = await guard('空结果', () => page.evaluate(() => {
  window.__app.setQuery('zzzz不存在');
  return { shown: window.__app.stats().shown, ink: window.__app.inkPct() };
}));
if (empty) {
  if (empty.shown !== 0) fail(`无意义关键词居然匹配到 ${empty.shown} 人`);
  if (empty.ink < 8) fail(`空结果卡面墨量只有 ${empty.ink}%，等于一张空卡`);
  notes.push(`搜不到人时墨量 ${empty.ink}%（要求 ≥8%，不能是空卡）`);
}

/* ---------- 7. 回到默认 ---------- */
const back = await guard('重置', () => page.evaluate(() => {
  window.__app.reset();
  return window.__app.stats();
}));
if (back && back.shown !== 10) fail(`重置后只显示 ${back.shown} 人`);

/* ---------- 8. 截图取证 ---------- */
await page.setViewportSize({ width: 1080, height: 1920 });
await page.screenshot({ path: join(QA, 'vertical.png') }).catch(e => fail(`竖版截图: ${e.message}`));
await page.setViewportSize({ width: 1600, height: 1000 });
await page.screenshot({ path: join(QA, 'desktop.png') }).catch(e => fail(`桌面截图: ${e.message}`));

/* ---------- 9. 导出真 PNG ---------- */
const exp = await guard('导出', () => page.evaluate(() => window.__app.exportProbe()));
if (exp) {
  for (const [k, v] of Object.entries(exp)) {
    if (!v.magic) fail(`${k} 导出不是 PNG`);
    if (v.size <= 4096) fail(`${k} 导出只有 ${v.size} B`);
  }
  writeFileSync(join(QA, 'export-size.json'), JSON.stringify(exp, null, 2));
  notes.push(`导出 竖版 ${(exp.vertical.size / 1024).toFixed(0)}KB / 封面 ${(exp.cover.size / 1024).toFixed(0)}KB`);
}

/* ---------- 10. 插桩计数必须全是 0 ---------- */
const spy = await page.evaluate(() => window.__spy);
for (const [k, v] of Object.entries(spy)) {
  if (v !== 0) fail(`运行时插桩 ${k} 被调用 ${v} 次`);
}

/* ---------- 11. 页面里不许有外站资源 ---------- */
const foreign = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('img[src],script[src],link[href],iframe[src],video[src],audio[src]')) {
    const u = el.getAttribute('src') || el.getAttribute('href') || '';
    if (u && !/^(\.\/|\/|file:|data:|blob:|#)/.test(u)) bad.push(u);
  }
  return bad;
});
if (foreign.length) fail(`页面引用了外站资源: ${foreign.slice(0, 3).join(', ')}`);

/* ---------- 12. 刷新之后回到默认 ---------- */
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 15000 })
  .catch(() => fail('刷新后没拿到 window.__app'));
const after = await page.evaluate(() => window.__app.stats());
if (after.shown !== 10) fail(`刷新后显示 ${after.shown} 人，应该回到 10`);
if (after.q !== '') fail(`刷新后搜索框还留着「${after.q}」`);

/* ---------- 13. 收尾 ---------- */
if (errors.length) fail(...errors.slice(0, 6));
const external = net.filter(u => !isLocal(u));
if (external.length) fail(`外部网络请求: ${external.slice(0, 5).join(', ')}`);
notes.push(`全程请求 ${net.length} 条，全部 file:// / data: / blob:`);

await browser.close();

if (fails.length) {
  console.log('\nGATE FAIL');
  for (const m of fails) console.log(`  ✗ ${m}`);
  process.exit(1);
}

console.log('---------- 记录 ----------');
for (const n of notes) console.log(`  · ${n}`);
console.log('');
const e = exp || { vertical: { size: 0 }, cover: { size: 0 } };
console.log(`GATE OK  |  竖版 ${(e.vertical.size / 1024).toFixed(0)}KB  封面 ${(e.cover.size / 1024).toFixed(0)}KB  |  外网请求 0  |  在册 10 / 空结果墨量 ${empty ? empty.ink : '?'}%`);
