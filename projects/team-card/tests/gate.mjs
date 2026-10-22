/* Gate: proves the artifact loads and exports real bytes from file://, with the
   network hard-blocked. Any console error, page error, failed request, 4xx, or an
   export that is not a valid 1080-wide PNG fails the build. */

import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXE = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe`;
const URL_TARGET = pathToFileURL(path.join(ROOT, 'index.html')).href;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const errors = [];
const notes = [];
mkdirSync(path.join(ROOT, 'qa'), { recursive: true });

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--force-color-profile=srgb'],
});

const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

const offOrigin = [];
page.on('request', (r) => {
  const u = r.url();
  if (!/^(file:|blob:|data:)/.test(u)) offOrigin.push(u);
});

await page.addInitScript(() => {
  let s = 12345;
  Math.random = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  Date.now = () => 1700000000000;
});
await page.emulateMedia({ reducedMotion: 'reduce' });

await page.goto(URL_TARGET, { waitUntil: 'load' });
await page.waitForFunction(() => window.__teamcard && window.__teamcard.ready(), null, { timeout: 15000 });

/* --- fonts actually resolved (vendored woff2 must survive file://) --------- */
const fontOk = await page.evaluate(() => ({
  display: document.fonts.check('700 96px "Barlow Condensed"'),
  mono: document.fonts.check('400 13px "JetBrains Mono"'),
}));
if (!fontOk.display || !fontOk.mono) errors.push(`fonts not loaded: ${JSON.stringify(fontOk)}`);

/* --- live redraw on form input (debounced, no reload) ---------------------- */
const before = await page.evaluate(() => document.querySelector('#stage svg text').textContent);
await page.fill('input[data-bind="name"]', 'AXIOM RAPID');
await page.waitForFunction(
  () => document.querySelector('#stage svg').innerHTML.includes('AXIOM'),
  null, { timeout: 3000 },
);
const after = await page.evaluate(() => document.querySelector('#stage svg').textContent);
if (before === after) errors.push('preview did not redraw after input');
if (after.length < 100) errors.push('preview svg looks empty');
await page.fill('input[data-bind="name"]', 'VECTOR DYNAMICS');
await page.waitForFunction(
  () => document.querySelector('#stage svg').innerHTML.includes('VECTOR'),
  null, { timeout: 3000 },
);

/* --- export: real PNG bytes at the exact contract sizes ------------------- */
async function probe(variant) {
  return page.evaluate(async (v) => {
    const blob = await window.__teamcard.exportPng(v);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const bmp = await createImageBitmap(blob);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    return { size: buf.length, head: Array.from(buf.slice(0, 8)), w: bmp.width, h: bmp.height, b64: btoa(bin) };
  }, variant);
}

for (const [variant, want] of [['4:5', [1080, 1350]], ['9:16', [1080, 1920]]]) {
  const r = await probe(variant);
  const bytes = Buffer.from(r.b64, 'base64');
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) errors.push(`${variant}: not a PNG (head ${r.head})`);
  if (bytes.length < 50_000) errors.push(`${variant}: export only ${bytes.length} bytes`);
  if (r.w !== want[0] || r.h !== want[1]) errors.push(`${variant}: ${r.w}x${r.h}, expected ${want.join('x')}`);
  const file = path.join(ROOT, 'qa', `export-${want[0]}x${want[1]}.png`);
  writeFileSync(file, bytes);
  notes.push(`${variant} -> ${want[0]}x${want[1]}  ${bytes.length} bytes`);
}

/* --- uploaded crest must survive SVG -> canvas rasterisation -------------- */
const crest = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#FF00FF';
  x.fillRect(0, 0, 64, 64);
  window.__teamcard.set({ crest: c.toDataURL('image/png') });
  const blob = await window.__teamcard.exportPng('4:5');
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  cv.getContext('2d').drawImage(bmp, 0, 0);
  const px = cv.getContext('2d').getImageData(884, 268, 1, 1).data;
  window.__teamcard.set({ crest: null });
  return [px[0], px[1], px[2]];
});
if (Math.abs(crest[0] - 255) > 12 || crest[1] > 20 || Math.abs(crest[2] - 255) > 12) {
  errors.push(`crest did not rasterise: centre pixel rgb(${crest.join(',')})`);
} else {
  notes.push(`crest rendered into export: rgb(${crest.join(',')})`);
}

/* --- 9:16 furniture must rasterise, not dissolve into the ground ----------- */
const rail = await page.evaluate(async () => {
  const blob = await window.__teamcard.exportPng('9:16');
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const cx = cv.getContext('2d');
  cx.drawImage(bmp, 0, 0);
  const at = (x, y) => {
    const d = cx.getImageData(x, y, 1, 1).data;
    return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  };
  return { line: at(600, 1732), bg: at(600, 1704), tick: at(56, 1740), gap: at(110, 1740) };
});
if (rail.line - rail.bg < 8) {
  errors.push(`9:16 ruler line invisible (${rail.line.toFixed(1)} on ${rail.bg.toFixed(1)} ground)`);
}
if (rail.tick - rail.gap < 8) {
  errors.push(`9:16 ruler ticks invisible (${rail.tick.toFixed(1)} vs ${rail.gap.toFixed(1)})`);
}
if (rail.line - rail.bg >= 8 && rail.tick - rail.gap >= 8) notes.push('9:16 ruler rasterised');

/* --- screenshots ---------------------------------------------------------- */
await page.setViewportSize({ width: 1080, height: 1920 });
await page.screenshot({ path: path.join(ROOT, 'qa', 'vertical-1080x1920.png') });
await page.setViewportSize({ width: 1440, height: 900 });
await page.screenshot({ path: path.join(ROOT, 'qa', 'desktop-1440x900.png') });

/* --- the two-column layout must not collapse or overlap ------------------- */
const layout = await page.evaluate(() => {
  const panelEl = document.querySelector('aside.panel');
  const panel = panelEl.getBoundingClientRect();
  const stage = document.querySelector('main.stage-col').getBoundingClientRect();
  const svg = document.querySelector('#stage svg').getBoundingClientRect();
  return {
    overlap: panel.right > stage.left + 1,
    svgW: Math.round(svg.width),
    svgH: Math.round(svg.height),
    panelOverflow: panelEl.scrollWidth - panelEl.clientWidth,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});
if (layout.overlap) errors.push('panel overlaps the card stage at 1440x900');
if (layout.svgW < 200) errors.push(`preview collapsed to ${layout.svgW}px wide at 1440x900`);
if (layout.panelOverflow > 1) errors.push(`form panel overflows horizontally by ${layout.panelOverflow}px`);
if (layout.docOverflow > 1) errors.push(`page scrolls sideways by ${layout.docOverflow}px`);
if (!layout.overlap && layout.svgW >= 200) notes.push(`1440x900 ok, card ${layout.svgW}x${layout.svgH}`);

/* --- phone: single column, no sideways scroll ----------------------------- */
await page.setViewportSize({ width: 390, height: 844 });
const phone = await page.evaluate(() => ({
  docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  svgW: Math.round(document.querySelector('#stage svg').getBoundingClientRect().width),
}));
if (phone.docOverflow > 1) errors.push(`phone layout scrolls sideways by ${phone.docOverflow}px`);
if (phone.svgW < 100) errors.push(`phone preview collapsed to ${phone.svgW}px`);
if (phone.docOverflow <= 1 && phone.svgW >= 100) notes.push(`390x844 ok, card ${phone.svgW}px`);
await page.setViewportSize({ width: 1080, height: 1920 });


/* --- the 9:16 live preview is reachable too ------------------------------- */
await page.click('[data-variant="9:16"]');
const dims = await page.evaluate(() => {
  const s = document.querySelector('#stage svg');
  return [s.getAttribute('width'), s.getAttribute('height')];
});
if (dims[0] !== '1080' || dims[1] !== '1920') errors.push(`9:16 preview is ${dims.join('x')}`);

if (offOrigin.length) errors.push(`off-origin request(s): ${offOrigin.join(', ')}`);

await browser.close();

notes.forEach((n) => console.log('  ' + n));
if (errors.length) {
  console.error('\nGATE FAILED\n' + errors.join('\n'));
  process.exit(1);
}
console.log('GATE OK');
