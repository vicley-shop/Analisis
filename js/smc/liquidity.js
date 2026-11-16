window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.liquidity = (function() {
  'use strict';

  const SWEEP_ATR_MULT = 0.25;

  function detectSweeps(bars, pivots, direction, currentAtr) {
    const sweeps = [];
    if (!bars || bars.length < 5 || !currentAtr || currentAtr <= 0) return sweeps;

    const lastBar = bars[bars.length - 1];
    
    if (direction === 1 && pivots.lows.length > 0) {
      for (let i = pivots.lows.length - 1; i >= Math.max(0, pivots.lows.length - 3); i--) {
        const pivot = pivots.lows[i];
        const margin = currentAtr * SWEEP_ATR_MULT;
        
        if (pivot.index < bars.length - 1) {
          if (lastBar.l < pivot.price && lastBar.c > pivot.price && lastBar.l > (pivot.price - margin)) {
            sweeps.push({ 
              index: bars.length - 1, 
              level: pivot.price, 
              direction: 1, 
              type: 'Bullish_Sweep' 
            });
            break;
          }
        }
      }
    }

    if (direction === -1 && pivots.highs.length > 0) {
      for (let i = pivots.highs.length - 1; i >= Math.max(0, pivots.highs.length - 3); i--) {
        const pivot = pivots.highs[i];
        const margin = currentAtr * SWEEP_ATR_MULT;
        
        if (pivot.index < bars.length - 1) {
          if (lastBar.h > pivot.price && lastBar.c < pivot.price && lastBar.h < (pivot.price + margin)) {
            sweeps.push({ 
              index: bars.length - 1, 
              level: pivot.price, 
              direction: -1, 
              type: 'Bearish_Sweep' 
            });
            break;
          }
        }
      }
    }

    return sweeps;
  }

  return {
    detectSweeps
  };
})();