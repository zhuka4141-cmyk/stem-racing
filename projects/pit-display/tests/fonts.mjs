/* 缺字检测：零豆腐块
   走的是作品正式排版用的同一条光栅路径（data:URL SVG -> Image -> canvas），
   所以它证明的是"屏幕上真的画出来了"，不是"字体配置看起来对"。
   两种失败都算缺字：位图与私用区码位的豆腐块完全一致，或者压根没画出任何墨。 */
import { open } from './platform.mjs';

const { browser, page } = await open();

const r = await page.evaluate(async () => {
  const texts = window.__app.texts() || '';
  const corpus = new Set();
  for (const ch of texts) corpus.add(ch);
  // 补充：所有会用到的字符类别，防止只测到恰好出现过的字
  for (const ch of '0123456789.,:;/+-%×°·—（）()[]{}#&@|')
    corpus.add(ch);
  for (let cp = 0x4E00; cp < 0x4E00 + 40; cp++) corpus.add(String.fromCodePoint(cp));

  const TOFU = '\uE81F';           // 私用区，任何字库里都没有字形
  const out = { stacks: {}, missing: [] };

  for (const [name, font] of Object.entries(window.__app.fonts)) {
    const tofu = await window.__app.probeGlyph(TOFU, font);
    let checked = 0, miss = 0;
    for (const ch of corpus) {
      if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') continue;
      const s = await window.__app.probeGlyph(ch, font);
      checked++;
      if (s.ink === 0) {
        miss++;
        out.missing.push(`${name}: '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase()} 无墨`);
      } else if (s.hash === tofu.hash && s.ink === tofu.ink) {
        miss++;
        out.missing.push(`${name}: '${ch}' U+${ch.codePointAt(0).toString(16).toUpperCase()} 豆腐块`);
      }
    }
    out.stacks[name] = { checked, miss, tofuInk: tofu.ink };
  }
  out.sample = texts.slice(0, 60);
  return out;
});

await browser.close();

console.log('=== 字形覆盖 ===');
for (const [k, v] of Object.entries(r.stacks)) {
  console.log(`  ${k.padEnd(5)} 检查 ${String(v.checked).padStart(4)} 字  缺 ${v.miss}  豆腐基准墨量 ${v.tofuInk}`);
}
console.log('  抽样文本: ' + r.sample.replace(/\n/g, ' / ').slice(0, 90));

if (r.missing.length) {
  console.error('\n缺字明细:');
  for (const m of r.missing.slice(0, 40)) console.error('  ' + m);
  if (r.missing.length > 40) console.error(`  ...还有 ${r.missing.length - 40} 个`);
  console.error('\n字形检测失败');
  process.exit(1);
}
console.log('\n字形检测通过：零豆腐块');
