window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.structure = (function () {
  'use strict';

  const DEFAULT_LOOKBACK = 5;
  const DEFAULT_MSS_WINDOW = 15;
  const PIVOT_TOLERANCE_ATR_MULT = 0.10;
  const MIN_PIVOT_STRENGTH = 0.2;

  function cfg() {
    return (window.AT_CONFIG && window.AT_CONFIG.smc) || {};
  }

  function lookbackDefault() {
    return cfg().pivotLookback || DEFAULT_LOOKBACK;
  }

  function mssWindowDefault() {
    return cfg().mssWindow || DEFAULT_MSS_WINDOW;
  }

  function toleranceFor(bars) {
    if (!bars || bars.length < 2) return 0;
    let sum = 0;
    const n = Math.min(bars.length - 1, 14);
    for (let i = bars.length - n; i < bars.length; i++) {
      sum += Math.abs(bars[i].h - bars[i].l);
    }
    return (sum / n) * PIVOT_TOLERANCE_ATR_MULT;
  }

  function findPivots(bars, lookback) {
    const L = lookback || lookbackDefault();
    const highs = [];
    const lows = [];
    if (!bars || bars.length < 2 * L + 1) return { highs: highs, lows: lows };

    const tol = toleranceFor(bars);
    const firstPossible = L;
    const lastPossible = bars.length - L - 1;

    for (let i = firstPossible; i <= lastPossible; i++) {
      const b = bars[i];
      let isHigh = true;
      let isLow = true;
      let maxNearHigh = -Infinity;
      let minNearLow = Infinity;

      for (let j = 1; j <= L; j++) {
        const left = bars[i - j];
        const right = bars[i + j];

        if (isHigh && (left.h > b.h + tol || right.h > b.h + tol)) isHigh = false;
        if (isLow && (left.l < b.l - tol || right.l < b.l - tol)) isLow = false;

        if (left.h > maxNearHigh) maxNearHigh = left.h;
        if (right.h > maxNearHigh) maxNearHigh = right.h;
        if (left.l < minNearLow) minNearLow = left.l;
        if (right.l < minNearLow) minNearLow = right.l;
      }

      if (isHigh) {
        const prom = b.h - maxNearHigh;
        const strength = tol > 0 ? Math.max(0, Math.min(1, prom / (tol * 2))) : 1;
        highs.push({ index: i, price: b.h, strength: strength });
      }

      if (isLow) {
        const prom = minNearLow - b.l;
        const strength = tol > 0 ? Math.max(0, Math.min(1, prom / (tol * 2))) : 1;
        lows.push({ index: i, price: b.l, strength: strength });
      }
    }

    return { highs: highs, lows: lows };
  }

  function previousTrend(bars, pivots, upToIndex) {
    if (!pivots || !pivots.highs.length || !pivots.lows.length) return 0;
    let lastHigh = null;
    let lastLow = null;
    for (let i = pivots.highs.length - 1; i >= 0; i--) {
      if (pivots.highs[i].index < upToIndex) { lastHigh = pivots.highs[i]; break; }
    }
    for (let i = pivots.lows.length - 1; i >= 0; i--) {
      if (pivots.lows[i].index < upToIndex) { lastLow = pivots.lows[i]; break; }
    }
    if (!lastHigh || !lastLow) return 0;
    return lastHigh.index > lastLow.index ? 1 : -1;
  }

  function detectMSS(bars, pivots, opts) {
    opts = opts || {};
    if (!bars || bars.length < 3) return null;
    if (!pivots || !pivots.highs.length || !pivots.lows.length) return null;

    const window = opts.window || mssWindowDefault();
    const lastBarIndex = bars.length - 1;
    const lastClose = bars[lastBarIndex].c;

    let bullishPivot = null;
    let bearishPivot = null;

    for (let i = pivots.highs.length - 1; i >= 0; i--) {
      const h = pivots.highs[i];
      if (h.index >= lastBarIndex - window && h.index < lastBarIndex) {
        bullishPivot = h;
        break;
      }
    }
    for (let i = pivots.lows.length - 1; i >= 0; i--) {
      const l = pivots.lows[i];
      if (l.index >= lastBarIndex - window && l.index < lastBarIndex) {
        bearishPivot = l;
        break;
      }
    }

    if (bullishPivot && bullishPivot.strength >= MIN_PIVOT_STRENGTH && lastClose > bullishPivot.price) {
      const prevTrend = previousTrend(bars, pivots, bullishPivot.index);
      const isMSS = prevTrend === -1;
      return {
        direction: 1,
        level: bullishPivot.price,
        index: bullishPivot.index,
        barsSince: lastBarIndex - bullishPivot.index,
        type: isMSS ? 'MSS_Bullish' : 'BOS_Bullish',
        fresh: (lastBarIndex - bullishPivot.index) <= window,
        strength: bullishPivot.strength
      };
    }

    if (bearishPivot && bearishPivot.strength >= MIN_PIVOT_STRENGTH && lastClose < bearishPivot.price) {
      const prevTrend = previousTrend(bars, pivots, bearishPivot.index);
      const isMSS = prevTrend === 1;
      return {
        direction: -1,
        level: bearishPivot.price,
        index: bearishPivot.index,
        barsSince: lastBarIndex - bearishPivot.index,
        type: isMSS ? 'MSS_Bearish' : 'BOS_Bearish',
        fresh: (lastBarIndex - bearishPivot.index) <= window,
        strength: bearishPivot.strength
      };
    }

    return null;
  }

  function detectStructure(bars, opts) {
    opts = opts || {};
    const lookback = opts.lookback || lookbackDefault();
    const window = opts.window || mssWindowDefault();
    const pivots = findPivots(bars, lookback);
    const mss = detectMSS(bars, pivots, { window: window });
    return {
      pivots: pivots,
      mss: mss,
      trend: mss ? mss.direction : 0
    };
  }

  return {
    findPivots: findPivots,
    detectMSS: detectMSS,
    detectStructure: detectStructure,
    previousTrend: previousTrend
  };
})();