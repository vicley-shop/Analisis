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
  const STORAGE_PREFIX = 'mcp:drawings:';
  const MIN_DRAW_PIXELS = 5;

  function cfg() { return (window.AT_CONFIG && window.AT_CONFIG.chart) || {}; }
  function drawCfg() { return (window.AT_CONFIG && window.AT_CONFIG.drawing) || {}; }

  function color(key, fallback) {
    const colors = cfg().colors;
    return (colors && colors[key]) || fallback;
  }

  function hexToRgba(hex, alpha) {
    if (!hex) return 'rgba(0,0,0,' + alpha + ')';
    if (hex.indexOf('rgb') === 0) return hex;
    const m = hex.replace('#', '');
    if (m.length < 6) return 'rgba(0,0,0,' + alpha + ')';
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function isDrawingTool(tool) {
    return tool === 'line' || tool === 'h' || tool === 'v' || tool === 'rect' || tool === 'fib';
  }

  function emptyZones() {
    return { ob: null, fvg: null, ote: null };
  }

  function normalizeZones(zones) {
    if (!zones || typeof zones !== 'object') return emptyZones();
    return {
      ob: zones.ob || null,
      fvg: zones.fvg || null,
      ote: zones.ote || null
    };
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
      symbol: '',
      digits: 2,
      px: null,
      py: null,
      drag: null,
      pinchStart: null,
      raf: 0,
      resizeTimer: null,
      emas: { e20: [], e50: [], e200: [] },
      emasMeta: { lastLen: 0, firstT: 0, lastC: NaN },
      zones: emptyZones(),
      tool: 'cursor',
      drawings: [],
      draft: null,
      pendingDraw: null
    };

    function scopeKey() {
      const scope = st.symbol || 'default';
      return STORAGE_PREFIX + scope + ':' + (st.tf || '1h');
    }

    function loadDrawings() {
      try {
        const raw = window.localStorage.getItem(scopeKey());
        if (!raw) { st.drawings = []; return; }
        const parsed = JSON.parse(raw);
        st.drawings = Array.isArray(parsed) ? parsed.filter(isValidDrawing) : [];
      } catch (e) {
        st.drawings = [];
      }
    }

    function isValidDrawing(d) {
      if (!d || typeof d !== 'object') return false;
      if (!d.p1 || typeof d.p1.t !== 'number' || typeof d.p1.price !== 'number') return false;
      if (d.p2 && (typeof d.p2.t !== 'number' || typeof d.p2.price !== 'number')) return false;
      if (d.type !== 'line' && d.type !== 'h' && d.type !== 'v' && d.type !== 'rect' && d.type !== 'fib') return false;
      return true;
    }

    function saveDrawings() {
      const max = drawCfg().maxPerScope || 100;
      if (st.drawings.length > max) st.drawings = st.drawings.slice(-max);
      try {
        window.localStorage.setItem(scopeKey(), JSON.stringify(st.drawings));
      } catch (e) { void 0; }
    }

    function newId() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function barsRange() {
      const n = st.bars.length;
      if (!n) return null;
      const count = Math.min(st.count, n);
      const end = Math.min(n, Math.max(count, n - st.offset));
      return { start: end - count, end: end, count: count };
    }

    function plotDims() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      return { w: w, h: h, plotW: w - PAD.l - PAD.r, plotH: h - PAD.t - PAD.b };
    }

    function timeAtIndex(idx) {
      const bars = st.bars;
      if (!bars.length) return 0;
      const last = bars.length - 1;
      if (bars.length < 2) return bars[0].t;
      const avgStep = (bars[last].t - bars[0].t) / last;
      if (idx <= 0) return bars[0].t + idx * avgStep;
      if (idx >= last) return bars[last].t + (idx - last) * avgStep;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return bars[lo].t;
      const frac = idx - lo;
      return bars[lo].t + frac * (bars[hi].t - bars[lo].t);
    }

    function indexAtTime(t) {
      const bars = st.bars;
      if (!bars.length) return 0;
      const last = bars.length - 1;
      if (bars.length < 2) return 0;
      const avgStep = (bars[last].t - bars[0].t) / last;
      if (t <= bars[0].t) return (t - bars[0].t) / avgStep;
      if (t >= bars[last].t) return last + (t - bars[last].t) / avgStep;
      let lo = 0;
      let hi = last;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].t <= t) lo = mid;
        else hi = mid;
      }
      const t1 = bars[lo].t;
      const t2 = bars[hi].t;
      if (t2 === t1) return lo;
      return lo + (t - t1) / (t2 - t1);
    }

    function screenToData(px, py, r, bounds, plotW, plotH) {
      const step = plotW / r.count;
      const idx = r.start + (px - PAD.l - step / 2) / step;
      const t = timeAtIndex(idx);
      const relY = (py - PAD.t) / plotH;
      const price = bounds.hi - relY * (bounds.hi - bounds.lo);
      return { t: t, price: price };
    }

    function dataToScreen(dataPoint, r, bounds, plotW, plotH) {
      const idx = indexAtTime(dataPoint.t);
      const step = plotW / r.count;
      const x = PAD.l + (idx - r.start) * step + step / 2;
      const y = PAD.t + (bounds.hi - dataPoint.price) / (bounds.hi - bounds.lo) * plotH;
      return { x: x, y: y };
    }

    function strokeLine(x1, y1, x2, y2, strokeColor, dashed, width) {
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = width || drawCfg().lineWidth || 1.8;
      if (dashed) ctx.setLineDash(drawCfg().previewDash || [4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    function strokeRect(x1, y1, x2, y2, strokeColor, dashed, width) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = width || drawCfg().lineWidth || 1.8;
      if (dashed) ctx.setLineDash(drawCfg().previewDash || [4, 4]);
      ctx.strokeRect(left, top, w, h);
      ctx.fillStyle = hexToRgba(strokeColor, 0.08);
      ctx.fillRect(left, top, w, h);
      ctx.restore();
    }

    function fillText(text, x, y, fillColor, align) {
      ctx.save();
      ctx.fillStyle = fillColor || color('drawingText', 'rgba(230, 237, 243, 0.85)');
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    function formatPrice(p) { return Number(p).toFixed(st.digits); }

    function formatTime(t) {
      const d = new Date(t);
      const mm = ('0' + (d.getUTCMonth() + 1)).slice(-2);
      const dd = ('0' + d.getUTCDate()).slice(-2);
      const hh = ('0' + d.getUTCHours()).slice(-2);
      const mi = ('0' + d.getUTCMinutes()).slice(-2);
      return mm + '-' + dd + ' ' + hh + ':' + mi;
    }

    function drawFib(p1, p2, r, bounds, plotW, plotH, strokeColor, dashed) {
      const levels = drawCfg().fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const priceRange = p2.price - p1.price;
      const s1 = dataToScreen(p1, r, bounds, plotW, plotH);
      const s2 = dataToScreen(p2, r, bounds, plotW, plotH);
      const left = Math.min(s1.x, s2.x);
      const right = Math.max(s1.x, s2.x);

      strokeLine(s1.x, s1.y, s2.x, s2.y, strokeColor, true, 1);

      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        const price = p1.price + priceRange * lvl;
        const y = PAD.t + (bounds.hi - price) / (bounds.hi - bounds.lo) * plotH;
        if (y < PAD.t - 1 || y > PAD.t + plotH + 1) continue;

        const isKey = lvl === 0 || lvl === 1 || lvl === 0.5 || lvl === 0.618;
        ctx.save();
        ctx.globalAlpha = isKey ? 0.9 : 0.5;
        strokeLine(left, y, right, y, strokeColor, dashed, isKey ? 1.4 : 0.9);
        ctx.restore();

        const label = (lvl * 100).toFixed(1) + '% (' + formatPrice(price) + ')';
        fillText(label, right + 4, y, strokeColor, 'left');
      }
    }

    function renderDrawing(d, r, bounds, plotW, plotH, isDraft) {
      if (!d || !d.p1) return;
      const baseCol = d.color || drawCfg().defaultColor || color('drawing', '#00b8d9');
      const strokeColor = isDraft ? color('drawingInProgress', 'rgba(34, 211, 238, 0.75)') : baseCol;
      const dashed = isDraft;

      const s1 = dataToScreen(d.p1, r, bounds, plotW, plotH);
      const p2 = d.p2 || d.p1;

      if (d.type === 'h') {
        strokeLine(PAD.l, s1.y, PAD.l + plotW, s1.y, strokeColor, dashed);
        fillText(formatPrice(d.p1.price), PAD.l + plotW - 4, s1.y - 10, strokeColor, 'right');
        return;
      }

      if (d.type === 'v') {
        strokeLine(s1.x, PAD.t, s1.x, PAD.t + plotH, strokeColor, dashed);
        fillText(formatTime(d.p1.t), s1.x + 4, PAD.t + 10, strokeColor, 'left');
        return;
      }

      const s2 = dataToScreen(p2, r, bounds, plotW, plotH);

      if (d.type === 'line') {
        strokeLine(s1.x, s1.y, s2.x, s2.y, strokeColor, dashed);
        return;
      }
      if (d.type === 'rect') {
        strokeRect(s1.x, s1.y, s2.x, s2.y, strokeColor, dashed);
        return;
      }
      if (d.type === 'fib') {
        drawFib(d.p1, p2, r, bounds, plotW, plotH, strokeColor, dashed);
        return;
      }
    }

    function setTool(tool) {
      if (!drawCfg().enabled && tool !== 'cursor') return;
      st.tool = tool || 'cursor';
      st.pendingDraw = null;
      st.draft = null;
      pointers.clear();
      st.drag = null;
      st.pinchStart = null;
      schedule();
    }

    function undo() {
      if (!st.drawings.length) return;
      st.drawings.pop();
      saveDrawings();
      schedule();
    }

    function clearDrawings() {
      st.drawings = [];
      st.draft = null;
      st.pendingDraw = null;
      saveDrawings();
      schedule();
    }

    function cancelDrawing() {
      if (!st.draft && !st.pendingDraw) return false;
      st.draft = null;
      st.pendingDraw = null;
      pointers.clear();
      st.drag = null;
      st.pinchStart = null;
      schedule();
      return true;
    }

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

    function updateLast(prevArr, closes, period) {
      const n = closes.length;
      const lastIdx = n - 1;
      const prevVal = prevArr[lastIdx - 1];
      if (prevVal == null || !Number.isFinite(prevVal)) return I.ema(closes, period);
      const out = prevArr.slice();
      out[lastIdx] = I.updateEma(prevVal, closes[lastIdx], period);
      return out;
    }

    function appendLast(prevArr, closes, period) {
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
      const newBars = bars || [];
      const newLen = newBars.length;
      const newFirstT = newLen > 0 ? newBars[0].t : 0;
      const newSymbol = o.symbol || st.symbol;
      const newTf = o.tf || st.tf;
      const scopeChanged = (newSymbol !== st.symbol) || (newTf !== st.tf);
      const bufferRotated = newLen > 0 && prevLen > 0 && newFirstT !== st.emasMeta.firstT;
      const identityChanged = scopeChanged || bufferRotated;

      st.bars = newBars;
      if (o.tf) st.tf = o.tf;
      if (o.symbol) st.symbol = o.symbol;
      if (o.digits != null) st.digits = o.digits;

      if (scopeChanged) {
        st.draft = null;
        st.pendingDraw = null;
        loadDrawings();
      }

      const closes = st.bars.map(function (b) { return b.c; });

      if (identityChanged || prevLen === 0 || newLen < prevLen) {
        st.emas = computeEmas(closes);
        if (scopeChanged || bufferRotated) {
          st.offset = 0;
        }
      } else if (newLen === prevLen) {
        if (prevLen === 1) {
          st.emas = computeEmas(closes);
        } else if (closes[newLen - 1] !== st.emasMeta.lastC) {
          st.emas.e20 = updateLast(st.emas.e20, closes, EMA_PERIODS[0]);
          st.emas.e50 = updateLast(st.emas.e50, closes, EMA_PERIODS[1]);
          st.emas.e200 = updateLast(st.emas.e200, closes, EMA_PERIODS[2]);
        }
      } else if (newLen === prevLen + 1) {
        st.emas.e20 = appendLast(st.emas.e20, closes, EMA_PERIODS[0]);
        st.emas.e50 = appendLast(st.emas.e50, closes, EMA_PERIODS[1]);
        st.emas.e200 = appendLast(st.emas.e200, closes, EMA_PERIODS[2]);
      } else {
        st.emas = computeEmas(closes);
      }

      st.emasMeta.lastLen = newLen;
      st.emasMeta.firstT = newFirstT;
      st.emasMeta.lastC = newLen > 0 ? closes[newLen - 1] : NaN;

      schedule();
    }

    function setZones(zones) {
      st.zones = normalizeZones(zones);
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

    function resize() { schedule(); }

    function addZoneToRange(zone, bounds) {
      if (!zone) return;
      if (zone.top > bounds.hi) bounds.hi = zone.top;
      if (zone.bottom < bounds.lo) bounds.lo = zone.bottom;
    }

    function computeBounds(r) {
      const vis = st.bars.slice(r.start, r.end);
      const bounds = { lo: Infinity, hi: -Infinity };
      for (let i = 0; i < vis.length; i++) {
        if (vis[i].l < bounds.lo) bounds.lo = vis[i].l;
        if (vis[i].h > bounds.hi) bounds.hi = vis[i].h;
      }
      addZoneToRange(st.zones.ob, bounds);
      addZoneToRange(st.zones.fvg, bounds);
      addZoneToRange(st.zones.ote, bounds);
      if (!Number.isFinite(bounds.lo) || !Number.isFinite(bounds.hi)) {
        bounds.lo = 0;
        bounds.hi = 1;
      }
      const pad = (bounds.hi - bounds.lo) * 0.1 || 1;
      bounds.lo -= pad;
      bounds.hi += pad;
      return bounds;
    }

    function drawZone(zone, fillColor, r, x, y, plotW) {
      if (!zone) return;
      const idx = zone.index != null ? zone.index : r.start;
      if (idx >= r.end) return;
      const xStart = idx >= r.start ? x(idx) : PAD.l;
      const xEnd = PAD.l + plotW;
      if (xStart >= xEnd) return;
      ctx.fillStyle = fillColor;
      ctx.fillRect(xStart, y(zone.top), xEnd - xStart, y(zone.bottom) - y(zone.top));
    }

    function draw() {
      const dims = plotDims();
      if (!dims.w || !dims.h || !st.bars.length) return;

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== dims.w * dpr || canvas.height !== dims.h * dpr) {
        canvas.width = dims.w * dpr;
        canvas.height = dims.h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, dims.w, dims.h);

      const r = barsRange();
      if (!r) return;
      const vis = st.bars.slice(r.start, r.end);
      if (!vis.length) return;

      const plotW = dims.plotW;
      const plotH = dims.plotH;
      const step = plotW / r.count;
      const bodyW = Math.max(1, step * 0.65);
      const bounds = computeBounds(r);

      const y = function (p) { return PAD.t + (bounds.hi - p) / (bounds.hi - bounds.lo) * plotH; };
      const x = function (idx) { return PAD.l + (idx - r.start) * step + step / 2; };

      ctx.font = '11px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = color('grid', 'rgba(255, 255, 255, 0.06)');
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      for (let k = 0; k <= 4; k++) {
        const p = bounds.lo + (bounds.hi - bounds.lo) * k / 4;
        const yy = Math.round(y(p)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(PAD.l, yy);
        ctx.lineTo(PAD.l + plotW, yy);
        ctx.stroke();
        ctx.fillText(formatPrice(p), PAD.l + plotW + 5, yy);
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t, plotW, plotH);
      ctx.clip();

      drawZone(st.zones.ote, color('zoneOTE', 'rgba(168, 85, 247, 0.15)'), r, x, y, plotW);
      drawZone(st.zones.fvg, color('zoneFVG', 'rgba(0, 184, 217, 0.15)'), r, x, y, plotW);
      if (st.zones.ob) {
        const obColor = st.zones.ob.direction === 1
          ? color('zoneOB', 'rgba(16, 185, 129, 0.15)')
          : 'rgba(244, 63, 94, 0.15)';
        drawZone(st.zones.ob, obColor, r, x, y, plotW);
      }

      const upColor = color('up', '#10b981');
      const downColor = color('down', '#f43f5e');

      ctx.lineWidth = 1;
      ctx.strokeStyle = downColor;
      ctx.beginPath();
      for (let i = r.start; i < r.end; i++) {
        const b = st.bars[i];
        if (b.c >= b.o) continue;
        const xx = Math.round(x(i)) + 0.5;
        ctx.moveTo(xx, y(b.h));
        ctx.lineTo(xx, y(b.l));
      }
      ctx.stroke();

      ctx.strokeStyle = upColor;
      ctx.beginPath();
      for (let i = r.start; i < r.end; i++) {
        const b = st.bars[i];
        if (b.c < b.o) continue;
        const xx = Math.round(x(i)) + 0.5;
        ctx.moveTo(xx, y(b.h));
        ctx.lineTo(xx, y(b.l));
      }
      ctx.stroke();

      ctx.fillStyle = downColor;
      for (let i = r.start; i < r.end; i++) {
        const b = st.bars[i];
        if (b.c >= b.o) continue;
        const top = y(b.o);
        const bot = y(b.c);
        ctx.fillRect(Math.round(x(i) - bodyW / 2), top, bodyW, Math.max(1, bot - top));
      }

      ctx.fillStyle = upColor;
      for (let i = r.start; i < r.end; i++) {
        const b = st.bars[i];
        if (b.c < b.o) continue;
        const top = y(b.c);
        const bot = y(b.o);
        ctx.fillRect(Math.round(x(i) - bodyW / 2), top, bodyW, Math.max(1, bot - top));
      }

      function drawEma(arr, strokeColor) {
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
      drawEma(st.emas.e20, color('ema20', '#f59e0b'));
      drawEma(st.emas.e50, color('ema50', '#00b8d9'));
      drawEma(st.emas.e200, color('ema200', '#a855f7'));

      for (let i = 0; i < st.drawings.length; i++) {
        renderDrawing(st.drawings[i], r, bounds, plotW, plotH, false);
      }

      if (st.draft) {
        renderDrawing(st.draft, r, bounds, plotW, plotH, true);
      }

      ctx.restore();

      if (st.px != null && !st.drag && !st.pinchStart && !st.pendingDraw &&
          st.px >= PAD.l && st.px <= PAD.l + plotW &&
          st.py >= PAD.t && st.py <= PAD.t + plotH) {
        ctx.strokeStyle = 'rgba(139, 152, 169, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(st.px, PAD.t);
        ctx.lineTo(st.px, PAD.t + plotH);
        ctx.moveTo(PAD.l, st.py);
        ctx.lineTo(PAD.l + plotW, st.py);
        ctx.stroke();
        ctx.setLineDash([]);

        const price = bounds.hi - (st.py - PAD.t) / plotH * (bounds.hi - bounds.lo);
        ctx.fillStyle = '#141f2e';
        ctx.fillRect(PAD.l + plotW + 1, st.py - 8, PAD.r - 2, 16);
        ctx.fillStyle = '#e6edf3';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatPrice(price), PAD.l + plotW + 5, st.py);
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

    function insidePlot(p, dims) {
      return p.x >= PAD.l && p.x <= PAD.l + dims.plotW &&
             p.y >= PAD.t && p.y <= PAD.t + dims.plotH;
    }

    function onPointerDown(e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (st.pendingDraw && pointers.size === 2) {
        st.draft = null;
        st.pendingDraw = null;
      }

      if (isDrawingTool(st.tool) && pointers.size === 1) {
        const p = localPoint(e);
        const r = barsRange();
        if (!r) return;
        const dims = plotDims();
        if (!insidePlot(p, dims)) return;

        const bounds = computeBounds(r);
        const dataPoint = screenToData(p.x, p.y, r, bounds, dims.plotW, dims.plotH);

        if (st.tool === 'h' || st.tool === 'v') {
          st.drawings.push({
            id: newId(),
            type: st.tool,
            p1: dataPoint,
            p2: dataPoint,
            color: drawCfg().defaultColor || color('drawing', '#00b8d9')
          });
          saveDrawings();
          schedule();
          return;
        }

        canvas.setPointerCapture(e.pointerId);
        st.pendingDraw = { type: st.tool, p1: dataPoint, startPx: p.x, startPy: p.y };
        st.draft = { type: st.tool, p1: dataPoint, p2: dataPoint };
        schedule();
        return;
      }

      canvas.setPointerCapture(e.pointerId);
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

      if (st.pendingDraw) {
        const p = localPoint(e);
        const r = barsRange();
        if (!r) return;
        const dims = plotDims();
        const bounds = computeBounds(r);
        const dataPoint = screenToData(p.x, p.y, r, bounds, dims.plotW, dims.plotH);
        if (st.draft) st.draft.p2 = dataPoint;
        schedule();
        return;
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
        const r = barsRange();
        if (!r) return;
        const dims = plotDims();
        const step = dims.plotW / r.count;
        if (step > 0) {
          const moved = Math.round((p.x - st.drag.x) / step);
          st.offset = Math.max(0, Math.min(st.bars.length - r.count, st.drag.offset + moved));
        }
        schedule();
        return;
      }

      st.px = p.x;
      st.py = p.y;

      const r = barsRange();
      if (!r) return;
      const dims = plotDims();
      const step = dims.plotW / r.count;
      const idx = Math.floor((p.x - PAD.l) / step) + r.start;
      if (opts.onHover) opts.onHover(st.bars[idx] || null);
      schedule();
    }

    function onPointerUp(e) {
      const wasCancel = e.type === 'pointercancel';
      pointers.delete(e.pointerId);

      if (st.pendingDraw && st.draft) {
        const p = localPoint(e);
        const movedPx = Math.hypot(p.x - st.pendingDraw.startPx, p.y - st.pendingDraw.startPy);
        if (!wasCancel && movedPx >= MIN_DRAW_PIXELS) {
          st.drawings.push({
            id: newId(),
            type: st.draft.type,
            p1: st.draft.p1,
            p2: st.draft.p2 || st.draft.p1,
            color: drawCfg().defaultColor || color('drawing', '#00b8d9')
          });
          saveDrawings();
        }
        st.draft = null;
        st.pendingDraw = null;
      }

      if (pointers.size < 2) st.pinchStart = null;
      if (pointers.size === 0) {
        st.drag = null;
        if (wasCancel) {
          st.px = null;
          st.py = null;
          if (opts.onHover) opts.onHover(null);
        }
      }
      schedule();
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

    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (st.draft || st.pendingDraw) {
        st.draft = null;
        st.pendingDraw = null;
        pointers.clear();
        st.drag = null;
        st.pinchStart = null;
        schedule();
        e.stopImmediatePropagation();
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown, { signal: ac.signal });
    canvas.addEventListener('pointermove', onPointerMove, { signal: ac.signal });
    canvas.addEventListener('pointerup', onPointerUp, { signal: ac.signal });
    canvas.addEventListener('pointercancel', onPointerUp, { signal: ac.signal });
    canvas.addEventListener('pointerleave', onPointerLeave, { signal: ac.signal });
    canvas.addEventListener('wheel', onWheel, { passive: false, signal: ac.signal });
    window.addEventListener('resize', onResize, { signal: ac.signal });
    window.addEventListener('orientationchange', onResize, { signal: ac.signal });
    document.addEventListener('keydown', onKeyDown, { signal: ac.signal });

    function destroy() {
      if (st.raf) cancelAnimationFrame(st.raf);
      if (st.resizeTimer) clearTimeout(st.resizeTimer);
      st.raf = 0;
      st.resizeTimer = null;
      pointers.clear();
      st.drag = null;
      st.pinchStart = null;
      st.draft = null;
      st.pendingDraw = null;
      ac.abort();
    }

    return {
      setData: setData,
      setZones: setZones,
      zoom: zoom,
      reset: reset,
      resize: resize,
      destroy: destroy,
      setTool: setTool,
      undo: undo,
      clearDrawings: clearDrawings,
      cancelDrawing: cancelDrawing,
      getTool: function () { return st.tool; },
      getDrawings: function () { return st.drawings.slice(); }
    };
  }

  return { create: create };
}));