window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.ote = (function () {
  'use strict';

  const DEFAULT_OTE_MIN = 0.618;
  const DEFAULT_OTE_MAX = 0.79;
  const DEFAULT_OTE_MID = 0.705;
  const DEFAULT_SWING_RECENCY = 25;
  const DEFAULT_MIN_SWING_ATR_MULT = 4;
  const DEFAULT_MAX_SWING_AGE = 200;

  function cfg() {
    return (window.AT_CONFIG && window.AT_CONFIG.smc) || {};
  }

  function oteMin() {
    return cfg().oteMin != null ? cfg().oteMin : DEFAULT_OTE_MIN;
  }

  function oteMax() {
    return cfg().oteMax != null ? cfg().oteMax : DEFAULT_OTE_MAX;
  }

  function oteMid() {
    return cfg().oteMid != null ? cfg().oteMid : DEFAULT_OTE_MID;
  }

  function swingRecency() {
    return cfg().oteSwingRecency != null ? cfg().oteSwingRecency : DEFAULT_SWING_RECENCY;
  }

  function minSwingAtrMult() {
    return cfg().minSwingAtrMult != null ? cfg().minSwingAtrMult : DEFAULT_MIN_SWING_ATR_MULT;
  }

  function maxSwingAge() {
    return cfg().maxSwingAge != null ? cfg().maxSwingAge : DEFAULT_MAX_SWING_AGE;
  }

  function resolveAtr(atr) {
    if (atr == null) return 0;
    if (typeof atr === 'number') return Number.isFinite(atr) ? atr : 0;
    if (Array.isArray(atr) && atr.length) {
      for (let i = atr.length - 1; i >= 0; i--) {
        if (Number.isFinite(atr[i])) return atr[i];
      }
    }
    return 0;
  }

  function findExtremeHigh(pivots, fromIndex, toIndex) {
    let best = null;
    for (let i = 0; i < pivots.highs.length; i++) {
      const p = pivots.highs[i];
      if (p.index < fromIndex || p.index > toIndex) continue;
      if (!best || p.price > best.price) best = p;
    }
    return best;
  }

  function findExtremeLow(pivots, fromIndex, toIndex) {
    let best = null;
    for (let i = 0; i < pivots.lows.length; i++) {
      const p = pivots.lows[i];
      if (p.index < fromIndex || p.index > toIndex) continue;
      if (!best || p.price < best.price) best = p;
    }
    return best;
  }

  function findSwing(bars, pivots, direction, atr, opts) {
    opts = opts || {};
    if (!bars || bars.length < 10) return null;
    if (!pivots || !pivots.highs || !pivots.highs.length) return null;
    if (!pivots.lows || !pivots.lows.length) return null;
    if (direction !== 1 && direction !== -1) return null;

    const atrVal = resolveAtr(atr);
    if (!(atrVal > 0)) return null;

    const lastIdx = bars.length - 1;
    const recency = opts.swingRecency != null ? opts.swingRecency : swingRecency();
    const minMult = opts.minSwingAtrMult != null ? opts.minSwingAtrMult : minSwingAtrMult();
    const maxAge = opts.maxSwingAge != null ? opts.maxSwingAge : maxSwingAge();

    const recentStart = Math.max(0, lastIdx - recency);

    if (direction === 1) {
      const swingEnd = findExtremeHigh(pivots, recentStart, lastIdx);
      if (!swingEnd) return null;
      const ageBars = lastIdx - swingEnd.index;
      if (ageBars > recency) return null;

      const lowSearchStart = Math.max(0, swingEnd.index - maxAge);
      const swingStart = findExtremeLow(pivots, lowSearchStart, swingEnd.index - 1);
      if (!swingStart) return null;

      const swingSize = swingEnd.price - swingStart.price;
      if (swingSize < minMult * atrVal) return null;

      return {
        direction: 1,
        swingStart: swingStart,
        swingEnd: swingEnd,
        swingSize: swingSize,
        swingSizeAtr: swingSize / atrVal,
        ageBars: ageBars
      };
    }

    const swingEnd = findExtremeLow(pivots, recentStart, lastIdx);
    if (!swingEnd) return null;
    const ageBars = lastIdx - swingEnd.index;
    if (ageBars > recency) return null;

    const highSearchStart = Math.max(0, swingEnd.index - maxAge);
    const swingStart = findExtremeHigh(pivots, highSearchStart, swingEnd.index - 1);
    if (!swingStart) return null;

    const swingSize = swingStart.price - swingEnd.price;
    if (swingSize < minMult * atrVal) return null;

    return {
      direction: -1,
      swingStart: swingStart,
      swingEnd: swingEnd,
      swingSize: swingSize,
      swingSizeAtr: swingSize / atrVal,
      ageBars: ageBars
    };
  }

  function stateFor(direction, currentPrice, swingStart, top, bottom) {
    if (direction === 1) {
      if (currentPrice < swingStart) return 'failed';
      if (currentPrice >= bottom && currentPrice <= top) return 'active';
      if (currentPrice > top) return 'untouched';
      return 'pending';
    }
    if (currentPrice > swingStart) return 'failed';
    if (currentPrice >= bottom && currentPrice <= top) return 'active';
    if (currentPrice < bottom) return 'untouched';
    return 'pending';
  }

  function buildOTE(swingStart, swingEnd, direction, swingStartIdx, swingEndIdx, ageBars, swingSizeAtr, currentPrice) {
    const range = Math.abs(swingEnd - swingStart);
    if (!(range > 0)) return null;

    const min = oteMin();
    const max = oteMax();
    const mid = oteMid();

    let top, bottom, midLevel;
    if (direction === 1) {
      top = swingEnd - range * min;
      bottom = swingEnd - range * max;
      midLevel = swingEnd - range * mid;
    } else {
      bottom = swingEnd + range * min;
      top = swingEnd + range * max;
      midLevel = swingEnd + range * mid;
    }

    const finalTop = Math.max(top, bottom);
    const finalBottom = Math.min(top, bottom);
    const state = stateFor(direction, currentPrice, swingStart, finalTop, finalBottom);
    const zoneWidth = finalTop - finalBottom;
    const deviation = zoneWidth > 0 ? (currentPrice - midLevel) / zoneWidth : 0;

    return {
      top: finalTop,
      bottom: finalBottom,
      mid: midLevel,
      direction: direction,
      swingStart: swingStart,
      swingEnd: swingEnd,
      swingStartIndex: swingStartIdx,
      swingEndIndex: swingEndIdx,
      ageBars: ageBars,
      swingSizeAtr: swingSizeAtr,
      state: state,
      currentPrice: currentPrice,
      deviation: deviation
    };
  }

  function calculateOTE(bars, pivots, direction, atr, opts) {
    const swing = findSwing(bars, pivots, direction, atr, opts);
    if (!swing) return null;

    const currentPrice = bars[bars.length - 1].c;

    return buildOTE(
      swing.swingStart.price,
      swing.swingEnd.price,
      swing.direction,
      swing.swingStart.index,
      swing.swingEnd.index,
      swing.ageBars,
      swing.swingSizeAtr,
      currentPrice
    );
  }

  return {
    calculateOTE: calculateOTE,
    findSwing: findSwing
  };
})();