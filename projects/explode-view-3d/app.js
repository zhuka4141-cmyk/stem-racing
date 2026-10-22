// 这一层只管三件事：把画布按 1080x1920 等比摆到窗口中间、
// 把 Godot 里截出来的 PNG 搬回 JS、以及 file:// 打开时给一句人话。
(function () {
	'use strict';

	var STAGE_W = 1080;
	var STAGE_H = 1920;
	var canvas = document.getElementById('canvas');

	function fit() {
		var s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
		canvas.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
	}

	function addBootLabel() {
		var status = document.getElementById('status');
		if (!status || document.getElementById('boot-label')) return;
		var el = document.createElement('div');
		el.id = 'boot-label';
		el.textContent = 'STEM RACING / 正在加载场景';
		status.insertBefore(el, status.firstChild);
	}

	// ── 导出通道 ──────────────────────────────────────────────
	var chunks = [];
	var pending = null;

	function bytesFromBase64(b64) {
		var raw = atob(b64);
		var n = raw.length;
		var out = new Uint8Array(n);
		for (var i = 0; i < n; i++) out[i] = raw.charCodeAt(i);
		return out;
	}

	window.__exportBegin = function (count) {
		chunks = [];
		chunks.length = 0;
		void count;
	};
	window.__exportChunk = function (s) {
		chunks.push(s);
	};
	window.__exportFailed = function (msg) {
		if (pending) {
			var p = pending;
			pending = null;
			p.reject(new Error(String(msg)));
		}
	};
	window.__exportDone = function (reason, w, h) {
		var blob = null;
		try {
			blob = new Blob([bytesFromBase64(chunks.join(''))], { type: 'image/png' });
		} catch (err) {
			window.__exportFailed('base64 解码失败: ' + err);
			return;
		}
		chunks = [];
		app.lastExport = { bytes: blob.size, width: w, height: h };
		if (pending) {
			var p = pending;
			pending = null;
			p.resolve(blob);
		}
		if (reason === 'button') {
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = 'stem-racing-exploded-' + w + 'x' + h + '.png';
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
		}
	};

	// ── 对外的门面 ────────────────────────────────────────────
	var app = {
		ready: false,
		lastExport: null,
		stage: { width: STAGE_W, height: STAGE_H },
		exportPng: function () {
			return new Promise(function (resolve, reject) {
				if (!app.ready) {
					reject(new Error('Godot 还没启动完'));
					return;
				}
				if (pending) {
					reject(new Error('上一次导出还没结束'));
					return;
				}
				var timer = setTimeout(function () {
					if (pending) {
						pending = null;
						reject(new Error('导出超时，20 s 内没拿到图'));
					}
				}, 20000);
				pending = {
					resolve: function (b) { clearTimeout(timer); resolve(b); },
					reject: function (e) { clearTimeout(timer); reject(e); }
				};
				// create_callback 的返回值在 web 导出里不派发，反过来由 GDScript 轮询这个位。
				window.__exportRequest = 'api';
			});
		}
	};
	window.__app = app;

	window.__godotReady = function () {
		app.ready = true;
		// 不指望引擎自己的加载层时序，直接收掉，免得挡住画面。
		var status = document.getElementById('status');
		if (status) status.style.display = 'none';
	};

	// ── file:// 提示 ─────────────────────────────────────────
	if (window.location.protocol === 'file:') {
		document.addEventListener('DOMContentLoaded', function () {
			var box = document.createElement('div');
			box.id = 'fileproto';
			box.innerHTML =
				'<div><strong>这个页面不能直接双击打开</strong>' +
				'Godot 的 Web 包要 fetch 自己的 .wasm 和 .pck。' +
				'浏览器对 file:// 的 fetch 一律按跨域拦掉，所以双击 index.html 只会白屏。</div>' +
				'<div>在项目目录里双击 <code>serve.cmd</code>，' +
				'或者敲一句 <code>node tools/serve.mjs</code>，' +
				'然后浏览器开 <code>http://127.0.0.1:5188/</code>。</div>';
			document.body.appendChild(box);
			box.style.display = 'grid';
		});
	}

	window.addEventListener('resize', fit);
	document.addEventListener('DOMContentLoaded', function () {
		fit();
		addBootLabel();
	});
	fit();
}());