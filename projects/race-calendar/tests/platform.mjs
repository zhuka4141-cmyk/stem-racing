/* 四个测试共用的启动器
   规则来源：static-site-qa skill —— 失败即非零退出码，绝不放宽。 */

import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
export const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
export const W = 1080, H = 1920;

/** 只允许本地协议，别的都算联网 */
export const isLocal = u =>
  u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:');

/**
 * 打开页面并挂好监听。
 * @param {{ initScript?: Function, viewport?: {width:number,height:number} }} opts
 */
export async function open(opts = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({
    viewport: opts.viewport || { width: W, height: H },
    deviceScaleFactor: 1,
  });

  const errors = [];   // 任何一条都直接 fail
  const net = [];      // 记录所有请求，gate 用它断言离线

  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => {
    if (isLocal(r.url())) return;
    errors.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText}`);
  });
  page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  page.on('request', r => {
    const u = r.url();
    net.push(u);
    if (!isLocal(u)) errors.push(`外部网络请求（必须离线）: ${u}`);
  });

  if (opts.initScript) await page.addInitScript(opts.initScript);

  await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 15000 })
    .catch(() => errors.push('15s 内没拿到 window.__app'));

  return { browser, page, errors, net };
}
