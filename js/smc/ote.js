window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.ote = (function() {
  'use strict';

  const OTE_MIN = 0.618;
  const OTE_MAX = 0.79;
  const OTE_MID = 0.705;

  function calculateOTE(bars, pivots, direction) {
    if (!pivots || pivots.highs.length === 0 || pivots.lows.length === 0) return null;

    const highs = pivots.highs;
    const lows = pivots.lows;

    let startPrice, endPrice;

    if (direction === 1) {
      const lastHigh = highs[highs.length - 1];
      let validLow = null;
      
      for (let i = lows.length - 1; i >= 0; i--) {
        if (lows[i].index < lastHigh.index) {
          validLow = lows[i];
          break;
        }
      }
      
      if (!validLow) return null;
      
      startPrice = validLow.price;
      endPrice = lastHigh.price;
      
    } else if (direction === -1) {
      const lastLow = lows[lows.length - 1];
      let validHigh = null;
      
      for (let i = highs.length - 1; i >= 0; i--) {
        if (highs[i].index < lastLow.index) {
          validHigh = highs[i];
          break;
        }
      }
      
      if (!validHigh) return null;
      
      startPrice = validHigh.price;
      endPrice = lastLow.price;
      
    } else {
      return null;
    }

    const range = Math.abs(endPrice - startPrice);
    if (range === 0) return null;

    let top, bottom, mid;

    if (direction === 1) {
      top = endPrice - (range * OTE_MIN);
      bottom = endPrice - (range * OTE_MAX);
      mid = endPrice - (range * OTE_MID);
    } else {
      bottom = endPrice + (range * OTE_MIN);
      top = endPrice + (range * OTE_MAX);
      mid = endPrice + (range * OTE_MID);
    }

    return {
      top: Math.max(top, bottom),
      bottom: Math.min(top, bottom),
      mid: mid,
      direction: direction
    };
  }

  return {
    calculateOTE
  };
})();