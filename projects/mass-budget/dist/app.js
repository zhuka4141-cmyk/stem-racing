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
    const ctx2 = c.getContext("2d");
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    const sw = src.width, sh = src.height;
    const scale = Math.max(outW / sw, outH / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx2.drawImage(src, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
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

  // src/plot.js
  var CHART = {
    ink: "#0b0b0c",
    paper: "#f2f0eb",
    accent: "#e8590c",
    grid: "rgba(242,240,235,0.10)",
    gridMajor: "rgba(242,240,235,0.20)",
    axis: "rgba(242,240,235,0.38)",
    label: "rgba(242,240,235,0.55)",
    mono: '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace',
    sans: '"IBM Plex Sans","Noto Sans SC","Microsoft YaHei",sans-serif'
  };

  // src/main.js
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var MONO = CHART.mono;
  var DISP = '"Barlow Condensed","Archivo Narrow","Oswald","Noto Sans SC",sans-serif';
  var ACCENT = CHART.accent;
  var INK = CHART.ink;
  var PAPER = CHART.paper;
  var F_PEAK = 21;
  var TRACK = 42;
  var LIMIT = 1.32;
  var COMP = [
    { key: "body", name: "\u8F66\u4F53", mass: 18, y: 0.15, z: 10, tag: "[TYPICAL]" },
    { key: "wheels", name: "\u8F66\u8F6E \xD74", mass: 9.5, y: 0, z: 11, tag: "[TYPICAL]" },
    { key: "axle", name: "\u8F6E\u8F74 \xD72", mass: 4.2, y: 0, z: 11, tag: "[TYPICAL]" },
    { key: "mech", name: "\u673A\u6784", mass: 19.3, y: -0.4, z: 14, tag: "[VERIFY]" }
  ];
  var BALLAST_INDEX = 3;
  var BAL = { mass: 14, y: 4, z: 8 };
  var state = { mass: BAL.mass, y: BAL.y, z: BAL.z };
  function parts(s = state) {
    const list = COMP.map((c) => ({ ...c }));
    list.splice(BALLAST_INDEX, 0, {
      key: "ballast",
      name: "\u914D\u91CD",
      mass: s.mass,
      y: s.y,
      z: s.z,
      tag: "[VERIFY]",
      movable: true
    });
    return list;
  }
  function budget(s = state) {
    const list = parts(s);
    const total = list.reduce((a, c) => a + c.mass, 0);
    const ycg = list.reduce((a, c) => a + c.mass * c.y, 0) / total;
    const zcg = list.reduce((a, c) => a + c.mass * c.z, 0) / total;
    const shares = list.map((c) => c.mass / total * 100);
    const contrib = list.map((c) => c.mass * c.y / total);
    const nL = 0.5 + ycg / TRACK;
    const nR = 0.5 - ycg / TRACK;
    return {
      list,
      total,
      ycg,
      zcg,
      shares,
      contrib,
      nL,
      nR,
      dNpct: Math.abs(nL - nR) * 100,
      yaw: F_PEAK * ycg,
      // 推力峰值时的偏航力矩 mN·m
      over: Math.abs(ycg) > LIMIT,
      margin: LIMIT - Math.abs(ycg),
      limit: LIMIT,
      track: TRACK,
      fPeak: F_PEAK
    };
  }
  var B = budget();
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var BAR = { x0: 320, w: 430, y: 534, h: 288, gap: 22 };
  var BAR_MAX = 34;
  var PIE = { cx: 246, cy: 976, r: 104 };
  var GAUGE = { cy: 1196, span: 34, half: 12 };
  var VERDICT = { y: 1356, h: 80 };
  var SLICE = [
    "rgba(242,240,235,0.92)",
    "rgba(242,240,235,0.70)",
    "rgba(242,240,235,0.50)",
    "rgba(242,240,235,0.30)",
    "rgba(242,240,235,0.16)"
  ];
  function compose() {
    B = budget();
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawHeader();
    drawBars();
    drawPie();
    drawLedger();
    drawGauge();
    drawLoadSplit();
    drawVerdict();
    drawBrand();
  }
  function drawHeader() {
    ctx.save();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, 296, 46, 3);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 17px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("MASS BUDGET \xB7 CHASSIS 02", SAFE.x0, 330);
    ctx.fillStyle = PAPER;
    ctx.font = `600 56px ${DISP}`;
    ctx.letterSpacing = "1px";
    ctx.fillText("\u8FD9 " + B.total.toFixed(1) + " \u514B\u90FD\u5728\u54EA\u513F", SAFE.x0, 402);
    ctx.fillStyle = "rgba(242,240,235,0.55)";
    ctx.font = `500 20px ${MONO}`;
    ctx.letterSpacing = "0px";
    ctx.fillText("\u632A\u4E00\u5757\u914D\u91CD\uFF0C\u91CD\u5FC3\u548C\u5DE6\u53F3\u8F6E\u8F7D\u8377\u7ACB\u523B\u8DDF\u7740\u52A8", SAFE.x0, 448);
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 486, SAFE.x1 - SAFE.x0, 1);
    ctx.restore();
  }
  function sectionLabel(y, left, right) {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(left, SAFE.x0, y);
    if (right) {
      ctx.letterSpacing = "0px";
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(242,240,235,0.32)";
      ctx.fillText(right, SAFE.x1, y);
    }
    ctx.restore();
  }
  function drawBars() {
    sectionLabel(518, "\u90E8\u4EF6\u8D28\u91CF", "\u5408\u8BA1 " + B.total.toFixed(1) + " g");
    const rowH = (BAR.h - BAR.gap * (B.list.length - 1)) / B.list.length;
    B.list.forEach((c, i) => {
      const y = BAR.y + i * (rowH + BAR.gap);
      const mid = y + rowH / 2;
      const isBallast = c.key === "ballast";
      ctx.save();
      ctx.font = `500 17px ${MONO}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      ctx.fillStyle = isBallast ? PAPER : CHART.label;
      ctx.fillText(c.name, BAR.x0 - 16, mid);
      ctx.fillStyle = "rgba(242,240,235,0.055)";
      ctx.fillRect(BAR.x0, y, BAR.w, rowH);
      const w = Math.max(2, c.mass / BAR_MAX * BAR.w);
      ctx.fillStyle = isBallast ? ACCENT : "rgba(242,240,235,0.34)";
      ctx.fillRect(BAR.x0, y, w, rowH);
      ctx.fillStyle = "rgba(11,11,12,0.45)";
      for (let g = 5; g <= BAR_MAX; g += 5) {
        const gx = BAR.x0 + g / BAR_MAX * BAR.w;
        if (gx < BAR.x0 + w) ctx.fillRect(gx, y, 1, rowH);
      }
      ctx.textAlign = "left";
      ctx.fillStyle = PAPER;
      ctx.font = `500 18px ${MONO}`;
      ctx.fillText(c.mass.toFixed(1) + " g", BAR.x0 + BAR.w + 16, mid);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(242,240,235,0.45)";
      ctx.font = `500 16px ${MONO}`;
      ctx.fillText(B.shares[i].toFixed(1) + "%", SAFE.x1, mid);
      ctx.restore();
    });
  }
  function drawPie() {
    sectionLabel(848, "\u8D28\u91CF\u5360\u6BD4", "\u5408\u8BA1 " + B.shares.reduce((a, b) => a + b, 0).toFixed(1) + "%");
    let a0 = -Math.PI / 2;
    B.shares.forEach((pct, i) => {
      const a1 = a0 + pct / 100 * Math.PI * 2;
      const isBallast = B.list[i].key === "ballast";
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PIE.cx, PIE.cy);
      ctx.arc(PIE.cx, PIE.cy, PIE.r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = isBallast ? ACCENT : SLICE[i % SLICE.length];
      ctx.fill();
      ctx.restore();
      a0 = a1;
    });
    a0 = -Math.PI / 2;
    B.shares.forEach((pct) => {
      ctx.save();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PIE.cx, PIE.cy);
      ctx.lineTo(PIE.cx + Math.cos(a0) * PIE.r, PIE.cy + Math.sin(a0) * PIE.r);
      ctx.stroke();
      ctx.restore();
      a0 += pct / 100 * Math.PI * 2;
    });
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(PIE.cx, PIE.cy, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.font = `600 40px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(B.total.toFixed(0), PIE.cx, PIE.cy - 8);
    ctx.fillStyle = "rgba(242,240,235,0.42)";
    ctx.font = `500 14px ${MONO}`;
    ctx.fillText("\u514B \xB7 \u603B\u8BA1", PIE.cx, PIE.cy + 24);
    ctx.restore();
    const lx = 404, ly0 = 916, dy = 34;
    B.list.forEach((c, i) => {
      const y = ly0 + i * dy;
      const isBallast = c.key === "ballast";
      ctx.save();
      ctx.fillStyle = isBallast ? ACCENT : SLICE[i % SLICE.length];
      ctx.fillRect(lx, y - 6, 18, 12);
      ctx.font = `500 16px ${MONO}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = isBallast ? PAPER : CHART.label;
      ctx.fillText(c.name, lx + 30, y);
      ctx.textAlign = "right";
      ctx.fillStyle = PAPER;
      ctx.fillText(c.mass.toFixed(1) + " g", lx + 330, y);
      ctx.fillStyle = "rgba(242,240,235,0.45)";
      ctx.fillText(B.shares[i].toFixed(1) + "%", SAFE.x1, y);
      ctx.restore();
    });
  }
  function drawLedger() {
    const y = 1108;
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, y - 22, SAFE.x1 - SAFE.x0, 1);
    ctx.font = `500 14px ${MONO}`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(242,240,235,0.38)";
    ctx.letterSpacing = "2px";
    ctx.fillText("\u8D26\u76EE\u5408\u8BA1", SAFE.x0, y);
    ctx.letterSpacing = "0px";
    ctx.font = `600 17px ${MONO}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(B.total.toFixed(1) + " g", SAFE.x0 + 108, y);
    ctx.font = `500 14px ${MONO}`;
    ctx.fillStyle = "rgba(242,240,235,0.38)";
    ctx.fillText("y_cg", SAFE.x0 + 232, y);
    ctx.font = `600 17px ${MONO}`;
    ctx.fillStyle = B.over ? ACCENT : PAPER;
    ctx.fillText((B.ycg >= 0 ? "+" : "") + B.ycg.toFixed(2) + " mm", SAFE.x0 + 296, y);
    ctx.font = `500 14px ${MONO}`;
    ctx.fillStyle = "rgba(242,240,235,0.38)";
    ctx.fillText("z_cg", SAFE.x0 + 500, y);
    ctx.font = `600 17px ${MONO}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(B.zcg.toFixed(2) + " mm", SAFE.x0 + 560, y);
    ctx.font = `500 14px ${MONO}`;
    ctx.fillStyle = "rgba(242,240,235,0.38)";
    ctx.textAlign = "right";
    ctx.fillText("5 \u4EF6 \xB7 \u8F6E\u8DDD 42 mm", SAFE.x1, y);
    ctx.restore();
  }
  function drawGauge() {
    const over = B.over;
    sectionLabel(1128, "\u6A2A\u5411\u91CD\u5FC3 y_cg \u2192 \u504F\u822A\u529B\u77E9", "\u4E34\u754C \xB1" + LIMIT.toFixed(2) + " mm");
    const cx = SAFE.x0 + (SAFE.x1 - SAFE.x0) / 2;
    const X = (mm) => cx + mm * GAUGE.span;
    const bandTop = GAUGE.cy - 42, bandH = 84;
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.045)";
    ctx.fillRect(X(-GAUGE.half), bandTop, X(GAUGE.half) - X(-GAUGE.half), bandH);
    ctx.fillStyle = "rgba(232,89,12,0.10)";
    ctx.fillRect(X(-LIMIT), bandTop, X(LIMIT) - X(-LIMIT), bandH);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(Math.round(X(-LIMIT)) + 0.5, bandTop);
    ctx.lineTo(Math.round(X(-LIMIT)) + 0.5, bandTop + bandH);
    ctx.moveTo(Math.round(X(LIMIT)) + 0.5, bandTop);
    ctx.lineTo(Math.round(X(LIMIT)) + 0.5, bandTop + bandH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(242,240,235,0.30)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(X(0)) + 0.5, bandTop - 8);
    ctx.lineTo(Math.round(X(0)) + 0.5, bandTop + bandH + 8);
    ctx.stroke();
    ctx.font = `500 14px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let mm = -12; mm <= 12; mm += 4) {
      const tx2 = X(mm);
      if (tx2 < SAFE.x0 + 12 || tx2 > SAFE.x1 - 12) continue;
      ctx.fillStyle = CHART.label;
      ctx.fillText(mm > 0 ? "+" + mm : String(mm), tx2, bandTop + bandH + 12);
      ctx.fillStyle = CHART.axis;
      ctx.fillRect(Math.round(tx2), bandTop + bandH, 1, 6);
    }
    ctx.restore();
    ctx.save();
    const px = X(B.ycg);
    ctx.fillStyle = over ? ACCENT : PAPER;
    ctx.fillRect(px - 7, bandTop - 12, 14, bandH + 24);
    ctx.fillStyle = INK;
    ctx.fillRect(px - 2, bandTop - 12, 4, bandH + 24);
    ctx.restore();
    ctx.save();
    ctx.font = `500 14px ${MONO}`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    let tx = SAFE.x0;
    B.list.forEach((c, i) => {
      const v = B.contrib[i];
      const s = c.name + " " + (v > 0 ? "+" : "") + v.toFixed(2);
      ctx.fillStyle = c.key === "ballast" ? PAPER : "rgba(242,240,235,0.45)";
      ctx.fillText(s, tx, 1252);
      tx += ctx.measureText(s).width + 18;
    });
    ctx.restore();
  }
  function drawLoadSplit() {
    sectionLabel(1278, "\u5DE6\u53F3\u8F6E\u6CD5\u5411\u529B", "\u8F7D\u8377\u5DEE " + B.dNpct.toFixed(1) + "%");
    const rows = [["\u5DE6\u8F6E N_L", B.nL], ["\u53F3\u8F6E N_R", B.nR]];
    const bx = SAFE.x0 + 150, bw = 470;
    rows.forEach(([label, f], i) => {
      const y = 1306 + i * 26;
      ctx.save();
      ctx.font = `500 15px ${MONO}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(242,240,235,0.55)";
      ctx.fillText(label, SAFE.x0, y);
      ctx.fillStyle = "rgba(242,240,235,0.055)";
      ctx.fillRect(bx, y - 8, bw, 16);
      ctx.fillStyle = "rgba(242,240,235,0.42)";
      ctx.fillRect(bx, y - 8, bw * f, 16);
      ctx.fillStyle = "rgba(242,240,235,0.5)";
      ctx.fillRect(bx + bw / 2, y - 12, 1, 24);
      ctx.textAlign = "right";
      ctx.fillStyle = PAPER;
      ctx.font = `500 16px ${MONO}`;
      ctx.fillText((f * 100).toFixed(2) + "%", SAFE.x1, y);
      ctx.restore();
    });
  }
  function drawVerdict() {
    const over = B.over;
    const { y, h } = VERDICT;
    ctx.save();
    if (over) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, h);
    } else {
      ctx.strokeStyle = "rgba(232,89,12,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(SAFE.x0 + 0.5, y + 0.5, SAFE.x1 - SAFE.x0 - 1, h - 1);
    }
    ctx.fillStyle = over ? INK : PAPER;
    ctx.font = `500 13px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(over ? "\u8D8A\u754C" : "\u5224\u5B9A", SAFE.x0 + 22, y + 28);
    ctx.letterSpacing = "0px";
    ctx.font = `600 34px ${MONO}`;
    ctx.fillText(
      over ? "\u8D85\u9650 " + (Math.abs(B.ycg) - LIMIT).toFixed(2) + " mm" : "\u5728 " + LIMIT.toFixed(2) + " mm \u4EE5\u5185 \xB7 \u4F59\u91CF " + B.margin.toFixed(2) + " mm",
      SAFE.x0 + 22,
      y + 64
    );
    ctx.textAlign = "right";
    ctx.font = `500 15px ${MONO}`;
    ctx.fillStyle = over ? "rgba(11,11,12,0.75)" : "rgba(242,240,235,0.5)";
    ctx.fillText("y_cg " + (B.ycg >= 0 ? "+" : "") + B.ycg.toFixed(2) + " mm", SAFE.x1 - 22, y + 28);
    ctx.fillText("\u529B\u77E9 " + B.yaw.toFixed(1) + " mN\xB7m", SAFE.x1 - 22, y + 56);
    ctx.restore();
  }
  function drawBrand() {
    ctx.save();
    ctx.fillStyle = "rgba(242,240,235,0.16)";
    ctx.fillRect(SAFE.x0, 1470, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = "rgba(242,240,235,0.5)";
    ctx.font = `500 14px ${MONO}`;
    ctx.letterSpacing = "2px";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("STEM RACING \xB7 EP.04", SAFE.x0, 1496);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.3)";
    ctx.letterSpacing = "0px";
    ctx.fillText("m y z \u5168\u90E8 [TYPICAL] / [VERIFY] \xB7 \u8FD8\u6CA1\u9010\u4EF6\u79F0\u8FC7", SAFE.x1, 1496);
    ctx.restore();
  }
  function sync() {
    B = budget();
    const el = (id) => document.getElementById(id);
    if (el("massOut")) el("massOut").textContent = state.mass.toFixed(0);
    if (el("yOut")) el("yOut").textContent = (state.y >= 0 ? "+" : "") + state.y.toFixed(1);
    if (el("zOut")) el("zOut").textContent = state.z.toFixed(0);
    compose();
  }
  function pushSliders() {
    for (const [id, k] of [["balMass", "mass"], ["balY", "y"], ["balZ", "z"]]) {
      const el = document.getElementById(id);
      if (el) el.value = String(state[k]);
    }
  }
  function bindSlider(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = String(state[key]);
    el.addEventListener("input", () => {
      state[key] = parseFloat(el.value);
      sync();
    });
  }
  bindSlider("balMass", "mass");
  bindSlider("balY", "y");
  bindSlider("balZ", "z");
  sync();
  function sweepY(from, to, n = 41) {
    const out = [];
    const keep = state.y;
    for (let i = 0; i < n; i++) {
      const y = from + (to - from) * i / (n - 1);
      const b = budget({ ...state, y });
      out.push({ y, ycg: b.ycg, over: b.over });
    }
    state.y = keep;
    return out;
  }
  var resetBtn = document.getElementById("reset");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    state.mass = BAL.mass;
    state.y = BAL.y;
    state.z = BAL.z;
    pushSliders();
    sync();
  });
  var exportBtn = document.getElementById("export");
  if (exportBtn) exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "\u5BFC\u51FA\u4E2D\u2026";
    try {
      compose();
      await new Promise((r) => setTimeout(r, 60));
      await window.__app.downloadAll();
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "\u5BFC\u51FA 9:16";
    }
  });
  var threshold = (v) => Math.abs(v) > LIMIT;
  window.__app = {
    canvas: stage,
    params: { F_PEAK, TRACK, LIMIT, COMP, BAL },
    budget: () => budget(),
    getMetrics: () => ({
      total: B.total,
      ycg: B.ycg,
      zcg: B.zcg,
      yaw: B.yaw,
      margin: B.margin,
      over: B.over,
      limit: B.limit,
      dNpct: B.dNpct,
      nL: B.nL,
      nR: B.nR,
      shares: B.shares.slice(),
      contrib: B.contrib.slice(),
      masses: B.list.map((c) => c.mass),
      names: B.list.map((c) => c.name)
    }),
    setBallast: (p) => {
      if (p.mass !== void 0) state.mass = p.mass;
      if (p.y !== void 0) state.y = p.y;
      if (p.z !== void 0) state.z = p.z;
      pushSliders();
      sync();
      return { ycg: B.ycg, over: B.over, yaw: B.yaw, margin: B.margin };
    },
    reset: () => {
      state.mass = BAL.mass;
      state.y = BAL.y;
      state.z = BAL.z;
      pushSliders();
      sync();
      return { ycg: B.ycg };
    },
    sweepY,
    selfTest: () => {
      const errs = [];
      const b = budget();
      const sum = b.shares.reduce((a, c) => a + c, 0);
      if (Math.abs(sum - 100) > 1e-6) errs.push("\u5360\u6BD4\u5408\u8BA1 " + sum.toFixed(6) + "%\uFF0C\u4E0D\u662F 100%");
      const msum = b.list.reduce((a, c) => a + c.mass, 0);
      if (Math.abs(msum - b.total) > 1e-9) errs.push("\u603B\u8D28\u91CF\u4E0E\u5206\u9879\u4E4B\u548C\u4E0D\u4E00\u81F4");
      const recompute = b.list.reduce((a, c) => a + c.mass * c.y, 0) / msum;
      if (Math.abs(recompute - b.ycg) > 1e-9) errs.push("y_cg \u4E0E\u52A0\u6743\u5E73\u5747\u4E0D\u7B26");
      const csum = b.contrib.reduce((a, c) => a + c, 0);
      if (Math.abs(csum - b.ycg) > 1e-9) errs.push("\u8D21\u732E\u5206\u89E3\u4E4B\u548C\u4E0E y_cg \u4E0D\u7B26");
      if (Math.abs(b.nL + b.nR - 1) > 1e-12) errs.push("\u5DE6\u53F3\u8F6E\u8F7D\u8377\u4E0D\u5B88\u6052");
      if (threshold(1.32)) errs.push("\u6070\u597D 1.32 mm \u4E0D\u8BE5\u62A5\u8B66");
      if (!threshold(1.33)) errs.push("1.33 mm \u5FC5\u987B\u62A5\u8B66");
      if (!threshold(-1.5)) errs.push("\u8D1F\u5411\u8D8A\u754C\u4E5F\u5FC5\u987B\u62A5\u8B66");
      const sw = sweepY(-8, 8, 33);
      for (let i = 1; i < sw.length; i++) {
        if (sw[i].ycg <= sw[i - 1].ycg) {
          errs.push("y_cg \u4E0D\u968F\u914D\u91CD\u6A2A\u79FB\u5355\u8C03\u53D8\u5316");
          break;
        }
      }
      const overCount = sw.filter((s) => s.over).length;
      const shouldOver = sw.filter((s) => Math.abs(s.ycg) > LIMIT).length;
      if (overCount !== shouldOver) errs.push("\u62A5\u8B66\u6570\u91CF\u548C\u5B9E\u9645\u8D8A\u754C\u6570\u91CF\u5BF9\u4E0D\u4E0A");
      if (b.zcg < 2 || b.zcg > 16) errs.push("z_cg \u8D85\u51FA\u90E8\u4EF6\u9AD8\u5EA6\u533A\u95F4\uFF1A" + b.zcg.toFixed(3));
      return { ok: errs.length === 0, errs };
    },
    exportPNG: async () => {
      compose();
      const b = await toPNG(stage, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      compose();
      const b = await toPNG(stage, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(stage, "mass-budget")
  };
  compose();
})();
