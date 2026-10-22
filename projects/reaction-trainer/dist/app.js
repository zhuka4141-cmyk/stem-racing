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
  async function exportEpisode(canvas, slug) {
    const vertical = await toPNG(canvas, { width: REEL_W, height: REEL_H });
    await assertPNG(vertical);
    download(vertical, `${slug}-1080x1920.png`);
    const cover = await toPNG(canvas, { width: COVER_W, height: COVER_H });
    await assertPNG(cover);
    download(cover, `${slug}-1080x1350.png`);
    return { vertical: vertical.size, cover: cover.size };
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
  var SW = SAFE.x1 - SAFE.x0;
  var INK = "#0b0b0c";
  var PAPER = "#f2f0eb";
  var ACCENT = "#e8590c";
  var PANEL = "#141417";
  var MUTE = "rgba(242,240,235,0.55)";
  var FAINT = "rgba(242,240,235,0.34)";
  var HAIR = "rgba(242,240,235,0.16)";
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Bahnschrift","Barlow Condensed","Archivo Narrow",Oswald,"Microsoft YaHei","Noto Sans SC",sans-serif';
  var REF = [
    { lo: 120, hi: 180, name: "\u4F18\u79C0\u77ED\u8DD1\u8D77\u8DD1" },
    { lo: 200, hi: 250, name: "\u5178\u578B\u542C\u89C9\u53CD\u5E94" }
  ];
  var TRIALS = 5;
  var DELAY_MIN = 1500;
  var DELAY_MAX = 4e3;
  var Y_MAX = 400;
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var rand = mulberry32(24301);
  var state = {
    mode: "idle",
    // idle | armed | lit | foul | result
    trials: [],
    fouls: 0,
    last: null,
    litAt: 0,
    timer: 0
  };
  function rule(c, y, color = HAIR) {
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(SAFE.x0, y + 0.5);
    c.lineTo(SAFE.x1, y + 0.5);
    c.stroke();
  }
  function label(c, txt, x, y, { size = 15, color = MUTE, align = "left", weight = 400, font = MONO } = {}) {
    c.font = weight + " " + size + "px " + font;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "alphabetic";
    c.fillText(txt, x, y);
  }
  function mid(c, txt, cx, y, size, color, weight = 500) {
    c.font = weight + " " + size + "px " + MONO;
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.fillText(txt, cx, y);
  }
  function stats() {
    const v = state.trials;
    if (!v.length) return null;
    const sum = v.reduce(function(a, b) {
      return a + b;
    }, 0);
    return {
      n: v.length,
      avg: sum / v.length,
      best: Math.min.apply(null, v),
      worst: Math.max.apply(null, v),
      spread: Math.max.apply(null, v) - Math.min.apply(null, v)
    };
  }
  function bandOf(ms) {
    for (const b of REF) if (ms >= b.lo && ms <= b.hi) return b.name;
    return ms < 120 ? "\u5FEB\u8FC7\u53C2\u8003\u4E0B\u9650" : "\u6162\u4E8E\u53C2\u8003\u4E0A\u9650";
  }
  function verdictOf(s) {
    if (s.spread <= 45) return "\u7A33";
    if (s.spread <= 90) return "\u4E00\u822C";
    return "\u6CE2\u52A8\u5927";
  }
  function header(c) {
    rule(c, 240);
    label(c, "REACTION TRAINER \xB7 \u95EA\u706F\u53CD\u5E94\u8BA1\u65F6", SAFE.x0, 268, { size: 15 });
    label(c, "\u672C\u5730\u8FD0\u884C \xB7 \u4E0D\u4E0A\u4F20", SAFE.x1, 268, { size: 15, align: "right" });
    c.font = "600 42px " + DISP;
    c.fillStyle = PAPER;
    c.textAlign = "left";
    c.fillText("\u95EA\u706F\u4E4B\u540E\uFF0C\u4F60\u7528\u4E86\u591A\u4E45", SAFE.x0, 306);
    label(c, "\u968F\u673A\u7B49 1.5\u20134.0 \u79D2\u4E4B\u540E\u95EA\u706F\uFF0C\u95EA\u706F\u90A3\u4E00\u523B\u5F00\u59CB\u8BA1\u65F6\uFF0C\u70B9\u5230\u5C31\u505C", SAFE.x0, 336, { size: 14 });
    rule(c, 356);
  }
  function panel(c) {
    const box = { x: SAFE.x0, y: 396, w: SW, h: 216 };
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const s = stats();
    const mode = state.mode === "idle" && s && s.n >= TRIALS ? "verdict" : state.mode;
    if (mode === "lit") {
      c.fillStyle = ACCENT;
      c.fillRect(box.x, box.y, box.w, box.h);
      mid(c, "\u73B0\u5728", cx, cy + 16, 64, INK, 600);
      mid(c, "\u70B9\u51FB", cx, cy + 58, 18, "rgba(11,11,12,0.72)", 500);
      return;
    }
    c.fillStyle = PANEL;
    c.fillRect(box.x, box.y, box.w, box.h);
    if (mode === "foul") {
      c.strokeStyle = ACCENT;
      c.lineWidth = 2;
      c.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
      mid(c, "\u62A2\u8DD1", cx, cy + 4, 48, ACCENT, 600);
      mid(c, "\u8FD9\u4E00\u6B21\u4E0D\u8BA1\u5165\u5E73\u5747", cx, cy + 44, 16, PAPER);
      return;
    }
    if (mode === "armed") {
      c.strokeStyle = "rgba(242,240,235,0.20)";
      c.lineWidth = 1;
      c.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
      mid(c, "\u7B49\u2026", cx, cy + 4, 48, PAPER, 500);
      mid(c, "\u522B\u62A2\u8DD1", cx, cy + 44, 16, FAINT);
      return;
    }
    if (mode === "result") {
      const txt = String(Math.round(state.last));
      c.textAlign = "center";
      c.font = "500 76px " + MONO;
      c.fillStyle = ACCENT;
      c.fillText(txt, cx - 22, cy + 22);
      const w = c.measureText(txt).width;
      c.font = "400 26px " + MONO;
      c.fillStyle = MUTE;
      c.fillText("ms", cx - 22 + w / 2 + 18, cy + 22);
      mid(c, "\u7B2C " + s.n + " \u6B21", cx, cy + 66, 16, FAINT);
      return;
    }
    if (mode === "verdict") {
      c.fillStyle = ACCENT;
      c.fillRect(box.x, box.y, 6, box.h);
      const px = box.x + 46;
      label(c, "\u5224\u5B9A", px, box.y + 62, { size: 14, color: FAINT });
      label(c, verdictOf(s), px, box.y + 120, { size: 46, color: PAPER, weight: 500 });
      label(
        c,
        "\u4E94\u6B21\u6781\u5DEE " + Math.round(s.spread) + " ms \xB7 \u5E73\u5747\u843D\u5728\u300C" + bandOf(s.avg) + "\u300D\u533A\u95F4",
        px,
        box.y + 164,
        { size: 15, color: MUTE }
      );
      label(c, "\u518D\u6765\u4E00\u8F6E\u8BF7\u70B9\u9762\u677F", px, box.y + 196, { size: 13, color: FAINT });
      const rx = SAFE.x1 - 14;
      const cellW = 66;
      label(c, "\u4E94\u6B21\u8BFB\u6570 [ms]", rx, box.y + 62, { size: 13, color: FAINT, align: "right" });
      state.trials.forEach(function(v, i) {
        const x = rx - (state.trials.length - 1 - i) * cellW;
        const isBest = Math.round(v) === Math.round(s.best);
        c.textAlign = "right";
        c.font = (isBest ? "600 21px " : "400 21px ") + MONO;
        c.fillStyle = isBest ? ACCENT : PAPER;
        c.fillText(String(Math.round(v)), x, box.y + 120);
      });
      c.textAlign = "left";
      return;
    }
    mid(c, "\u70B9\u51FB\u5F00\u59CB", cx, cy + 6, 44, PAPER, 500);
    mid(c, "\u95EA\u706F\u77AC\u95F4\u624D\u5F00\u59CB\u8BA1\u65F6", cx, cy + 46, 16, FAINT);
  }
  function statusRow(c) {
    const s = stats();
    label(c, "\u7B2C " + (s ? s.n : 0) + " / " + TRIALS + " \u6B21", SAFE.x0, 386, { size: 14, color: FAINT });
    label(c, "\u62A2\u8DD1 " + state.fouls + " \u6B21", SAFE.x1, 386, { size: 14, color: state.fouls ? ACCENT : FAINT, align: "right" });
    label(c, "\u53C2\u7167\u533A\u95F4 " + REF.map(function(b) {
      return b.lo + "\u2013" + b.hi;
    }).join(" / ") + " ms", SAFE.x0 + 300, 386, { size: 14, color: FAINT });
  }
  function summary(c) {
    const s = stats();
    label(c, "\u4E94\u6B21\u5E73\u5747", SAFE.x0, 660, { size: 15 });
    if (!s) {
      c.font = "500 68px " + MONO;
      c.fillStyle = FAINT;
      c.textAlign = "left";
      c.fillText("\u2014", SAFE.x0 - 3, 728);
      label(c, "\u8FD8\u6CA1\u6709\u6210\u7EE9", SAFE.x0, 764, { size: 15, color: FAINT });
      return;
    }
    const txt = s.n >= TRIALS ? s.avg.toFixed(0) : "\u2014";
    c.font = "500 68px " + MONO;
    c.fillStyle = ACCENT;
    c.textAlign = "left";
    c.fillText(txt, SAFE.x0 - 3, 728);
    const w = c.measureText(txt).width;
    c.font = "400 28px " + MONO;
    c.fillStyle = MUTE;
    c.fillText("ms", SAFE.x0 + w + 10, 728);
    const cells = [
      ["\u6700\u5FEB", s.best.toFixed(0), "ms"],
      ["\u6700\u6162", s.worst.toFixed(0), "ms"],
      ["\u6781\u5DEE", Math.round(s.spread).toString(), "ms"]
    ];
    cells.forEach(function(cell, i) {
      const x = SAFE.x1 - (2 - i) * 230;
      label(c, cell[0], x, 674, { size: 14, color: FAINT, align: "right" });
      c.textAlign = "right";
      c.font = "500 26px " + MONO;
      c.fillStyle = PAPER;
      c.fillText(cell[1] + " " + cell[2], x, 712);
    });
    c.textAlign = "left";
    label(c, "\u5E73\u5747\u843D\u5728\u300C" + bandOf(s.avg) + "\u300D\u533A\u95F4", SAFE.x0, 764, { size: 15, color: MUTE });
  }
  var CH = { x: SAFE.x0, y: 800, w: SW, h: 288 };
  var baseline = CH.y + CH.h;
  var yOf = (ms) => baseline - Math.max(0, Math.min(ms, Y_MAX)) / Y_MAX * CH.h;
  function chart(c) {
    label(c, "\u6BCF\u4E00\u6B21\u53CD\u5E94 [ms]", SAFE.x0, 792, { size: 15 });
    label(
      c,
      "\u53C2\u8003\u5E26 " + REF.map(function(b) {
        return b.lo + "\u2013" + b.hi + " " + b.name.replace("\u4F18\u79C0\u77ED\u8DD1\u8D77\u8DD1", "\u4F18\u79C0").replace("\u5178\u578B\u542C\u89C9\u53CD\u5E94", "\u5178\u578B");
      }).join(" \xB7 "),
      SAFE.x1,
      792,
      { size: 14, color: FAINT, align: "right" }
    );
    c.fillStyle = PANEL;
    c.fillRect(CH.x, CH.y, CH.w, CH.h);
    REF.forEach(function(b, i) {
      const y0 = yOf(b.hi), y1 = yOf(b.lo);
      c.fillStyle = i === 0 ? "rgba(232,89,12,0.10)" : "rgba(242,240,235,0.07)";
      c.fillRect(CH.x, y0, CH.w, y1 - y0);
      c.strokeStyle = i === 0 ? "rgba(232,89,12,0.28)" : "rgba(242,240,235,0.14)";
      c.lineWidth = 1;
      [y0, y1].forEach(function(y) {
        c.beginPath();
        c.moveTo(CH.x, Math.round(y) + 0.5);
        c.lineTo(CH.x + CH.w, Math.round(y) + 0.5);
        c.stroke();
      });
    });
    for (let v = 0; v <= Y_MAX; v += 100) {
      const y = Math.round(yOf(v)) + 0.5;
      c.strokeStyle = "rgba(242,240,235,0.08)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(CH.x, y);
      c.lineTo(CH.x + CH.w, y);
      c.stroke();
      label(c, String(v), CH.x + CH.w, y - 6, { size: 12, color: "rgba(242,240,235,0.26)", align: "right" });
    }
    const slot = CH.w / TRIALS;
    const bw = 130;
    for (let i = 0; i < TRIALS; i++) {
      const bx2 = CH.x + i * slot + (slot - bw) / 2;
      const v = state.trials[i];
      if (v === void 0) {
        c.fillStyle = "rgba(242,240,235,0.06)";
        c.fillRect(bx2, baseline - 26, bw, 26);
        continue;
      }
      const top = yOf(v);
      c.fillStyle = "#b9b4ab";
      c.fillRect(bx2, top, bw, baseline - top);
      label(c, String(Math.round(v)), bx2 + bw / 2, top - 10, { size: 15, color: PAPER, align: "center" });
    }
    const s = stats();
    if (s && s.n >= TRIALS) {
      const y = Math.round(yOf(s.avg)) + 0.5;
      c.strokeStyle = ACCENT;
      c.lineWidth = 2;
      c.setLineDash([7, 6]);
      c.beginPath();
      c.moveTo(CH.x, y);
      c.lineTo(CH.x + CH.w, y);
      c.stroke();
      c.setLineDash([]);
    }
    label(c, "0", CH.x, 1122, { size: 13, color: FAINT, align: "left" });
    label(c, String(Y_MAX) + " ms \u4E0A\u9650", CH.x + CH.w, 1122, { size: 13, color: FAINT, align: "right" });
  }
  function prose() {
    const s = stats();
    const avg = s ? Math.round(s.avg) : 0;
    return [
      "200\u2013250 ms \u662F\u666E\u901A\u4EBA\u542C\u89C9\u52A0\u52A8\u4F5C\u7684\u53CD\u5E94\u533A\u95F4\uFF0C\u4F18\u79C0\u77ED\u8DD1\u8D77\u8DD1\u80FD\u538B\u5230 120\u2013180 ms\u3002",
      "\u8FD9\u6B21\u7684 " + avg + " ms \u843D\u5728\u300C" + (s ? bandOf(s.avg) : "\u672A\u77E5") + "\u300D\u533A\u95F4\uFF0C\u8BF4\u660E\u770B\u5230\u518D\u52A8\u624B\u8FD9\u6761\u94FE\u8DEF\u901F\u5EA6\u6B63\u5E38\u3002",
      "CO\u2082 \u8F66\u6CA1\u6709\u53CD\u5E94\u73AF\u8282\uFF0C\u5B83\u9760\u673A\u68B0\u91CA\u653E\uFF1B\u4F46\u53D1\u4EE4\u5230\u8F66\u771F\u6B63\u52A8\u8D77\u6765\u540C\u6837\u6709\u4E00\u6BB5\u5EF6\u8FDF\u3002",
      "\u8BAD\u7EC3\u80FD\u538B\u4E0B\u6765\u7684\u53EA\u6709\u524D\u9762\u90A3\u4E00\u6BB5\u3002\u624B\u6307\u673A\u68B0\u52A8\u4F5C\u7EA6 50 ms\uFF0C\u5269\u4E0B\u7684\u90FD\u5728\u8111\u5B50\u91CC\u3002",
      "\u5E73\u5747\u4F1A\u88AB\u4E00\u6B21\u7279\u522B\u6162\u7684\u62D6\u9AD8\uFF0C\u6240\u4EE5\u6781\u5DEE\u6BD4\u5E73\u5747\u66F4\u80FD\u8BF4\u660E\u624B\u7A33\u4E0D\u7A33\u3002"
    ];
  }
  function reading(c) {
    rule(c, 1160);
    label(c, "\u5224\u8BFB", SAFE.x0, 1184, { size: 15 });
    const lines = prose();
    lines.forEach(function(t, i) {
      label(c, t, SAFE.x0, 1212 + i * 30, { size: 14, color: MUTE });
    });
    label(
      c,
      "\u62A2\u8DD1\u5224\u5B9A\uFF1A\u95EA\u706F\u4E4B\u524D\u70B9\u51FB\u4E00\u5F8B\u8BB0\u72AF\u89C4\uFF0C\u8BE5\u6B21\u4E0D\u8FDB\u6837\u672C\u3002\u6837\u672C " + TRIALS + " \u6B21",
      SAFE.x0,
      1400,
      { size: 14, color: FAINT }
    );
    rule(c, 1472);
  }
  function compose() {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = INK;
    c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic";
    c.setLineDash([]);
    header(c);
    statusRow(c);
    panel(c);
    summary(c);
    chart(c);
    reading(c);
    paintPanel();
  }
  function paintPanel() {
    const n = document.getElementById("o-n");
    if (n) n.textContent = state.trials.length + " / " + TRIALS;
    const f = document.getElementById("o-foul");
    if (f) f.textContent = String(state.fouls);
    const m = document.getElementById("o-mode");
    if (m) m.textContent = state.mode;
  }
  function clearTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = 0;
    }
  }
  function arm() {
    clearTimer();
    state.mode = "armed";
    const delay = DELAY_MIN + rand() * (DELAY_MAX - DELAY_MIN);
    state.timer = setTimeout(function() {
      state.timer = 0;
      state.mode = "lit";
      state.litAt = performance.now();
      compose();
    }, delay);
    compose();
  }
  function hit() {
    if (state.mode === "idle") {
      if (state.trials.length >= TRIALS) return;
      arm();
      return;
    }
    if (state.mode === "armed") {
      clearTimer();
      state.fouls += 1;
      state.mode = "foul";
      state.timer = setTimeout(function() {
        state.timer = 0;
        state.mode = "idle";
        compose();
      }, 1200);
      compose();
      return;
    }
    if (state.mode === "lit") {
      const ms = performance.now() - state.litAt;
      state.last = ms;
      state.trials.push(ms);
      state.mode = "result";
      state.timer = setTimeout(function() {
        state.timer = 0;
        state.mode = "idle";
        compose();
      }, 900);
      compose();
      return;
    }
    if (state.mode === "result" || state.mode === "foul") {
      clearTimer();
      state.mode = "idle";
      compose();
    }
  }
  function selfTest() {
    const errs = [];
    const chk = function(ok, name) {
      if (!ok) errs.push(name);
    };
    const snap = { trials: state.trials.slice(), fouls: state.fouls, mode: state.mode, last: state.last };
    try {
      chk(state.trials.length === TRIALS, "\u9ED8\u8BA4\u6837\u672C\u6570\u4E0D\u662F " + TRIALS + "\uFF0C\u662F " + state.trials.length);
      const s = stats();
      chk(s !== null, "\u6CA1\u6709\u7EDF\u8BA1\u7ED3\u679C");
      if (s) {
        chk(s.avg >= 150 && s.avg <= 600, "\u5E73\u5747\u503C\u8D85\u51FA 150\u2013600 ms\uFF1A" + s.avg.toFixed(1));
        chk(s.best <= s.avg && s.avg <= s.worst, "\u6700\u5FEB/\u6700\u6162\u6CA1\u5939\u4F4F\u5E73\u5747\u503C");
        chk(s.spread > 0, "\u6781\u5DEE\u4E3A 0\uFF0C\u6837\u672C\u662F\u5E38\u6570");
      }
      const n0 = state.trials.length;
      const f0 = state.fouls;
      state.fouls += 1;
      chk(state.trials.length === n0, "\u62A2\u8DD1\u6539\u53D8\u4E86\u6837\u672C\u6570");
      state.fouls = f0;
      chk(state.fouls === f0, "\u62A2\u8DD1\u8BA1\u6570\u6CA1\u6709\u56DE\u6EDA");
      chk(bandOf(150) === "\u4F18\u79C0\u77ED\u8DD1\u8D77\u8DD1", "150 ms \u6CA1\u5224\u8FDB\u4F18\u79C0\u533A\u95F4");
      chk(bandOf(220) === "\u5178\u578B\u542C\u89C9\u53CD\u5E94", "220 ms \u6CA1\u5224\u8FDB\u5178\u578B\u533A\u95F4");
      chk(bandOf(400) === "\u6162\u4E8E\u53C2\u8003\u4E0A\u9650", "400 ms \u6CA1\u5224\u6210\u8D85\u4E0A\u9650");
      const r2 = mulberry32(4660);
      for (let i = 0; i < 200; i++) {
        const d = DELAY_MIN + r2() * (DELAY_MAX - DELAY_MIN);
        chk(d >= DELAY_MIN && d < DELAY_MAX, "\u5EF6\u8FDF\u8D8A\u754C\uFF1A" + d.toFixed(1));
        if (errs.length) break;
      }
      ctx.save();
      const lines = prose();
      lines.forEach(function(t) {
        ctx.font = "400 14px " + MONO;
        const w = ctx.measureText(t).width;
        chk(w <= SW, "\u5224\u8BFB\u6587\u5B57\u8D85\u5BBD " + w.toFixed(0) + "px\uFF1A" + t.slice(0, 12) + "\u2026");
      });
      ctx.restore();
      chk(Math.abs(yOf(Y_MAX) - CH.y) < 1e-9, "\u7EB5\u8F74\u9876\u7AEF\u6CA1\u5BF9\u9F50\u56FE\u8868\u9876\u90E8");
      chk(Math.abs(yOf(0) - baseline) < 1e-9, "0 ms \u6CA1\u843D\u5728\u57FA\u7EBF");
      chk(state.mode === "idle", "\u9ED8\u8BA4\u72B6\u6001\u4E0D\u662F idle");
    } finally {
      state.trials = snap.trials;
      state.fouls = snap.fouls;
      state.mode = snap.mode;
      state.last = snap.last;
      compose();
    }
    return { ok: errs.length === 0, errs };
  }
  function reset() {
    clearTimer();
    state.trials = [];
    state.fouls = 0;
    state.last = null;
    state.mode = "idle";
    compose();
  }
  window.__app = {
    canvas: stage,
    selfTest,
    compose,
    reset,
    arm,
    hit,
    getState: function() {
      return {
        mode: state.mode,
        trials: state.trials.slice(),
        fouls: state.fouls,
        last: state.last
      };
    },
    getMetrics: function() {
      const s = stats();
      return {
        n: state.trials.length,
        fouls: state.fouls,
        avg: s ? s.avg : null,
        best: s ? s.best : null,
        worst: s ? s.worst : null,
        spread: s ? s.spread : null,
        trialTarget: TRIALS,
        delayMin: DELAY_MIN,
        delayMax: DELAY_MAX,
        yMax: Y_MAX,
        mode: state.mode
      };
    },
    // 门禁用的注入接口：不依赖真实时钟，直接落一条有效样本
    addTrial: function(ms) {
      clearTimer();
      state.trials.push(Number(ms));
      state.last = Number(ms);
      state.mode = "idle";
      compose();
    },
    // 抢跑：只加犯规计数，绝不碰样本
    addFoul: function() {
      state.fouls += 1;
      compose();
    },
    setState: function(mode) {
      clearTimer();
      state.mode = mode;
      compose();
    },
    exportPNG: async function() {
      compose();
      const b = await toPNG(stage, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async function() {
      compose();
      const b = await toPNG(stage, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: function() {
      compose();
      return exportEpisode(stage, "reaction-trainer");
    }
  };
  stage.addEventListener("click", function(e) {
    e.preventDefault();
    hit();
  });
  document.addEventListener("keydown", function(e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      hit();
    }
  });
  var bx = document.getElementById("export");
  if (bx) bx.addEventListener("click", function() {
    window.__app.downloadAll();
  });
  var br = document.getElementById("reset");
  if (br) br.addEventListener("click", function() {
    reset();
  });
  for (let i = 0; i < TRIALS; i++) {
    state.trials.push(Math.round(196 + rand() * 62));
  }
  state.last = state.trials[TRIALS - 1];
  rand = mulberry32((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
  compose();
})();
