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

  // src/car.js
  var CAR_MM = 200;
  var AXLE_FRONT = 30;
  var AXLE_REAR = 170;
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
      const R = S(w.r);
      ctx2.beginPath();
      ctx2.arc(cx, cy, R, 0, Math.PI * 2);
      ctx2.fillStyle = pal.wheel;
      ctx2.fill();
      ctx2.strokeStyle = pal.edge;
      ctx2.lineWidth = 2;
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
      ctx2.strokeStyle = pal.lineStrong;
      ctx2.lineWidth = 1.5;
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(cx - R, cy + 0.5);
      ctx2.lineTo(cx + R, cy + 0.5);
      ctx2.moveTo(cx + 0.5, cy - R);
      ctx2.lineTo(cx + 0.5, cy + R);
      ctx2.strokeStyle = pal.lineFaint;
      ctx2.lineWidth = 1;
      ctx2.stroke();
      ctx2.beginPath();
      ctx2.moveTo(cx + 0.5, cy + R);
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

  // src/physics.js
  var RHO = 1.204;
  var G = 9.81;
  var TRACK_LEN = 20;
  var CD0 = 0.34;
  var A0 = 16e-4;
  var CRR = 8e-3;
  var F_PEAK = 21;
  var T_BURN = 0.11;
  var AXLE_F = 0.03;
  var AXLE_R = 0.17;
  var WHEELBASE = AXLE_R - AXLE_F;
  var AOA_CD_PER_DEG = 0.045;
  var WING_CD_PER_DEG = 0.038;
  var WHEEL_INERTIA_K = 1;
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
  var M_YAW_LIMIT = 596e-5;
  var FRONT_SHARE_REF = 0.5;
  var D_LAT_LIMIT = M_YAW_LIMIT / (F_PEAK * FRONT_SHARE_REF);

  // src/parts.js
  var CLASS_MASS = 0.065;
  var REF_MASS = 0.065;
  var REF_MEQ = 0.07988;
  var REF_RATIO = REF_MEQ / REF_MASS;
  var MEQ_RATIO_LIMIT = 1.32;
  var WING_STATION = 0.188;
  var GROUPS = [
    {
      id: "body",
      zh: "\u8F66\u8EAB",
      en: "BODY SHELL",
      options: [
        { id: "std", name: "\u6807\u51C6\u58F3", mass: 0.02012, cd0: 0.3, aoa: 3.5, noseLen: 34, rideHeight: 4, areaK: 1, comStation: 0.1 },
        { id: "short", name: "\u77ED\u9F3B", mass: 0.0192, cd0: 0.325, aoa: 4.5, noseLen: 24, rideHeight: 4.2, areaK: 1.04, comStation: 0.096 },
        { id: "long", name: "\u957F\u5C3E\u4F4E\u963B", mass: 0.0214, cd0: 0.285, aoa: 2.5, noseLen: 46, rideHeight: 3.4, areaK: 0.97, comStation: 0.106 }
      ]
    },
    {
      id: "wheel",
      zh: "\u8F6E\u7EC4",
      en: "WHEEL SET",
      options: [
        { id: "w26", name: "\u8F7B\u91CF 26", dia: 26, mass: 279e-5 },
        { id: "w30", name: "\u6807\u51C6 30", dia: 30, mass: 372e-5 },
        { id: "w34", name: "\u5BBD\u4F53 34", dia: 34, mass: 478e-5 }
      ]
    },
    {
      id: "ballast",
      zh: "\u914D\u91CD",
      en: "BALLAST",
      options: [
        { id: "bL", name: "\u8F7B 16 g \u524D\u5DE6", mass: 0.016, station: 0.116, lateral: -26e-4 },
        { id: "bM", name: "\u6807 30 g \u4E2D\u7F6E", mass: 0.03, station: 0.15, lateral: 0 },
        { id: "bH", name: "\u91CD 36 g \u540E\u53F3", mass: 0.036, station: 0.172, lateral: 34e-4 }
      ]
    },
    {
      id: "wing",
      zh: "\u5C3E\u7FFC",
      en: "REAR WING",
      options: [
        { id: "none", name: "\u65E0\u5C3E\u7FFC", deg: 0, mass: 0 },
        { id: "low", name: "\u4F4E\u963B 4\xB0", deg: 4, mass: 16e-4 },
        { id: "big", name: "\u5927\u5C3E\u7FFC 9\xB0", deg: 9, mass: 32e-4 }
      ]
    }
  ];
  var DEFAULT_SEL = { body: 0, wheel: 1, ballast: 1, wing: 1 };
  var pick = (group, i) => GROUPS.find((g) => g.id === group).options[i];
  function bodyArea(body) {
    return A0 * (1 + 0.01 * (body.rideHeight - 4)) * (1 + 0.012 * (34 - body.noseLen)) * body.areaK;
  }
  function evaluate(sel) {
    const body = pick("body", sel.body);
    const wheel = pick("wheel", sel.wheel);
    const ballast = pick("ballast", sel.ballast);
    const wing = pick("wing", sel.wing);
    const wheelMass = 4 * wheel.mass;
    const parts = [
      { group: "body", name: body.name, mass: body.mass },
      { group: "wheel", name: wheel.name, mass: wheelMass },
      { group: "ballast", name: ballast.name, mass: ballast.mass },
      { group: "wing", name: wing.name, mass: wing.mass }
    ];
    const m = parts.reduce((s, p) => s + p.mass, 0);
    const rot = WHEEL_INERTIA_K * wheelMass;
    const mEq = m + rot;
    const cd = body.cd0 + AOA_CD_PER_DEG * body.aoa + WING_CD_PER_DEG * wing.deg;
    const area = bodyArea(body);
    const comX = (body.mass * body.comStation + ballast.mass * ballast.station + wing.mass * WING_STATION + 2 * wheel.mass * AXLE_F + 2 * wheel.mass * AXLE_R) / m;
    const comLat = ballast.mass * ballast.lateral / m;
    const b = Math.max(0, AXLE_R - comX);
    const frontShare = b / WHEELBASE;
    const mYaw = F_PEAK * Math.abs(comLat) * frontShare;
    const sim = simulate({ mEq, mBody: m, cd, area });
    const ratio = mEq / m;
    const warnings = [
      {
        id: "lat",
        zh: "\u8D28\u5FC3\u6A2A\u5411\u504F\u79FB",
        en: "CoM LATERAL OFFSET",
        value: Math.abs(comLat) * 1e3,
        limit: D_LAT_LIMIT * 1e3,
        unit: "mm",
        digits: 3,
        tripped: Math.abs(comLat) > D_LAT_LIMIT
      },
      {
        id: "yaw",
        zh: "\u524D\u8F6E\u6297\u504F\u822A\u529B\u77E9\u9700\u6C42",
        en: "FRONT YAW MOMENT",
        value: mYaw * 1e3,
        limit: M_YAW_LIMIT * 1e3,
        unit: "mN\xB7m",
        digits: 2,
        tripped: mYaw > M_YAW_LIMIT
      },
      {
        id: "meq",
        zh: "\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u6BD4",
        en: "EFFECTIVE INERTIA RATIO",
        value: ratio,
        limit: MEQ_RATIO_LIMIT,
        unit: "",
        digits: 3,
        tripped: ratio > MEQ_RATIO_LIMIT
      }
    ];
    return {
      sel: { ...sel },
      parts,
      m,
      rot,
      mEq,
      cd,
      area,
      comX,
      comLat,
      frontShare,
      mYaw,
      ratio,
      time: sim.time,
      speed: sim.speed,
      massSum: parts.reduce((s, p) => s + p.mass, 0),
      overClassMass: m > CLASS_MASS + 1e-9,
      anyTripped: warnings.some((w) => w.tripped),
      warnings,
      body,
      wheel,
      ballast,
      wing
    };
  }

  // src/main.js
  var W = 1080;
  var H = 1920;
  var SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  var INK = "#0B0B0C";
  var PAPER = "#F2F0EB";
  var ACCENT = "#E8590C";
  var ALARM = "#FF3B30";
  var OK = "#4FA65B";
  var MUTED = "rgba(242,240,235,0.55)";
  var DIM = "rgba(242,240,235,0.34)";
  var HAIR = "rgba(242,240,235,0.16)";
  var MONO = '"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace';
  var DISP = '"Barlow Condensed","Archivo Narrow",Oswald,"Microsoft YaHei","Noto Sans SC",sans-serif';
  var PAL = {
    line: "rgba(242,240,235,0.50)",
    lineFaint: "rgba(242,240,235,0.18)",
    lineStrong: "rgba(242,240,235,0.80)",
    body: "#2a2a32",
    hatch: "rgba(242,240,235,0.12)",
    edge: "rgba(242,240,235,0.42)",
    ballast: "#E8590C",
    wing: "#3a3a44",
    wheel: "#151518"
  };
  var stage = document.getElementById("stage");
  var ctx = stage.getContext("2d");
  var state = { sel: { ...DEFAULT_SEL } };
  var cur = () => evaluate(state.sel);
  function compose() {
    const r = cur();
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    drawHeader(r);
    drawCarPanel(r);
    drawWarnings(r);
    drawKPI(r);
    drawParts(r);
    drawFooter(r);
  }
  function drawHeader(r) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ACCENT;
    ctx.fillRect(SAFE.x0, 296, 46, 3);
    ctx.fillStyle = DIM;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u7EC4\u522B\u9650\u91CD 65 g \xB7 \u6807\u5B9A\u8F66 79.88 g \xB7 21 N / 110 ms", SAFE.x0, 316);
    ctx.fillStyle = MUTED;
    ctx.font = "500 17px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("ASSEMBLY BAY", SAFE.x0, 348);
    ctx.fillStyle = PAPER;
    ctx.font = "600 60px " + DISP;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
    ctx.fillText("\u88C5\u8F66\u53F0", SAFE.x0, 424);
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u6574\u8F66\u8D28\u91CF", SAFE.x1, 348);
    ctx.fillStyle = r.overClassMass ? ALARM : PAPER;
    ctx.font = "600 54px " + DISP;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillText((r.m * 1e3).toFixed(1), SAFE.x1, 406);
    const mw = ctx.measureText((r.m * 1e3).toFixed(1)).width;
    ctx.fillStyle = r.overClassMass ? ALARM : MUTED;
    ctx.font = "500 22px " + MONO;
    ctx.fillText("g", SAFE.x1 - mw - 6, 406);
    ctx.fillStyle = DIM;
    ctx.font = "500 15px " + MONO;
    ctx.fillText("\u7EC4\u522B\u9650\u91CD " + (CLASS_MASS * 1e3).toFixed(0) + " g", SAFE.x1, 430);
    ctx.fillStyle = HAIR;
    ctx.fillRect(SAFE.x0, 458, SAFE.x1 - SAFE.x0, 1);
    ctx.restore();
  }
  function drawCarPanel(r) {
    const p = {
      wheelDia: r.wheel.dia,
      rideHeight: r.body.rideHeight,
      aoa: r.body.aoa,
      noseLen: r.body.noseLen,
      ballastX: r.ballast.station * 1e3,
      wingDeg: r.wing.deg
    };
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = DIM;
    ctx.font = "500 15px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u8F66\u957F 200 mm", SAFE.x0, 516);
    ctx.fillText("\u8F74\u8DDD " + 140 .toFixed(0) + " mm", SAFE.x0 + 250, 516);
    ctx.fillText("\u8F6E\u5F84 " + r.wheel.dia + " mm", SAFE.x0 + 520, 516);
    ctx.fillText("\u8FCE\u98CE " + (r.area * 1e6).toFixed(0) + " cm\xB2", SAFE.x0 + 730, 516);
    ctx.restore();
    ctx.save();
    drawCar(ctx, { ox: SAFE.x0 + 8, oy: 742, scale: 5.2, p, pal: PAL });
    ctx.restore();
  }
  function drawWarnings(r) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const top = 812;
    ctx.fillStyle = HAIR;
    ctx.fillRect(SAFE.x0, top, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u4E09\u6761\u9650\u503C", SAFE.x0, top + 34);
    let y = top + 82;
    for (const w of r.warnings) {
      ctx.fillStyle = w.tripped ? ALARM : OK;
      ctx.fillRect(SAFE.x0, y - 19, 3, 28);
      ctx.fillStyle = w.tripped ? ALARM : PAPER;
      ctx.font = "500 24px " + MONO;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.fillText(w.zh, SAFE.x0 + 16, y);
      ctx.textAlign = "right";
      ctx.fillStyle = w.tripped ? ALARM : PAPER;
      ctx.font = "600 27px " + MONO;
      ctx.fillText(w.value.toFixed(w.digits), SAFE.x1 - 132, y);
      ctx.fillStyle = DIM;
      ctx.font = "500 18px " + MONO;
      ctx.fillText("/ " + w.limit.toFixed(w.digits), SAFE.x1 - 62, y);
      ctx.fillStyle = MUTED;
      ctx.font = "500 17px " + MONO;
      ctx.fillText(w.unit || "\u2014", SAFE.x1, y);
      ctx.textAlign = "left";
      y += 62;
    }
    ctx.restore();
  }
  function drawKPI(r) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const y = 1064;
    ctx.fillStyle = HAIR;
    ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("20 m \u6210\u7EE9", SAFE.x0, y + 34);
    ctx.fillStyle = PAPER;
    ctx.font = "600 76px " + DISP;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillText(r.time.toFixed(3), SAFE.x0, y + 108);
    const tw = ctx.measureText(r.time.toFixed(3)).width;
    ctx.fillStyle = MUTED;
    ctx.font = "500 24px " + MONO;
    ctx.fillText("s", SAFE.x0 + tw + 8, y + 108);
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u672B\u901F\u5EA6", SAFE.x0 + 380, y + 34);
    ctx.fillStyle = PAPER;
    ctx.font = "600 56px " + DISP;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillText(r.speed.toFixed(2), SAFE.x0 + 380, y + 96);
    ctx.fillStyle = MUTED;
    ctx.font = "500 20px " + MONO;
    ctx.fillText("m/s", SAFE.x0 + 380 + ctx.measureText(r.speed.toFixed(2)).width * 1.6 + 68, y + 96);
    ctx.textAlign = "right";
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u7B49\u6548\u60EF\u6027\u6BD4", SAFE.x1, y + 34);
    const over = r.ratio > MEQ_RATIO_LIMIT;
    ctx.fillStyle = over ? ALARM : PAPER;
    ctx.font = "600 56px " + DISP;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillText(r.ratio.toFixed(3), SAFE.x1, y + 96);
    ctx.fillStyle = DIM;
    ctx.font = "500 15px " + MONO;
    ctx.fillText("\u57FA\u51C6 " + REF_RATIO.toFixed(3) + " \xB7 \u4E0A\u9650 " + MEQ_RATIO_LIMIT.toFixed(2), SAFE.x1, y + 122);
    ctx.restore();
  }
  function drawParts(r) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const y = 1222;
    ctx.fillStyle = HAIR;
    ctx.fillRect(SAFE.x0, y, SAFE.x1 - SAFE.x0, 1);
    ctx.fillStyle = MUTED;
    ctx.font = "500 16px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("\u5F53\u524D\u88C5\u6CD5", SAFE.x0, y + 32);
    const rows = [
      ["\u8F66\u8EAB", r.body.name, (r.body.mass * 1e3).toFixed(2) + " g"],
      ["\u8F66\u8F6E \xD74", r.wheel.name, (r.wheel.mass * 4 * 1e3).toFixed(2) + " g"],
      ["\u914D\u91CD", r.ballast.name, (r.ballast.mass * 1e3).toFixed(2) + " g"],
      ["\u5C3E\u7FFC", r.wing.name, (r.wing.mass * 1e3).toFixed(2) + " g"]
    ];
    let ry = y + 74;
    for (const [lab, name, mass] of rows) {
      ctx.fillStyle = DIM;
      ctx.font = "500 18px " + MONO;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
      ctx.fillText(lab, SAFE.x0, ry);
      ctx.fillStyle = PAPER;
      ctx.font = "500 22px " + MONO;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.fillText(name, SAFE.x0 + 148, ry);
      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.font = "500 20px " + MONO;
      ctx.fillText(mass, SAFE.x1, ry);
      ctx.textAlign = "left";
      ry += 46;
    }
    ctx.restore();
  }
  function drawFooter(r) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = MUTED;
    ctx.font = "500 15px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
    ctx.fillText("STEM RACING \xB7 ASSEMBLY", SAFE.x0, 1472);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(242,240,235,0.32)";
    ctx.font = "500 15px " + MONO;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    const ci = r.sel.body * 27 + r.sel.wheel * 9 + r.sel.ballast * 3 + r.sel.wing + 1;
    ctx.fillText("\u88C5\u6CD5 " + ci + " / 81 \xB7 \u8D28\u5FC3\u7AD9 " + (r.comX * 1e3).toFixed(1) + " mm \xB7 \u6A2A\u5411 " + (r.comLat * 1e3).toFixed(3) + " mm", SAFE.x1, 1472);
    ctx.restore();
  }
  function buildPanel() {
    const panel = document.getElementById("panel");
    if (!panel) return;
    const selEls = {};
    const host = document.createElement("div");
    panel.insertBefore(host, panel.querySelector("#export") || null);
    GROUPS.forEach((g, gi) => {
      const row = document.createElement("div");
      row.className = "row";
      const lab = document.createElement("span");
      lab.className = "lab";
      lab.textContent = g.label || g.id;
      row.appendChild(lab);
      const bar = document.createElement("div");
      bar.className = "seg";
      g.options.forEach((o, oi) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "segbtn";
        b.dataset.group = g.id;
        b.dataset.index = String(oi);
        b.textContent = o.name;
        b.addEventListener("click", () => {
          state.sel[g.id] = oi;
          syncPanel();
          compose();
        });
        bar.appendChild(b);
      });
      row.appendChild(bar);
      host.appendChild(row);
      selEls[g.id] = bar;
    });
    function syncPanel() {
      for (const g of GROUPS) {
        const bar = selEls[g.id];
        if (!bar) continue;
        for (const b of bar.children) {
          const on = Number(b.dataset.index) === Number(state.sel[g.id]);
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        }
      }
    }
    const btn = document.getElementById("export");
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = "\u5BFC\u51FA\u4E2D\u2026";
        try {
          compose();
          await new Promise((r) => setTimeout(r, 60));
          await window.__app.downloadAll();
        } finally {
          btn.disabled = false;
          btn.textContent = old;
        }
      });
    }
    syncPanel();
  }
  function hashOf(canvas) {
    const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 97) {
      h ^= d[i];
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  window.__app = {
    canvas: stage,
    safe: SAFE,
    ready: () => Promise.resolve(),
    getState: () => ({ sel: { ...state.sel } }),
    getMetrics: () => {
      const r = cur();
      return {
        sel: { ...state.sel },
        m: r.m,
        mEq: r.mEq,
        ratio: r.ratio,
        comX: r.comX,
        comLat: r.comLat,
        frontShare: r.frontShare,
        mYaw: r.mYaw,
        cd: r.cd,
        area: r.area,
        time: r.time,
        speed: r.speed,
        overClassMass: r.overClassMass,
        anyTripped: r.anyTripped,
        warnings: r.warnings.map((w) => ({ id: w.id, value: w.value, limit: w.limit, tripped: w.tripped })),
        limits: { D_LAT: D_LAT_LIMIT, M_YAW: M_YAW_LIMIT, MEQ: MEQ_RATIO_LIMIT },
        groups: GROUPS.map((g) => ({ id: g.id, options: g.options.map((o) => o.name) }))
      };
    },
    set: (k, val) => {
      if (k === "sel") state.sel = { ...state.sel, ...val };
      else if (GROUPS.some((g) => g.id === k)) state.sel[k] = val;
      buildPanel.sync && buildPanel.sync();
      compose();
      const panel = document.getElementById("panel");
      if (panel) {
        for (const b of panel.querySelectorAll(".segbtn")) {
          const on = Number(b.dataset.index) === Number(state.sel[b.dataset.group]);
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        }
      }
    },
    pixelHash: () => hashOf(stage),
    selfTest: () => {
      const errs = [];
      const derived = M_YAW_LIMIT / (21 * 0.5);
      if (Math.abs(D_LAT_LIMIT - derived) > 1e-12) {
        errs.push(`D_LAT_LIMIT ${D_LAT_LIMIT} \u4E0E\u53CD\u63A8\u503C ${derived} \u4E0D\u7B26`);
      }
      if (Math.abs(D_LAT_LIMIT - 132e-5) < 1e-6) {
        errs.push("D_LAT_LIMIT \u8FD8\u662F\u65E7\u7684 1.32 mm\uFF0C\u6CA1\u6362\u6210 21 N \u4E0B\u7684\u503C");
      }
      const r0 = evaluate(DEFAULT_SEL);
      if (Math.abs(r0.parts.reduce((s, p) => s + p.mass, 0) - r0.m) > 1e-12) {
        errs.push("\u96F6\u4EF6\u8D28\u91CF\u4E4B\u548C\u4E0E\u6574\u8F66\u8D28\u91CF\u4E0D\u7B26");
      }
      const all = [];
      for (let a = 0; a < GROUPS[0].options.length; a++)
        for (let b = 0; b < GROUPS[1].options.length; b++)
          for (let c = 0; c < GROUPS[2].options.length; c++)
            for (let d = 0; d < GROUPS[3].options.length; d++)
              all.push(evaluate({ body: a, wheel: b, ballast: c, wing: d }));
      if (all.length !== 81) errs.push("\u7EC4\u5408\u6570\u4E0D\u662F 81\uFF0C\u5B9E\u9645 " + all.length);
      for (const r of all) {
        if (!(r.time > 0.9 && r.time < 1.6)) errs.push(`\u7EC4\u5408\u6210\u7EE9\u8D8A\u754C ${r.time.toFixed(3)} s`);
      }
      for (const id of ["lat", "yaw", "meq"]) {
        const hits = all.filter((r) => r.warnings.find((w) => w.id === id).tripped).length;
        if (hits === 0) errs.push(`\u9650\u503C\u300C${id}\u300D\u5728 81 \u79CD\u88C5\u6CD5\u91CC\u4E00\u6B21\u90FD\u6CA1\u89E6\u53D1\uFF0C\u7B49\u4E8E\u6CA1\u6709\u7EA6\u675F`);
      }
      for (const r of all) {
        if (r.ballast.lateral > 0 && r.comLat < -1e-12) errs.push("\u914D\u91CD\u504F\u53F3\u4F46\u8D28\u5FC3\u504F\u5DE6");
        if (r.ballast.lateral < 0 && r.comLat > 1e-12) errs.push("\u914D\u91CD\u504F\u5DE6\u4F46\u8D28\u5FC3\u504F\u53F3");
      }
      const t = all.slice().sort((x, y) => Math.abs(x.comLat) - Math.abs(y.comLat));
      let prev = -1;
      for (const r of t) {
        const expectMono = Math.abs(r.comLat) >= prev - 1e-12;
        if (!expectMono) {
          errs.push("\u504F\u822A\u9700\u6C42\u4E0D\u968F\u6A2A\u5411\u504F\u79FB\u5355\u8C03");
          break;
        }
        prev = Math.abs(r.comLat);
      }
      const w0 = evaluate({ ...DEFAULT_SEL, wheel: 0 });
      const w2 = evaluate({ ...DEFAULT_SEL, wheel: 2 });
      if (Math.abs(w2.ratio - w0.ratio) < 1e-6) errs.push("\u6362\u8F6E\u5B50\u6CA1\u6709\u6539\u53D8\u7B49\u6548\u60EF\u6027\u8D28\u91CF\u6BD4");
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
    downloadAll: () => exportEpisode(stage, "build-a-car")
  };
  compose();
  buildPanel();
})();
