/* 出全分辨率成图，供人工目检。不属于门禁，是开发时用的镜子。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { open } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, meta } = await open();

const b64 = await page.evaluate(() => window.__app.canvas.toDataURL('image/png').split(',')[1]);
const buf = Buffer.from(b64, 'base64');
const out = `qa/shot-${meta.w}x${meta.h}.png`;
writeFileSync(out, buf);
await browser.close();
console.log(`${out}  ${(buf.length / 1024).toFixed(0)}KB`);
