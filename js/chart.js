(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'));
  else { root.AT = root.AT || {}; root.AT.chart = factory(root.AT.indicators); }
}(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  const PAD = { l: 10, r: 65, t: 15, b: 25 };
  const DEFAULT_COUNT = 150;
  const MIN_COUNT = 20;
  const MAX_COUNT = 1000;
  const RESIZE_DEBOUNCE_MS = 100;
  const WHEEL_ZOOM_FACTOR = 1.1;
  const EMA_PERIODS = [20, 50, 200];

  function cfg() {
    return (window.AT_CONFIG && window.AT_CONFIG.chart) || {};
  }

  function color(key, fallback) {
    const colors = cfg().colors;
    return (colors && colors[key]) || fallback;
  }

  function create(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const ac = new AbortController();
    const pointers = new Map();

    const st = {
      bars: [],
      count: cfg().defaultCount || DEFAULT_COUNT,
      offset: 0,
      tf: '',
      digits: 2,
      px: null,
      py: null,
      drag: null,
      pinchStart: null,
      raf: 0,
      resizeTimer: null,
      emas: { e20: [], e50: [], e200: [] },
      emasMeta: { lastLen: 0, firstT: 0, lastC: NaN },
      zones: { ob: null, fvg: null, ote: null }
    };

    function schedule() {
      if (st.raf) return;
      st.raf = requestAnimationFrame(function () {
        st.raf = 0;
        draw();
      });
    }

    function computeEmas(closes) {
      return {
        e20: I.ema(closes, EMA_PERIODS[0]),
        e50: I.ema(closes, EMA_PERIODS[1]),
        e200: I.ema(closes, EMA_PERIODS[2])
      };
    }

    function incrementalUpdate(prevArr, closes, period) {
      const n = closes.length;
      const lastIdx = n - 1;
      const prevVal = prevArr[lastIdx - 1];
      if (prevVal == null || !Number.isFinite(prevVal)) return I.ema(closes, period);
      const out = prevArr.slice();
      out[lastIdx] = I.updateEma(prevVal, closes[lastIdx], period);
      return out;
    }

    function appendUpdate(prevArr, closes, period) {
      const lastIdx = closes.length - 1;
      const prevVal = prevArr[lastIdx - 1];
      if (prevVal == null || !Number.isFinite(prevVal)) return I.ema(closes, period);
      const out = prevArr.slice();
      out.push(I.updateEma(prevVal, closes[lastIdx], period));
      return out;
    }

    function setData(bars, o) {
      o = o || {};
      const prevLen = st.emasMeta.lastLen;
      const newLen = (bars || []).length;
      const newFirstT = newLen > 0 ? bars[0].t : 0;
      const identityChanged = newLen > 0 && prevLen > 0 && newFirstT !== st.emasMeta.firstT;

      st.bars = bars || [];
      if (o.tf) st.tf = o.tf;
      if (o.digits != null) st.digits = o.digits;

      const closes = st.bars.map(function (b) { return b.c; });

      if (identityChanged || prevLen === 0 || newLen < prevLen) {
        st.emas = computeEmas(closes);
        st.offset = 0;
      } else if (newLen === prevLen) {
        const lastC = closes[newLen - 1];
        if (prevLen === 1) {
          st.emas = computeEmas(closes);
        } else if (lastC !== st.emasMeta.lastC) {
          st.emas.e20 = incrementalUpdate(st.emas.e20, closes, EMA_PERIODS[0]);
          st.emas.e50 = incrementalUpdate(st.emas.e50, closes, EMA_PERIODS[1]);
          st.emas.e200 = incrementalUpdate(st.emas.e200, closes, EMA_PERIODS[2]);
        }
      } else if (newLen === prevLen + 1) {
        st.emas.e20 = appendUpdate(st.emas.e20, closes, EMA_PERIODS[0]);
        st.emas.e50 = appendUpdate(st.emas.e50, closes, EMA_PERIODS[1]);
        st.emas.e200 = appendUpdate(st.emas.e200, closes, EMA_PERIODS[2]);
      } else {
        st.emas = computeEmas(closes);
      }

      st.emasMeta.lastLen = newLen;
      st.emasMeta.firstT = newFirstT;
      st.emasMeta.lastC = newLen > 0 ? closes[newLen - 1] : NaN;

      schedule();
    }

    function setZones(zones) {
      st.zones = zones || { ob: null, fvg: null, ote: null };
      schedule();
    }

    function zoom(f) {
      st.count = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(st.count * f)));
      schedule();
    }

    function reset() {
      st.count = cfg().defaultCount || DEFAULT_COUNT;
      st.offset = 0;
      schedule();
    }

    function resize() {
      schedule();
    }

    function range() {
      const n = st.bars.length;
      const count = Math.min(st.count, n);
      const end = Math.min(n, Math.max(count, n - st.offset));
      return { start: end - count, end: end, count: count };
    }

    function addZoneToRange(zone, bounds) {
      if (!zone) return;
      if (zone.top > bounds.hi) bounds.hi = zone.top;
      if (zone.bottom < bounds.lo) bounds.lo = zone.bottom;
    }

    function drawZone(zone, fillColor, r, x, y, plotW) {
      if (!zone) return;
      const idx = zone.index != null ? zone.index : r.start;
      if (idx >= r.end) return;
      const xStart = idx >= r.start ? x(idx) : PAD.l;
      const xEnd = PAD.l + plotW;
      if (xStart >= xEnd) return;
      const yTop = y(zone.top);
      const yBot = y(zone.bottom);
      ctx.fillStyle = fillColor;
      ctx.fillRect(xStart, yTop, xEnd - xStart, yBot - yTop);
    }

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
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

      const bounds = { lo: Infinity, hi: -Infinity };
      vis.forEach(function (b) {
        if (b.l < bounds.lo) bounds.lo = b.l;
        if (b.h > bounds.hi) bounds.hi = b.h;
      });
      addZoneToRange(st.zones.ob, bounds);
      addZoneToRange(st.zones.fvg, bounds);
      addZoneToRange(st.zones.ote, bounds);

      const pad = (bounds.hi - bounds.lo) * 0.1 || 1;
      bounds.lo -= pad;
      bounds.hi += pad;

      const y = function (p) {
        return PAD.t + (bounds.hi - p) / (bounds.hi - bounds.lo) * plotH;
      };
      const x = function (idx) {
        return PAD.l + (idx - r.start) * step + step / 2;
      };
      const fmt = function (p) { return p.toFixed(st.digits); };

      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = color('grid', 'rgba(255, 255, 255, 0.05)');
      ctx.fillStyle = '#6b7785';
      ctx.textAlign = 'left';

      for (let k = 0; k <= 4; k++) {
        const p = bounds.lo + (bounds.hi - bounds.lo) * k / 4;
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

      drawZone(st.zones.ote, color('zoneOTE', 'rgba(168, 85, 247, 0.15)'), r, x, y, plotW);
      drawZone(st.zones.fvg, color('zoneFVG', 'rgba(59, 130, 246, 0.15)'), r, x, y, plotW);

      if (st.zones.ob) {
        const obColor = st.zones.ob.direction === 1
          ? color('zoneOB', 'rgba(34, 197, 94, 0.15)')
          : 'rgba(239, 68, 68, 0.15)';
        drawZone(st.zones.ob, obColor, r, x, y, plotW);
      }

      const upColor = color('up', '#22c55e');
      const downColor = color('down', '#ef4444');

      for (let i = r.start; i < r.end; i++) {
        const b = st.bars[i];
        const xx = x(i);
        const c = b.c >= b.o ? upColor : downColor;
        ctx.strokeStyle = c;
        ctx.fillStyle = c;

        ctx.beginPath();
        ctx.moveTo(xx, y(b.h));
        ctx.lineTo(xx, y(b.l));
        ctx.stroke();

        const top = y(Math.max(b.o, b.c));
        const bot = y(Math.min(b.o, b.c));
        ctx.fillRect(xx - bodyW / 2, top, bodyW, Math.max(1, bot - top));
      }

      function drawEmaLine(arr, strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = r.start; i < r.end; i++) {
          const v = arr[i];
          if (v == null || !Number.isFinite(v)) continue;
          if (!started) { ctx.moveTo(x(i), y(v)); started = true; }
          else ctx.lineTo(x(i), y(v));
        }
        ctx.stroke();
      }

      drawEmaLine(st.emas.e20, color('ema20', '#f59e0b'));
      drawEmaLine(st.emas.e50, color('ema50', '#3b82f6'));
      drawEmaLine(st.emas.e200, color('ema200', '#a855f7'));

      ctx.restore();

      if (st.px != null && !st.drag && !st.pinchStart &&
          st.px >= PAD.l && st.px <= PAD.l + plotW &&
          st.py >= PAD.t && st.py <= PAD.t + plotH) {
        ctx.strokeStyle = 'rgba(154, 164, 178, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(st.px, PAD.t);
        ctx.lineTo(st.px, PAD.t + plotH);
        ctx.moveTo(PAD.l, st.py);
        ctx.lineTo(PAD.l + plotW, st.py);
        ctx.stroke();
        ctx.setLineDash([]);

        const price = bounds.hi - (st.py - PAD.t) / plotH * (bounds.hi - bounds.lo);
        ctx.fillStyle = '#1a222c';
        ctx.fillRect(PAD.l + plotW + 1, st.py - 8, PAD.r - 2, 16);
        ctx.fillStyle = '#e5e7eb';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmt(price), PAD.l + plotW + 5, st.py);
      }
    }

    function localPoint(e) {
      const b = canvas.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    }

    function distanceBetween(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onPointerDown(e) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        st.drag = { x: localPoint(e).x, offset: st.offset };
      } else if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        st.pinchStart = { dist: distanceBetween(pts[0], pts[1]), count: st.count };
        st.drag = null;
      }
    }

    function onPointerMove(e) {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pointers.size === 2 && st.pinchStart) {
        const pts = Array.from(pointers.values());
        const d = distanceBetween(pts[0], pts[1]);
        if (d > 0 && st.pinchStart.dist > 0) {
          const ratio = st.pinchStart.dist / d;
          st.count = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(st.pinchStart.count * ratio)));
          schedule();
        }
        return;
      }

      const p = localPoint(e);

      if (st.drag) {
        const r = range();
        const step = (canvas.clientWidth - PAD.l - PAD.r) / r.count;
        if (step > 0) {
          const moved = Math.round((p.x - st.drag.x) / step);
          st.offset = Math.max(0, Math.min(st.bars.length - r.count, st.drag.offset + moved));
        }
        schedule();
        return;
      }

      st.px = p.x;
      st.py = p.y;

      const r = range();
      const step = (canvas.clientWidth - PAD.l - PAD.r) / r.count;
      const idx = Math.floor((p.x - PAD.l) / step) + r.start;
      if (opts.onHover) opts.onHover(st.bars[idx] || null);
      schedule();
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) st.pinchStart = null;
      if (pointers.size === 0) st.drag = null;
    }

    function onPointerLeave() {
      st.px = null;
      st.py = null;
      if (opts.onHover) opts.onHover(null);
      schedule();
    }

    function onWheel(e) {
      e.preventDefault();
      zoom(e.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR);
    }

    function onResize() {
      if (st.resizeTimer) clearTimeout(st.resizeTimer);
      st.resizeTimer = setTimeout(function () {
        st.resizeTimer = null;
        schedule();
      }, RESIZE_DEBOUNCE_MS);
    }

    canvas.addEventListener('pointerdown', onPointerDown, { signal: ac.signal });
    canvas.addEventListener('pointermove', onPointerMove, { signal: ac.signal });
    canvas.addEventListener('pointerup', onPointerUp, { signal: ac.signal });
    canvas.addEventListener('pointercancel', onPointerUp, { signal: ac.signal });
    canvas.addEventListener('pointerleave', onPointerLeave, { signal: ac.signal });
    canvas.addEventListener('wheel', onWheel, { passive: false, signal: ac.signal });
    window.addEventListener('resize', onResize, { signal: ac.signal });
    window.addEventListener('orientationchange', onResize, { signal: ac.signal });

    function destroy() {
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st.resizeTimer) clearTimeout(st.resizeTimer);
      st.raf = 0;
      st.resizeTimer = null;
      pointers.clear();
      st.drag = null;
      st.pinchStart = null;
      ac.abort();
    }

    return {
      setData: setData,
      setZones: setZones,
      zoom: zoom,
      reset: reset,
      resize: resize,
      destroy: destroy
    };
  }

  return { create: create };
}));