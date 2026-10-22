/* 字形缺失检测 —— 防止中文静默丢字。
   原理：把每个字符渲染到离屏 canvas，和一个「一定没有字形」的私用区码位比对。
   位图完全一致 → 这个字符被画成了豆腐块，也就是字体缺字。
   字符集不靠手抄：装一个 fillText 钩子，把画布上真实画过的字全抓下来。
   跑法：node tests/fonts.mjs */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { CHROME, W, H, HOOK } from './probe.mjs';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });

// 钩子必须在 app.js 之前装好
await page.addInitScript(() => {
  window.__drawn = new Set();
  const orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) {
    if (typeof t === 'string') for (const ch of t) window.__drawn.add(ch);
    return orig.call(this, t, ...rest);
  };
});

await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });

// 等第一帧画完，再让进度扫一遍，把不同进度的文案都逼出来
await page.waitForFunction((h) => !!window[h] && window[h].canvas, HOOK, { timeout: 20000 });
await page.waitForTimeout(900);
await page.evaluate((h) => { window[h].setPaused(true); }, HOOK);
for (const p of [0, 0.2, 0.42, 0.63, 0.8, 1]) {
  await page.evaluate(({ h, p }) => window[h].setProgress(p), { h: HOOK, p });
  await page.waitForTimeout(90);
}

const r = await page.evaluate((h) => {
  const stacks = window[h].stacks;

  // 页面 DOM 里的字（面板、说明）也要查
  const used = new Set(window.__drawn);
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) for (const ch of n.textContent) used.add(ch);
      else if (n.nodeType === 1) walk(n);
    }
  };
  walk(document.body);

  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 64;
  const cx = cv.getContext('2d', { willReadFrequently: true });

  const TOFU = '\uE81F';   // 私用区，一定没有字形

  const sig = (ch, font) => {
    cx.clearRect(0, 0, 48, 64);
    cx.fillStyle = '#fff';
    cx.font = font;
    cx.textBaseline = 'top';
    cx.fillText(ch, 2, 2);
    const d = cx.getImageData(0, 0, 48, 64).data;
    let hash = 2166136261, ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8) ink++;
      hash ^= d[i + 3];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return { hash, ink };
  };

  const results = { stacks: {}, missing: [], total: used.size };
  for (const [name, font] of Object.entries(stacks)) {
    const tofu = sig(TOFU, `500 40px ${font}`);
    let checked = 0, miss = 0;
    for (const ch of used) {
      if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') continue;
      const s = sig(ch, `500 40px ${font}`);
      checked++;
      if (s.hash === tofu.hash && s.ink === tofu.ink) {
        miss++;
        results.missing.push(
          `${name}: '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        );
      }
    }
    results.stacks[name] = { checked, miss, tofuInk: tofu.ink };
  }
  return results;
}, HOOK);

await browser.close();

console.log('=== 字形覆盖 ===');
console.log(`  画布 + DOM 共采集 ${r.total} 个不同字符`);
for (const [k, v] of Object.entries(r.stacks)) {
  console.log(`  ${k.padEnd(5)} 检查 ${String(v.checked).padStart(3)} 字  缺 ${v.miss}  豆腐基准墨量 ${v.tofuInk}`);
}
if (r.missing.length) {
  console.error('\n缺字明细:');
  for (const m of r.missing.slice(0, 40)) console.error('  ' + m);
  if (r.missing.length > 40) console.error(`  ...还有 ${r.missing.length - 40} 个`);
  console.error('\n字形检测失败');
  process.exit(1);
}
console.log('\n字形检测通过：所有字符都有真实字形，没有豆腐块');
