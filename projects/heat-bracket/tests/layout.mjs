/* 排版体检（开发用，不进四道门禁）
   1. 每段文字的精确 bbox（canvas measureText，和 SVG 同一套字形度量）→ 查越界与重叠
   2. 逐 20px 墨量剖面 → 查空带，比 ASCII 图精确得多 */
import { open } from './platform.mjs';

const { browser, page, meta } = await open();

const res = await page.evaluate(({ safe }) => {
  const W = window.__app.canvas.width, H = window.__app.canvas.height;
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  const cx = cv.getContext('2d');

  const boxes = window.__app.items().map(it => {
    cx.font = `${it.weight} ${it.size}px ${it.font}`;
    const m = cx.measureText(it.s);
    const w = m.width + it.ls * Math.max(0, it.s.length - 1);
    const x0 = it.anchor === 'end' ? it.x - w : it.anchor === 'middle' ? it.x - w / 2 : it.x;
    const asc = m.actualBoundingBoxAscent || it.size * 0.78;
    const desc = m.actualBoundingBoxDescent || it.size * 0.22;
    return { s: it.s, x0, x1: x0 + w, y0: it.y - asc, y1: it.y + desc, size: it.size };
  });

  const oob = boxes.filter(b => b.x0 < 6 || b.x1 > W - 6 || b.y0 < 6 || b.y1 > H - 6)
    .map(b => `${JSON.stringify(b.s.slice(0, 18))} x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)} y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}`);

  const ov = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ox > 2 && oy > 2) ov.push([a.s.slice(0, 16), b.s.slice(0, 16), Math.round(ox), Math.round(oy)]);
    }
  }

  const c = window.__app.canvas;
  const img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const prof = [];
  for (let y = 0; y < H; y += 20) {
    let ink = 0, tot = 0;
    for (let yy = y; yy < Math.min(y + 20, H); yy += 4)
      for (let x = safe.x0; x < safe.x1; x += 8) {
        tot++;
        const i = (yy * W + x) * 4;
        if (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2] > 24) ink++;
      }
    prof.push([y, Math.round(ink / tot * 100)]);
  }
  return { W, H, oob, ov: ov.slice(0, 40), ovTotal: ov.length, prof, n: boxes.length };
}, { safe: meta.safe });

await browser.close();

console.log(`文字 ${res.n} 段  |  越界 ${res.oob.length}  |  重叠 ${res.ovTotal}`);
if (res.oob.length) { console.log('--- 越界 ---'); res.oob.forEach(s => console.log('  ' + s)); }
if (res.ov.length) {
  console.log('--- 重叠 ---');
  res.ov.forEach(([a, b, ox, oy]) => console.log(`  ${JSON.stringify(a)} ⨯ ${JSON.stringify(b)}  交叠 ${ox}×${oy}px`));
}

console.log('--- 逐 20px 墨量（横轴 0–30%）---');
const bars = res.prof.map(([y, p]) => `${String(y).padStart(4)} ${String(p).padStart(3)}% ${'▇'.repeat(Math.round(p / 1.2))}`);
for (let i = 0; i < bars.length; i += 3) console.log('  ' + [bars[i], bars[i + 1], bars[i + 2]].filter(Boolean).join('   |   '));
