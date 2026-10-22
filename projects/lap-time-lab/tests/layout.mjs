#!/usr/bin/env node
/* 布局审计：node tests/layout.mjs
 * 视觉模型用不上时用这个：把截图降采样成字符密度图，再用 DOM 断言查溢出、重叠、丢字。
 * 这个脚本不进交付门禁，是给作者自己看构图的。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QA = path.join(ROOT, 'qa');
const CHROME = 'C:\\Users\\lstcstudent\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';

const require = createRequire(import.meta.url);
const { chromium } = require(
  'C:/Users/lstcstudent/OneDrive/Desktop/deeepseek/_stemlab/projects/wind-tunnel-3d/node_modules/playwright-core'
);

const RAMP = ' .:-=+*#%@';

async function asciiMap(page, pngPath, cols) {
  const b64 = fs.readFileSync(pngPath).toString('base64');
  const grid = await page.evaluate(async ({ b64, cols }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const rows = Math.max(1, Math.round((cols * img.height) / img.width * 0.5));
    const cv = document.createElement('canvas');
    cv.width = cols;
    cv.height = rows;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, cols, rows);
    const d = ctx.getImageData(0, 0, cols, rows).data;
    const out = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        row.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      }
      out.push(row);
    }
    return out;
  }, { b64, cols });

  console.log('\n=== ' + path.basename(pngPath) + ' ===');
  for (const row of grid) {
    console.log(row.map((l) => RAMP[Math.min(9, Math.floor(Math.pow(l / 255, 0.55) * 9.99))]).join(''));
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];

  await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
  await page.waitForFunction(() => window.__lab && window.__lab.ready === true);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  fs.mkdirSync(QA, { recursive: true });

  /* 1. 中文是否真的画出来了（三种字体栈分别测墨迹） */
  const cjk = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const stacks = {
      mono: cs.getPropertyValue('--font-mono').trim(),
      disp: cs.getPropertyValue('--font-disp').trim(),
      body: cs.getPropertyValue('--font-body').trim(),
    };
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 70;
    const ctx = cv.getContext('2d');
    const out = {};
    for (const [k, f] of Object.entries(stacks)) {
      ctx.clearRect(0, 0, 320, 70);
      ctx.font = '44px ' + f;
      ctx.fillStyle = '#fff';
      ctx.fillText('中文结构距离', 4, 52);
      const d = ctx.getImageData(0, 0, 320, 70).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++;
      out[k] = { ink, w: Math.round(ctx.measureText('中文结构距离').width) };
    }
    return out;
  });
  console.log('CJK 墨迹像素:', JSON.stringify(cjk));
  for (const [k, v] of Object.entries(cjk)) {
    if (v.ink < 400) problems.push(`字体栈 ${k} 画中文只有 ${v.ink} 个墨迹像素 —— 大概率丢字`);
  }

  /* 2. 溢出与重叠 */
  const audit = await page.evaluate(() => {
    const res = { hOverflow: document.documentElement.scrollWidth - window.innerWidth, boxes: {}, clipped: [] };
    const pick = (sel, name) => {
      const e = document.querySelector(sel);
      if (!e) return;
      const r = e.getBoundingClientRect();
      res.boxes[name] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    pick('.masthead', 'masthead');
    pick('#v-time', 'hero');
    pick('#bandstrip', 'bandstrip');
    pick('#stats', 'stats');
    pick('#controls', 'controls');
    ['#c-speed', '#c-energy', '#c-delta', '#c-lat'].forEach((s) => pick(s, s.slice(1)));
    pick('.consts', 'consts');

    // 任何有文字的元素，内容宽超过盒宽就是被裁了
    document.querySelectorAll('h1,p,span,dd,dt,button,div.label,.ctrl__val,.tip__note').forEach((e) => {
      if (!e.textContent.trim()) return;
      if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0) {
        res.clipped.push({
          cls: e.className || e.tagName,
          text: e.textContent.trim().slice(0, 28),
          scroll: e.scrollWidth,
          client: e.clientWidth,
        });
      }
    });
    return res;
  });

  console.log('横向溢出:', audit.hOverflow, 'px');
  if (audit.hOverflow > 0) problems.push(`页面比视口宽 ${audit.hOverflow}px`);
  console.log('主块位置:', JSON.stringify(audit.boxes, null, 0));
  if (audit.clipped.length) {
    console.log('被裁的文字:', JSON.stringify(audit.clipped, null, 1));
    problems.push(`${audit.clipped.length} 处文字被横向裁掉`);
  }

  await page.screenshot({ path: path.join(QA, 'desktop-1440x900.png') });
  await asciiMap(page, path.join(QA, 'desktop-1440x900.png'), 118);

  /* 3. 竖屏 + 导出海报 */
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.waitForFunction(() => document.getElementById('c-speed').getBoundingClientRect().width > 500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(QA, 'vertical-1080x1920.png') });
  await asciiMap(page, path.join(QA, 'vertical-1080x1920.png'), 78);

  const dataUrl = await page.evaluate(() => window.__lab.exportPngDataURL());
  const poster = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  fs.writeFileSync(path.join(QA, 'poster-1080x1920.png'), poster);
  console.log('\n海报 PNG:', poster.length, '字节');
  await asciiMap(page, path.join(QA, 'poster-1080x1920.png'), 78);

  const bbox = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const bands = new Array(24).fill(0);
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (d[i] + d[i+1] + d[i+2] > 150) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          bands[Math.min(23, Math.floor(y / 80))]++;
        }
      }
    }
    return { x0, y0, x1, y1, bands };
  }, poster.toString('base64'));

  console.log('海报墨迹范围: x ' + bbox.x0 + '..' + bbox.x1 + '  y ' + bbox.y0 + '..' + bbox.y1);
  console.log('每 80px 横带的墨迹像素:', bbox.bands.join(' '));
  if (bbox.y1 > 1480) problems.push('海报内容越过安全区下沿 y=' + bbox.y1);
  if (bbox.x1 > 930) problems.push('海报内容越过安全区右沿 x=' + bbox.x1);
  if (bbox.y0 < 240) problems.push('海报内容越过安全区上沿 y=' + bbox.y0);

  await browser.close();

  console.log('\n' + (problems.length ? '布局问题:\n  - ' + problems.join('\n  - ') : '布局审计通过'));
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
