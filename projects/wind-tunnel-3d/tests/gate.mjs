/* 回归门禁 · wind-tunnel-3d
   规范来源：static-site-qa skill
   跑法：node tests/gate.mjs
   失败即非零退出码。 */

import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const ROOT = process.cwd();
const URL = pathToFileURL(join(ROOT, 'index.html')).href;

mkdirSync(join(ROOT, 'qa'), { recursive: true });

const errors = [];
const warns = [];

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});

page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
page.on('request', r => {
  const u = r.url();
  if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
    errors.push(`外部网络请求（必须离线）: ${u}`);
  }
});

await page.goto(URL, { waitUntil: 'load' });

// 等 WebGL 首帧真的画出来，而不是等固定时间
await page.waitForFunction(() => {
  const c = document.getElementById('stage');
  if (!c) return false;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  // 采样中心像素，非纯背景色即认为已渲染
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4 * 997) {
    if (d[i] > 20 || d[i + 1] > 20 || d[i + 2] > 20) nonBg++;
  }
  return nonBg > 5;
}, null, { timeout: 15000 }).catch(() => errors.push('画布在 15s 内没有渲染出内容'));

// --- 自检 ---
const selfTest = await page.evaluate(() => window.__windtunnel?.selfTest?.());
if (!selfTest) errors.push('缺少 __windtunnel.selfTest');
else if (!selfTest.ok) errors.push(`selfTest 失败: ${selfTest.reasons.join(' / ')}`);

// --- 物理断言：迎角增大阻力必须增大 ---
const phys = await page.evaluate(() => {
  const t = window.__windtunnel;
  t.set(0, 18);   const a = t.getMetrics();
  t.set(8, 18);   const b = t.getMetrics();
  t.set(4, 18);
  return { f0: a.force, f8: b.force, cd0: a.cd, cd8: b.cd, re: a.re };
});
if (!(phys.f8 > phys.f0)) errors.push(`迎角 8° 阻力(${phys.f8}) 未大于 0°(${phys.f0})`);
if (!(phys.re > 1e5 && phys.re < 1e6)) errors.push(`Re 越界: ${phys.re}`);
if (!isFinite(phys.f0)) errors.push('阻力非有限数');

// --- 导出必须产出真实字节 ---
const exp = await page.evaluate(async () => {
  const t = window.__windtunnel;
  return { vertical: await t.exportPNG(), cover: await t.exportCover() };
}).catch(e => { errors.push(`导出抛错: ${e.message}`); return null; });

if (exp) {
  if (!(exp.vertical > 4096)) errors.push(`竖版导出过小: ${exp.vertical} B`);
  if (!(exp.cover > 4096)) errors.push(`封面导出过小: ${exp.cover} B`);
}

// --- 截图证据 ---
await page.setViewportSize({ width: 1080, height: 1920 });
await page.screenshot({ path: join(ROOT, 'qa', 'vertical.png'), fullPage: false });

await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: join(ROOT, 'qa', 'desktop.png'), fullPage: false });

// 交互后画面必须变化（暂停/参数改变要有反馈）
await page.setViewportSize({ width: 1080, height: 1920 });
const before = await page.screenshot();
await page.evaluate(() => window.__windtunnel.set(9, 26));
await page.waitForTimeout(300);
const after = await page.screenshot();
if (Buffer.compare(before, after) === 0) errors.push('改参数后画面无变化');

await browser.close();

if (warns.length) console.warn('WARN:\n' + warns.join('\n'));
if (errors.length) {
  console.error('\n门禁失败：');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
console.log(`GATE OK  |  竖版 ${(exp.vertical / 1024).toFixed(0)}KB  封面 ${(exp.cover / 1024).toFixed(0)}KB  Re=${phys.re.toExponential(2)}`);
