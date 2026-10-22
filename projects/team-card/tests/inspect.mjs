/* Offline inspection: reads the exported raster and reports objective numbers —
   ink density per band, the colours actually used, and whether the vendored
   webfonts survived the SVG-as-image rasterisation. */
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

const report = await page.evaluate(async () => {
  const W = 1080, H = 1350;

  async function raster(withFonts) {
    const holder = document.createElement('div');
    holder.innerHTML = window.Card.build(window.__teamcard.state, '4:5');
    const svgEl = holder.firstElementChild;
    if (withFonts) {
      const st = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      st.textContent = window.Card.fontFaceCss('block');
      svgEl.insertBefore(st, svgEl.firstChild);
    }
    const xml = new XMLSerializer().serializeToString(svgEl);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0B0B0C';
    x.fillRect(0, 0, W, H);
    x.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    return x.getImageData(0, 0, W, H);
  }

  const A = await raster(true);
  const B = await raster(false);

  /* palette of the real render */
  const counts = new Map();
  for (let i = 0; i < A.data.length; i += 4) {
    const k = (A.data[i] << 16) | (A.data[i + 1] << 8) | A.data[i + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, n]) => ({
      hex: '#' + k.toString(16).padStart(6, '0').toUpperCase(),
      pct: +(100 * n / (W * H)).toFixed(2),
    }));

  /* ink density per 45 px band */
  const bands = [];
  for (let y0 = 0; y0 < H; y0 += 45) {
    let ink = 0;
    for (let y = y0; y < Math.min(H, y0 + 45); y += 2) {
      for (let x = 0; x < W; x += 2) {
        const i = (y * W + x) * 4;
        const r = A.data[i], g = A.data[i + 1], b = A.data[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum > 60 && lum < 235) ink++;
      }
    }
    bands.push(Math.round(100 * ink / (W / 2 * 45 / 2)));
  }

  /* webfont check: ink bbox of the team-name row */
  function inkBox(data, x0, y0, x1, y1, pred) {
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        if (pred(data[i], data[i + 1], data[i + 2])) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const dark = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) > 120;
  const nameA = inkBox(A.data, 40, 140, 720, 240, dark);
  const nameB = inkBox(B.data, 40, 140, 720, 240, dark);

  let diff = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) diff++;
  }

  return { palette, bands, nameA, nameB, diffPct: +(100 * diff / (W * H)).toFixed(2) };
});

console.log('palette:', JSON.stringify(report.palette));
console.log('name ink  with fonts:', JSON.stringify(report.nameA));
console.log('name ink  no fonts  :', JSON.stringify(report.nameB));
console.log('pixel diff with/without webfonts:', report.diffPct + '%');
console.log('\nink density per 45px band (y0: %)');
report.bands.forEach((v, i) => {
  const bar = '#'.repeat(Math.min(60, v));
  console.log(String(i * 45).padStart(5) + '  ' + String(v).padStart(3) + '  ' + bar);
});

await browser.close();
