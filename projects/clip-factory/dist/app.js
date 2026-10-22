(() => {
  // src/reel-export.js
  function resample(src, outW, outH) {
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx2 = c.getContext("2d");
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    const sw = src.width, sh = src.height;
    const scale = Math.max(outW / sw, outH / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx2.drawImage(src, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
    return c;
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

  // src/points.js
  var RUN = {
    date: "2026-10-22",
    event: "\u5185\u90E8\u8BA1\u65F6 \xB7 \u7B2C 2 \u7EC4",
    car: "07",
    lane: 2,
    time: 1.042,
    prev: 1.062,
    prevLabel: "10-17 \u7701\u8D5B\u51B3\u8D5B",
    rival: { car: "12", lane: 4, time: 1.061 },
    splits: [0.286, 0.259, 0.251, 0.246],
    temp: 24.5,
    pressure: 6.2,
    track: "20 m \u76F4\u7EBF \xB7 \u5BA4\u5185"
  };
  var SEGMENTS = ["0\u20135 m", "5\u201310 m", "10\u201315 m", "15\u201320 m"];

  // src/main.js
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC","Microsoft YaHei",sans-serif';
  var ACCENT = "#e8590c";
  var INK = "#0b0b0c";
  var PAPER = "#f2f0eb";
  var LINE = "rgba(255,255,255,0.14)";
  var LINE_SOFT = "rgba(255,255,255,0.075)";
  var MUTE = "rgba(242,240,235,0.55)";
  var MUTE2 = "rgba(242,240,235,0.32)";
  var ZEBRA = "rgba(242,240,235,0.07)";
  var VIS_Y0 = 496;
  var VIS_Y1 = 832;
  var TB_HDR = 864;
  var TB_Y0 = 880;
  var TB_ROWS = 5;
  var TB_H = 60;
  var TB_Y1 = TB_Y0 + TB_ROWS * TB_H;
  var TALLY_Y = 1232;
  var FOOT_Y = 1394;
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var sec3 = (t) => t.toFixed(3);
  var pct1 = (v) => `${(v * 100).toFixed(1)}%`;
  var DERIVED = (() => {
    const faster = +(RUN.prev - RUN.time).toFixed(3);
    const vsRival = +(RUN.rival.time - RUN.time).toFixed(3);
    const total = +RUN.splits.reduce((a, b) => a + b, 0).toFixed(3);
    const best = RUN.splits.indexOf(Math.min(...RUN.splits));
    return { faster, vsRival, total, best };
  })();
  var BANDS = [];
  var YSHIFT = 0;
  function pushBand(kind, x0, y0, x1, y1, text = "") {
    BANDS.push({ kind, text, x0, y0: y0 + YSHIFT, x1, y1: y1 + YSHIFT });
  }
  function T(str, x, y, { f = `500 16px ${MONO}`, color = PAPER, a = "left" } = {}) {
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textAlign = a;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
    const m = ctx.measureText(str);
    const w = m.width;
    const bx0 = a === "right" ? x - w : a === "center" ? x - w / 2 : x;
    const asc = m.actualBoundingBoxAscent || 8;
    const desc = m.actualBoundingBoxDescent || 2;
    pushBand("text", bx0, y - asc, bx0 + w, y + desc, str);
  }
  function rule(y, color = LINE_SOFT) {
    ctx.fillStyle = color;
    ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);
    pushBand("rule", SAFE.x0, y, SAFE.x1, y + 1);
  }
  function vrule(x, y0, y1, color = LINE_SOFT) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y0, 1, y1 - y0);
    pushBand("rule", x, y0, x + 1, y1);
  }
  function box(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    pushBand("box", x, y, x + w, y + h);
  }
  function srcWindow(outW, outH, sw = W, sh = H) {
    const scale = Math.max(outW / sw, outH / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = (outW - dw) / 2, dy = (outH - dh) / 2;
    return {
      x0: -dx / scale,
      x1: (outW - dx) / scale,
      y0: -dy / scale,
      y1: (outH - dy) / scale
    };
  }
  var COVER = { w: 1080, h: 1350 };
  function bar(x, y, w, h, p, color) {
    box(x, y, w, h, "rgba(255,255,255,0.06)");
    box(x, y, Math.max(2, w * p), h, color);
  }
  function table(rows, y0 = TB_Y0, rowH = TB_H) {
    rows.forEach(([k, v, hot], i) => {
      const y = y0 + i * rowH;
      if (i % 2 === 1) box(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH, ZEBRA);
      rule(y, LINE_SOFT);
      T(k, SAFE.x0, y + rowH * 0.64, { f: `400 14px ${MONO}`, color: MUTE });
      T(v, SAFE.x1, y + rowH * 0.64, {
        f: `500 20px ${MONO}`,
        color: hot ? ACCENT : PAPER,
        a: "right"
      });
    });
    rule(y0 + rows.length * rowH, LINE);
  }
  var CARDS = [
    { id: "result", label: "\u6210\u7EE9", title: "\u672C\u573A\u6210\u7EE9", sub: "\u548C\u81EA\u5DF1\u4E0A\u4E00\u6B21\u6BD4" },
    { id: "rival", label: "\u5BF9\u624B", title: "\u4E24\u6761\u7EBF", sub: "\u540C\u4E00\u573A\uFF0C\u540C\u4E00\u6761\u8D5B\u9053" },
    { id: "split", label: "\u5206\u6BB5", title: "20 m \u5206\u6BB5", sub: "\u56DB\u6BB5\u5404\u81EA\u7528\u6389\u591A\u5C11\u65F6\u95F4" },
    { id: "sheet", label: "\u6C47\u603B", title: "\u672C\u573A\u5168\u91CF", sub: "\u4E00\u5C4F\u770B\u5B8C\u8FD9\u7EC4\u6570" }
  ];
  function bodyResult() {
    T("\u672C\u573A\u7528\u65F6", SAFE.x0, 546, { f: `500 13px ${MONO}`, color: MUTE2 });
    T(sec3(RUN.time).slice(0, 1), SAFE.x0, 700, { f: `600 150px ${DISP}`, color: PAPER });
    T(sec3(RUN.time).slice(1), SAFE.x0 + 78, 700, { f: `600 150px ${DISP}`, color: PAPER });
    T("s", SAFE.x1, 700, { f: `600 60px ${DISP}`, color: MUTE, a: "right" });
    T(`\u4E0A\u6B21 ${sec3(RUN.prev)} \xB7 ${RUN.prevLabel}`, SAFE.x0, 748, {
      f: `400 15px ${MONO}`,
      color: MUTE
    });
    T(`\u5FEB\u4E86 ${sec3(DERIVED.faster)} s`, SAFE.x0, 786, {
      f: `600 30px ${MONO}`,
      color: ACCENT
    });
    const rx0 = SAFE.x0, rx1 = SAFE.x1;
    const pos = (t) => rx0 + (rx1 - rx0) * Math.min(Math.max((t - 1) / 0.1, 0), 1);
    rule(VIS_Y1 - 26, "rgba(255,255,255,0.18)");
    for (let i = 0; i <= 10; i++) {
      vrule(
        rx0 + (rx1 - rx0) * i / 10,
        VIS_Y1 - 34,
        VIS_Y1 - 26,
        i % 5 === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.14)"
      );
    }
    box(pos(RUN.prev) - 1, VIS_Y1 - 56, 2, 30, "rgba(242,240,235,0.45)");
    box(pos(RUN.time) - 1.5, VIS_Y1 - 66, 3, 40, ACCENT);
    T("1.000", rx0, VIS_Y1 - 2, { f: `400 11px ${MONO}`, color: MUTE2 });
    T("1.100", rx1, VIS_Y1 - 2, { f: `400 11px ${MONO}`, color: MUTE2, a: "right" });
    table([
      ["\u8F66\u53F7 / \u8F66\u9053", `${RUN.car} \u53F7 \xB7 ${RUN.lane} \u9053`],
      ["\u65E5\u671F", RUN.date],
      ["\u573A\u6B21", RUN.event],
      ["\u8D5B\u9053\u6E29\u5EA6", `${RUN.temp} \u2103`],
      ["\u6C14\u74F6\u538B\u529B", `${RUN.pressure} g`]
    ]);
  }
  function bodyRival() {
    const REF = 1.6;
    const span = REF - 1;
    const p = (t) => (REF - t) / span;
    T("07 \u53F7\u8F66 \xB7 \u6211\u4EEC", SAFE.x0, 546, { f: `500 13px ${MONO}`, color: ACCENT });
    bar(SAFE.x0, 560, SAFE.x1 - SAFE.x0, 46, p(RUN.time), ACCENT);
    T(sec3(RUN.time), SAFE.x1, 546 + 78, { f: `500 24px ${MONO}`, color: PAPER, a: "right" });
    T(`${RUN.rival.car} \u53F7\u8F66 \xB7 ${RUN.rival.lane} \u9053`, SAFE.x0, 690, {
      f: `500 13px ${MONO}`,
      color: MUTE2
    });
    bar(SAFE.x0, 704, SAFE.x1 - SAFE.x0, 46, p(RUN.rival.time), "rgba(242,240,235,0.45)");
    T(sec3(RUN.rival.time), SAFE.x1, 690 + 78, { f: `500 24px ${MONO}`, color: MUTE, a: "right" });
    T(`\u9886\u5148 ${sec3(DERIVED.vsRival)} s`, SAFE.x0, VIS_Y1 - 44, {
      f: `600 34px ${MONO}`,
      color: ACCENT
    });
    T("\u6761\u8D8A\u957F = \u7528\u65F6\u8D8A\u77ED", SAFE.x1, VIS_Y1 - 44, {
      f: `400 13px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    table([
      ["\u6211\u7684\u7528\u65F6", sec3(RUN.time), false],
      ["\u5BF9\u624B\u7528\u65F6", sec3(RUN.rival.time)],
      ["\u5DEE\u503C", sec3(DERIVED.vsRival), true],
      ["\u7ED3\u679C", DERIVED.vsRival > 0 ? "\u8D62" : "\u8F93", DERIVED.vsRival > 0],
      ["\u8D5B\u9053", RUN.track]
    ]);
  }
  function bodySplit() {
    const mx = Math.max(...RUN.splits);
    const n = RUN.splits.length;
    const gap = 22;
    const bw = (SAFE.x1 - SAFE.x0 - gap * (n - 1)) / n;
    const baseY = VIS_Y1 - 54;
    const topY = 566;
    RUN.splits.forEach((s, i) => {
      const x = SAFE.x0 + i * (bw + gap);
      const h = (baseY - topY) * (s / mx);
      const y = baseY - h;
      const isBest = i === DERIVED.best;
      box(x, y, bw, h, isBest ? "rgba(232,89,12,0.85)" : "rgba(242,240,235,0.22)");
      box(x, y, bw, 3, isBest ? ACCENT : "rgba(242,240,235,0.5)");
      T(SEGMENTS[i], x, topY - 16, { f: `500 12px ${MONO}`, color: MUTE2 });
      T(sec3(s), x, y - 12, {
        f: `500 19px ${MONO}`,
        color: isBest ? ACCENT : PAPER
      });
      T(pct1(s / DERIVED.total), x, baseY + 24, { f: `400 12px ${MONO}`, color: MUTE2 });
    });
    rule(baseY + 40, LINE);
    T(
      `\u56DB\u6BB5\u52A0\u8D77\u6765 ${sec3(DERIVED.total)} s\uFF0C\u548C\u603B\u7528\u65F6${DERIVED.total === RUN.time ? "\u5BF9\u5F97\u4E0A" : "\u5BF9\u4E0D\u4E0A"}`,
      SAFE.x0,
      baseY + 68,
      { f: `400 13px ${MONO}`, color: MUTE }
    );
    table(RUN.splits.map((s, i) => [
      `${SEGMENTS[i]}`,
      `${sec3(s)}  \xB7  ${pct1(s / DERIVED.total)}`,
      i === DERIVED.best
    ]).slice(0, 4).concat([["\u5408\u8BA1", `${sec3(DERIVED.total)} s`, false]]));
  }
  function bodySheet() {
    const items = [
      ["\u7528\u65F6", sec3(RUN.time), PAPER],
      ["\u5FEB\u8FC7\u4E0A\u6B21", sec3(DERIVED.faster), ACCENT],
      ["\u9886\u5148\u5BF9\u624B", sec3(DERIVED.vsRival), ACCENT],
      ["\u8D5B\u9053\u6E29\u5EA6", `${RUN.temp} \u2103`, PAPER]
    ];
    const gap = 20;
    const w = (SAFE.x1 - SAFE.x0 - gap * 3) / 4;
    items.forEach(([k, v, c], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, VIS_Y0 + 10, VIS_Y0 + 150);
      T(k, x, VIS_Y0 + 40, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, VIS_Y0 + 100, { f: `500 30px ${MONO}`, color: c });
      T(i === 0 ? "s" : "", x, VIS_Y0 + 130, { f: `400 11px ${MONO}`, color: MUTE2 });
    });
    rule(VIS_Y0 + 176, LINE);
    T("\u8FD9\u7EC4\u6570\u7684\u5168\u90E8\u6765\u6E90", SAFE.x0, VIS_Y0 + 214, { f: `400 13px ${MONO}`, color: MUTE });
    T(`${RUN.date} \xB7 ${RUN.event}`, SAFE.x1, VIS_Y0 + 214, {
      f: `400 13px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    T("\u5206\u6BB5\u6700\u5FEB\u7684\u4E00\u6BB5", SAFE.x0, VIS_Y0 + 268, { f: `400 13px ${MONO}`, color: MUTE });
    T(`${SEGMENTS[DERIVED.best]} \xB7 ${sec3(RUN.splits[DERIVED.best])} s`, SAFE.x1, VIS_Y0 + 268, {
      f: `500 16px ${MONO}`,
      color: ACCENT,
      a: "right"
    });
    table([
      ["\u8F66\u53F7 / \u8F66\u9053", `${RUN.car} \u53F7 \xB7 ${RUN.lane} \u9053`],
      ["\u5BF9\u624B", `${RUN.rival.car} \u53F7 \xB7 ${RUN.rival.lane} \u9053`],
      ["\u8D5B\u9053", RUN.track],
      ["\u6C14\u74F6\u538B\u529B", `${RUN.pressure} g`],
      ["\u56DB\u6BB5\u5408\u8BA1", `${sec3(DERIVED.total)} s`]
    ]);
  }
  var BODY = { result: bodyResult, rival: bodyRival, split: bodySplit, sheet: bodySheet };
  var state = { id: "result" };
  function compose() {
    const card = CARDS.find((c) => c.id === state.id) || CARDS[0];
    BANDS = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(0, YSHIFT);
    rule(104, LINE_SOFT);
    T("DATA CARD", 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
    T(`${CARDS.findIndex((c) => c.id === card.id) + 1} / ${CARDS.length}`, 930, 136, {
      f: `500 13px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    ctx.fillStyle = "rgba(242,240,235,0.055)";
    ctx.font = `700 150px ${DISP}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(card.id.toUpperCase(), 930, 236);
    rule(SAFE.y0, LINE);
    box(SAFE.x0, SAFE.y0, 46, 3, ACCENT);
    T("STEM RACING", 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
    T(RUN.track, 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: "right" });
    T(card.title, 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
    T(card.sub, 60, 392, { f: `400 17px ${MONO}`, color: MUTE });
    T("\u6570\u636E\u70B9 / ITEMS", 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: "right" });
    T(String(TB_ROWS).padStart(2, "0"), 930, 368, {
      f: `600 68px ${DISP}`,
      color: PAPER,
      a: "right"
    });
    rule(412, LINE);
    const cols = [
      ["\u8F66\u53F7", `${RUN.car} \u53F7`],
      ["\u65E5\u671F", RUN.date],
      ["\u8F66\u5361", card.label]
    ];
    const gap2 = 26;
    const cw = (SAFE.x1 - SAFE.x0 - gap2 * 2) / 3;
    cols.forEach(([k, v], i) => {
      const x = SAFE.x0 + i * (cw + gap2);
      if (i > 0) vrule(x - gap2 / 2, 418, 486);
      T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, 476, { f: `500 21px ${MONO}`, color: PAPER });
    });
    rule(486, LINE_SOFT);
    BODY[card.id]();
    T("\u5206\u6BB5", SAFE.x0, TB_HDR, { f: `500 10px ${MONO}`, color: MUTE2 });
    T("\u5168\u90E8\u56DB\u5F20\u5361\u7528\u7684\u662F\u540C\u4E00\u7EC4\u6570", 930, TB_HDR, {
      f: `500 10px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    rule(TALLY_Y, LINE);
    const three = [
      ["\u7528\u65F6", `${sec3(RUN.time)} s`, PAPER],
      ["\u5FEB\u8FC7\u4E0A\u6B21", `\u2212${sec3(DERIVED.faster)} s`, ACCENT],
      ["\u5BF9\u5BF9\u624B", `+${sec3(DERIVED.vsRival)} s`, ACCENT]
    ];
    const g3 = 26;
    const w3 = (SAFE.x1 - SAFE.x0 - g3 * 2) / 3;
    three.forEach(([k, v, c], i) => {
      const x = SAFE.x0 + i * (w3 + g3);
      if (i > 0) vrule(x - g3 / 2, TALLY_Y + 6, TALLY_Y + 70);
      T(k, x, TALLY_Y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, TALLY_Y + 68, { f: `500 24px ${MONO}`, color: c });
    });
    rule(FOOT_Y, LINE);
    T("\u6570\u636E\u6765\u81EA src/points.js \xB7 \u4E0D\u4E0A\u4F20 \xB7 \u4E0D\u8054\u7F51", 60, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE
    });
    T(`CLIP-FACTORY \xB7 ${card.id.toUpperCase()}`, 930, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    T("\u8FD9\u7EC4\u6570\u662F\u7F16\u7684\uFF0C\u53D1\u4E4B\u524D\u6362\u6210\u81EA\u5DF1\u8BB0\u7684", 60, 1458, {
      f: `400 13px ${MONO}`,
      color: MUTE2
    });
    T("1080 \xD7 1920", 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: "right" });
    ctx.restore();
  }
  var $ = (id) => document.getElementById(id);
  var elCards = $("cards");
  var elTime = $("sTime");
  var elDelta = $("sDelta");
  var elRival = $("sRival");
  var elN = $("nCards");
  for (const c of CARDS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.card = c.id;
    b.textContent = c.label;
    b.setAttribute("aria-pressed", String(c.id === state.id));
    b.addEventListener("click", () => select(c.id));
    elCards.appendChild(b);
  }
  function select(id) {
    state.id = id;
    for (const b of elCards.children) b.setAttribute("aria-pressed", String(b.dataset.card === id));
    compose();
  }
  function syncPanel() {
    elN.textContent = String(CARDS.length);
    elTime.textContent = `${sec3(RUN.time)} s`;
    elDelta.textContent = `\u2212${sec3(DERIVED.faster)} s`;
    elRival.textContent = `+${sec3(DERIVED.vsRival)} s`;
  }
  async function blobOf(id, w, h) {
    const prev = state.id;
    state.id = id;
    compose();
    const out = resample(stage, w, h);
    const b = await new Promise((r) => out.toBlob(r, "image/png"));
    state.id = prev;
    compose();
    return b;
  }
  var PNG_MAGIC = "137,80,78,71,13,10,26,10";
  async function probe(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let h = 2166136261;
    for (let i = 0; i < buf.length; i++) {
      h ^= buf[i];
      h = Math.imul(h, 16777619) >>> 0;
    }
    return {
      size: blob.size,
      magic: Array.from(buf.slice(0, 8)).join(",") === PNG_MAGIC,
      // IHDR 紧跟在 8 字节签名 + 4 字节长度 + 4 字节 'IHDR' 之后，宽高各占 4 字节大端。
      // 从真实文件的字节里读，不拿画布尺寸冒充导出尺寸。
      w: (buf[16] << 24 | buf[17] << 16 | buf[18] << 8 | buf[19]) >>> 0,
      h: (buf[20] << 24 | buf[21] << 16 | buf[22] << 8 | buf[23]) >>> 0,
      hash: h.toString(16).padStart(8, "0")
    };
  }
  async function renderAll() {
    const out = [];
    for (const c of CARDS) {
      const p = await probe(await blobOf(c.id, 1080, 1920));
      out.push({ id: c.id, ...p });
    }
    return out;
  }
  async function downloadAll() {
    const made = [];
    for (const c of CARDS) {
      const b = await blobOf(c.id, 1080, 1920);
      download(b, `clip-factory-${c.id}-1080x1920.png`);
      made.push({ id: c.id, size: b.size });
      await new Promise((r) => setTimeout(r, 320));
    }
    return made;
  }
  $("exAll").addEventListener("click", async () => {
    const btn = $("exAll");
    btn.disabled = true;
    try {
      await downloadAll();
    } finally {
      btn.disabled = false;
    }
  });
  $("ex1").addEventListener("click", async () => {
    download(await blobOf(state.id, 1080, 1920), `clip-factory-${state.id}-1080x1920.png`);
  });
  $("ex2").addEventListener("click", async () => {
    download(await blobOf(state.id, 1080, 1350), `clip-factory-${state.id}-1080x1350.png`);
  });
  compose();
  syncPanel();
  var inkPct = () => {
    const d = ctx.getImageData(SAFE.x0, SAFE.y0, SAFE.x1 - SAFE.x0, SAFE.y1 - SAFE.y0).data;
    let ink = 0, tot = 0;
    for (let i = 0; i < d.length; i += 4) {
      tot++;
      if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 24) ink++;
    }
    return +(ink / tot * 100).toFixed(2);
  };
  window.__app = {
    canvas: stage,
    cards: () => CARDS.map((c) => ({ id: c.id, label: c.label })),
    current: () => state.id,
    select,
    stats: () => ({ id: state.id, n: CARDS.length, time: RUN.time, faster: DERIVED.faster, vsRival: DERIVED.vsRival }),
    derived: () => ({ ...DERIVED }),
    renderAll,
    downloadAll,
    selfTest: () => {
      const errs = [];
      const sum = +RUN.splits.reduce((a, b) => a + b, 0).toFixed(3);
      if (Math.abs(sum - RUN.time) > 5e-4) errs.push(`\u56DB\u6BB5\u52A0\u8D77\u6765 ${sum}\uFF0C\u603B\u7528\u65F6 ${RUN.time}\uFF0C\u5BF9\u4E0D\u4E0A`);
      if (RUN.prev <= RUN.time) errs.push('\u4E0A\u4E00\u6B21\u6CA1\u6709\u6BD4\u8FD9\u6B21\u6162\uFF0C"\u5FEB\u4E86" \u662F\u5047\u7684');
      if (RUN.rival.time <= RUN.time) errs.push('\u5BF9\u624B\u6CA1\u6709\u6BD4\u6211\u4EEC\u6162\uFF0C"\u9886\u5148" \u662F\u5047\u7684');
      if (RUN.splits.some((s) => s <= 0)) errs.push("\u6709\u5206\u6BB5\u7528\u65F6\u4E0D\u662F\u6B63\u6570");
      if (CARDS.length !== 4) errs.push(`\u5361\u9762\u662F ${CARDS.length} \u5F20\uFF0C\u5E94\u8BE5 4 \u5F20`);
      if (new Set(CARDS.map((c) => c.id)).size !== CARDS.length) errs.push("\u5361\u9762 id \u6709\u91CD\u590D");
      if (stage.width !== 1080 || stage.height !== 1920) errs.push("\u753B\u5E03\u4E0D\u662F 1080\xD71920");
      return { ok: errs.length === 0, errs };
    },
    exportProbe: async () => ({
      vertical: await probe(await blobOf(state.id, 1080, 1920)),
      cover: await probe(await blobOf(state.id, 1080, 1350))
    }),
    exportPNG: async () => (await blobOf(state.id, 1080, 1920)).size,
    exportCover: async () => (await blobOf(state.id, 1080, 1350)).size,
    inkPct,
    // 门禁靠这几个读真实包围盒，判断封面居中裁切之后还剩什么
    getBands: () => BANDS.map((b) => ({ ...b })),
    srcWindow: (w, h) => srcWindow(w, h),
    coverReport: () => {
      const win = srcWindow(COVER.w, COVER.h);
      const lost = BANDS.filter((b) => b.y1 < win.y0 || b.y0 > win.y1);
      const cut = BANDS.filter((b) => !(b.y1 < win.y0 || b.y0 > win.y1) && (b.y0 < win.y0 || b.y1 > win.y1));
      return {
        window: win,
        total: BANDS.length,
        lost: lost.map((b) => ({ kind: b.kind, text: b.text, y0: +b.y0.toFixed(1), y1: +b.y1.toFixed(1) })),
        cut: cut.map((b) => ({ kind: b.kind, text: b.text, y0: +b.y0.toFixed(1), y1: +b.y1.toFixed(1) }))
      };
    },
    // 四张卡都真画一遍再停在第一张：字体检测靠拦截 fillText 收集字符，
    // 只画默认那张的话，另外三张的字根本不会被检查
    preview: () => {
      for (const c of CARDS) {
        state.id = c.id;
        compose();
      }
      select("result");
    }
  };
})();
