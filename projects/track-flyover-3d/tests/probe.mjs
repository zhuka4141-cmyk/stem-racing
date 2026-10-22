/* 三个测试共用的启动器。改这一处 = 改全部测试的启动行为。
   规范来源：static-site-qa skill
   跑法：被 gate / visual / fonts / ascii 引用，不单独跑 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
export const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
export const W = 1080, H = 1920;

/** 项目自检钩子的名字。换项目只改这一行。 */
export const HOOK = '__track';

/**
 * 打开页面并收集错误。返回的 errors 数组里出现任何一条都算门禁失败。
 * 断言的是「真的画出来了」而不是「等了 N 秒」。
 */
export async function open({ expectNetworkErrors = false } = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  // 离线是硬要求：只要不是 file: / data: / blob: 一律判死
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
      external.push(u);
      errors.push(`外部网络请求（必须离线）: ${u}`);
    }
  });

  await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });

  // 等第一帧真的画出来：采样画布，非背景色像素够多才算
  await page.waitForFunction((hook) => {
    const app = window[hook];
    if (!app || !app.canvas) return false;
    const c = app.canvas;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < d.length; i += 4 * 997) {
      if (d[i] > 22 || d[i + 1] > 22 || d[i + 2] > 22) nonBg++;
    }
    return nonBg > 8;
  }, HOOK, { timeout: 20000 }).catch(() => errors.push('画布在 20 s 内没有渲染出内容'));

  return { browser, page, errors, external };
}
