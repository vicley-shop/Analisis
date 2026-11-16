window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.structure = (function() {
  'use strict';

  const PIVOT_LOOKBACK = 3;

  function findPivots(bars, lookback) {
    const highs = [];
    const lows = [];
    
    for (let i = lookback; i < bars.length - lookback; i++) {
      let isHigh = true;
      let isLow = true;
      
      for (let j = 1; j <= lookback; j++) {
        if (bars[i - j].h >= bars[i].h || bars[i + j].h >= bars[i].h) isHigh = false;
        if (bars[i - j].l <= bars[i].l || bars[i + j].l <= bars[i].l) isLow = false;
      }
      
      if (isHigh) {
        highs.push({ index: i, price: bars[i].h });
      }
      if (isLow) {
        lows.push({ index: i, price: bars[i].l });
      }
    }
    
    return { highs, lows };
  }

  function detectMSS(bars, pivots) {
    if (bars.length < PIVOT_LOOKBACK * 2) return null;
    
    const lastBarIndex = bars.length - 1;
    const lastClose = bars[lastBarIndex].c;

    if (pivots.highs.length === 0 || pivots.lows.length === 0) return null;

    const lastHigh = pivots.highs[pivots.highs.length - 1];
    const lastLow = pivots.lows[pivots.lows.length - 1];

    if (lastHigh.index < lastBarIndex && lastClose > lastHigh.price) {
      return { 
        direction: 1, 
        level: lastHigh.price, 
        index: lastHigh.index,
        type: 'MSS_Bullish' 
      };
    }

    if (lastLow.index < lastBarIndex && lastClose < lastLow.price) {
      return { 
        direction: -1, 
        level: lastLow.price, 
        index: lastLow.index,
        type: 'MSS_Bearish' 
      };
    }

    return null;
  }

  return {
    findPivots,
    detectMSS
  };
})();
