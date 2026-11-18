window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.structure = (function (I) {
  'use strict';

  function findPivots(bars, lookback) {
    const L = lookback || 4;
    const highs = [], lows = [];
    if (!bars || bars.length < 2 * L + 1) return { highs: highs, lows: lows };

    for (let i = L; i < bars.length - L; i++) {
      const b = bars[i];
      let isHigh = true, isLow = true;
      for (let j = 1; j <= L; j++) {
        if (bars[i - j].h >= b.h || bars[i + j].h >= b.h) isHigh = false;
        if (bars[i - j].l <= b.l || bars[i + j].l <= b.l) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: b.h, strength: 1 });
      if (isLow) lows.push({ index: i, price: b.l, strength: 1 });
    }
    return { highs: highs, lows: lows };
  }

  function detectMSS(bars, pivots) {
    if (!bars || bars.length < 3 || !pivots) return null;
    const lastIdx = bars.length - 1;
    const lastClose = bars[lastIdx].c;

    for (let i = pivots.highs.length - 1; i >= 0; i--) {
      const h = pivots.highs[i];
      if (lastClose > h.price) {
        return { direction: 1, level: h.price, index: h.index, barsSince: lastIdx - h.index, type: 'BOS_Bullish' };
      }
    }
    for (let i = pivots.lows.length - 1; i >= 0; i--) {
      const l = pivots.lows[i];
      if (lastClose < l.price) {
        return { direction: -1, level: l.price, index: l.index, barsSince: lastIdx - l.index, type: 'BOS_Bearish' };
      }
    }
    return null;
  }

  function detectStructure(bars, opts) {
    opts = opts || {};
    const pivots = findPivots(bars, opts.lookback || 4);
    const mss = detectMSS(bars, pivots);
    return { pivots: pivots, mss: mss, trend: mss ? mss.direction : 0 };
  }

  return { detectStructure: detectStructure };
})(window.AT.indicators);
