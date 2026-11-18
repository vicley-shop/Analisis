window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.ote = (function () {
  'use strict';

  function calculateOTE(bars, pivots, direction) {
    if (!bars || bars.length < 15 || !pivots || (direction !== 1 && direction !== -1)) return null;
    const highs = pivots.highs, lows = pivots.lows;
    if (!highs.length || !lows.length) return null;

    const swingStart = direction === 1 ? lows[lows.length - 1].price : highs[highs.length - 1].price;
    const swingEnd = direction === 1 ? highs[highs.length - 1].price : lows[lows.length - 1].price;
    const range = Math.abs(swingEnd - swingStart);
    if (!(range > 0)) return null;

    const top = direction === 1 ? swingEnd - range * 0.618 : swingEnd + range * 0.79;
    const bottom = direction === 1 ? swingEnd - range * 0.79 : swingEnd + range * 0.618;
    const mid = direction === 1 ? swingEnd - range * 0.705 : swingEnd + range * 0.705;

    const currentPrice = bars[bars.length - 1].c;
    const active = currentPrice >= Math.min(top, bottom) && currentPrice <= Math.max(top, bottom);

    return {
      top: Math.max(top, bottom),
      bottom: Math.min(top, bottom),
      mid: mid,
      direction: direction,
      state: active ? 'active' : 'pending'
    };
  }

  return { calculateOTE: calculateOTE };
})();
