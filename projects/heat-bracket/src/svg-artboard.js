/* SVG 画板 · 共用
   排版用 SVG（<path>/<text>/<pattern> 能精确到亚像素、线宽可控、斜线填充不糊），
   最终落到一块 canvas 上：看见的就是导出的，测试也能直接读像素。
   光栅路径是 data:URL -> Image -> drawImage，file:// 下不需要任何服务器，也没有外部请求。 */

export const INK = '#0B0B0C';
export const INK2 = '#151517';
export const INK3 = '#1D1D20';
export const PAPER = '#F2F0EB';
export const PAPER2 = '#E4E1D9';
export const ACCENT = '#E8590C';
export const ACCENT_DIM = '#A63D08';
export const LINE = 'rgba(255,255,255,0.14)';
export const LINE_SOLID = '#2A2A2E';
export const MUTE = 'rgba(242,240,235,0.55)';
export const MUTE2 = 'rgba(242,240,235,0.32)';

/* 等宽栈必须带中文字形，否则中英混排会静默丢字 */
export const MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
/* 窄体做标题，兜底同样挂中文字体 */
export const DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';

/** XML 文本转义。数据里的 & < > 会把整个 SVG 搞坏，别省这一步 */
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 定长数字：不补零时也要保证小数点位数一致，表格才对得齐 */
export function fx(n, d = 3) {
  return Number(n).toFixed(d);
}

/** 在已铺满整张纸的 <svg> 上画东西的薄封装 */
export function frame(w, h, body, bg = INK) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
    + `<rect width="${w}" height="${h}" fill="${bg}"/>` + body + '</svg>';
}

/** 45° 斜线填充图案。工程图的剖面线、计时牌的警示条都用它 */
export function hatch(id, { step = 8, width = 1.4, color = MUTE2 } = {}) {
  return `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
    + `<line x1="0" y1="0" x2="0" y2="${step}" stroke="${color}" stroke-width="${width}"/></pattern>`;
}

/** 光栅化一段 SVG 到 canvas。同一条路径给正式导出和字体检测共用 */
export async function rasterize(canvas, markup, w, h) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG 光栅化失败'));
    img.src = url;
  });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

/**
 * 画板：只管一件事 —— 拿到 SVG 字符串，把它变成 canvas 上的像素。
 * paint() 返回的 Promise 在像素就绪后 resolve，导出与测试都 await 它。
 */
export function createArtboard({ w = 1080, h = 1920 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const mount = document.createElement('div');   // 只为序列化而存在，不进文档
  let pending = Promise.resolve();
  let texts = [];

  function paint(markup, textList = []) {
    texts = textList;
    mount.innerHTML = markup;
    const el = mount.firstElementChild;
    if (!el) throw new Error('画板收到空 SVG');
    // 走 XMLSerializer 而不是原始字符串：让浏览器补齐命名空间，避免 img 里解析失败
    const xml = new XMLSerializer().serializeToString(el);
    pending = rasterize(canvas, xml, w, h);
    return pending;
  }

  return {
    w, h, canvas,
    paint,
    ready: () => pending,
    texts: () => texts,
  };
}
