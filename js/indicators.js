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

  function rsiValue(g, l) {
    if (l === 0) return g === 0 ? 50 : 100;
    return 100 - 100 / (1 + g / l);
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

    out[period] = rsiValue(gains, losses);

    for (let i = period + 1; i < n; i++) {
      const change = closes[i] - closes[i - 1];
      gains = (gains * (period - 1) + (change > 0 ? change : 0)) / period;
      losses = (losses * (period - 1) + (change < 0 ? -change : 0)) / period;
      out[i] = rsiValue(gains, losses);
    }
    return out;
  }

  function initRsiState(closes, period) {
    period = period || 14;
    if (!closes || closes.length <= period) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }
    gains /= period;
    losses /= period;
    return {
      period: period,
      prevClose: closes[period],
      gains: gains,
      losses: losses,
      value: rsiValue(gains, losses)
    };
  }

  function nextRsi(state, close) {
    if (!state || !Number.isFinite(close)) return state;
    const change = close - state.prevClose;
    const period = state.period;
    const gains = (state.gains * (period - 1) + (change > 0 ? change : 0)) / period;
    const losses = (state.losses * (period - 1) + (change < 0 ? -change : 0)) / period;
    return {
      period: period,
      prevClose: close,
      gains: gains,
      losses: losses,
      value: rsiValue(gains, losses)
    };
  }

  function computeDx(high, low, close, prevHigh, prevLow, prevClose) {
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;
    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    return { plusDM: plusDM, minusDM: minusDM, trueRange: trueRange };
  }

  function diAndDx(sp, sm, st) {
    const plusDI = st === 0 ? 0 : (100 * sp) / st;
    const minusDI = st === 0 ? 0 : (100 * sm) / st;
    const sum = plusDI + minusDI;
    const dx = sum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / sum;
    return { plusDI: plusDI, minusDI: minusDI, dx: dx };
  }

  function adx(highs, lows, closes, period) {
    period = period || 14;
    const n = closes.length;
    const plusDM = nulls(n);
    const minusDM = nulls(n);
    const trueRange = nulls(n);

    for (let i = 1; i < n; i++) {
      const d = computeDx(highs[i], lows[i], closes[i], highs[i - 1], lows[i - 1], closes[i - 1]);
      plusDM[i] = d.plusDM;
      minusDM[i] = d.minusDM;
      trueRange[i] = d.trueRange;
    }

    const smoothedPlus = rma(plusDM, period);
    const smoothedMinus = rma(minusDM, period);
    const smoothedTr = rma(trueRange, period);

    const plusDI = nulls(n);
    const minusDI = nulls(n);
    const dx = nulls(n);

    for (let i = 0; i < n; i++) {
      if (smoothedTr[i] == null || smoothedPlus[i] == null || smoothedMinus[i] == null) continue;
      const r = diAndDx(smoothedPlus[i], smoothedMinus[i], smoothedTr[i]);
      plusDI[i] = r.plusDI;
      minusDI[i] = r.minusDI;
      dx[i] = r.dx;
    }

    return {
      adx: rma(dx, period),
      plusDI: plusDI,
      minusDI: minusDI
    };
  }

  function initAdxState(highs, lows, closes, period) {
    period = period || 14;
    if (!closes || closes.length < period * 2 + 1) return null;

    let sumPlus = 0;
    let sumMinus = 0;
    let sumTr = 0;

    for (let i = 1; i <= period; i++) {
      const d = computeDx(highs[i], lows[i], closes[i], highs[i - 1], lows[i - 1], closes[i - 1]);
      sumPlus += d.plusDM;
      sumMinus += d.minusDM;
      sumTr += d.trueRange;
    }

    let smoothPlus = sumPlus / period;
    let smoothMinus = sumMinus / period;
    let smoothTr = sumTr / period;

    let first = diAndDx(smoothPlus, smoothMinus, smoothTr);
    let dxSum = first.dx;
    let idx = period + 1;

    while (idx < period * 2 + 1 && idx < closes.length) {
      const d = computeDx(highs[idx], lows[idx], closes[idx], highs[idx - 1], lows[idx - 1], closes[idx - 1]);
      smoothPlus = updateRma(smoothPlus, d.plusDM, period);
      smoothMinus = updateRma(smoothMinus, d.minusDM, period);
      smoothTr = updateRma(smoothTr, d.trueRange, period);
      const r = diAndDx(smoothPlus, smoothMinus, smoothTr);
      dxSum += r.dx;
      idx++;
    }

    const lastIdx = Math.min(idx, closes.length) - 1;
    if (lastIdx < period * 2) return null;

    return {
      period: period,
      prevHigh: highs[lastIdx],
      prevLow: lows[lastIdx],
      prevClose: closes[lastIdx],
      smoothPlus: smoothPlus,
      smoothMinus: smoothMinus,
      smoothTr: smoothTr,
      adx: dxSum / period,
      plusDI: first.plusDI,
      minusDI: first.minusDI
    };
  }

  function nextAdx(state, high, low, close) {
    if (!state) return state;
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return state;

    const d = computeDx(high, low, close, state.prevHigh, state.prevLow, state.prevClose);
    const period = state.period;
    const smoothPlus = updateRma(state.smoothPlus, d.plusDM, period);
    const smoothMinus = updateRma(state.smoothMinus, d.minusDM, period);
    const smoothTr = updateRma(state.smoothTr, d.trueRange, period);

    const r = diAndDx(smoothPlus, smoothMinus, smoothTr);
    const adxVal = updateRma(state.adx, r.dx, period);

    return {
      period: period,
      prevHigh: high,
      prevLow: low,
      prevClose: close,
      smoothPlus: smoothPlus,
      smoothMinus: smoothMinus,
      smoothTr: smoothTr,
      adx: adxVal,
      plusDI: r.plusDI,
      minusDI: r.minusDI
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
    initRsiState: initRsiState,
    nextRsi: nextRsi,
    adx: adx,
    initAdxState: initAdxState,
    nextAdx: nextAdx
  };
}));