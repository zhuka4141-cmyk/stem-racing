/* 字形缺失检测 —— 防中文静默丢字
   原理：把每个字符渲染到离屏 canvas，和一个「一定没有字形」的私用区码位比位图。
   两张位图完全一致 = 这个字被渲染成豆腐块 = 字体缺字。

   字符集不是手写的：把 CanvasRenderingContext2D.fillText 包一层，
   页面画上去的每一个字都会被记下来，所以画布里贴的中文也跑不掉。
   只在特定状态下才画出来的字，写在同目录的 charset.mjs。
   跑法：node tests/fonts.mjs */

import { open } from './platform.mjs';
import { EXTRA } from './charset.mjs';

const { browser, page } = await open({
  initScript: () => {
    window.__drawn = [];
    const P = CanvasRenderingContext2D.prototype;
    for (const m of ['fillText', 'strokeText']) {
      const orig = P[m];
      P[m] = function (t, ...a) { window.__drawn.push(String(t)); return orig.call(this, t, ...a); };
    }
  },
});

const r = await page.evaluate((EXTRA) => {
  // 先取快照：下面测字形时会用自己的 canvas 画字，会把 __drawn 污染
  const drawn = (window.__drawn || []).slice();

  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 64;
  const cx = cv.getContext('2d', { willReadFrequently: true });

  const TOFU = '\uE81F';    // 私用区，一定没有字形

  const sig = (ch, font) => {
    cx.clearRect(0, 0, 48, 64);
    cx.fillStyle = '#fff';
    cx.font = font;
    cx.textBaseline = 'top';
    cx.fillText(ch, 2, 2);
    const d = cx.getImageData(0, 0, 48, 64).data;
    let h = 2166136261, ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8) ink++;
      h ^= d[i + 3];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return { hash: h, ink };
  };

  const stacks = {
    MONO: '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace',
    DISP: '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC","Microsoft YaHei",sans-serif',
  };

  const used = new Set();
  const walk = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) for (const ch of n.textContent) used.add(ch);
      else if (n.nodeType === 1) walk(n);
    }
  };
  walk(document.body);
  for (const s of drawn) for (const ch of s) used.add(ch);
  for (const s of EXTRA) for (const ch of s) used.add(ch);

  const results = { stacks: {}, missing: [], total: used.size };
  for (const [name, font] of Object.entries(stacks)) {
    const tofu = sig(TOFU, `500 40px ${font}`);
    let checked = 0, miss = 0;
    for (const ch of used) {
      if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') continue;
      checked++;
      const s = sig(ch, `500 40px ${font}`);
      if (s.hash === tofu.hash && s.ink === tofu.ink) {
        miss++;
        results.missing.push(`${name}: '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
      }
    }
    results.stacks[name] = { checked, miss, tofuInk: tofu.ink };
  }
  return results;
}, EXTRA);

await browser.close();

console.log('=== 字形覆盖 ===');
console.log(`  页面用到的不同字符数: ${r.total}`);
for (const [k, v] of Object.entries(r.stacks)) {
  console.log(`  ${k.padEnd(6)} 检查 ${String(v.checked).padStart(4)} 字  缺 ${v.miss}  豆腐基准墨量 ${v.tofuInk}`);
}
if (r.missing.length) {
  console.error('\n缺字明细:');
  for (const m of r.missing.slice(0, 40)) console.error('  ' + m);
  if (r.missing.length > 40) console.error(`  ...还有 ${r.missing.length - 40} 个`);
  console.error('\n字形检测失败');
  process.exit(1);
}
console.log('\n字形检测通过：所有字符都有真实字形，没有豆腐块');
