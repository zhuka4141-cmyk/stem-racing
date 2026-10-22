import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const CHROME = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
export const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
export const W = 1080, H = 1920;

export async function open() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  const external = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { browser, page, errors, external };
}