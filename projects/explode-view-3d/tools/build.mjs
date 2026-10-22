// 一条命令把 Godot 工程变成根目录能直接 serve 的静态包。
// 顺序不能换：字体必须先裁（.gd 改了文案就要重裁），否则 pck 里还是旧的方块。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const GODOT_DIR = path.join(PROJECT, 'godot');
const BUILD_DIR = path.join(GODOT_DIR, 'build');
const GODOT_BIN = path.resolve(PROJECT, '../../_tools/godot/Godot_v4.4.1-stable_win64.exe');

const skipFonts = process.argv.includes('--no-fonts');

function run(cmd, args, label) {
	const r = spawnSync(cmd, args, { cwd: PROJECT, stdio: 'inherit', shell: false });
	if (r.error) throw new Error(label + ': ' + r.error.message);
	if (r.status !== 0) throw new Error(label + ' 退出码 ' + r.status);
}

function step(msg) {
	process.stdout.write('[build] ' + msg + '\n');
}

// 1. 字体子集
if (skipFonts) {
	step('跳过字体裁剪');
} else {
	step('裁剪字体子集');
	run('python', ['tools/subset_fonts.py'], 'subset_fonts.py');
}

// 2. Godot 导入 + 导出
if (!fs.existsSync(GODOT_BIN)) throw new Error('找不到 Godot: ' + GODOT_BIN);
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });

step('godot --import');
run(GODOT_BIN, ['--headless', '--path', GODOT_DIR, '--import'], 'godot import');

step('godot --export-release Web');
run(GODOT_BIN, ['--headless', '--path', GODOT_DIR, '--export-release', 'Web'], 'godot export');

// 3. 摊到项目根
const ARTIFACTS = ['index.js', 'index.wasm', 'index.pck', 'index.icon.png',
	'index.apple-touch-icon.png', 'index.audio.worklet.js', 'index.audio.position.worklet.js'];
for (const name of ARTIFACTS) {
	const src = path.join(BUILD_DIR, name);
	if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PROJECT, name));
}
fs.copyFileSync(path.join(PROJECT, 'web-src', 'app.js'), path.join(PROJECT, 'app.js'));

// 4. 往 Godot 生成的 index.html 里插一层
let html = fs.readFileSync(path.join(BUILD_DIR, 'index.html'), 'utf8');
const head = fs.readFileSync(path.join(PROJECT, 'web-src', 'shell-head.html'), 'utf8').trimEnd();

if (html.includes('/* injected-by-build */')) throw new Error('index.html 已注入过，先重跑导出');

// 关掉了自带图标，但模板仍会留两条 link，浏览器会 404，直接摘掉
for (const icon of ['index.icon.png', 'index.apple-touch-icon.png']) {
	if (!fs.existsSync(path.join(PROJECT, icon))) {
		html = html.replace(new RegExp('<link[^>]*' + icon.replace(/[.]/g, '\\\\.') + '[^>]*>\\s*', 'g'), '');
	}
}

// 启动图也没生成，摘掉，不然 Request 会 404
html = html.replace(/<img id="status-splash"[^>]*>\s*/g, '');

html = html
	.replace('<html lang="en">', '<html lang="zh-CN">')
	.replace('<canvas id="canvas">', '<canvas id="canvas" width="1080" height="1920">')
	.replace('</head>', '<!-- injected-by-build -->\n' + head + '\n\t</head>');

if (!html.includes('injected-by-build')) throw new Error('index.html 注入失败：找不到 </head>');

fs.writeFileSync(path.join(PROJECT, 'index.html'), html);

const pck = path.join(PROJECT, 'index.pck');
const wasm = path.join(PROJECT, 'index.wasm');
step('产物: index.html ' + fs.statSync(path.join(PROJECT, 'index.html')).size + ' B, index.pck ' +
	fs.statSync(pck).size + ' B, index.wasm ' + fs.statSync(wasm).size + ' B');
step('完成');