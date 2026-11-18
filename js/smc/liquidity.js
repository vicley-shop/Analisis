window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.liquidity = (function () {
  'use strict';

  function detectSweeps(bars, pivots, atr, opts) {
    opts = opts || {};
    const sweeps = [];
    if (!bars || bars.length < 5 || !pivots || !(atr > 0)) return sweeps;

    const window = opts.window || 6;
    const lastIdx = bars.length - 1;

    if (pivots.lows && pivots.lows.length) {
      const p = pivots.lows[pivots.lows.length - 1];
      if (p.index < lastIdx) {
        for (let i = Math.max(p.index + 1, lastIdx - window + 1); i <= lastIdx; i++) {
          const b = bars[i];
          if (b.l < p.price && b.c > p.price) {
            sweeps.push({ direction: 1, level: p.price, index: i, barsSince: lastIdx - i, rejectionRatio: 0.6 });
            break;
          }
        }
      }
    }

    if (pivots.highs && pivots.highs.length) {
      const p = pivots.highs[pivots.highs.length - 1];
      if (p.index < lastIdx) {
        for (let i = Math.max(p.index + 1, lastIdx - window + 1); i <= lastIdx; i++) {
          const b = bars[i];
          if (b.h > p.price && b.c < p.price) {
            sweeps.push({ direction: -1, level: p.price, index: i, barsSince: lastIdx - i, rejectionRatio: 0.6 });
            break;
          }
        }
      }
    }
    return sweeps;
  }

  return { detectSweeps: detectSweeps };
})();
