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
  const DEFAULT_SWING_BODY_RATIO_MIN = 0.5;

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

  function swingBodyRatioMin() {
    return cfg().swingBodyRatioMin != null ? cfg().swingBodyRatioMin : DEFAULT_SWING_BODY_RATIO_MIN;
  }

  function requireBosForOte() {
    return cfg().requireBosForOte === true;
  }

  function requirePremiumDiscount() {
    return cfg().requirePremiumDiscount === true;
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

  function bodyRatio(bar) {
    if (!bar) return 0;
    const range = bar.h - bar.l;
    if (!(range > 0)) return 0;
    return Math.abs(bar.c - bar.o) / range;
  }

  function passesSwingQuality(bars, swingEndPivot) {
    const bar = bars[swingEndPivot.index];
    if (!bar) return false;
    return bodyRatio(bar) >= swingBodyRatioMin();
  }

  function passesBosGate(mss, direction) {
    if (!requireBosForOte()) return true;
    if (!mss || mss.direction !== direction) return false;
    return true;
  }

  function passesPremiumDiscountGate(swingStart, swingEnd, direction) {
    if (!requirePremiumDiscount()) return true;
    const range = Math.abs(swingEnd - swingStart);
    if (!(range > 0)) return true;
    const mid = (swingEnd + swingStart) / 2;
    if (direction === 1) return swingStart < mid;
    return swingStart > mid;
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

    let swingStart = null;
    let swingEnd = null;
    let swingSize = 0;

    if (direction === 1) {
      swingEnd = findExtremeHigh(pivots, recentStart, lastIdx);
      if (!swingEnd) return null;
      const ageBars = lastIdx - swingEnd.index;
      if (ageBars > recency) return null;
      if (!passesSwingQuality(bars, swingEnd)) return null;

      const lowSearchStart = Math.max(0, swingEnd.index - maxAge);
      swingStart = findExtremeLow(pivots, lowSearchStart, swingEnd.index - 1);
      if (!swingStart) return null;

      swingSize = swingEnd.price - swingStart.price;
      if (swingSize < minMult * atrVal) return null;
      if (!passesPremiumDiscountGate(swingStart.price, swingEnd.price, 1)) return null;

      return {
        direction: 1,
        swingStart: swingStart,
        swingEnd: swingEnd,
        swingSize: swingSize,
        swingSizeAtr: swingSize / atrVal,
        ageBars: ageBars,
        bodyRatio: bodyRatio(bars[swingEnd.index])
      };
    }

    swingEnd = findExtremeLow(pivots, recentStart, lastIdx);
    if (!swingEnd) return null;
    const ageBars = lastIdx - swingEnd.index;
    if (ageBars > recency) return null;
    if (!passesSwingQuality(bars, swingEnd)) return null;

    const highSearchStart = Math.max(0, swingEnd.index - maxAge);
    swingStart = findExtremeHigh(pivots, highSearchStart, swingEnd.index - 1);
    if (!swingStart) return null;

    swingSize = swingStart.price - swingEnd.price;
    if (swingSize < minMult * atrVal) return null;
    if (!passesPremiumDiscountGate(swingStart.price, swingEnd.price, -1)) return null;

    return {
      direction: -1,
      swingStart: swingStart,
      swingEnd: swingEnd,
      swingSize: swingSize,
      swingSizeAtr: swingSize / atrVal,
      ageBars: ageBars,
      bodyRatio: bodyRatio(bars[swingEnd.index])
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
    opts = opts || {};
    const swing = findSwing(bars, pivots, direction, atr, opts);
    if (!swing) return null;

    if (opts.mss && !passesBosGate(opts.mss, direction)) {
      return null;
    }

    const currentPrice = bars[bars.length - 1].c;

    const ote = buildOTE(
      swing.swingStart.price,
      swing.swingEnd.price,
      swing.direction,
      swing.swingStart.index,
      swing.swingEnd.index,
      swing.ageBars,
      swing.swingSizeAtr,
      currentPrice
    );

    if (ote) {
      ote.bodyRatio = swing.bodyRatio;
    }

    return ote;
  }

  return {
    calculateOTE: calculateOTE,
    findSwing: findSwing
  };
})();