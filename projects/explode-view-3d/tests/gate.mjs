// 验收门禁。全过打印 GATE OK，任何一条不过就 exit 1。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const QA = path.join(PROJECT, 'qa');
const PORT = Number(process.env.PORT || 5199);
const BASE = 'http://127.0.0.1:' + PORT;
const CHROME = process.env.CHROME_PATH ||
	path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe');

const fails = [];
const fail = (m) => { fails.push(m); console.error('  FAIL  ' + m); };
const ok = (m) => console.log('  ok    ' + m);

fs.mkdirSync(QA, { recursive: true });

async function startServer() {
	const child = spawn(process.execPath, [path.join(PROJECT, 'tools', 'serve.mjs')], {
		env: { ...process.env, PORT: String(PORT) },
		stdio: ['ignore', 'ignore', 'pipe']
	});
	child.stderr.on('data', (b) => process.stderr.write(b));
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		try {
			const r = await fetch(BASE + '/index.html', { method: 'HEAD' });
			if (r.ok) return child;
		} catch { /* not up yet */ }
		await new Promise((r) => setTimeout(r, 200));
	}
	child.kill();
	throw new Error('本地服务起不来，先确认 node 和 tools/serve.mjs 都在');
}

function pngSize(buf) {
	const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
	if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
	return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const server = await startServer();
const browser = await chromium.launch({
	executablePath: CHROME,
	args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
});

function watch(page, bucket) {
	page.on('console', (m) => {
		if (m.type() === 'error') bucket.push('console.error: ' + m.text());
	});
	page.on('pageerror', (e) => bucket.push('pageerror: ' + e.message));
	page.on('response', (r) => {
		if (r.status() >= 400) bucket.push('HTTP ' + r.status() + ' ' + r.url());
	});
	page.on('requestfailed', (r) => {
		const t = r.failure() ? r.failure().errorText : 'unknown';
		if (t !== 'net::ERR_ABORTED') bucket.push('requestfailed: ' + r.url() + ' ' + t);
	});
	page.on('request', (r) => {
		if (!r.url().startsWith(BASE + '/') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
			bucket.push('外部请求: ' + r.url());
		}
	});
}

try {
	// ── 竖版 1080x1920 ──
	const bucket = [];
	const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
	watch(page, bucket);

	console.log('[1] 打开 1080x1920');
	await page.goto(BASE + '/index.html', { waitUntil: 'load' });
	await page.waitForFunction(() => window.__app && window.__app.ready === true, null, { timeout: 180000 });
	ok('Godot 起来了');

	await page.waitForFunction(() => {
		const s = document.getElementById('status');
		if (!s) return true;
		const cs = getComputedStyle(s);
		return cs.display === 'none' || cs.visibility === 'hidden';
	}, null, { timeout: 30000 });
	ok('加载层已收起');
	await page.waitForTimeout(1800);

	const canvasBox = await page.evaluate(() => {
		const c = document.getElementById('canvas');
		const r = c.getBoundingClientRect();
		return { w: Math.round(r.width), h: Math.round(r.height), bw: c.width, bh: c.height };
	});
	if (canvasBox.w !== 1080 || canvasBox.h !== 1920) {
		fail('画布 CSS 尺寸不是 1080x1920，实际 ' + canvasBox.w + 'x' + canvasBox.h);
	} else ok('画布 CSS 尺寸 1080x1920');

	if (canvasBox.bw !== 1080 || canvasBox.bh !== 1920) {
		fail('画布缓冲尺寸不是 1080x1920，实际 ' + canvasBox.bw + 'x' + canvasBox.bh);
	} else ok('画布缓冲尺寸 1080x1920');

	await page.screenshot({ path: path.join(QA, 'vertical-1080x1920.png'), type: 'png' });
	const shot1 = fs.readFileSync(path.join(QA, 'vertical-1080x1920.png'));
	const s1 = pngSize(shot1);
	if (!s1 || s1.width !== 1080 || s1.height !== 1920) fail('截图尺寸不对 ' + JSON.stringify(s1));
	else ok('qa/vertical-1080x1920.png 是 ' + s1.width + 'x' + s1.height);

	// ── 导出 PNG ──
	console.log('[2] 调 __app.exportPng()');
	const b64 = await page.evaluate(async () => {
		const blob = await window.__app.exportPng();
		const buf = new Uint8Array(await blob.arrayBuffer());
		let s = '';
		for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
		return btoa(s);
	});
	const png = Buffer.from(b64, 'base64');
	const dim = pngSize(png);
	if (png.length <= 4096) fail('导出的 PNG 只有 ' + png.length + ' 字节，肯定不对');
	else ok('导出 ' + png.length + ' 字节');
	if (!dim) fail('导出的不是合法 PNG');
	else if (dim.width !== 1080 || dim.height !== 1920) fail('导出尺寸 ' + dim.width + 'x' + dim.height + '，要 1080x1920');
	else ok('导出尺寸 ' + dim.width + 'x' + dim.height);

	const meta = await page.evaluate(() => window.__app.lastExport);
	if (!meta || meta.width !== 1080 || meta.height !== 1920) fail('lastExport 元数据不对 ' + JSON.stringify(meta));
	else ok('lastExport 元数据一致');
	fs.writeFileSync(path.join(QA, 'exported-1080x1920.png'), png);

	// ── 交互 ──
	console.log('[3] 横向拖拽');
	const before = fs.readFileSync(path.join(QA, 'vertical-1080x1920.png'));
	await page.mouse.move(540, 900);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++) await page.mouse.move(540 - i * 28, 900);
	await page.mouse.up();
	await page.waitForTimeout(1200);
	await page.screenshot({ path: path.join(QA, 'vertical-dragged.png'), type: 'png' });
	const after = fs.readFileSync(path.join(QA, 'vertical-dragged.png'));
	if (before.equals(after)) fail('拖拽前后画面一模一样，爆炸交互没生效');
	else ok('拖拽后画面有变化');

	// ── 桌面 1440x900 ──
	console.log('[4] 桌面 1440x900');
	const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
	watch(page2, bucket);
	await page2.goto(BASE + '/index.html', { waitUntil: 'load' });
	await page2.waitForFunction(() => window.__app && window.__app.ready === true, null, { timeout: 180000 });
	await page2.waitForTimeout(1800);
	const fitted = await page2.evaluate(() => {
		const c = document.getElementById('canvas');
		const r = c.getBoundingClientRect();
		const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
		return { w: Math.round(r.width), h: Math.round(r.height), s: Number(m.a.toFixed(3)) };
	});
	const wantS = Math.min(1440 / 1080, 900 / 1920);
	if (Math.abs(fitted.s - wantS) > 0.01) fail('桌面缩放系数 ' + fitted.s + '，应约 ' + wantS.toFixed(3));
	else ok('桌面等比缩放 ' + fitted.s + 'x');
	if (fitted.w > 1440 || fitted.h > 900) fail('桌面下画布超出窗口 ' + fitted.w + 'x' + fitted.h);
	else ok('桌面下画布 ' + fitted.w + 'x' + fitted.h + ' 在窗口内');
	await page2.screenshot({ path: path.join(QA, 'desktop-1440x900.png'), type: 'png' });
	ok('qa/desktop-1440x900.png');

	// ── 控制台 / 网络 ──
	console.log('[5] 控制台与网络');
	if (bucket.length === 0) ok('干净');
	else for (const b of bucket) fail(b);
} catch (err) {
	fail('跑挂了: ' + err.message);
} finally {
	await browser.close();
	server.kill();
}

if (fails.length) {
	console.error('\nGATE FAILED (' + fails.length + ')');
	process.exit(1);
}
console.log('\nGATE OK');