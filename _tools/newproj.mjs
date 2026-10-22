#!/usr/bin/env node
/* 项目脚手架 —— 30 个项目共用同一套构建/质检/导出骨架
   用法：node _tools/newproj.mjs <项目名> <模板>
   模板：three | canvas2d | svg | static
   生成后自带四个测试：gate / visual / fonts / ascii，全部能直接跑 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SHARED = join(ROOT, 'shared');
const [name, tmpl = 'canvas2d'] = process.argv.slice(2);

if (!name) {
  console.error('用法: node _tools/newproj.mjs <项目名> [three|canvas2d|svg|static]');
  process.exit(1);
}
if (!['three', 'canvas2d', 'svg', 'static'].includes(tmpl)) {
  console.error(`未知模板 "${tmpl}"，可选: three | canvas2d | svg | static`);
  process.exit(1);
}

const dir = join(ROOT, 'projects', name);
if (existsSync(join(dir, 'index.html'))) {
  console.error(`项目已存在: ${dir}`);
  process.exit(1);
}
for (const d of ['src', 'tests', 'qa']) mkdirSync(join(dir, d), { recursive: true });

const W = (p, s) => writeFileSync(join(dir, p), s, 'utf8');
const w = (s) => writeFileSync(s, '', 'utf8'); // placeholder

/* ---------- 共用：导出模块与设计变量直接引用 shared ---------- */
copyFileSync(join(SHARED, 'reel-export.js'), join(dir, 'src', 'reel-export.js'));
copyFileSync(join(SHARED, 'design-tokens.css'), join(dir, 'design-tokens.css'));

/* ---------- package.json ---------- */
W('package.json', JSON.stringify({
  name, private: true, type: 'module',
  scripts: {
    build: 'node build.mjs',
    gate: 'node tests/gate.mjs',
    visual: 'node tests/visual.mjs',
    fonts: 'node tests/fonts.mjs',
    ascii: 'node tests/ascii.mjs',
    check: 'node build.mjs && node tests/gate.mjs && node tests/visual.mjs && node tests/fonts.mjs',
  },
  devDependencies: { esbuild: '^0.28.2', 'playwright-core': '^1.64.1' },
}, null, 2) + '\n');

/* ---------- build.mjs ---------- */
const entryExt = tmpl === 'svg' || tmpl === 'static' ? '.js' : '.js';
W('build.mjs', `import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
// shared 是唯一真源，每次构建覆盖，避免各项目各改一份
copyFileSync('../../shared/reel-export.js', 'src/reel-export.js');
copyFileSync('../../shared/design-tokens.css', 'design-tokens.css');

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',          // file:// 下 ESM 会被 CORS 拦死，必须 IIFE
  target: ['chrome110'],
  minify: false,           // 保留可读性，出问题好查
  sourcemap: false,
  outfile: 'dist/app.js',
  logLevel: 'error',
});
console.log('build ok → dist/app.js');
`);

/* ---------- index.html ---------- */
const canvasTag = tmpl === 'svg'
  ? '  <div id="stage" class="stage"></div>'
  : '  <canvas id="stage" width="1080" height="1920"></canvas>';

W('index.html', `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${name}</title>
<link rel="stylesheet" href="./design-tokens.css">
<style>
  html, body { margin: 0; background: #0b0b0c; color: var(--paper); }
  .wrap { display: flex; gap: 24px; padding: 24px; align-items: flex-start; }
  .stage { display: block; width: 540px; height: 960px; background: var(--ink); }
  .panel { font-family: var(--font-mono); font-size: var(--t-small); min-width: 260px; }
  .panel label { display: block; margin: 18px 0 6px; opacity: .6; }
  .panel input[type=range] { width: 100%; }
  .panel button {
    margin-top: 20px; width: 100%; padding: 14px; cursor: pointer;
    background: var(--accent); color: var(--ink);
    border: 0; border-radius: 0;          /* 硬边，不许圆角 */
    font: inherit; letter-spacing: .08em;
  }
  .panel button:hover { filter: brightness(1.1); }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">
${canvasTag}
  <div class="panel" id="panel">
    <label>参数</label>
    <input id="p1" type="range" min="0" max="10" step="0.1" value="4">
    <button id="export">导出 9:16</button>
  </div>
</div>
<script src="./dist/app.js"></script>
</body>
</html>
`);

/* ---------- src/main.js ---------- */
const common = `import { toPNG, assertPNG, exportEpisode, mulberry32 } from './reel-export.js';

const W = 1080, H = 1920;
const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
const ACCENT = '#e8590c';
const INK = '#0b0b0c';
const PAPER = '#f2f0eb';

const stage = document.getElementById('stage');
`;

const bodies = {
  three: `import * as THREE from 'three';

const glCanvas = document.createElement('canvas');
glCanvas.width = W; glCanvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, W / H, 0.001, 20);
camera.position.set(0.30, 0.085, 0.42);
camera.lookAt(0, 0.012, 0);

scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.6, 1.2, 0.9);
scene.add(key);

// TODO: 换成真实模型
const box = new THREE.Mesh(
  new THREE.BoxGeometry(0.2, 0.02, 0.03),
  new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.35 })
);
scene.add(box);

const ctx = stage.getContext('2d');
const state = { p1: 4 };

function compose() {
  renderer.render(scene, camera);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(glCanvas, 0, 0);

  ctx.save();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, 300, 46, 3);
  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = \`500 17px \${MONO}\`;
  ctx.fillText('${name.toUpperCase()}', SAFE.x0, 348);

  ctx.fillStyle = PAPER;
  ctx.font = \`600 60px \${DISP}\`;
  ctx.fillText('标题写在这里', SAFE.x0, 430);
  ctx.restore();
}

function loop() { compose(); requestAnimationFrame(loop); }
loop();
`,
  canvas2d: `const ctx = stage.getContext('2d');
const state = { p1: 4 };
const rand = mulberry32(0xC0FFEE);   // 固定种子，保证每次导出完全一致

function compose() {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.fillStyle = ACCENT;
  ctx.fillRect(SAFE.x0, 300, 46, 3);

  ctx.fillStyle = 'rgba(242,240,235,0.5)';
  ctx.font = \`500 17px \${MONO}\`;
  ctx.fillText('${name.toUpperCase()}', SAFE.x0, 348);

  ctx.fillStyle = PAPER;
  ctx.font = \`600 60px \${DISP}\`;
  ctx.fillText('标题写在这里', SAFE.x0, 430);

  // 数据区示例
  ctx.fillStyle = ACCENT;
  ctx.font = \`600 84px \${MONO}\`;
  ctx.fillText(state.p1.toFixed(1), SAFE.x0, 900);
  ctx.restore();
}

function loop() { compose(); requestAnimationFrame(loop); }
loop();
`,
  svg: `const ctx = null;                 // SVG 模板不用 canvas
const state = { p1: 4 };
const rand = mulberry32(0xC0FFEE);

function compose() {
  stage.innerHTML = \`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
      <rect width="1080" height="1920" fill="#0b0b0c"/>
      <rect x="60" y="300" width="46" height="3" fill="#e8590c"/>
      <text x="60" y="348" fill="rgba(242,240,235,0.5)" font-family='Noto Sans SC, Microsoft YaHei, sans-serif' font-size="17">${name.toUpperCase()}</text>
      <text x="60" y="430" fill="#f2f0eb" font-family='Noto Sans SC, Microsoft YaHei, sans-serif' font-size="60" font-weight="600">标题写在这里</text>
    </svg>\`;
}

compose();
`,
  static: `const state = { p1: 4 };

function compose() {
  document.body.style.background = INK;
}
compose();
`,
};

W('src/main.js', common + '\n' + bodies[tmpl] + '\n' + `/* ---------- 对外测试钩子 ---------- */
window.__app = {
  canvas: stage,
  getState: () => ({ ...state }),
  getMetrics: () => ({ p1: state.p1 }),
  set: (k, v) => { state[k] = v; compose(); },
  selfTest: () => {
    const errs = [];
    if (!(state.p1 >= 0)) errs.push('p1 非法');
    return { ok: errs.length === 0, errs };
  },
  // 测试路径不触发浏览器下载，只返回字节数，门禁直接断言
  exportPNG: async () => { compose(); const b = await toPNG(stage, { width: 1080, height: 1920 }); await assertPNG(b); return b.size; },
  exportCover: async () => { compose(); const b = await toPNG(stage, { width: 1080, height: 1350 }); await assertPNG(b); return b.size; },
  downloadAll: () => exportEpisode(stage, ''),
};
`);

/* ---------- tests/platform.mjs（三个测试共用的启动器） ---------- */
W('tests/platform.mjs', `import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const CHROME = \`\${process.env.LOCALAPPDATA}\\\\ms-playwright\\\\chromium-1223\\\\chrome-win64\\\\chrome.exe\`;
export const SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
export const W = 1080, H = 1920;

export async function open() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(pathToFileURL(join(process.cwd(), 'index.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  return { browser, page, errors };
}
`);

/* ---------- tests/gate.mjs ---------- */
W('tests/gate.mjs', `import { writeFileSync, mkdirSync } from 'node:fs';
import { open } from './platform.mjs';

mkdirSync('qa', { recursive: true });
const { browser, page, errors } = await open();
const fails = [];

const st = await page.evaluate(() => window.__app.selfTest());
if (!st.ok) fails.push('selfTest: ' + st.errs.join(', '));

const v = await page.evaluate(async () => await window.__app.exportPNG());
const c = await page.evaluate(async () => await window.__app.exportCover());
if (!(v > 4096)) fails.push(\`竖版导出过小 \${v}\`);
if (!(c > 4096)) fails.push(\`封面导出过小 \${c}\`);

if (errors.length) fails.push(...errors.slice(0, 5));

await page.screenshot({ path: 'qa/vertical.png' });
await browser.close();

if (fails.length) { console.error('GATE FAIL'); fails.forEach(f => console.error('  ' + f)); process.exit(1); }
console.log(\`GATE OK  |  竖版 \${(v / 1024).toFixed(0)}KB  封面 \${(c / 1024).toFixed(0)}KB\`);
`);

/* ---------- tests/visual.mjs ---------- */
W('tests/visual.mjs', `import { open, SAFE, W, H } from './platform.mjs';

const { browser, page } = await open();
const r = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const lum = i => 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];

  const rows = [];
  for (let y = SAFE.y0; y < SAFE.y1; y += 10) {
    let ink = 0, tot = 0;
    for (let yy = y; yy < Math.min(y + 10, SAFE.y1); yy += 2)
      for (let x = SAFE.x0; x < SAFE.x1; x += 6) { tot++; if (lum((yy * c.width + x) * 4) > 24) ink++; }
    rows.push({ y, pct: ink / tot });
  }
  const dead = []; let run = null;
  for (const rw of rows) {
    if (rw.pct < 0.008) { if (run === null) run = rw.y; }
    else { if (run !== null && rw.y - run >= 150) dead.push(run + '-' + rw.y); run = null; }
  }
  if (run !== null && SAFE.y1 - run >= 150) dead.push(run + '-' + SAFE.y1);

  let gI = 0, gT = 0;
  for (let y = SAFE.y0; y < SAFE.y1; y += 3)
    for (let x = SAFE.x0; x < SAFE.x1; x += 3) { gT++; if (lum((y * c.width + x) * 4) > 24) gI++; }
  return { dead, safeInkPct: +(gI / gT * 100).toFixed(2) };
}, SAFE);
await browser.close();

console.log('安全区内 150px 死区: ' + (r.dead.length ? r.dead.join(', ') : '无'));
console.log('安全区整体墨量: ' + r.safeInkPct + '%');
const fail = [];
if (r.dead.length > 1) fail.push('死区 ' + r.dead.length + ' 处');
if (r.safeInkPct < 8) fail.push('墨量过低 ' + r.safeInkPct + '%');
if (fail.length) { console.error('画质问题: ' + fail.join(' / ')); process.exit(1); }
console.log('画质检查通过');
`);

/* ---------- tests/fonts.mjs ---------- */
copyFileSync(join(ROOT, 'projects', 'wind-tunnel-3d', 'tests', 'fonts.mjs'), join(dir, 'tests', 'fonts.mjs'));

/* ---------- tests/ascii.mjs ---------- */
W('tests/ascii.mjs', `import { open, SAFE } from './platform.mjs';

const { browser, page } = await open();
const art = await page.evaluate((SAFE) => {
  const c = window.__app.canvas;
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const CELL = 40, ramp = ' .:-=+*#%@';
  const out = [];
  for (let y = 0; y < c.height; y += CELL) {
    let line = '';
    for (let x = 0; x < c.width; x += CELL) {
      let s = 0, n = 0;
      for (let yy = y; yy < y + CELL; yy += 4)
        for (let xx = x; xx < x + CELL; xx += 4) {
          const i = (yy * c.width + xx) * 4;
          s += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          n++;
        }
      const l = s / n;
      line += ramp[Math.min(9, Math.max(0, Math.round(l / 255 * 9 * 2.2)))];
    }
    const mark = y <= SAFE.y0 ? '  顶UI会盖' : (y >= SAFE.y1 ? '  ← IG说明会盖' : '');
    out.push(String(y).padStart(4) + ' |' + line + '|' + mark);
  }
  return out.join('\\n');
}, SAFE);
await browser.close();
console.log(art);
`);

/* ---------- README 骨架 ---------- */
W('README.md', `# ${name}

（一句话说清这个项目解决什么问题，不要写「欢迎使用」）

## 怎么跑

双击 \`index.html\`。不用服务器，不用联网。

## 怎么做的

（写真实的方法和公式，写清楚哪些数是实测的、哪些是估的）

## 怎么验证没坏

\`\`\`bash
node build.mjs
node tests/gate.mjs
node tests/visual.mjs
node tests/fonts.mjs
node tests/ascii.mjs
\`\`\`

## 已知问题

（至少要写 3 条真实存在的缺陷，不许写「暂无」）

---

STEM Racing 队内自制。
`);

console.log(`脚手架完成: projects/${name}  (模板 ${tmpl})`);
console.log('  下一步: cd 进去 && cmd /c "npm i"');
console.log('  然后: node build.mjs && node tests/gate.mjs');
