/* One drawing routine, two parameter sets. Every difference the player can find
   is a real change to a number this function consumes — nothing is recoloured
   or nudged to manufacture a difference.

   Local units are millimetres. The car is 200 mm long; y is negative upwards
   from the track surface (y = 0). Multiply by `scale` to get canvas pixels. */

export const CAR_MM = 200;
const AXLE_FRONT = 30;
const AXLE_REAR = 170;

export const FONT_MONO = '"JetBrains Mono", "IBM Plex Mono", "Roboto Mono", Consolas, "Microsoft YaHei", monospace';
export const FONT_DISP = '"Barlow Condensed", "Archivo Narrow", Oswald, "Microsoft YaHei", sans-serif';

/* Manual tracking — ctx.letterSpacing is Chromium-only, and this has to look the
   same everywhere. Returns the drawn width. */
export function tracked(ctx, str, x, y, spacing, align = 'left') {
  const chars = [...str];
  let w = 0;
  for (const ch of chars) w += ctx.measureText(ch).width + spacing;
  w -= spacing;
  let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return w;
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/* Geometry derived from the parameter set. Exported so the annotation layer and
   the hit-tester use the same numbers as the drawing — no second source of truth. */
export function carGeometry(p) {
  const L = CAR_MM;
  const rw = p.wheelDia / 2;
  const bottom = -(p.rideHeight + 1.5);
  const rearBase = -(p.rideHeight + 20);
  const frontBase = -(p.rideHeight + 13);
  const run = L - 8 - p.noseLen;
  const rake = Math.tan((p.aoa * Math.PI) / 180) * (run / 2);
  const yFrontTop = frontBase - rake;
  const yRearTop = rearBase + rake;
  return { L, rw, bottom, yFrontTop, yRearTop, rearBase, frontBase };
}

/* hotspots are returned in local mm; the caller scales them. */
export function drawCar(ctx, { ox, oy, scale, p, pal, dim = false }) {
  const g = carGeometry(p);
  const { L, rw, bottom, yFrontTop, yRearTop } = g;
  const S = (v) => v * scale;
  const X = (mm) => ox + S(mm);
  const Y = (mm) => oy + S(mm);

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  /* ---- track surface + hatch ------------------------------------------- */
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox - S(26) + 0.5, oy + 0.5);
  ctx.lineTo(ox + S(L + 26) + 0.5, oy + 0.5);
  ctx.stroke();

  ctx.strokeStyle = pal.lineFaint;
  for (let mm = -24; mm <= L + 24; mm += 6) {
    ctx.beginPath();
    ctx.moveTo(X(mm) + 0.5, oy + 1);
    ctx.lineTo(X(mm) - S(3) + 0.5, oy + S(4));
    ctx.stroke();
  }

  /* ---- body ------------------------------------------------------------- */
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(bottom + 1.2));
    ctx.quadraticCurveTo(X(p.noseLen * 0.45), Y(yFrontTop), X(p.noseLen), Y(yFrontTop));
    ctx.lineTo(X(L - 8), Y(yRearTop));
    ctx.lineTo(X(L), Y(yRearTop + 2));
    ctx.lineTo(X(L), Y(bottom));
    ctx.lineTo(X(L * 0.34), Y(bottom));
    ctx.quadraticCurveTo(X(6), Y(bottom - 0.6), X(0), Y(bottom + 1.2));
    ctx.closePath();
  };

  /* colour block behind the outline, so the silhouette reads at thumbnail size */
  bodyPath();
  ctx.fillStyle = pal.body;
  ctx.fill();

  /* raster hatch — gives the flat fill some tonal grain and lifts the colour
     count without faking a gradient */
  ctx.save();
  bodyPath();
  ctx.clip();
  ctx.strokeStyle = pal.hatch;
  ctx.lineWidth = 1;
  for (let mm = -60; mm < L + 40; mm += 3.2) {
    ctx.beginPath();
    ctx.moveTo(X(mm), Y(bottom + 1));
    ctx.lineTo(X(mm - 26), Y(yFrontTop - 4));
    ctx.stroke();
  }
  ctx.restore();

  bodyPath();
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  /* ---- ballast slug ------------------------------------------------------ */
  const bx = p.ballastX;
  ctx.fillStyle = pal.ballast;
  ctx.fillRect(X(bx - 9), Y(bottom - 0.4), S(18), S(5.4));
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(X(bx - 9) + 0.5, Y(bottom - 0.4) + 0.5, S(18) - 1, S(5.4) - 1);

  /* ---- rear wing --------------------------------------------------------- */
  ctx.save();
  ctx.translate(X(L - 13), Y(yRearTop - 1));
  ctx.rotate((p.wingDeg * Math.PI) / 180);
  ctx.fillStyle = pal.wing;
  ctx.fillRect(0, S(-2.6), S(24), S(2.6));
  ctx.strokeStyle = pal.edge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, S(-2.6) + 0.5, S(24) - 1, S(2.6) - 1);
  ctx.restore();

  /* ---- wheels ------------------------------------------------------------ */
  const wheels = [
    { x: AXLE_FRONT, r: rw },
    { x: AXLE_REAR, r: rw },
  ];
  for (const w of wheels) {
    const cx = X(w.x);
    const cy = Y(-w.r);
    const R = S(w.r);

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = pal.wheel;
    ctx.fill();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.42, 0, Math.PI * 2);
    ctx.strokeStyle = pal.lineStrong;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - R, cy + 0.5);
    ctx.lineTo(cx + R, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - R);
    ctx.lineTo(cx + 0.5, cy + R);
    ctx.strokeStyle = pal.lineFaint;
    ctx.lineWidth = 1;
    ctx.stroke();

    /* axle drop line down to the track */
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, cy + R);
    ctx.lineTo(cx + 0.5, oy);
    ctx.strokeStyle = pal.lineFaint;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (dim) {
    ctx.globalAlpha = 0.45;
    bodyPath();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  /* hotspot anchors, local mm, before scaling */
  return {
    geom: g,
    anchors: [
      { id: 'aoa', mm: [(p.noseLen + L - 8) / 2, (yFrontTop + yRearTop) / 2] },
      { id: 'wheelDia', mm: [AXLE_FRONT, -rw] },
      { id: 'ballastX', mm: [bx, bottom + 2.4] },
      { id: 'wingDeg', mm: [L - 1, yRearTop - 1.4] },
      { id: 'rideHeight', mm: [L * 0.62, bottom] },
      { id: 'noseLen', mm: [p.noseLen * 0.5, yFrontTop + 3] },
    ].map((a) => ({ id: a.id, x: X(a.mm[0]), y: Y(a.mm[1]) })),
  };
}
