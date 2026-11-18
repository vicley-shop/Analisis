window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.liquidity = (function () {
  'use strict';

  const DEFAULT_SWEEP_MIN_ATR_MULT = 0.35;
  const DEFAULT_SWEEP_MAX_ATR_MULT = 1.8;
  const DEFAULT_SWEEP_WINDOW = 5;
  const DEFAULT_SWEEP_REJECTION_MIN = 0.5;
  const DEFAULT_EQ_TOLERANCE_ATR_MULT = 0.10;
  const DEFAULT_LOOKBACK_PIVOTS = 5;

  function cfg() {
    return (window.AT_CONFIG && window.AT_CONFIG.smc) || {};
  }

  function sweepMinMult() {
    return cfg().sweepAtrMult != null ? cfg().sweepAtrMult : DEFAULT_SWEEP_MIN_ATR_MULT;
  }

  function sweepMaxMult() {
    return cfg().sweepMaxAtrMult != null ? cfg().sweepMaxAtrMult : DEFAULT_SWEEP_MAX_ATR_MULT;
  }

  function sweepWindowDefault() {
    return cfg().sweepWindow != null ? cfg().sweepWindow : DEFAULT_SWEEP_WINDOW;
  }

  function sweepRejectionMin() {
    return cfg().sweepRejectionMin != null ? cfg().sweepRejectionMin : DEFAULT_SWEEP_REJECTION_MIN;
  }

  function eqToleranceDefault() {
    return cfg().eqToleranceAtrMult != null ? cfg().eqToleranceAtrMult : DEFAULT_EQ_TOLERANCE_ATR_MULT;
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

  function rejectionRatio(bar, direction) {
    const range = bar.h - bar.l;
    if (!(range > 0)) return 0;
    return direction === 1
      ? (bar.c - bar.l) / range
      : (bar.h - bar.c) / range;
  }

  function detectBullishSweep(bars, pivot, atr, opts) {
    const minPenetration = atr * (opts.minPenetration != null ? opts.minPenetration : sweepMinMult());
    const maxPenetration = atr * (opts.maxPenetration != null ? opts.maxPenetration : sweepMaxMult());
    const window = opts.window != null ? opts.window : sweepWindowDefault();
    const rejectionMin = opts.rejectionMin != null ? opts.rejectionMin : sweepRejectionMin();
    const lastIdx = bars.length - 1;
    const startIdx = Math.max(pivot.index + 1, lastIdx - window + 1);

    for (let i = lastIdx; i >= startIdx; i--) {
      const bar = bars[i];
      const penetration = pivot.price - bar.l;
      if (penetration < minPenetration) continue;
      if (penetration > maxPenetration) continue;
      if (bar.c <= pivot.price) continue;
      const rej = rejectionRatio(bar, 1);
      if (rej < rejectionMin) continue;
      return {
        direction: 1,
        level: pivot.price,
        index: i,
        pivotIndex: pivot.index,
        barsSince: lastIdx - i,
        penetration: penetration,
        penetrationAtr: atr > 0 ? penetration / atr : 0,
        rejectionRatio: rej,
        type: 'Bullish_Sweep',
        valid: true
      };
    }
    return null;
  }

  function detectBearishSweep(bars, pivot, atr, opts) {
    const minPenetration = atr * (opts.minPenetration != null ? opts.minPenetration : sweepMinMult());
    const maxPenetration = atr * (opts.maxPenetration != null ? opts.maxPenetration : sweepMaxMult());
    const window = opts.window != null ? opts.window : sweepWindowDefault();
    const rejectionMin = opts.rejectionMin != null ? opts.rejectionMin : sweepRejectionMin();
    const lastIdx = bars.length - 1;
    const startIdx = Math.max(pivot.index + 1, lastIdx - window + 1);

    for (let i = lastIdx; i >= startIdx; i--) {
      const bar = bars[i];
      const penetration = bar.h - pivot.price;
      if (penetration < minPenetration) continue;
      if (penetration > maxPenetration) continue;
      if (bar.c >= pivot.price) continue;
      const rej = rejectionRatio(bar, -1);
      if (rej < rejectionMin) continue;
      return {
        direction: -1,
        level: pivot.price,
        index: i,
        pivotIndex: pivot.index,
        barsSince: lastIdx - i,
        penetration: penetration,
        penetrationAtr: atr > 0 ? penetration / atr : 0,
        rejectionRatio: rej,
        type: 'Bearish_Sweep',
        valid: true
      };
    }
    return null;
  }

  function detectSweeps(bars, pivots, atr, opts) {
    opts = opts || {};
    const sweeps = [];
    if (!bars || bars.length < 5) return sweeps;
    if (!pivots) return sweeps;

    const atrVal = resolveAtr(atr);
    if (!(atrVal > 0)) return sweeps;

    const bidirectional = opts.allowBidirectional !== false;
    const wantBull = bidirectional || opts.direction === 1;
    const wantBear = bidirectional || opts.direction === -1;
    const lookback = opts.pivotLookback != null ? opts.pivotLookback : DEFAULT_LOOKBACK_PIVOTS;

    if (wantBull && pivots.lows && pivots.lows.length) {
      const start = Math.max(0, pivots.lows.length - lookback);
      for (let i = pivots.lows.length - 1; i >= start; i--) {
        const pivot = pivots.lows[i];
        if (pivot.index >= bars.length - 1) continue;
        const sweep = detectBullishSweep(bars, pivot, atrVal, opts);
        if (sweep) { sweeps.push(sweep); break; }
      }
    }

    if (wantBear && pivots.highs && pivots.highs.length) {
      const start = Math.max(0, pivots.highs.length - lookback);
      for (let i = pivots.highs.length - 1; i >= start; i--) {
        const pivot = pivots.highs[i];
        if (pivot.index >= bars.length - 1) continue;
        const sweep = detectBearishSweep(bars, pivot, atrVal, opts);
        if (sweep) { sweeps.push(sweep); break; }
      }
    }

    sweeps.sort(function (a, b) { return a.barsSince - b.barsSince; });
    return sweeps;
  }

  function findEqualLevels(pivots, atr, opts) {
    opts = opts || {};
    const tolerance = resolveAtr(atr) * (opts.toleranceMult != null ? opts.toleranceMult : eqToleranceDefault());
    const result = { highs: [], lows: [] };
    if (!(tolerance > 0) || !pivots) return result;

    function group(list) {
      const groups = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        let matched = false;
        for (let g = 0; g < groups.length; g++) {
          const ref = groups[g];
          if (Math.abs(ref.price - p.price) <= tolerance) {
            ref.indices.push(p.index);
            ref.count++;
            ref.price = (ref.price * (ref.count - 1) + p.price) / ref.count;
            matched = true;
            break;
          }
        }
        if (!matched) {
          groups.push({ price: p.price, indices: [p.index], count: 1 });
        }
      }
      return groups.filter(function (g) { return g.count >= 2; });
    }

    if (pivots.highs && pivots.highs.length) result.highs = group(pivots.highs);
    if (pivots.lows && pivots.lows.length) result.lows = group(pivots.lows);
    return result;
  }

  return {
    detectSweeps: detectSweeps,
    findEqualLevels: findEqualLevels,
    sweepMinMult: sweepMinMult,
    sweepMaxMult: sweepMaxMult,
    sweepRejectionMin: sweepRejectionMin
  };
})();