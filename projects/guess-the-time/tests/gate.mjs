/* gate.mjs — headless acceptance gate. Exit 0 only if every check passes.
 *
 * Run: npm run gate      (or: node tests/gate.mjs)
 */
import { chromium } from 'playwright-core';
import { readPng } from './png.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const QA = join(ROOT, 'qa');
const FORCE_2D = process.env.GT_BACKEND === '2d' || process.argv.includes('--2d');
const SUF = FORCE_2D ? '-2d' : '';
const EXPECT = FORCE_2D ? 'canvas2d' : 'webgpu';
const PAGE = pathToFileURL(join(ROOT, 'index.html')).href + (FORCE_2D ? '?backend=2d' : '');

const CHROME =
  process.env.GT_CHROME ||
  'C:\\Users\\lstcstudent\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';

const fails = [];
const notes = [];
function check(cond, label, detail) {
  if (cond) notes.push(`  ok   ${label}${detail ? '  ' + detail : ''}`);
  else fails.push(`${label}${detail ? '  -> ' + detail : ''}`);
}

function near(rgb, target, tol = 26) {
  return Math.abs(rgb[0] - target[0]) <= tol &&
    Math.abs(rgb[1] - target[1]) <= tol &&
    Math.abs(rgb[2] - target[2]) <= tol;
}

await mkdir(QA, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1
});
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
const badRequests = [];
const netRequests = [];

page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
page.on('requestfailed', (r) => badRequests.push(`${r.url()} ${r.failure()?.errorText || ''}`));
page.on('response', (r) => { if (r.status() >= 400) badRequests.push(`${r.status()} ${r.url()}`); });
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) netRequests.push(u);
});

// Enforce the no-network claim instead of merely observing it.
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
  return route.abort();
});

await page.goto(PAGE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.ready === true, null, { timeout: 20000 });

const backend = await page.evaluate(() => window.__backendKind);
const webgpuError = await page.evaluate(() => window.__webgpuError || null);
const hasGpu = await page.evaluate(() => !!navigator.gpu);
notes.push(`  info backend=${backend}  navigator.gpu=${hasGpu}  gpuError=${webgpuError || 'none'}`);

// ---- determinism --------------------------------------------------------
const det = await page.evaluate(() => {
  const a = window.GT.makeCar('4407');
  const b = window.GT.makeCar('4407');
  const c = window.GT.makeCar('4408');
  return {
    sameTime: a.sim.time === b.sim.time,
    sameParams: JSON.stringify(a.p) === JSON.stringify(b.p),
    sameWindows: JSON.stringify(a.question) === JSON.stringify(b.question),
    differentCar: c.sim.time !== a.sim.time,
    time: a.sim.time,
    seed: a.seed
  };
});
check(backend === EXPECT, 'render backend is the requested path', backend);
check(det.sameTime && det.sameParams && det.sameWindows, 'deterministic RNG: same seed -> same car',
  `seed ${det.seed} t=${det.time.toFixed(4)}s`);
check(det.differentCar, 'deterministic RNG: different seed -> different car');

// ---- self test ----------------------------------------------------------
const st = await page.evaluate(() => window.__game.selfTest({ seeds: 400 }));
check(st.ok, 'selfTest() passes', `${st.checked} seeds, ${st.failureCount} failures`);
if (!st.ok) st.failures.forEach((f) => notes.push(`       ! ${f}`));
check(st.extreme && st.extreme.outOfBand === true,
  'selfTest() checker can actually fail', `extreme car = ${st.extreme?.time?.toFixed(3)}s`);

// ---- question shape -----------------------------------------------------
const q = await page.evaluate(() => {
  const car = window.GT.makeCar('4407');
  return {
    windows: car.question.windows,
    correct: car.question.correctIndex,
    time: car.sim.time,
    hits: car.question.windows.filter((w) => car.sim.time >= w.lo && car.sim.time <= w.hi).length
  };
});
check(q.hits === 1, 'exactly one of the three windows is correct', `hits=${q.hits}`);
check(q.time >= 1.0 && q.time <= 1.25, 'time inside 1.00-1.25 s', `${q.time.toFixed(4)} s`);

// ---- armed frame --------------------------------------------------------
await page.screenshot({ path: join(QA, 'frame-1080x1920-armed' + SUF + '.png') });
const armedShot = await readPng(join(QA, 'frame-1080x1920-armed' + SUF + '.png'));
check(armedShot.width === 1080 && armedShot.height === 1920, 'armed screenshot is 1080x1920',
  `${armedShot.width}x${armedShot.height}`);

// ---- text safe area + minimum size -------------------------------------
const rects = await page.evaluate(() => window.__game.textRects());
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const outOfSafe = rects.filter((r) =>
  r.x0 < SAFE.x0 - 1 || r.x1 > SAFE.x1 + 1 || r.y0 < SAFE.y0 - 1 || r.y1 > SAFE.y1 + 1);
const smallFonts = rects.filter((r) => r.size < 48);
check(rects.length > 8, 'text layer reported its runs', `${rects.length} runs`);
check(outOfSafe.length === 0, 'all text inside the safe area',
  outOfSafe.map((r) => `"${r.text}" ${r.x0.toFixed(0)}..${r.x1.toFixed(0)}/${r.y0.toFixed(0)}..${r.y1.toFixed(0)}`).join(' | '));
check(smallFonts.length === 0, 'every run is at least 48 px',
  smallFonts.map((r) => `"${r.text}" ${r.size}px`).join(' | '));

// ---- play one round -----------------------------------------------------
const play = await page.evaluate(() => {
  const s = window.__game.state();
  window.__game.choose(s.correctIndex);
  return { correctIndex: s.correctIndex };
});
await page.waitForFunction(() => window.__game.state().phase === 'revealed', null, { timeout: 15000 });
await page.screenshot({ path: join(QA, 'frame-1080x1920-revealed' + SUF + '.png') });

const revealRects = await page.evaluate(() => window.__game.textRects());
const revealSmall = revealRects.filter((r) => r.size < 48);
const revealOut = revealRects.filter((r) =>
  r.x0 < SAFE.x0 - 1 || r.x1 > SAFE.x1 + 1 || r.y0 < SAFE.y0 - 1 || r.y1 > SAFE.y1 + 1);
check(revealSmall.length === 0, 'reveal: every run is at least 48 px',
  revealSmall.map((r) => `"${r.text}" ${r.size}px`).join(' | '));
check(revealOut.length === 0, 'reveal: all text inside the safe area',
  revealOut.map((r) => `"${r.text}" ${r.x0.toFixed(0)}..${r.x1.toFixed(0)}/${r.y0.toFixed(0)}..${r.y1.toFixed(0)}`).join(' | '));
check(play.correctIndex === q.correct, 'choosing the correct option is accepted');

// ---- export -------------------------------------------------------------
const b64 = await page.evaluate(async () => {
  const blob = await window.__game.exportPng();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return { size: blob.size, data: btoa(s) };
});
const png = Buffer.from(b64.data, 'base64');
await writeFile(join(QA, 'export' + SUF + '.png'), png);
check(png.length === b64.size, 'export byte count matches the blob', `${png.length} bytes`);
check(png.length > 50 * 1024, 'export is larger than 50 KB', `${(png.length / 1024).toFixed(1)} KB`);

const ex = await readPng(join(QA, 'export' + SUF + '.png'));
check(ex.width === 1080 && ex.height === 1920, 'export is 1080x1920', `${ex.width}x${ex.height}`);

// The reveal screen must be in the exported bytes: the big time numeral is
// painted in the accent colour and exists only after the run.
const ACCENT = [232, 89, 12];
let accentInTimeBand = 0;
for (let y = 1140; y < 1300; y++) {
  for (let x = 60; x < 930; x++) {
    if (near(ex.pixel(x, y), ACCENT)) accentInTimeBand++;
  }
}
check(accentInTimeBand > 400, 'export contains the post-reveal result screen',
  `${accentInTimeBand} accent pixels in the result band`);
check(ex.distinctColours(7) > 24, 'export is a rendered frame, not a flat fill',
  `${ex.distinctColours(7)} distinct colours`);
check(!near(ex.pixel(20, 20), [0, 0, 0], 2), 'export background is painted, not blank',
  `corner=${[...ex.pixel(20, 20)].join(',')}`);

// ---- other aspect ratio -------------------------------------------------
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForFunction(() => {
  const st = document.getElementById('stage');
  return st && st.style.transform.indexOf('scale') === 0;
}, null, { timeout: 8000 });
await page.screenshot({ path: join(QA, 'frame-1440x900' + SUF + '.png') });
const wide = await readPng(join(QA, 'frame-1440x900' + SUF + '.png'));
check(wide.width === 1440 && wide.height === 900, '1440x900 screenshot captured',
  `${wide.width}x${wide.height}`);

// ---- runtime hygiene ----------------------------------------------------
check(pageErrors.length === 0, 'no uncaught page errors', pageErrors.join(' | '));
check(consoleErrors.length === 0, 'no console.error', consoleErrors.join(' | '));
check(badRequests.length === 0, 'no failed or 4xx requests', badRequests.join(' | '));
check(netRequests.length === 0, 'no network requests at runtime', netRequests.join(' | '));

await browser.close();

// ---- report -------------------------------------------------------------
console.log('\n'.concat(notes.join('\n')));
const wgpuLine = backend === 'webgpu'
  ? 'WebGPU: ACTIVE'
  : `WebGPU: FALLBACK to Canvas2D (${webgpuError || 'unsupported'})`;
console.log('\n' + wgpuLine);

if (fails.length) {
  console.log('\nFAILED ' + fails.length + ' check(s):');
  fails.forEach((f) => console.log('  x  ' + f));
  process.exit(1);
}
console.log('\nGATE PASS (' + notes.length + ' checks)');
