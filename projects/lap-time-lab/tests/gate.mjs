#!/usr/bin/env node
/* 交付门禁：node tests/gate.mjs
 * 对 file:// 和本地 http 各跑一遍全套断言。任何一条失败 → exit 1。
 * 不用 waitForTimeout：所有等待都挂在真实谓词上。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QA = path.join(ROOT, 'qa');

const CHROME = 'C:\\Users\\lstcstudent\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const cands = [
    'playwright-core',
    path.join(ROOT, 'node_modules', 'playwright-core'),
    'C:/Users/lstcstudent/OneDrive/Desktop/deeepseek/_stemlab/projects/wind-tunnel-3d/node_modules/playwright-core',
  ];
  const errs = [];
  for (const c of cands) {
    try { return require(c); } catch (e) { errs.push(String(c) + ': ' + e.code); }
  }
  throw new Error('找不到 playwright-core，试过:\n  ' + errs.join('\n  '));
}

/* ---------------- 断言记账 ---------------- */
const results = [];
function pass(name) { results.push({ ok: true, name }); console.log('PASS  ' + name); }
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  console.log('FAIL  ' + name + '\n      ' + String(detail).replace(/\n/g, '\n      '));
}
async function check(name, fn) {
  try { await fn(); pass(name); }
  catch (e) { fail(name, e && e.message ? e.message : e); }
}

/* ---------------- PNG 尺寸 ---------------- */
function pngInfo(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.ok(buf.length >= 24, 'PNG 缓冲只有 ' + buf.length + ' 字节');
  for (let i = 0; i < 8; i++) {
    assert.equal(buf[i], sig[i], 'PNG 魔数第 ' + i + ' 字节不对');
  }
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR', '第一个块不是 IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

/* ---------------- 静态服务器 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};
function serve(root) {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* ---------------- 单轮全套检查 ---------------- */
async function suite(browser, label, url, opts) {
  const allowedOrigin = opts.allowedOrigin || null;
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  // 确定性种子（页面不用随机数，但门禁本身要可复现）
  await context.addInitScript(() => {
    let s = 0x2f6e2b1;
    Math.random = function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  });

  const consoleErrors = [];
  const pageErrors = [];
  const netRequests = [];
  const badResponses = [];

  context.on('request', (r) => {
    const u = r.url();
    if (/^https?:/i.test(u)) {
      if (allowedOrigin && u.startsWith(allowedOrigin)) return;
      netRequests.push(u);
    }
  });
  context.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url());
  });

  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab && window.__lab.ready === true, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));

    await check(`[${label}] 控制台零 error`, async () => {
      assert.deepEqual(consoleErrors, [], 'console.error: ' + consoleErrors.join(' | '));
    });

    await check(`[${label}] 零 pageerror`, async () => {
      assert.deepEqual(pageErrors, [], '未捕获异常: ' + pageErrors.join(' | '));
    });

    await check(`[${label}] 零外部网络请求`, async () => {
      assert.deepEqual(netRequests, [], '出现了外部请求: ' + netRequests.join(' | '));
    });

    await check(`[${label}] 零 4xx / 5xx`, async () => {
      assert.deepEqual(badResponses, [], '坏响应: ' + badResponses.join(' | '));
    });

    const st = await page.evaluate(() => window.__lab.selfTest());

    await check(`[${label}] selfTest 全绿`, async () => {
      const bad = st.checks.filter((c) => !c.ok);
      assert.ok(st.checks.length >= 12, '只有 ' + st.checks.length + ' 条自检，至少要 12 条');
      assert.deepEqual(
        bad.map((c) => c.name + ' :: ' + c.detail), [],
        '失败的子项: ' + bad.map((c) => c.name).join(', ')
      );
      assert.equal(st.ok, true, 'selfTest.ok 是 false');
    });

    await check(`[${label}] 数值全部有限（无 NaN / Infinity）`, async () => {
      const bad = [];
      for (const [k, v] of Object.entries(st.values)) {
        if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k + '=' + v);
      }
      assert.deepEqual(bad, [], '非有限字段: ' + bad.join(', '));
    });

    const s0 = await page.evaluate(() => window.__lab.state());

    await check(`[${label}] 默认成绩落在 1.00–1.25 s`, async () => {
      assert.equal(s0.inBand, true, 'inBand=false, t=' + s0.time);
      assert.ok(s0.time >= 1.0 && s0.time <= 1.25, 't=' + s0.time + ' s 超出区间');
    });

    await check(`[${label}] 末速度落在 15–20 m/s`, async () => {
      assert.ok(s0.vEnd >= 15 && s0.vEnd <= 20, 'vEnd=' + s0.vEnd + ' m/s');
    });

    await check(`[${label}] 真是 1 ms 步进积出来的`, async () => {
      assert.ok(s0.steps > 500, '轨迹只有 ' + s0.steps + ' 点');
    });

    await check(`[${label}] 结果可复现`, async () => {
      const a = await page.evaluate(() => window.__lab.selfTest().values.time);
      const b = await page.evaluate(() => window.__lab.selfTest().values.time);
      assert.equal(a, b, '两次运行 ' + a + ' vs ' + b);
    });

    await check(`[${label}] 导出是 1080×1920 真 PNG 且 > 50 KB`, async () => {
      const dataUrl = await page.evaluate(() => window.__lab.exportPngDataURL());
      assert.equal(typeof dataUrl, 'string', 'exportPngDataURL 没返回字符串');
      assert.ok(dataUrl.startsWith('data:image/png;base64,'), '不是 PNG data URL');
      const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
      const info = pngInfo(buf);
      assert.equal(info.width, 1080, '宽是 ' + info.width);
      assert.equal(info.height, 1920, '高是 ' + info.height);
      assert.ok(info.bytes > 50 * 1024, '只有 ' + info.bytes + ' 字节，要求 > 51200');
    });

    await check(`[${label}] 四张图都真的画了东西`, async () => {
      for (const id of ['#c-speed', '#c-energy', '#c-delta', '#c-lat']) {
        const r = await page.evaluate((sel) => {
          const cv = document.querySelector(sel);
          if (!cv) return { err: '元素不存在' };
          const ctx = cv.getContext('2d');
          const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let n = 0;
          const seen = new Set();
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 8) { n++; seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
          }
          return { n, distinct: seen.size, w: cv.width, h: cv.height };
        }, id);
        assert.ok(!r.err, id + ' ' + r.err);
        assert.ok(r.w > 200 && r.h > 100, id + ' 画布尺寸异常 ' + r.w + 'x' + r.h);
        assert.ok(r.n >= 2000, id + ' 只有 ' + r.n + ' 个不透明像素');
        assert.ok(r.distinct >= 8, id + ' 只有 ' + r.distinct + ' 种颜色');
      }
    });

    await check(`[${label}] 超区间必须报警`, async () => {
      await page.evaluate(() => window.__lab.setParam('J', 2.0));
      const s = await page.evaluate(() => window.__lab.state());
      assert.equal(s.inBand, false, 'J=2.0 时 t=' + s.time + ' s 应被判为区间外');
      const visible = await page.locator('#band-alert').isVisible();
      assert.equal(visible, true, '#band-alert 没显示出来');
      const txt = await page.locator('#band-alert').innerText();
      assert.ok(txt.includes('合理区间'), '警报文案里没有「合理区间」: ' + txt.slice(0, 80));
    });

    await check(`[${label}] 复位后警告消失`, async () => {
      await page.evaluate(() => window.__lab.reset());
      const s = await page.evaluate(() => window.__lab.state());
      assert.equal(s.inBand, true, '复位后 t=' + s.time + ' s 仍不在区间内');
      const hidden = await page.locator('#band-alert').isHidden();
      assert.equal(hidden, true, '复位后 #band-alert 还看得见');
    });

    await check(`[${label}] 悬停能看到参数验证状态`, async () => {
      await page.hover('.ctrl__top');
      await page.waitForFunction(
        () => document.getElementById('tip').getAttribute('aria-hidden') === 'false',
        { timeout: 3000 }
      );
      const txt = await page.locator('#tip').innerText();
      assert.ok(/fixed|typical|VERIFY/.test(txt), '提示里没有可信度标签: ' + txt.slice(0, 80));
      await page.mouse.move(4, 4);
      await page.waitForFunction(
        () => document.getElementById('tip').getAttribute('aria-hidden') === 'true',
        { timeout: 3000 }
      );
    });

    await page.evaluate(() => window.__lab.reset());

    if (opts.shots) {
      fs.mkdirSync(QA, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(QA, 'vertical-1080x1920.png') });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => {
        const cv = document.getElementById('c-speed');
        return cv && cv.width > 0 && cv.getBoundingClientRect().width > 500;
      }, { timeout: 5000 });
      await page.screenshot({ path: path.join(QA, 'desktop-1440x900.png') });
      await page.setViewportSize({ width: 1080, height: 1920 });
      for (const f of ['vertical-1080x1920.png', 'desktop-1440x900.png']) {
        const p = path.join(QA, f);
        assert.ok(fs.existsSync(p), '截图没生成: ' + p);
        assert.ok(fs.statSync(p).size > 10 * 1024, f + ' 只有 ' + fs.statSync(p).size + ' 字节');
      }
    }
  } catch (e) {
    fail(`[${label}] 未捕获的门禁异常`, e && e.stack ? e.stack : e);
  } finally {
    await context.close();
  }
}

/* ---------------- 主流程 ---------------- */
(async () => {
  const { chromium } = loadPlaywright();
  assert.ok(fs.existsSync(CHROME), '找不到 Chromium: ' + CHROME);

  const browser = await chromium.launch({ executablePath: CHROME });
  let server = null;
  try {
    const fileUrl = pathToFileURL(path.join(ROOT, 'index.html')).href;
    await suite(browser, 'file://', fileUrl, { shots: true });

    const { srv, port } = await serve(ROOT);
    server = srv;
    await suite(browser, 'http', `http://127.0.0.1:${port}/index.html`, {
      shots: false,
      allowedOrigin: `http://127.0.0.1:${port}`,
    });
  } finally {
    await browser.close();
    if (server) await new Promise((r) => server.close(r));
  }

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  console.log('\n' + ok + '/' + results.length + ' 通过');
  if (bad.length) {
    console.log('失败项：');
    bad.forEach((b) => console.log('  - ' + b.name + ' :: ' + b.detail));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('门禁自身崩了：', e);
  process.exit(1);
});
