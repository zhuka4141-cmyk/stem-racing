// 只出图，不判定。调画面时用这个，验收用 tests/gate.mjs。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const QA = path.join(PROJECT, 'qa');
const PORT = Number(process.env.PORT || 5199);
const CHROME = process.env.CHROME_PATH ||
	path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe');

fs.mkdirSync(QA, { recursive: true });

async function startServer() {
	const child = spawn(process.execPath, [path.join(PROJECT, 'tools', 'serve.mjs')], {
		env: { ...process.env, PORT: String(PORT) },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stderr.on('data', (b) => process.stderr.write(b));
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		try {
			const r = await fetch('http://127.0.0.1:' + PORT + '/index.html', { method: 'HEAD' });
			if (r.ok) return child;
		} catch { /* 还没起来 */ }
		await new Promise((r) => setTimeout(r, 250));
	}
	child.kill();
	throw new Error('server 没起来');
}

const server = await startServer();
const browser = await chromium.launch({
	executablePath: CHROME,
	args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
});
const logs = [];

async function shoot(name, width, height) {
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
	page.on('console', (m) => logs.push('[' + m.type() + '] ' + m.text()));
	page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
	await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
	await page.waitForFunction(() => window.__app && window.__app.ready === true, null, { timeout: 180000 });
	await page.waitForTimeout(2200);
	await page.screenshot({ path: path.join(QA, name), type: 'png' });
	await page.close();
}

try {
	await shoot('vertical-1080x1920.png', 1080, 1920);
	await shoot('desktop-1440x900.png', 1440, 900);
	console.log(logs.join('\n'));
	console.log('QA DONE');
} catch (err) {
	console.log(logs.join('\n'));
	console.error('SHOOT FAILED', err.message);
	process.exitCode = 1;
} finally {
	await browser.close();
	server.kill();
}