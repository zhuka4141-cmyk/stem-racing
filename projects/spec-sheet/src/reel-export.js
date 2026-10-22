/* 九比十六导出模块 · 共用
   在浏览器里：把任意 canvas 重采样到 1080x1920 并导出 PNG。
   视频由 Node 侧管线（Playwright 逐帧截图 → ffmpeg）生成，不用 MediaRecorder，
   因为 WebM 的 VP8/VP9 在 IG 会被二次转码，画质不可控。 */

export const REEL_W = 1080;
export const REEL_H = 1920;
export const COVER_W = 1080;
export const COVER_H = 1350;   // 4:5 资料页封面裁切

/**
 * 把源 canvas 按 "cover" 方式重采样到目标尺寸。
 * 不拉伸、不留白，超出部分居中裁掉——保证安全区内容不被切。
 */
export function resample(src, outW, outH) {
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const sw = src.width, sh = src.height;
  const scale = Math.max(outW / sw, outH / sh);
  const dw = sw * scale, dh = sh * scale;
  ctx.drawImage(src, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
  return c;
}

/** 返回 PNG Blob。校验大小，太小说明画布是空的。 */
export async function toPNG(canvas, { width = REEL_W, height = REEL_H, quality } = {}) {
  const out = resample(canvas, width, height);
  const blob = await new Promise(r => out.toBlob(r, 'image/png'));
  if (!blob) throw new Error('toBlob returned null');
  if (blob.size < 4096) throw new Error(`PNG 过小（${blob.size} B），画布可能是空的`);
  return blob;
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 校验 PNG 魔数，防止出现"看起来成功了但存了个空文件" */
export async function assertPNG(blob) {
  const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (b[i] !== magic[i]) throw new Error('不是合法 PNG');
  return true;
}

/**
 * 一键导出：竖屏 + 封面两个资产，每个 episode 必须两个都有。
 * 两张是两套版式，所以封面画布单独传，不传才退回同一张。
 * 别把 4:5 的画布丢进 9:16 那条——resample 是 cover 语义，会横向裁掉 456px。
 */
export async function exportEpisode(canvas, slug, coverCanvas = canvas) {
  const vertical = await toPNG(canvas, { width: REEL_W, height: REEL_H });
  await assertPNG(vertical);
  download(vertical, `${slug}-1080x1920.png`);

  const cover = await toPNG(coverCanvas, { width: COVER_W, height: COVER_H });
  await assertPNG(cover);
  download(cover, `${slug}-1080x1350.png`);

  return { vertical: vertical.size, cover: cover.size };
}

/** 确定性随机：同 seed 必出同一结果，方便复现和门禁断言 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}