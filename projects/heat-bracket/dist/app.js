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
  async function exportEpisode(canvas, slug) {
    const vertical = await toPNG(canvas, { width: REEL_W, height: REEL_H });
    await assertPNG(vertical);
    download(vertical, `${slug}-1080x1920.png`);
    const cover = await toPNG(canvas, { width: COVER_W, height: COVER_H });
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
  var DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Microsoft YaHei","Noto Sans SC",sans-serif';
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fx(n, d = 3) {
    return Number(n).toFixed(d);
  }
  function frame(w, h, body, bg = INK) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/>` + body + "</svg>";
  }
  async function rasterize(canvas, markup, w, h) {
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
    const img = new Image();
    await new Promise((resolve2, reject) => {
      img.onload = () => resolve2();
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
  var X0 = 56;
  var X1 = 1024;
  var CW = X1 - X0;
  var BRACKET = {
    label: "2025 \u79CB\u5B63\u6DD8\u6C70\u8D5B",
    track: 20,
    roundNames: ["1/8 \u51B3\u8D5B", "1/4 \u51B3\u8D5B", "\u534A\u51B3\u8D5B", "\u51B3\u8D5B"],
    teams: [
      { no: "01", name: "\u957F\u98CE CZ-3", t: [1.142, 1.128, 1.115, 1.096] },
      { no: "02", name: "\u96F7\u9E1F 07", t: [1.171, null, null, null] },
      { no: "03", name: "\u98CE\u5207\u53D8", t: [1.18, null, null, null] },
      { no: "04", name: "\u4E9A\u97F3\u901F", t: [1.166, 1.152, null, null] },
      { no: "05", name: "\u767D\u9CCD 02", t: [1.193, null, null, null] },
      { no: "06", name: "\u7834\u98CE", t: [1.158, 1.139, 1.126, null] },
      { no: "07", name: "\u4E34\u754C\u89D2", t: [1.204, null, null, null] },
      { no: "08", name: "\u6E4D\u6D41 11", t: [1.187, 1.163, null, null] },
      { no: "09", name: "\u77ED\u5C3E\u96BC", t: [1.211, null, null, null] },
      { no: "10", name: "\u4F4E\u963B 05", t: [1.149, 1.131, 1.121, 1.109] },
      { no: "11", name: "\u7B49\u538B\u7EBF", t: [1.222, null, null, null] },
      { no: "12", name: "\u83F1\u5F62\u7FFC", t: [1.168, 1.146, null, null] },
      { no: "13", name: "\u8D85\u7A7A\u6CE1", t: [1.238, null, null, null] },
      { no: "14", name: "\u8FB9\u754C\u5C42", t: [1.175, 1.157, null, null] },
      { no: "15", name: "\u5C3E\u8FF9 09", t: [1.246, null, null, null] },
      { no: "16", name: "\u6DA1\u5347\u529B", t: [1.161, 1.14, 1.133, null] }
    ]
  };
  var ZT = 260;
  var ZH = 1080;
  var ZB = ZT + ZH;
  var SAFE = { x0: 68, x1: 1012, y0: 272, y1: 1780 };
  var state = { size: 16, mode: "time" };
  var geo = { boxH: 0, slotH: 0, colW: 0, gap: 0, cols: 0, lastBoxBottom: 0, champTop: 0 };
  function resolve() {
    const n = Math.round(Math.log2(state.size));
    const teams = BRACKET.teams.slice(0, state.size);
    const rounds = [];
    let field = teams;
    for (let r = 0; r < n; r++) {
      const ms = [];
      for (let i = 0; i < field.length; i += 2) {
        const a = field[i], b = field[i + 1];
        if (!a || !b) return { rounds, err: `\u7B2C ${r + 1} \u8F6E\u914D\u5BF9\u4E0D\u9F50` };
        const ta = a.t[r], tb = b.t[r];
        if (ta == null || tb == null) {
          return { rounds, err: `${ta == null ? a.name : b.name} \u7F3A\u7B2C ${r + 1} \u8F6E\u6210\u7EE9` };
        }
        if (ta === tb) return { rounds, err: `${a.name} \u4E0E ${b.name} \u7B2C ${r + 1} \u8F6E\u540C\u5206\uFF0C\u5224\u4E0D\u4E86\u664B\u7EA7` };
        const win = ta < tb ? a : b, lose = ta < tb ? b : a;
        ms.push({ a, b, win, lose, tw: ta < tb ? ta : tb, tl: ta < tb ? tb : ta, gap: Math.abs(tb - ta) });
      }
      rounds.push(ms);
      field = ms.map((m) => m.win);
    }
    return { rounds, champion: field[0] };
  }
  var SOLVE = resolve();
  var cols = () => Math.round(Math.log2(state.size));
  var roundName = (r) => BRACKET.roundNames[BRACKET.roundNames.length - cols() + r];
  function layout() {
    const n = cols();
    const gap = state.size === 4 ? 40 : state.size === 8 ? 34 : 26;
    const colW = (CW - (n - 1) * gap) / n;
    const slotH = ZH / (state.size / 2);
    const boxH = Math.min(slotH * 0.72, 250);
    geo.cols = n;
    geo.gap = gap;
    geo.colW = colW;
    geo.slotH = slotH;
    geo.boxH = boxH;
    return { n, gap, colW, slotH, boxH };
  }
  var colX = (c) => {
    const L = layout();
    return X0 + c * (L.colW + L.gap);
  };
  var yC = (r, m) => ZT + geo.slotH * Math.pow(2, r) * (m + 0.5);
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
  function elbowPath(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} H${mx.toFixed(1)} V${y2.toFixed(1)} H${x2.toFixed(1)}`;
  }
  var ELBOW_RE = /^M[-\d.]+ [-\d.]+ H[-\d.]+ V[-\d.]+ H[-\d.]+$/;
  function build(opt = {}) {
    drawn = [];
    items = [];
    const mode = opt.mode || state.mode;
    const L = layout();
    const p = [];
    const rounds = SOLVE.rounds;
    const champ = SOLVE.champion;
    const matches = rounds.reduce((s, r) => s + r.length, 0);
    const fs = Math.max(11, Math.min(L.boxH * 0.155, 22));
    const rowH = L.boxH / 2;
    p.push(txt(X0, 96, `${BRACKET.label}  \xB7  STEM RACING`, { size: 12, fill: ACCENT, weight: 700, ls: 3 }));
    p.push(txt(X0, 176, "\u6DD8\u6C70\u8D5B\u5BF9\u9635", { size: 66, font: DISP, weight: 700, fill: PAPER, ls: 2 }));
    p.push(txt(X1, 130, `${state.size} \u961F \xB7 ${L.n} \u8F6E \xB7 ${matches} \u573A`, { size: 13, fill: MUTE, anchor: "end", ls: 1 }));
    p.push(txt(X1, 158, `\u5355\u8D25\u6DD8\u6C70 \xB7 ${fx(BRACKET.track, 1)} m \u76F4\u7EBF`, { size: 12, fill: MUTE2, anchor: "end", ls: 1 }));
    p.push(txt(X1, 186, "\u6210\u7EE9\u5FEB\u8005\u664B\u7EA7", { size: 12, fill: MUTE2, anchor: "end", ls: 1.4 }));
    p.push(ln(X0, 204, X1, 204, { stroke: PAPER, w: 2.4, op: 0.85 }));
    for (let c = 0; c < L.n; c++) {
      const x = colX(c);
      p.push(txt(x, 244, roundName(c), {
        size: 12,
        fill: c === L.n - 1 ? ACCENT : MUTE,
        ls: 2,
        weight: c === L.n - 1 ? 600 : 400
      }));
      p.push(txt(x + L.colW, 244, `${rounds[c].length} \u573A`, { size: 10.5, fill: MUTE2, anchor: "end" }));
      p.push(ln(x, 252, x + L.colW, 252, { stroke: PAPER, w: 1, op: 0.22 }));
    }
    for (let c = 0; c < L.n - 1; c++) {
      rounds[c].forEach((_, m) => {
        const d = elbowPath(colX(c) + L.colW, yC(c, m), colX(c + 1), yC(c + 1, Math.floor(m / 2)));
        p.push(`<path d="${d}" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-opacity="0.26"/>`);
      });
    }
    for (let c = 0; c < L.n; c++) {
      const isFinal = c === L.n - 1;
      rounds[c].forEach((m, i) => {
        const x = colX(c), top = yC(c, i) - L.boxH / 2, w = L.colW;
        p.push(rect(x, top, w, L.boxH, { fill: PAPER, fillOp: 0.09 }));
        p.push(rect(x, top, w, L.boxH, {
          stroke: isFinal ? ACCENT : PAPER,
          sw: isFinal ? 1.8 : 1,
          op: isFinal ? 0.9 : 0.18
        }));
        [m.a, m.b].forEach((team, k) => {
          const won = team === m.win;
          const base = top + rowH * (k + 0.5) + fs * 0.36;
          if (k === 1) p.push(ln(x, top + rowH, x + w, top + rowH, { stroke: PAPER, w: 1, op: 0.12 }));
          if (won) p.push(rect(x, top + rowH * k + 1, 3, rowH - 2, { fill: ACCENT }));
          p.push(txt(x + 14, base, team.no, { size: Math.max(9, fs * 0.66), fill: MUTE2 }));
          p.push(txt(x + 14 + fs * 1.5, base, team.name, {
            size: fs,
            fill: won ? ACCENT : PAPER,
            weight: won ? 700 : 400,
            op: won ? 1 : 0.45
          }));
          if (mode === "time") {
            p.push(txt(x + w - 12, base, fx(k === 0 ? m.tw : m.tl, 3), {
              size: fs * 0.92,
              fill: won ? ACCENT : MUTE2,
              anchor: "end",
              weight: won ? 600 : 400
            }));
          } else {
            const d = won ? -m.gap : m.gap;
            p.push(txt(x + w - 12, base, `${d < 0 ? "\u2212" : "+"}${fx(Math.abs(d), 3)}`, {
              size: fs * 0.86,
              fill: won ? ACCENT : MUTE2,
              anchor: "end",
              weight: won ? 600 : 400
            }));
          }
        });
      });
    }
    geo.lastBoxBottom = yC(0, rounds[0].length - 1) + L.boxH / 2;
    const CT = 1380, CTW = 220;
    geo.champTop = CT;
    p.push(rect(X0, CT, CW, CTW, { fill: PAPER, fillOp: 0.09 }));
    p.push(rect(X0, CT, 6, CTW, { fill: ACCENT }));
    p.push(ln(X0, CT, X1, CT, { stroke: ACCENT, w: 1.6, op: 0.9 }));
    p.push(ln(X0, CT + CTW, X1, CT + CTW, { stroke: PAPER, w: 2, op: 0.6 }));
    p.push(txt(X0 + 28, CT + 38, "\u51A0\u519B  CHAMPION", { size: 11, fill: ACCENT, weight: 700, ls: 3 }));
    p.push(txt(X0 + 28, CT + 104, champ.name, { size: 46, font: DISP, weight: 700, fill: PAPER, ls: 1 }));
    p.push(txt(X0 + 28, CT + 146, `${champ.no} \u53F7 \xB7 \u51B3\u8D5B ${fx(champ.t[L.n - 1], 3)} s`, { size: 15, fill: MUTE, ls: 0.6 }));
    p.push(txt(X0 + 28, CT + 184, `\u9996\u8F6E ${fx(champ.t[0], 3)} \u2192 \u51B3\u8D5B ${fx(champ.t[L.n - 1], 3)} s  \xB7  \u4E00\u8DEF\u6253\u4E86 ${L.n} \u573A`, {
      size: 11.5,
      fill: MUTE2
    }));
    p.push(ln(X1 - 300, CT + 30, X1 - 300, CT + CTW - 24, { stroke: PAPER, w: 1, op: 0.16 }));
    p.push(txt(X1 - 28, CT + 48, "\u51A0\u519B\u961F\u6BCF\u8F6E\u6210\u7EE9", { size: 11, fill: MUTE2, anchor: "end", ls: 1.4 }));
    for (let r = 0; r < L.n; r++) {
      p.push(txt(X1 - 150, CT + 84 + r * 30, roundName(r), { size: 10.5, fill: MUTE2, anchor: "end", ls: 0.8 }));
      p.push(txt(X1 - 28, CT + 84 + r * 30, fx(champ.t[r], 3), { size: 13.5, fill: PAPER, anchor: "end", weight: 500 }));
    }
    const FT = 1660;
    p.push(txt(X0, FT, "\u600E\u4E48\u8BFB\u8FD9\u5F20\u56FE", { size: 11, fill: MUTE2, ls: 2 }));
    const notes = [
      "\u6A59\u8272\u540D\u5B57\u662F\u672C\u8F6E\u664B\u7EA7\u7684\u90A3\u4E00\u961F\uFF0C\u5DE6\u4FA7\u7AD6\u6761\u753B\u5728\u5B83\u90A3\u4E00\u884C\u4E0A\uFF1B\u7070\u5B57\u662F\u88AB\u6DD8\u6C70\u7684\u90A3\u4E00\u961F\u3002",
      "\u8FDE\u63A5\u7EBF\u53EA\u8D70\u6A2A\u2014\u7AD6\u2014\u6A2A\u4E09\u6BB5\uFF1A\u4E24\u6761\u4ECE\u4E0A\u4E00\u8F6E\u51FA\u6765\uFF0C\u5728\u4E2D\u95F4\u7684\u540C\u4E00\u4E2A\u7EB5\u5750\u6807\u6C47\u5408\uFF0C\u518D\u8FDB\u4E0B\u4E00\u8F6E\u90A3\u4E2A\u6846\u3002",
      "\u540D\u5355\u987A\u5E8F\u5C31\u662F\u79CD\u5B50\u4F4D\uFF1A\u7B2C 1 \u5BF9\u7B2C 2\u3001\u7B2C 3 \u5BF9\u7B2C 4\uFF0C\u4F9D\u6B21\u6392\u4E0B\u53BB\uFF0C\u6CA1\u6709\u62BD\u7B7E\u3002",
      "\u961F\u6570\u6539\u6210 4 \u6216 8 \u65F6\uFF0C\u53D6\u540D\u5355\u524D 4 \u6216\u524D 8 \u4E2A\uFF0C\u8F6E\u6B21\u8868\u5934\u8DDF\u7740\u6362\u6210\u534A\u51B3\u8D5B / 1/4 \u51B3\u8D5B\u3002"
    ];
    notes.forEach((n, i) => p.push(txt(X0, FT + 32 + i * 24, n, { size: 12, fill: MUTE })));
    p.push(ln(X0, 1800, X1, 1800, { stroke: PAPER, w: 1, op: 0.22 }));
    p.push(txt(X0, 1838, "STEM RACING \xB7 CZ3-2025", { size: 12, fill: MUTE2, ls: 1.8 }));
    p.push(txt(X1, 1838, "\u6210\u7EE9\u4E3A\u4EBA\u5DE5\u8BA1\u65F6\u4FDD\u7559 3 \u4F4D\u5C0F\u6570\uFF1B\u540C\u5206\u6309\u79CD\u5B50\u4F4D\u9AD8\u8005\u664B\u7EA7 \u2014\u2014 \u8FD9\u6279\u6570\u636E\u91CC\u6CA1\u6709\u540C\u5206\u3002", {
      size: 10.5,
      fill: MUTE2,
      anchor: "end"
    }));
    return frame(W, H, p.join(""), INK);
  }
  var stage = document.getElementById("stage");
  var board = createArtboard({ w: W, h: H });
  stage.replaceWith(board.canvas);
  board.canvas.id = "stage";
  var compose = () => board.paint(build(state));
  var rebuild = () => {
    SOLVE = resolve();
    return compose();
  };
  (() => {
    const g = (id) => document.getElementById(id);
    const s = g("size");
    s.value = String(state.size);
    s.addEventListener("change", () => {
      state.size = parseInt(s.value, 10);
      rebuild();
    });
    const m = g("mode");
    m.value = state.mode;
    m.addEventListener("change", () => {
      state.mode = m.value;
      compose();
    });
    g("export").addEventListener("click", () => exportEpisode(board.canvas, "heat-bracket"));
  })();
  compose();
  var metrics = () => ({
    size: state.size,
    cols: geo.cols,
    rounds: SOLVE.rounds.length,
    matches: SOLVE.rounds.reduce((s, r) => s + r.length, 0),
    champion: SOLVE.champion ? SOLVE.champion.name : null,
    championTime: SOLVE.champion ? SOLVE.champion.t[SOLVE.rounds.length - 1] : null,
    boxH: geo.boxH
  });
  window.__app = {
    canvas: board.canvas,
    ready: () => board.ready(),
    safe: SAFE,
    fonts: { MONO, DISP },
    probeGlyph: async (ch, fontCss, size = 48) => {
      const c = document.createElement("canvas");
      c.width = 76;
      c.height = 84;
      const mk = frame(
        76,
        84,
        `<text x="8" y="64" font-family='${fontCss}' font-size="${size}" fill="#fff">${esc(ch)}</text>`,
        "#000"
      );
      await rasterize(c, mk, 76, 84);
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
    getState: () => ({ size: state.size, mode: state.mode }),
    getMetrics: metrics,
    set: (k, v) => {
      state[k] = v;
      return k === "size" ? rebuild() : compose();
    },
    compose: () => compose(),
    selfTest: () => {
      const errs = [];
      const size = state.size;
      if (![4, 8, 16].includes(size)) errs.push(`\u961F\u4F0D\u6570 ${size} \u4E0D\u652F\u6301`);
      const want = Math.round(Math.log2(size));
      if (SOLVE.err) errs.push(SOLVE.err);
      if (SOLVE.rounds.length !== want) errs.push(`\u8F6E\u6570 ${SOLVE.rounds.length} \u5E94\u4E3A ${want}`);
      const total = SOLVE.rounds.reduce((s, r) => s + r.length, 0);
      if (total !== size - 1) errs.push(`\u603B\u573A\u6B21 ${total} \u5E94\u4E3A ${size - 1}`);
      if (SOLVE.rounds[want - 1].length !== 1) errs.push("\u51B3\u8D5B\u4E0D\u662F\u4E00\u573A");
      SOLVE.rounds.forEach((ms, r) => {
        const seen = /* @__PURE__ */ new Set();
        ms.forEach((m) => {
          if (!(m.tw < m.tl)) errs.push(`\u7B2C ${r + 1} \u8F6E\u80DC\u8005\u4E0D\u662F\u66F4\u5FEB\u7684\u90A3\u53F0`);
          if (seen.has(m.a.no)) errs.push(`\u7B2C ${r + 1} \u8F6E ${m.a.name} \u51FA\u73B0\u4E86\u4E24\u6B21`);
          seen.add(m.a.no);
          seen.add(m.b.no);
          if (r + 1 < want && m.win.t[r + 1] == null) errs.push(`${m.win.name} \u664B\u7EA7\u4E86\u5374\u6CA1\u6709\u7B2C ${r + 2} \u8F6E\u6210\u7EE9`);
        });
      });
      if (elbowBad() > 0) errs.push("\u8FDE\u63A5\u7EBF\u4E0D\u662F\u6A2A\u2014\u7AD6\u2014\u6A2A");
      if (geo.boxH > geo.slotH) errs.push("\u6846\u9AD8\u8D85\u8FC7\u69FD\u9AD8\uFF0C\u4E24\u573A\u4F1A\u53E0\u5728\u4E00\u8D77");
      if (geo.lastBoxBottom > ZB) errs.push("\u5BF9\u9635\u6846\u8D85\u51FA\u753B\u5E03\u533A\u57DF");
      if (geo.champTop < geo.lastBoxBottom + 10) errs.push("\u51A0\u519B\u6761\u538B\u5230\u6700\u540E\u4E00\u8F6E");
      for (let c = 0; c < geo.cols - 1; c++) {
        if (colX(c) + geo.colW > colX(c + 1)) errs.push(`\u7B2C ${c + 1} \u5217\u538B\u5230\u7B2C ${c + 2} \u5217`);
      }
      if (SAFE.y1 < geo.champTop + 220) errs.push("\u5B89\u5168\u533A\u6CA1\u6709\u76D6\u4F4F\u51A0\u519B\u6761");
      if (!drawn.length) errs.push("\u6CA1\u6709\u6587\u5B57");
      return { ok: errs.length === 0, errs, meta: metrics() };
    },
    exportPNG: async () => {
      await compose();
      const b = await toPNG(board.canvas, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      await compose();
      const b = await toPNG(board.canvas, { width: 1350, height: 1080 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(board.canvas, "heat-bracket")
  };
  function elbowBad() {
    let bad = 0;
    for (const sz of [4, 8, 16]) {
      const n = Math.round(Math.log2(sz));
      for (let c = 0; c < n - 1; c++) {
        for (let m = 0; m < sz / 2; m++) {
          if (!ELBOW_RE.test(elbowPath(100 + c * 300, 200 + m * 60, 400 + c * 300, 240 + m * 120))) bad++;
        }
      }
    }
    return bad;
  }
})();
