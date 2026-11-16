(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'));
  else { root.AT = root.AT || {}; root.AT.chart = factory(root.AT.indicators); }
}(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  const PAD = { l: 10, r: 65, t: 15, b: 25 };

  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const st = {
      bars: [],
      count: 150,
      offset: 0,
      tf: '',
      digits: 2,
      px: null,
      py: null,
      drag: null,
      raf: 0,
      emas: { e20: [], e50: [], e200: [] },
      zones: { ob: null, fvg: null, ote: null }
    };

    function schedule() {
      if (st.raf) return;
      st.raf = requestAnimationFrame(function () {
        st.raf = 0;
        draw();
      });
    }

    function setData(bars, o) {
      st.bars = bars || [];
      if (o && o.tf) st.tf = o.tf;
      if (o && o.digits != null) st.digits = o.digits;
      
      const c = st.bars.map(function (b) { return b.c; });
      
      st.emas.e20 = I.ema(c, 20);
      st.emas.e50 = I.ema(c, 50);
      st.emas.e200 = I.ema(c, 200);
      
      schedule();
    }

    function setZones(zones) {
      st.zones = zones || { ob: null, fvg: null, ote: null };
      schedule();
    }

    function zoom(f) {
      st.count = Math.max(20, Math.min(1000, Math.round(st.count * f)));
      schedule();
    }

    function reset() {
      st.count = 150;
      st.offset = 0;
      schedule();
    }

    function range() {
      const n = st.bars.length;
      const count = Math.min(st.count, n);
      const end = Math.max(count, n - st.offset);
      return { start: end - count, end: end, count: count };
    }

    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h || !st.bars.length) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const r = range();
      const vis = st.bars.slice(r.start, r.end);
      if (!vis.length) return;

      const plotW = w - PAD.l - PAD.r;
      const plotH = h - PAD.t - PAD.b;
      const step = plotW / r.count;
      const bodyW = Math.max(1, step * 0.65);

      let lo = Infinity, hi = -Infinity;
      vis.forEach(function (b) {
        if (b.l < lo) lo = b.l;
        if (b.h > hi) hi = b.h;
      });

      const addZoneToRange = function(z) {
        if (!z) return;
        if (z.top > hi) hi = z.top;
        if (z.bottom < lo) lo = z.bottom;
      };
      addZoneToRange(st.zones.ob);
      addZoneToRange(st.zones.fvg);
      addZoneToRange(st.zones.ote);
      
      const pad = (hi - lo) * 0.1 || 1;
      lo -= pad; hi += pad;

      const y = function (p) { return PAD.t + (hi - p) / (hi - lo) * plotH; };
      const x = function (idx) { return PAD.l + (idx - r.start) * step + step / 2; };
      const fmt = function (p) { return p.toFixed(st.digits); };

      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillStyle = '#6b7785';
      ctx.textAlign = 'left';

      for (let k = 0; k <= 4; k++) {
        const p = lo + (hi - lo) * k / 4;
        const yy = Math.round(y(p)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(PAD.l, yy);
        ctx.lineTo(PAD.l + plotW, yy);
        ctx.stroke();
        ctx.fillText(fmt(p), PAD.l + plotW + 5, yy);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t, plotW, plotH);
      ctx.clip();

      if (st.zones.ote) {
        const zTop = y(st.zones.ote.top);
        const zBot = y(st.zones.ote.bottom);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
        ctx.fillRect(PAD.l, zTop, plotW, zBot - zTop);
      }
      if (st.zones.fvg) {
        const zTop = y(st.zones.fvg.top);
        const zBot = y(st.zones.fvg.bottom);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.fillRect(PAD.l, zTop, plotW, zBot - zTop);
      }
      if (st.zones.ob) {
        const zTop = y(st.zones.ob.top);
        const zBot = y(st.zones.ob.bottom);
        ctx.fillStyle = st.zones.ob.direction === 1 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(PAD.l, zTop, plotW, zBot - zTop);
      }

      for (let i = r.start; i < r.end; i++) {
        const b = st.bars[i];
        const xx = x(i);
        const color = b.c >= b.o ? '#22c55e' : '#ef4444';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        
        ctx.beginPath();
        ctx.moveTo(xx, y(b.h));
        ctx.lineTo(xx, y(b.l));
        ctx.stroke();
        
        const top = y(Math.max(b.o, b.c));
        const bot = y(Math.min(b.o, b.c));
        ctx.fillRect(xx - bodyW / 2, top, bodyW, Math.max(1, bot - top));
      }

      const drawEma = function (arr, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = r.start; i < r.end; i++) {
          if (arr[i] == null) continue;
          if (!started) { ctx.moveTo(x(i), y(arr[i])); started = true; }
          else ctx.lineTo(x(i), y(arr[i]));
        }
        ctx.stroke();
      };

      drawEma(st.emas.e20, '#f59e0b');
      drawEma(st.emas.e50, '#3b82f6');
      drawEma(st.emas.e200, '#a855f7');

      ctx.restore();

      if (st.px != null && st.px >= PAD.l && st.px <= PAD.l + plotW && st.py >= PAD.t && st.py <= PAD.t + plotH) {
        ctx.strokeStyle = 'rgba(154, 164, 178, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(st.px, PAD.t);
        ctx.lineTo(st.px, PAD.t + plotH);
        ctx.moveTo(PAD.l, st.py);
        ctx.lineTo(PAD.l + plotW, st.py);
        ctx.stroke();
        ctx.setLineDash([]);
        
        const p = hi - (st.py - PAD.t) / plotH * (hi - lo);
        ctx.fillStyle = '#1a222c';
        ctx.fillRect(PAD.l + plotW + 1, st.py - 8, PAD.r - 2, 16);
        ctx.fillStyle = '#e5e7eb';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmt(p), PAD.l + plotW + 5, st.py);
      }
    }

    function local(e) {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    }

    canvas.addEventListener('pointerdown', function (e) {
      st.drag = { x: local(e).x, offset: st.offset };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', function (e) {
      const p = local(e);
      if (st.drag) {
        const r = range();
        const step = (canvas.clientWidth - PAD.l - PAD.r) / r.count;
        const moved = Math.round((p.x - st.drag.x) / step);
        st.offset = Math.max(0, Math.min(st.bars.length - r.count, st.drag.offset + moved));
      } else {
        st.px = p.x;
        st.py = p.y;
        const r = range();
        const step = (canvas.clientWidth - PAD.l - PAD.r) / r.count;
        const idx = Math.floor((p.x - PAD.l) / step) + r.start;
        if (opts.onHover) opts.onHover(st.bars[idx] || null);
      }
      schedule();
    });

    canvas.addEventListener('pointerup', function () { st.drag = null; });
    canvas.addEventListener('pointerleave', function () {
      st.px = st.py = null;
      if (opts.onHover) opts.onHover(null);
      schedule();
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 0.9);
    }, { passive: false });

    return {
      setData: setData,
      setZones: setZones,
      zoom: zoom,
      reset: reset,
      resize: schedule
    };
  }

  return { create: create };
}));
