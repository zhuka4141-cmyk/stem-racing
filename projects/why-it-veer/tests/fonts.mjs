import { open } from './platform.mjs';

/* 中文一旦落进只带拉丁字形的字体，浏览器不会报错，只是不画字。
   这里直接把 CJK 串和等长拉丁串画到离屏 canvas 上比墨量。 */
const { browser, page } = await open();
const r = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 200;
  const g = c.getContext('2d');
  const ink = () => {
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 24) n++;
    return n;
  };
  const cjkFont = '64px "Microsoft YaHei","Microsoft YaHei UI",sans-serif';
  g.font = cjkFont; g.fillText('偏移诊断 质心', 20, 100);
  const cjk = ink();
  g.clearRect(0, 0, c.width, c.height);
  g.font = cjkFont; g.fillText('ABCDEFGH', 20, 100);
  const latin = ink();
  g.clearRect(0, 0, c.width, c.height);
  g.font = '64px Consolas,monospace'; g.fillText('4.0 mm', 20, 100);
  const num = ink();
  const probe = g.measureText('偏').width;
  return { cjk, latin, num, probe };
});
await browser.close();

const fails = [];
if (r.cjk < 2000) fails.push(`CJK 墨量只有 ${r.cjk}，字体没带中文字形`);
if (r.cjk < r.latin * 0.4) fails.push(`CJK ${r.cjk} 远少于拉丁 ${r.latin}，疑似静默丢字`);
if (!(r.probe > 40 && r.probe < 90)) fails.push(`「偏」宽度 ${r.probe.toFixed(1)}px 不正常`);
if (r.num < 500) fails.push(`数字墨量 ${r.num} 过低`);

if (fails.length) { fails.forEach(f => console.error('  ' + f)); process.exit(1); }
console.log(`字体门禁通过  |  CJK 墨量 ${r.cjk}  拉丁 ${r.latin}  数字 ${r.num}  「偏」宽 ${r.probe.toFixed(1)}px`);