(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.AT = root.AT || {}; root.AT.indicators = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function nulls(n) {
    return new Array(n).fill(null);
  }

  function firstValid(values) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v != null && Number.isFinite(v)) return i;
    }
    return -1;
  }

  function last(values, k) {
    return values[values.length - 1 - (k || 0)];
  }

  function sma(values, period) {
    const n = values.length;
    const out = nulls(n);
    const start = firstValid(values);
    if (start < 0 || n - start < period) return out;
    let sum = 0;
    for (let i = start; i < start + period; i++) sum += values[i];
    out[start + period - 1] = sum / period;
    for (let i = start + period; i < n; i++) {
      sum += values[i] - values[i - period];
      out[i] = sum / period;
    }
    return out;
  }

  function smooth(values, period, alpha) {
    const n = values.length;
    const out = nulls(n);
    const start = firstValid(values);
    if (start < 0 || n - start < period) return out;
    let prev = 0;
    for (let i = start; i < start + period; i++) prev += values[i];
    prev /= period;
    out[start + period - 1] = prev;
    for (let i = start + period; i < n; i++) {
      prev = alpha * values[i] + (1 - alpha) * prev;
      out[i] = prev;
    }
    return out;
  }

  function ema(values, period) {
    return smooth(values, period, 2 / (period + 1));
  }

  function rma(values, period) {
    return smooth(values, period, 1 / period);
  }

  function updateEma(previous, value, period) {
    const k = 2 / (period + 1);
    return value * k + previous * (1 - k);
  }

  function updateRma(previous, value, period) {
    return (previous * (period - 1) + value) / period;
  }

  function tr(highs, lows, closes) {
    const n = closes.length;
    const out = new Array(n);
    if (n === 0) return out;
    out[0] = highs[0] - lows[0];
    for (let i = 1; i < n; i++) {
      out[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
    }
    return out;
  }

  function atr(highs, lows, closes, period) {
    return rma(tr(highs, lows, closes), period || 14);
  }

  function rsi(closes, period) {
    period = period || 14;
    const n = closes.length;
    const out = nulls(n);
    if (n <= period) return out;

    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }
    gains /= period;
    losses /= period;

    function value(g, l) {
      if (l === 0) return g === 0 ? 50 : 100;
      return 100 - 100 / (1 + g / l);
    }

    out[period] = value(gains, losses);

    for (let i = period + 1; i < n; i++) {
      const change = closes[i] - closes[i - 1];
      gains = (gains * (period - 1) + (change > 0 ? change : 0)) / period;
      losses = (losses * (period - 1) + (change < 0 ? -change : 0)) / period;
      out[i] = value(gains, losses);
    }
    return out;
  }

  function adx(highs, lows, closes, period) {
    period = period || 14;
    const n = closes.length;
    const plusDM = nulls(n);
    const minusDM = nulls(n);
    const trueRange = nulls(n);

    for (let i = 1; i < n; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
      minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
      trueRange[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
    }

    const smoothedPlus = rma(plusDM, period);
    const smoothedMinus = rma(minusDM, period);
    const smoothedTr = rma(trueRange, period);

    const plusDI = nulls(n);
    const minusDI = nulls(n);
    const dx = nulls(n);

    for (let i = 0; i < n; i++) {
      if (smoothedTr[i] == null || smoothedPlus[i] == null || smoothedMinus[i] == null) continue;
      plusDI[i] = smoothedTr[i] === 0 ? 0 : (100 * smoothedPlus[i]) / smoothedTr[i];
      minusDI[i] = smoothedTr[i] === 0 ? 0 : (100 * smoothedMinus[i]) / smoothedTr[i];
      const sum = plusDI[i] + minusDI[i];
      dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i] - minusDI[i])) / sum;
    }

    return {
      adx: rma(dx, period),
      plusDI: plusDI,
      minusDI: minusDI
    };
  }

  return {
    nulls: nulls,
    firstValid: firstValid,
    last: last,
    sma: sma,
    ema: ema,
    rma: rma,
    updateEma: updateEma,
    updateRma: updateRma,
    tr: tr,
    atr: atr,
    rsi: rsi,
    adx: adx
  };
}));