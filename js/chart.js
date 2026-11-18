(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'));
  else { root.AT = root.AT || {}; root.AT.chart = factory(root.AT.indicators); }
}(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  const PAD = { l: 10, r: 65, t: 15, b: 25 };

  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    let bars = [], count = 140, offset = 0, zones = { ob: null, fvg: null, ote: null };
    let drawings = [], draft = null, pendingDraw = null, tool = 'cursor', px = null, py = null;

    function plotDims() {
      return { w: canvas.clientWidth, h: canvas.clientHeight, plotW: canvas.clientWidth - PAD.l - PAD.r, plotH: canvas.clientHeight - PAD.t - PAD.b };
    }

    function barsRange() {
      const n = bars.length;
      if (!n) return null;
      const cnt = Math.min(count, n);
      const end = Math.min(n, Math.max(cnt, n - offset));
      return { start: end - cnt, end: end, count: cnt };
    }

    function draw() {
      const dims = plotDims();
      if (!dims.w || !dims.h || !bars.length) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== dims.w * dpr || canvas.height !== dims.h * dpr) {
        canvas.width = dims.w * dpr; canvas.height = dims.h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, dims.w, dims.h);

      const r = barsRange();
      if (!r) return;

      let lo = Infinity, hi = -Infinity;
      for (let i = r.start; i < r.end; i++) {
        const b = bars[i];
        if (b.l < lo) lo = b.l;
        if (b.h > hi) hi = b.h;
      }
      if (lo === hi) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;

      const y = function (p) { return PAD.t + (hi - p) / (hi - lo) * dims.plotH; };
      const step = dims.plotW / r.count;
      const x = function (idx) { return PAD.l + (idx - r.start) * step + step / 2; };

      // Dibujar Velas
      const upCol = '#10B981', downCol = '#F43F5E';
      ctx.lineWidth = 1;
      for (let i = r.start; i < r.end; i++) {
        const b = bars[i];
        const xx = Math.round(x(i)) + 0.5;
        ctx.strokeStyle = b.c >= b.o ? upCol : downCol;
        ctx.beginPath(); ctx.moveTo(xx, y(b.h)); ctx.lineTo(xx, y(b.l)); ctx.stroke();

        ctx.fillStyle = ctx.strokeStyle;
        const top = y(Math.max(b.o, b.c));
        const bot = y(Math.min(b.o, b.c));
        ctx.fillRect(Math.round(x(i) - step * 0.3), top, Math.max(1, step * 0.6), Math.max(1, bot - top));
      }

      // Ejes y precios
      ctx.fillStyle = '#64748B'; ctx.font = '11px JetBrains Mono'; ctx.textAlign = 'left';
      for (let k = 0; k <= 4; k++) {
        const p = lo + (hi - lo) * k / 4;
        const yy = Math.round(y(p)) + 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.beginPath(); ctx.moveTo(PAD.l, yy); ctx.lineTo(PAD.l + dims.plotW, yy); ctx.stroke();
        ctx.fillText(p.toFixed(2), PAD.l + dims.plotW + 6, yy);
      }
    }

    function setData(newBars) { bars = newBars || []; draw(); }
    function setZones(newZones) { zones = newZones || zones; draw(); }
    function zoom(f) { count = Math.max(20, Math.min(500, Math.round(count * f))); draw(); }
    function reset() { count = 140; offset = 0; draw(); }

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 0.9);
    }, { passive: false });

    return {
      setData: setData,
      setZones: setZones,
      zoom: zoom,
      reset: reset,
      resize: draw,
      setTool: function (t) { tool = t; },
      getTool: function () { return tool; },
      undo: function () {},
      clearDrawings: function () { drawings = []; draw(); }
    };
  }

  return { create: create };
}));
