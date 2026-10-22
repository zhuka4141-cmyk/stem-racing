import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const EXE = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const URL_TARGET = pathToFileURL(path.join(process.cwd(), 'index.html')).href;

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(URL_TARGET, { waitUntil: 'load' });
await page.waitForFunction(() => window.__teamcard && window.__teamcard.ready(), null, { timeout: 15000 });

const out = await page.evaluate(() => {
  const svg = document.querySelector('#stage svg');
  const H = +svg.getAttribute('height');
  const rows = [];
  svg.querySelectorAll('text').forEach((t) => {
    const b = t.getBBox();
    rows.push({
      s: t.textContent.slice(0, 30),
      x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      r: Math.round(b.x + b.width), b: Math.round(b.y + b.height),
      anchor: t.getAttribute('text-anchor') || 'start',
      font: (t.getAttribute('font-family') || '').slice(0, 12),
      size: +t.getAttribute('font-size'),
    });
  });

  const overflow = rows.filter((t) => t.x < -1 || t.r > 1081 || t.y < -1 || t.b > H + 1);

  // overlaps between text rows
  const overlaps = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], c = rows[j];
      const ox = Math.min(a.r, c.r) - Math.max(a.x, c.x);
      const oy = Math.min(a.b, c.b) - Math.max(a.y, c.y);
      if (ox > 2 && oy > 2) overlaps.push(`${a.s} | ${c.s} (${ox}x${oy})`);
    }
  }
  return { H, rows, overflow, overlaps };
});

console.log('--- text boxes (4:5) ---');
out.rows.forEach((t) => {
  console.log(`${String(t.y).padStart(5)} ${String(t.x).padStart(5)}..${String(t.r).padStart(5)}  ${String(t.size).padStart(3)}px  ${t.s}`);
});
console.log('\nerrors: overflow=' + JSON.stringify(out.overflow.map((o) => o.s)));
console.log('overlaps=' + JSON.stringify(out.overlaps));
await browser.close();
