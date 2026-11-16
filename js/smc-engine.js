window.AT = window.AT || {};
window.AT.smcEngine = (function() {
  'use strict';

  const ATR_PERIOD = 14;
  const SWING_LOOKBACK = 3;
  const HIGH_CONFLUENCE = 80;
  const MEDIUM_CONFLUENCE = 50;

  function calculateATR(bars, period) {
    if (bars.length < period + 1) return null;
    const trs = [];
    for (let i = 1; i < bars.length; i++) {
      const h = bars[i].h, l = bars[i].l, prevC = bars[i - 1].c;
      trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
    }
    const atrArr = [];
    let sum = 0;
    for (let i = 0; i < trs.length; i++) {
      if (i < period) {
        sum += trs[i];
        if (i === period - 1) atrArr.push(sum / period);
      } else {
        const prev = atrArr[atrArr.length - 1];
        atrArr.push((prev * (period - 1) + trs[i]) / period);
      }
    }
    return atrArr;
  }

  function getCurrentAtr(bars) {
    const arr = calculateATR(bars, ATR_PERIOD);
    if (!arr || arr.length === 0) return 0;
    return arr[arr.length - 1];
  }

  function evaluate(bars, direction) {
    const result = {
      score: 0,
      label: 'Sin confluencia',
      direction: direction,
      reasons: [],
      zones: {},
      trend: 'Neutral'
    };

    if (!bars || bars.length < 50) {
      result.reasons.push('Historial insuficiente para analizar.');
      return result;
    }

    if (direction === 0) {
      result.reasons.push('Sesgo neutral. No se buscan entradas.');
      return result;
    }

    const atr = getCurrentAtr(bars);
    if (!atr || atr <= 0) {
      result.reasons.push('Volatilidad (ATR) no disponible.');
      return result;
    }

    const structure = window.AT.smc.structure;
    const liquidity = window.AT.smc.liquidity;
    const zones = window.AT.smc.zones;
    const oteMod = window.AT.smc.ote;

    const pivots = structure.findPivots(bars, SWING_LOOKBACK);
    const mss = structure.detectMSS(bars, pivots);
    const sweeps = liquidity.detectSweeps(bars, pivots, direction, atr);
    const obs = zones.detectOrderBlocks(bars, calculateATR(bars, ATR_PERIOD), direction);
    const fvgs = zones.detectFVG(bars, direction);
    const ote = oteMod.calculateOTE(bars, pivots, direction);

    const currentPrice = bars[bars.length - 1].c;
    let score = 0;

    if (mss && mss.direction === direction) {
      score += 25;
      result.reasons.push('✅ Cambio de Estructura (MSS) confirmado a favor de la tendencia.');
    } else {
      result.reasons.push('❌ Sin Cambio de Estructura (MSS) reciente.');
    }

    if (sweeps.length > 0) {
      score += 25;
      result.reasons.push('✅ Barrido de liquidez detectado (trampa de stops).');
    } else {
      result.reasons.push('❌ Sin barrido de liquidez reciente.');
    }

    const activeFvg = fvgs.find(function(f) {
      return currentPrice >= f.bottom && currentPrice <= f.top;
    });

    if (activeFvg) {
      score += 20;
      result.zones.fvg = activeFvg;
      result.reasons.push('✅ Precio dentro de un Fair Value Gap (desequilibrio).');
    } else {
      result.reasons.push('❌ Precio fuera de un FVG relevante.');
    }

    const activeOb = obs.find(function(o) {
      return currentPrice >= o.bottom && currentPrice <= o.top;
    });

    if (activeOb) {
      score += 15;
      result.zones.ob = activeOb;
      result.reasons.push('✅ Precio dentro de un Order Block institucional.');
    } else {
      result.reasons.push('❌ Precio fuera de un Order Block relevante.');
    }

    if (ote && currentPrice >= ote.bottom && currentPrice <= ote.top) {
      score += 15;
      result.zones.ote = ote;
      result.reasons.push('✅ Precio en la Zona Dorada de Fibonacci (OTE 61.8% - 79%).');
    } else {
      result.reasons.push('❌ Precio fuera de la zona OTE.');
    }

    result.score = Math.min(100, score);

    if (result.score >= HIGH_CONFLUENCE) {
      result.label = 'ENTRADA DE ALTA PROBABILIDAD';
      result.trend = 'Fuerte';
    } else if (result.score >= MEDIUM_CONFLUENCE) {
      result.label = 'Entrada Moderada';
      result.trend = 'Media';
    } else {
      result.label = 'Sin confluencia suficiente';
      result.trend = 'Débil';
    }

    return result;
  }

  return {
    evaluate: evaluate
  };
})();
