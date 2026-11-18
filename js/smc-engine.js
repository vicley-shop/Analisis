window.AT = window.AT || {};
window.AT.smcEngine = (function (I) {
  'use strict';

  function evaluate(bars, direction, context) {
    context = context || {};
    direction = direction === 1 || direction === -1 ? direction : 0;

    if (!bars || bars.length < 30) {
      return { score: 0, label: 'Datos insuficientes', direction: 0, grade: 'Débil', reasons: ['Historial corto'], vetoed: true, zones: { ob: null, fvg: null, ote: null, allOBs: [], allFVGs: [] } };
    }

    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });
    const closes = bars.map(function (b) { return b.c; });
    const atrArr = I.atr(highs, lows, closes, 14);
    let atr = 1;
    for (let i = atrArr.length - 1; i >= 0; i--) {
      if (atrArr[i] != null && Number.isFinite(atrArr[i])) { atr = atrArr[i]; break; }
    }

    const structure = window.AT.smc.structure.detectStructure(bars);
    const sweeps = window.AT.smc.liquidity.detectSweeps(bars, structure.pivots, atr);
    const obs = window.AT.smc.zones.detectOrderBlocks(bars, atr, direction);
    const fvgs = window.AT.smc.zones.detectFVG(bars, atr, direction);
    const ote = window.AT.smc.ote.calculateOTE(bars, structure.pivots, direction !== 0 ? direction : 1);

    const currentPrice = closes[closes.length - 1];
    let score = 25; // Base institucional
    const reasons = [];

    const mss = structure.mss;
    if (mss && (direction === 0 || mss.direction === direction)) {
      score += 30;
      reasons.push('Estructura (' + mss.type + ') a favor.');
    }

    const activeOb = window.AT.smc.zones.findActiveZone(obs, currentPrice, direction);
    if (activeOb) {
      score += 20;
      reasons.push('Precio testeando Order Block institucional.');
    }

    const activeFvg = window.AT.smc.zones.findActiveZone(fvgs, currentPrice, direction);
    if (activeFvg) {
      score += 15;
      reasons.push('Precio mitigando Fair Value Gap.');
    }

    if (ote && ote.state === 'active') {
      score += 15;
      reasons.push('Zona OTE (61.8% - 79%) activa.');
    }

    score = Math.max(0, Math.min(100, score));
    const grade = score >= 75 ? 'Alta' : score >= 45 ? 'Moderada' : 'Débil';

    return {
      score: score,
      label: grade === 'Alta' ? 'CONFLUENCIA SMC ALTA' : grade === 'Moderada' ? 'Confluencia Moderada' : 'Sin confluencia clara',
      direction: direction !== 0 ? direction : (mss ? mss.direction : 1),
      grade: grade,
      reasons: reasons.length ? reasons : ['Estructura de mercado en rango'],
      vetoed: false,
      riskMultiplier: grade === 'Alta' ? 1.0 : grade === 'Moderada' ? 0.5 : 0.25,
      zones: { ob: activeOb || obs[0] || null, fvg: activeFvg || fvgs[0] || null, ote: ote, allOBs: obs, allFVGs: fvgs }
    };
  }

  return { evaluate: evaluate };
})(window.AT.indicators);
