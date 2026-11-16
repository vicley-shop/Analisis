window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.zones = (function() {
  'use strict';

  const OB_ATR_MULT = 1.5;

  function detectOrderBlocks(bars, atrArr, direction) {
    const obs = [];
    if (!atrArr || atrArr.length < 2) return obs;

    for (let i = 1; i < bars.length - 1; i++) {
      const atrIndex = atrArr.length - 1 - (bars.length - 1 - i);
      const atr = atrArr[atrIndex];
      if (!atr || atr <= 0) continue;

      const candle = bars[i];
      const nextCandle = bars[i + 1];
      const magnitude = Math.abs(nextCandle.c - candle.c);

      if (direction === 1) {
        const isBearish = candle.c < candle.o;
        const isStrongMove = nextCandle.c > nextCandle.o && magnitude > (OB_ATR_MULT * atr);
        
        if (isBearish && isStrongMove) {
          obs.push({
            index: i,
            top: Math.max(candle.o, candle.c),
            bottom: Math.min(candle.o, candle.c),
            direction: 1,
            type: 'Bullish_OB'
          });
        }
      }

      if (direction === -1) {
        const isBullish = candle.c > candle.o;
        const isStrongMove = nextCandle.c < nextCandle.o && magnitude > (OB_ATR_MULT * atr);
        
        if (isBullish && isStrongMove) {
          obs.push({
            index: i,
            top: Math.max(candle.o, candle.c),
            bottom: Math.min(candle.o, candle.c),
            direction: -1,
            type: 'Bearish_OB'
          });
        }
      }
    }
    
    return obs.slice(-3);
  }

  function detectFVG(bars, direction) {
    const fvgs = [];
    
    for (let i = 2; i < bars.length; i++) {
      const candle1 = bars[i - 2];
      const candle3 = bars[i];

      if (direction === 1) {
        if (candle3.l > candle1.h) {
          fvgs.push({
            index: i,
            top: candle3.l,
            bottom: candle1.h,
            direction: 1,
            type: 'Bullish_FVG'
          });
        }
      }

      if (direction === -1) {
        if (candle3.h < candle1.l) {
          fvgs.push({
            index: i,
            top: candle1.l,
            bottom: candle3.h,
            direction: -1,
            type: 'Bearish_FVG'
          });
        }
      }
    }
    
    return fvgs.slice(-3);
  }

  return {
    detectOrderBlocks,
    detectFVG
  };
})();
