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
  var ACCENT_DIM = "#A63D08";
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
  var X0 = 72;
  var X1 = 1008;
  var CW = X1 - X0;
  var SEASON = {
    team: "\u957F\u98CE CZ-3",
    label: "2025 \u8D5B\u5B63",
    track: 20,
    events: [
      { d: "2025-03-15", name: "\u6821\u5185\u8BD5\u8DD1", t: 1.284, rank: 14, field: 24, mass: 58.4, cg: 24.8, align: 0.4 },
      { d: "2025-04-12", name: "\u533A\u9884\u9009", t: 1.271, rank: 11, field: 24, mass: 58.2, cg: 24.6, align: 0.38 },
      { d: "2025-05-10", name: "\u533A\u51B3\u8D5B", t: 1.243, rank: 8, field: 24, mass: 57.9, cg: 24.1, align: 0.33 },
      { d: "2025-06-14", name: "\u5E02\u9884\u9009", t: 1.228, rank: 6, field: 32, mass: 57.6, cg: 23.8, align: 0.31 },
      { d: "2025-06-28", name: "\u5E02\u51B3\u8D5B", t: 1.196, rank: 4, field: 32, mass: 57.1, cg: 23.2, align: 0.26 },
      { d: "2025-09-20", name: "\u7701\u9884\u9009", t: 1.152, rank: 3, field: 40, mass: 56.4, cg: 22.6, align: 0.22 },
      { d: "2025-10-18", name: "\u7701\u51B3\u8D5B", t: 1.121, rank: 2, field: 40, mass: 55.2, cg: 21.9, align: 0.15 },
      { d: "2025-11-08", name: "\u5168\u56FD\u603B\u51B3\u8D5B", t: 1.096, rank: 1, field: 48, mass: 54.1, cg: 21.4, align: 0.1 }
    ]
  };
  var E = SEASON.events;
  var N = E.length;
  var times = E.map((e) => e.t);
  var best = Math.min(...times);
  var worst = Math.max(...times);
  var first = times[0];
  var last = times[N - 1];
  var delta = last - first;
  var pct = delta / first * 100;
  var fit = (() => {
    const mi = (N - 1) / 2;
    const mt = times.reduce((a, b2) => a + b2, 0) / N;
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) {
      num += (i - mi) * (times[i] - mt);
      den += (i - mi) ** 2;
    }
    const b = num / den;
    return { b, a: mt - b * mi };
  })();
  var speed = (t) => SEASON.track / t;
  var sgn = (v) => v > 0 ? "+" : "\u2212";
  var PLOT = { x0: 176, x1: 968, y0: 530, y1: 1064 };
  var LO = 1.07;
  var HI = 1.306;
  var px = (i) => PLOT.x0 + i * (PLOT.x1 - PLOT.x0) / (N - 1);
  var py = (t) => PLOT.y1 - (t - LO) / (HI - LO) * (PLOT.y1 - PLOT.y0);
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
  var arrowR = (xa, xb, y, color = MUTE, w = 1.4) => ln(xa, y, xb - 9, y, { stroke: color, w, op: 0.9 }) + `<polygon points="${xb},${y} ${xb - 12},${y - 5} ${xb - 12},${y + 5}" fill="${color}" fill-opacity=".9"/>`;
  var legend = (x, y, kind, label, color = MUTE) => {
    const sw = 26;
    const mk = kind === "solid" ? `<line x1="${x}" y1="${y}" x2="${x + sw}" y2="${y}" stroke="${color}" stroke-width="2.6"/>` : `<line x1="${x}" y1="${y}" x2="${x + sw}" y2="${y}" stroke="${color}" stroke-width="1.8" stroke-dasharray="${kind === "accent" ? "10 5" : "14 6"}"/>`;
    return mk + txt(x + sw + 10, y + 4, label, { size: 11, fill: color === MUTE ? MUTE2 : color, ls: 0.4 });
  };
  function build(opt2 = {}) {
    drawn = [];
    items = [];
    const { fitLine = true, values = true } = opt2;
    const p = [];
    p.push(`<defs>${hatch("hzArea", { step: 7, width: 1.2, color: "rgba(242,240,235,0.20)" })}</defs>`);
    p.push(txt(X0, 96, `${SEASON.label}  \xB7  ${SEASON.team}`, { size: 12, fill: ACCENT, weight: 700, ls: 3 }));
    p.push(txt(X0, 174, "\u8D5B\u5B63\u6210\u7EE9\u5355", { size: 68, font: DISP, weight: 700, fill: PAPER, ls: 2 }));
    p.push(txt(X1, 128, E[0].d, { size: 13, fill: MUTE, anchor: "end", ls: 1 }));
    p.push(txt(X1, 150, `\u81F3 ${E[N - 1].d}`, { size: 13, fill: MUTE, anchor: "end", ls: 1 }));
    p.push(txt(X1, 184, `${N} \u7AD9 \xB7 ${N * 2} \u8F6E`, { size: 12, fill: MUTE2, anchor: "end", ls: 1.4 }));
    p.push(ln(X0, 200, X1, 200, { stroke: PAPER, w: 2.4, op: 0.85 }));
    p.push(txt(X0, 240, "\u6700\u597D\u4E00\u8F6E \xB7 \u9996\u7AD9\u4E0E\u672B\u7AD9", { size: 11, fill: MUTE2, ls: 2 }));
    p.push(txt(X0, 330, fx(first, 3), { size: 58, fill: PAPER, weight: 700, ls: -1, op: 0.62 }));
    p.push(arrowR(276, 348, 310, ACCENT, 2));
    p.push(txt(364, 330, fx(last, 3), { size: 58, fill: ACCENT, weight: 700, ls: -1 }));
    p.push(txt(X0 + 6, 362, `${E[0].name} \xB7 \u7B2C ${E[0].rank} \u540D`, { size: 12, fill: MUTE2 }));
    p.push(txt(370, 362, `${E[N - 1].name} \xB7 \u7B2C ${E[N - 1].rank} \u540D`, { size: 12, fill: ACCENT, op: 0.85 }));
    p.push(ln(672, 252, 672, 452, { stroke: PAPER, w: 1, op: 0.22 }));
    p.push(txt(704, 274, "\u6574\u4E2A\u8D5B\u5B63", { size: 11, fill: MUTE2, ls: 2 }));
    p.push(txt(704, 330, `${sgn(delta)}${fx(Math.abs(delta), 3)}`, { size: 46, fill: ACCENT, weight: 700, ls: -1 }));
    p.push(txt(704, 352, "\u79D2", { size: 13, fill: MUTE }));
    p.push(txt(704, 400, `${sgn(pct)}${fx(Math.abs(pct), 1)}`, { size: 38, fill: PAPER, weight: 600, ls: -1 }));
    p.push(txt(704, 422, "%  \u7528\u65F6\u964D\u5E45", { size: 12, fill: MUTE }));
    p.push(txt(X0, 402, `20 m \u5E73\u5747 ${fx(speed(first), 2)} m/s \u2192 ${fx(speed(last), 2)} m/s`, { size: 12, fill: MUTE }));
    p.push(txt(X0, 426, "\u5E73\u5747\u901F\u5EA6 = 20 m \xF7 \u7528\u65F6\uFF0C\u628A\u52A0\u901F\u6BB5\u548C\u672B\u6BB5\u4E00\u8D77\u62B9\u5E73\u4E86\u3002", { size: 11, fill: MUTE2 }));
    p.push(ln(X0, 452, X1, 452, { stroke: PAPER, w: 1, op: 0.22 }));
    p.push(txt(X0, 470, "\u9010\u7AD9\u6700\u597D\u6210\u7EE9  BEST RUN PER EVENT", { size: 12, fill: MUTE, ls: 2 }));
    p.push(txt(X1, 470, `\u51FA\u53E3\u901F\u5EA6 ${fx(speed(first), 2)} \u2192 ${fx(speed(last), 2)} m/s`, { size: 11, fill: MUTE2, anchor: "end", ls: 0.6 }));
    for (const tv of [1.1, 1.15, 1.2, 1.25, 1.3]) {
      const y = py(tv);
      p.push(ln(PLOT.x0 - 14, y, PLOT.x1, y, { stroke: PAPER, w: 0.9, dash: "6 6", op: 0.16 }));
      p.push(txt(PLOT.x0 - 26, y + 4, fx(tv, 2), { size: 11, fill: MUTE2, anchor: "end" }));
    }
    p.push(txt(PLOT.x0 - 26, PLOT.y0 - 14, "\u79D2", { size: 10, fill: MUTE2, anchor: "end" }));
    p.push(legend(PLOT.x0, 508, "solid", "\u9010\u7AD9\u6700\u597D\u4E00\u8F6E"));
    p.push(legend(PLOT.x0 + 124, 508, "dash", "\u7EBF\u6027\u62DF\u5408"));
    p.push(legend(PLOT.x0 + 256, 508, "accent", "\u8D5B\u5B63\u6700\u597D\u6210\u7EE9", ACCENT));
    const areaD = `M${px(0).toFixed(1)} ${PLOT.y1}` + E.map((e, i) => ` L${px(i).toFixed(1)} ${py(e.t).toFixed(1)}`).join("") + ` L${px(N - 1).toFixed(1)} ${PLOT.y1} Z`;
    p.push(`<path d="${areaD}" fill="${PAPER}" fill-opacity="0.075"/>`);
    p.push(`<path d="${areaD}" fill="url(#hzArea)"/>`);
    p.push(ln(PLOT.x0 - 14, PLOT.y1, PLOT.x1, PLOT.y1, { stroke: PAPER, w: 1.4, op: 0.5 }));
    const by = py(best);
    p.push(ln(PLOT.x0 - 14, by, PLOT.x1, by, { stroke: ACCENT, w: 1.2, dash: "10 5", op: 0.7 }));
    p.push(txt(PLOT.x0 - 26, by + 4, fx(best, 3), { size: 11, fill: ACCENT, anchor: "end", weight: 600 }));
    E.forEach((e, i) => p.push(ln(px(i), py(e.t), px(i), PLOT.y1, { stroke: PAPER, w: 1, op: 0.14 })));
    if (fitLine) {
      p.push(ln(px(0), py(fit.a), px(N - 1), py(fit.a + fit.b * (N - 1)), { stroke: ACCENT_DIM, w: 1.8, dash: "14 6", op: 0.85 }));
      p.push(txt(X1, 508, `\u62DF\u5408 ${sgn(fit.b)}${fx(Math.abs(fit.b), 4)} s/\u7AD9`, { size: 11, fill: ACCENT_DIM, anchor: "end", ls: 0.4 }));
    }
    p.push(`<polyline points="${E.map((e, i) => `${px(i).toFixed(1)},${py(e.t).toFixed(1)}`).join(" ")}" fill="none" stroke="${PAPER}" stroke-width="2.6" stroke-linejoin="miter" stroke-linecap="butt"/>`);
    E.forEach((e, i) => {
      const cx = px(i), cy = py(e.t);
      const isBest = e.t === best;
      p.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isBest ? 7 : 4.4}" fill="${isBest ? ACCENT : INK}" stroke="${isBest ? ACCENT : PAPER}" stroke-width="${isBest ? 2 : 1.8}"/>`);
      if (values) {
        p.push(txt(cx, cy - (isBest ? 18 : 14), fx(e.t, 3), {
          size: isBest ? 14 : 12.5,
          fill: isBest ? ACCENT : PAPER,
          anchor: "middle",
          weight: isBest ? 700 : 500,
          op: isBest ? 1 : 0.9
        }));
      }
    });
    E.forEach((e, i) => {
      const cx = px(i);
      p.push(ln(cx, PLOT.y1 + 6, cx, PLOT.y1 + 12, { stroke: PAPER, w: 1, op: 0.32 }));
      p.push(txt(cx, PLOT.y1 + 32, `${e.d.slice(5, 7)}\u6708`, { size: 11, fill: MUTE2, anchor: "middle" }));
      p.push(txt(cx, PLOT.y1 + 52, e.name, { size: 12.5, fill: PAPER, anchor: "middle", op: 0.86 }));
      p.push(txt(cx, PLOT.y1 + 72, `${e.rank}/${e.field}`, {
        size: 11,
        fill: i === N - 1 ? ACCENT : MUTE2,
        anchor: "middle",
        weight: i === N - 1 ? 600 : 400
      }));
    });
    p.push(txt(X1, PLOT.y1 + 86, "\u540D\u6B21/\u53C2\u8D5B\u961F\u6570", { size: 9.5, fill: MUTE2, anchor: "end", ls: 0.6 }));
    p.push(ln(X0, PLOT.y1 + 94, X1, PLOT.y1 + 94, { stroke: PAPER, w: 1, op: 0.22 }));
    const spark = (vals, x0, y0, w, h) => {
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const sx = (i) => x0 + i * (w - 10) / (N - 1);
      const sy = (v) => y0 + h - (hi === lo ? h / 2 : (v - lo) / (hi - lo) * h);
      const o = [];
      o.push(ln(x0, y0 + h, x0 + w, y0 + h, { stroke: PAPER, w: 1, op: 0.18 }));
      vals.forEach((v, i) => o.push(ln(sx(i), sy(v), sx(i), y0 + h, { stroke: PAPER, w: 1, op: 0.1 })));
      o.push(`<polyline points="${vals.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${PAPER}" stroke-width="2" stroke-opacity=".85"/>`);
      vals.forEach((v, i) => o.push(`<circle cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.6" fill="${i === N - 1 ? ACCENT : MUTE}"/>`));
      return o.join("");
    };
    const groups = [
      { k: "mass", label: "\u6574\u8F66\u8D28\u91CF", unit: "g" },
      { k: "cg", label: "\u8D28\u5FC3\u9AD8", unit: "mm" },
      { k: "align", label: "\u524D\u540E\u8F6E\u5BF9\u9F50\u504F\u5DEE", unit: "\xB0" }
    ];
    const colW = (CW - 2 * 32) / 3;
    p.push(txt(X0, 1186, "\u540C\u65F6\u6539\u7684\u4E09\u4EF6\u4E8B", { size: 11, fill: MUTE2, ls: 2 }));
    groups.forEach((g, gi) => {
      const cx0 = X0 + gi * (colW + 32);
      const vals = E.map((e) => e[g.k]);
      const dp = g.k === "align" ? 2 : 1;
      p.push(txt(cx0, 1222, `${g.label} / ${g.unit}`, { size: 11, fill: MUTE, ls: 0.6 }));
      p.push(txt(cx0, 1264, fx(vals[0], dp), { size: 21, fill: MUTE2, weight: 500 }));
      p.push(arrowR(cx0 + 64, cx0 + 102, 1257, MUTE2, 1.2));
      p.push(txt(cx0 + 114, 1264, fx(vals[N - 1], dp), { size: 29, fill: PAPER, weight: 700, ls: -0.5 }));
      p.push(spark(vals, cx0, 1290, colW - 8, 70));
      const dv = vals[N - 1] - vals[0];
      p.push(txt(cx0, 1386, `${sgn(dv)}${fx(Math.abs(dv), dp)} ${g.unit}`, { size: 12, fill: ACCENT, weight: 500 }));
      if (gi < 2) p.push(ln(cx0 + colW + 8, 1206, cx0 + colW + 8, 1394, { stroke: PAPER, w: 1, op: 0.14 }));
    });
    p.push(ln(X0, 1418, X1, 1418, { stroke: PAPER, w: 1, op: 0.22 }));
    p.push(txt(X0, 1452, "\u53E3\u5F84", { size: 11, fill: MUTE2, ls: 2 }));
    const notes = [
      `\u6BCF\u7AD9\u8DD1 2 \u8F6E\u53D6\u6700\u597D\u4E00\u8F6E\uFF1B\u9996\u7AD9 ${E[0].d}\uFF0C\u672B\u7AD9 ${E[N - 1].d}\uFF0C\u5171 ${N} \u7AD9\u3002`,
      "\u7528\u65F6\u964D\u5E45\u6309 (\u672B\u7AD9 \u2212 \u9996\u7AD9) \xF7 \u9996\u7AD9 \u7B97\uFF0C\u4E0D\u662F\u5E73\u5747\u503C\u7684\u5DEE\u3002",
      `\u62DF\u5408\u7EBF\u662F\u8FC7\u8FD9 ${N} \u4E2A\u6210\u7EE9\u7684\u6700\u5C0F\u4E8C\u4E58\u76F4\u7EBF\uFF0C\u53EA\u770B\u8D8B\u52BF\uFF0C\u4E0D\u9884\u6D4B\u540E\u9762\u80FD\u8DD1\u591A\u5C11\u3002`,
      `\u51FA\u53E3\u901F\u5EA6\u6309 ${fx(SEASON.track, 1)} m \u8F68\u9053 \xF7 \u7528\u65F6 \u7C97\u7B97\uFF0C\u5FFD\u7565\u4E86\u52A0\u901F\u8FC7\u7A0B\uFF0C\u6BD4\u771F\u5B9E\u51FA\u95F8\u901F\u5EA6\u504F\u9AD8\u3002`
    ];
    notes.forEach((n, i) => p.push(txt(X0, 1484 + i * 26, n, { size: 12, fill: MUTE })));
    p.push(ln(X0, 1600, X1, 1600, { stroke: PAPER, w: 2, op: 0.5 }));
    p.push(txt(X0, 1642, `\u6700\u5FEB ${fx(best, 3)} s`, { size: 15, fill: PAPER, weight: 600 }));
    p.push(txt(X0 + 214, 1642, `\u6700\u6162 ${fx(worst, 3)} s`, { size: 15, fill: MUTE }));
    p.push(txt(X0 + 434, 1642, `\u6781\u5DEE ${fx(worst - best, 3)} s`, { size: 15, fill: MUTE }));
    p.push(txt(X1, 1642, "STEM RACING \xB7 CZ3-2025", { size: 12, fill: MUTE2, anchor: "end", ls: 1.6 }));
    p.push(ln(X0, 1690, X1, 1690, { stroke: PAPER, w: 1, op: 0.16 }));
    p.push(txt(X0, 1718, "\u9010\u7AD9", { size: 10, fill: MUTE2, ls: 1.6 }));
    E.forEach((e, i) => {
      const cx = X0 + 96 + i * (CW - 96) / N;
      p.push(txt(cx, 1718, fx(e.t, 3), {
        size: 12,
        fill: i === N - 1 ? ACCENT : MUTE,
        weight: i === N - 1 ? 600 : 400,
        ls: 0.4
      }));
    });
    p.push(rect(X0, 1752, CW, 3, { fill: PAPER, fillOp: 0.1 }));
    p.push(txt(X0, 1796, "\u6570\u636E\u6765\u6E90\uFF1A\u672C\u961F\u8BA1\u65F6\u5668\u4E0E\u8D5B\u4F1A\u516C\u5E03\u6210\u7EE9\uFF0C\u4E24\u6761\u5BF9\u4E0D\u4E0A\u7684\u4EE5\u8D5B\u4F1A\u4E3A\u51C6\u3002", { size: 11, fill: MUTE2 }));
    return frame(W, H, p.join(""), INK);
  }
  var stage = document.getElementById("stage");
  var board = createArtboard({ w: W, h: H });
  stage.replaceWith(board.canvas);
  board.canvas.id = "stage";
  var opt = { fitLine: true, values: true };
  var compose = () => board.paint(build(opt));
  (() => {
    const g = (id) => document.getElementById(id);
    g("fit").addEventListener("change", (e) => {
      opt.fitLine = e.target.checked;
      compose();
    });
    g("vals").addEventListener("change", (e) => {
      opt.values = e.target.checked;
      compose();
    });
    g("export").addEventListener("click", () => exportEpisode(board.canvas, "season-poster"));
  })();
  compose();
  window.__app = {
    canvas: board.canvas,
    ready: () => board.ready(),
    safe: { x0: 82, x1: 998, y0: 300, y1: 1660 },
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
    getState: () => ({ opt: { ...opt }, n: N, best, worst, delta, pct, slope: fit.b }),
    set: (k, v) => {
      opt[k] = v;
      return compose();
    },
    compose: () => compose(),
    selfTest: () => {
      const errs = [];
      if (N < 2) errs.push("\u8D5B\u5B63\u81F3\u5C11\u8981\u6709 2 \u7AD9");
      if (!times.every((t) => t > 0)) errs.push("\u6709\u975E\u6B63\u7528\u65F6");
      if (!E.every((e) => e.rank >= 1 && e.rank <= e.field)) errs.push("\u540D\u6B21\u8D85\u51FA\u53C2\u8D5B\u961F\u6570");
      if (best !== Math.min(...times)) errs.push("\u6700\u597D\u6210\u7EE9\u7B97\u9519");
      if (delta !== last - first) errs.push("\u5DEE\u503C\u7B97\u9519");
      if (Math.abs(pct - delta / first * 100) > 1e-9) errs.push("\u767E\u5206\u6BD4\u7B97\u9519");
      if (!(fit.b < 0)) errs.push("\u62DF\u5408\u659C\u7387\u4E3A\u6B63\uFF1A\u8D5B\u5B63\u6CA1\u53D8\u5FEB\uFF0C\u6D77\u62A5\u7ED3\u8BBA\u4F1A\u81EA\u76F8\u77DB\u76FE");
      if (py(best) < PLOT.y0 - 1 || py(worst) > PLOT.y1 + 1) errs.push("\u66F2\u7EBF\u8DD1\u51FA\u7EB5\u8F74\u8303\u56F4");
      const xs = E.map((_, i) => px(i));
      if (xs.some((v, i) => i && v - xs[i - 1] < 90)) errs.push("\u7AD9\u70B9\u95F4\u8DDD\u8FC7\u7A84\uFF0C\u7AD9\u540D\u4F1A\u6324\u5728\u4E00\u8D77");
      if (xs[0] < X0 || xs[N - 1] > X1 - 30) errs.push("\u66F2\u7EBF\u8D85\u51FA\u5B89\u5168\u533A");
      const steps = { mass: 0.1, cg: 0.1, align: 0.01 };
      for (const [k, q] of Object.entries(steps)) {
        if (!E.every((e) => typeof e[k] === "number")) errs.push(`\u7F3A\u5C11\u5B57\u6BB5 ${k}`);
        else if (E.some((e) => Math.abs(e[k] / q - Math.round(e[k] / q)) > 1e-6)) errs.push(`${k} \u5C0F\u6570\u4F4D\u8D85\u8FC7\u663E\u793A\u7CBE\u5EA6`);
      }
      if (!drawn.length) errs.push("\u6CA1\u6709\u6587\u5B57");
      return { ok: errs.length === 0, errs, meta: { N, best, worst, delta, pct, slope: fit.b } };
    },
    exportPNG: async () => {
      await compose();
      const b = await toPNG(board.canvas, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      await compose();
      const b = await toPNG(board.canvas, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(board.canvas, "season-poster")
  };
})();
