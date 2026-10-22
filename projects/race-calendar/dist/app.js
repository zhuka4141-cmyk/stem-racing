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

  // src/races.js
  var SEASON = "2026 \u79CB \u2014 2027 \u590F";
  var RACES = [
    {
      start: "2026-09-12",
      end: "2026-09-12",
      name: "\u6821\u5185\u6D4B\u8BD5 #1",
      place: "\u6821\u5DE5\u574A",
      note: "\u65B0\u8F66\u7B2C\u4E00\u6B21\u4E0A\u7EBF\uFF0C\u53EA\u6D4B\u76F4\u7EBF\u7A33\u5B9A\u6027"
    },
    {
      start: "2026-10-03",
      end: "2026-10-03",
      name: "\u6821\u5185\u6D4B\u8BD5 #2",
      place: "\u6821\u5DE5\u574A",
      note: "\u6362\u8F74\u5957\u540E\u590D\u6D4B\uFF0C\u8BB0\u5F55\u4E09\u7EC4\u53D6\u4E2D\u4F4D"
    },
    {
      start: "2026-10-22",
      end: "2026-10-23",
      name: "\u5185\u90E8\u8BA1\u65F6 + \u8F74\u68C0",
      place: "\u6821\u5DE5\u574A",
      note: "\u4E24\u5929\uFF0C\u7B2C\u4E00\u5929\u8BA1\u65F6\u7B2C\u4E8C\u5929\u62C6\u68C0"
    },
    {
      start: "2026-11-14",
      end: "2026-11-14",
      name: "\u533A\u8D5B \u9884\u8D5B",
      place: "\u533A\u9752\u5C11\u5E74\u4E2D\u5FC3",
      note: "\u5E26\u4E24\u53F0\u8F66\uFF0C\u4E3B\u8F66 07 \u5907\u8F66 12"
    },
    {
      start: "2026-12-05",
      end: "2026-12-05",
      name: "\u533A\u8D5B \u51B3\u8D5B",
      place: "\u533A\u9752\u5C11\u5E74\u4E2D\u5FC3",
      note: "\u9884\u8D5B\u524D\u516B\u8FDB\uFF0C\u8D5B\u5236\u4E09\u5C40\u4E24\u80DC"
    },
    {
      start: "2027-03-13",
      end: "2027-03-14",
      name: "\u5E02\u7EA7\u9009\u62D4",
      place: "\u5E02\u79D1\u6280\u9986",
      note: "\u4E24\u5929\uFF0C\u7B2C\u4E00\u5929\u8F66\u68C0\u7B2C\u4E8C\u5929\u8DD1"
    },
    {
      start: "2027-04-17",
      end: "2027-04-17",
      name: "\u7701\u8D5B\u8D44\u683C\u8D5B",
      place: "\u7701\u4F53\u80B2\u9986 B \u9986",
      note: "\u8D5B\u9053 20 m\uFF0C\u6C14\u74F6\u7EDF\u4E00\u53D1\u653E"
    },
    {
      start: "2027-05-22",
      end: "2027-05-22",
      name: "\u7701\u8D5B \u51B3\u8D5B",
      place: "\u7701\u4F53\u80B2\u9986 B \u9986",
      note: "\u6309\u8D44\u683C\u8D5B\u6210\u7EE9\u5206\u7EC4"
    },
    {
      start: "2027-06-12",
      end: "2027-06-12",
      name: "\u961F\u5185\u603B\u7ED3\u8D5B",
      place: "\u6821\u5DE5\u574A",
      note: "\u5168\u5458\u4E0A\uFF0C\u8DD1\u5B8C\u62C6\u8F66\u5F52\u6863"
    }
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
  var LIVE_BG = "rgba(232,89,12,0.13)";
  var STRIP_Y = 412;
  var TL_Y0 = 500;
  var TL_Y1 = 1232;
  var SPINE_X = 72;
  var TEXT_X = 106;
  var TALLY_Y = 1232;
  var FOOT_Y = 1394;
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var FILTERS = [
    { id: "all", label: "\u5168\u90E8" },
    { id: "done", label: "\u5DF2\u5B8C\u8D5B" },
    { id: "live", label: "\u8FDB\u884C\u4E2D" },
    { id: "next", label: "\u5F85\u5F00\u8D5B" }
  ];
  var state = {
    now: Date.now(),
    filter: "all",
    rows: []
  };
  var hdr = 0;
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
  function dayNum(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 864e5);
  }
  function localDayNum(ts) {
    const d = new Date(ts);
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }
  function ymdOf(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  var md = (s) => `${s.slice(5, 7)}/${s.slice(8, 10)}`;
  function build(now) {
    const today = localDayNum(now);
    return RACES.map((r) => {
      const s = dayNum(r.start), e = dayNum(r.end);
      let status;
      if (today < s) status = "next";
      else if (today > e) status = "done";
      else status = "live";
      let right;
      if (status === "next") right = `\u8FD8\u6709 ${s - today} \u5929`;
      else if (status === "live") right = `\u7B2C ${today - s + 1} / ${e - s + 1} \u5929`;
      else right = `${today - e} \u5929\u524D`;
      const span = r.start === r.end ? md(r.start) : `${md(r.start)}\u2013${md(r.end)}`;
      return { ...r, status, right, span, today };
    });
  }
  var LABEL = { done: "\u5DF2\u5B8C\u8D5B", live: "\u8FDB\u884C\u4E2D", next: "\u5F85\u5F00\u8D5B" };
  function countsOf(rows) {
    const c = { done: 0, live: 0, next: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }
  function apply() {
    const all = build(state.now);
    state.rows = state.filter === "all" ? all : all.filter((r) => r.status === state.filter);
    compose();
    syncPanel();
  }
  function rowLayout(n) {
    const rows = Math.max(n, 1);
    const rowH = Math.min(92, Math.floor((TL_Y1 - TL_Y0) / rows));
    return { rows: n, rowH };
  }
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawTopBand();
    drawHeader();
    drawStrip();
    if (state.rows.length === 0) drawEmpty();
    else drawTimeline();
    drawTally();
    drawFooter();
  }
  function drawTopBand() {
    rule(104, LINE_SOFT);
    T("SEASON PLAN", 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
    T("\u65E5\u671F\u6309\u672C\u673A\u65E5\u5386\u7B97", 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: "right" });
    ctx.fillStyle = "rgba(242,240,235,0.055)";
    ctx.font = `700 150px ${DISP}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SEASON", 930, 236);
  }
  function drawHeader() {
    rule(SAFE.y0, LINE);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);
    T("STEM RACING", 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
    T(ymdOf(state.now), 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: "right" });
    T("\u8D5B\u5386", 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
    T("\u4E00\u573A\u4E00\u884C\uFF0C\u8FDB\u884C\u4E2D\u7684\u90A3\u4E00\u573A\u5355\u72EC\u6807\u51FA\u6765", 60, 392, {
      f: `400 17px ${MONO}`,
      color: MUTE
    });
    const n = state.rows.length;
    hdr = n;
    T(state.filter === "all" ? "\u573A\u6B21 / EVENTS" : "\u7B5B\u9009\u540E / SHOWN", 930, 288, {
      f: `500 11px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    T(n === 0 ? "0" : String(n).padStart(2, "0"), 930, 368, {
      f: `600 68px ${DISP}`,
      color: n === 0 ? MUTE2 : PAPER,
      a: "right"
    });
  }
  function drawStrip() {
    rule(STRIP_Y, LINE);
    const all = build(state.now);
    const nextRace = all.find((r) => r.status !== "done");
    const cols = [
      ["\u8D5B\u5B63", SEASON],
      ["\u4ECA\u5929", ymdOf(state.now)],
      ["\u4E0B\u4E00\u573A", nextRace ? nextRace.span : "\u65E0"]
    ];
    const gap = 26;
    const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
    cols.forEach(([k, v], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, STRIP_Y + 6, 486);
      T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, 476, { f: `500 21px ${MONO}`, color: PAPER });
    });
    rule(486, LINE_SOFT);
  }
  function drawTimeline() {
    const { rows, rowH } = rowLayout(state.rows.length);
    const yEnd = TL_Y0 + rows * rowH;
    vrule(SPINE_X, TL_Y0, yEnd, "rgba(255,255,255,0.10)");
    state.rows.forEach((r, i) => {
      const y = TL_Y0 + i * rowH;
      const live = r.status === "live";
      if (live) {
        ctx.fillStyle = LIVE_BG;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
      } else if (i % 2 === 1) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
      }
      rule(y, LINE_SOFT);
      const nx = SPINE_X - (live ? 6 : 4);
      if (live) {
        ctx.fillStyle = ACCENT;
        ctx.fillRect(nx, y + rowH / 2 - 6, 13, 13);
      } else {
        ctx.strokeStyle = r.status === "done" ? MUTE2 : "rgba(242,240,235,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(nx + 0.5, y + rowH / 2 - 3.5, 8, 8);
      }
      const l1 = y + rowH * 0.42;
      const l2 = y + rowH * 0.76;
      T(r.span, TEXT_X, l1, { f: `400 13px ${MONO}`, color: MUTE2 });
      T(`\xB7 ${r.place}`, TEXT_X + 112, l1, { f: `400 12px ${MONO}`, color: MUTE2 });
      T(r.name, TEXT_X, l2, {
        f: `500 22px ${MONO}`,
        color: r.status === "done" ? MUTE : PAPER
      });
      T(LABEL[r.status], SAFE.x1, l1, {
        f: `500 12px ${MONO}`,
        color: live ? ACCENT : MUTE2,
        a: "right"
      });
      T(r.right, SAFE.x1, l2, {
        f: `500 15px ${MONO}`,
        color: live ? ACCENT : MUTE,
        a: "right"
      });
    });
    rule(yEnd, LINE);
  }
  function drawEmpty() {
    const n = RACES.length;
    const rowH = Math.min(92, Math.floor((TL_Y1 - TL_Y0) / n));
    const yEnd = TL_Y0 + n * rowH;
    vrule(SPINE_X, TL_Y0, yEnd, "rgba(255,255,255,0.08)");
    for (let i = 0; i < n; i++) {
      const y = TL_Y0 + i * rowH;
      if (i % 2 === 1) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
      }
      rule(y, LINE_SOFT);
      ctx.strokeStyle = "rgba(242,240,235,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(SPINE_X - 3.5, y + rowH / 2 - 3.5, 8, 8);
      T("- -", TEXT_X, y + rowH * 0.42, { f: `400 13px ${MONO}`, color: "rgba(242,240,235,0.16)" });
      T("- - - - -", TEXT_X, y + rowH * 0.76, { f: `500 22px ${MONO}`, color: "rgba(242,240,235,0.16)" });
    }
    const cy = TL_Y0 + (yEnd - TL_Y0) / 2;
    ctx.fillStyle = INK;
    ctx.fillRect(SAFE.x0, cy - 60, SAFE.x1 - SAFE.x0, 120);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, cy - 60, 3, 120);
    const label = FILTERS.find((f) => f.id === state.filter).label;
    T(`\u6CA1\u6709${{ done: "\u5DF2\u5B8C\u8D5B", live: "\u8FDB\u884C\u4E2D", next: "\u5F85\u5F00\u8D5B" }[state.filter]}\u7684\u6BD4\u8D5B`, 78, cy - 6, {
      f: `600 32px ${DISP}`,
      color: MUTE
    });
    T(`\u7B5B\u9009\u300C${label}\u300D \xB7 \u8D5B\u5B63\u91CC\u5171 ${RACES.length} \u573A\uFF0C\u4ECA\u5929 ${ymdOf(state.now)}`, 78, cy + 24, {
      f: `400 14px ${MONO}`,
      color: MUTE2
    });
    T("\u70B9\u56DE\u300C\u5168\u90E8\u300D\u5C31\u90FD\u56DE\u6765\u4E86", 78, cy + 48, { f: `400 13px ${MONO}`, color: MUTE2 });
    rule(yEnd, LINE);
  }
  function drawTally() {
    const y = TALLY_Y;
    rule(y, LINE);
    const counts = countsOf(state.rows);
    const gap = 26;
    const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
    const cols = [
      ["\u5DF2\u5B8C\u8D5B", counts.done, MUTE],
      ["\u8FDB\u884C\u4E2D", counts.live, ACCENT],
      ["\u5F85\u5F00\u8D5B", counts.next, PAPER]
    ];
    cols.forEach(([k, v, c], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, y + 6, y + 74);
      T(k, x, y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(String(v), x, y + 70, { f: `500 26px ${MONO}`, color: c });
    });
    T("\u72B6\u6001\u6309\u672C\u673A\u65E5\u671F\u7B97\uFF0C\u4E0D\u8054\u7F51\u6821\u65F6", 60, y + 104, {
      f: `400 11px ${MONO}`,
      color: MUTE2
    });
    const shown = state.rows.length;
    T(shown === 0 ? `\u663E\u793A 0 / ${RACES.length} \u573A \xB7 \u8FD9\u4E2A\u7B5B\u9009\u4E0B\u6CA1\u6709\u6BD4\u8D5B` : `\u663E\u793A ${shown} / ${RACES.length} \u573A`, 60, y + 136, {
      f: `400 14px ${MONO}`,
      color: MUTE
    });
    rule(FOOT_Y, LINE);
  }
  function drawFooter() {
    T("\u8D5B\u7A0B\u5199\u5728 src/races.js \xB7 \u4E0D\u4E0A\u4F20 \xB7 \u4E0D\u8054\u7F51", 60, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE
    });
    T("RACE-CALENDAR", 930, 1428, { f: `400 14px ${MONO}`, color: MUTE2, a: "right" });
    T("\u65E5\u671F\u662F\u6821\u5386\u7F16\u7684\uFF0C\u7528\u524D\u5148\u6362\u6210\u771F\u7684\u901A\u77E5", 60, 1458, {
      f: `400 13px ${MONO}`,
      color: MUTE2
    });
    T("1080 \xD7 1920", 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: "right" });
  }
  var $ = (id) => document.getElementById(id);
  var elNow = $("now");
  var elFilters = $("filters");
  var elDone = $("sDone");
  var elLive = $("sLive");
  var elNext = $("sNext");
  for (const f of FILTERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.filter = f.id;
    b.textContent = f.label;
    b.setAttribute("aria-pressed", String(f.id === state.filter));
    b.addEventListener("click", () => setFilter(f.id));
    elFilters.appendChild(b);
  }
  function setFilter(id) {
    state.filter = id;
    for (const b of elFilters.children) b.setAttribute("aria-pressed", String(b.dataset.filter === id));
    apply();
  }
  function syncPanel() {
    elNow.textContent = ymdOf(state.now);
    const c = countsOf(state.rows);
    elDone.textContent = String(c.done);
    elLive.textContent = String(c.live);
    elNext.textContent = String(c.next);
  }
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
  $("ex1").addEventListener("click", () => exportOne(1080, 1920, "race-calendar-1080x1920.png"));
  $("ex2").addEventListener("click", () => exportOne(1080, 1350, "race-calendar-1080x1350.png"));
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
    rows: () => state.rows.map((r) => ({
      name: r.name,
      span: r.span,
      status: r.status,
      right: r.right
    })),
    stats: () => ({
      filter: state.filter,
      shown: state.rows.length,
      header: hdr,
      total: RACES.length,
      ymd: ymdOf(state.now),
      ...countsOf(state.rows)
    }),
    // 门禁靠这个把「今天」钉死，否则测出来的结果每天都变
    setNow: (ts) => {
      state.now = Number(ts);
      apply();
    },
    today: () => state.now,
    setFilter,
    reset: () => {
      state.now = Date.now();
      setFilter("all");
    },
    selfTest: () => {
      const errs = [];
      const today = localDayNum(state.now);
      for (const r of build(state.now)) {
        const s = dayNum(r.start), e = dayNum(r.end);
        const want = today < s ? "next" : today > e ? "done" : "live";
        if (r.status !== want) errs.push(`${r.name} \u72B6\u6001 ${r.status}\uFF0C\u6309\u65E5\u671F\u5E94\u8BE5\u662F ${want}`);
        if (want === "next" && r.right !== `\u8FD8\u6709 ${s - today} \u5929`) {
          errs.push(`${r.name} \u5012\u8BA1\u65F6\u5199\u6210\u300C${r.right}\u300D`);
        }
      }
      const order = build(state.now).map((r) => r.start);
      for (let i = 1; i < order.length; i++) {
        if (order[i] < order[i - 1]) {
          errs.push("\u8D5B\u7A0B\u6CA1\u6709\u6309\u65E5\u671F\u6392");
          break;
        }
      }
      if (stage.width !== 1080 || stage.height !== 1920) errs.push("\u753B\u5E03\u4E0D\u662F 1080\xD71920");
      return { ok: errs.length === 0, errs };
    },
    exportProbe,
    exportPNG: async () => (await rawBlob(1080, 1920)).size,
    exportCover: async () => (await rawBlob(1080, 1350)).size,
    inkPct,
    preview: () => {
      state.now = Date.now();
      setFilter("all");
    }
  };
})();
