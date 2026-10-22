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
  async function toPNG(canvas2, { width = REEL_W, height = REEL_H, quality } = {}) {
    const out = resample(canvas2, width, height);
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
  async function exportEpisode(canvas2, slug) {
    const vertical = await toPNG(canvas2, { width: REEL_W, height: REEL_H });
    await assertPNG(vertical);
    download(vertical, `${slug}-1080x1920.png`);
    const cover = await toPNG(canvas2, { width: COVER_W, height: COVER_H });
    await assertPNG(cover);
    download(cover, `${slug}-1080x1350.png`);
    return { vertical: vertical.size, cover: cover.size };
  }

  // src/physics.js
  var RHO = 1.204;
  var G = 9.81;
  var TRACK_LEN = 20;
  var CD0 = 0.34;
  var A0 = 16e-4;
  var CRR = 8e-3;
  var F_PEAK = 21;
  var T_BURN = 0.11;
  var AOA_CD_PER_DEG = 0.045;
  var WING_CD_PER_DEG = 0.038;
  var WHEEL_INERTIA_K = 1;
  function effectiveMass(bodyMass, wheels) {
    let rot = 0;
    for (const w of wheels) rot += WHEEL_INERTIA_K * w.mass;
    return { body: bodyMass, rot, total: bodyMass + rot };
  }
  function dragForce(v, cd, area) {
    return 0.5 * RHO * cd * area * v * v;
  }
  function simulate(opts) {
    const {
      mEq,
      mBody,
      cd = CD0,
      area = A0,
      fPeak = F_PEAK,
      tBurn = T_BURN,
      len = TRACK_LEN,
      dt = 5e-5
    } = opts;
    const k = 0.5 * RHO * cd * area;
    const roll = CRR * mBody * G;
    let v = 0, s = 0, t = 0;
    const thrust = (tt) => tt < tBurn ? fPeak * Math.sin(Math.PI * tt / tBurn) : 0;
    while (s < len && t < 8) {
      const a = (thrust(t) - k * v * v - roll) / mEq;
      v += a * dt;
      s += v * dt;
      t += dt;
    }
    return { time: t, speed: v, dragAtEnd: dragForce(v, cd, area) };
  }

  // src/car.js
  var CAR_MM = 200;
  var AXLE_FRONT = 30;
  var AXLE_REAR = 170;
  var FONT_MONO = '"JetBrains Mono", "IBM Plex Mono", "Roboto Mono", Consolas, "Microsoft YaHei", monospace';
  var FONT_DISP = '"Barlow Condensed", "Archivo Narrow", Oswald, "Microsoft YaHei", sans-serif';
  function tracked(ctx2, str, x, y, spacing, align = "left") {
    const chars = [...str];
    let w = 0;
    for (const ch of chars) w += ctx2.measureText(ch).width + spacing;
    w -= spacing;
    let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    for (const ch of chars) {
      ctx2.fillText(ch, cx, y);
      cx += ctx2.measureText(ch).width + spacing;
    }
    return w;
  }
  function carGeometry(p) {
    const L = CAR_MM;
    const rw = p.wheelDia / 2;
    const bottom = -(p.rideHeight + 1.5);
    const rearBase = -(p.rideHeight + 20);
    const frontBase = -(p.rideHeight + 13);
    const run = L - 8 - p.noseLen;
    const rake = Math.tan(p.aoa * Math.PI / 180) * (run / 2);
    const yFrontTop = frontBase - rake;
    const yRearTop = rearBase + rake;
    return { L, rw, bottom, yFrontTop, yRearTop, rearBase, frontBase };
  }
  function drawCar(ctx2, { ox, oy, scale, p, pal, dim = false }) {
    const g = carGeometry(p);
    const { L, rw, bottom, yFrontTop, yRearTop } = g;
    const S = (v) => v * scale;
    const X = (mm) => ox + S(mm);
    const Y = (mm) => oy + S(mm);
    ctx2.save();
    ctx2.lineJoin = "miter";
    ctx2.lineCap = "butt";
    ctx2.strokeStyle = pal.line;
    ctx2.lineWidth = 1;
    ctx2.beginPath();
    ctx2.moveTo(ox - S(26) + 0.5, oy + 0.5);
    ctx2.lineTo(ox + S(L + 26) + 0.5, oy + 0.5);
    ctx2.stroke();
    ctx2.strokeStyle = pal.lineFaint;
    for (let mm = -24; mm <= L + 24; mm += 6) {
      ctx2.beginPath();
      ctx2.moveTo(X(mm) + 0.5, oy + 1);
      ctx2.lineTo(X(mm) - S(3) + 0.5, oy + S(4));
      ctx2.stroke();
    }
    const bodyPath = () => {
      ctx2.beginPath();
      ctx2.moveTo(X(0), Y(bottom + 1.2));
      ctx2.quadraticCurveTo(X(p.noseLen * 0.45), Y(yFrontTop), X(p.noseLen), Y(yFrontTop));
      ctx2.lineTo(X(L - 8), Y(yRearTop));
      ctx2.lineTo(X(L), Y(yRearTop + 2));
      ctx2.lineTo(X(L), Y(bottom));
      ctx2.lineTo(X(L * 0.34), Y(bottom));
      ctx2.quadraticCurveTo(X(6), Y(bottom - 0.6), X(0), Y(bottom + 1.2));
      ctx2.closePath();
    };
    bodyPath();
    ctx2.fillStyle = pal.body;
    ctx2.fill();
    ctx2.save();
    bodyPath();
    ctx2.clip();
    ctx2.strokeStyle = pal.hatch;
    ctx2.lineWidth = 1;
    for (let mm = -60; mm < L + 40; mm += 3.2) {
      ctx2.beginPath();
      ctx2.moveTo(X(mm), Y(bottom + 1));
      ctx2.lineTo(X(mm - 26), Y(yFrontTop - 4));
      ctx2.stroke();
    }
    ctx2.restore();
    bodyPath();
    ctx2.strokeStyle = pal.edge;
    ctx2.lineWidth = 2;
    ctx2.stroke();
    const bx = p.ballastX;
    ctx2.fillStyle = pal.ballast;
    ctx2.fillRect(X(bx - 9), Y(bottom - 0.4), S(18), S(5.4));
    ctx2.strokeStyle = pal.edge;
    ctx2.lineWidth = 1.5;
    ctx2.strokeRect(X(bx - 9) + 0.5, Y(bottom - 0.4) + 0.5, S(18) - 1, S(5.4) - 1);
    ctx2.save();
    ctx2.translate(X(L - 13), Y(yRearTop - 1));
    ctx2.rotate(p.wingDeg * Math.PI / 180);
    ctx2.fillStyle = pal.wing;
    ctx2.fillRect(0, S(-2.6), S(24), S(2.6));
    ctx2.strokeStyle = pal.edge;
    ctx2.lineWidth = 1.5;
    ctx2.strokeRect(0.5, S(-2.6) + 0.5, S(24) - 1, S(2.6) - 1);
    ctx2.restore();
    const wheels = [
      { x: AXLE_FRONT, r: rw },
      { x: AXLE_REAR, r: rw }
    ];
    for (const w of wheels) {
      const cx = X(w.x);
      const cy = Y(-w.r);
      const R2 = S(w.r);
      ctx2.beginPath();
      ctx2.arc(cx, cy, R2, 0, Math.PI * 2);
      ctx2.fillStyle = pal.wheel;
      ctx2.fill();
      ctx2.strokeStyle = pal.edge;
      ctx2.lineWidth = 2;
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.arc(cx, cy, R2 * 0.42, 0, Math.PI * 2);
      ctx2.strokeStyle = pal.lineStrong;
      ctx2.lineWidth = 1.5;
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(cx - R2, cy + 0.5);
      ctx2.lineTo(cx + R2, cy + 0.5);
      ctx2.moveTo(cx + 0.5, cy - R2);
      ctx2.lineTo(cx + 0.5, cy + R2);
      ctx2.strokeStyle = pal.lineFaint;
      ctx2.lineWidth = 1;
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(cx + 0.5, cy + R2);
      ctx2.lineTo(cx + 0.5, oy);
      ctx2.strokeStyle = pal.lineFaint;
      ctx2.setLineDash([3, 4]);
      ctx2.stroke();
      ctx2.setLineDash([]);
    }
    if (dim) {
      ctx2.globalAlpha = 0.45;
      bodyPath();
      ctx2.fillStyle = "#000";
      ctx2.fill();
      ctx2.globalAlpha = 1;
    }
    ctx2.restore();
    return {
      geom: g,
      anchors: [
        { id: "aoa", mm: [(p.noseLen + L - 8) / 2, (yFrontTop + yRearTop) / 2] },
        { id: "wheelDia", mm: [AXLE_FRONT, -rw] },
        { id: "ballastX", mm: [bx, bottom + 2.4] },
        { id: "wingDeg", mm: [L - 1, yRearTop - 1.4] },
        { id: "rideHeight", mm: [L * 0.62, bottom] },
        { id: "noseLen", mm: [p.noseLen * 0.5, yFrontTop + 3] }
      ].map((a) => ({ id: a.id, x: X(a.mm[0]), y: Y(a.mm[1]) }))
    };
  }

  // src/main.js
  var W = 1080;
  var H = 1920;
  var M = 56;
  var R = W - M;
  var PAL = {
    ink: "#0B0B0C",
    panel: "#111114",
    panelEdge: "rgba(242,240,235,0.16)",
    line: "rgba(242,240,235,0.20)",
    lineFaint: "rgba(242,240,235,0.09)",
    lineStrong: "rgba(242,240,235,0.34)",
    paper: "#F2F0EB",
    paperDim: "#B9B6AF",
    body: "#E8E5DE",
    hatch: "rgba(11,11,12,0.085)",
    edge: "#0B0B0C",
    ballast: "#E8590C",
    wing: "#D6D2C9",
    wheel: "#1D1D20",
    accent: "#E8590C",
    accentLit: "#FF6B1A",
    good: "#16D97F",
    inkOnPaper: "#0B0B0C",
    muteOnPaper: "#4A4A50"
  };
  var A = { aoa: 4, wheelDia: 30, ballastX: 152, wingDeg: 0, rideHeight: 4, noseLen: 34 };
  var B = { aoa: 2, wheelDia: 26, ballastX: 118, wingDeg: 8, rideHeight: 7.5, noseLen: 28 };
  var BODY_MASS0 = 0.02012;
  var CLASS_MASS = 0.065;
  var WHEEL_M = 372e-5;
  var AXLE_F = 0.03;
  var AXLE_R = 0.17;
  var WHEELBASE = AXLE_R - AXLE_F;
  function wheelsFor(diaMm) {
    const m = WHEEL_M * Math.pow(diaMm / 30, 2);
    return [0, 1, 2, 3].map(() => ({ mass: m, dia: diaMm }));
  }
  function areaFor(rideHeight, noseLen) {
    return A0 * (1 + 0.01 * (rideHeight - 4)) * (1 + 0.012 * (34 - noseLen));
  }
  function metrics(p) {
    const cd = CD0 + AOA_CD_PER_DEG * Math.abs(p.aoa) + WING_CD_PER_DEG * Math.abs(p.wingDeg);
    const area = areaFor(p.rideHeight, p.noseLen);
    const bodyM = BODY_MASS0 + (p.noseLen - 34) * 15e-5;
    const wheels = wheelsFor(p.wheelDia);
    const wheelTotal = wheels.reduce((s, w) => s + w.mass, 0);
    const totalMass = CLASS_MASS;
    const ballast = Math.max(0, CLASS_MASS - bodyM - wheelTotal);
    const em = effectiveMass(totalMass, wheels);
    const comX = (bodyM * 0.1 + ballast * (p.ballastX / 1e3) + wheelTotal / 2 * AXLE_F + wheelTotal / 2 * AXLE_R) / totalMass;
    const frontShare = (WHEELBASE - (comX - AXLE_F)) / WHEELBASE;
    const sim = simulate({ mEq: em.total, mBody: totalMass, cd, area });
    return {
      cd,
      area,
      bodyM,
      ballast,
      totalMass,
      mEq: em.total,
      rot: em.rot,
      comX,
      frontShare,
      time: sim.time,
      speed: sim.speed,
      dragEnd: dragForce(sim.speed, cd, area)
    };
  }
  var MA = metrics(A);
  var MB = metrics(B);
  var pct = (x, y) => (x - y) / y * 100;
  var f3 = (v) => v.toFixed(3);
  var DT = MB.time - MA.time;
  var DIFFS = [
    {
      id: "aoa",
      zh: "\u8FCE\u89D2",
      en: "ANGLE OF ATTACK",
      unit: "\xB0",
      a: A.aoa,
      b: B.aoa,
      why: () => {
        const cA = CD0 + AOA_CD_PER_DEG * A.aoa + WING_CD_PER_DEG * B.wingDeg;
        const cB = CD0 + AOA_CD_PER_DEG * B.aoa + WING_CD_PER_DEG * B.wingDeg;
        const dA = dragForce(MB.speed, cA, MA.area), dB = dragForce(MB.speed, cB, MA.area);
        return `Cd ${f3(cA)} \u2192 ${f3(cB)}\u300216.9 m/s \u65F6\u6C14\u52A8\u963B\u529B ${f3(dA)} N \u2192 ${f3(dB)} N\uFF0C\u5DEE ${Math.abs(pct(dB, dA)).toFixed(1)}%`;
      }
    },
    {
      id: "wheelDia",
      zh: "\u8F6E\u5F84",
      en: "WHEEL DIAMETER",
      unit: " mm",
      a: A.wheelDia,
      b: B.wheelDia,
      why: () => `\u8F6E\u5B50\u8981\u8DDF\u7740\u8F6C\uFF0C\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u91CC\u591A\u4E86 ${(MA.rot * 1e3).toFixed(1)} g \u2192 ${(MB.rot * 1e3).toFixed(1)} g\u3002\u5C0F\u8F6E\u8D77\u6B65\u5C11\u5403\u8F6C\u52A8\u60EF\u91CF\u7684\u4E8F\uFF0C\u4F46\u540C\u6837\u7684\u8F6E\u91CD\u538B\u5728\u66F4\u5C0F\u7684\u63A5\u5730\u9762\u4E0A\uFF0C\u6BD4\u538B\u5347\u9AD8`
    },
    {
      id: "ballastX",
      zh: "\u914D\u91CD\u4F4D\u7F6E",
      en: "BALLAST STATION",
      unit: " mm",
      a: A.ballastX,
      b: B.ballastX,
      why: () => `\u914D\u91CD\u5F80\u540E\u632A ${A.ballastX - B.ballastX} mm\uFF0C\u8D28\u5FC3\u5728 200 mm \u8F66\u8EAB\u4E0A\u540E\u79FB ${((MA.comX - MB.comX) * 1e3).toFixed(1)} mm\u3002\u524D\u8F74\u8377 ${(MA.frontShare * 100).toFixed(1)}% \u2192 ${(MB.frontShare * 100).toFixed(1)}%\uFF0C\u538B\u4E0D\u4F4F\u5934\u5C31\u66F4\u5BB9\u6613\u8E6D\u5BFC\u8F68`
    },
    {
      id: "wingDeg",
      zh: "\u5C3E\u7FFC\u89D2\u5EA6",
      en: "REAR WING ANGLE",
      unit: "\xB0",
      a: A.wingDeg,
      b: B.wingDeg,
      why: () => {
        const cA = CD0 + AOA_CD_PER_DEG * A.aoa + WING_CD_PER_DEG * A.wingDeg;
        const cB = CD0 + AOA_CD_PER_DEG * B.aoa + WING_CD_PER_DEG * B.wingDeg;
        const dA = dragForce(MB.speed, cA, MA.area), dB = dragForce(MB.speed, cB, MA.area);
        return `\u5C3E\u7FFC\u4ECE ${A.wingDeg}\xB0 \u6380\u5230 ${B.wingDeg}\xB0\uFF0CCd \u591A ${f3(cB - cA)}\uFF0C\u963B\u529B ${f3(dA)} N \u2192 ${f3(dB)} N\uFF0C\u9AD8\u51FA ${Math.abs(pct(dB, dA)).toFixed(0)}%`;
      }
    },
    {
      id: "rideHeight",
      zh: "\u79BB\u5730\u95F4\u9699",
      en: "RIDE HEIGHT",
      unit: " mm",
      a: A.rideHeight,
      b: B.rideHeight,
      why: () => `\u8F66\u62AC\u9AD8 ${(B.rideHeight - A.rideHeight).toFixed(1)} mm\uFF0C\u8FCE\u98CE\u9762\u79EF ${(areaFor(A.rideHeight, A.noseLen) * 1e4).toFixed(2)} \u2192 ${(areaFor(B.rideHeight, A.noseLen) * 1e4).toFixed(2)} \xD710\u207B\u2074 m\xB2\u3002\u8FD9\u4E00\u9879\u7EAF\u4E8F\uFF0C\u6CA1\u6709\u4EFB\u4F55\u8865\u507F`
    },
    {
      id: "noseLen",
      zh: "\u9F3B\u9525\u957F\u5EA6",
      en: "NOSE LENGTH",
      unit: " mm",
      a: A.noseLen,
      b: B.noseLen,
      why: () => `\u9F3B\u9525\u77ED ${(A.noseLen - B.noseLen).toFixed(0)} mm\uFF0C\u6536\u4E0D\u5C16\uFF0C\u8FCE\u98CE\u9762\u79EF ${(areaFor(A.rideHeight, A.noseLen) * 1e4).toFixed(2)} \u2192 ${(areaFor(A.rideHeight, B.noseLen) * 1e4).toFixed(2)} \xD710\u207B\u2074 m\xB2\u3002\u8F66\u4F53\u8F7B\u4E86 ${((MA.bodyM - MB.bodyM) * 1e3).toFixed(1)} g\uFF0C\u62B5\u4E0D\u8FC7\u591A\u51FA\u6765\u7684\u9762\u79EF`
    }
  ];
  var FOUND = /* @__PURE__ */ new Set();
  var lastFound = null;
  var misses = 0;
  var missAt = null;
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var PANEL_A = { x: M, y: 168, w: R - M, h: 302 };
  var PANEL_B = { x: M, y: 486, w: R - M, h: 302 };
  var REVEAL = { x: M, y: 806, w: R - M, h: 322 };
  var LIST = { x: M, y: 1170, w: R - M, h: 432 };
  var BAND = { y: 1626, h: 294 };
  var SCALE = 3.85;
  var hotspots = [];
  function carOrigin(panel) {
    const drawn = 236 * SCALE;
    return { ox: panel.x + (panel.w - drawn) / 2 + 10 * SCALE, oy: panel.y + 226 };
  }
  function T(str, x, y, size, weight, font, color, spacing = 0, align = "left") {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    return tracked(ctx, str, x, y, spacing, align);
  }
  function hair(y, x0 = M, x1 = R, c = PAL.panelEdge) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y + 0.5);
    ctx.lineTo(x1 + 0.5, y + 0.5);
    ctx.stroke();
  }
  function panelBox(p) {
    ctx.fillStyle = PAL.panel;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = PAL.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
  }
  function wrapText(str, x, y, maxW, lineH, size, weight, font, color, spacing) {
    ctx.font = `${weight} ${size}px ${font}`;
    let line = "";
    let cy = y;
    for (const ch of [...str]) {
      const test = line + ch;
      if (ctx.measureText(test).width + spacing * test.length > maxW && line) {
        T(line, x, cy, size, weight, font, color, spacing);
        cy += lineH;
        line = ch;
      } else line = test;
    }
    if (line) T(line, x, cy, size, weight, font, color, spacing);
    return cy;
  }
  function compose() {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, W, H);
    T("SPOT THE DIFFERENCE", M, 84, 13, 700, FONT_MONO, PAL.accentLit, 2.6);
    T("\u4E24\u53F0\u8F66\uFF0C\u516D\u4E2A\u5DE5\u7A0B\u53C2\u6570\u4E0D\u4E00\u6837", M, 126, 32, 600, FONT_DISP, PAL.paper, 0.4);
    T(`${FOUND.size} / ${DIFFS.length}`, R, 104, 46, 700, FONT_MONO, PAL.paper, -1.2, "right");
    T("\u5DF2\u627E\u5230", R - 122, 104, 13, 400, FONT_MONO, PAL.paperDim, 1.8, "right");
    hair(146);
    hotspots = [];
    for (const [panel, p, tag, met] of [[PANEL_A, A, "CAR A", MA], [PANEL_B, B, "CAR B", MB]]) {
      panelBox(panel);
      T(tag, panel.x + 22, panel.y + 34, 15, 700, FONT_MONO, PAL.accentLit, 2.4);
      T(`\u03C1 1.204 \xB7 L 20.0 m \xB7 Fp ${F_PEAK} N`, panel.x + panel.w - 22, panel.y + 34, 11, 400, FONT_MONO, PAL.paperDim, 1.2, "right");
      const { ox, oy } = carOrigin(panel);
      ctx.save();
      ctx.beginPath();
      ctx.rect(panel.x + 1, panel.y + 1, panel.w - 2, panel.h - 2);
      ctx.clip();
      const out = drawCar(ctx, { ox, oy, scale: SCALE, p, pal: PAL });
      ctx.restore();
      for (const cand of out.anchors) hotspots.push({ id: cand.id, x: cand.x, y: cand.y, r: 40 });
      const sy = panel.y + 266;
      const cells = [
        ["Cd", f3(met.cd)],
        ["A /10\u207B\u2074m\xB2", (met.area * 1e4).toFixed(2)],
        ["m_eq /g", (met.mEq * 1e3).toFixed(1)],
        ["CoM /mm", (met.comX * 1e3).toFixed(1)],
        ["t /s", f3(met.time)]
      ];
      const cw = (panel.w - 44) / cells.length;
      cells.forEach(([k, v], i) => {
        const cx = panel.x + 22 + i * cw;
        T(k, cx, sy - 15, 10, 400, FONT_MONO, PAL.paperDim, 1.1);
        T(v, cx, sy + 13, 21, 700, FONT_MONO, PAL.paper, -0.6);
      });
    }
    for (const h of hotspots) {
      if (!FOUND.has(h.id)) continue;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 25, 0, Math.PI * 2);
      ctx.strokeStyle = PAL.good;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(h.x - 9, h.y);
      ctx.lineTo(h.x - 2, h.y + 7);
      ctx.lineTo(h.x + 10, h.y - 8);
      ctx.strokeStyle = PAL.good;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (missAt) {
      ctx.beginPath();
      ctx.arc(missAt.x, missAt.y, 18, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(232,89,12,0.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    panelBox(REVEAL);
    const segY = REVEAL.y + REVEAL.h - 46;
    const segW = (REVEAL.w - 88 - 5 * 8) / 6;
    DIFFS.forEach((d, i) => {
      const sx = REVEAL.x + 34 + i * (segW + 8);
      ctx.fillStyle = FOUND.has(d.id) ? PAL.accent : "rgba(242,240,235,0.10)";
      ctx.fillRect(sx, segY, segW, 10);
    });
    if (lastFound) {
      const d = DIFFS.find((x) => x.id === lastFound);
      ctx.fillStyle = PAL.accent;
      ctx.fillRect(REVEAL.x + 1, REVEAL.y + 1, 7, REVEAL.h - 2);
      T(d.zh, REVEAL.x + 34, REVEAL.y + 58, 34, 600, FONT_DISP, PAL.paper, 0.4);
      T(d.en, REVEAL.x + 34, REVEAL.y + 84, 11, 400, FONT_MONO, PAL.accentLit, 2.4);
      T("CAR A", REVEAL.x + 34, REVEAL.y + 138, 10, 700, FONT_MONO, PAL.paperDim, 2.2);
      T(`${d.a}${d.unit}`, REVEAL.x + 34, REVEAL.y + 178, 30, 700, FONT_MONO, PAL.paper, -0.8);
      T("CAR B", REVEAL.x + 246, REVEAL.y + 138, 10, 700, FONT_MONO, PAL.paperDim, 2.2);
      T(`${d.b}${d.unit}`, REVEAL.x + 246, REVEAL.y + 178, 30, 700, FONT_MONO, PAL.accentLit, -0.8);
      ctx.strokeStyle = PAL.panelEdge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(REVEAL.x + 474.5, REVEAL.y + 108);
      ctx.lineTo(REVEAL.x + 474.5, REVEAL.y + 196);
      ctx.stroke();
      wrapText(d.why(), REVEAL.x + 502, REVEAL.y + 124, REVEAL.w - 540, 23, 14, 400, FONT_MONO, PAL.paper, 1.4);
    } else {
      T("\u70B9\u51FA\u4E24\u53F0\u8F66\u4E0D\u4E00\u6837\u7684\u5730\u65B9", REVEAL.x + 34, REVEAL.y + 62, 26, 600, FONT_DISP, PAL.paper, 0.4);
      wrapText(
        "\u6BCF\u4E00\u5904\u5DEE\u5F02\u90FD\u5BF9\u5E94\u4E00\u4E2A\u771F\u5B9E\u53C2\u6570\uFF1A\u8FCE\u89D2\u3001\u8F6E\u5F84\u3001\u914D\u91CD\u4F4D\u7F6E\u3001\u5C3E\u7FFC\u89D2\u5EA6\u3001\u79BB\u5730\u95F4\u9699\u3001\u9F3B\u9525\u957F\u5EA6\u3002\u70B9\u4E2D\u4E4B\u540E\u8FD9\u91CC\u7ED9\u51FA\u4E24\u53F0\u8F66\u7684\u6570\u503C\u548C\u5B83\u5E26\u6765\u7684\u540E\u679C\u3002\u70B9\u9519\u4E0D\u6263\u5206\uFF0C\u53EA\u8BA1\u6570\u3002",
        REVEAL.x + 34,
        REVEAL.y + 108,
        REVEAL.w - 68,
        25,
        15,
        400,
        FONT_MONO,
        PAL.paperDim,
        1.4
      );
      T("\u8FDB\u5EA6", REVEAL.x + 34, segY - 16, 10, 400, FONT_MONO, PAL.paperDim, 1.8);
    }
    T("\u68C0\u67E5\u8868  CHECKLIST", M, LIST.y - 22, 11, 700, FONT_MONO, PAL.paperDim, 2.4);
    const rowH = 72;
    DIFFS.forEach((d, i) => {
      const ry = LIST.y + i * rowH;
      const got = FOUND.has(d.id);
      if (i > 0) hair(ry - 14, M, R, PAL.lineFaint);
      T(String(i + 1).padStart(2, "0"), M, ry + 36, 15, 700, FONT_MONO, got ? PAL.accentLit : "rgba(242,240,235,0.40)", 1.6);
      T(d.zh, M + 50, ry + 30, 20, 600, FONT_DISP, got ? PAL.paper : "rgba(242,240,235,0.56)", 0.3);
      T(d.en, M + 50, ry + 50, 10, 400, FONT_MONO, got ? PAL.paperDim : "rgba(242,240,235,0.32)", 1.6);
      T(
        got ? `${d.a}${d.unit}  /  ${d.b}${d.unit}` : "\u2014  /  \u2014",
        R,
        ry + 36,
        17,
        got ? 700 : 400,
        FONT_MONO,
        got ? PAL.paper : "rgba(242,240,235,0.40)",
        got ? -0.4 : 1.2,
        "right"
      );
    });
    ctx.fillStyle = PAL.paper;
    ctx.fillRect(0, BAND.y, W, BAND.h);
    ctx.fillStyle = PAL.accent;
    ctx.fillRect(0, BAND.y, 12, BAND.h);
    T("\u516D\u9879\u5DEE\u5F02\u5408\u8BA1  TOTAL EFFECT ON THE RUN", M, BAND.y + 44, 11, 700, FONT_MONO, PAL.muteOnPaper, 2.2);
    const cols = [
      ["CAR A", f3(MA.time)],
      ["CAR B", f3(MB.time)],
      [DT >= 0 ? "B \u6162\u4E8E A" : "B \u5FEB\u4E8E A", Math.abs(DT).toFixed(3)]
    ];
    cols.forEach(([label, val], i) => {
      const cx = M + i * 336;
      T(label, cx, BAND.y + 88, 10, 700, FONT_MONO, PAL.muteOnPaper, 2.2);
      const wv = T(val, cx, BAND.y + 146, 50, 700, FONT_MONO, PAL.inkOnPaper, -1.6);
      T(" s", cx + wv + 6, BAND.y + 146, 22, 700, FONT_MONO, PAL.muteOnPaper, 0);
    });
    ctx.strokeStyle = "rgba(11,11,12,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M + 0.5, BAND.y + 172);
    ctx.lineTo(R + 0.5, BAND.y + 172);
    ctx.stroke();
    T(
      `Cd ${f3(MA.cd)} \u2192 ${f3(MB.cd)}    A/10\u207B\u2074m\xB2 ${(MA.area * 1e4).toFixed(2)} \u2192 ${(MB.area * 1e4).toFixed(2)}    m_eq/g ${(MA.mEq * 1e3).toFixed(1)} \u2192 ${(MB.mEq * 1e3).toFixed(1)}`,
      M,
      BAND.y + 204,
      14,
      400,
      FONT_MONO,
      PAL.inkOnPaper,
      1.2
    );
    T(
      "B \u8D62\u5728\u8FCE\u89D2\u548C\u8F6E\u5F84\uFF0C\u8F93\u5728\u5C3E\u7FFC\u3001\u79BB\u5730\u95F4\u9699\u548C\u9F3B\u9525\u4E09\u9879\u3002",
      M,
      BAND.y + 234,
      14,
      400,
      FONT_MONO,
      PAL.muteOnPaper,
      1.2
    );
    ctx.strokeStyle = "rgba(11,11,12,0.14)";
    ctx.beginPath();
    ctx.moveTo(M + 0.5, BAND.y + 254);
    ctx.lineTo(R + 0.5, BAND.y + 254);
    ctx.stroke();
    T(`MISCLICKS ${misses}`, M, BAND.y + 278, 11, 400, FONT_MONO, PAL.muteOnPaper, 2.2);
    T(
      FOUND.size === DIFFS.length ? "ALL 6 FOUND" : "1080 \xD7 1920 \xB7 PNG \xB7 LOCAL RENDER",
      R,
      BAND.y + 278,
      11,
      FOUND.size === DIFFS.length ? 700 : 400,
      FONT_MONO,
      FOUND.size === DIFFS.length ? PAL.accent : PAL.muteOnPaper,
      2.2,
      "right"
    );
  }
  function canvasPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / r.width * W,
      y: (ev.clientY - r.top) / r.height * H
    };
  }
  canvas.addEventListener("click", (ev) => {
    const p = canvasPoint(ev);
    let best = null, bestD = Infinity;
    for (const h of hotspots) {
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d < h.r && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    if (best && FOUND.has(best.id)) {
      lastFound = best.id;
      missAt = null;
    } else if (best) {
      FOUND.add(best.id);
      lastFound = best.id;
      missAt = null;
    } else {
      misses += 1;
      missAt = p;
      clearTimeout(missAt._t);
      missAt._t = setTimeout(() => {
        missAt = null;
        compose();
      }, 380);
    }
    const el = document.getElementById("count");
    if (el) el.textContent = `${FOUND.size} / ${DIFFS.length}`;
    compose();
  });
  canvas.addEventListener("mousemove", (ev) => {
    const p = canvasPoint(ev);
    const over = hotspots.some((h) => !FOUND.has(h.id) && Math.hypot(h.x - p.x, h.y - p.y) < h.r);
    canvas.style.cursor = over ? "crosshair" : "default";
  });
  var errs = [];
  if (DIFFS.length !== 6) errs.push(`\u671F\u671B 6 \u5904\u5DEE\u5F02\uFF0C\u5B9E\u9645 ${DIFFS.length}`);
  for (const d of DIFFS) {
    if (!Number.isFinite(d.a) || !Number.isFinite(d.b)) errs.push(`${d.id} \u4E0D\u662F\u6570\u503C`);
    if (d.a === d.b) errs.push(`${d.id} \u4E24\u8FB9\u4E00\u6837\uFF0C\u4E0D\u6784\u6210\u5DEE\u5F02`);
  }
  for (const m of [MA, MB]) {
    for (const [k, v] of Object.entries(m)) {
      if (!Number.isFinite(v)) errs.push(`metrics.${k} \u4E0D\u662F\u6709\u9650\u6570`);
    }
  }
  window.__app = {
    canvas,
    hotspots: () => hotspots.map(({ id, x, y, r }) => ({ id, x, y, r })),
    getState: () => ({ found: [...FOUND], misses, lastFound }),
    getMetrics: () => ({
      A: { ...MA, params: { ...A } },
      B: { ...MB, params: { ...B } },
      diffs: DIFFS.length,
      found: FOUND.size,
      deltaT: DT
    }),
    set: (k, v) => {
      if (k === "found") {
        FOUND.clear();
        for (const id of v || []) FOUND.add(id);
        lastFound = (v || [])[v.length - 1] || null;
      }
      if (k === "reset") {
        FOUND.clear();
        lastFound = null;
        misses = 0;
        missAt = null;
      }
      compose();
    },
    revealAll: () => {
      for (const d of DIFFS) FOUND.add(d.id);
      lastFound = DIFFS[DIFFS.length - 1].id;
      compose();
      return FOUND.size;
    },
    selfTest: () => {
      const e = [...errs];
      if (hotspots.length !== DIFFS.length * 2) e.push(`\u70ED\u70B9 ${hotspots.length} \u4E2A\uFF0C\u671F\u671B ${DIFFS.length * 2}`);
      for (const h of hotspots) {
        if (!(h.x > 0 && h.x < W && h.y > 0 && h.y < H)) e.push(`\u70ED\u70B9 ${h.id} \u8D8A\u754C (${h.x.toFixed(0)},${h.y.toFixed(0)})`);
      }
      if (!(MA.time > 0.5 && MA.time < 4)) e.push(`A \u6210\u7EE9 ${MA.time} \u4E0D\u5408\u7406`);
      if (!(MB.time > 0.5 && MB.time < 4)) e.push(`B \u6210\u7EE9 ${MB.time} \u4E0D\u5408\u7406`);
      return { ok: e.length === 0, errs: e };
    },
    exportPNG: async () => {
      compose();
      const b = await toPNG(canvas, { width: 1080, height: 1920 });
      await assertPNG(b);
      return b.size;
    },
    exportCover: async () => {
      compose();
      const b = await toPNG(canvas, { width: 1080, height: 1350 });
      await assertPNG(b);
      return b.size;
    },
    downloadAll: () => exportEpisode(canvas, "spot-diff-car")
  };
  compose();
})();
