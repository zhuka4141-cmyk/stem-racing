/* backend-2d.js — Canvas2D rasteriser for the draw-op list.
 *
 * This is the guaranteed path: it must produce the same frame as the WebGPU
 * backend, so it consumes exactly the same ops array and no DOM text.
 */
(function () {
  'use strict';
  var GT = window.GT;

  function create2DBackend(canvas) {
    var ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');

    function rgba(c) {
      return 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' +
        Math.round(c[2] * 255) + ',' + c[3] + ')';
    }

    function render(ops) {
      var items = ops.items || ops;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (var i = 0; i < items.length; i++) {
        var o = items[i];
        ctx.fillStyle = rgba(o.color);
        if (o.shape === 1) {
          ctx.beginPath();
          ctx.ellipse(o.x, o.y, o.hw, o.hh, o.rot || 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (!o.taper) {
          if (o.rot) {
            ctx.save();
            ctx.translate(o.x, o.y);
            ctx.rotate(o.rot);
            ctx.fillRect(-o.hw, -o.hh, o.hw * 2, o.hh * 2);
            ctx.restore();
          } else {
            ctx.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
          }
        } else {
          ctx.save();
          ctx.translate(o.x, o.y);
          if (o.rot) ctx.rotate(o.rot);
          var rk = 1 - o.taper;
          ctx.beginPath();
          ctx.moveTo(-o.hw, -o.hh);
          ctx.lineTo(o.hw, -o.hh * rk);
          ctx.lineTo(o.hw, o.hh * rk);
          ctx.lineTo(-o.hw, o.hh);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function readPixels() {
      return Promise.resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    return {
      kind: 'canvas2d',
      canvas: canvas,
      ctx: ctx,
      render: render,
      readPixels: readPixels,
      destroy: function () {}
    };
  }

  GT.create2DBackend = create2DBackend;
})();
