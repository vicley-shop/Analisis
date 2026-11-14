(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'), require('./signals.js'));
  else { root.AT = root.AT || {}; root.AT.strategies = factory(root.AT.indicators, root.AT.signals); }
}(typeof self !== 'undefined' ? self : this, function (I, S) {
  'use strict';

  function memo(ind, key, fn) { return ind.x[key] || (ind.x[key] = fn()); }

  function crossUp(a, b, i) {
    return i > 0 && a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i - 1] <= b[i - 1] && a[i] > b[i];
  }

  function crossDown(a, b, i) {
    return i > 0 && a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i - 1] >= b[i - 1] && a[i] < b[i];
  }

  function swingHighs(h, lookback) {
    const n = h.length, out = new Array(n).fill(null);
    for (let i = lookback; i < n - lookback; i++) {
      let isHigh = true;
      for (let j = 1; j <= lookback; j++) {
        if (h[i] <= h[i - j] || h[i] <= h[i + j]) { isHigh = false; break; }
      }
      if (isHigh) out[i] = h[i];
    }
    return out;
  }

  function swingLows(l, lookback) {
    const n = l.length, out = new Array(n).fill(null);
    for (let i = lookback; i < n - lookback; i++) {
      let isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (l[i] >= l[i - j] || l[i] >= l[i + j]) { isLow = false; break; }
      }
      if (isLow) out[i] = l[i];
    }
    return out;
  }

  function passedSession(ind, i) {
    const o = ind.opts || {};
    if (!o.sessionFilter) return true;
    return S.inSession(ind.k.t[i], o.sessionStart != null ? o.sessionStart : 7, o.sessionEnd != null ? o.sessionEnd : 21);
  }

  function passedAdx(ind, i, threshold) {
    const o = ind.opts || {};
    if (!o.adxFilter) return true;
    const v = ind.adx.adx[i];
    return v != null && v >= (threshold || 20);
  }

  function passedRangeAdx(ind, i, threshold) {
    const o = ind.opts || {};
    const v = ind.adx.adx[i];
    if (v == null) return false;
    if (o.adxFilter) return v < (threshold || 25);
    return v < (threshold || 25);
  }

  const list = [
    {
      id: 'ema_cross',
      name: 'Cruce EMA 9/21 con filtro EMA 200',
      sl: 1.5,
      tp: 3,
      type: 'trend',
      desc: 'Tendencia: compra si EMA 9 cruza sobre 21 con precio sobre EMA 200. Venta al revés. Con filtro ADX opcional.',
      run: function (ind) {
        const k = ind.k, c = k.c, sig = new Array(k.n).fill(0);
        const f = memo(ind, 'ema9', function () { return I.ema(c, 9); });
        const s = memo(ind, 'ema21', function () { return I.ema(c, 21); });
        const t = memo(ind, 'ema200', function () { return I.ema(c, 200); });
        for (let i = 1; i < k.n; i++) {
          if (t[i] == null || !passedSession(ind, i)) continue;
          if (crossUp(f, s, i) && c[i] > t[i] && passedAdx(ind, i, 20)) sig[i] = 1;
          else if (crossDown(f, s, i) && c[i] < t[i] && passedAdx(ind, i, 20)) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'supertrend',
      name: 'Supertrend (10, 3)',
      sl: 1.5,
      tp: 3,
      type: 'trend',
      desc: 'Tendencia: opera cada cambio de dirección del Supertrend. Con filtro ADX opcional.',
      run: function (ind) {
        const k = ind.k, sig = new Array(k.n).fill(0);
        const st = memo(ind, 'st', function () { return I.supertrend(k.h, k.l, k.c, 10, 3); });
        for (let i = 1; i < k.n; i++) {
          if (st.dir[i] == null || st.dir[i - 1] == null || !passedSession(ind, i)) continue;
          if (st.dir[i] === 1 && st.dir[i - 1] === -1 && passedAdx(ind, i, 20)) sig[i] = 1;
          else if (st.dir[i] === -1 && st.dir[i - 1] === 1 && passedAdx(ind, i, 20)) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'macd_cross',
      name: 'Cruce MACD con filtro EMA 200',
      sl: 1.5,
      tp: 3,
      type: 'trend',
      desc: 'Tendencia: cruce de MACD con señal, solo a favor de la EMA 200. Con filtro ADX opcional.',
      run: function (ind) {
        const k = ind.k, c = k.c, sig = new Array(k.n).fill(0);
        const t = memo(ind, 'ema200', function () { return I.ema(c, 200); });
        for (let i = 1; i < k.n; i++) {
          if (t[i] == null || !passedSession(ind, i)) continue;
          if (crossUp(ind.macd.macd, ind.macd.signal, i) && c[i] > t[i] && passedAdx(ind, i, 20)) sig[i] = 1;
          else if (crossDown(ind.macd.macd, ind.macd.signal, i) && c[i] < t[i] && passedAdx(ind, i, 20)) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'donchian',
      name: 'Ruptura de canal Donchian (20)',
      sl: 2,
      tp: 4,
      type: 'trend',
      desc: 'Ruptura: compra si cierre supera el máximo de 20 barras; vende si pierde el mínimo. Con filtro ADX opcional.',
      run: function (ind) {
        const k = ind.k, c = k.c, sig = new Array(k.n).fill(0);
        const hi = memo(ind, 'dh', function () { return I.highest(k.h, 20); });
        const lo = memo(ind, 'dl', function () { return I.lowest(k.l, 20); });
        for (let i = 21; i < k.n; i++) {
          if (hi[i - 1] == null || !passedSession(ind, i) || !passedAdx(ind, i, 20)) continue;
          if (c[i] > hi[i - 1]) sig[i] = 1;
          else if (c[i] < lo[i - 1]) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'rsi_rev',
      name: 'RSI reversión en rango (ADX < 25)',
      sl: 1.5,
      tp: 1.5,
      type: 'reversion',
      desc: 'Reversión: compra si RSI vuelve a subir de 30, vende si baja de 70. Solo si el mercado está lateral.',
      run: function (ind) {
        const k = ind.k, r = ind.rsi, sig = new Array(k.n).fill(0);
        for (let i = 1; i < k.n; i++) {
          if (r[i] == null || r[i - 1] == null || !passedSession(ind, i)) continue;
          if (!passedRangeAdx(ind, i, 25)) continue;
          if (r[i - 1] < 30 && r[i] >= 30) sig[i] = 1;
          else if (r[i - 1] > 70 && r[i] <= 70) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'bb_rev',
      name: 'Rebote en Bollinger (20, 2) en rango',
      sl: 1.5,
      tp: 1.5,
      type: 'reversion',
      desc: 'Reversión: compra si el precio cierra dentro de la banda inferior; vende en la superior. Solo ADX < 25.',
      run: function (ind) {
        const k = ind.k, c = k.c, sig = new Array(k.n).fill(0);
        const bb = memo(ind, 'bb', function () { return I.bollinger(c, 20, 2); });
        for (let i = 1; i < k.n; i++) {
          if (bb.lower[i] == null || bb.lower[i - 1] == null || !passedSession(ind, i)) continue;
          if (!passedRangeAdx(ind, i, 25)) continue;
          if (c[i - 1] < bb.lower[i - 1] && c[i] > bb.lower[i]) sig[i] = 1;
          else if (c[i - 1] > bb.upper[i - 1] && c[i] < bb.upper[i]) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'consenso',
      name: 'Consenso del medidor (±0,4)',
      sl: 1.5,
      tp: 2.5,
      type: 'trend',
      desc: 'Opera cuando el medidor cruza a Compra fuerte (≥0,4) o Venta fuerte (≤-0,4).',
      run: function (ind) {
        const k = ind.k, sig = new Array(k.n).fill(0);
        const r = memo(ind, 'rating', function () { return S.ratingSeries(ind, 200); });
        for (let i = 1; i < k.n; i++) {
          if (r[i] == null || r[i - 1] == null || !passedSession(ind, i)) continue;
          if (r[i] >= 0.4 && r[i - 1] < 0.4) sig[i] = 1;
          else if (r[i] <= -0.4 && r[i - 1] > -0.4) sig[i] = -1;
        }
        return sig;
      }
    },
    {
      id: 'fib_pullback',
      name: 'Retroceso Fibonacci Golden Pocket (61,8%-65%)',
      sl: 2,
      tp: 3.5,
      type: 'trend',
      desc: 'Estructura de precios: impulso, retroceso al 61,8%-65% y vela de confirmación.',
      run: function (ind) {
        const k = ind.k, h = k.h, l = k.l, c = k.c, sig = new Array(k.n).fill(0);
        const lb = 5;
        const sh = memo(ind, 'sh', function () { return swingHighs(h, lb); });
        const sl = memo(ind, 'sl', function () { return swingLows(l, lb); });
        for (let i = lb * 2 + 2; i < k.n; i++) {
          if (!passedSession(ind, i)) continue;
          let lastHigh = null, lastHighIdx = -1;
          let lastLow = null, lastLowIdx = -1;
          for (let j = i - 1; j >= 0; j--) {
            if (sh[j] != null) { lastHigh = sh[j]; lastHighIdx = j; break; }
          }
          for (let j = i - 1; j >= 0; j--) {
            if (sl[j] != null) { lastLow = sl[j]; lastLowIdx = j; break; }
          }
          if (lastHigh == null || lastLow == null) continue;
          const range = lastHigh - lastLow;
          if (range <= 0) continue;

          const upMove = lastHigh > lastLow && lastHighIdx > lastLowIdx;
          const downMove = lastHigh > lastLow && lastLowIdx > lastHighIdx;

          if (upMove) {
            const goldenLow = lastHigh - range * 0.65;
            const goldenHigh = lastHigh - range * 0.618;
            if (l[i - 1] >= goldenLow && l[i - 1] <= goldenHigh && c[i] > c[i - 1] && c[i] > k.o[i]) sig[i] = 1;
          } else if (downMove) {
            const goldenLow = lastLow + range * 0.618;
            const goldenHigh = lastLow + range * 0.65;
            if (h[i - 1] >= goldenLow && h[i - 1] <= goldenHigh && c[i] < c[i - 1] && c[i] < k.o[i]) sig[i] = -1;
          }
        }
        return sig;
      }
    },
    {
      id: 'vol_pullback',
      name: 'Pullback con expansión de volatilidad (EMA + ATR)',
      sl: 2.5,
      tp: 4.5,
      type: 'trend',
      desc: 'Pullback: cruce EMA, 1-3 velas de retroceso y entrada en ruptura del canal de volatilidad.',
      run: function (ind) {
        const k = ind.k, h = k.h, l = k.l, c = k.c, sig = new Array(k.n).fill(0);
        const fast = memo(ind, 'vp_ema9', function () { return I.ema(c, 9); });
        const slow = memo(ind, 'vp_ema21', function () { return I.ema(c, 21); });
        const atr = ind.atr;

        let state = 0;
        let armedDir = 0, armedBar = 0, chanHi = null, chanLo = null;

        for (let i = 1; i < k.n; i++) {
          if (fast[i] == null || slow[i] == null || atr[i] == null || !passedSession(ind, i)) continue;

          if (state === 0) {
            if (crossUp(fast, slow, i)) { state = 1; armedDir = 1; armedBar = i; }
            else if (crossDown(fast, slow, i)) { state = 1; armedDir = -1; armedBar = i; }
            continue;
          }

          if (state === 1) {
            if (i - armedBar > 3) { state = 0; continue; }
            const pull = armedDir === 1 ? (c[i] < c[i - 1]) : (c[i] > c[i - 1]);
            if (pull) {
              chanHi = Math.max(h[i], h[i - 1]);
              chanLo = Math.min(l[i], l[i - 1]);
              state = 2;
            }
            continue;
          }

          if (state === 2) {
            if (i - armedBar > 6) { state = 0; continue; }
            if (armedDir === 1) {
              chanHi = Math.max(chanHi, h[i]);
              if (c[i] > chanHi) { sig[i] = 1; state = 0; }
              else if (c[i] < chanLo - atr[i]) { state = 0; }
            } else {
              chanLo = Math.min(chanLo, l[i]);
              if (c[i] < chanLo) { sig[i] = -1; state = 0; }
              else if (c[i] > chanHi + atr[i]) { state = 0; }
            }
          }
        }
        return sig;
      }
    }
  ];

  const byId = {};
  list.forEach(function (s) { byId[s.id] = s; });

  function prepare(bars, opts) {
    const ind = S.compute(bars);
    ind.opts = opts || {};
    return ind;
  }

  return {
    list: list,
    byId: byId,
    prepare: prepare,
    crossUp: crossUp,
    crossDown: crossDown
  };
}));