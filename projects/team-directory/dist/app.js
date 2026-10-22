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

  // src/team.js
  var ROLES = ["\u961F\u957F", "\u673A\u68B0", "\u7535\u63A7", "\u8BBE\u8BA1", "\u6570\u636E"];
  var TEAM = [
    {
      name: "\u9648\u4EE5\u7406",
      role: "\u961F\u957F",
      join: "2024-09-14",
      line: "\u6574\u8F66\u8282\u70B9 / \u5BF9\u5916\u5BF9\u63A5"
    },
    {
      name: "\u5468\u7267\u91CE",
      role: "\u673A\u68B0",
      join: "2024-09-14",
      line: "\u8F66\u8EAB\u6210\u578B / \u8F6E\u8F74\u914D\u5408"
    },
    {
      name: "\u6797\u77E5\u8FDC",
      role: "\u673A\u68B0",
      join: "2025-03-02",
      line: "CO\u2082 \u6C14\u74F6\u5EA7 / \u6362\u6C14\u6D41\u7A0B"
    },
    {
      name: "\u5434\u5C0F\u6EE1",
      role: "\u7535\u63A7",
      join: "2024-11-08",
      line: "\u8BA1\u65F6\u7535\u8DEF / \u5149\u7535\u95E8\u6821\u51C6"
    },
    {
      name: "\u4F55\u53D9",
      role: "\u8BBE\u8BA1",
      join: "2025-03-02",
      line: "\u6D82\u88C5 / \u8F66\u53F7 / \u5C55\u677F"
    },
    {
      name: "\u82CF\u5357",
      role: "\u6570\u636E",
      join: "2025-09-20",
      line: "\u6210\u7EE9\u8868 / \u98CE\u6D1E\u8BB0\u5F55\u6574\u7406"
    },
    {
      name: "\u90D1\u4E00\u9E23",
      role: "\u673A\u68B0",
      join: "2025-09-20",
      line: "\u8F6E\u7EC4\u6253\u78E8 / \u8F74\u5957\u516C\u5DEE"
    },
    {
      name: "\u8C22\u9716",
      role: "\u7535\u63A7",
      join: "2026-03-07",
      line: "\u53D1\u8F66\u88C5\u7F6E / \u7EE7\u7535\u5668\u66FF\u6362"
    },
    {
      name: "\u9EC4\u4EA6",
      role: "\u8BBE\u8BA1",
      join: "2026-03-07",
      line: "\u7248\u5F0F / \u8D34\u7EB8\u6253\u6837"
    },
    {
      name: "\u9AD8\u89C1",
      role: "\u6570\u636E",
      join: "2026-09-12",
      line: "\u5386\u6B21\u6210\u7EE9\u5F52\u6863 / \u56DE\u5F52\u8868"
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
  var STRIP_Y = 412;
  var ROW_Y0 = 496;
  var ROW_AREA = 736;
  var ROW_MAX_H = 92;
  var ROW_MIN_H = 56;
  var TALLY_Y = 1232;
  var FOOT_Y = 1394;
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var state = {
    q: "",
    role: "\u5168\u90E8",
    all: TEAM,
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
  function apply() {
    const q = state.q.trim().toLowerCase();
    state.shown = state.all.filter((m) => (state.role === "\u5168\u90E8" || m.role === state.role) && (!q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q) || m.line.toLowerCase().includes(q)));
    compose();
    syncPanel();
  }
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawTopBand();
    drawHeader();
    drawStrip();
    if (state.shown.length === 0) drawEmpty();
    else drawRows();
    drawTally();
    drawFooter();
  }
  function drawTopBand() {
    rule(104, LINE_SOFT);
    T("ROSTER SHEET", 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
    T("\u672C\u673A\u6570\u636E \xB7 \u65E0\u7F51\u7EDC", 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: "right" });
    ctx.fillStyle = "rgba(242,240,235,0.055)";
    ctx.font = `700 150px ${DISP}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("ROSTER", 930, 236);
  }
  function drawHeader() {
    rule(SAFE.y0, LINE);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);
    T("STEM RACING", 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
    T("\u672C\u673A\u6570\u636E \xB7 \u65E0\u7F51\u7EDC", 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: "right" });
    T("\u961F\u5458\u540D\u5F55", 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
    T("\u6309\u89D2\u8272\u7B5B\u9009\uFF0C\u6309\u59D3\u540D\u3001\u89D2\u8272\u6216\u4E00\u53E5\u8BDD\u641C\u7D22", 60, 392, { f: `400 17px ${MONO}`, color: MUTE });
    T("\u5728\u518C / MEMBERS", 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: "right" });
    T(pad2(state.all.length), 930, 368, { f: `600 68px ${DISP}`, color: PAPER, a: "right" });
  }
  function drawStrip() {
    rule(STRIP_Y, LINE);
    const cols = [
      ["\u8D5B\u5B63", "2026 \u79CB\u5B63"],
      ["\u7B5B\u9009", state.role],
      ["\u663E\u793A", `${Math.min(state.shown.length, rowLayout(state.shown.length).rows)} / ${state.all.length}`]
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
  }
  function rowLayout(n) {
    const rows = Math.min(n, Math.floor(ROW_AREA / ROW_MIN_H));
    const rowH = Math.min(ROW_MAX_H, Math.floor(ROW_AREA / Math.max(rows, 1)));
    return { rows: Math.max(rows, 0), rowH };
  }
  function drawRows() {
    const { rows, rowH } = rowLayout(state.shown.length);
    const list = state.shown.slice(0, rows);
    for (let i = 0; i < rows; i++) {
      const y = ROW_Y0 + i * rowH;
      const m = list[i];
      if (i % 2 === 1) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, rowH);
      }
      rule(y, LINE_SOFT);
      if (!m) continue;
      const lead = m.role === "\u961F\u957F";
      ctx.fillStyle = lead ? ACCENT : "rgba(242,240,235,0.20)";
      ctx.fillRect(SAFE.x0, y + 18, 3, rowH - 36);
      T(pad2(i + 1), 76, y + rowH * 0.46, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(m.name, 110, y + rowH * 0.46, { f: `600 25px ${MONO}`, color: PAPER });
      T(m.role, 930, y + rowH * 0.46, {
        f: `500 12px ${MONO}`,
        color: lead ? ACCENT : MUTE,
        a: "right"
      });
      T(cut(m.line, 22), 110, y + rowH * 0.74, { f: `400 13px ${MONO}`, color: MUTE });
      T(m.join, 930, y + rowH * 0.74, { f: `400 12px ${MONO}`, color: MUTE2, a: "right" });
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
      T(pad2(i + 1), 76, y + rowH * 0.46, { f: `500 11px ${MONO}`, color: MUTE2 });
      T("- - -", 110, y + rowH * 0.46, { f: `500 22px ${MONO}`, color: "rgba(242,240,235,0.18)" });
      T("--", 930, y + rowH * 0.46, { f: `500 12px ${MONO}`, color: MUTE2, a: "right" });
    }
    const cy = ROW_Y0 + (y1 - ROW_Y0) / 2;
    ctx.fillStyle = INK;
    ctx.fillRect(SAFE.x0, cy - 74, SAFE.x1 - SAFE.x0, 148);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, cy - 74, 3, 148);
    T("\u6CA1\u6709\u5339\u914D\u7684\u961F\u5458", 76, cy - 14, { f: `600 34px ${DISP}`, color: MUTE });
    T(`\u7B5B\u9009\u300C${state.role}\u300D \xB7 \u641C\u7D22\u300C${state.q.trim() || "\u7A7A"}\u300D \xB7 \u5728\u518C ${state.all.length} \u4EBA`, 76, cy + 22, {
      f: `400 14px ${MONO}`,
      color: MUTE2
    });
    T("\u6E05\u6389\u7B5B\u9009\u548C\u641C\u7D22\u8BCD\u5C31\u56DE\u6765", 76, cy + 50, { f: `400 13px ${MONO}`, color: MUTE2 });
    rule(y1, LINE);
  }
  function drawTally() {
    const y = TALLY_Y;
    rule(y, LINE);
    const gap = 26;
    const w = (SAFE.x1 - SAFE.x0 - gap * 2) / 3;
    const first = state.all.reduce((a, b) => a.join < b.join ? a : b, state.all[0]);
    const cols = [
      ["\u663E\u793A", String(state.shown.length)],
      ["\u5728\u518C", String(state.all.length)],
      ["\u6700\u65E9\u5165\u961F", first ? first.join : "--"]
    ];
    cols.forEach(([k, v], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, y + 6, y + 74);
      T(k, x, y + 30, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, y + 70, { f: `500 26px ${MONO}`, color: PAPER });
    });
    const tally = ROLES.map((r) => `${r} ${state.all.filter((m) => m.role === r).length}`).join(" \xB7 ");
    T("\u89D2\u8272\u5206\u5E03", 60, y + 104, { f: `500 11px ${MONO}`, color: MUTE2 });
    T(tally, 60, y + 136, { f: `400 15px ${MONO}`, color: MUTE });
    rule(FOOT_Y, LINE);
  }
  function drawFooter() {
    const { rows } = rowLayout(state.shown.length);
    const over = state.shown.length - rows;
    T("\u6570\u636E\u5199\u6B7B\u5728 src/team.js \xB7 \u4E0D\u4E0A\u4F20 \xB7 \u4E0D\u8054\u7F51", 60, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE
    });
    T("TEAM-DIRECTORY", 930, 1428, { f: `400 14px ${MONO}`, color: MUTE2, a: "right" });
    T(over > 0 ? `\u8FD8\u6709 ${over} \u4EBA\u6CA1\u4E0A\u5361` : "\u793A\u4F8B\u540D\u5355\uFF0C\u6362\u6210\u81EA\u5DF1\u961F\u7684\u518D\u53D1", 60, 1458, {
      f: `400 13px ${MONO}`,
      color: over > 0 ? ACCENT : MUTE2
    });
    T("1080 \xD7 1920", 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: "right" });
  }
  var $ = (id) => document.getElementById(id);
  var elQ = $("q");
  var elRoles = $("roles");
  var elQHit = $("qHit");
  var elSTotal = $("sTotal");
  var elSShown = $("sShown");
  var elSRole = $("sRole");
  for (const r of ["\u5168\u90E8", ...ROLES]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.role = r;
    b.textContent = r;
    b.setAttribute("aria-pressed", String(r === state.role));
    b.addEventListener("click", () => setRole(r));
    elRoles.appendChild(b);
  }
  function setRole(r) {
    state.role = r;
    for (const b of elRoles.children) b.setAttribute("aria-pressed", String(b.dataset.role === r));
    apply();
  }
  function syncPanel() {
    elQHit.textContent = String(state.shown.length);
    elSTotal.textContent = String(state.all.length);
    elSShown.textContent = String(state.shown.length);
    elSRole.textContent = state.q.trim() ? `${state.role} + \u641C\u7D22` : state.role;
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
  $("ex1").addEventListener("click", () => exportOne(1080, 1920, "team-directory-1080x1920.png"));
  $("ex2").addEventListener("click", () => exportOne(1080, 1350, "team-directory-1080x1350.png"));
  apply();
  window.__app = {
    canvas: stage,
    getState: () => ({
      q: state.q,
      role: state.role,
      shown: state.shown.map((m) => m.name),
      total: state.all.length
    }),
    stats: () => ({
      q: state.q,
      role: state.role,
      shown: state.shown.length,
      total: state.all.length
    }),
    setQuery: (s) => {
      state.q = String(s);
      elQ.value = state.q;
      apply();
    },
    setRole,
    reset: () => {
      state.q = "";
      elQ.value = "";
      setRole("\u5168\u90E8");
    },
    selfTest: () => {
      const errs = [];
      if (state.all.length !== TEAM.length) errs.push("\u5728\u518C\u4EBA\u6570\u548C\u6570\u636E\u6E90\u4E0D\u4E00\u81F4");
      if (state.shown.length > state.all.length) errs.push("\u663E\u793A\u4EBA\u6570\u8D85\u8FC7\u5728\u518C\u4EBA\u6570");
      if (state.role !== "\u5168\u90E8" && state.shown.some((m) => m.role !== state.role)) {
        errs.push("\u7B5B\u9009\u7ED3\u679C\u91CC\u6DF7\u8FDB\u4E86\u522B\u7684\u89D2\u8272");
      }
      const q = state.q.trim().toLowerCase();
      if (q && state.shown.some((m) => !(m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q) || m.line.toLowerCase().includes(q)))) {
        errs.push("\u641C\u7D22\u7ED3\u679C\u91CC\u6DF7\u8FDB\u4E86\u4E0D\u542B\u5173\u952E\u8BCD\u7684\u4EBA");
      }
      if (stage.width !== 1080 || stage.height !== 1920) errs.push("\u753B\u5E03\u4E0D\u662F 1080\xD71920");
      return { ok: errs.length === 0, errs };
    },
    exportProbe,
    exportPNG: async () => (await rawBlob(1080, 1920)).size,
    exportCover: async () => (await rawBlob(1080, 1350)).size,
    inkPct: () => {
      const d = ctx.getImageData(SAFE.x0, SAFE.y0, SAFE.x1 - SAFE.x0, SAFE.y1 - SAFE.y0).data;
      let ink = 0, tot = 0;
      for (let i = 0; i < d.length; i += 4) {
        tot++;
        if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 24) ink++;
      }
      return +(ink / tot * 100).toFixed(2);
    }
  };
})();
