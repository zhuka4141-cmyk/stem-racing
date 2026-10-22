/* 四个质检共用的启动器
   画布尺寸和安全区不写死在这里 —— 由作品自己通过 window.__app 声明，
   这样同一份测试可以直接搬到 1080×1350 和 1080×1920 的作品上。 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;

export async function open() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });

  const errors = [];
  const requests = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // data: / blob: / file: 都是本机内联资源，不算联网；其余一律记账
  page.on('request', r => {
    const u = r.url();
    if (!/^(data:|blob:|file:|about:|chrome-extension:)/.test(u)) requests.push(u);
  });

  await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__app, null, { timeout: 15000 });
  await page.evaluate(() => window.__app.ready());
  await page.waitForTimeout(150);

  const meta = await page.evaluate(() => ({
    w: window.__app.canvas.width,
    h: window.__app.canvas.height,
    safe: window.__app.safe,
  }));

  return { browser, page, errors, requests, meta };
}
