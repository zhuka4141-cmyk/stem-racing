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

  // src/results.js
  var RESULTS = [
    { date: "2025-09-20", event: "\u6821\u5185\u6D4B\u8BD5 #1", car: "07", time: 1.318, place: 3 },
    { date: "2025-10-18", event: "\u6821\u5185\u6D4B\u8BD5 #2", car: "07", time: 1.274, place: 2 },
    { date: "2025-11-15", event: "\u533A\u8D5B \u9884\u8D5B", car: "12", time: 1.241, place: 4 },
    { date: "2025-12-06", event: "\u533A\u8D5B \u51B3\u8D5B", car: "12", time: 1.208, place: 3 },
    { date: "2026-03-14", event: "\u6821\u5185\u6D4B\u8BD5 #3", car: "07", time: 1.186, place: 1 },
    { date: "2026-04-11", event: "\u6821\u9645\u5BF9\u6297", car: "21", time: 1.172, place: 5 },
    { date: "2026-05-16", event: "\u5E02\u7EA7\u9009\u62D4 \u4E00\u7EC4", car: "07", time: 1.149, place: 2 },
    { date: "2026-06-13", event: "\u5E02\u7EA7\u9009\u62D4 \u51B3\u8D5B", car: "07", time: 1.124, place: 1 },
    { date: "2026-07-04", event: "\u6691\u671F\u8BA1\u65F6\u8D5B", car: "21", time: 1.098, place: 3 },
    { date: "2026-09-05", event: "\u6821\u5185\u6D4B\u8BD5 #4", car: "12", time: 1.081, place: 2 },
    { date: "2026-09-26", event: "\u7701\u8D5B\u8D44\u683C\u8D5B", car: "07", time: 1.062, place: 1 },
    { date: "2026-10-17", event: "\u7701\u8D5B \u51B3\u8D5B", car: "07", time: 1.042, place: 1 }
  ];

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
  var STRIP_Y = 412;
  var ROW_Y0 = 524;
  var ROW_AREA = 1e3 - ROW_Y0;
  var ROW_MAX_H = 62;
  var ROW_MIN_H = 56;
  var CH_HDR_Y = 1012;
  var CH_Y0 = 1040;
  var CH_Y1 = 1180;
  var CH_FOOT_Y = 1208;
  var TALLY_Y = 1232;
  var FOOT_Y = 1394;
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var SORTS = [
    { id: "date", label: "\u65E5\u671F" },
    { id: "time", label: "\u7528\u65F6" },
    { id: "place", label: "\u540D\u6B21" }
  ];
  var state = {
    q: "",
    sort: "date",
    all: RESULTS,
    shown: []
  };
  function T(str, x, y, { f = `500 16px ${MONO}`, color = PAPER, a = "left" } = {}) {
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textAlign = a;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  }
  function rule(y, color = LINE_SOFT) {
    ctx.fillStyle = color;
    ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);
  }
  function vrule(x, y0, y1, color = LINE_SOFT) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y0, 1, y1 - y0);
  }
  var pad2 = (n) => String(n).padStart(2, "0");
  var cut = (s, n) => [...s].length > n ? [...s].slice(0, n - 1).join("") + "\u2026" : s;
  var sec3 = (t) => t.toFixed(3);
  var md = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  function apply() {
    const q = state.q.trim().toLowerCase();
    const hit = state.all.filter((r) => !q || r.event.toLowerCase().includes(q) || r.car.toLowerCase().includes(q));
    if (state.sort === "date") hit.sort((a, b) => a.date < b.date ? 1 : -1);
    else if (state.sort === "time") hit.sort((a, b) => a.time - b.time);
    else hit.sort((a, b) => a.place - b.place || a.time - b.time);
    state.shown = hit;
    compose();
    syncPanel();
  }
  function rowLayout(n) {
    const rows = Math.min(n, Math.floor(ROW_AREA / ROW_MIN_H));
    const rowH = Math.min(ROW_MAX_H, Math.floor(ROW_AREA / Math.max(rows, 1)));
    return { rows: Math.max(rows, 0), rowH };
  }
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawTopBand();
    drawHeader();
    drawStrip();
    if (state.shown.length === 0) drawEmpty();
    else drawRows();
    drawChart();
    drawTally();
    drawFooter();
  }
  function drawTopBand() {
    rule(104, LINE_SOFT);
    T("TIMING SHEET", 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
    T("\u672C\u673A\u6570\u636E \xB7 \u65E0\u7F51\u7EDC", 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: "right" });
    ctx.fillStyle = "rgba(242,240,235,0.055)";
    ctx.font = `700 150px ${DISP}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("ARCHIVE", 930, 236);
  }
  function drawHeader() {
    rule(SAFE.y0, LINE);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);
    T("STEM RACING", 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
    T("20 m \u76F4\u7EBF \xB7 \u5355\u4F4D\u79D2", 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: "right" });
    T("\u6210\u7EE9\u6863\u6848", 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
    T(`\u5171 ${state.all.length} \u7AD9\u8BB0\u5F55\uFF0C\u6309\u65E5\u671F\u3001\u7528\u65F6\u6216\u540D\u6B21\u6392`, 60, 392, {
      f: `400 17px ${MONO}`,
      color: MUTE
    });
    T("\u8BB0\u5F55 / RUNS", 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: "right" });
    T(pad2(state.all.length), 930, 368, { f: `600 68px ${DISP}`, color: PAPER, a: "right" });
  }
  function drawStrip() {
    rule(STRIP_Y, LINE);
    const sortLabel = SORTS.find((s) => s.id === state.sort).label;
    const cols = [
      ["\u8D5B\u5B63", "2025 \u2192 2026"],
      ["\u8F66\u578B", "CO\u2082 \u7EC4"],
      ["\u6392\u5E8F", sortLabel]
    ];
    const gap = 26;
    const w = (SAFE.x1 - SAFE.x0 - gap * (cols.length - 1)) / cols.length;
    cols.forEach(([k, v], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, STRIP_Y + 6, 486);
      T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(cut(v, 12), x, 476, { f: `500 21px ${MONO}`, color: PAPER });
    });
    rule(486, LINE_SOFT);
    T("\u8D5B\u4E8B", SAFE.x0, 508, { f: `500 10px ${MONO}`, color: MUTE2 });
    T("\u65E5\u671F", 172, 508, { f: `500 10px ${MONO}`, color: MUTE2 });
    T("\u8F66", 566, 508, { f: `500 10px ${MONO}`, color: MUTE2 });
    T("\u7528\u65F6", 830, 508, { f: `500 10px ${MONO}`, color: MUTE2, a: "right" });
    T("\u540D\u6B21", 930, 508, { f: `500 10px ${MONO}`, color: MUTE2, a: "right" });
  }
  function drawRows() {
    const { rows, rowH } = rowLayout(state.shown.length);
    const list = state.shown.slice(0, rows);
    for (let i = 0; i < rows; i++) {
      const y = ROW_Y0 + i * rowH;
      const r = list[i];
      if (i % 2 === 1) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
      }
      rule(y, LINE_SOFT);
      if (!r) continue;
      const best = r.place === 1;
      if (best) {
        ctx.fillStyle = ACCENT;
        ctx.fillRect(SAFE.x0, y + rowH * 0.28, 3, rowH * 0.44);
      }
      const by = y + rowH * 0.63;
      T(cut(r.event, 11), best ? 78 : SAFE.x0, by, { f: `500 20px ${MONO}`, color: PAPER });
      T(md(r.date), 172, by, { f: `400 12px ${MONO}`, color: MUTE2 });
      T(r.car, 566, by, { f: `400 12px ${MONO}`, color: MUTE2 });
      T(sec3(r.time), 830, by, { f: `500 22px ${MONO}`, color: PAPER, a: "right" });
      T(pad2(r.place), 930, by, {
        f: `500 13px ${MONO}`,
        color: best ? ACCENT : MUTE,
        a: "right"
      });
    }
    rule(ROW_Y0 + rows * rowH, LINE);
  }
  function drawEmpty() {
    const { rows, rowH } = rowLayout(state.all.length);
    const y1 = ROW_Y0 + rows * rowH;
    for (let i = 0; i < rows; i++) {
      const y = ROW_Y0 + i * rowH;
      if (i % 2 === 1) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
      }
      rule(y, LINE_SOFT);
      T("- - -", SAFE.x0, y + rowH * 0.62, {
        f: `500 15px ${MONO}`,
        color: "rgba(242,240,235,0.18)"
      });
      T("--/--", 172, y + rowH * 0.62, { f: `400 11px ${MONO}`, color: MUTE2 });
      T("--", 566, y + rowH * 0.62, { f: `400 11px ${MONO}`, color: MUTE2 });
    }
    const cy = ROW_Y0 + (y1 - ROW_Y0) / 2;
    ctx.fillStyle = INK;
    ctx.fillRect(SAFE.x0, cy - 62, SAFE.x1 - SAFE.x0, 124);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, cy - 62, 3, 124);
    T("\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5F55", 78, cy - 8, { f: `600 32px ${DISP}`, color: MUTE });
    T(`\u641C\u7D22\u300C${state.q.trim() || "\u7A7A"}\u300D \xB7 \u6863\u6848\u91CC ${state.all.length} \u7AD9`, 78, cy + 24, {
      f: `400 14px ${MONO}`,
      color: MUTE2
    });
    T("\u6362\u4E2A\u8D5B\u4E8B\u540D\u6216\u8F66\u53F7\u8BD5\u8BD5", 78, cy + 48, { f: `400 13px ${MONO}`, color: MUTE2 });
    rule(y1, LINE);
  }
  function drawChart() {
    rule(CH_HDR_Y, LINE);
    const asc = [...state.shown].sort((a, b) => a.date < b.date ? -1 : 1);
    T("\u7528\u65F6\u8D8B\u52BF", SAFE.x0, CH_HDR_Y + 26, { f: `500 11px ${MONO}`, color: MUTE2 });
    if (asc.length === 0) {
      T("\u65E0\u6570\u636E", SAFE.x1, CH_HDR_Y + 26, { f: `500 12px ${MONO}`, color: MUTE2, a: "right" });
      rule(CH_Y1, LINE_SOFT);
      T("--", SAFE.x0, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2 });
      T("--", SAFE.x1, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2, a: "right" });
      return;
    }
    const times = asc.map((r) => r.time);
    const mn = Math.min(...times);
    const mx = Math.max(...times);
    const span = Math.max(mx - mn, 1e-3);
    T(`${sec3(mn)} \u2013 ${sec3(mx)} s \xB7 ${asc.length} \u7AD9`, SAFE.x1, CH_HDR_Y + 26, {
      f: `400 11px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    rule(CH_Y0, LINE_SOFT);
    rule(CH_Y1, LINE);
    const px = (i) => asc.length === 1 ? (SAFE.x0 + SAFE.x1) / 2 : SAFE.x0 + (SAFE.x1 - SAFE.x0) * i / (asc.length - 1);
    const py = (t) => CH_Y1 - (CH_Y1 - CH_Y0) * (t - mn) / span;
    asc.forEach((r, i) => {
      vrule(px(i), CH_Y0, CH_Y1, "rgba(255,255,255,0.045)");
    });
    ctx.beginPath();
    ctx.moveTo(px(0), CH_Y1);
    asc.forEach((r, i) => ctx.lineTo(px(i), py(r.time)));
    ctx.lineTo(px(asc.length - 1), CH_Y1);
    ctx.closePath();
    ctx.fillStyle = "rgba(232,89,12,0.14)";
    ctx.fill();
    ctx.beginPath();
    asc.forEach((r, i) => {
      const x = px(i), y = py(r.time);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();
    asc.forEach((r, i) => {
      const x = px(i), y = py(r.time);
      const last2 = i === asc.length - 1;
      ctx.beginPath();
      ctx.arc(x, y, last2 ? 5 : 3, 0, Math.PI * 2);
      if (last2) {
        ctx.fillStyle = ACCENT;
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(242,240,235,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    const last = asc[asc.length - 1];
    T(sec3(last.time), px(asc.length - 1), py(last.time) - 12, {
      f: `500 13px ${MONO}`,
      color: ACCENT,
      a: "right"
    });
    T(asc[0].date, SAFE.x0, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2 });
    T(last.date, SAFE.x1, CH_FOOT_Y, { f: `400 11px ${MONO}`, color: MUTE2, a: "right" });
  }
  function drawTally() {
    const y = TALLY_Y;
    rule(y, LINE);
    const times = state.all.map((r) => r.time);
    const mn = Math.min(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const wins = state.all.filter((r) => r.place === 1).length;
    const gap = 26;
    const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
    const cols = [
      ["\u6700\u5FEB", `${sec3(mn)} s`],
      ["\u5E73\u5747", `${sec3(avg)} s`],
      ["\u7B2C\u4E00\u540D", `${wins} \u7AD9`]
    ];
    cols.forEach(([k, v], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, y + 6, y + 74);
      T(k, x, y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, y + 70, { f: `500 26px ${MONO}`, color: PAPER });
    });
    T("\u5168\u90E8\u4E3A 20 m \u76F4\u7EBF\uFF1B\u6570\u636E\u662F\u961F\u5185\u8BB0\u5F55\uFF0C\u4E0D\u662F\u5B98\u65B9\u8BA1\u65F6", 60, y + 104, {
      f: `400 11px ${MONO}`,
      color: MUTE2
    });
    T(
      `\u663E\u793A ${Math.min(state.shown.length, rowLayout(state.shown.length).rows)} / ${state.all.length}`,
      60,
      y + 136,
      { f: `400 14px ${MONO}`, color: MUTE }
    );
    rule(FOOT_Y, LINE);
  }
  function drawFooter() {
    T("\u6570\u636E\u5199\u6B7B\u5728 src/results.js \xB7 \u4E0D\u4E0A\u4F20 \xB7 \u4E0D\u8054\u7F51", 60, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE
    });
    T("RESULT-ARCHIVE", 930, 1428, { f: `400 14px ${MONO}`, color: MUTE2, a: "right" });
    T("\u793A\u4F8B\u6570\u636E\uFF0C\u6362\u6210\u81EA\u5DF1\u961F\u8BB0\u7684\u8868\u518D\u53D1", 60, 1458, { f: `400 13px ${MONO}`, color: MUTE2 });
    T("1080 \xD7 1920", 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: "right" });
  }
  var $ = (id) => document.getElementById(id);
  var elQ = $("q");
  var elSorts = $("sorts");
  var elQHit = $("qHit");
  var elSTotal = $("sTotal");
  var elSShown = $("sShown");
  var elSSort = $("sSort");
  for (const s of SORTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.sort = s.id;
    b.textContent = s.label;
    b.setAttribute("aria-pressed", String(s.id === state.sort));
    b.addEventListener("click", () => setSort(s.id));
    elSorts.appendChild(b);
  }
  function setSort(id) {
    state.sort = id;
    for (const b of elSorts.children) b.setAttribute("aria-pressed", String(b.dataset.sort === id));
    apply();
  }
  function syncPanel() {
    elQHit.textContent = String(state.shown.length);
    elSTotal.textContent = String(state.all.length);
    elSShown.textContent = String(state.shown.length);
    elSSort.textContent = SORTS.find((s) => s.id === state.sort).label;
  }
  elQ.addEventListener("input", () => {
    state.q = elQ.value;
    apply();
  });
  async function rawBlob(w, h) {
    compose();
    const out = resample(stage, w, h);
    return await new Promise((r) => out.toBlob(r, "image/png"));
  }
  var PNG_MAGIC = "137,80,78,71,13,10,26,10";
  async function probe(blob) {
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    return { size: blob.size, magic: head.join(",") === PNG_MAGIC };
  }
  async function exportProbe() {
    const v = await probe(await rawBlob(1080, 1920));
    const c = await probe(await rawBlob(1080, 1350));
    return { vertical: v, cover: c };
  }
  async function exportOne(w, h, name) {
    const b = await rawBlob(w, h);
    const p = await probe(b);
    if (!p.magic) throw new Error("\u4E0D\u662F\u5408\u6CD5 PNG");
    download(b, name);
    return b.size;
  }
  $("ex1").addEventListener("click", () => exportOne(1080, 1920, "result-archive-1080x1920.png"));
  $("ex2").addEventListener("click", () => exportOne(1080, 1350, "result-archive-1080x1350.png"));
  apply();
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
    getState: () => ({
      q: state.q,
      sort: state.sort,
      shown: state.shown.map((r) => `${r.date} ${r.event} ${r.time}`),
      total: state.all.length
    }),
    stats: () => ({ q: state.q, sort: state.sort, shown: state.shown.length, total: state.all.length }),
    // 原始行，给门禁验排序用；字符串版看不出名次
    rows: () => state.shown.map((r) => ({ ...r })),
    setQuery: (s) => {
      state.q = String(s);
      elQ.value = state.q;
      apply();
    },
    setSort,
    reset: () => {
      state.q = "";
      elQ.value = "";
      setSort("date");
    },
    selfTest: () => {
      const errs = [];
      if (state.shown.length > state.all.length) errs.push("\u663E\u793A\u6570\u8D85\u8FC7\u603B\u6570");
      if (state.sort === "date" && state.shown.length > 1) {
        for (let i = 1; i < state.shown.length; i++) {
          if (state.shown[i].date > state.shown[i - 1].date) {
            errs.push("\u65E5\u671F\u6CA1\u6709\u4ECE\u65B0\u5230\u65E7");
            break;
          }
        }
      }
      if (state.sort === "time" && state.shown.length > 1) {
        for (let i = 1; i < state.shown.length; i++) {
          if (state.shown[i].time < state.shown[i - 1].time) {
            errs.push("\u7528\u65F6\u6CA1\u6709\u4ECE\u5FEB\u5230\u6162");
            break;
          }
        }
      }
      if (state.sort === "place" && state.shown.length > 1) {
        for (let i = 1; i < state.shown.length; i++) {
          if (state.shown[i].place < state.shown[i - 1].place) {
            errs.push("\u540D\u6B21\u6CA1\u6709\u4ECE\u597D\u5230\u5DEE");
            break;
          }
        }
      }
      const q = state.q.trim().toLowerCase();
      if (q && state.shown.some((r) => !(r.event.toLowerCase().includes(q) || r.car.toLowerCase().includes(q)))) {
        errs.push("\u641C\u7D22\u7ED3\u679C\u91CC\u6DF7\u8FDB\u4E86\u4E0D\u5339\u914D\u7684\u8BB0\u5F55");
      }
      if (stage.width !== 1080 || stage.height !== 1920) errs.push("\u753B\u5E03\u4E0D\u662F 1080\xD71920");
      return { ok: errs.length === 0, errs };
    },
    exportProbe,
    exportPNG: async () => (await rawBlob(1080, 1920)).size,
    exportCover: async () => (await rawBlob(1080, 1350)).size,
    inkPct,
    preview: () => {
      state.q = "";
      elQ.value = "";
      setSort("date");
    }
  };
})();
