(() => {
  // src/reel-export.js
  var REEL_W = 1080;
  var REEL_H = 1920;
  var COVER_W = 1080;
  var COVER_H = 1350;
  function resample(src, outW, outH) {
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const sw = src.width, sh = src.height;
    const scale = Math.max(outW / sw, outH / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(src, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
    return c;
  }
  async function toPNG(canvas, { width = REEL_W, height = REEL_H, quality } = {}) {
    const out = resample(canvas, width, height);
    const blob = await new Promise((r) => out.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob returned null");
    if (blob.size < 4096) throw new Error(`PNG \u8FC7\u5C0F\uFF08${blob.size} B\uFF09\uFF0C\u753B\u5E03\u53EF\u80FD\u662F\u7A7A\u7684`);
    return blob;
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async function assertPNG(blob) {
    const b = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const magic = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (b[i] !== magic[i]) throw new Error("\u4E0D\u662F\u5408\u6CD5 PNG");
    return true;
  }
  async function exportEpisode(canvas, slug, coverCanvas = canvas) {
    const vertical = await toPNG(canvas, { width: REEL_W, height: REEL_H });
    await assertPNG(vertical);
    download(vertical, `${slug}-1080x1920.png`);
    const cover = await toPNG(coverCanvas, { width: COVER_W, height: COVER_H });
    await assertPNG(cover);
    download(cover, `${slug}-1080x1350.png`);
    return { vertical: vertical.size, cover: cover.size };
  }

  // src/svg-artboard.js
  var INK = "#0B0B0C";
  var PAPER = "#F2F0EB";
  var ACCENT = "#E8590C";
  var MUTE = "rgba(242,240,235,0.55)";
  var MUTE2 = "rgba(242,240,235,0.32)";
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Bahnschrift Condensed","Bahnschrift","Arial Narrow","Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fx(n, d = 3) {
    return Number(n).toFixed(d);
  }
  function frame(w, h, body, bg = INK) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>` + body + "</svg>";
  }
  function hatch(id, { step = 8, width = 1.4, color = MUTE2 } = {}) {
    return `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${step}" stroke="${color}" stroke-width="${width}"/></pattern>`;
  }
  async function rasterize(canvas, markup, w, h) {
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG \u5149\u6805\u5316\u5931\u8D25"));
      img.src = url;
    });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  }
  function createArtboard({ w = 1080, h = 1920 } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const mount = document.createElement("div");
    let pending = Promise.resolve();
    let texts = [];
    function paint(markup, textList = []) {
      texts = textList;
      mount.innerHTML = markup;
      const el = mount.firstElementChild;
      if (!el) throw new Error("\u753B\u677F\u6536\u5230\u7A7A SVG");
      const xml = new XMLSerializer().serializeToString(el);
      pending = rasterize(canvas, xml, w, h);
      return pending;
    }
    return {
      w,
      h,
      canvas,
      paint,
      ready: () => pending,
      texts: () => texts
    };
  }

  // src/main.js
  var W = 1080;
  var H = 1920;
  var COVER_H2 = 1350;
  var SHEET = { outer: 30, inner: 70 };
  var CX0 = 92;
  var CX1 = 988;
  var CW = CX1 - CX0;
  var K = 4.1;
  var K3 = 5.4;
  var K4 = 6;
  var OX = 130;
  var GY = 414;
  var CL = 640;
  var DEFAULTS = {
    len: 196,
    wid: 62,
    hgt: 44.5,
    wheel: 30,
    wall: 15,
    cg: 21.4,
    area: 1860,
    mass: 58.4,
    bore: 19,
    axle: 3,
    wb: 145
  };
  var state = { ...DEFAULTS };
  var geo = {};
  var STATUS = {
    "\u5B9E\u6D4B": { bg: PAPER, op: 0.9, text: INK, label: "\u672C\u8F66\u6D4B\u8FC7\uFF0C\u6709\u539F\u59CB\u8BFB\u6570" },
    "\u5B9E\u6D4B*": { bg: PAPER, op: 0.5, text: INK, label: "\u672C\u8F66\u6D4B\u8FC7\uFF0C\u8BFB\u6570\u672A\u5B58\u6863" },
    "\u4F30\u7B97": { bg: ACCENT, op: 0.88, text: INK, label: "\u7167\u76F8\u4F3C\u4EF6\u4F30\uFF0C\u975E\u672C\u8F66" },
    "\u6CBF\u7528": { bg: null, op: 0, text: MUTE, label: "C \u7248\u65E7\u56FE\u5E26\u6765\uFF0C\u672C\u8F66\u672A\u590D\u6838" }
  };
  var mk = (st) => ({ s: st, fill: STATUS[st].text, weight: 600 });
  var BODY_SIDE = [
    [0, 2.5],
    [0, 9],
    [14, 15],
    [40, 26],
    [66, 36],
    [88, 42.5],
    [104, 44.5],
    [124, 42],
    [146, 36.5],
    [168, 30],
    [182, 27],
    [196, 25.5],
    [196, 3],
    [170, 3],
    [110, 2.8],
    [50, 2.6]
  ];
  var BODY_TOP = [
    [0, 0],
    [4, 7],
    [12, 14],
    [26, 18.5],
    [48, 20.5],
    [80, 21],
    [130, 21],
    [165, 20.2],
    [185, 17.5],
    [196, 13],
    [196, -13],
    [185, -17.5],
    [165, -20.2],
    [130, -21],
    [80, -21],
    [48, -20.5],
    [26, -18.5],
    [12, -14],
    [4, -7]
  ];
  var AXLE_F = 18;
  var AXLE_R = 163;
  var BASE = { len: 196, hgt: 44.5, wid: 62 };
  var kLen = () => state.len / BASE.len;
  var kHgt = () => state.hgt / BASE.hgt;
  var kWid = () => state.wid / BASE.wid;
  var wbNow = () => (AXLE_R - AXLE_F) * kLen();
  function smooth(pts, closed = true) {
    const n = pts.length;
    const at = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d + " Z";
  }
  var X = (mm) => OX + mm * K;
  var Y = (mm) => GY - mm * K;
  var drawn = [];
  var items = [];
  var T = (s) => {
    drawn.push(String(s));
    return esc(s);
  };
  function txt(x, y, s, o = {}) {
    const { size = 13, font = MONO, fill = PAPER, weight = 400, anchor = "start", ls = 0, op = 1 } = o;
    items.push({ s: String(s), x, y, size, font, weight, anchor, ls });
    return `<text x="${x}" y="${y}" font-family='${font}' font-size="${size}" font-weight="${weight}" letter-spacing="${ls}" fill="${fill}"${op !== 1 ? ` fill-opacity="${op}"` : ""}${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${T(s)}</text>`;
  }
  var ln = (x1, y1, x2, y2, o = {}) => {
    const { stroke = MUTE2, w = 1, dash = null, op = 1 } = o;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}${op !== 1 ? ` stroke-opacity="${op}"` : ""}/>`;
  };
  var rect = (x, y, w, h, o = {}) => {
    const { fill = "none", stroke = "none", sw = 1, op = 1, fillOp = 1 } = o;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${op !== 1 ? ` stroke-opacity="${op}"` : ""}${fillOp !== 1 ? ` fill-opacity="${fillOp}"` : ""}/>`;
  };
  var arrowL = (x, y) => `<polygon points="${x},${y} ${x - 11},${y - 4.2} ${x - 11},${y + 4.2}" fill="${PAPER}" fill-opacity=".72"/>`;
  var arrowR = (x, y) => `<polygon points="${x},${y} ${x + 11},${y - 4.2} ${x + 11},${y + 4.2}" fill="${PAPER}" fill-opacity=".72"/>`;
  var arrowU = (x, y) => `<polygon points="${x},${y} ${x - 4.2},${y + 11} ${x + 4.2},${y + 11}" fill="${PAPER}" fill-opacity=".72"/>`;
  var arrowD = (x, y) => `<polygon points="${x},${y} ${x - 4.2},${y - 11} ${x + 4.2},${y - 11}" fill="${PAPER}" fill-opacity=".72"/>`;
  function dimH(x1, x2, y, label, featY) {
    const o = [];
    const s = Math.sign(y - featY) || 1;
    o.push(ln(x1, featY + 6 * s, x1, y + 9 * s, { stroke: PAPER, w: 0.9, op: 0.38 }));
    o.push(ln(x2, featY + 6 * s, x2, y + 9 * s, { stroke: PAPER, w: 0.9, op: 0.38 }));
    o.push(ln(x1 + 11, y, x2 - 11, y, { stroke: PAPER, w: 1, op: 0.66 }));
    o.push(arrowL(x1, y));
    o.push(arrowR(x2, y));
    o.push(txt((x1 + x2) / 2, y - 9, label, { size: 15, fill: PAPER, anchor: "middle", weight: 500 }));
    return o.join("");
  }
  function dimV(y1, y2, x, label, featX) {
    const o = [];
    const s = Math.sign(x - featX) || 1;
    o.push(ln(featX + 6 * s, y1, x + 9 * s, y1, { stroke: PAPER, w: 0.9, op: 0.38 }));
    o.push(ln(featX + 6 * s, y2, x + 9 * s, y2, { stroke: PAPER, w: 0.9, op: 0.38 }));
    o.push(ln(x, y1 + 11, x, y2 - 11, { stroke: PAPER, w: 1, op: 0.66 }));
    o.push(arrowU(x, y1));
    o.push(arrowD(x, y2));
    o.push(txt(x, y1 - 10, label, { size: 15, fill: PAPER, anchor: "middle", weight: 500 }));
    return o.join("");
  }
  function table(x, y, w, cols, rows, rowH, headH) {
    const o = [], total = headH + rows.length * rowH;
    o.push(rect(x, y, w, total, { stroke: PAPER, sw: 1, op: 0.5 }));
    o.push(rect(x, y, w, headH, { fill: PAPER, fillOp: 0.09 }));
    o.push(ln(x, y + headH, x + w, y + headH, { stroke: PAPER, w: 1, op: 0.5 }));
    let cx = x;
    for (const c of cols) {
      o.push(ln(cx, y, cx, y + total, { stroke: PAPER, w: 0.9, op: 0.3 }));
      cx += c.w;
    }
    rows.forEach((r, i) => {
      const ry = y + headH + i * rowH;
      if (i) o.push(ln(x, ry, x + w, ry, { stroke: PAPER, w: 0.8, op: 0.18 }));
      let px = x;
      r.forEach((cell, j) => {
        const c = cols[j];
        const al = c.align || "start";
        const tx = al === "end" ? px + c.w - 12 : al === "middle" ? px + c.w / 2 : px + 12;
        const box = cell && typeof cell === "object" ? cell : null;
        o.push(txt(tx, ry + rowH * 0.68, box ? box.s : cell, {
          size: c.size || 13,
          fill: box && box.fill || c.fill || PAPER,
          anchor: al,
          weight: box && box.weight || (j === 2 ? 600 : 400),
          op: c.op || 0.92
        }));
        px += c.w;
      });
    });
    let hx = x;
    cols.forEach((c) => {
      const al = c.align || "start";
      const tx = al === "end" ? hx + c.w - 12 : al === "middle" ? hx + c.w / 2 : hx + 12;
      o.push(txt(tx, y + headH * 0.68, c.h, { size: 11, fill: MUTE, anchor: al, ls: 1.4 }));
      hx += c.w;
    });
    return o.join("");
  }
  function build() {
    drawn = [];
    items = [];
    const p = [];
    const deg = (mm) => fx(mm, 1);
    const KL = kLen(), KH = kHgt(), KW = kWid();
    const LEN = state.len;
    const AF = AXLE_F * KL, AR = AXLE_R * KL, WB = AR - AF;
    const CUT_MM = 104 * KL;
    const sidePts = BODY_SIDE.map(([x, y]) => [x * KL, y * KH]);
    const topPts = BODY_TOP.map(([x, y]) => [x * KL, y * KW]);
    p.push(`<defs>` + hatch("hzA", { step: 6, width: 1.3, color: "rgba(242,240,235,0.55)" }) + hatch("hzB", { step: 5, width: 1.1, color: "rgba(232,89,12,0.62)" }) + "</defs>");
    p.push(rect(SHEET.outer, SHEET.outer, W - 2 * SHEET.outer, H - 2 * SHEET.outer, { stroke: PAPER, sw: 2.5, op: 0.9 }));
    p.push(rect(SHEET.inner, SHEET.inner, W - 2 * SHEET.inner, H - 2 * SHEET.inner, { stroke: PAPER, sw: 1, op: 0.42 }));
    const bw = (W - 2 * SHEET.inner) / 8, bh = (H - 2 * SHEET.inner) / 4;
    for (let i = 0; i < 8; i++) {
      const x = SHEET.inner + bw * i;
      if (i) {
        p.push(ln(x, SHEET.outer, x, SHEET.inner, { stroke: PAPER, w: 0.9, op: 0.3 }));
        p.push(ln(x, H - SHEET.inner, x, H - SHEET.outer, { stroke: PAPER, w: 0.9, op: 0.3 }));
      }
      p.push(txt(x + bw / 2, SHEET.inner - 12, String(i + 1), { size: 11, fill: MUTE2, anchor: "middle" }));
      p.push(txt(x + bw / 2, H - SHEET.outer + 20, String(i + 1), { size: 11, fill: MUTE2, anchor: "middle" }));
    }
    for (let i = 0; i < 4; i++) {
      const y = SHEET.inner + bh * i;
      if (i) {
        p.push(ln(SHEET.outer, y, SHEET.inner, y, { stroke: PAPER, w: 0.9, op: 0.3 }));
        p.push(ln(W - SHEET.inner, y, W - SHEET.outer, y, { stroke: PAPER, w: 0.9, op: 0.3 }));
      }
      p.push(txt(SHEET.outer + 20, y + bh / 2 + 4, "ABCD"[i], { size: 11, fill: MUTE2, anchor: "middle" }));
      p.push(txt(W - SHEET.outer - 20, y + bh / 2 + 4, "ABCD"[i], { size: 11, fill: MUTE2, anchor: "middle" }));
    }
    p.push(txt(CX0, 112, "STEM RACING \xB7 CZ3-2025", { size: 11, fill: ACCENT, weight: 700, ls: 3 }));
    p.push(txt(CX0, 168, "\u6574\u8F66\u5916\u5F62\u4E0E\u65AD\u9762\u56FE", { size: 46, font: DISP, weight: 700, fill: PAPER, ls: 1 }));
    p.push(txt(CX0, 196, "BODY ENVELOPE & SECTION  \xB7  CO\u2082 \u76F4\u7EBF\u52A0\u901F\u8F66", { size: 12, fill: MUTE, ls: 1.6 }));
    p.push(txt(CX1, 168, "CZ3-DWG-014", { size: 26, fill: PAPER, weight: 600, anchor: "end", ls: 1 }));
    p.push(txt(CX1, 196, "\u7B2C\u4E00\u89D2\u6CD5 \xB7 \u5355\u4F4D mm", { size: 11, fill: MUTE2, anchor: "end", ls: 1.2 }));
    p.push(ln(CX0, 216, CX1, 216, { stroke: PAPER, w: 2, op: 0.8 }));
    const sideD = smooth(sidePts.map(([x, y]) => [X(x), Y(y)]), true);
    p.push(txt(CX0, 248, "\u4E3B\u89C6\u56FE  SIDE ELEVATION", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(CX1, 248, "\u6BD4\u4F8B \u6309\u5E45\u9762\u7F29\u653E \xB7 \u5C3A\u5BF8\u4EE5\u6807\u6CE8\u4E3A\u51C6", { size: 10.5, fill: MUTE2, anchor: "end", ls: 0.8 }));
    p.push(ln(OX - 26, GY, X(LEN) + 26, GY, { stroke: PAPER, w: 1, dash: "14 4 3 4", op: 0.55 }));
    p.push(`<path d="${sideD}" fill="${PAPER}" fill-opacity="0.14"/>`);
    p.push(`<path d="${sideD}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
    const wr = state.wheel / 2 * K;
    for (const mmx of [AF, AR]) {
      const cxp = X(mmx), cyp = GY - wr;
      p.push(`<circle cx="${cxp.toFixed(1)}" cy="${cyp.toFixed(1)}" r="${wr.toFixed(1)}" fill="${PAPER}" fill-opacity="0.14" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
      p.push(`<circle cx="${cxp.toFixed(1)}" cy="${cyp.toFixed(1)}" r="${(state.axle / 2 * K).toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="1.1" stroke-opacity="0.6"/>`);
      p.push(ln(cxp - wr - 9, cyp, cxp + wr + 9, cyp, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.4 }));
      p.push(ln(cxp, cyp - wr - 9, cxp, cyp + wr + 9, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.4 }));
    }
    p.push(dimH(X(0), X(LEN), 456, `L = ${deg(LEN)}`, GY));
    p.push(dimV(Y(state.hgt), GY, 106, `H ${deg(state.hgt)}`, OX));
    const cgY = GY - state.cg * K;
    p.push(`<circle cx="560" cy="${cgY.toFixed(1)}" r="11" fill="none" stroke="${ACCENT}" stroke-width="1.4"/>`);
    p.push(`<path d="M560 ${(cgY - 11).toFixed(1)} A11 11 0 0 1 571 ${cgY.toFixed(1)} L560 ${cgY.toFixed(1)} Z" fill="${ACCENT}"/>`);
    p.push(`<path d="M560 ${(cgY + 11).toFixed(1)} A11 11 0 0 1 549 ${cgY.toFixed(1)} L560 ${cgY.toFixed(1)} Z" fill="${ACCENT}"/>`);
    p.push(ln(571, cgY - 7, 690, cgY - 52, { stroke: ACCENT, w: 1.1, op: 0.9 }));
    p.push(ln(690, cgY - 52, 934, cgY - 52, { stroke: ACCENT, w: 1.1, op: 0.9 }));
    p.push(txt(696, cgY - 60, `\u8D28\u5FC3\u9AD8 h = ${deg(state.cg)}\uFF08\u5200\u53E3\u6CD5\uFF09`, { size: 12, fill: ACCENT, weight: 500 }));
    p.push(dimV(cgY, GY, 508, `h ${deg(state.cg)}`, 540));
    const cutX = X(CUT_MM);
    const cutTop = Math.max(SHEET.inner + 24, Y(state.hgt) - 26);
    const cutLabY = cutTop - 6;
    p.push(ln(cutX, cutTop, cutX, GY + 16, { stroke: ACCENT, w: 1.2, dash: "16 4 4 4", op: 0.85 }));
    p.push(arrowL(cutX - 22, cutTop));
    p.push(txt(cutX - 30, cutLabY, "A", { size: 16, fill: ACCENT, anchor: "end", weight: 700 }));
    p.push(arrowR(cutX + 22, GY + 16));
    p.push(txt(cutX + 30, GY + 22, "A", { size: 16, fill: ACCENT, weight: 700 }));
    const topD = smooth(topPts.map(([x, y]) => [X(x), CL - y * K]), true);
    p.push(txt(CX0, 492, "\u4FEF\u89C6\u56FE  TOP ELEVATION", { size: 12, fill: MUTE, ls: 2 }));
    p.push(ln(OX - 26, CL, X(LEN) + 26, CL, { stroke: PAPER, w: 1, dash: "14 4 3 4", op: 0.5 }));
    const wh = (state.wid - state.wheel) / 2;
    for (const mmx of [AF - 15 * KL, AR - 15 * KL]) {
      for (const s of [-1, 1]) {
        const ry = s > 0 ? CL + wh * K : CL - (wh + state.wall) * K;
        p.push(rect(X(mmx), ry, 30 * KL * K, state.wall * K, { fill: PAPER, fillOp: 0.1, stroke: PAPER, sw: 1.1, op: 0.6 }));
      }
    }
    p.push(`<path d="${topD}" fill="${PAPER}" fill-opacity="0.14"/>`);
    p.push(`<path d="${topD}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
    p.push(ln(OX - 26, CL - state.wid / 2 * K, X(LEN) + 26, CL - state.wid / 2 * K, { stroke: PAPER, w: 0.8, dash: "9 4", op: 0.28 }));
    p.push(ln(OX - 26, CL + state.wid / 2 * K, X(LEN) + 26, CL + state.wid / 2 * K, { stroke: PAPER, w: 0.8, dash: "9 4", op: 0.28 }));
    p.push(dimV(CL - state.wid / 2 * K, CL + state.wid / 2 * K, 106, `W ${deg(state.wid)}`, OX));
    const CH = 806, CHX = CL + state.wid / 2 * K;
    p.push(txt(CX1, 786, "\u5C3A\u5BF8\u94FE OVERHANG CHAIN", { size: 10.5, fill: MUTE2, anchor: "end", ls: 1.4 }));
    p.push(dimH(X(0), X(AF), CH, fx(AF, 1), CHX));
    p.push(dimH(X(AF), X(AR), CH, `WB ${deg(WB)}`, CHX));
    p.push(dimH(X(AR), X(LEN), CH, fx(LEN - AR, 1), CHX));
    p.push(txt(CX0, 852, "\u65AD\u9762 A\u2014A", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(CX0 + 96, 852, `\uFF08\u8FC7 ${deg(CUT_MM)} mm \u7AD9\u4F4D\uFF09`, { size: 10.5, fill: MUTE2 }));
    p.push(txt(CX1, 852, "\u5256\u9762\u7EBF 45\xB0 \xB7 \u7F51\u683C 1.0 mm \xB7 \u53EA\u94FA\u5B9E\u4F53\u6750\u6599", { size: 10.5, fill: MUTE2, anchor: "end" }));
    const scx = 268, scy = 1020;
    const sw = state.wid * K3, sh = state.hgt * K3;
    const SL = scx - sw / 2, SR = scx + sw / 2, ST = scy - sh / 2, SB = scy + sh / 2;
    p.push(`<rect x="${(SL - 7).toFixed(1)}" y="${(ST - 7).toFixed(1)}" width="${(sw + 14).toFixed(1)}" height="${(sh + 14).toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="0.8" stroke-opacity="0.22" stroke-dasharray="4 4"/>`);
    const outerSec = `M${SL.toFixed(1)} ${(ST + 30).toFixed(1)} Q${SL.toFixed(1)} ${ST.toFixed(1)} ${(SL + 44).toFixed(1)} ${ST.toFixed(1)} L${(SR - 44).toFixed(1)} ${ST.toFixed(1)} Q${SR.toFixed(1)} ${ST.toFixed(1)} ${SR.toFixed(1)} ${(ST + 30).toFixed(1)} L${SR.toFixed(1)} ${(SB - 30).toFixed(1)} Q${SR.toFixed(1)} ${SB.toFixed(1)} ${(SR - 44).toFixed(1)} ${SB.toFixed(1)} L${(SL + 44).toFixed(1)} ${SB.toFixed(1)} Q${SL.toFixed(1)} ${SB.toFixed(1)} ${SL.toFixed(1)} ${(SB - 30).toFixed(1)} Z`;
    const br = state.bore / 2 * K3;
    const boreCY = SB - (state.hgt - 30) * K3;
    const boreD = `M${(scx + br).toFixed(1)} ${boreCY.toFixed(1)} A${br.toFixed(1)} ${br.toFixed(1)} 0 1 0 ${(scx - br).toFixed(1)} ${boreCY.toFixed(1)} A${br.toFixed(1)} ${br.toFixed(1)} 0 1 0 ${(scx + br).toFixed(1)} ${boreCY.toFixed(1)} Z`;
    p.push(`<path d="${outerSec} ${boreD}" fill="url(#hzA)" fill-rule="evenodd"/>`);
    p.push(`<path d="${outerSec} ${boreD}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
    p.push(ln(SL - 18, scy, SR + 18, scy, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.4 }));
    p.push(ln(scx, ST - 18, scx, SB + 18, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.4 }));
    p.push(dimV(ST, SB, SR + 44, `H ${deg(state.hgt)}`, SR));
    p.push(dimH(SL, SR, SB + 44, `W ${deg(state.wid)}`, SB));
    p.push(ln(scx - br - 4, boreCY, scx - br - 40, boreCY - 40, { stroke: PAPER, w: 1, op: 0.6 }));
    p.push(ln(scx - br - 40, boreCY - 40, scx - br - 84, boreCY - 40, { stroke: PAPER, w: 1, op: 0.6 }));
    p.push(txt(scx - br - 44, boreCY - 47, `\xF8${deg(state.bore)} \u6C14\u5BA4`, { size: 11, fill: MUTE, anchor: "end" }));
    p.push(txt(600, 852, "\u8BE6\u56FE D", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(672, 852, "\u8F6E\u7CFB \xB7 6:1", { size: 10.5, fill: MUTE2 }));
    const dcx = 740, dcy = 1020, dr = state.wheel / 2 * K4;
    p.push(`<circle cx="${dcx}" cy="${dcy}" r="${dr}" fill="${PAPER}" fill-opacity="0.1" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.92"/>`);
    p.push(`<circle cx="${dcx}" cy="${dcy}" r="${(dr * 0.38).toFixed(1)}" fill="none" stroke="${PAPER}" stroke-width="1.1" stroke-opacity="0.62"/>`);
    p.push(`<circle cx="${dcx}" cy="${dcy}" r="${(state.axle / 2 * K4).toFixed(1)}" fill="${INK}" stroke="${PAPER}" stroke-width="1.2" stroke-opacity="0.85"/>`);
    p.push(ln(dcx - dr - 22, dcy, dcx + dr + 22, dcy, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.4 }));
    p.push(ln(dcx, dcy - dr - 22, dcx, dcy + dr + 22, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.4 }));
    p.push(dimH(dcx - dr, dcx + dr, dcy + dr + 48, `\xF8${deg(state.wheel)}`, dcy + dr));
    const ex = 880, ew = state.wall * K4, eh = state.wheel * K4;
    p.push(rect(ex, dcy - eh / 2, ew, eh, { fill: "url(#hzB)" }));
    p.push(rect(ex, dcy - eh / 2, ew, eh, { stroke: ACCENT, sw: 1.4, op: 0.92 }));
    p.push(ln(ex - 16, dcy, ex + ew + 16, dcy, { stroke: PAPER, w: 0.9, dash: "12 3 3 3", op: 0.35 }));
    p.push(dimH(ex, ex + ew, dcy + eh / 2 + 48, `B ${deg(state.wall)}`, dcy + eh / 2));
    p.push(txt(ex + ew / 2, dcy - eh / 2 - 16, "\u8F6E\u5BBD", { size: 10.5, fill: MUTE, anchor: "middle" }));
    const cols = [
      { h: "\u53C2\u6570 PARAMETER", w: 240 },
      { h: "\u7B26\u53F7", w: 88, align: "middle" },
      { h: "\u6570\u503C", w: 176, align: "end" },
      { h: "\u5355\u4F4D", w: 88, align: "middle", op: 0.62 },
      { h: "\u6765\u6E90", w: 216, op: 0.62 },
      { h: "\u72B6\u6001", w: 88, op: 1 }
    ];
    const SX = CX0 + 240 + 88 + 176 + 88 + 216;
    const rows = [
      ["\u8F66\u957F", "L", deg(LEN), "mm", "\u6E38\u6807\u5361\u5C3A\uFF0C\u4E09\u6B21\u53D6\u4E2D\u4F4D", mk("\u6CBF\u7528")],
      ["\u8F66\u5BBD\uFF08\u542B\u8F6E\uFF09", "W", deg(state.wid), "mm", "\u6E38\u6807\u5361\u5C3A\uFF0C\u4E09\u6B21\u53D6\u4E2D\u4F4D", mk("\u6CBF\u7528")],
      ["\u8F66\u9AD8", "H", deg(state.hgt), "mm", "\u9AD8\u5EA6\u5C3A\uFF0C\u4EE5\u8F68\u9053\u9762\u4E3A\u96F6", mk("\u6CBF\u7528")],
      ["\u8F74\u8DDD", "WB", deg(WB), "mm", "\u4E24\u8F74\u5FC3\uFF0C\u8BA1\u7B97\u503C", mk("\u6CBF\u7528")],
      ["\u8F6E\u5F84", "D", deg(state.wheel), "mm", "\u6E38\u6807\u5361\u5C3A", mk("\u6CBF\u7528")],
      ["\u8F6E\u5BBD", "B", deg(state.wall), "mm", "\u6E38\u6807\u5361\u5C3A", mk("\u6CBF\u7528")],
      ["\u8D28\u5FC3\u9AD8", "h", deg(state.cg), "mm", "\u5200\u53E3\u6CD5\uFF0C\u542B\u6C14\u74F6", mk("\u5B9E\u6D4B*")],
      ["\u8FCE\u98CE\u9762\u79EF", "A", fx(state.area, 0), "mm\xB2", "\u6295\u5F71\u7167\u7247\u50CF\u7D20\u8BA1\u6570", mk("\u4F30\u7B97")],
      ["\u8FCE\u98CE\u9762\u79EF", "A", (state.area / 1e6).toFixed(2) + "e-3", "m\xB2", "\u540C\u4E0A\uFF0C\u6362\u7B97", mk("\u4F30\u7B97")],
      ["\u6574\u8F66\u8D28\u91CF", "m", deg(state.mass), "g", "\u7535\u5B50\u5929\u5E73 0.1 g", mk("\u5B9E\u6D4B*")],
      ["\u6C14\u5BA4\u5B54", "\xF8", deg(state.bore), "mm", "C \u7248\u56FE\u7EB8\u6807\u6CE8\uFF0C\u672A\u590D\u6D4B", mk("\u6CBF\u7528")]
    ];
    const cnt = {};
    for (const r of rows) cnt[r[5].s] = (cnt[r[5].s] || 0) + 1;
    const TB = { y: 1218, rowH: 26, headH: 30 };
    const tableBottom = TB.y + TB.headH + rows.length * TB.rowH;
    p.push(txt(CX0, 1204, "\u53C2\u6570\u8868  PARAMETER TABLE", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(
      CX1,
      1204,
      `\u53C2\u6570\u72B6\u6001 \xB7 \u672A\u5B9E\u6D4B \xB7 ${cnt["\u5B9E\u6D4B"] || 0} / ${rows.length} \u9879\u6709\u539F\u59CB\u8BFB\u6570`,
      { size: 12, fill: ACCENT, weight: 600, anchor: "end" }
    ));
    rows.forEach((r, i) => {
      const S = STATUS[r[5] && r[5].s];
      if (!S || !S.bg) return;
      const ry = TB.y + TB.headH + i * TB.rowH;
      p.push(rect(SX + 0.5, ry + 0.5, 87, TB.rowH - 1, { fill: S.bg, fillOp: S.op }));
    });
    p.push(table(CX0, TB.y, CW, cols, rows, TB.rowH, TB.headH));
    const legendItem = (x, st, label) => {
      const S = STATUS[st];
      if (S.bg) p.push(rect(x, 1553, 11, 11, { fill: S.bg, fillOp: S.op }));
      else p.push(rect(x + 0.5, 1553.5, 10, 10, { stroke: MUTE, sw: 1.1, op: 0.8 }));
      p.push(txt(x + 17, 1562, label, { size: 10.5, fill: MUTE }));
    };
    p.push(txt(CX0, 1562, "\u72B6\u6001", { size: 10.5, fill: MUTE2, ls: 1.6 }));
    legendItem(148, "\u5B9E\u6D4B", `\u5B9E\u6D4B ${cnt["\u5B9E\u6D4B"] || 0} \u9879 \xB7 \u6709\u539F\u59CB\u8BFB\u6570`);
    legendItem(360, "\u5B9E\u6D4B*", `\u5B9E\u6D4B* ${cnt["\u5B9E\u6D4B*"] || 0} \u9879 \xB7 \u8BFB\u6570\u672A\u5B58\u6863`);
    legendItem(576, "\u4F30\u7B97", `\u4F30\u7B97 ${cnt["\u4F30\u7B97"] || 0} \u9879 \xB7 \u7167\u76F8\u4F3C\u4EF6\u4F30`);
    legendItem(760, "\u6CBF\u7528", `\u6CBF\u7528 ${cnt["\u6CBF\u7528"] || 0} \u9879 \xB7 \u65E7\u56FE\u5E26\u6765`);
    p.push(txt(CX0, 1588, "\u8BF4\u660E  NOTES", { size: 12, fill: MUTE, ls: 2 }));
    const notes = [
      `1. \u672C\u56FE ${rows.length} \u9879\u53C2\u6570\u672A\u7ECF\u672C\u8F66\u590D\u6838\uFF1A${cnt["\u6CBF\u7528"] || 0} \u9879\u6CBF\u7528 C \u7248\u65E7\u56FE\uFF0C\u8FCE\u98CE\u9762\u79EF\u7167\u76F8\u4F3C\u4EF6\u4F30\uFF0C\u8D28\u91CF\u4E0E\u8D28\u5FC3\u867D\u4E0A\u79E4\u3001\u4E0A\u5200\u53E3\uFF0C\u539F\u59CB\u8BFB\u6570\u672A\u5B58\u6863\u3002\u72B6\u6001\u680F\u9010\u9879\u6807\u6CE8\u3002`,
      "2. \u672A\u6CE8\u5706\u89D2 R2\uFF0C\u672A\u6CE8\u5012\u89D2 0.5\xD745\xB0\uFF1B\u8F66\u4F53\u5355\u4E00\u576F\u6599\u94E3\u524A\uFF0C\u6C14\u5BA4\u5B54 \xF819.0 \u4E0E\u8F74\u7EBF\u540C\u8F74\u5EA6 \u03C60.05\u3002",
      "3. \u8FCE\u98CE\u9762\u79EF\u53D6\u6B63\u9762\u6295\u5F71\uFF0C\u4E0D\u662F\u5305\u56F4\u76D2\uFF1A\u5305\u56F4\u76D2 62.0\xD744.5 = 2759 mm\xB2\uFF0C\u4E0E 1860 \u5DEE 33%\u3002",
      "4. \u8D28\u5FC3\u6309\u5200\u53E3\u6CD5\u6D4B\u4E09\u6B21\uFF0C\u6781\u5DEE 0.3 mm\uFF0C\u539F\u59CB\u8BFB\u6570\u672A\u5B58\u6863\uFF1B\u6C14\u74F6\u672A\u88C5\u65F6 19.8 mm\u3002"
    ];
    notes.forEach((n, i) => p.push(txt(CX0, 1616 + i * 22, n, { size: 11.5, fill: MUTE })));
    const rcols = [{ h: "\u7248\u672C", w: 84, align: "middle" }, { h: "\u65E5\u671F", w: 132, align: "middle" }, { h: "\u6539\u52A8", w: 292 }];
    const rrows = [
      ["A", "2025-09-14", "\u521D\u7248"],
      ["B", "2025-10-02", "\u8F66\u9AD8\u6539 44.5\uFF0C\u5C3E\u90E8\u51CF\u8584"],
      ["C", "2025-11-08", "\u6C14\u5BA4\u5B54\u6539 \xF819.0\uFF0C\u8865\u8D28\u5FC3\u6807\u6CE8"]
    ];
    p.push(txt(CX0, 1712, "\u4FEE\u8BA2\u8BB0\u5F55  REVISIONS", { size: 10.5, fill: MUTE, ls: 1.8 }));
    p.push(table(CX0, 1724, 508, rcols, rrows, 26, 26));
    const tb = { x: 620, y: 1690, w: 368, h: 160 };
    p.push(rect(tb.x, tb.y, tb.w, tb.h, { stroke: PAPER, sw: 2, op: 0.85 }));
    p.push(ln(tb.x, tb.y + 54, tb.x + tb.w, tb.y + 54, { stroke: PAPER, w: 1.2, op: 0.6 }));
    p.push(ln(tb.x, tb.y + 106, tb.x + tb.w, tb.y + 106, { stroke: PAPER, w: 1.2, op: 0.6 }));
    p.push(ln(tb.x + 184, tb.y + 54, tb.x + 184, tb.y + tb.h, { stroke: PAPER, w: 1, op: 0.45 }));
    p.push(txt(tb.x + 14, tb.y + 22, "STEM RACING \xB7 CZ3-2025", { size: 10, fill: MUTE2, ls: 1.6 }));
    p.push(rect(tb.x + 216, tb.y + 9, 138, 19, { fill: ACCENT, fillOp: 0.9 }));
    p.push(txt(tb.x + 285, tb.y + 23, "\u53C2\u6570\u72B6\u6001 \u672A\u5B9E\u6D4B", { size: 10, fill: INK, weight: 700, anchor: "middle" }));
    p.push(txt(tb.x + 14, tb.y + 44, "\u6574\u8F66\u5916\u5F62\u4E0E\u65AD\u9762\u56FE", { size: 18, font: DISP, weight: 700, fill: PAPER }));
    p.push(txt(tb.x + 14, tb.y + 78, "\u56FE\u53F7 DWG", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(tb.x + 14, tb.y + 96, "CZ3-DWG-014", { size: 14, fill: PAPER, weight: 600, ls: 0.6 }));
    p.push(txt(tb.x + 198, tb.y + 78, "\u6BD4\u4F8B SCALE", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(tb.x + 198, tb.y + 96, "\u6309\u5E45\u9762\u7F29\u653E", { size: 14, fill: PAPER, weight: 600 }));
    p.push(txt(tb.x + 14, tb.y + 124, "\u6750\u6599 MATERIAL", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(tb.x + 14, tb.y + 144, "\u6934\u6728 / PA12 \u8F6E", { size: 13, fill: PAPER, weight: 500 }));
    p.push(txt(tb.x + 198, tb.y + 124, "\u8D28\u91CF MASS", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(tb.x + 198, tb.y + 144, `${deg(state.mass)} g`, { size: 14, fill: ACCENT, weight: 600 }));
    geo = {
      sideRight: X(LEN),
      topBottom: CL + state.wid / 2 * K,
      rows,
      cnt,
      sx: SX,
      sw: 88,
      tableBottom,
      legendBottom: 1568,
      notesBottom: 1616 + 3 * 22,
      tbBottom: tb.y + tb.h,
      cutMark: { labelY: cutLabY, inkTop: cutLabY - 13, cutX, clamped: Y(state.hgt) - 26 < SHEET.inner + 24 },
      /* 主视图取样窗口：门禁拿它证明「图形真的跟着参数变」，
         不含尺寸线（y 456 在下面）和参数表 */
      sideViewport: { x0: CX0, x1: CX1, y0: 230, y1: 442 },
      bodyBox: { x0: X(0), x1: X(LEN), y0: Y(state.hgt), y1: GY }
    };
    return frame(W, H, p.join(""), INK);
  }
  function buildCover() {
    const savedDrawn = drawn, savedItems = items;
    drawn = [];
    items = [];
    const p = [];
    const deg = (mm) => fx(mm, 1);
    const KL = kLen(), KH = kHgt();
    const LEN = state.len;
    const AF = AXLE_F * KL, AR = AXLE_R * KL;
    const sidePts = BODY_SIDE.map(([x, y]) => [x * KL, y * KH]);
    p.push("<defs>" + hatch("hzA", { step: 6, width: 1.3, color: "rgba(242,240,235,0.55)" }) + "</defs>");
    p.push(rect(SHEET.outer, SHEET.outer, W - 2 * SHEET.outer, COVER_H2 - 2 * SHEET.outer, { stroke: PAPER, sw: 2.5, op: 0.9 }));
    p.push(rect(SHEET.inner, SHEET.inner, W - 2 * SHEET.inner, COVER_H2 - 2 * SHEET.inner, { stroke: PAPER, sw: 1, op: 0.42 }));
    p.push(txt(CX0, 112, "STEM RACING \xB7 CZ3-2025", { size: 11, fill: ACCENT, weight: 700, ls: 3 }));
    p.push(txt(CX0, 170, "\u6574\u8F66\u5916\u5F62\u4E0E\u65AD\u9762\u56FE", { size: 44, font: DISP, weight: 700, fill: PAPER, ls: 1 }));
    p.push(txt(CX0, 198, "BODY ENVELOPE & SECTION  \xB7  CO\u2082 \u76F4\u7EBF\u52A0\u901F\u8F66", { size: 12, fill: MUTE, ls: 1.6 }));
    p.push(txt(CX1, 170, "CZ3-DWG-014", { size: 24, fill: PAPER, weight: 600, anchor: "end", ls: 1 }));
    p.push(txt(CX1, 198, "\u5C01\u9762\u7248 \xB7 4:5", { size: 11, fill: MUTE2, anchor: "end", ls: 1.2 }));
    p.push(ln(CX0, 218, CX1, 218, { stroke: PAPER, w: 2, op: 0.8 }));
    const exY = 234;
    p.push(rect(CX0, exY, CW, 30, { stroke: ACCENT, sw: 1.2, op: 0.9 }));
    p.push(txt(CX0 + 12, exY + 20, "\u672C\u5C01\u9762\u662F\u8282\u9009\u91CD\u6392\uFF0C\u4E0D\u662F\u5168\u56FE", { size: 12, fill: ACCENT, weight: 700 }));
    p.push(txt(CX0 + 246, exY + 20, "\u5B8C\u6574 11 \u9879\u53C2\u6570\u8868\u3001A\u2014A \u65AD\u9762\u3001\u8BE6\u56FE D \u89C1 1080\xD71920 \u7AD6\u7248", { size: 11, fill: MUTE }));
    const gY = 466;
    const KC = Math.min(720 / LEN, 138 / state.hgt);
    const cx0 = CX0 + 40;
    const cxk = (mm) => cx0 + mm * KC;
    const cyk = (mm) => gY - mm * KC;
    p.push(txt(CX0, 300, "\u4E3B\u89C6\u56FE\uFF08\u7F29\u7565\uFF09  SIDE ELEVATION", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(CX1, 300, "\u6309\u5E45\u9762\u7F29\u653E \xB7 \u5C3A\u5BF8\u4EE5\u6807\u6CE8\u4E3A\u51C6", { size: 10.5, fill: MUTE2, anchor: "end", ls: 0.8 }));
    p.push(ln(cxk(0) - 24, gY, cxk(LEN) + 24, gY, { stroke: PAPER, w: 1, dash: "14 4 3 4", op: 0.55 }));
    p.push('<path d="' + smooth(sidePts.map(([x, y]) => [cxk(x), cyk(y)]), true) + '" fill="' + PAPER + '" fill-opacity="0.13" stroke="' + PAPER + '" stroke-width="1.6" stroke-opacity="0.85"/>');
    const cwr = state.wheel / 2 * KC;
    for (const mmx of [AF, AR]) {
      const wx = cxk(mmx).toFixed(1), wy = (gY - cwr).toFixed(1);
      p.push('<circle cx="' + wx + '" cy="' + wy + '" r="' + cwr.toFixed(1) + '" fill="none" stroke="' + PAPER + '" stroke-width="1.6" stroke-opacity="0.8"/>');
      p.push('<circle cx="' + wx + '" cy="' + wy + '" r="' + (cwr * 0.34).toFixed(1) + '" fill="none" stroke="' + PAPER + '" stroke-width="1.2" stroke-opacity="0.6"/>');
    }
    p.push(dimH(cxk(0), cxk(LEN), gY + 36, "L = " + deg(LEN), gY));
    const kcols = [
      { h: "\u53C2\u6570", w: 300 },
      { h: "\u7B26\u53F7", w: 100, align: "middle" },
      { h: "\u6570\u503C", w: 210, align: "end" },
      { h: "\u5355\u4F4D", w: 110, align: "middle" },
      { h: "\u72B6\u6001", w: 176, align: "middle" }
    ];
    const krows = [
      ["\u8F66\u957F", "L", deg(LEN), "mm", mk("\u6CBF\u7528")],
      ["\u8F66\u5BBD", "W", deg(state.wid), "mm", mk("\u6CBF\u7528")],
      ["\u8F66\u9AD8", "H", deg(state.hgt), "mm", mk("\u6CBF\u7528")],
      ["\u8D28\u5FC3\u9AD8", "h", deg(state.cg), "mm", mk("\u5B9E\u6D4B*")],
      ["\u8FCE\u98CE\u9762\u79EF", "A", fx(state.area, 0), "mm\xB2", mk("\u4F30\u7B97")],
      ["\u6574\u8F66\u8D28\u91CF", "m", deg(state.mass), "g", mk("\u5B9E\u6D4B*")]
    ];
    const ktY = 540;
    p.push(txt(CX0, ktY - 12, "\u5173\u952E\u53C2\u6570  KEY PARAMETERS", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(CX1, ktY - 12, "\u5B8C\u6574 11 \u9879\u89C1\u7AD6\u7248", { size: 10.5, fill: MUTE2, anchor: "end" }));
    p.push(table(CX0, ktY, CW, kcols, krows, 30, 30));
    const ctb = { x: CX0, y: 786, w: CW, h: 170 };
    p.push(rect(ctb.x, ctb.y, ctb.w, ctb.h, { stroke: PAPER, sw: 2, op: 0.85 }));
    p.push(ln(ctb.x, ctb.y + 46, ctb.x + ctb.w, ctb.y + 46, { stroke: PAPER, w: 1.2, op: 0.6 }));
    p.push(ln(ctb.x, ctb.y + 108, ctb.x + ctb.w, ctb.y + 108, { stroke: PAPER, w: 1.2, op: 0.6 }));
    for (const dx of [300, 600]) p.push(ln(ctb.x + dx, ctb.y + 46, ctb.x + dx, ctb.y + ctb.h, { stroke: PAPER, w: 1, op: 0.45 }));
    p.push(txt(ctb.x + 14, ctb.y + 20, "STEM RACING \xB7 CZ3-2025", { size: 10, fill: MUTE2, ls: 1.6 }));
    p.push(rect(ctb.x + 700, ctb.y + 8, 178, 22, { fill: ACCENT, fillOp: 0.9 }));
    p.push(txt(ctb.x + 789, ctb.y + 23, "\u53C2\u6570\u72B6\u6001 \u672A\u5B9E\u6D4B", { size: 10, fill: INK, weight: 700, anchor: "middle" }));
    p.push(txt(ctb.x + 14, ctb.y + 40, "\u6574\u8F66\u5916\u5F62\u4E0E\u65AD\u9762\u56FE", { size: 19, font: DISP, weight: 700, fill: PAPER }));
    p.push(txt(ctb.x + 14, ctb.y + 64, "\u56FE\u53F7 DWG", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(ctb.x + 14, ctb.y + 90, "CZ3-DWG-014", { size: 15, fill: PAPER, weight: 600, ls: 0.6 }));
    p.push(txt(ctb.x + 314, ctb.y + 64, "\u6BD4\u4F8B SCALE", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(ctb.x + 314, ctb.y + 90, "\u6309\u5E45\u9762\u7F29\u653E", { size: 15, fill: PAPER, weight: 600 }));
    p.push(txt(ctb.x + 614, ctb.y + 64, "\u8D28\u91CF MASS", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(ctb.x + 614, ctb.y + 90, deg(state.mass) + " g", { size: 15, fill: ACCENT, weight: 600 }));
    p.push(txt(ctb.x + 14, ctb.y + 126, "\u6750\u6599 MATERIAL", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(ctb.x + 14, ctb.y + 150, "\u6934\u6728 / PA12 \u8F6E", { size: 13, fill: PAPER, weight: 500 }));
    p.push(txt(ctb.x + 314, ctb.y + 126, "\u6700\u65B0\u4FEE\u8BA2 REV", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(ctb.x + 314, ctb.y + 150, "C", { size: 15, fill: PAPER, weight: 600 }));
    p.push(txt(ctb.x + 614, ctb.y + 126, "\u5E45\u9762 SHEET", { size: 9.5, fill: MUTE2, ls: 1.4 }));
    p.push(txt(ctb.x + 614, ctb.y + 150, "1080\xD71350 \xB7 4:5", { size: 13, fill: PAPER, weight: 500 }));
    const rcols = [
      { h: "\u7248\u672C", w: 84, align: "middle" },
      { h: "\u65E5\u671F", w: 132, align: "middle" },
      { h: "\u6539\u52A8", w: 292 }
    ];
    const rrows = [
      ["A", "2025-09-14", "\u521D\u7248"],
      ["B", "2025-10-02", "\u8F66\u9AD8\u6539 44.5\uFF0C\u5C3E\u90E8\u51CF\u8584"],
      ["C", "2025-11-08", "\u6C14\u5BA4\u5B54\u6539 \xF819.0\uFF0C\u8865\u8D28\u5FC3\u6807\u6CE8"]
    ];
    p.push(txt(CX0, 974, "\u4FEE\u8BA2\u8BB0\u5F55  REVISIONS", { size: 10.5, fill: MUTE, ls: 1.8 }));
    p.push(table(CX0, 986, 508, rcols, rrows, 26, 26));
    p.push(txt(CX0, 1126, "\u8BF4\u660E  NOTES", { size: 10.5, fill: MUTE, ls: 1.8 }));
    p.push(txt(CX0, 1150, "1. \u672C\u5C01\u9762\u662F 4:5 \u8282\u9009\u91CD\u6392\uFF0C\u4E0D\u662F\u5168\u56FE\uFF1A\u4FDD\u7559\u4E3B\u89C6\u56FE\u7F29\u7565\u30016 \u9879\u5173\u952E\u53C2\u6570\u3001\u6807\u9898\u680F\u4E0E\u4FEE\u8BA2\u8BB0\u5F55\u3002", { size: 11, fill: MUTE }));
    p.push(txt(CX0, 1174, "2. \u53C2\u6570\u72B6\u6001\u9010\u9879\u6807\u6CE8\uFF1B\u672C\u8F66 0 / 11 \u9879\u6709\u539F\u59CB\u8BFB\u6570\uFF0C\u5B8C\u6574\u8868\u5728\u7AD6\u7248\u3002", { size: 11, fill: MUTE }));
    p.push(txt(CX0, 1230, "STEM RACING \xB7 CZ3-2025 \xB7 \u961F\u5185\u81EA\u5236", { size: 10, fill: MUTE2, ls: 1.4 }));
    geo.cover = {
      h: COVER_H2,
      tb: { x0: ctb.x, x1: ctb.x + ctb.w, y0: ctb.y, y1: ctb.y + ctb.h },
      excerpt: { y0: exY, y1: exY + 30 },
      thumb: { x0: CX0, x1: CX1, y0: 300, y1: gY },
      tableBottom: ktY + 30 + krows.length * 30,
      revBottom: 986 + 26 + rrows.length * 26,
      noteBottom: 1174
    };
    const out = frame(W, COVER_H2, p.join(""), INK);
    drawn = savedDrawn;
    items = savedItems;
    return out;
  }
  var stage = document.getElementById("stage");
  var board = createArtboard({ w: W, h: H });
  var coverBoard = createArtboard({ w: W, h: COVER_H2 });
  stage.replaceWith(board.canvas);
  board.canvas.id = "stage";
  function compose() {
    const a = board.paint(build());
    const b = coverBoard.paint(buildCover());
    return Promise.all([a, b]).then(() => void 0);
  }
  (() => {
    const g = (id) => document.getElementById(id);
    const keys = ["len", "wid", "hgt", "wheel", "cg", "area", "mass"];
    const sync = () => {
      for (const k of keys) {
        const v = Number(g(k).value);
        if (Number.isFinite(v) && v > 0) state[k] = v;
      }
      state.wall = Math.min(20, Math.max(6, state.wheel / 2));
      state.wb = wbNow();
      compose();
    };
    for (const k of keys) g(k).addEventListener("input", sync);
    g("reset").addEventListener("click", () => {
      Object.assign(state, DEFAULTS);
      for (const k of keys) g(k).value = state[k];
      compose();
    });
    g("export").addEventListener("click", () => exportEpisode(board.canvas, "spec-sheet", coverBoard.canvas));
  })();
  compose();
  window.__app = {
    canvas: board.canvas,
    coverCanvas: coverBoard.canvas,
    coverGeo: () => geo.cover,
    ready: () => Promise.all([board.ready(), coverBoard.ready()]).then(() => void 0),
    safe: { x0: 96, x1: 984, y0: 100, y1: 1820 },
    geo: () => geo,
    fonts: { MONO, DISP },
    probeGlyph: async (ch, fontCss, size = 48) => {
      const c = document.createElement("canvas");
      c.width = 76;
      c.height = 84;
      const m = frame(
        76,
        84,
        `<text x="8" y="64" font-family='${fontCss}' font-size="${size}" fill="#fff">${esc(ch)}</text>`,
        "#000"
      );
      await rasterize(c, m, 76, 84);
      const dd = c.getContext("2d").getImageData(0, 0, 76, 84).data;
      let h = 2166136261, ink = 0;
      for (let i = 0; i < dd.length; i += 4) {
        if (dd[i] > 8) ink++;
        h ^= dd[i];
        h = Math.imul(h, 16777619) >>> 0;
      }
      return { hash: h, ink };
    },
    texts: () => drawn.join("\n"),
    items: () => items.map((i) => ({ ...i })),
    getState: () => ({ ...state }),
    set: (k, v) => {
      state[k] = v;
      return compose();
    },
    compose: () => compose(),
    selfTest: () => {
      const errs = [];
      if (!(state.len > 50 && state.len < 400)) errs.push("\u8F66\u957F\u8D85\u8303\u56F4");
      if (!(state.hgt > 5 && state.hgt < state.len)) errs.push("\u8F66\u9AD8\u79BB\u8C31");
      if (!(state.wid > 5 && state.wid < state.len)) errs.push("\u8F66\u5BBD\u79BB\u8C31");
      if (!(state.cg > 0 && state.cg < state.hgt)) errs.push("\u8D28\u5FC3\u9AD8\u4E8E\u8F66\u9AD8");
      if (!(state.area > 0 && state.area < state.wid * state.hgt)) errs.push("\u8FCE\u98CE\u9762\u79EF\u5927\u4E8E\u5305\u56F4\u76D2");
      if (!(state.mass > 0)) errs.push("\u8D28\u91CF\u975E\u6B63");
      if (!drawn.length) errs.push("\u6CA1\u6709\u6587\u5B57");
      const bare = geo.rows.filter((r) => !r[5] || !STATUS[r[5].s]).map((r) => r[0]);
      if (bare.length) errs.push(`\u53C2\u6570\u8868 ${bare.length} \u884C\u6CA1\u6807\u53EF\u4FE1\u5EA6\uFF1A${bare.join("/")}`);
      if (geo.rows.length < 11) errs.push(`\u53C2\u6570\u8868\u53EA\u6709 ${geo.rows.length} \u884C\uFF0C\u5C11\u4E8E 11 \u9879`);
      if (!(geo.sx >= CX0 && geo.sx + geo.sw <= CX0 + CW)) errs.push("\u72B6\u6001\u5217\u51FA\u4E86\u8868\u6846");
      if (!(geo.tableBottom < 1568)) errs.push(`\u53C2\u6570\u8868\u538B\u5230\u56FE\u4F8B ${geo.tableBottom.toFixed(0)}`);
      if (!(geo.legendBottom < 1616)) errs.push("\u56FE\u4F8B\u538B\u5230\u8BF4\u660E");
      if (geo.tbBottom > 1850) errs.push("\u6807\u9898\u680F\u51FA\u5185\u6846");
      if (geo.sideRight > CX1) errs.push("\u4E3B\u89C6\u56FE\u51FA\u53F3\u8FB9\u754C");
      if (!(geo.cutMark && geo.cutMark.inkTop >= SHEET.inner)) errs.push(`A\u2014A \u5256\u5207\u6807\u8BB0\u51FA\u5185\u6846\uFF08\u9876\u90E8 ${geo.cutMark && geo.cutMark.inkTop}\uFF09`);
      if (geo.topBottom > 806) errs.push(`\u4FEF\u89C6\u56FE\u538B\u5230\u5C3A\u5BF8\u7EBF ${geo.topBottom.toFixed(0)}`);
      if (geo.notesBottom > 1700) errs.push("\u8BF4\u660E\u538B\u5230\u4FEE\u8BA2\u8BB0\u5F55");
      if (geo.tbBottom > 1850) errs.push("\u6807\u9898\u680F\u51FA\u5185\u6846");
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
    downloadAll: () => exportEpisode(board.canvas, "spec-sheet", coverBoard.canvas)
  };
})();
