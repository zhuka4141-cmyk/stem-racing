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
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/main.js
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC","Microsoft YaHei",sans-serif';
  var ACCENT = "#e8590c";
  var INK = "#0b0b0c";
  var INK2 = "#151517";
  var PAPER = "#f2f0eb";
  var LINE = "rgba(255,255,255,0.14)";
  var LINE_SOFT = "rgba(255,255,255,0.075)";
  var MUTE = "rgba(242,240,235,0.55)";
  var MUTE2 = "rgba(242,240,235,0.32)";
  var ZEBRA = "rgba(242,240,235,0.07)";
  var SLOTS = 8;
  var STRIP_Y = 412;
  var LANE_Y0 = 500;
  var LANE_Y1 = 1220;
  var LANE_H = (LANE_Y1 - LANE_Y0) / SLOTS;
  var RESULT_Y = LANE_Y1;
  var FOOT_Y = 1394;
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var state = {
    seed: 12648430,
    consent: false,
    // 甲乙丙丁是占位符，不是真人；真名由使用者在面板里自己填
    names: ["\u7532", "\u4E59", "\u4E19", "\u4E01", "\u620A", "\u5DF1", "\u5E9A", "\u8F9B"],
    crops: [],
    // 只存裁好的 256x256 离屏 canvas，不存 Image / File
    slots: [],
    results: null,
    heat: 1,
    objectUrlCreated: 0,
    objectUrlRevoked: 0,
    blockedRuns: 0
  };
  function T(str, x, y, { f = `500 16px ${MONO}`, color = PAPER, a = "left" } = {}) {
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textAlign = a;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  }
  function rule(y, color = LINE_SOFT, x0 = SAFE.x0, x1 = SAFE.x1) {
    ctx.fillStyle = color;
    ctx.fillRect(x0, y, x1 - x0, 1);
  }
  function vrule(x, y0, y1, color = LINE_SOFT) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y0, 1, y1 - y0);
  }
  var pad2 = (n) => String(n).padStart(2, "0");
  var fmt = (t) => t == null ? "--.---" : t.toFixed(3);
  var hex6 = (n) => "0x" + n.toString(16).toUpperCase().padStart(6, "0");
  function rebuild() {
    const names = state.names;
    const count = Math.min(SLOTS, Math.max(names.length, state.crops.length, 1));
    const slots = [];
    for (let i = 0; i < SLOTS; i++) {
      if (i >= count) {
        slots.push({ kind: "empty" });
        continue;
      }
      const name = (names[i] || "").trim() || `P${pad2(i + 1)}`;
      if (i < state.crops.length) slots.push({ kind: "photo", crop: state.crops[i], name });
      else slots.push({ kind: "block", name });
    }
    state.slots = slots;
    state.results = null;
    compose();
    syncPanel();
  }
  function race() {
    if (!state.consent) {
      state.blockedRuns++;
      syncPanel();
      return false;
    }
    const rand = mulberry32(state.seed);
    const rows = [];
    for (let i = 0; i < SLOTS; i++) {
      const s = state.slots[i];
      if (!s || s.kind === "empty") continue;
      const t = 1.12 + (rand() - 0.5) * 0.18 + rand() * 0.07;
      rows.push({ i, t, name: s.name });
    }
    if (!rows.length) return false;
    const order = [...rows].sort((a, b) => a.t - b.t);
    order.forEach((r, k) => {
      r.rank = k + 1;
    });
    const tMin = order[0].t;
    const tMax = order[order.length - 1].t;
    const span = tMax - tMin;
    for (const r of rows) {
      r.prog = span < 1e-6 ? 1 : 0.15 + (1 - (r.t - tMin) / span) * 0.85;
    }
    const bySlot = new Array(SLOTS).fill(null);
    for (const r of rows) bySlot[r.i] = r;
    state.results = { rows: bySlot, winner: order[0] };
    state.heat++;
    compose();
    syncPanel();
    return true;
  }
  function hatch(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = 1;
    for (let i = -h; i < w + h; i += 11) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawAvatar(cx, cy, r, slot) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (slot.kind === "photo") {
      ctx.drawImage(slot.crop, cx - r, cy - r, r * 2, r * 2);
    } else if (slot.kind === "block") {
      ctx.fillStyle = INK2;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const ch = [...slot.name][0] || "?";
      T(ch.toUpperCase(), cx, cy + 1, { f: `700 26px ${MONO}`, color: PAPER, a: "center" });
    } else {
      ctx.fillStyle = "rgba(242,240,235,0.04)";
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      hatch(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.strokeStyle = slot.kind === "empty" ? "rgba(255,255,255,0.16)" : "rgba(242,240,235,0.32)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  function compose() {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawTopBand();
    drawHeader();
    drawStrip();
    drawLanes();
    drawResult();
    drawFooter();
  }
  function drawTopBand() {
    rule(104, LINE_SOFT);
    T("RACE SHEET", 60, 136, { f: `500 13px ${MONO}`, color: MUTE2 });
    T("\u672C\u673A\u6E32\u67D3 \xB7 \u65E0\u7F51\u7EDC", 930, 136, { f: `500 13px ${MONO}`, color: MUTE2, a: "right" });
    ctx.fillStyle = "rgba(242,240,235,0.055)";
    ctx.font = `700 150px ${DISP}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(state.heat).padStart(2, "0"), 872, 236);
    T("HEAT", 930, 236, { f: `500 12px ${MONO}`, color: MUTE2, a: "right" });
  }
  function drawHeader() {
    rule(SAFE.y0, LINE);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, SAFE.y0, 46, 3);
    T("STEM RACING", 60, 276, { f: `500 14px ${MONO}`, color: MUTE });
    T("\u672C\u673A\u6E32\u67D3 \xB7 \u65E0\u7F51\u7EDC", 930, 276, { f: `500 14px ${MONO}`, color: MUTE, a: "right" });
    T("\u8D77\u8DD1\u7EBF", 60, 352, { f: `600 66px ${DISP}`, color: PAPER });
    T("\u7167\u7247\u53EA\u5728\u8FD9\u53F0\u673A\u5668\u4E0A\uFF0C\u5237\u65B0\u5C31\u6CA1\u4E86", 60, 392, { f: `400 17px ${MONO}`, color: MUTE });
    T("\u9053 / LANES", 930, 288, { f: `500 11px ${MONO}`, color: MUTE2, a: "right" });
    T(pad2(SLOTS), 930, 368, { f: `600 68px ${DISP}`, color: PAPER, a: "right" });
  }
  function drawStrip() {
    rule(STRIP_Y, LINE);
    const cols = [
      ["\u8D5B\u4E8B", "\u6821\u5185\u6D4B\u8BD5 #4"],
      ["\u8D5B\u9053", "20 m \u76F4\u7EBF"],
      ["\u7528\u65F6\u6765\u6E90", "\u4F2A\u968F\u673A \xB7 \u53EF\u590D\u73B0"]
    ];
    const gap = 26;
    const w = (SAFE.x1 - SAFE.x0 - gap * (cols.length - 1)) / cols.length;
    cols.forEach(([k, v], i) => {
      const x = SAFE.x0 + i * (w + gap);
      if (i > 0) vrule(x - gap / 2, STRIP_Y + 6, 486);
      T(k, x, 442, { f: `500 11px ${MONO}`, color: MUTE2 });
      T(v, x, 476, { f: `500 21px ${MONO}`, color: PAPER });
    });
    rule(486, LINE_SOFT);
  }
  function drawLanes() {
    for (let i = 0; i < SLOTS; i++) {
      const y = LANE_Y0 + i * LANE_H;
      const slot = state.slots[i] || { kind: "empty" };
      if (i % 2 === 1) {
        ctx.fillStyle = ZEBRA;
        ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, LANE_H);
      }
      rule(y, LINE_SOFT);
      drawAvatar(92, y + 44, 28, slot);
      const res = state.results ? state.results.rows[i] : null;
      if (slot.kind === "empty") {
        T("\u7A7A\u4F4D", 138, y + 48, { f: `500 14px ${MONO}`, color: MUTE2 });
        T("--.---", 930, y + 39, { f: `500 22px ${MONO}`, color: MUTE2, a: "right" });
        continue;
      }
      T(slot.name, 138, y + 39, { f: `600 23px ${MONO}`, color: PAPER });
      T(slot.kind === "photo" ? "\u672C\u673A\u7167\u7247" : "\u8272\u5757", 138, y + 58, {
        f: `400 11.5px ${MONO}`,
        color: MUTE2
      });
      T(res ? fmt(res.t) : "--.---", 930, y + 39, {
        f: `500 22px ${MONO}`,
        color: res ? PAPER : MUTE2,
        a: "right"
      });
      T(res ? `P${res.rank}` : "\u5F85\u53D1\u8F66", 930, y + 58, {
        f: `500 11.5px ${MONO}`,
        color: res && res.rank === 1 ? ACCENT : MUTE2,
        a: "right"
      });
      const bx = 138, bw = SAFE.x1 - bx, by = y + 72;
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(bx, by, bw, 6);
      if (res) {
        ctx.fillStyle = res.rank === 1 ? ACCENT : "rgba(242,240,235,0.55)";
        ctx.fillRect(bx, by, Math.max(6, bw * res.prog), 6);
      }
    }
    rule(LANE_Y1, LINE);
  }
  function drawResult() {
    const w = state.results && state.results.winner;
    const y = RESULT_Y;
    vrule(590, y + 22, y + 150);
    T("WINNER", 60, y + 38, { f: `500 11px ${MONO}`, color: MUTE2 });
    if (w) {
      T(w.name, 60, y + 78, { f: `600 44px ${DISP}`, color: PAPER });
      T(fmt(w.t), 60, y + 118, { f: `600 34px ${MONO}`, color: ACCENT });
      ctx.font = `600 34px ${MONO}`;
      const tw = ctx.measureText(fmt(w.t)).width;
      T("s", 60 + tw + 8, y + 118, { f: `500 15px ${MONO}`, color: MUTE2 });
    } else {
      T("\u5F85\u53D1\u8F66", 60, y + 78, { f: `600 44px ${DISP}`, color: MUTE2 });
      T("--.---", 60, y + 118, { f: `600 34px ${MONO}`, color: MUTE2 });
    }
    T("20 m \u76F4\u7EBF", 60, y + 148, { f: `400 12px ${MONO}`, color: MUTE2 });
    const rx = SAFE.x1;
    T("SEED", rx, y + 38, { f: `500 11px ${MONO}`, color: MUTE2, a: "right" });
    T(hex6(state.seed), rx, y + 70, { f: `500 21px ${MONO}`, color: PAPER, a: "right" });
    T("\u5224\u5B9A", rx, y + 102, { f: `500 11px ${MONO}`, color: MUTE2, a: "right" });
    T("\u56FA\u5B9A\u79CD\u5B50", rx, y + 130, { f: `500 21px ${MONO}`, color: PAPER, a: "right" });
    T("\u540D\u6B21\u7531\u79CD\u5B50\u51B3\u5B9A\uFF0C\u4E0D\u662F\u5B9E\u6D4B", rx, y + 152, {
      f: `400 11.5px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
  }
  function drawFooter() {
    rule(FOOT_Y, LINE);
    T("\u5185\u5B58\u5185\u5904\u7406 \xB7 \u4E0D\u4E0A\u4F20 \xB7 \u4E0D\u5199\u76D8 \xB7 \u5237\u65B0\u5373\u5931\u6548", 60, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE
    });
    T("CONSENT-AVATAR-RACE", 930, 1428, {
      f: `400 14px ${MONO}`,
      color: MUTE2,
      a: "right"
    });
    T("\u7248\u5F0F\u6CBF\u7528\u961F\u5185\u8BA1\u65F6\u8868", 60, 1458, { f: `400 13px ${MONO}`, color: MUTE2 });
    T("1080 \xD7 1920", 930, 1458, { f: `400 13px ${MONO}`, color: MUTE2, a: "right" });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("decode failed"));
      im.src = url;
    });
  }
  function cropSquare(img, size = 256) {
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const c = cv.getContext("2d");
    const iw = img.naturalWidth || size;
    const ih = img.naturalHeight || size;
    const s = Math.min(iw, ih);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, 0, 0, size, size);
    return cv;
  }
  var loadError = false;
  async function addFiles(fileList) {
    loadError = false;
    const files = [...fileList].filter((f) => String(f.type).startsWith("image/"));
    for (const f of files) {
      if (state.crops.length >= SLOTS) break;
      const url = URL.createObjectURL(f);
      state.objectUrlCreated++;
      try {
        const img = await loadImage(url);
        state.crops.push(cropSquare(img, 256));
      } catch {
        loadError = true;
      } finally {
        URL.revokeObjectURL(url);
        state.objectUrlRevoked++;
      }
    }
    rebuild();
  }
  var $ = (id) => document.getElementById(id);
  var elConsent = $("consent");
  var elFile = $("file");
  var elNames = $("names");
  var elRace = $("race");
  var elClear = $("clear");
  var elReseed = $("reseed");
  var elSeedOut = $("seedOut");
  var elPhotoN = $("photoN");
  var elSMade = $("sMade");
  var elSRev = $("sRevoked");
  var elSBlocked = $("sBlocked");
  function syncPanel() {
    elRace.disabled = !state.consent;
    elSeedOut.textContent = hex6(state.seed);
    elPhotoN.textContent = loadError ? `${state.crops.length} / ${SLOTS} \u6709\u6587\u4EF6\u6CA1\u89E3\u7801` : `${state.crops.length} / ${SLOTS}`;
    elSMade.textContent = String(state.objectUrlCreated);
    elSRev.textContent = String(state.objectUrlRevoked);
    elSBlocked.textContent = String(state.blockedRuns);
  }
  function parseNames(text) {
    return text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, SLOTS);
  }
  function applyConsent(on) {
    state.consent = !!on;
    elConsent.checked = state.consent;
    if (!state.consent && state.results) {
      state.results = null;
      compose();
    }
    syncPanel();
  }
  elConsent.addEventListener("change", () => applyConsent(elConsent.checked));
  elFile.addEventListener("change", () => {
    addFiles(elFile.files);
  });
  elClear.addEventListener("click", () => {
    state.crops = [];
    state.results = null;
    elFile.value = "";
    rebuild();
  });
  elNames.addEventListener("input", () => {
    state.names = parseNames(elNames.value);
    rebuild();
  });
  elReseed.addEventListener("click", () => {
    state.seed = state.seed * 1664525 + 1013904223 >>> 0;
    state.results = null;
    compose();
    syncPanel();
  });
  elRace.addEventListener("click", () => {
    race();
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
  $("ex1").addEventListener("click", () => exportOne(1080, 1920, "consent-race-1080x1920.png"));
  $("ex2").addEventListener("click", () => exportOne(1080, 1350, "consent-race-1080x1350.png"));
  elNames.value = state.names.join("\n");
  rebuild();
  syncPanel();
  window.__app = {
    canvas: stage,
    getState: () => ({
      seed: state.seed,
      heat: state.heat,
      consent: state.consent,
      names: state.names.slice(),
      results: state.results ? state.results.rows.filter(Boolean).map((r) => ({ name: r.name, t: r.t, rank: r.rank })) : null
    }),
    stats: () => ({
      photos: state.crops.length,
      objectUrlCreated: state.objectUrlCreated,
      objectUrlRevoked: state.objectUrlRevoked,
      blockedRuns: state.blockedRuns,
      consent: state.consent,
      hasResults: !!state.results,
      slotsFilled: state.slots.filter((s) => s.kind !== "empty").length
    }),
    setConsent: applyConsent,
    setSeed: (n) => {
      state.seed = n >>> 0;
      state.results = null;
      compose();
      syncPanel();
    },
    race,
    clearPhotos: () => elClear.click(),
    selfTest: () => {
      const errs = [];
      if (state.slots.length !== SLOTS) errs.push("\u69FD\u4F4D\u6570\u4E0D\u662F 8");
      if (state.objectUrlCreated !== state.objectUrlRevoked) {
        errs.push(`blob URL \u672A\u56DE\u6536 ${state.objectUrlCreated} \u5EFA / ${state.objectUrlRevoked} \u6536`);
      }
      if (!state.consent && state.results) errs.push("\u672A\u52FE\u540C\u610F\u5374\u51FA\u4E86\u6210\u7EE9");
      if (!state.slots.some((s) => s.kind !== "empty")) errs.push("\u6CA1\u6709\u53EF\u53D1\u7684\u8F66");
      return { ok: errs.length === 0, errs };
    },
    exportProbe,
    exportPNG: async () => (await rawBlob(1080, 1920)).size,
    exportCover: async () => (await rawBlob(1080, 1350)).size,
    rawSize: async (w, h) => (await rawBlob(w, h)).size
  };
})();
