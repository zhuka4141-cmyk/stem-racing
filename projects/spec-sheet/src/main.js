/* 整车外形与断面图 —— 1080×1920 制图纸
   按真实机械图纸的逻辑排版，不是「信息卡片」：
   · 图幅双线框 + 分区标号（数字 1-8 / 字母 A-D）
   · 视图按第一角法摆位，视图之间靠尺寸链连起来，不靠卡片框
   · 尺寸线两端实心箭头；界线离轮廓 6 px 起、过尺寸线 9 px 止
   · 剖面 45° 斜线只铺在实体材料上，气室内孔用 evenodd 留空
   · 右下标题栏（图号 / 比例 / 材料 / 质量），左下修订记录
   幅面是竖版，主视图只能压到 803 px 宽，比例尺不成立，所以图上明确写
   「比例 按幅面缩放 · 尺寸以标注为准」——这是复印放大后图纸的标准说法。 */
import { toPNG, assertPNG, exportEpisode } from './reel-export.js';
import {
  createArtboard, frame, esc, fx, hatch, rasterize,
  INK, PAPER, ACCENT, MUTE, MUTE2, MONO, DISP,
} from './svg-artboard.js';

const W = 1080, H = 1920;
const COVER_H = 1350;
const SHEET = { outer: 30, inner: 70 };
const CX0 = 92, CX1 = 988, CW = CX1 - CX0;

const K = 4.10, K3 = 5.40, K4 = 6.00;
const OX = 130, GY = 414, CL = 640;

const DEFAULTS = {
  len: 196.0, wid: 62.0, hgt: 44.5, wheel: 30.0, wall: 15.0,
  cg: 21.4, area: 1860, mass: 58.4, bore: 19.0, axle: 3.0, wb: 145.0,
};
const state = { ...DEFAULTS };
let geo = {};

/* 可信度档位。四档，因为「称过但没留记录」和「称过且有原始读数」不是一回事，
   把这两种混成一档，这张图就又比实际可信了。bg 为 null 表示不铺底色（空心）。
   注意：这一栏只说"本车复核到什么程度"，不动数值，也不改来源栏。 */
const STATUS = {
  '实测':  { bg: PAPER,  op: 0.90, text: INK,  label: '本车测过，有原始读数' },
  '实测*': { bg: PAPER,  op: 0.50, text: INK,  label: '本车测过，读数未存档' },
  '估算':  { bg: ACCENT, op: 0.88, text: INK,  label: '照相似件估，非本车' },
  '沿用':  { bg: null,   op: 0,    text: MUTE, label: 'C 版旧图带来，本车未复核' },
};
const mk = (st) => ({ s: st, fill: STATUS[st].text, weight: 600 });

/* 车体轮廓（mm，x 从车头原点，y 从地面） */
const BODY_SIDE = [
  [0, 2.5], [0, 9.0], [14, 15.0], [40, 26.0], [66, 36.0], [88, 42.5],
  [104, 44.5], [124, 42.0], [146, 36.5], [168, 30.0], [182, 27.0],
  [196, 25.5], [196, 3.0], [170, 3.0], [110, 2.8], [50, 2.6],
];
const BODY_TOP = [
  [0, 0], [4, 7], [12, 14], [26, 18.5], [48, 20.5], [80, 21.0], [130, 21.0],
  [165, 20.2], [185, 17.5], [196, 13.0],
  [196, -13.0], [185, -17.5], [165, -20.2], [130, -21.0], [80, -21.0],
  [48, -20.5], [26, -18.5], [12, -14], [4, -7],
];
const AXLE_F = 18, AXLE_R = 163;

/* 基准值：BODY_SIDE / BODY_TOP 的点是照着这台车写的，其余尺寸按它等比走。 */
const BASE = { len: 196.0, hgt: 44.5, wid: 62.0 };
const kLen = () => state.len / BASE.len;
const kHgt = () => state.hgt / BASE.hgt;
const kWid = () => state.wid / BASE.wid;
const wbNow = () => (AXLE_R - AXLE_F) * kLen();

/* Catmull-Rom → 三次贝塞尔：真实车体是曲面，折线一眼就是假的 */
function smooth(pts, closed = true) {
  const n = pts.length;
  const at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} `
      + `${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

const X = (mm) => OX + mm * K;
const Y = (mm) => GY - mm * K;

/* 排版小工具 */
let drawn = [], items = [];
const T = (s) => { drawn.push(String(s)); return esc(s); };

function txt(x, y, s, o = {}) {
  const { size = 13, font = MONO, fill = PAPER, weight = 400, anchor = 'start', ls = 0, op = 1 } = o;
  items.push({ s: String(s), x, y, size, font, weight, anchor, ls });
  return `<text x="${x}" y="${y}" font-family='${font}' font-size="${size}" font-weight="${weight}"`
    + ` letter-spacing="${ls}" fill="${fill}"${op !== 1 ? ` fill-opacity="${op}"` : ''}`
    + `${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${T(s)}</text>`;
}
const ln = (x1, y1, x2, y2, o = {}) => {
  const { stroke = MUTE2, w = 1, dash = null, op = 1 } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"`
    + `${dash ? ` stroke-dasharray="${dash}"` : ''}${op !== 1 ? ` stroke-opacity="${op}"` : ''}/>`;
};
const rect = (x, y, w, h, o = {}) => {
  const { fill = 'none', stroke = 'none', sw = 1, op = 1, fillOp = 1 } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"`
    + ` stroke-width="${sw}"${op !== 1 ? ` stroke-opacity="${op}"` : ''}${fillOp !== 1 ? ` fill-opacity="${fillOp}"` : ''}/>`;
};

const arrowL = (x, y) => `<polygon points="${x},${y} ${x - 11},${y - 4.2} ${x - 11},${y + 4.2}" fill="${PAPER}" fill-opacity=".72"/>`;
const arrowR = (x, y) => `<polygon points="${x},${y} ${x + 11},${y - 4.2} ${x + 11},${y + 4.2}" fill="${PAPER}" fill-opacity=".72"/>`;
const arrowU = (x, y) => `<polygon points="${x},${y} ${x - 4.2},${y + 11} ${x + 4.2},${y + 11}" fill="${PAPER}" fill-opacity=".72"/>`;
const arrowD = (x, y) => `<polygon points="${x},${y} ${x - 4.2},${y - 11} ${x + 4.2},${y - 11}" fill="${PAPER}" fill-opacity=".72"/>`;

function dimH(x1, x2, y, label, featY) {
  const o = [];
  const s = Math.sign(y - featY) || 1;
  o.push(ln(x1, featY + 6 * s, x1, y + 9 * s, { stroke: PAPER, w: 0.9, op: 0.38 }));
  o.push(ln(x2, featY + 6 * s, x2, y + 9 * s, { stroke: PAPER, w: 0.9, op: 0.38 }));
  o.push(ln(x1 + 11, y, x2 - 11, y, { stroke: PAPER, w: 1, op: 0.66 }));
  o.push(arrowL(x1, y));
  o.push(arrowR(x2, y));
  o.push(txt((x1 + x2) / 2, y - 9, label, { size: 15, fill: PAPER, anchor: 'middle', weight: 500 }));
  return o.join('');
}

/* 垂直尺寸：文字横排放在尺寸线上端。竖排数字在手机屏上要转头看，放弃旋转。 */
function dimV(y1, y2, x, label, featX) {
  const o = [];
  const s = Math.sign(x - featX) || 1;
  o.push(ln(featX + 6 * s, y1, x + 9 * s, y1, { stroke: PAPER, w: 0.9, op: 0.38 }));
  o.push(ln(featX + 6 * s, y2, x + 9 * s, y2, { stroke: PAPER, w: 0.9, op: 0.38 }));
  o.push(ln(x, y1 + 11, x, y2 - 11, { stroke: PAPER, w: 1, op: 0.66 }));
  o.push(arrowU(x, y1));
  o.push(arrowD(x, y2));
  o.push(txt(x, y1 - 10, label, { size: 15, fill: PAPER, anchor: 'middle', weight: 500 }));
  return o.join('');
}

function table(x, y, w, cols, rows, rowH, headH) {
  const o = [], total = headH + rows.length * rowH;
  o.push(rect(x, y, w, total, { stroke: PAPER, sw: 1, op: 0.5 }));
  o.push(rect(x, y, w, headH, { fill: PAPER, fillOp: 0.09 }));
  o.push(ln(x, y + headH, x + w, y + headH, { stroke: PAPER, w: 1, op: 0.5 }));
  let cx = x;
  for (const c of cols) { o.push(ln(cx, y, cx, y + total, { stroke: PAPER, w: 0.9, op: 0.3 })); cx += c.w; }
  rows.forEach((r, i) => {
    const ry = y + headH + i * rowH;
    if (i) o.push(ln(x, ry, x + w, ry, { stroke: PAPER, w: 0.8, op: 0.18 }));
    let px = x;
    r.forEach((cell, j) => {
      const c = cols[j];
      const al = c.align || 'start';
      const tx = al === 'end' ? px + c.w - 12 : al === 'middle' ? px + c.w / 2 : px + 12;
      const box = (cell && typeof cell === 'object') ? cell : null;
      o.push(txt(tx, ry + rowH * 0.68, box ? box.s : cell, {
        size: c.size || 13, fill: (box && box.fill) || c.fill || PAPER, anchor: al,
        weight: (box && box.weight) || (j === 2 ? 600 : 400), op: c.op || 0.92,
      }));
      px += c.w;
    });
  });
  let hx = x;
  cols.forEach((c) => {
    const al = c.align || 'start';
    const tx = al === 'end' ? hx + c.w - 12 : al === 'middle' ? hx + c.w / 2 : hx + 12;
    o.push(txt(tx, y + headH * 0.68, c.h, { size: 11, fill: MUTE, anchor: al, ls: 1.4 }));
    hx += c.w;
  });
  return o.join('');
}

/* 主排版 */
function build() {
  drawn = []; items = [];
  const p = [];
  const deg = (mm) => fx(mm, 1);

  /* 车长 / 车高 / 车宽 真的驱动图形。BODY_SIDE 的点本来就是 mm，
     按基准值等比缩放再上纸即可。缩放前这里是写死的 16 点，
     改车长只改标注不动车——图形和标注各说各的。 */
  const KL = kLen(), KH = kHgt(), KW = kWid();
  const LEN = state.len;
  const AF = AXLE_F * KL, AR = AXLE_R * KL, WB = AR - AF;
  const CUT_MM = 104 * KL;
  const sidePts = BODY_SIDE.map(([x, y]) => [x * KL, y * KH]);
  const topPts = BODY_TOP.map(([x, y]) => [x * KL, y * KW]);

  p.push(`<defs>`
    + hatch('hzA', { step: 6, width: 1.3, color: 'rgba(242,240,235,0.55)' })
    + hatch('hzB', { step: 5, width: 1.1, color: 'rgba(232,89,12,0.62)' })
    + '</defs>');

  /* 图幅 */
  p.push(rect(SHEET.outer, SHEET.outer, W - 2 * SHEET.outer, H - 2 * SHEET.outer, { stroke: PAPER, sw: 2.5, op: 0.9 }));
  p.push(rect(SHEET.inner, SHEET.inner, W - 2 * SHEET.inner, H - 2 * SHEET.inner, { stroke: PAPER, sw: 1, op: 0.42 }));
  const bw = (W - 2 * SHEET.inner) / 8, bh = (H - 2 * SHEET.inner) / 4;
  for (let i = 0; i < 8; i++) {
    const x = SHEET.inner + bw * i;
    if (i) {
      p.push(ln(x, SHEET.outer, x, SHEET.inner, { stroke: PAPER, w: 0.9, op: 0.3 }));
      p.push(ln(x, H - SHEET.inner, x, H - SHEET.outer, { stroke: PAPER, w: 0.9, op: 0.3 }));
    }
    p.push(txt(x + bw / 2, SHEET.inner - 12, String(i + 1), { size: 11, fill: MUTE2, anchor: 'middle' }));
    p.push(txt(x + bw / 2, H - SHEET.outer + 20, String(i + 1), { size: 11, fill: MUTE2, anchor: 'middle' }));
  }
  for (let i = 0; i < 4; i++) {
    const y = SHEET.inner + bh * i;
    if (i) {
      p.push(ln(SHEET.outer, y, SHEET.inner, y, { stroke: PAPER, w: 0.9, op: 0.3 }));
      p.push(ln(W - SHEET.inner, y, W - SHEET.outer, y, { stroke: PAPER, w: 0.9, op: 0.3 }));
    }
    p.push(txt(SHEET.outer + 20, y + bh / 2 + 4, 'ABCD'[i], { size: 11, fill: MUTE2, anchor: 'middle' }));
    p.push(txt(W - SHEET.outer - 20, y + bh / 2 + 4, 'ABCD'[i], { size: 11, fill: MUTE2, anchor: 'middle' }));
  }

  /* 抬头 */
  p.push(txt(CX0, 112, 'STEM RACING · CZ3-2025', { size: 11, fill: ACCENT, weight: 700, ls: 3 }));
  p.push(txt(CX0, 168, '整车外形与断面图', { size: 46, font: DISP, weight: 700, fill: PAPER, ls: 1 }));
  p.push(txt(CX0, 196, 'BODY ENVELOPE & SECTION  ·  CO₂ 直线加速车', { size: 12, fill: MUTE, ls: 1.6 }));
  p.push(txt(CX1, 168, 'CZ3-DWG-014', { size: 26, fill: PAPER, weight: 600, anchor: 'end', ls: 1 }));
  p.push(txt(CX1, 196, '第一角法 · 单位 mm', { size: 11, fill: MUTE2, anchor: 'end', ls: 1.2 }));
  p.push(ln(CX0, 216, CX1, 216, { stroke: PAPER, w: 2, op: 0.8 }));

  /* 主视图 */
  const sideD = smooth(sidePts.map(([x, y]) => [X(x), Y(y)]), true);
  p.push(txt(CX0, 248, '主视图  SIDE ELEVATION', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(CX1, 248, '比例 按幅面缩放 · 尺寸以标注为准', { size: 10.5, fill: MUTE2, anchor: 'end', ls: 0.8 }));

  p.push(ln(OX - 26, GY, X(LEN) + 26, GY, { stroke: PAPER, w: 1, dash: '14 4 3 4', op: 0.55 }));
  p.push(`<path d="${sideD}" fill="${PAPER}" fill-opacity="0.14"/>`);
  p.push(`<path d="${sideD}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
  const wr = state.wheel / 2 * K;
  for (const mmx of [AF, AR]) {
    const cxp = X(mmx), cyp = GY - wr;
    p.push(`<circle cx="${cxp.toFixed(1)}" cy="${cyp.toFixed(1)}" r="${wr.toFixed(1)}" fill="${PAPER}" fill-opacity="0.14" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
    p.push(`<circle cx="${cxp.toFixed(1)}" cy="${cyp.toFixed(1)}" r="${(state.axle / 2 * K).toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="1.1" stroke-opacity="0.6"/>`);
    p.push(ln(cxp - wr - 9, cyp, cxp + wr + 9, cyp, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.4 }));
    p.push(ln(cxp, cyp - wr - 9, cxp, cyp + wr + 9, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.4 }));
  }

  p.push(dimH(X(0), X(LEN), 456, `L = ${deg(LEN)}`, GY));
  p.push(dimV(Y(state.hgt), GY, 106, `H ${deg(state.hgt)}`, OX));

  const cgY = GY - state.cg * K;
  p.push(`<circle cx="560" cy="${cgY.toFixed(1)}" r="11" fill="none" stroke="${ACCENT}" stroke-width="1.4"/>`);
  p.push(`<path d="M560 ${(cgY - 11).toFixed(1)} A11 11 0 0 1 571 ${cgY.toFixed(1)} L560 ${cgY.toFixed(1)} Z" fill="${ACCENT}"/>`);
  p.push(`<path d="M560 ${(cgY + 11).toFixed(1)} A11 11 0 0 1 549 ${cgY.toFixed(1)} L560 ${cgY.toFixed(1)} Z" fill="${ACCENT}"/>`);
  p.push(ln(571, cgY - 7, 690, cgY - 52, { stroke: ACCENT, w: 1.1, op: 0.9 }));
  p.push(ln(690, cgY - 52, 934, cgY - 52, { stroke: ACCENT, w: 1.1, op: 0.9 }));
  p.push(txt(696, cgY - 60, `质心高 h = ${deg(state.cg)}（刀口法）`, { size: 12, fill: ACCENT, weight: 500 }));
  p.push(dimV(cgY, GY, 508, `h ${deg(state.cg)}`, 540));

  /* A—A 剖切位置 */
  const cutX = X(CUT_MM);
  /* 剖切标记顶端死在内框里面：车高拉大时 Y(hgt) 会顶到纸外，
     Math.max 把整组（虚线起点 + 箭头 + 字母）一起夹回来，别让「A」悬空 */
  const cutTop = Math.max(SHEET.inner + 24, Y(state.hgt) - 26);
  const cutLabY = cutTop - 6;
  p.push(ln(cutX, cutTop, cutX, GY + 16, { stroke: ACCENT, w: 1.2, dash: '16 4 4 4', op: 0.85 }));
  p.push(arrowL(cutX - 22, cutTop));
  p.push(txt(cutX - 30, cutLabY, 'A', { size: 16, fill: ACCENT, anchor: 'end', weight: 700 }));
  p.push(arrowR(cutX + 22, GY + 16));
  p.push(txt(cutX + 30, GY + 22, 'A', { size: 16, fill: ACCENT, weight: 700 }));

  /* 俯视图 */
  const topD = smooth(topPts.map(([x, y]) => [X(x), CL - y * K]), true);
  p.push(txt(CX0, 492, '俯视图  TOP ELEVATION', { size: 12, fill: MUTE, ls: 2 }));
  p.push(ln(OX - 26, CL, X(LEN) + 26, CL, { stroke: PAPER, w: 1, dash: '14 4 3 4', op: 0.5 }));
  const wh = (state.wid - state.wheel) / 2;
  for (const mmx of [AF - 15 * KL, AR - 15 * KL]) {
    for (const s of [-1, 1]) {
      const ry = s > 0 ? CL + wh * K : CL - (wh + state.wall) * K;
      p.push(rect(X(mmx), ry, 30 * KL * K, state.wall * K, { fill: PAPER, fillOp: 0.1, stroke: PAPER, sw: 1.1, op: 0.6 }));
    }
  }
  p.push(`<path d="${topD}" fill="${PAPER}" fill-opacity="0.14"/>`);
  p.push(`<path d="${topD}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
  p.push(ln(OX - 26, CL - state.wid / 2 * K, X(LEN) + 26, CL - state.wid / 2 * K, { stroke: PAPER, w: 0.8, dash: '9 4', op: 0.28 }));
  p.push(ln(OX - 26, CL + state.wid / 2 * K, X(LEN) + 26, CL + state.wid / 2 * K, { stroke: PAPER, w: 0.8, dash: '9 4', op: 0.28 }));
  p.push(dimV(CL - state.wid / 2 * K, CL + state.wid / 2 * K, 106, `W ${deg(state.wid)}`, OX));
  /* 尺寸链：前悬 / 轴距 / 后悬 */
  const CH = 806, CHX = CL + state.wid / 2 * K;
  p.push(txt(CX1, 786, '尺寸链 OVERHANG CHAIN', { size: 10.5, fill: MUTE2, anchor: 'end', ls: 1.4 }));
  p.push(dimH(X(0), X(AF), CH, fx(AF, 1), CHX));
  p.push(dimH(X(AF), X(AR), CH, `WB ${deg(WB)}`, CHX));
  p.push(dimH(X(AR), X(LEN), CH, fx(LEN - AR, 1), CHX));

  /* 断面 A—A */
  p.push(txt(CX0, 852, '断面 A—A', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(CX0 + 96, 852, `（过 ${deg(CUT_MM)} mm 站位）`, { size: 10.5, fill: MUTE2 }));
  p.push(txt(CX1, 852, '剖面线 45° · 网格 1.0 mm · 只铺实体材料', { size: 10.5, fill: MUTE2, anchor: 'end' }));

  const scx = 268, scy = 1020;
  const sw = state.wid * K3, sh = state.hgt * K3;
  const SL = scx - sw / 2, SR = scx + sw / 2, ST = scy - sh / 2, SB = scy + sh / 2;
  p.push(`<rect x="${(SL - 7).toFixed(1)}" y="${(ST - 7).toFixed(1)}" width="${(sw + 14).toFixed(1)}" height="${(sh + 14).toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="0.8" stroke-opacity="0.22" stroke-dasharray="4 4"/>`);
  const outerSec = `M${SL.toFixed(1)} ${(ST + 30).toFixed(1)}`
    + ` Q${SL.toFixed(1)} ${ST.toFixed(1)} ${(SL + 44).toFixed(1)} ${ST.toFixed(1)}`
    + ` L${(SR - 44).toFixed(1)} ${ST.toFixed(1)}`
    + ` Q${SR.toFixed(1)} ${ST.toFixed(1)} ${SR.toFixed(1)} ${(ST + 30).toFixed(1)}`
    + ` L${SR.toFixed(1)} ${(SB - 30).toFixed(1)}`
    + ` Q${SR.toFixed(1)} ${SB.toFixed(1)} ${(SR - 44).toFixed(1)} ${SB.toFixed(1)}`
    + ` L${(SL + 44).toFixed(1)} ${SB.toFixed(1)}`
    + ` Q${SL.toFixed(1)} ${SB.toFixed(1)} ${SL.toFixed(1)} ${(SB - 30).toFixed(1)} Z`;
  const br = state.bore / 2 * K3;
  const boreCY = SB - (state.hgt - 30) * K3;
  const boreD = `M${(scx + br).toFixed(1)} ${boreCY.toFixed(1)}`
    + ` A${br.toFixed(1)} ${br.toFixed(1)} 0 1 0 ${(scx - br).toFixed(1)} ${boreCY.toFixed(1)}`
    + ` A${br.toFixed(1)} ${br.toFixed(1)} 0 1 0 ${(scx + br).toFixed(1)} ${boreCY.toFixed(1)} Z`;
  p.push(`<path d="${outerSec} ${boreD}" fill="url(#hzA)" fill-rule="evenodd"/>`);
  p.push(`<path d="${outerSec} ${boreD}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
  p.push(ln(SL - 18, scy, SR + 18, scy, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.4 }));
  p.push(ln(scx, ST - 18, scx, SB + 18, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.4 }));
  p.push(dimV(ST, SB, SR + 44, `H ${deg(state.hgt)}`, SR));
  p.push(dimH(SL, SR, SB + 44, `W ${deg(state.wid)}`, SB));
  p.push(ln(scx - br - 4, boreCY, scx - br - 40, boreCY - 40, { stroke: PAPER, w: 1, op: 0.6 }));
  p.push(ln(scx - br - 40, boreCY - 40, scx - br - 84, boreCY - 40, { stroke: PAPER, w: 1, op: 0.6 }));
  p.push(txt(scx - br - 44, boreCY - 47, `ø${deg(state.bore)} 气室`, { size: 11, fill: MUTE, anchor: 'end' }));

  /* 详图 D */
  p.push(txt(600, 852, '详图 D', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(672, 852, '轮系 · 6:1', { size: 10.5, fill: MUTE2 }));
  const dcx = 740, dcy = 1020, dr = state.wheel / 2 * K4;
  p.push(`<circle cx="${dcx}" cy="${dcy}" r="${dr}" fill="${PAPER}" fill-opacity="0.1" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
  p.push(`<circle cx="${dcx}" cy="${dcy}" r="${(dr * 0.38).toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="1.1" stroke-opacity="0.62"/>`);
  p.push(`<circle cx="${dcx}" cy="${dcy}" r="${(state.axle / 2 * K4).toFixed(1)}" fill="${INK}" stroke="${PAPER}" stroke-width="1.2" stroke-opacity="0.85"/>`);
  p.push(ln(dcx - dr - 22, dcy, dcx + dr + 22, dcy, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.4 }));
  p.push(ln(dcx, dcy - dr - 22, dcx, dcy + dr + 22, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.4 }));
  p.push(dimH(dcx - dr, dcx + dr, dcy + dr + 48, `ø${deg(state.wheel)}`, dcy + dr));
  const ex = 880, ew = state.wall * K4, eh = state.wheel * K4;
  p.push(rect(ex, dcy - eh / 2, ew, eh, { fill: 'url(#hzB)' }));
  p.push(rect(ex, dcy - eh / 2, ew, eh, { stroke: ACCENT, sw: 1.4, op: 0.92 }));
  p.push(ln(ex - 16, dcy, ex + ew + 16, dcy, { stroke: PAPER, w: 0.9, dash: '12 3 3 3', op: 0.35 }));
  p.push(dimH(ex, ex + ew, dcy + eh / 2 + 48, `B ${deg(state.wall)}`, dcy + eh / 2));
  p.push(txt(ex + ew / 2, dcy - eh / 2 - 16, '轮宽', { size: 10.5, fill: MUTE, anchor: 'middle' }));

  /* 参数表 */
  const cols = [
    { h: '参数 PARAMETER', w: 240 },
    { h: '符号', w: 88, align: 'middle' },
    { h: '数值', w: 176, align: 'end' },
    { h: '单位', w: 88, align: 'middle', op: 0.62 },
    { h: '来源', w: 216, op: 0.62 },
    { h: '状态', w: 88, op: 1 },
  ];
  const SX = CX0 + 240 + 88 + 176 + 88 + 216;
  const rows = [
    ['车长', 'L', deg(LEN), 'mm', '游标卡尺，三次取中位', mk('沿用')],
    ['车宽（含轮）', 'W', deg(state.wid), 'mm', '游标卡尺，三次取中位', mk('沿用')],
    ['车高', 'H', deg(state.hgt), 'mm', '高度尺，以轨道面为零', mk('沿用')],
    ['轴距', 'WB', deg(WB), 'mm', '两轴心，计算值', mk('沿用')],
    ['轮径', 'D', deg(state.wheel), 'mm', '游标卡尺', mk('沿用')],
    ['轮宽', 'B', deg(state.wall), 'mm', '游标卡尺', mk('沿用')],
    ['质心高', 'h', deg(state.cg), 'mm', '刀口法，含气瓶', mk('实测*')],
    ['迎风面积', 'A', fx(state.area, 0), 'mm²', '投影照片像素计数', mk('估算')],
    ['迎风面积', 'A', (state.area / 1e6).toFixed(2) + 'e-3', 'm²', '同上，换算', mk('估算')],
    ['整车质量', 'm', deg(state.mass), 'g', '电子天平 0.1 g', mk('实测*')],
    ['气室孔', 'ø', deg(state.bore), 'mm', 'C 版图纸标注，未复测', mk('沿用')],
  ];
  const cnt = {};
  for (const r of rows) cnt[r[5].s] = (cnt[r[5].s] || 0) + 1;
  const TB = { y: 1218, rowH: 26, headH: 30 };
  const tableBottom = TB.y + TB.headH + rows.length * TB.rowH;

  p.push(txt(CX0, 1204, '参数表  PARAMETER TABLE', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(CX1, 1204, `参数状态 · 未实测 · ${cnt['实测'] || 0} / ${rows.length} 项有原始读数`,
    { size: 12, fill: ACCENT, weight: 600, anchor: 'end' }));

  /* 状态列铺底：先画在表格线下面，表格的列线再压上去 */
  rows.forEach((r, i) => {
    const S = STATUS[r[5] && r[5].s];
    if (!S || !S.bg) return;   // 漏标的行不铺底，交给 selfTest 报错，别让整页崩掉
    const ry = TB.y + TB.headH + i * TB.rowH;
    p.push(rect(SX + 0.5, ry + 0.5, 87, TB.rowH - 1, { fill: S.bg, fillOp: S.op }));
  });
  p.push(table(CX0, TB.y, CW, cols, rows, TB.rowH, TB.headH));

  /* 状态图例：符号 + 本图实际计数 */
  const legendItem = (x, st, label) => {
    const S = STATUS[st];
    if (S.bg) p.push(rect(x, 1553, 11, 11, { fill: S.bg, fillOp: S.op }));
    else p.push(rect(x + 0.5, 1553.5, 10, 10, { stroke: MUTE, sw: 1.1, op: 0.8 }));
    p.push(txt(x + 17, 1562, label, { size: 10.5, fill: MUTE }));
  };
  p.push(txt(CX0, 1562, '状态', { size: 10.5, fill: MUTE2, ls: 1.6 }));
  legendItem(148, '实测', `实测 ${cnt['实测'] || 0} 项 · 有原始读数`);
  legendItem(360, '实测*', `实测* ${cnt['实测*'] || 0} 项 · 读数未存档`);
  legendItem(576, '估算', `估算 ${cnt['估算'] || 0} 项 · 照相似件估`);
  legendItem(760, '沿用', `沿用 ${cnt['沿用'] || 0} 项 · 旧图带来`);

  /* 说明 */
  p.push(txt(CX0, 1588, '说明  NOTES', { size: 12, fill: MUTE, ls: 2 }));
  const notes = [
    `1. 本图 ${rows.length} 项参数未经本车复核：${cnt['沿用'] || 0} 项沿用 C 版旧图，迎风面积照相似件估，质量与质心虽上秤、上刀口，原始读数未存档。状态栏逐项标注。`,
    '2. 未注圆角 R2，未注倒角 0.5×45°；车体单一坯料铣削，气室孔 ø19.0 与轴线同轴度 φ0.05。',
    '3. 迎风面积取正面投影，不是包围盒：包围盒 62.0×44.5 = 2759 mm²，与 1860 差 33%。',
    '4. 质心按刀口法测三次，极差 0.3 mm，原始读数未存档；气瓶未装时 19.8 mm。',
  ];
  notes.forEach((n, i) => p.push(txt(CX0, 1616 + i * 22, n, { size: 11.5, fill: MUTE })));

  /* 左下修订记录 */
  const rcols = [{ h: '版本', w: 84, align: 'middle' }, { h: '日期', w: 132, align: 'middle' }, { h: '改动', w: 292 }];
  const rrows = [
    ['A', '2025-09-14', '初版'],
    ['B', '2025-10-02', '车高改 44.5，尾部减薄'],
    ['C', '2025-11-08', '气室孔改 ø19.0，补质心标注'],
  ];
  p.push(txt(CX0, 1712, '修订记录  REVISIONS', { size: 10.5, fill: MUTE, ls: 1.8 }));
  p.push(table(CX0, 1724, 508, rcols, rrows, 26, 26));

  /* 右下标题栏 */
  const tb = { x: 620, y: 1690, w: 368, h: 160 };
  p.push(rect(tb.x, tb.y, tb.w, tb.h, { stroke: PAPER, sw: 2, op: 0.85 }));
  p.push(ln(tb.x, tb.y + 54, tb.x + tb.w, tb.y + 54, { stroke: PAPER, w: 1.2, op: 0.6 }));
  p.push(ln(tb.x, tb.y + 106, tb.x + tb.w, tb.y + 106, { stroke: PAPER, w: 1.2, op: 0.6 }));
  p.push(ln(tb.x + 184, tb.y + 54, tb.x + 184, tb.y + tb.h, { stroke: PAPER, w: 1, op: 0.45 }));
  p.push(txt(tb.x + 14, tb.y + 22, 'STEM RACING · CZ3-2025', { size: 10, fill: MUTE2, ls: 1.6 }));
  p.push(rect(tb.x + 216, tb.y + 9, 138, 19, { fill: ACCENT, fillOp: 0.9 }));
  p.push(txt(tb.x + 285, tb.y + 23, '参数状态 未实测', { size: 10, fill: INK, weight: 700, anchor: 'middle' }));
  p.push(txt(tb.x + 14, tb.y + 44, '整车外形与断面图', { size: 18, font: DISP, weight: 700, fill: PAPER }));
  p.push(txt(tb.x + 14, tb.y + 78, '图号 DWG', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(tb.x + 14, tb.y + 96, 'CZ3-DWG-014', { size: 14, fill: PAPER, weight: 600, ls: 0.6 }));
  p.push(txt(tb.x + 198, tb.y + 78, '比例 SCALE', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(tb.x + 198, tb.y + 96, '按幅面缩放', { size: 14, fill: PAPER, weight: 600 }));
  p.push(txt(tb.x + 14, tb.y + 124, '材料 MATERIAL', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(tb.x + 14, tb.y + 144, '椴木 / PA12 轮', { size: 13, fill: PAPER, weight: 500 }));
  p.push(txt(tb.x + 198, tb.y + 124, '质量 MASS', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(tb.x + 198, tb.y + 144, `${deg(state.mass)} g`, { size: 14, fill: ACCENT, weight: 600 }));

  geo = {
    sideRight: X(LEN), topBottom: CL + state.wid / 2 * K,
    rows, cnt, sx: SX, sw: 88,
    tableBottom, legendBottom: 1568,
    notesBottom: 1616 + 3 * 22, tbBottom: tb.y + tb.h,
    cutMark: { labelY: cutLabY, inkTop: cutLabY - 13, cutX, clamped: Y(state.hgt) - 26 < SHEET.inner + 24 },
    /* 主视图取样窗口：门禁拿它证明「图形真的跟着参数变」，
       不含尺寸线（y 456 在下面）和参数表 */
    sideViewport: { x0: CX0, x1: CX1, y0: 230, y1: 442 },
    bodyBox: { x0: X(0), x1: X(LEN), y0: Y(state.hgt), y1: GY },
  };

  return frame(W, H, p.join(''), INK);
}

/* 4:5 封面 —— 重排，不是裁切。
   竖版 1920 高，4:5 只有 1350；resample() 是居中裁切，保留源行 285..1635，
   而标题栏在 1690..1850、修订记录在 1724..1820——每张封面都整块丢。
   所以这里单独排一张 1080×1350：缩略侧视图 + 关键参数 + 标题栏 + 修订记录，
   并在图上写明这是节选重排。reel-export 的 exportEpisode 第三个参数就是干这个的。 */
function buildCover() {
  const savedDrawn = drawn, savedItems = items;
  drawn = []; items = [];
  const p = [];
  const deg = (mm) => fx(mm, 1);
  const KL = kLen(), KH = kHgt();
  const LEN = state.len;
  const AF = AXLE_F * KL, AR = AXLE_R * KL;
  const sidePts = BODY_SIDE.map(([x, y]) => [x * KL, y * KH]);

  p.push('<defs>' + hatch('hzA', { step: 6, width: 1.3, color: 'rgba(242,240,235,0.55)' }) + '</defs>');

  p.push(rect(SHEET.outer, SHEET.outer, W - 2 * SHEET.outer, COVER_H - 2 * SHEET.outer, { stroke: PAPER, sw: 2.5, op: 0.9 }));
  p.push(rect(SHEET.inner, SHEET.inner, W - 2 * SHEET.inner, COVER_H - 2 * SHEET.inner, { stroke: PAPER, sw: 1, op: 0.42 }));

  p.push(txt(CX0, 112, 'STEM RACING · CZ3-2025', { size: 11, fill: ACCENT, weight: 700, ls: 3 }));
  p.push(txt(CX0, 170, '整车外形与断面图', { size: 44, font: DISP, weight: 700, fill: PAPER, ls: 1 }));
  p.push(txt(CX0, 198, 'BODY ENVELOPE & SECTION  ·  CO₂ 直线加速车', { size: 12, fill: MUTE, ls: 1.6 }));
  p.push(txt(CX1, 170, 'CZ3-DWG-014', { size: 24, fill: PAPER, weight: 600, anchor: 'end', ls: 1 }));
  p.push(txt(CX1, 198, '封面版 · 4:5', { size: 11, fill: MUTE2, anchor: 'end', ls: 1.2 }));
  p.push(ln(CX0, 218, CX1, 218, { stroke: PAPER, w: 2, op: 0.8 }));

  /* 这张封面到底是不是全图，得在图上写清楚，不能让人猜 */
  const exY = 234;
  p.push(rect(CX0, exY, CW, 30, { stroke: ACCENT, sw: 1.2, op: 0.9 }));
  p.push(txt(CX0 + 12, exY + 20, '本封面是节选重排，不是全图', { size: 12, fill: ACCENT, weight: 700 }));
  p.push(txt(CX0 + 246, exY + 20, '完整 11 项参数表、A—A 断面、详图 D 见 1080×1920 竖版', { size: 11, fill: MUTE }));

  /* 缩略侧视图：真按参数画，不是贴图 */
  const gY = 466;
  const KC = Math.min(720 / LEN, 138 / state.hgt);
  const cx0 = CX0 + 40;
  const cxk = (mm) => cx0 + mm * KC;
  const cyk = (mm) => gY - mm * KC;
  p.push(txt(CX0, 300, '主视图（缩略）  SIDE ELEVATION', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(CX1, 300, '按幅面缩放 · 尺寸以标注为准', { size: 10.5, fill: MUTE2, anchor: 'end', ls: 0.8 }));
  p.push(ln(cxk(0) - 24, gY, cxk(LEN) + 24, gY, { stroke: PAPER, w: 1, dash: '14 4 3 4', op: 0.55 }));
  p.push('<path d="' + smooth(sidePts.map(([x, y]) => [cxk(x), cyk(y)]), true) + '" fill="' + PAPER + '" fill-opacity="0.13" stroke="' + PAPER + '" stroke-width="1.6" stroke-opacity="0.85"/>');
  const cwr = state.wheel / 2 * KC;
  for (const mmx of [AF, AR]) {
    const wx = cxk(mmx).toFixed(1), wy = (gY - cwr).toFixed(1);
    p.push('<circle cx="' + wx + '" cy="' + wy + '" r="' + cwr.toFixed(1) + '" fill="none" stroke="' + PAPER + '" stroke-width="1.6" stroke-opacity="0.8"/>');
    p.push('<circle cx="' + wx + '" cy="' + wy + '" r="' + (cwr * 0.34).toFixed(1) + '" fill="none" stroke="' + PAPER + '" stroke-width="1.2" stroke-opacity="0.6"/>');
  }
  p.push(dimH(cxk(0), cxk(LEN), gY + 36, 'L = ' + deg(LEN), gY));

  /* 关键参数：只取 6 项，但每一项都带可信度标记，不因为这是封面就省掉 */
  const kcols = [
    { h: '参数', w: 300 }, { h: '符号', w: 100, align: 'middle' },
    { h: '数值', w: 210, align: 'end' }, { h: '单位', w: 110, align: 'middle' },
    { h: '状态', w: 176, align: 'middle' },
  ];
  const krows = [
    ['车长', 'L', deg(LEN), 'mm', mk('沿用')],
    ['车宽', 'W', deg(state.wid), 'mm', mk('沿用')],
    ['车高', 'H', deg(state.hgt), 'mm', mk('沿用')],
    ['质心高', 'h', deg(state.cg), 'mm', mk('实测*')],
    ['迎风面积', 'A', fx(state.area, 0), 'mm²', mk('估算')],
    ['整车质量', 'm', deg(state.mass), 'g', mk('实测*')],
  ];
  const ktY = 540;
  p.push(txt(CX0, ktY - 12, '关键参数  KEY PARAMETERS', { size: 12, fill: MUTE, ls: 2 }));
  p.push(txt(CX1, ktY - 12, '完整 11 项见竖版', { size: 10.5, fill: MUTE2, anchor: 'end' }));
  p.push(table(CX0, ktY, CW, kcols, krows, 30, 30));

  /* 标题栏：封面以前整块丢的就是这一块，现在放到正中间 */
  const ctb = { x: CX0, y: 786, w: CW, h: 170 };
  p.push(rect(ctb.x, ctb.y, ctb.w, ctb.h, { stroke: PAPER, sw: 2, op: 0.85 }));
  p.push(ln(ctb.x, ctb.y + 46, ctb.x + ctb.w, ctb.y + 46, { stroke: PAPER, w: 1.2, op: 0.6 }));
  p.push(ln(ctb.x, ctb.y + 108, ctb.x + ctb.w, ctb.y + 108, { stroke: PAPER, w: 1.2, op: 0.6 }));
  for (const dx of [300, 600]) p.push(ln(ctb.x + dx, ctb.y + 46, ctb.x + dx, ctb.y + ctb.h, { stroke: PAPER, w: 1, op: 0.45 }));
  p.push(txt(ctb.x + 14, ctb.y + 20, 'STEM RACING · CZ3-2025', { size: 10, fill: MUTE2, ls: 1.6 }));
  p.push(rect(ctb.x + 700, ctb.y + 8, 178, 22, { fill: ACCENT, fillOp: 0.9 }));
  p.push(txt(ctb.x + 789, ctb.y + 23, '参数状态 未实测', { size: 10, fill: INK, weight: 700, anchor: 'middle' }));
  p.push(txt(ctb.x + 14, ctb.y + 40, '整车外形与断面图', { size: 19, font: DISP, weight: 700, fill: PAPER }));
  p.push(txt(ctb.x + 14, ctb.y + 64, '图号 DWG', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(ctb.x + 14, ctb.y + 90, 'CZ3-DWG-014', { size: 15, fill: PAPER, weight: 600, ls: 0.6 }));
  p.push(txt(ctb.x + 314, ctb.y + 64, '比例 SCALE', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(ctb.x + 314, ctb.y + 90, '按幅面缩放', { size: 15, fill: PAPER, weight: 600 }));
  p.push(txt(ctb.x + 614, ctb.y + 64, '质量 MASS', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(ctb.x + 614, ctb.y + 90, deg(state.mass) + ' g', { size: 15, fill: ACCENT, weight: 600 }));
  p.push(txt(ctb.x + 14, ctb.y + 126, '材料 MATERIAL', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(ctb.x + 14, ctb.y + 150, '椴木 / PA12 轮', { size: 13, fill: PAPER, weight: 500 }));
  p.push(txt(ctb.x + 314, ctb.y + 126, '最新修订 REV', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(ctb.x + 314, ctb.y + 150, 'C', { size: 15, fill: PAPER, weight: 600 }));
  p.push(txt(ctb.x + 614, ctb.y + 126, '幅面 SHEET', { size: 9.5, fill: MUTE2, ls: 1.4 }));
  p.push(txt(ctb.x + 614, ctb.y + 150, '1080×1350 · 4:5', { size: 13, fill: PAPER, weight: 500 }));

  /* 修订记录：竖版里在 1724..1820，封面窗口根本够不到，这里补上 */
  const rcols = [
    { h: '版本', w: 84, align: 'middle' }, { h: '日期', w: 132, align: 'middle' },
    { h: '改动', w: 292 },
  ];
  const rrows = [
    ['A', '2025-09-14', '初版'],
    ['B', '2025-10-02', '车高改 44.5，尾部减薄'],
    ['C', '2025-11-08', '气室孔改 ø19.0，补质心标注'],
  ];
  p.push(txt(CX0, 974, '修订记录  REVISIONS', { size: 10.5, fill: MUTE, ls: 1.8 }));
  p.push(table(CX0, 986, 508, rcols, rrows, 26, 26));

  p.push(txt(CX0, 1126, '说明  NOTES', { size: 10.5, fill: MUTE, ls: 1.8 }));
  p.push(txt(CX0, 1150, '1. 本封面是 4:5 节选重排，不是全图：保留主视图缩略、6 项关键参数、标题栏与修订记录。', { size: 11, fill: MUTE }));
  p.push(txt(CX0, 1174, '2. 参数状态逐项标注；本车 0 / 11 项有原始读数，完整表在竖版。', { size: 11, fill: MUTE }));
  p.push(txt(CX0, 1230, 'STEM RACING · CZ3-2025 · 队内自制', { size: 10, fill: MUTE2, ls: 1.4 }));

  geo.cover = {
    h: COVER_H,
    tb: { x0: ctb.x, x1: ctb.x + ctb.w, y0: ctb.y, y1: ctb.y + ctb.h },
    excerpt: { y0: exY, y1: exY + 30 },
    thumb: { x0: CX0, x1: CX1, y0: 300, y1: gY },
    tableBottom: ktY + 30 + krows.length * 30,
    revBottom: 986 + 26 + rrows.length * 26,
    noteBottom: 1174,
  };

  const out = frame(W, COVER_H, p.join(''), INK);
  drawn = savedDrawn; items = savedItems;
  return out;
}

/* 画板 */
const stage = document.getElementById('stage');
const board = createArtboard({ w: W, h: H });
const coverBoard = createArtboard({ w: W, h: COVER_H });
stage.replaceWith(board.canvas);
board.canvas.id = 'stage';
function compose() {
  const a = board.paint(build());
  const b = coverBoard.paint(buildCover());
  return Promise.all([a, b]).then(() => undefined);
}

/* 控制面板 */
(() => {
  const g = (id) => document.getElementById(id);
  const keys = ['len', 'wid', 'hgt', 'wheel', 'cg', 'area', 'mass'];
  const sync = () => {
    for (const k of keys) {
      const v = Number(g(k).value);
      if (Number.isFinite(v) && v > 0) state[k] = v;
    }
    state.wall = Math.min(20, Math.max(6, state.wheel / 2));
    state.wb = wbNow();
    compose();
  };
  for (const k of keys) g(k).addEventListener('input', sync);
  g('reset').addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    for (const k of keys) g(k).value = state[k];
    compose();
  });
  g('export').addEventListener('click', () => exportEpisode(board.canvas, 'spec-sheet', coverBoard.canvas));
})();
compose();

/* 测试钩子 */
window.__app = {
  canvas: board.canvas,
  coverCanvas: coverBoard.canvas,
  coverGeo: () => geo.cover,
  ready: () => Promise.all([board.ready(), coverBoard.ready()]).then(() => undefined),
  safe: { x0: 96, x1: 984, y0: 100, y1: 1820 },
  geo: () => geo,
  fonts: { MONO, DISP },
  probeGlyph: async (ch, fontCss, size = 48) => {
    const c = document.createElement('canvas');
    c.width = 76; c.height = 84;
    const m = frame(76, 84,
      `<text x="8" y="64" font-family='${fontCss}' font-size="${size}" fill="#fff">${esc(ch)}</text>`, '#000');
    await rasterize(c, m, 76, 84);
    const dd = c.getContext('2d').getImageData(0, 0, 76, 84).data;
    let h = 2166136261, ink = 0;
    for (let i = 0; i < dd.length; i += 4) {
      if (dd[i] > 8) ink++;
      h ^= dd[i]; h = Math.imul(h, 16777619) >>> 0;
    }
    return { hash: h, ink };
  },
  texts: () => drawn.join('\n'),
  items: () => items.map(i => ({ ...i })),
  getState: () => ({ ...state }),
  set: (k, v) => { state[k] = v; return compose(); },
  compose: () => compose(),
  selfTest: () => {
    const errs = [];
    if (!(state.len > 50 && state.len < 400)) errs.push('车长超范围');
    if (!(state.hgt > 5 && state.hgt < state.len)) errs.push('车高离谱');
    if (!(state.wid > 5 && state.wid < state.len)) errs.push('车宽离谱');
    if (!(state.cg > 0 && state.cg < state.hgt)) errs.push('质心高于车高');
    if (!(state.area > 0 && state.area < state.wid * state.hgt)) errs.push('迎风面积大于包围盒');
    if (!(state.mass > 0)) errs.push('质量非正');
    if (!drawn.length) errs.push('没有文字');

    /* 每一行都必须带可信度标记，漏一行这张图就又比实际可信了 */
    const bare = geo.rows.filter((r) => !r[5] || !STATUS[r[5].s]).map((r) => r[0]);
    if (bare.length) errs.push(`参数表 ${bare.length} 行没标可信度：${bare.join('/')}`);
    if (geo.rows.length < 11) errs.push(`参数表只有 ${geo.rows.length} 行，少于 11 项`);
    if (!(geo.sx >= CX0 && geo.sx + geo.sw <= CX0 + CW)) errs.push('状态列出了表框');
    if (!(geo.tableBottom < 1568)) errs.push(`参数表压到图例 ${geo.tableBottom.toFixed(0)}`);
    if (!(geo.legendBottom < 1616)) errs.push('图例压到说明');
    if (geo.tbBottom > 1850) errs.push('标题栏出内框');
    if (geo.sideRight > CX1) errs.push('主视图出右边界');
    if (!(geo.cutMark && geo.cutMark.inkTop >= SHEET.inner)) errs.push(`A—A 剖切标记出内框（顶部 ${geo.cutMark && geo.cutMark.inkTop}）`);
    if (geo.topBottom > 806) errs.push(`俯视图压到尺寸线 ${geo.topBottom.toFixed(0)}`);
    if (geo.notesBottom > 1700) errs.push('说明压到修订记录');
    if (geo.tbBottom > 1850) errs.push('标题栏出内框');
    return { ok: errs.length === 0, errs };
  },
  exportPNG: async () => {
    await compose();
    const b = await toPNG(board.canvas, { width: 1080, height: 1920 });
    await assertPNG(b);
    return b.size;
  },
  exportCover: async () => {
    await compose();
    const b = await toPNG(coverBoard.canvas, { width: 1080, height: 1350 });
    await assertPNG(b);
    return b.size;
  },
  downloadAll: () => exportEpisode(board.canvas, 'spec-sheet', coverBoard.canvas),
};
