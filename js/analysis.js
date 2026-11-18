(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'));
  else { root.AT = root.AT || {}; root.AT.analysis = factory(root.AT.indicators); }
}(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  function num(v) { return v != null && Number.isFinite(v); }
  function cfg() { return (window.AT_CONFIG && window.AT_CONFIG.regime) || {}; }

  function analyzeTimeframe(bars) {
    if (!bars || bars.length < 30) return null;
    const closes = bars.map(function (b) { return b.c; });
    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });

    const fastP = cfg().emaFast || 20;
    const slowP = cfg().emaSlow || 200;
    const adxP = cfg().adxPeriod || 14;

    const fast = I.ema(closes, fastP);
    const slow = I.ema(closes, slowP);
    const adxRes = I.adx(highs, lows, closes, adxP);

    const i = bars.length - 1;
    const f = fast[i], s = slow[i], adxVal = adxRes.adx[i];
    if (!num(f) || !num(adxVal)) return null;

    const direction = num(s) ? (f > s ? 1 : -1) : (closes[i] > closes[i - 1] ? 1 : -1);

    return {
      direction: direction,
      adx: adxVal,
      price: closes[i],
      fast: f,
      slow: s
    };
  }

  function analyze(barsByTf) {
    const tfs = Object.keys(barsByTf || {});
    const perTf = {};
    let buyWeight = 0, sellWeight = 0, totalAdx = 0, validCount = 0;

    for (let i = 0; i < tfs.length; i++) {
      const tf = tfs[i];
      const r = analyzeTimeframe(barsByTf[tf]);
      if (r) {
        perTf[tf] = r;
        const w = (window.AT_CONFIG.timeframes.weights || {})[tf] || 1;
        if (r.direction === 1) buyWeight += w * (r.adx / 20);
        else sellWeight += w * (r.adx / 20);
        totalAdx += r.adx;
        validCount++;
      }
    }

    if (validCount === 0) {
      return { consensusScore: 0, consensusLabel: 'neutral', overallDirection: 0, avgAdxAligned: 0, perTf: {}, alerts: [] };
    }

    const totalW = buyWeight + sellWeight;
    const buyShare = totalW > 0 ? buyWeight / totalW : 0.5;
    const overallDirection = buyShare >= 0.55 ? 1 : (buyShare <= 0.45 ? -1 : 0);
    const consensusScore = Math.abs(buyShare - 0.5) * 200;

    let consensusLabel = 'neutral';
    if (consensusScore >= 65) consensusLabel = overallDirection === 1 ? 'strong_buy' : 'strong_sell';
    else if (consensusScore >= 40) consensusLabel = overallDirection === 1 ? 'buy' : 'sell';

    const avgAdx = totalAdx / validCount;
    const isBuy = overallDirection === 1;

    return {
      consensusScore: consensusScore,
      consensusLabel: consensusLabel,
      consensusText: consensusLabel.toUpperCase().replace('_', ' '),
      confidence: Math.min(100, consensusScore * (avgAdx / 25)),
      overallDirection: overallDirection,
      perTf: perTf,
      macroTrend: avgAdx >= 25 ? 'Fuerte Tendencia' : 'Rango / Consolidación',
      macroMomentum: consensusScore > 50 ? (isBuy ? 'Alcista Sólido' : 'Bajista Sólido') : 'Neutral',
      macroVolatility: 'Normal',
      avgAdxAligned: avgAdx,
      alerts: []
    };
  }

  return { analyze: analyze };
}));
