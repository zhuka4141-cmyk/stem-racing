/* 字形缺失检测 —— 防止中文静默丢字
   原理：把每个字符渲染到离屏 canvas，和一个「一定不存在字形」的私用区码位比对。
   如果位图完全一致，说明这个字符被渲染成了豆腐块（tofu），即字体缺字。
   跑法：node tests/fonts.mjs */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const URL = pathToFileURL(join(process.cwd(), 'index.html')).href;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 64;
  const cx = cv.getContext('2d', { willReadFrequently: true });

  // 私用区码位一定没有字形，用它当豆腐块基准
  const TOFU = '\uE81F';

  const sig = (ch, font) => {
    cx.clearRect(0, 0, 48, 64);
    cx.fillStyle = '#fff';
    cx.font = font;
    cx.textBaseline = 'top';
    cx.fillText(ch, 2, 2);
    const d = cx.getImageData(0, 0, 48, 64).data;
    let h = 2166136261;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8) ink++;
      h ^= d[i + 3];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return { hash: h, ink };
  };

  const stacks = {
    MONO: '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace',
    DISP: '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif',
  };

  // 收集页面实际用到的全部字符
  const texts = [
    ...document.querySelectorAll('body *').values?.() ?? [],
  ];
  const used = new Set();
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) for (const c of n.textContent) used.add(c);
      else if (n.nodeType === 1) walk(n);
    }
  };
  walk(document.body);
  // 画布里画的中文，页面 DOM 里没有，手工补上
  for (const s of ['为什么迎角一改成绩就掉了秒同一条轨道次发车只有不一样来流尾区车长虚拟风洞参数增加倍力雷诺动压可信度']) {
    used.add(s);
  }

  const results = { stacks: {}, missing: [] };
  for (const [name, font] of Object.entries(stacks)) {
    const tofu = sig(TOFU, `500 40px ${font}`);
    let checked = 0, miss = 0;
    for (const ch of used) {
      if (ch === ' ' || ch === '\n' || ch === '\t') continue;
      const s = sig(ch, `500 40px ${font}`);
      checked++;
      // 位图与豆腐块完全一致 → 缺字
      if (s.hash === tofu.hash && s.ink === tofu.ink) {
        miss++;
        results.missing.push(`${name}: '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase()}`);
      }
    }
    results.stacks[name] = { checked, miss, tofuInk: tofu.ink };
  }
  return results;
});

await browser.close();

console.log('=== 字形覆盖 ===');
for (const [k, v] of Object.entries(r.stacks)) {
  console.log(`  ${k.padEnd(6)} 检查 ${String(v.checked).padStart(3)} 字  缺 ${v.miss}  豆腐基准墨量 ${v.tofuInk}`);
}
if (r.missing.length) {
  console.error('\n缺字明细:');
  for (const m of r.missing.slice(0, 40)) console.error('  ' + m);
  if (r.missing.length > 40) console.error(`  ...还有 ${r.missing.length - 40} 个`);
  console.error('\n字形检测失败');
  process.exit(1);
}
console.log('\n字形检测通过：所有字符都有真实字形，没有豆腐块');
