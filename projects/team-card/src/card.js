/* Team card renderer — pure SVG string builder, no framework, no dependency.
   Every numeral on the card is set in JetBrains Mono; display copy is Barlow Condensed.
   Geometry is authored at 1:1 for a 1080 px plate, so the exported PNG is
   pixel-identical to what the preview computes. */
(function (global) {
  'use strict';

  var W = 1080, H4 = 1350, H9 = 1920, Y9 = 285, M = 56, RIGHT = 1024;

  /* One hue per option. `hex` is the true accent used for solid marks;
     `lit` is the same hue lifted so 13 px text clears 4.5:1 on the dark ground. */
  var ACCENTS = {
    caliper: { hex: '#E2231A', lit: '#F2453A', zh: '卡钳红', en: 'CALIPER RED' },
    timing:  { hex: '#16D97F', lit: '#23E98A', zh: '计时绿', en: 'TIMING GREEN' },
    survey:  { hex: '#E8590C', lit: '#FF6B1A', zh: '测绘橙', en: 'SURVEY ORANGE' }
  };

  var C = {
    bg: '#0B0B0C',
    bgFrame: '#060607',
    plate: '#121215',
    paper: '#F2F0EB',
    bone: '#F2F0EB',
    ink: '#0B0B0C',
    g1: '#8C8C93',
    g2: '#6E6E76',
    g3: '#4A4A50',
    g4: '#2A2A2E',
    hairD: 'rgba(242,240,235,0.16)',
    hairD2: 'rgba(242,240,235,0.09)',
    hairP: 'rgba(11,11,12,0.22)',
    hairP2: 'rgba(11,11,12,0.11)'
  };

  /* Single quotes: these strings land inside XML attributes, where a double quote
     would terminate the attribute and make the whole SVG fail to parse.
     'Microsoft YaHei' sits before the generic family on purpose: Consolas and
     Arial Narrow have no CJK glyphs, so a Chinese team name would otherwise
     render as invisible fallback rather than tofu. */
  var DISPLAY = "'Barlow Condensed','Arial Narrow','Microsoft YaHei',sans-serif";
  var MONO = "'JetBrains Mono',Consolas,'Courier New','Microsoft YaHei',monospace";

  /* ---------- text metric ---------------------------------------------------- */

  var _ctx = null;
  function measure(str, font) {
    if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
    _ctx.font = font;
    return _ctx.measureText(str).width;
  }

  function hardWrap(s, maxW, font) {
    var out = [], cur = '';
    Array.from(s).forEach(function (ch) {
      var t = cur + ch;
      if (cur && measure(t, font) > maxW) { out.push(cur); cur = ch; }
      else cur = t;
    });
    if (cur) out.push(cur);
    return out;
  }

  function wrap(s, maxW, font) {
    if (!/\s/.test(s)) return hardWrap(s, maxW, font);
    var words = s.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur === '' || measure(t, font) <= maxW) cur = t;
      else { lines.push(cur); cur = w; }
      if (measure(cur, font) > maxW) {
        var parts = hardWrap(cur, maxW, font);
        for (var i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
        cur = parts[parts.length - 1];
      }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /* Shrink until the string fits `maxLines` inside `maxW`. Returns {size, lines}. */
  function fitText(str, maxW, maxLines, maxSize, minSize, fam, weight) {
    var s = String(str).replace(/\s+/g, ' ').trim() || '-';
    for (var size = maxSize; size >= minSize; size -= 2) {
      var font = weight + ' ' + size + 'px ' + fam;
      var lines = wrap(s, maxW, font);
      var ok = lines.length <= maxLines;
      for (var i = 0; ok && i < lines.length; i++) if (measure(lines[i], font) > maxW) ok = false;
      if (ok) return { size: size, lines: lines };
    }
    var f2 = weight + ' ' + minSize + 'px ' + fam;
    return { size: minSize, lines: hardWrap(s, maxW, f2).slice(0, maxLines) };
  }

  /* Largest size at which `str` fits `maxW` — keeps long entries from overrunning
     the unit column without hand-tuning every field. */
  function fitSize(str, maxW, maxSize, minSize, fam, weight) {
    for (var size = maxSize; size >= minSize; size -= 2) {
      if (measure(String(str), weight + ' ' + size + 'px ' + fam) <= maxW) return size;
    }
    return minSize;
  }

  /* ---------- primitives ----------------------------------------------------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function r(n) { return Math.round(n * 100) / 100; }

  /* Letter-spacing is passed in em and resolved to px here so the exported SVG
     never depends on how a rasteriser reads unit-bearing presentation attributes. */
  function T(o) {
    var a = [
      'x="' + r(o.x) + '"', 'y="' + r(o.y) + '"',
      'font-family="' + o.font + '"', 'font-size="' + r(o.size) + '"',
      'font-weight="' + (o.weight || 400) + '"',
      'fill="' + o.fill + '"'
    ];
    if (o.anchor) a.push('text-anchor="' + o.anchor + '"');
    if (o.ls) a.push('letter-spacing="' + r(o.size * o.ls) + '"');
    return '<text ' + a.join(' ') + '>' + (o.raw != null ? o.raw : esc(o.s)) + '</text>';
  }

  function hline(y, x1, x2, stroke, w) {
    return '<line x1="' + x1 + '" y1="' + r(y + 0.5) + '" x2="' + x2 + '" y2="' + r(y + 0.5) +
      '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"/>';
  }
  function vline(x, y1, y2, stroke, w) {
    return '<line x1="' + r(x + 0.5) + '" y1="' + y1 + '" x2="' + r(x + 0.5) + '" y2="' + y2 +
      '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"/>';
  }
  function rect(x, y, w, h, fill) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>';
  }
  function strokeRect(x, y, w, h, stroke) {
    return '<rect x="' + r(x + 0.5) + '" y="' + r(y + 0.5) + '" width="' + r(w - 1) + '" height="' + r(h - 1) +
      '" fill="none" stroke="' + stroke + '" stroke-width="1"/>';
  }

  /* Registration marks: four L brackets, the visual signature of a drawing plate. */
  function regMarks(colour, h) {
    var o = 24, arm = 26, p = '';
    [[o, o, 1, 1], [W - o, o, -1, 1], [o, h - o, 1, -1], [W - o, h - o, -1, -1]].forEach(function (q) {
      p += '<path d="M' + r(q[0]) + ' ' + r(q[1] + q[3] * arm) + ' L' + r(q[0]) + ' ' + r(q[1]) +
        ' L' + r(q[0] + q[2] * arm) + ' ' + r(q[1]) + '" fill="none" stroke="' + colour + '" stroke-width="1"/>';
    });
    return p;
  }

  /* ---------- the card front ------------------------------------------------- */

  function front(st) {
    var acc = ACCENTS[st.accent] || ACCENTS.caliper;
    var ac = acc.hex, al = acc.lit;

    var num = String(st.number || '').trim() || '00';
    var name = String(st.name || '').trim() || 'TEAM NAME';
    var origin = String(st.origin || '').trim() || 'COUNTRY / SCHOOL';
    var mass = String(st.mass || '').trim() || '—';
    var cda = String(st.cda || '').trim() || '—';
    var dia = String(st.dia || '').trim() || '—';
    var run = String(st.run || '').trim() || '—';

    var g = '';

    /* --- plate ------------------------------------------------------------- */
    g += rect(0, 0, W, H4, C.bg);
    g += regMarks(C.g4, H4);

    /* --- rail 0..96 -------------------------------------------------------- */
    g += T({ x: M, y: 66, s: 'STEM RACING · TEAM CARD', size: 13, font: MONO, fill: C.g1, ls: 0.22 });
    g += T({ x: RIGHT, y: 66, s: 'No. ' + num + ' / 12', size: 13, font: MONO, weight: 700, fill: al, anchor: 'end', ls: 0.16 });
    g += hline(96, 0, W, C.hairD);

    /* --- hero name --------------------------------------------------------- */
    var NAME_MAX = 648;
    var fit = fitText(name, NAME_MAX, 2, 96, 38, DISPLAY, 700);
    var lineH = fit.size * 0.94;
    var top = 170;
    var base0 = top + fit.size * 0.78;
    var lastB = base0 + (fit.lines.length - 1) * lineH;

    fit.lines.forEach(function (ln, i) {
      g += T({ x: M, y: base0 + i * lineH, s: ln, size: fit.size, font: DISPLAY, weight: 700, fill: C.bone, ls: -0.012 });
    });

    var ruleY = lastB + fit.size * 0.20 + 26;
    g += hline(ruleY, M, M + NAME_MAX, C.hairD);
    g += T({ x: M, y: ruleY + 40, s: origin, size: 18, font: MONO, fill: C.g1, ls: 0.18 });

    /* --- crest plate 122..402 ---------------------------------------------- */
    var px = 744, py = 122, ps = 280, pad = 24;
    g += rect(px, py, ps, ps, C.plate);
    g += strokeRect(px, py, ps, ps, C.hairD);
    g += '<path d="M' + (px + ps / 2) + ' ' + (py - 14) + ' L' + (px + ps / 2) + ' ' + (py - 5) +
      ' M' + (px + ps / 2) + ' ' + (py + ps + 5) + ' L' + (px + ps / 2) + ' ' + (py + ps + 14) +
      ' M' + (px - 14) + ' ' + (py + ps / 2) + ' L' + (px - 5) + ' ' + (py + ps / 2) +
      ' M' + (px + ps + 5) + ' ' + (py + ps / 2) + ' L' + (px + ps + 14) + ' ' + (py + ps / 2) +
      '" stroke="' + C.hairD + '" stroke-width="1" fill="none"/>';

    if (st.crest) {
      g += '<image x="' + (px + pad) + '" y="' + (py + pad) + '" width="' + (ps - pad * 2) +
        '" height="' + (ps - pad * 2) + '" preserveAspectRatio="xMidYMid meet" href="' + st.crest + '"/>';
      g += rect(px, py + ps - 3, ps, 3, ac);
    } else {
      var initials = name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'TC';
      g += T({ x: px + ps / 2, y: py + ps / 2 + 46, s: initials, size: 132, font: DISPLAY, weight: 700, fill: ac, anchor: 'middle', ls: 0.02 });
      g += T({ x: px + ps / 2, y: py + ps - 26, s: 'NO CREST ON FILE', size: 11, font: MONO, fill: C.g1, anchor: 'middle', ls: 0.24 });
    }

    /* --- annotation band 434..505 ------------------------------------------ */
    g += hline(434, 0, W, C.hairD);
    g += rect(M, 464, 8, 8, al);
    g += T({ x: M + 20, y: 476, s: 'DWG T-' + num + ' · REV C', size: 13, font: MONO, fill: C.g1, ls: 0.2 });
    g += T({ x: RIGHT, y: 476, s: '20 °C · 2 ATTEMPTS', size: 13, font: MONO, fill: C.g1, anchor: 'end', ls: 0.2 });

    /* --- paper specification band 505..1137 -------------------------------- */
    g += rect(0, 505, W, 632, C.paper);
    g += rect(0, 505, 12, 632, ac);

    g += T({ x: M, y: 545, s: 'DESIGN PARAMETERS', size: 13, font: MONO, weight: 700, fill: C.g3, ls: 0.22 });
    g += T({ x: RIGHT, y: 545, s: 'UNITS SI · SCALE 1:1', size: 13, font: MONO, fill: C.g3, anchor: 'end', ls: 0.18 });
    g += hline(565, 0, W, C.hairP);
    g += vline(560, 565, 1137, C.hairP2);

    var specs = [
      { label: 'MASS', value: mass, unit: 'g', sub: 'BODY + WHEELS + AXLES', col: 0, row: 0 },
      { label: 'CdA', value: cda, unit: { t: 'm', sup: '2' }, sub: 'FRONTAL AREA × DRAG COEFF.', col: 1, row: 0 },
      { label: 'WHEEL DIA.', value: dia, unit: 'mm', sub: 'FRONT / REAR MATCHED', col: 0, row: 1 },
      { label: 'RUN TIME', value: run, unit: 's', sub: '20 M STANDING START', col: 1, row: 1 }
    ];

    specs.forEach(function (s) {
      var x0 = s.col === 0 ? 88 : 592;
      var cellRight = s.col === 0 ? 532 : 1036;
      var t = 565 + s.row * 286;
      var vs = fitSize(s.value, 336, 72, 40, MONO, 700);

      g += T({ x: x0, y: t + 87, s: s.label, size: 13, font: MONO, weight: 700, fill: C.g3, ls: 0.22 });
      g += T({ x: cellRight - 96, y: t + 170, s: s.value, size: vs, font: MONO, weight: 700, fill: C.ink, anchor: 'end', ls: -0.02 });

      var unitRaw;
      if (typeof s.unit === 'string') unitRaw = esc(s.unit);
      else unitRaw = esc(s.unit.t) + '<tspan font-size="15" dy="-16">' + s.unit.sup + '</tspan>';
      g += T({ x: cellRight - 84, y: t + 170, size: 24, font: MONO, weight: 400, fill: C.g3, raw: unitRaw });

      g += T({ x: x0, y: t + 209, s: s.sub, size: 11, font: MONO, fill: C.g3, ls: 0.14 });
    });

    g += hline(851, 0, W, C.hairP);

    /* --- footer rail 1137..1350 -------------------------------------------- */
    g += hline(1137, 0, W, C.hairD);
    g += hline(1161, 0, W, C.hairD2);
    g += vline(360, 1161, 1225, C.hairD2);
    g += vline(720, 1161, 1225, C.hairD2);
    ['STEM RACING', 'CLASS II · CO2', '20 M LANE'].forEach(function (s, i) {
      g += T({ x: 32 + i * 360, y: 1199, s: s, size: 13, font: MONO, fill: C.g1, ls: 0.22 });
    });
    g += hline(1225, 0, W, C.hairD2);
    g += T({ x: M, y: 1295, s: 'BARLOW CONDENSED + JETBRAINS MONO · 1080 × 1350 · LOCAL RENDER', size: 13, font: MONO, fill: C.g1, ls: 0.16 });

    return g;
  }

  /* ---------- 9:16 frame ----------------------------------------------------- */

  function frame916(st) {
    var acc = ACCENTS[st.accent] || ACCENTS.caliper;
    var num = String(st.number || '').trim() || '00';
    var name = String(st.name || '').trim() || 'TEAM NAME';

    var g = '';
    g += rect(0, 0, W, H9, C.bgFrame);
    g += regMarks(C.g4, H9);

    /* top rail — decoration only; it dies in any 4:5 grid crop */
    g += T({ x: M, y: 252, s: 'CARD ' + num + ' / 12', size: 13, font: MONO, weight: 700, fill: acc.lit, ls: 0.22 });
    g += T({ x: RIGHT, y: 252, s: 'STORY 09:16', size: 13, font: MONO, fill: C.g1, anchor: 'end', ls: 0.22 });

    g += '<g transform="translate(0,' + Y9 + ')">' + front(st) + '</g>';

    /* bottom rail — a ruler that measures this very frame */
    var ry = 1732, span = RIGHT - M, n = 30;
    g += hline(ry, M, RIGHT, C.hairD);
    for (var i = 0; i <= n; i++) {
      var x = Math.round(M + (span / n) * i);
      g += vline(x, ry, ry + (i % 5 === 0 ? 12 : 6), C.hairD);
    }
    g += T({ x: M, y: ry + 34, s: '0', size: 11, font: MONO, fill: C.g1, ls: 0.1 });
    g += T({ x: RIGHT, y: ry + 34, s: '968 px', size: 11, font: MONO, fill: C.g1, anchor: 'end', ls: 0.1 });
    g += T({ x: M, y: ry + 78, s: 'FRAME 1080 × 1920 · PNG · sRGB · 1:1', size: 13, font: MONO, fill: C.g1, ls: 0.18 });
    g += T({ x: RIGHT, y: ry + 78, s: name.slice(0, 24), size: 13, font: MONO, fill: C.g1, anchor: 'end', ls: 0.18 });

    return g;
  }

  /* ---------- public --------------------------------------------------------- */

  function build(st, variant) {
    var is9 = variant === '9:16';
    var h = is9 ? H9 : H4;
    var inner = is9 ? frame916(st) : front(st);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h +
      '" viewBox="0 0 ' + W + ' ' + h + '">' + inner + '</svg>';
  }

  function fontFaceCss(display) {
    var out = [];
    (global.CARD_FONTS || []).forEach(function (f) {
      out.push('@font-face{font-family:"' + f.family + '";font-style:' + f.style +
        ';font-weight:' + f.weight + ';font-display:' + (display || 'swap') +
        ';src:url(' + f.data + ') format("woff2")}');
    });
    return out.join('');
  }

  global.Card = {
    ACCENTS: ACCENTS,
    build: build,
    fontFaceCss: fontFaceCss,
    SIZES: { W: W, H4: H4, H9: H9 },
    MONO: MONO,
    DISPLAY: DISPLAY
  };
})(window);
