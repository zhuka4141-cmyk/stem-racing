/* 把导出的那张卡原样存到 qa/card.png，供人眼复核。
   和 gate 的截图不同：这是画布本体 1080×1920，不带浏览器 UI、不带面板。
   项目里定义了 window.__app.preview() 的话会先调用，把卡摆到最有代表性的状态。
   跑法：node tests/shot.mjs */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { open } from './platform.mjs';

mkdirSync('qa', { recursive: true });

const { browser, page } = await open();

await page.evaluate(async () => {
  if (window.__app && typeof window.__app.preview === 'function') {
    await window.__app.preview();
  }
});

const dataUrl = await page.evaluate(() => window.__app.canvas.toDataURL('image/png'));
const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(join('qa', 'card.png'), buf);

// 4:5 封面另存一张：和 reel-export 的 resample 同样的 cover 逻辑（居中裁切，不拉伸）
const cover = await page.evaluate(async () => {
  const c = window.__app.canvas;
  const out = document.createElement('canvas');
  out.width = 1080; out.height = 1350;
  const x = out.getContext('2d');
  const s = Math.max(out.width / c.width, out.height / c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(c, (out.width - c.width * s) / 2, (out.height - c.height * s) / 2,
    c.width * s, c.height * s);
  const b = await new Promise(r => out.toBlob(r, 'image/png'));
  return await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(b);
  });
});
const cbuf = Buffer.from(cover.split(',')[1], 'base64');
writeFileSync(join('qa', 'card-cover.png'), cbuf);

await browser.close();
console.log(`qa/card.png ${(buf.length / 1024).toFixed(0)}KB  qa/card-cover.png ${(cbuf.length / 1024).toFixed(0)}KB`);
