/* core.js — namespace, deterministic RNG, colours, draw-op list.
 *
 * The draw-op list is the ONLY interface between the scene builder and the two
 * render backends, so both must rasterise the exact same array.
 *
 * Op format (all coordinates in CSS px on a 1080x1920 canvas, y down):
 *   { shape: 0|1, x, y, hw, hh, rot, taper, color:[r,g,b,a] }
 *     shape 0 = rectangle, shape 1 = disc (inscribed ellipse of the quad)
 *     x,y     = CENTRE of the quad
 *     hw,hh   = half width / half height
 *     rot     = rotation about the centre, radians
 *     taper   = rect only, 0..1, shrinks the +x edge vertically (0 = no taper)
 *     color   = float RGBA 0..1
 */
(function () {
  'use strict';
  var GT = (window.GT = window.GT || {});

  GT.W = 1080;
  GT.H = 1920;
  // Instagram Reels live area: nothing carrying meaning may leave this box.
  GT.SAFE = { x0: 60, x1: 930, y0: 240, y1: 1480 };
  GT.MIN_FONT = 48;

  GT.PALETTE = {
    bg:      '#0B0B0C',
    panel:   '#131315',
    ink:     '#F2F0EB',
    dim:     '#8A8A85',
    faint:   '#46464A',
    rail:    '#2A2A2C',
    accent:  '#E8590C',
    accentD: '#7A2F06'
  };

  // Every stack ends in a CJK family on purpose. Bahnschrift and Consolas carry
  // no Han glyphs, and canvas text does not error on a missing glyph - the
  // character just silently vanishes. Per-glyph fallback keeps mixed strings whole.
  var CJK_TAIL = ', "Microsoft YaHei", "Noto Sans SC", sans-serif';
  GT.FONTS = {
    display: '"Bahnschrift SemiCondensed", Bahnschrift, "Arial Narrow"' + CJK_TAIL,
    mono: 'Consolas, "Cascadia Mono", ui-monospace' + CJK_TAIL,
    cjk: '"Microsoft YaHei", "Noto Sans SC"' + CJK_TAIL
  };

  // ---- deterministic RNG -------------------------------------------------
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  GT.hashStr = hashStr;
  GT.makeRng = function (seed) { return mulberry32(hashStr(seed)); };
  GT.rngBetween = function (rng, lo, hi) { return lo + rng() * (hi - lo); };
  GT.rngInt = function (rng, n) { return Math.min(n - 1, Math.floor(rng() * n)); };
  GT.rngRange = function (rng, range) { return GT.rngBetween(rng, range[0], range[1]); };

  // ---- colour ------------------------------------------------------------
  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }
  GT.hex = function (hex, a) {
    var c = hexToRgb(hex);
    return [c[0], c[1], c[2], a === undefined ? 1 : a];
  };
  GT.hexRgb = hexToRgb;
  GT.mixHex = function (a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round((A[0] + (B[0] - A[0]) * t) * 255) + ',' +
      Math.round((A[1] + (B[1] - A[1]) * t) * 255) + ',' +
      Math.round((A[2] + (B[2] - A[2]) * t) * 255) + ')';
  };

  // ---- draw-op list ------------------------------------------------------
  function Ops() { this.items = []; }
  Ops.prototype.push = function (op) { this.items.push(op); return op; };
  Ops.prototype.rect = function (x, y, w, h, color, opts) {
    return this.push({
      shape: 0, x: x + w / 2, y: y + h / 2, hw: Math.abs(w) / 2, hh: Math.abs(h) / 2,
      rot: (opts && opts.rot) || 0, taper: (opts && opts.taper) || 0,
      color: Array.isArray(color) ? color : GT.hex(color, opts && opts.a)
    });
  };
  // rect whose +x edge tapers vertically (nose cones, wedges)
  Ops.prototype.wedge = function (x, y, w, h, taper, color, opts) {
    return this.push({
      shape: 0, x: x + w / 2, y: y + h / 2, hw: Math.abs(w) / 2, hh: Math.abs(h) / 2,
      rot: (opts && opts.rot) || 0, taper: taper,
      color: Array.isArray(color) ? color : GT.hex(color, opts && opts.a)
    });
  };
  Ops.prototype.disc = function (cx, cy, r, color, opts) {
    return this.push({
      shape: 1, x: cx, y: cy, hw: r, hh: r, rot: 0, taper: 0,
      color: Array.isArray(color) ? color : GT.hex(color, opts && opts.a)
    });
  };
  Ops.prototype.ellipse = function (cx, cy, rx, ry, color, opts) {
    return this.push({
      shape: 1, x: cx, y: cy, hw: rx, hh: ry, rot: 0, taper: 0,
      color: Array.isArray(color) ? color : GT.hex(color, opts && opts.a)
    });
  };
  // line as a rotated thin rect
  Ops.prototype.line = function (x1, y1, x2, y2, w, color, opts) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return null;
    return this.push({
      shape: 0, x: (x1 + x2) / 2, y: (y1 + y2) / 2, hw: len / 2, hh: w / 2,
      rot: Math.atan2(dy, dx), taper: 0,
      color: Array.isArray(color) ? color : GT.hex(color, opts && opts.a)
    });
  };
  Ops.prototype.dash = function (x1, y1, x2, y2, w, dashLen, gapLen, color, opts) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return this;
    var ux = dx / len, uy = dy / len;
    for (var d = 0; d < len; d += dashLen + gapLen) {
      var e = Math.min(d + dashLen, len);
      this.line(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e, w, color, opts);
    }
    return this;
  };
  // axis-aligned hairline, snapped to the device pixel grid so it stays crisp
  Ops.prototype.hair = function (x1, y, x2, color, opts) {
    return this.rect(x1, Math.round(y), x2 - x1, 1, color, opts);
  };
  Ops.prototype.count = function () { return this.items.length; };

  GT.Ops = Ops;
  GT.newOps = function () { return new Ops(); };

  // ---- number formatting -------------------------------------------------
  GT.fixed = function (v, d) { return Number(v).toFixed(d); };
  // signed milliseconds for the contribution rows: 0.0312 -> "+31"
  GT.msSigned = function (seconds) {
    var ms = seconds * 1000;
    if (Math.abs(ms) < 1) return '±0';
    return (ms > 0 ? '+' : '') + ms.toFixed(0);
  };

  GT.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  GT.lerp = function (a, b, t) { return a + (b - a) * t; };
  GT.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  GT.easeInOutQuad = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
})();
