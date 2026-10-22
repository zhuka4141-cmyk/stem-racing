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
  var ACCENT_DIM = "#A63D08";
  var LINE = "rgba(255,255,255,0.14)";
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
  var X0 = 48;
  var X1 = 1032;
  var CW = X1 - X0;
  var TRACK = 20;
  var RANK_X = 792;
  var DEFAULTS = {
    car: "07",
    team: "\u957F\u98CE CZ-3",
    time: 1.142,
    rank: 1,
    field: 18,
    lead: 1.142,
    lane: 2,
    runs: [1.214, 1.186, 1.163, 1.142, 1.157, 1.149],
    date: "2025-11-08",
    rev: "REV 03"
  };
  var state = JSON.parse(JSON.stringify(DEFAULTS));
  var geo = {};
  var SEG_MAP = {
    "0": "abcdef",
    "1": "bc",
    "2": "abdeg",
    "3": "abcdg",
    "4": "bcfg",
    "5": "acdfg",
    "6": "acdefg",
    "7": "abc",
    "8": "abcdefg",
    "9": "abcdfg"
  };
  function segShapes(x, y, w, h, t) {
    const k = t / 2;
    const hbar = (yy) => [
      [x + t, yy],
      [x + t + k, yy - k],
      [x + w - t - k, yy - k],
      [x + w - t, yy],
      [x + w - t - k, yy + k],
      [x + t + k, yy + k]
    ].map((p) => p.join(",")).join(" ");
    const vbar = (xx, y0, y1) => [
      [xx, y0],
      [xx + k, y0 + k],
      [xx + k, y1 - k],
      [xx, y1],
      [xx - k, y1 - k],
      [xx - k, y0 + k]
    ].map((p) => p.join(",")).join(" ");
    return {
      a: hbar(y + k),
      g: hbar(y + h / 2),
      d: hbar(y + h - k),
      f: vbar(x + k, y + t, y + h / 2 - k),
      b: vbar(x + w - k, y + t, y + h / 2 - k),
      e: vbar(x + k, y + h / 2 + k, y + h - t),
      c: vbar(x + w - k, y + h / 2 + k, y + h - t)
    };
  }
  function segWidth(str, { w, gap, dotAdv }) {
    let total = 0;
    for (const ch of str) total += ch === "." ? dotAdv : w + gap;
    return total - gap;
  }
  function segMarkup(str, x0, y0, opt) {
    const { w, h, t, gap, dotAdv } = opt;
    let out = "", x = x0;
    for (const ch of str) {
      if (ch === ".") {
        out += `<rect x="${x + 3}" y="${y0 + h - t}" width="${t}" height="${t}" fill="${ACCENT}"/>`;
        x += dotAdv;
        continue;
      }
      const sh = segShapes(x, y0, w, h, t);
      const lit = SEG_MAP[ch];
      for (const k of ["a", "b", "c", "d", "e", "f", "g"]) {
        out += `<polygon points="${sh[k]}" fill="${ACCENT}" fill-opacity="0.09"/>`;
      }
      if (lit) for (const k of lit) out += `<polygon points="${sh[k]}" fill="${ACCENT}"/>`;
      x += w + gap;
    }
    return out;
  }
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
    const { stroke = LINE, w = 1, dash = null, op = 1 } = o;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}${op !== 1 ? ` stroke-opacity="${op}"` : ""}/>`;
  };
  var rect = (x, y, w, h, o = {}) => {
    const { fill = "none", stroke = "none", sw = 1, op = 1, fillOp = 1 } = o;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${op !== 1 ? ` stroke-opacity="${op}"` : ""}${fillOp !== 1 ? ` fill-opacity="${fillOp}"` : ""}/>`;
  };
  var pad = (n, len = 2) => String(n).padStart(len, "0");
  var L45 = {
    H: 1350,
    frameH: 1294,
    eyebrow: 74,
    rule: 86,
    sub: 100,
    divA: 112,
    labelB: 148,
    hashY: 262,
    hashSize: 44,
    carY: 246,
    carSize: 116,
    vline0: 124,
    vline1: 272,
    teamY: 210,
    teamSize: 54,
    teamSub: 244,
    laneY: 196,
    laneSize: 44,
    laneSub: 228,
    divB: 286,
    labelC: 322,
    segTop: 336,
    seg: { h: 290, w: 156, t: 30, gap: 14, dotAdv: 34 },
    unitSize: 30,
    rankY: 316,
    rankH: 204,
    rankSize: 96,
    rankLabY: 26,
    rankNumY: 144,
    rankOfY: 188,
    gapLab: 552,
    gapVal: 584,
    bestLab: 618,
    bestVal: 650,
    divC: 672,
    labelD: 708,
    plotTop: 726,
    axisY: 918,
    divD: 964,
    cellTop: 984,
    cellLabel: 1006,
    cellVal: 1066,
    cellSub: 1096,
    cellBot: 1118,
    cellSize: 36,
    labelF: 1148,
    notesTop: 1178,
    noteStep: 22,
    noteSize: 11.5,
    hatchY: 1284,
    footY: 1314
  };
  var L916 = {
    H: 1920,
    frameH: 1864,
    eyebrow: 132,
    rule: 144,
    sub: 166,
    divA: 186,
    labelB: 226,
    hashY: 372,
    hashSize: 54,
    carY: 358,
    carSize: 150,
    vline0: 206,
    vline1: 392,
    teamY: 330,
    teamSize: 68,
    teamSub: 376,
    laneY: 306,
    laneSize: 56,
    laneSub: 350,
    divB: 412,
    labelC: 452,
    segTop: 470,
    seg: { h: 400, w: 156, t: 32, gap: 14, dotAdv: 34 },
    unitSize: 34,
    rankY: 446,
    rankH: 300,
    rankSize: 132,
    rankLabY: 40,
    rankNumY: 210,
    rankOfY: 280,
    gapLab: 900,
    gapVal: 936,
    bestLab: 976,
    bestVal: 1012,
    divC: 1042,
    labelD: 1080,
    plotTop: 1098,
    axisY: 1490,
    divD: 1520,
    cellTop: 1532,
    cellLabel: 1556,
    cellVal: 1620,
    cellSub: 1652,
    cellBot: 1680,
    cellSize: 42,
    labelF: 1706,
    notesTop: 1736,
    noteStep: 23,
    noteSize: 12.5,
    hatchY: 1830,
    footY: 1874
  };
  function derive() {
    const runs = state.runs.slice();
    const best = Math.min(...runs);
    const worst = Math.max(...runs);
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    const sd = Math.sqrt(runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length);
    return { runs, best, worst, mean, sd, avgSpeed: TRACK / state.time, gapToLead: state.time - state.lead };
  }
  function render(L) {
    drawn = [];
    items = [];
    const d = derive();
    const p = [];
    p.push(`<defs>${hatch("hz", { step: 7, width: 1.6, color: "rgba(242,240,235,0.42)" })}</defs>`);
    p.push(rect(28, 28, 1024, L.frameH, { stroke: PAPER, sw: 2, op: 0.8 }));
    p.push(txt(X0, L.eyebrow, "PIT BOARD", { size: 18, fill: ACCENT, weight: 700, ls: 3.6 }));
    p.push(rect(X0, L.rule, 138, 3, { fill: ACCENT }));
    p.push(txt(X0, L.sub, "\u7EF4\u4FEE\u533A\u8BA1\u65F6\u724C \xB7 PIT-LANE TIMING", { size: 11.5, fill: MUTE, ls: 1.8 }));
    p.push(txt(X1, L.eyebrow, `STEM RACING \xB7 ${fx(TRACK, 3)} m`, { size: 12, fill: MUTE, anchor: "end", ls: 1.4 }));
    p.push(txt(
      X1,
      L.sub,
      `${state.date} \xB7 R${pad(state.runs.length)} \xB7 LANE ${pad(state.lane)}`,
      { size: 12, fill: MUTE2, anchor: "end", ls: 1.2 }
    ));
    p.push(ln(X0, L.divA, X1, L.divA));
    p.push(txt(X0, L.labelB, "\u8F66\u53F7 CAR NO.", { size: 11, fill: MUTE2, ls: 2.2 }));
    p.push(txt(X0 + 2, L.hashY, "#", { size: L.hashSize, fill: ACCENT_DIM, weight: 500 }));
    p.push(txt(X0 + 34, L.carY, state.car, { size: L.carSize, fill: ACCENT, weight: 700, ls: -2 }));
    p.push(ln(272, L.vline0, 272, L.vline1));
    p.push(txt(296, L.labelB, "\u8F66\u961F TEAM", { size: 11, fill: MUTE2, ls: 2.2 }));
    p.push(txt(296, L.teamY, state.team, { size: L.teamSize, font: DISP, weight: 600, fill: PAPER, ls: -0.4 }));
    p.push(txt(296, L.teamSub, "CZ3-2025-R07 \xB7 STRAIGHT LINE", { size: 12, fill: MUTE, ls: 1.4 }));
    p.push(txt(X1, L.labelB, "\u8F66\u9053 LANE", { size: 11, fill: MUTE2, anchor: "end", ls: 2.2 }));
    p.push(txt(X1, L.laneY, pad(state.lane), { size: L.laneSize, fill: PAPER, weight: 600, anchor: "end" }));
    p.push(txt(
      X1,
      L.laneSub,
      `\u7B2C ${pad(state.runs.length)} \u8F6E / \u5171 ${pad(state.runs.length)} \u8F6E`,
      { size: 12, fill: MUTE, anchor: "end" }
    ));
    p.push(ln(X0, L.divB, X1, L.divB));
    const timeStr = fx(state.time, 3);
    const SEG = L.seg;
    const segW = segWidth(timeStr, SEG);
    p.push(txt(X0, L.labelC, "\u6210\u7EE9 TOTAL TIME", { size: 11, fill: MUTE2, ls: 2.6 }));
    p.push(segMarkup(timeStr, X0, L.segTop, SEG));
    p.push(txt(X0 + segW + 14, L.segTop + SEG.h, "s", { size: L.unitSize, fill: MUTE, weight: 500 }));
    const RP = { x: RANK_X, y: L.rankY, w: X1 - RANK_X, h: L.rankH };
    p.push(`<polygon points="${RP.x},${RP.y} ${RP.x + RP.w - 26},${RP.y} ${RP.x + RP.w},${RP.y + 26} ${RP.x + RP.w},${RP.y + RP.h} ${RP.x},${RP.y + RP.h}" fill="${ACCENT}"/>`);
    p.push(txt(RP.x + 16, RP.y + L.rankLabY, "\u540D\u6B21 RANK", { size: 10.5, fill: INK, weight: 700, ls: 2, op: 0.72 }));
    p.push(txt(RP.x + 14, RP.y + L.rankNumY, pad(state.rank), { size: L.rankSize, fill: INK, weight: 700, ls: -3 }));
    p.push(txt(RP.x + RP.w - 14, RP.y + L.rankOfY, `/ ${state.field}`, { size: 22, fill: INK, anchor: "end", op: 0.72, weight: 600 }));
    p.push(txt(RANK_X, L.gapLab, "\u4E0E\u5934\u540D\u5DEE\u8DDD", { size: 10.5, fill: MUTE2, ls: 2 }));
    p.push(txt(
      RANK_X,
      L.gapVal,
      d.gapToLead > 5e-4 ? `+${fx(d.gapToLead, 3)}` : "\u2014 \u5934\u540D \u2014",
      { size: 24, fill: PAPER, weight: 600 }
    ));
    p.push(txt(RANK_X, L.bestLab, "\u4E2A\u4EBA\u6700\u597D", { size: 10.5, fill: MUTE2, ls: 2 }));
    p.push(txt(RANK_X, L.bestVal, fx(d.best, 3), { size: 24, fill: ACCENT, weight: 600 }));
    p.push(ln(X0, L.divC, X1, L.divC));
    const lo = Math.floor(d.best * 100) / 100 - 0.01;
    const hi = Math.ceil(d.worst * 100) / 100 + 0.01;
    const AXX = L.axisY, AX0 = 110, PTOP = L.plotTop;
    const yOf = (v) => AXX - (hi - v) / (hi - lo) * (AXX - PTOP);
    p.push(txt(X0, L.labelD, "\u9010\u8F6E\u6210\u7EE9 RUN HISTORY", { size: 11, fill: MUTE2, ls: 2.6 }));
    p.push(txt(X1, L.labelD, `\u7EB5\u8F74 ${fx(lo, 2)}\u2013${fx(hi, 2)} s \u622A\u65AD`, { size: 10, fill: MUTE2, anchor: "end", ls: 1 }));
    for (let g = Math.ceil(lo * 100) / 100 + 99e-4; g < hi - 5e-3; g += 0.02) {
      const y = yOf(g);
      if (y < PTOP - 1) continue;
      p.push(ln(AX0, y, X1, y, { stroke: LINE, dash: "3 5", w: 1 }));
      p.push(txt(AX0 - 12, y + 4, fx(g, 2), { size: 10, fill: MUTE2, anchor: "end" }));
    }
    p.push(ln(AX0, AXX, X1, AXX, { stroke: MUTE2, w: 1 }));
    const cell = (X1 - AX0) / d.runs.length, barW = cell * 0.6;
    const yBest = yOf(d.best);
    p.push(ln(AX0, yBest, X1, yBest, { stroke: ACCENT, w: 1.5, dash: "6 4", op: 0.85 }));
    d.runs.forEach((v, i) => {
      const cx = AX0 + cell * i + cell / 2;
      const top = yOf(v);
      const isBest = Math.abs(v - d.best) < 1e-9;
      p.push(rect(cx - barW / 2, top, barW, AXX - top, { fill: isBest ? ACCENT : PAPER, fillOp: isBest ? 1 : 0.34 }));
      p.push(txt(cx, top - 9, fx(v, 3), { size: 12, fill: isBest ? ACCENT : MUTE, anchor: "middle", weight: isBest ? 600 : 400 }));
      p.push(txt(cx, AXX + 22, `R${i + 1}`, { size: 10.5, fill: MUTE2, anchor: "middle", ls: 1 }));
    });
    p.push(ln(X0, L.divD, X1, L.divD));
    const cells = [
      ["\u5E73\u5747\u901F\u5EA6 AVERAGE", fx(d.avgSpeed, 3), `m/s \xB7 ${fx(TRACK, 3)} m \u5168\u7A0B`],
      ["\u9010\u8F6E\u6700\u597D BEST", fx(d.best, 3), `s \xB7 \u7B2C ${pad(d.runs.indexOf(d.best) + 1)} \u8F6E`],
      ["\u9010\u8F6E\u6781\u5DEE SPREAD", fx(d.worst - d.best, 3), "s \xB7 \u6700\u5927\u51CF\u6700\u5C0F"],
      ["\u6CE2\u52A8 STDEV", fx(d.sd, 3), "s \xB7 \u603B\u4F53\u6807\u51C6\u5DEE"]
    ];
    const cw = CW / 4;
    cells.forEach(([lab, val, sub], i) => {
      const x = X0 + cw * i;
      const ix = x + (i ? 20 : 0);
      if (i) p.push(ln(x, L.cellTop, x, L.cellBot, { stroke: LINE }));
      p.push(txt(ix, L.cellLabel, lab, { size: 10, fill: MUTE2, ls: 1.6 }));
      p.push(txt(ix, L.cellVal, val, { size: L.cellSize, fill: i === 1 ? ACCENT : PAPER, weight: 600, ls: -0.6 }));
      p.push(txt(ix, L.cellSub, sub, { size: 11, fill: MUTE }));
    });
    p.push(ln(X0, L.cellBot, X1, L.cellBot));
    p.push(txt(X0, L.labelF, "\u8BB0\u5F55\u53E3\u5F84 DATA NOTES", { size: 10, fill: MUTE2, ls: 2.2 }));
    const notes = [
      "\u8BA1\u65F6\u81EA\u8D77\u8DD1\u4FE1\u53F7\u81F3\u7EC8\u70B9\u5149\u95E8\uFF0C\u5355\u6B21\u5206\u8FA8\u7387 0.001 s\uFF1B\u6240\u6709\u8F6E\u6B21\u540C\u8F66\u4F53\u3001\u540C\u7EC4\u8F66\u8F6E\u3001\u540C\u914D\u91CD\u3002",
      "\u7B2C 4 \u8F6E\u4E4B\u540E\u91CD\u505A\u4E86\u4E00\u6B21\u8F74\u5BF9\u9F50\uFF0C0.072 s \u7684\u6781\u5DEE\u91CC\u7EA6 0.04 s \u6765\u81EA\u5BF9\u8F74\uFF0C\u4E0D\u662F\u914D\u91CD\u3002",
      "\u7B2C 6 \u8F6E\u51FA\u95F8\u540E\u8F66\u4F53\u64E6\u5230\u5BFC\u8F68\uFF0C\u6210\u7EE9 1.149 s \u8BB0\u5728\u518C\u4F46\u672A\u53C2\u4E0E\u5E73\u5747\u503C\u8BA1\u7B97\u3002",
      "\u672A\u505A\u4EFB\u4F55\u4E8B\u540E\u4FEE\u6B63\uFF1B\u540D\u6B21\u6309\u5F53\u8F6E\u5168\u573A\u6700\u5FEB\u6392\u5E8F\uFF0C\u540C\u79D2\u6309\u8F66\u53F7\u5148\u540E\u3002"
    ];
    notes.forEach((n, i) => p.push(txt(X0, L.notesTop + i * L.noteStep, n, { size: L.noteSize, fill: MUTE })));
    p.push(rect(X0, L.hatchY, CW, 16, { fill: "url(#hz)" }));
    p.push(rect(X0, L.hatchY, CW, 16, { stroke: LINE, sw: 1 }));
    p.push(txt(X0, L.footY, "STEM RACING \xB7 CZ3-2025", { size: 10.5, fill: MUTE2, ls: 2.2 }));
    p.push(txt(X1, L.footY, `${state.rev} \xB7 ${state.date}`, { size: 10.5, fill: MUTE2, anchor: "end", ls: 2.2 }));
    geo = { segRight: X0 + segW, rankLeft: RANK_X, notesBottom: L.notesTop + 3 * L.noteStep, hatchTop: L.hatchY, footBaseline: L.footY, frameBottom: L.H - 28 };
    return frame(W, L.H, p.join(""), INK);
  }
  var stage = document.getElementById("stage");
  var board45 = createArtboard({ w: 1080, h: 1350 });
  var board916 = createArtboard({ w: 1080, h: 1920 });
  stage.replaceWith(board45.canvas);
  board45.canvas.id = "stage";
  function compose() {
    const a = board916.paint(render(L916));
    const b = board45.paint(render(L45));
    return Promise.all([a, b]);
  }
  (() => {
    const g = (id) => document.getElementById(id);
    const sync = () => {
      state.car = g("car").value.trim() || DEFAULTS.car;
      state.team = g("team").value.trim() || DEFAULTS.team;
      state.time = Math.max(0.5, Number(g("time").value) || DEFAULTS.time);
      state.field = Math.max(2, Math.round(Number(g("field").value) || DEFAULTS.field));
      state.rank = Math.min(state.field, Math.max(1, Math.round(Number(g("rank").value) || 1)));
      state.lead = Math.max(0.5, Number(g("lead").value) || DEFAULTS.time);
      compose();
    };
    for (const id of ["car", "team", "time", "rank", "field", "lead"]) g(id).addEventListener("input", sync);
    g("reset").addEventListener("click", () => {
      Object.assign(state, JSON.parse(JSON.stringify(DEFAULTS)));
      for (const id of ["car", "team", "time", "rank", "field", "lead"]) g(id).value = state[id];
      compose();
    });
    g("export").addEventListener("click", () => exportEpisode(board916.canvas, "pit-display", board45.canvas));
  })();
  compose();
  window.__app = {
    canvas: board45.canvas,
    ready: () => Promise.all([board45.ready(), board916.ready()]),
    safe: { x0: 60, x1: 1020, y0: 60, y1: 1290 },
    reel: { canvas: board916.canvas, safe: { x0: 60, x1: 1020, y0: 60, y1: 1892 } },
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
    getMetrics: () => derive(),
    set: (k, v) => {
      state[k] = v;
      return compose();
    },
    compose: () => compose(),
    selfTest: () => {
      const errs = [];
      const d = derive();
      if (!(state.time > 0.5 && state.time < 5)) errs.push("\u6210\u7EE9\u8D85\u51FA\u5408\u7406\u533A\u95F4");
      if (!(state.rank >= 1 && state.rank <= state.field)) errs.push("\u540D\u6B21\u4E0D\u5728 1..\u53C2\u8D5B\u6570");
      if (!state.runs.length) errs.push("\u9010\u8F6E\u6570\u7EC4\u4E3A\u7A7A");
      if (!Number.isFinite(d.sd)) errs.push("\u6807\u51C6\u5DEE\u975E\u6709\u9650\u6570");
      if (!Number.isFinite(d.avgSpeed)) errs.push("\u5E73\u5747\u901F\u5EA6\u975E\u6709\u9650\u6570");
      if (!state.car.length) errs.push("\u8F66\u53F7\u4E3A\u7A7A");
      if (!drawn.length) errs.push("\u6CA1\u6709\u4EFB\u4F55\u6587\u5B57\u88AB\u7ED8\u5236");
      if (geo.segRight > geo.rankLeft - 8) errs.push(`\u65F6\u95F4\u5BBD\u5EA6 ${geo.segRight.toFixed(0)} \u4FB5\u5360\u540D\u6B21\u724C ${geo.rankLeft}`);
      if (geo.notesBottom > geo.hatchTop - 6) errs.push("\u53E3\u5F84\u6587\u5B57\u538B\u5230\u5E95\u6761");
      if (geo.footBaseline + 8 > geo.frameBottom) errs.push("\u5E95\u6761\u6587\u5B57\u51FA\u6846");
      return { ok: errs.length === 0, errs };
    },
    exportPNG: async () => {
      await compose();
      const b = await toPNG(board916.canvas, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      await compose();
      const b = await toPNG(board45.canvas, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(board916.canvas, "pit-display", board45.canvas)
  };
})();
