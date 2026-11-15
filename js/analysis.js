(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'));
  else { root.AT = root.AT || {}; root.AT.analysis = factory(root.AT.indicators); }
}(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  const LABELS = {
    strong_buy: 'Compra fuerte',
    buy: 'Compra',
    neutral: 'Neutro',
    sell: 'Venta',
    strong_sell: 'Venta fuerte'
  };

  function num(v) { return v != null && isFinite(v); }

  function analyzeTimeframe(bars) {
    if (!bars || bars.length < 60) return null;
    const c = bars.map(function (b) { return b.c; });
    const h = bars.map(function (b) { return b.h; });
    const l = bars.map(function (b) { return b.l; });

    const fast = I.ema(c, 9);
    const slow = I.ema(c, 21);
    const adxData = I.adx(h, l, c, 14);

    const i = bars.length - 1;
    const price = c[i];

    if (!num(fast[i]) || !num(slow[i]) || !num(adxData.adx[i])) return null;

    const direction = fast[i] > slow[i] ? 1 : -1;
    const adx = adxData.adx[i];
    const priceAboveSlow = price > slow[i];

    return {
      direction: direction,
      adx: adx,
      priceAboveSlow: priceAboveSlow,
      price: price,
      fast: fast[i],
      slow: slow[i],
      bars: bars.length
    };
  }

  function analyze(barsByTf) {
    const tfs = Object.keys(barsByTf || {});
    const perTf = {};
    const valid = [];

    tfs.forEach(function (tf) {
      const r = analyzeTimeframe(barsByTf[tf]);
      if (r) {
        perTf[tf] = r;
        valid.push({ tf: tf, data: r });
      }
    });

    if (valid.length < 2) {
      return {
        consensusScore: 0,
        consensusLabel: 'neutral',
        consensusText: LABELS.neutral,
        overallDirection: 0,
        perTf: perTf,
        macroTrend: '—',
        macroMomentum: '—',
        macroVolatility: '—',
        conclusion: 'Datos insuficientes. Se necesitan al menos dos temporalidades con historial suficiente.'
      };
    }

    let buyVotes = 0;
    let sellVotes = 0;
    valid.forEach(function (v) {
      if (v.data.direction === 1) buyVotes++;
      else sellVotes++;
    });

    const overallDirection = buyVotes >= sellVotes ? 1 : -1;

    let sumAgreeAdx = 0;
    let sumAllAdx = 0;

    valid.forEach(function (v) {
      const agree = v.data.direction === overallDirection;
      v.agree = agree;
      perTf[v.tf].agree = agree;
      sumAllAdx += v.data.adx;
      if (agree) sumAgreeAdx += v.data.adx;
    });

    const consensusScore = sumAllAdx > 0 ? (sumAgreeAdx / sumAllAdx) * 100 : 0;

    let consensusLabel, consensusText;
    if (consensusScore >= 75) {
      consensusLabel = overallDirection === 1 ? 'strong_buy' : 'strong_sell';
    } else if (consensusScore >= 50) {
      consensusLabel = overallDirection === 1 ? 'buy' : 'sell';
    } else {
      consensusLabel = 'neutral';
    }
    consensusText = LABELS[consensusLabel];

    let avgAdx = sumAllAdx / valid.length;
    let macroTrend;
    if (avgAdx >= 30) macroTrend = 'Muy fuerte';
    else if (avgAdx >= 22) macroTrend = 'Fuerte';
    else if (avgAdx >= 18) macroTrend = 'Moderada';
    else macroTrend = 'Débil';

    const highestTf = valid.reduce(function (a, b) {
      const order = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
      return order.indexOf(a.tf) > order.indexOf(b.tf) ? a : b;
    }).tf;

    const highBars = barsByTf[highestTf];
    let macroMomentum = '—';
    let macroVolatility = '—';

    if (highBars && highBars.length > 30) {
      const hc = highBars.map(function (b) { return b.c; });
      const hh = highBars.map(function (b) { return b.h; });
      const hl = highBars.map(function (b) { return b.l; });

      const rsi = I.rsi(hc, 14);
      const lastRsi = rsi[rsi.length - 1];
      if (num(lastRsi)) {
        if (lastRsi >= 60) macroMomentum = 'Alcista';
        else if (lastRsi <= 40) macroMomentum = 'Bajista';
        else macroMomentum = 'Neutro';
      }

      const atrArr = I.atr(hh, hl, hc, 14);
      const lastAtr = atrArr[atrArr.length - 1];
      const avgAtr = I.sma(atrArr.filter(num), 20);
      const avgVal = avgAtr[avgAtr.length - 1];
      if (num(lastAtr) && num(avgVal) && avgVal > 0) {
        const ratio = lastAtr / avgVal;
        if (ratio >= 1.3) macroVolatility = 'Alta';
        else if (ratio <= 0.75) macroVolatility = 'Baja';
        else macroVolatility = 'Normal';
      }
    }

    const conclusionParts = [];
    const dirText = overallDirection === 1 ? 'alcista' : 'bajista';

    if (consensusLabel === 'strong_buy' || consensusLabel === 'strong_sell') {
      conclusionParts.push('Sesgo ' + dirText + ' fuerte con consenso del ' + consensusScore.toFixed(0) + '% de las temporalidades.');
    } else if (consensusLabel === 'buy' || consensusLabel === 'sell') {
      conclusionParts.push('Sesgo ' + dirText + ' moderado (consenso ' + consensusScore.toFixed(0) + '%).');
    } else {
      conclusionParts.push('Temporalidades divididas (consenso ' + consensusScore.toFixed(0) + '%). Mercado en rango o transición.');
    }

    conclusionParts.push('Fuerza de tendencia media: ' + macroTrend + ' (ADX ' + avgAdx.toFixed(1) + ').');

    if (macroMomentum !== '—') {
      conclusionParts.push('Momentum en ' + highestTf.toUpperCase() + ': ' + macroMomentum + '.');
    }

    if (macroVolatility !== '—') {
      conclusionParts.push('Volatilidad: ' + macroVolatility + '.');
    }

    const agreeCount = valid.filter(function (v) { return v.agree; }).length;
    conclusionParts.push('Alineación: ' + agreeCount + ' de ' + valid.length + ' temporalidades a favor.');

    return {
      consensusScore: consensusScore,
      consensusLabel: consensusLabel,
      consensusText: consensusText,
      overallDirection: overallDirection,
      perTf: perTf,
      macroTrend: macroTrend,
      macroMomentum: macroMomentum,
      macroVolatility: macroVolatility,
      conclusion: conclusionParts.join(' ')
    };
  }

  return {
    analyze: analyze,
    LABELS: LABELS
  };
}));
