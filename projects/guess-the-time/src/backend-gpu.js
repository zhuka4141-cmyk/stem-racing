/* backend-gpu.js — native WebGPU rasteriser for the same draw-op list.
 *
 * One instanced pipeline draws every shape as a quad and resolves coverage with
 * a signed-distance test in the fragment shader, so lines, discs, wedges and the
 * nose cone all come out with real anti-aliasing and no textures.
 *
 * Export does NOT go through canvas.toBlob or drawImage: a canvas that has ever
 * had a WebGPU context returns blank pixels for both. The frame is re-rendered
 * into an owned rgba8unorm texture and read back with copyTextureToBuffer.
 */
(function () {
  'use strict';
  var GT = window.GT;

  var WGSL = [
    'struct Inst {',
    '  a: vec4f,',                 // cx, cy, hw, hh
    '  b: vec4f,',                 // rgba
    '  c: vec4f,',                 // rot, taper, shape, unused
    '};',
    '',
    '@group(0) @binding(0) var<storage, read> insts: array<Inst>;',
    '',
    'struct VOut {',
    '  @builtin(position) pos: vec4f,',
    '  @location(0) local: vec2f,',
    '  @location(1) color: vec4f,',
    '  @location(2) extra: vec4f,', // taper, shape, hw, hh
    '};',
    '',
    'const CW: f32 = 1080.0;',
    'const CH: f32 = 1920.0;',
    '',
    '@vertex',
    'fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {',
    '  var corners = array<vec2f, 6>(',
    '    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),',
    '    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)',
    '  );',
    '  let c = corners[vi];',
    '  let inst = insts[ii];',
    '  let rot = inst.c.x;',
    '  let cs = cos(rot);',
    '  let sn = sin(rot);',
    '  let p = vec2f(c.x * inst.a.z, c.y * inst.a.w);',
    '  let rp = vec2f(p.x * cs - p.y * sn, p.x * sn + p.y * cs);',
    '  let world = inst.a.xy + rp;',
    '  var o: VOut;',
    '  o.pos = vec4f(world.x / CW * 2.0 - 1.0, 1.0 - world.y / CH * 2.0, 0.0, 1.0);',
    '  o.local = c;',
    '  o.color = inst.b;',
    '  o.extra = vec4f(inst.c.y, inst.c.z, inst.a.z, inst.a.w);',
    '  return o;',
    '}',
    '',
    '@fragment',
    'fn fs(in: VOut) -> @location(0) vec4f {',
    '  let taper = in.extra.x;',
    '  let shape = in.extra.y;',
    '  let hw = in.extra.z;',
    '  let hh = in.extra.w;',
    '  var d: f32;',
    '  if (shape > 0.5) {',
    '    d = (1.0 - length(in.local)) * min(hw, hh);',
    '  } else {',
    '    let k = 1.0 - taper * (in.local.x * 0.5 + 0.5);',
    '    d = min((k - abs(in.local.y)) * hh, (1.0 - abs(in.local.x)) * hw);',
    '  }',
    '  let cov = clamp(d + 0.5, 0.0, 1.0);',
    '  if (cov <= 0.0) { discard; }',
    '  return vec4f(in.color.rgb, in.color.a * cov);',
    '}'
  ].join('\n');

  var FLOATS_PER_INST = 12;  // 48 bytes
  var INST_BYTES = FLOATS_PER_INST * 4;

  function createGpuBackend(canvas) {
    return new Promise(function (resolve, reject) {
      if (!navigator.gpu) { reject(new Error('navigator.gpu is undefined')); return; }

      var device, adapter, ctx, format, pipeline, instBuffer, bindGroup, capacity = 0;
      var exportTex = null;
      var lost = false;

      navigator.gpu.requestAdapter().then(function (a) {
        if (!a) throw new Error('requestAdapter returned null');
        adapter = a;
        return a.requestDevice();
      }).then(function (d) {
        device = d;
        device.lost.then(function (info) { lost = true; console.warn('[gpu] device lost:', info && info.message); });

        ctx = canvas.getContext('webgpu');
        if (!ctx) throw new Error('getContext("webgpu") returned null');
        format = navigator.gpu.getPreferredCanvasFormat();

        var module = device.createShaderModule({ code: WGSL });

        return module.getCompilationInfo().then(function (info) {
          var errs = (info.messages || []).filter(function (m) { return m.type === 'error'; });
          if (errs.length) throw new Error('WGSL compile error: ' + errs[0].message);

          pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: module, entryPoint: 'vs' },
            fragment: {
              module: module,
              entryPoint: 'fs',
              targets: [{
                format: format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
              }]
            },
            primitive: { topology: 'triangle-list' }
          });

          // The export target has to be a texture we own, so it gets its own
          // pipeline with a guaranteed format regardless of swapchain preference.
          pipelineReadback = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: module, entryPoint: 'vs' },
            fragment: {
              module: module,
              entryPoint: 'fs',
              targets: [{
                format: 'rgba8unorm',
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
              }]
            },
            primitive: { topology: 'triangle-list' }
          });

          ctx.configure({ device: device, format: format, alphaMode: 'opaque' });
        });
      }).then(function () {
        resolve(makeApi());
      }).catch(function (e) {
        reject(e);
      });

      var pipelineReadback = null;

      function ensureCapacity(n) {
        if (n <= capacity) return;
        var cap = capacity || 8192;
        while (cap < n) cap *= 2;
        if (instBuffer) instBuffer.destroy();
        instBuffer = device.createBuffer({
          size: cap * INST_BYTES,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        capacity = cap;
        bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: instBuffer } }]
        });
        bindGroupReadback = device.createBindGroup({
          layout: pipelineReadback.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: instBuffer } }]
        });
      }

      var bindGroupReadback = null;

      function pack(ops) {
        var items = ops.items || ops;
        var n = items.length;
        ensureCapacity(n);
        var data = new Float32Array(n * FLOATS_PER_INST);
        for (var i = 0; i < n; i++) {
          var o = items[i];
          var b = i * FLOATS_PER_INST;
          data[b] = o.x; data[b + 1] = o.y; data[b + 2] = o.hw; data[b + 3] = o.hh;
          var c = o.color;
          data[b + 4] = c[0]; data[b + 5] = c[1]; data[b + 6] = c[2]; data[b + 7] = c[3];
          data[b + 8] = o.rot || 0; data[b + 9] = o.taper || 0;
          data[b + 10] = o.shape || 0; data[b + 11] = 0;
        }
        if (n > 0) device.queue.writeBuffer(instBuffer, 0, data);
        return n;
      }

      function drawTo(view, pipe, grp, count) {
        var enc = device.createCommandEncoder();
        var pass = enc.beginRenderPass({
          colorAttachments: [{
            view: view,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });
        if (count > 0) {
          pass.setPipeline(pipe);
          pass.setBindGroup(0, grp);
          pass.draw(6, count);
        }
        pass.end();
        device.queue.submit([enc.finish()]);
        return enc;
      }

      function makeApi() {
        function render(ops) {
          if (lost) return;
          var n = pack(ops);
          drawTo(ctx.getCurrentTexture().createView(), pipeline, bindGroup, n);
        }

        function readPixels() {
          var W = canvas.width, H = canvas.height;
          if (!exportTex) {
            exportTex = device.createTexture({
              size: { width: W, height: H },
              format: 'rgba8unorm',
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
            });
          }
          var n = pack(lastOps);
          drawTo(exportTex.createView(), pipelineReadback, bindGroupReadback, n);

          var bytesPerRow = Math.ceil(W * 4 / 256) * 256;
          var buf = device.createBuffer({
            size: bytesPerRow * H,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
          });
          var enc = device.createCommandEncoder();
          enc.copyTextureToBuffer(
            { texture: exportTex },
            { buffer: buf, bytesPerRow: bytesPerRow, rowsPerImage: H },
            { width: W, height: H, depthOrArrayLayers: 1 }
          );
          device.queue.submit([enc.finish()]);

          return buf.mapAsync(GPUMapMode.READ).then(function () {
            var src = new Uint8Array(buf.getMappedRange());
            var out = new Uint8ClampedArray(W * H * 4);
            for (var y = 0; y < H; y++) {
              out.set(src.subarray(y * bytesPerRow, y * bytesPerRow + W * 4), y * W * 4);
            }
            buf.unmap();
            buf.destroy();
            return new ImageData(out, W, H);
          });
        }

        var lastOps = { items: [] };

        return {
          kind: 'webgpu',
          canvas: canvas,
          adapterInfo: (adapter && adapter.info) || null,
          preferredFormat: format,
          render: function (ops) { lastOps = ops; render(ops); },
          readPixels: readPixels,
          isLost: function () { return lost; },
          destroy: function () {
            if (exportTex) exportTex.destroy();
            if (instBuffer) instBuffer.destroy();
            if (device) device.destroy();
          }
        };
      }
    });
  }

  GT.createGpuBackend = createGpuBackend;
  GT.WGSL = WGSL;
})();
