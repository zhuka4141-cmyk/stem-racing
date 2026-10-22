(() => {
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
  function scale(box, domain) {
    const { x0, x1, y0, y1 } = domain;
    const dx = x1 - x0 || 1;
    const dy = y1 - y0 || 1;
    return {
      sx: (v) => box.x + (v - x0) / dx * box.w,
      sy: (v) => box.y + box.h - (v - y0) / dy * box.h,
      domain,
      box
    };
  }
  function niceStep(range, target = 5) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = norm <= 1.5 ? 1 : norm <= 3 ? 2 : norm <= 7 ? 5 : 10;
    return step * mag;
  }
  function frame(ctx2, box, domain, opts = {}) {
    const s = scale(box, domain);
    const xf = opts.xFmt || ((v) => fmtNum(v));
    const yf = opts.yFmt || ((v) => fmtNum(v));
    const xs = niceStep(domain.x1 - domain.x0, opts.xTicks || 5);
    const ys = niceStep(domain.y1 - domain.y0, opts.yTicks || 5);
    ctx2.save();
    ctx2.lineWidth = 1;
    ctx2.font = `500 15px ${CHART.mono}`;
    ctx2.letterSpacing = "0px";
    ctx2.textAlign = "right";
    ctx2.textBaseline = "middle";
    const yStart = Math.ceil(domain.y0 / ys) * ys;
    for (let v = yStart; v <= domain.y1 + ys * 1e-6; v += ys) {
      const y = Math.round(s.sy(v)) + 0.5;
      const major = Math.abs(v) < ys * 1e-6;
      ctx2.strokeStyle = major ? CHART.gridMajor : CHART.grid;
      ctx2.beginPath();
      ctx2.moveTo(box.x, y);
      ctx2.lineTo(box.x + box.w, y);
      ctx2.stroke();
      ctx2.fillStyle = CHART.label;
      ctx2.fillText(yf(v), box.x - 10, y);
    }
    ctx2.textAlign = "center";
    ctx2.textBaseline = "top";
    const xStart = Math.ceil(domain.x0 / xs) * xs;
    for (let v = xStart; v <= domain.x1 + xs * 1e-6; v += xs) {
      const x = Math.round(s.sx(v)) + 0.5;
      ctx2.strokeStyle = CHART.grid;
      ctx2.beginPath();
      ctx2.moveTo(x, box.y);
      ctx2.lineTo(x, box.y + box.h);
      ctx2.stroke();
      ctx2.fillStyle = CHART.label;
      ctx2.fillText(xf(v), x, box.y + box.h + 10);
    }
    ctx2.strokeStyle = CHART.axis;
    ctx2.beginPath();
    ctx2.moveTo(box.x, box.y + box.h + 0.5);
    ctx2.lineTo(box.x + box.w, box.y + box.h + 0.5);
    ctx2.moveTo(box.x + 0.5, box.y);
    ctx2.lineTo(box.x + 0.5, box.y + box.h);
    ctx2.stroke();
    if (opts.xLabel) {
      ctx2.fillStyle = CHART.label;
      ctx2.font = `500 15px ${CHART.mono}`;
      ctx2.textAlign = "right";
      ctx2.textBaseline = "bottom";
      ctx2.fillText(opts.xLabel, box.x + box.w, box.y + box.h + 44);
    }
    if (opts.yLabel) {
      ctx2.save();
      ctx2.translate(box.x - 62, box.y);
      ctx2.rotate(-Math.PI / 2);
      ctx2.textAlign = "left";
      ctx2.textBaseline = "top";
      ctx2.fillStyle = CHART.label;
      ctx2.fillText(opts.yLabel, 0, 0);
      ctx2.restore();
    }
    ctx2.restore();
    return s;
  }
  function line(ctx2, s, points, { color = CHART.accent, width = 3, dashed = false, glow = false } = {}) {
    if (!points.length) return;
    ctx2.save();
    ctx2.strokeStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineJoin = "round";
    ctx2.lineCap = "round";
    if (dashed) ctx2.setLineDash([10, 10]);
    if (glow) {
      ctx2.shadowColor = color;
      ctx2.shadowBlur = 12;
    }
    ctx2.beginPath();
    pts(ctx2, s, points);
    ctx2.stroke();
    ctx2.restore();
  }
  function area(ctx2, s, points, { color = "rgba(232,89,12,0.16)", base = 0 } = {}) {
    if (points.length < 2) return;
    ctx2.save();
    ctx2.fillStyle = color;
    ctx2.beginPath();
    points.forEach(([x, y], i) => {
      const px = s.sx(x), py = s.sy(y);
      i ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py);
    });
    ctx2.lineTo(s.sx(points[points.length - 1][0]), s.sy(base));
    ctx2.lineTo(s.sx(points[0][0]), s.sy(base));
    ctx2.closePath();
    ctx2.fill();
    ctx2.restore();
  }
  function fmtNum(v, digits = 2) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(1) + "k";
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(digits).replace(/\.?0+$/, "");
    return v.toFixed(digits + 1);
  }
  function pts(ctx2, s, points) {
    points.forEach(([x, y], i) => {
      const px = s.sx(x), py = s.sy(y);
      i ? ctx2.lineTo(px, py) : ctx2.moveTo(px, py);
    });
  }

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
    const scale2 = Math.max(outW / sw, outH / sh);
    const dw = sw * scale2, dh = sh * scale2;
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

  // src/physics.js
  var CONST = {
    rho: 1.204,
    // [FIXED]  kg/m³  20 °C 海平面
    A: 16e-4,
    // [FIXED]  m²     迎风投影面积，车队给定
    Cd0: 0.34,
    // [TYPICAL] —     整车阻力系数，风洞拟合值
    Crr: 8e-3,
    // [TYPICAL] —     滚动阻力系数
    Iw: 45e-8,
    // [TYPICAL] kg·m² 单轮转动惯量
    rw: 0.011,
    // [FIXED]  m      轮半径
    nw: 4,
    // [FIXED]  个
    g: 9.81,
    // [FIXED]  m/s²
    L: 20
    // [FIXED]  m      赛道长度
  };
  var DT = 1e-3;
  var T_MAX = 10;
  function effMass(m) {
    return m + CONST.nw * CONST.Iw / (CONST.rw * CONST.rw);
  }
  function thrustAt(car, t) {
    if (!(t > 0) || t >= car.tburn) return 0;
    return car.Fpk * Math.sin(Math.PI * t / car.tburn);
  }
  function impulse(car) {
    return 2 * car.Fpk * car.tburn / Math.PI;
  }
  function simulate(car, dt = DT) {
    const me = effMass(car.m);
    const CdA = car.Cd0 * CONST.A;
    const fRoll = CONST.Crr * car.m * CONST.g;
    const L = CONST.L;
    const acc = (t2, v2) => (thrustAt(car, t2) - 0.5 * CONST.rho * CdA * v2 * v2 - fRoll) / me;
    const ts = [0], xs = [0], vs = [0];
    let t = 0, x = 0, v = 0;
    let vMax = 0, aMax = 0;
    let wThrust = 0, wDrag = 0, wRoll = 0;
    let done = false;
    while (t < T_MAX) {
      const k1x = v, k1v = acc(t, v);
      const k2x = v + dt / 2 * k1v, k2v = acc(t + dt / 2, v + dt / 2 * k1v);
      const k3x = v + dt / 2 * k2v, k3v = acc(t + dt / 2, v + dt / 2 * k2v);
      const k4x = v + dt * k3v, k4v = acc(t + dt, v + dt * k3v);
      const dx = dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x);
      const dv = dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      if (k1v > aMax) aMax = k1v;
      const tm = t + dt / 2, dm = x + dx / 2, vm = v + dv / 2;
      wThrust += thrustAt(car, tm) * dx;
      wDrag += 0.5 * CONST.rho * CdA * vm * vm * dx;
      wRoll += fRoll * dx;
      if (x + dx >= L) {
        const f = (L - x) / dx;
        t += dt * f;
        v += dv * f;
        x = L;
        ts.push(t);
        xs.push(x);
        vs.push(v);
        if (v > vMax) vMax = v;
        done = true;
        break;
      }
      t += dt;
      x += dx;
      v += dv;
      if (v > vMax) vMax = v;
      ts.push(t);
      xs.push(x);
      vs.push(v);
    }
    const ke = 0.5 * me * v * v;
    return {
      finished: done,
      time: t,
      vEnd: v,
      vMax,
      aMax,
      meff: me,
      CdA,
      fRoll,
      work: { thrust: wThrust, drag: wDrag, roll: wRoll },
      ke,
      closure: ke + wDrag + wRoll - wThrust,
      trace: { ts, xs, vs }
    };
  }
  function vAtX(res, x) {
    const { xs, vs } = res.trace;
    if (x <= xs[0]) return vs[0];
    const n = xs.length;
    if (x >= xs[n - 1]) return vs[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const dx = xs[hi] - xs[lo] || 1;
    const f = (x - xs[lo]) / dx;
    return vs[lo] + (vs[hi] - vs[lo]) * f;
  }
  function vAtT(res, t) {
    const { ts, vs } = res.trace;
    if (t <= ts[0]) return vs[0];
    const n = ts.length;
    if (t >= ts[n - 1]) return vs[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid;
    }
    const dt = ts[hi] - ts[lo] || 1;
    const f = (t - ts[lo]) / dt;
    return vs[lo] + (vs[hi] - vs[lo]) * f;
  }
  function xAtT(res, t) {
    const { ts, xs } = res.trace;
    if (t <= ts[0]) return xs[0];
    const n = ts.length;
    if (t >= ts[n - 1]) return xs[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid;
    }
    const dt = ts[hi] - ts[lo] || 1;
    const f = (t - ts[lo]) / dt;
    return xs[lo] + (xs[hi] - xs[lo]) * f;
  }
  var GRID_N = 401;
  function compare(A, B) {
    const rA = simulate(A);
    const rB = simulate(B);
    const xs = [], dv = [], vA = [], vB = [];
    for (let i = 0; i < GRID_N; i++) {
      const x = CONST.L * i / (GRID_N - 1);
      const a = vAtX(rA, x), b = vAtX(rB, x);
      xs.push(x);
      vA.push(a);
      vB.push(b);
      dv.push(a - b);
    }
    return {
      A: rA,
      B: rB,
      dTime: rA.time - rB.time,
      // 负 = A 更快
      xs,
      dv,
      vA,
      vB,
      slopeFinish: slopeOver(xs, dv, CONST.L * 0.9, CONST.L)
    };
  }
  function slopeOver(xs, ys, x0, x1) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < x0 || xs[i] > x1) continue;
      n++;
      sx += xs[i];
      sy += ys[i];
      sxx += xs[i] * xs[i];
      sxy += xs[i] * ys[i];
    }
    if (n < 2) return 0;
    const d = n * sxx - sx * sx;
    if (!d) return 0;
    return (n * sxy - sx * sy) / d;
  }

  // src/main.js
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var SW = SAFE.x1 - SAFE.x0;
  var INK = "#0b0b0c";
  var PAPER = "#f2f0eb";
  var ACCENT = "#e8590c";
  var TRACK = "#1c1c20";
  var MUTE = "rgba(242,240,235,0.55)";
  var FAINT = "rgba(242,240,235,0.34)";
  var HAIR = "rgba(242,240,235,0.16)";
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Bahnschrift","Barlow Condensed","Archivo Narrow",Oswald,"Microsoft YaHei","Noto Sans SC",sans-serif';
  var CO = {
    A: { line: ACCENT, fill: "rgba(232,89,12,0.20)" },
    B: { line: "#b9b4ab", fill: "rgba(185,180,171,0.15)" }
  };
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var state = {
    A: { m: 0.065, Cd0: 0.34, Fpk: 21, tburn: 0.11 },
    B: { m: 0.068, Cd0: 0.35, Fpk: 20.8, tburn: 0.109 },
    displayT: 0,
    running: true
  };
  var cmp = compare(state.A, state.B);
  var tStart = 0;
  var tEnd = () => Math.max(cmp.A.time, cmp.B.time);
  var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  var aEq = (r) => r.vEnd * r.vEnd / (2 * CONST.L);
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
  function header(c) {
    rule(c, 240);
    label(c, "HEAD TO HEAD \xB7 20 m \u76F4\u9053", SAFE.x0, 268, { size: 15 });
    label(c, "RK4 \xB7 \u0394t 1.0 ms \xB7 \u534A\u6B63\u5F26\u63A8\u529B", SAFE.x1, 268, { size: 15, align: "right" });
    c.font = "600 46px " + DISP;
    c.fillStyle = PAPER;
    c.textAlign = "left";
    c.fillText("\u4E24\u8F66\u540C\u8DD1\uFF0C\u8C01\u5148\u5230\u7EBF", SAFE.x0, 324);
    label(c, "\u63A8\u529B F_peak\xB7sin(\u03C0t/t_burn) \u9010\u6BEB\u79D2\u79EF\u5206\uFF0Ct_burn \u4E4B\u540E\u4E25\u683C\u5F52\u96F6", SAFE.x0, 354, { size: 15 });
    rule(c, 374);
  }
  function readout(c) {
    const done = state.displayT >= tEnd() - 1e-9;
    const t = Math.min(state.displayT, tEnd());
    let big, unit, dir;
    if (done) {
      const dMs = cmp.dTime * 1e3;
      big = Math.abs(dMs).toFixed(1);
      unit = "ms";
      dir = dMs < 0 ? "B \u6162 " + Math.abs(dMs / cmp.B.time * 100).toFixed(1) + " %" : "A \u6162 " + Math.abs(dMs / cmp.A.time * 100).toFixed(1) + " %";
    } else {
      const xa = xAtT(cmp.A, Math.min(t, cmp.A.time));
      const xb = xAtT(cmp.B, Math.min(t, cmp.B.time));
      const lead = xa - xb;
      big = Math.abs(lead).toFixed(2);
      unit = "m";
      dir = lead >= 0 ? "A \u5728\u524D" : "B \u5728\u524D";
    }
    label(c, done ? "\u51B2\u7EBF\u6210\u7EE9\u5DEE" : "\u5B9E\u65F6\u9886\u5148", SAFE.x0, 404, { size: 15 });
    c.font = "500 76px " + MONO;
    c.fillStyle = ACCENT;
    c.textAlign = "left";
    c.fillText(big, SAFE.x0 - 3, 478);
    const w = c.measureText(big).width;
    c.font = "400 30px " + MONO;
    c.fillStyle = MUTE;
    c.fillText(unit, SAFE.x0 + w + 10, 478);
    label(c, dir, SAFE.x0, 512, { size: 17, color: PAPER });
    const va = vAtT(cmp.A, Math.min(t, cmp.A.time));
    const vb = vAtT(cmp.B, Math.min(t, cmp.B.time));
    const rows = [["A \u901F\u5EA6", va, CO.A.line], ["B \u901F\u5EA6", vb, CO.B.line]];
    rows.forEach(function(r, i) {
      const y = 404 + i * 34;
      label(c, r[0], SAFE.x1 - 200, y, { size: 14, color: FAINT });
      c.textAlign = "right";
      c.font = "500 19px " + MONO;
      c.fillStyle = r[2];
      c.fillText(r[1].toFixed(2) + " m/s", SAFE.x1, y);
    });
    c.textAlign = "left";
  }
  function kpi(c) {
    const cells = [
      ["\u5CF0\u503C\u901F\u5EA6", cmp.A.vMax.toFixed(2) + " / " + cmp.B.vMax.toFixed(2), "m/s"],
      ["\u5CF0\u503C\u52A0\u901F\u5EA6", (cmp.A.aMax / CONST.g).toFixed(1) + " / " + (cmp.B.aMax / CONST.g).toFixed(1), "g"],
      ["\u7B49\u6548\u5E73\u5747\u52A0\u901F\u5EA6", aEq(cmp.A).toFixed(2) + " / " + aEq(cmp.B).toFixed(2), "m/s\xB2"],
      ["\u71C3\u70E7\u8DDD\u79BB", xAtT(cmp.A, state.A.tburn).toFixed(2) + " / " + xAtT(cmp.B, state.B.tburn).toFixed(2), "m"]
    ];
    const cw = SW / 4;
    label(c, "\u5173\u952E\u6307\u6807", SAFE.x0, 540, { size: 14, color: FAINT });
    label(c, "A / B", SAFE.x1, 540, { size: 14, color: FAINT, align: "right" });
    cells.forEach(function(cell, i) {
      const x = SAFE.x0 + i * cw;
      label(c, cell[0], x, 564, { size: 13, color: FAINT });
      c.textAlign = "left";
      c.font = "500 21px " + MONO;
      c.fillStyle = PAPER;
      c.fillText(cell[1], x - 1, 590);
      const w = c.measureText(cell[1]).width;
      c.font = "400 13px " + MONO;
      c.fillStyle = FAINT;
      c.fillText(cell[2], x + w + 6, 590);
    });
    c.textAlign = "left";
  }
  function lane(c, car, res, y, key, name) {
    const h = 64;
    const px = (m) => SAFE.x0 + SW * (m / CONST.L);
    label(
      c,
      name + "   " + (car.m * 1e3).toFixed(1) + " g  \xB7  Cd0 " + car.Cd0.toFixed(2) + "  \xB7  F_peak " + car.Fpk.toFixed(1) + " N  \xB7  t_burn " + (car.tburn * 1e3).toFixed(0) + " ms",
      SAFE.x0,
      y - 12,
      { size: 14, color: FAINT }
    );
    c.fillStyle = TRACK;
    c.fillRect(SAFE.x0, y, SW, h);
    for (let m = 0; m <= CONST.L + 1e-9; m += 2.5) {
      const x = Math.round(px(m)) + 0.5;
      c.strokeStyle = m % 5 === 0 ? "rgba(242,240,235,0.16)" : "rgba(242,240,235,0.07)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x, y + h);
      c.stroke();
    }
    const xt = clamp(xAtT(res, Math.min(state.displayT, res.time)), 0, CONST.L);
    const xEnd = px(xt);
    c.fillStyle = CO[key].fill;
    c.fillRect(SAFE.x0, y, Math.max(0, xEnd - SAFE.x0), h);
    const nose = clamp(xEnd, SAFE.x0 + 52, SAFE.x1);
    const cy = y + h / 2;
    c.fillStyle = CO[key].line;
    c.beginPath();
    c.moveTo(nose, cy);
    c.lineTo(nose - 15, cy - 12);
    c.lineTo(nose - 42, cy - 12);
    c.lineTo(nose - 49, cy);
    c.lineTo(nose - 42, cy + 12);
    c.lineTo(nose - 15, cy + 12);
    c.closePath();
    c.fill();
    c.font = "600 13px " + MONO;
    c.fillStyle = INK;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(key, nose - 30, cy + 1);
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
  }
  function lanes(c) {
    lane(c, state.A, cmp.A, 632, "A", "\u8F66 A");
    lane(c, state.B, cmp.B, 720, "B", "\u8F66 B");
    const px = (m) => SAFE.x0 + SW * (m / CONST.L);
    for (let m = 0; m <= CONST.L; m += 5) {
      label(c, String(m), px(m), 808, {
        size: 14,
        color: FAINT,
        align: m === 0 ? "left" : m === CONST.L ? "right" : "center"
      });
    }
    label(c, "\u8DDD\u79BB [m]", SAFE.x0 + 300, 808, { size: 14, color: FAINT, align: "left" });
  }
  function stats(c) {
    const dMs = cmp.dTime * 1e3;
    const cols = [
      { x: SAFE.x0, name: "\u8F66 A \u51B2\u7EBF", time: cmp.A.time, v: cmp.A.vEnd, color: CO.A.line },
      { x: SAFE.x0 + 300, name: "\u8F66 B \u51B2\u7EBF", time: cmp.B.time, v: cmp.B.vEnd, color: CO.B.line },
      { x: SAFE.x1, name: "\u5DEE\u503C", time: null, v: null, color: ACCENT, right: true }
    ];
    cols.forEach(function(col, i) {
      label(c, col.name, col.x, 848, { size: 15, color: FAINT, align: col.right ? "right" : "left" });
      c.textAlign = col.right ? "right" : "left";
      if (i < 2) {
        c.font = "500 38px " + MONO;
        c.fillStyle = col.color;
        c.textAlign = "left";
        c.fillText(col.time.toFixed(4), col.x - 2, 892);
        const wv = c.measureText(col.time.toFixed(4)).width;
        c.font = "400 19px " + MONO;
        c.fillStyle = MUTE;
        c.fillText("s", col.x - 2 + wv + 6, 892);
        label(c, col.v.toFixed(2) + " m/s \u672B\u901F", col.x, 920, { size: 15, color: MUTE });
      } else {
        const txt = (dMs >= 0 ? "+" : "\u2212") + Math.abs(dMs).toFixed(1);
        c.font = "500 38px " + MONO;
        c.fillStyle = ACCENT;
        c.textAlign = "left";
        c.fillText(txt, col.x, 892);
        c.font = "400 19px " + MONO;
        c.fillStyle = MUTE;
        c.fillText("ms", col.x - c.measureText(txt).width * 2.1 - 6, 892);
        const lead = cmp.dTime < 0 ? CONST.L - xAtT(cmp.B, cmp.A.time) : CONST.L - xAtT(cmp.A, cmp.B.time);
        label(c, "\u51B2\u7EBF\u65F6\u76F8\u8DDD " + lead.toFixed(2) + " m", col.x, 920, { size: 15, color: MUTE, align: "right" });
      }
    });
    c.textAlign = "left";
  }
  function chart(c) {
    label(c, "\u901F\u5EA6\u5DEE \u0394v = v_A \u2212 v_B", SAFE.x0, 964, { size: 17, color: PAPER, weight: 500 });
    const neg = cmp.slopeFinish < 0;
    label(
      c,
      "\u51B2\u7EBF\u5904 d\u0394v/dx = " + (neg ? "\u2212" : "+") + Math.abs(cmp.slopeFinish).toFixed(4) + " (m/s)/m",
      SAFE.x1,
      964,
      { size: 15, color: neg ? ACCENT : MUTE, align: "right" }
    );
    label(
      c,
      neg ? "\u8D1F\u659C\u7387 \u2192 \u9886\u5148\u5728\u6536\u7A84" : "\u6B63\u659C\u7387 \u2192 \u9886\u5148\u5728\u6269\u5927",
      SAFE.x1,
      986,
      { size: 14, color: FAINT, align: "right" }
    );
    const dvMax = Math.max.apply(null, cmp.dv);
    const dvMin = Math.min.apply(null, cmp.dv);
    const box = { x: SAFE.x0 + 56, y: 1004, w: SW - 56 - 8, h: 214 };
    const domain = {
      x0: 0,
      x1: CONST.L,
      y0: Math.min(0, dvMin * 1.25),
      y1: Math.max(0.2, dvMax * 1.25)
    };
    c.fillStyle = "#141417";
    c.fillRect(box.x, box.y, box.w, box.h);
    const s = frame(c, box, domain, { xTicks: 4, yTicks: 4, xLabel: "\u8DDD\u79BB x [m]" });
    label(c, "\u0394v [m/s]", box.x, box.y - 10, { size: 14, color: FAINT });
    const pts2 = cmp.xs.map(function(x, i) {
      return [x, cmp.dv[i]];
    });
    area(c, s, pts2, { color: "rgba(232,89,12,0.18)", base: 0 });
    line(c, s, pts2, { color: ACCENT, width: 3 });
    const yl = cmp.dv[cmp.dv.length - 1];
    c.fillStyle = ACCENT;
    c.beginPath();
    c.arc(s.sx(CONST.L), s.sy(yl), 6, 0, Math.PI * 2);
    c.fill();
    label(c, "\u5CF0\u503C \u0394v " + dvMax.toFixed(2) + " m/s", box.x + 12, box.y + 26, { size: 14, color: FAINT });
  }
  function params(c) {
    rule(c, 1306);
    const CX = [SAFE.x0, SAFE.x0 + 330, SAFE.x0 + 580, SAFE.x1];
    label(c, "\u53C2\u6570", CX[0], 1320, { size: 14, color: FAINT });
    label(c, "\u8F66 A", CX[1], 1320, { size: 14, color: CO.A.line, align: "right" });
    label(c, "\u8F66 B", CX[2], 1320, { size: 14, color: CO.B.line, align: "right" });
    label(c, "\u5DEE\u503C B\u2212A", CX[3], 1320, { size: 14, color: FAINT, align: "right" });
    const rows = [
      [
        "\u8F66\u4F53\u8D28\u91CF m",
        state.A.m,
        state.B.m,
        function(v) {
          return (v * 1e3).toFixed(1) + " g";
        },
        function(d) {
          return (d * 1e3 >= 0 ? "+" : "\u2212") + Math.abs(d * 1e3).toFixed(1) + " g";
        }
      ],
      [
        "\u963B\u529B\u7CFB\u6570 Cd0",
        state.A.Cd0,
        state.B.Cd0,
        function(v) {
          return v.toFixed(3);
        },
        function(d) {
          return (d >= 0 ? "+" : "\u2212") + Math.abs(d).toFixed(3);
        }
      ],
      [
        "\u5CF0\u503C\u63A8\u529B F_peak",
        state.A.Fpk,
        state.B.Fpk,
        function(v) {
          return v.toFixed(2) + " N";
        },
        function(d) {
          return (d >= 0 ? "+" : "\u2212") + Math.abs(d).toFixed(2) + " N";
        }
      ],
      [
        "\u71C3\u70E7\u65F6\u957F t_burn",
        state.A.tburn,
        state.B.tburn,
        function(v) {
          return (v * 1e3).toFixed(1) + " ms";
        },
        function(d) {
          return (d * 1e3 >= 0 ? "+" : "\u2212") + Math.abs(d * 1e3).toFixed(1) + " ms";
        }
      ]
    ];
    rows.forEach(function(row, i) {
      const y = 1350 + i * 26;
      label(c, row[0], CX[0], y, { size: 14, color: FAINT });
      c.font = "400 15px " + MONO;
      c.textAlign = "right";
      c.fillStyle = CO.A.line;
      c.fillText(row[3](row[1]), CX[1], y);
      c.fillStyle = CO.B.line;
      c.fillText(row[3](row[2]), CX[2], y);
      c.fillStyle = MUTE;
      c.fillText(row[4](row[2] - row[1]), CX[3], y);
      c.textAlign = "left";
    });
    label(
      c,
      "\u7B49\u6548\u60EF\u6027\u8D28\u91CF " + (effMass(state.A.m) * 1e3).toFixed(1) + " / " + (effMass(state.B.m) * 1e3).toFixed(1) + " g   \xB7   \u51B2\u91CF " + impulse(state.A).toFixed(3) + " / " + impulse(state.B).toFixed(3) + " N\xB7s",
      SAFE.x0,
      1458,
      { size: 14, color: MUTE }
    );
    rule(c, 1472);
  }
  function compose() {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = INK;
    c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic";
    header(c);
    readout(c);
    kpi(c);
    lanes(c);
    stats(c);
    chart(c);
    params(c);
  }
  function tick(now) {
    if (state.running) {
      if (!tStart) tStart = now;
      state.displayT = (now - tStart) / 1e3;
      if (state.displayT >= tEnd()) {
        state.displayT = tEnd();
        state.running = false;
      }
      compose();
    }
    requestAnimationFrame(tick);
  }
  function restart() {
    cmp = compare(state.A, state.B);
    state.displayT = 0;
    state.running = true;
    tStart = 0;
    compose();
  }
  function finish() {
    state.displayT = tEnd();
    state.running = false;
    compose();
  }
  function selfTest() {
    const errs = [];
    const chk = function(ok, name) {
      if (!ok) errs.push(name);
    };
    const rA = simulate(state.A);
    chk([rA.time, rA.vEnd, rA.vMax, rA.closure, rA.aMax].every(Number.isFinite), "\u51FA\u73B0 NaN / Infinity");
    const me = effMass(0.065);
    chk(Math.abs(me - 0.079876) < 1e-6, "\u6709\u6548\u60EF\u6027\u8D28\u91CF\u4E0D\u662F m + 4I_w/r_w\xB2");
    chk(Math.abs(me - (0.065 + 4 * CONST.Iw / (CONST.rw * CONST.rw))) < 1e-12, "\u6709\u6548\u8D28\u91CF\u516C\u5F0F\u4E0E\u5E38\u6570\u4E0D\u7B26");
    chk(Math.abs(impulse({ Fpk: 21, tburn: 0.11 }) - 2 * 21 * 0.11 / Math.PI) < 1e-12, "\u534A\u6B63\u5F26\u51B2\u91CF\u89E3\u6790\u5F0F\u9519\u8BEF");
    const base = simulate({ m: 0.065, Cd0: 0.34, Fpk: 21, tburn: 0.11 });
    chk(Math.abs(base.time - 1.1885) < 2e-3, "\u57FA\u51C6\u6210\u7EE9\u504F\u79BB 1.1885 s\uFF1A" + base.time.toFixed(4));
    chk(Math.abs(base.vEnd - 16.91) < 0.02, "\u57FA\u51C6\u672B\u901F\u504F\u79BB 16.91 m/s\uFF1A" + base.vEnd.toFixed(3));
    chk(Math.abs(base.aMax / CONST.g - 26.8) < 0.3, "\u57FA\u51C6\u5CF0\u503C\u52A0\u901F\u5EA6\u504F\u79BB 26.8 g\uFF1A" + (base.aMax / CONST.g).toFixed(2));
    chk(Math.abs(rA.time - simulate(state.A, DT / 2).time) < 1e-3, "\u6B65\u957F\u51CF\u534A\u6210\u7EE9\u672A\u6536\u655B");
    const same = compare(state.A, { ...state.A });
    chk(same.dTime === 0, "\u540C\u53C2\u6570\u4E24\u8F66\u6210\u7EE9\u4E0D\u76F8\u7B49");
    chk(same.dv.every(function(v) {
      return v === 0;
    }), "\u540C\u53C2\u6570\u4E24\u8F66\u901F\u5EA6\u5DEE\u4E0D\u4E3A 0");
    chk(simulate({ ...state.A, m: state.A.m * 1.2 }).time > rA.time, "\u8D28\u91CF\u53D8\u5927\u6210\u7EE9\u6CA1\u6709\u53D8\u5DEE");
    chk(simulate({ ...state.A, Fpk: state.A.Fpk * 1.1 }).time < rA.time, "\u63A8\u529B\u53D8\u5927\u6210\u7EE9\u6CA1\u6709\u53D8\u597D");
    const ctl = compare({ ...state.A, m: 0.065 }, { ...state.A, m: 0.075 });
    chk(ctl.dTime < 0, "\u8F7B\u8F66\u6CA1\u6709\u6BD4\u91CD\u8F66\u5FEB");
    chk(ctl.slopeFinish < 0, "\u901F\u5EA6\u5DEE\u66F2\u7EBF\u51B2\u7EBF\u5904\u659C\u7387\u4E0D\u662F\u8D1F\u7684\uFF1A" + ctl.slopeFinish.toFixed(5));
    chk(Math.abs(rA.closure) / rA.work.thrust < 1e-4, "\u80FD\u91CF\u6536\u652F\u6B8B\u5DEE\u8FC7\u5927\uFF1A" + Math.abs(rA.closure / rA.work.thrust).toExponential(2));
    chk(rA.time > state.A.tburn, "\u6210\u7EE9\u77ED\u4E8E\u71C3\u70E7\u65F6\u957F");
    chk(rA.vMax > vAtT(rA, state.A.tburn) - 1e-6, "\u5CF0\u503C\u901F\u5EA6\u4F4E\u4E8E\u71C3\u70E7\u672B\u901F\u5EA6");
    chk(simulate(state.A).time === rA.time, "\u540C\u53C2\u6570\u4E24\u6B21\u79EF\u5206\u7ED3\u679C\u4E0D\u4E00\u81F4");
    return { ok: errs.length === 0, errs };
  }
  window.__app = {
    canvas: stage,
    selfTest,
    getState: function() {
      return { A: { ...state.A }, B: { ...state.B }, displayT: state.displayT, running: state.running };
    },
    getMetrics: function() {
      return {
        tA: cmp.A.time,
        tB: cmp.B.time,
        vA: cmp.A.vEnd,
        vB: cmp.B.vEnd,
        dTimeMs: cmp.dTime * 1e3,
        slopeFinish: cmp.slopeFinish,
        dvMax: Math.max.apply(null, cmp.dv),
        gapM: cmp.dTime < 0 ? CONST.L - xAtT(cmp.B, cmp.A.time) : CONST.L - xAtT(cmp.A, cmp.B.time),
        meffA: effMass(state.A.m),
        meffB: effMass(state.B.m),
        gridN: GRID_N,
        finished: state.displayT >= tEnd() - 1e-9
      };
    },
    set: function(path, value) {
      const parts = String(path).split(".");
      if (parts.length === 2 && (parts[0] === "A" || parts[0] === "B")) {
        state[parts[0]][parts[1]] = Number(value);
      } else if (path === "displayT") {
        state.displayT = Number(value);
        state.running = false;
        compose();
        return;
      } else {
        throw new Error("\u672A\u77E5\u53C2\u6570 " + path);
      }
      restart();
    },
    setCar: function(key, obj) {
      Object.assign(state[key], obj);
      restart();
    },
    restart,
    finish,
    compose,
    exportPNG: async function() {
      finish();
      const b = await toPNG(stage, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async function() {
      finish();
      const b = await toPNG(stage, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: function() {
      finish();
      return exportEpisode(stage, "head-to-head");
    }
  };
  var FIELDS = [
    ["a-m", "A", "m", 1e-3, function(v) {
      return v.toFixed(1) + " g";
    }],
    ["a-cd", "A", "Cd0", 1, function(v) {
      return v.toFixed(3);
    }],
    ["a-f", "A", "Fpk", 1, function(v) {
      return v.toFixed(1) + " N";
    }],
    ["a-t", "A", "tburn", 1e-3, function(v) {
      return (v * 1e3).toFixed(0) + " ms";
    }],
    ["b-m", "B", "m", 1e-3, function(v) {
      return v.toFixed(1) + " g";
    }],
    ["b-cd", "B", "Cd0", 1, function(v) {
      return v.toFixed(3);
    }],
    ["b-f", "B", "Fpk", 1, function(v) {
      return v.toFixed(1) + " N";
    }],
    ["b-t", "B", "tburn", 1e-3, function(v) {
      return (v * 1e3).toFixed(0) + " ms";
    }]
  ];
  FIELDS.forEach(function(f) {
    const el = document.getElementById(f[0]);
    const out = document.getElementById("o-" + f[0]);
    if (!el) return;
    const paint = function() {
      const v = Number(el.value) * f[3];
      state[f[1]][f[2]] = v;
      if (out) out.textContent = f[4](v);
    };
    el.addEventListener("input", function() {
      paint();
      restart();
    });
    paint();
  });
  var bx = document.getElementById("export");
  if (bx) bx.addEventListener("click", function() {
    window.__app.downloadAll();
  });
  var br = document.getElementById("restart");
  if (br) br.addEventListener("click", restart);
  compose();
  requestAnimationFrame(tick);
})();
