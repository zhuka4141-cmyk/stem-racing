// 把 PNG 降成字符密度图。没有视觉模型的时候靠这个看版式。
// 自己解 PNG，不引第三方依赖：zlib 拆 IDAT、按 filter 还原扫线、再抽样。
import fs from 'node:fs';
import zlib from 'node:zlib';

const RAMP = ' .:-=+*#%@';

export function decodePng(buf) {
	if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
	let off = 8;
	let width = 0, height = 0, depth = 0, colorType = 0;
	const idat = [];
	let palette = null;
	while (off < buf.length) {
		const len = buf.readUInt32BE(off);
		const type = buf.toString('ascii', off + 4, off + 8);
		const data = buf.subarray(off + 8, off + 8 + len);
		if (type === 'IHDR') {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			depth = data[8];
			colorType = data[9];
			if (data[12] !== 0) throw new Error('不支持隔行 PNG');
		} else if (type === 'PLTE') {
			palette = data;
		} else if (type === 'IDAT') {
			idat.push(data);
		} else if (type === 'IEND') {
			break;
		}
		off += 12 + len;
	}
	if (depth !== 8) throw new Error('只支持 8 位深度，这张是 ' + depth);
	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
	if (!channels) throw new Error('不支持的 colorType ' + colorType);

	const raw = zlib.inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const out = Buffer.alloc(height * stride);
	let pos = 0;
	for (let y = 0; y < height; y++) {
		const filter = raw[pos++];
		const row = raw.subarray(pos, pos + stride);
		pos += stride;
		const cur = out.subarray(y * stride, (y + 1) * stride);
		const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
		for (let x = 0; x < stride; x++) {
			const a = x >= channels ? cur[x - channels] : 0;
			const b = prev ? prev[x] : 0;
			const c = prev && x >= channels ? prev[x - channels] : 0;
			let v = row[x];
			if (filter === 1) v += a;
			else if (filter === 2) v += b;
			else if (filter === 3) v += (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
				v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
			}
			cur[x] = v & 0xff;
		}
	}

	const lum = new Float32Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * stride + x * channels;
			let r, g, b;
			if (colorType === 3) {
				const pi = out[i] * 3;
				r = palette[pi]; g = palette[pi + 1]; b = palette[pi + 2];
			} else if (channels >= 3) {
				r = out[i]; g = out[i + 1]; b = out[i + 2];
			} else {
				r = g = b = out[i];
			}
			lum[y * width + x] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		}
	}
	return { width, height, lum };
}

export function ascii(img, cols = 100, crop = null) {
	const { width, height, lum } = img;
	const cx0 = crop ? crop[0] : 0, cy0 = crop ? crop[1] : 0;
	const cw = crop ? crop[2] - crop[0] : width, chh = crop ? crop[3] - crop[1] : height;
	const cellW = cw / cols;
	const rows = Math.max(1, Math.round(cols * (chh / cw) * 0.5));
	const cellH = chh / rows;
	let max = 1e-6;
	const grid = [];
	for (let r = 0; r < rows; r++) {
		const line = [];
		for (let c = 0; c < cols; c++) {
			let sum = 0, n = 0;
			const x0 = Math.min(width, Math.floor(cx0 + c * cellW));
			const x1 = Math.min(width, Math.ceil(cx0 + (c + 1) * cellW));
			const y0 = Math.min(height, Math.floor(cy0 + r * cellH));
			const y1 = Math.min(height, Math.ceil(cy0 + (r + 1) * cellH));
			for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += lum[y * width + x]; n++; }
			const v = n ? sum / n : 0;
			if (v > max) max = v;
			line.push(v);
		}
		grid.push(line);
	}
	return grid.map((line) => line
		.map((v) => RAMP[Math.min(RAMP.length - 1, Math.round((v / max) * (RAMP.length - 1)))])
		.join(''));
}

const isMain = process.argv[1] && process.argv[1].endsWith('ascii.mjs');
if (isMain) {
	const file = process.argv[2];
	if (!file) { console.error('用法: node tests/ascii.mjs <png> [列数]'); process.exit(2); }
	const cols = Number(process.argv[3] || 100);
	const crop = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
	const img = decodePng(fs.readFileSync(file));
	console.log('// ' + file + '  ' + img.width + 'x' + img.height + '  ' + cols + ' cols' + (crop ? '  crop=' + crop.join(',') : ''));
	console.log(ascii(img, cols, crop).join('\n'));
}