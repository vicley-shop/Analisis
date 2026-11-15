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
      count: 100,
      offset: 0,
      tf: '',
      digits: 2,
      px: null,
      py: null,
      drag: null,
      raf: 0,
      emas: { e20: [], e50: [], e200: [] },
      structure: { lines: [], boxes: [], labels: [] }
    };

    function schedule() {
      if (st.raf) return;
      st.raf = requestAnimationFrame(function () {
        st.raf = 0;
        draw();
      });
    }

    function findStructure(bars) {
      const lines = [], boxes = [], labels = [];
      if (bars.length < 20) return { lines, boxes, labels };

      const lookback = 3;
      let lastSwingHigh = null, lastSwingLow = null;
      let trend = 0;

      for (let i = lookback; i < bars.length - lookback; i++) {
        const b = bars[i];
        let isHigh = true, isLow = true;

        for (let j = 1; j <= lookback; j++) {
          if (bars[i - j].h >= b.h || bars[i + j].h >= b.h) isHigh = false;
          if (bars[i - j].l <= b.l || bars[i + j].l <= b.l) isLow = false;
        }

        if (isHigh) {
          if (lastSwingHigh && b.c > lastSwingHigh.price) {
            const type = trend === -1 ? 'CHoCH' : 'BOS';
            labels.push({ x: i, y: b.h, text: 'Major ' + type, color: '#22c55e', align: 'bottom' });
            lines.push({ x1: lastSwingHigh.index, y1: lastSwingHigh.price, x2: i, y2: lastSwingHigh.price, color: '#22c55e', dash: true });
            if (type === 'CHoCH') trend = 1;
            const obBar = bars[lastSwingHigh.index - 1] || bars[lastSwingHigh.index];
            boxes.push({ x: lastSwingHigh.index, top: Math.max(obBar.o, obBar.c), bottom: Math.min(obBar.o, obBar.c), color: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 0.5)' });
          }
          lastSwingHigh = { index: i, price: b.h };
        }

        if (isLow) {
          if (lastSwingLow && b.c < lastSwingLow.price) {
            const type = trend === 1 ? 'CHoCH' : 'BOS';
            labels.push({ x: i, y: b.l, text: 'Major ' + type, color: '#ef4444', align: 'top' });
            lines.push({ x1: lastSwingLow.index, y1: lastSwingLow.price, x2: i, y2: lastSwingLow.price, color: '#ef4444', dash: true });
            if (type === 'CHoCH') trend = -1;
            const obBar = bars[lastSwingLow.index - 1] || bars[lastSwingLow.index];
            boxes.push({ x: lastSwingLow.index, top: Math.max(obBar.o, obBar.c), bottom: Math.min(obBar.o, obBar.c), color: 'rgba(34, 197, 94, 0.2)', border: 'rgba(34, 197, 94, 0.5)' });
          }
          lastSwingLow = { index: i, price: b.l };
        }
      }
      return { lines, boxes, labels };
    }

    function setData(bars, o) {
      st.bars = bars || [];
      if (o && o.tf) st.tf = o.tf;
      if (o && o.digits != null) st.digits = o.digits;
      
      const c = st.bars.map(function (b) { return b.c; });
      st.emas.e20 = I.ema(c, 20);
      st.emas.e50 = I.ema(c, 50);
      st.emas.e200 = I.ema(c, 200);
      st.structure = findStructure(st.bars);
      
      schedule();
    }

    function zoom(f) {
      st.count = Math.max(20, Math.min(300, Math.round(st.count * f)));
      schedule();
    }

    function reset() {
      st.count = 100;
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

      st.structure.boxes.forEach(function (b) {
        if (b.x < r.start || b.x > r.end) return;
        const xx = x(b.x);
        ctx.fillStyle = b.color;
        ctx.strokeStyle = b.border;
        ctx.lineWidth = 1;
        ctx.fillRect(xx - bodyW * 2, y(b.top), plotW, y(b.bottom) - y(b.top));
        ctx.strokeRect(xx - bodyW * 2, y(b.top), plotW, y(b.bottom) - y(b.top));
      });

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

      st.structure.lines.forEach(function (l) {
        if (l.x1 < r.start || l.x2 > r.end) return;
        ctx.strokeStyle = l.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x(l.x1), y(l.y1));
        ctx.lineTo(x(l.x2), y(l.y1));
        ctx.stroke();
        ctx.setLineDash([]);
      });

      st.structure.labels.forEach(function (lab) {
        if (lab.x < r.start || lab.x > r.end) return;
        ctx.fillStyle = lab.color;
        ctx.textAlign = 'center';
        ctx.font = 'bold 10px system-ui, sans-serif';
        const yy = lab.align === 'bottom' ? y(lab.y) - 10 : y(lab.y) + 15;
        ctx.fillText(lab.text, x(lab.x), yy);
      });

      ctx.restore();
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
      zoom: zoom,
      reset: reset
    };
  }

  return { create: create };
}));