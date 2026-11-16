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

  function findNearestLevels(bars, currentPrice) {
    const highs = [];
    const lows = [];
    const lookback = 3;
    
    if (!bars || bars.length < 20) return { support: null, resistance: null };

    for (let i = lookback; i < bars.length - lookback; i++) {
      const b = bars[i];
      let isHigh = true;
      let isLow = true;

      for (let j = 1; j <= lookback; j++) {
        if (bars[i - j].h >= b.h || bars[i + j].h >= b.h) isHigh = false;
        if (bars[i - j].l <= b.l || bars[i + j].l <= b.l) isLow = false;
      }

      if (isHigh && b.h > currentPrice) highs.push(b.h);
      if (isLow && b.l < currentPrice) lows.push(b.l);
    }

    const support = lows.length > 0 ? Math.max(...lows) : null;
    const resistance = highs.length > 0 ? Math.min(...highs) : null;

    return { support, resistance };
  }

  function detectExhaustion(bars, direction, config) {
    const alerts = [];
    if (!bars || bars.length < 40) return alerts;

    const c = bars.map(function (b) { return b.c; });
    const h = bars.map(function (b) { return b.h; });
    const l = bars.map(function (b) { return b.l; });
    const v = bars.map(function (b) { return b.v || 0; });
    
    const rsiArr = I.rsi(c, 14);
    const adxData = I.adx(h, l, c, 14);
    const adxArr = adxData.adx;
    
    const i = bars.length - 1;
    const lastRsi = rsiArr[i];

    if (num(lastRsi)) {
      if (lastRsi > config.rsiOverbought) {
        alerts.push({ type: 'warn', text: 'RSI en zona de sobrecompra (' + lastRsi.toFixed(1) + '). Posible agotamiento alcista.' });
      } else if (lastRsi < config.rsiOversold) {
        alerts.push({ type: 'warn', text: 'RSI en zona de sobreventa (' + lastRsi.toFixed(1) + '). Posible agotamiento bajista.' });
      }
    }

    const lookback = config.lookbackCandles || 5;
    if (i >= lookback && num(adxArr[i]) && num(adxArr[i - lookback]) && adxArr[i - lookback] > 0) {
      const dropPct = ((adxArr[i - lookback] - adxArr[i]) / adxArr[i - lookback]) * 100;
      if (dropPct > (config.adxDropPct || 20)) {
        alerts.push({ type: 'info', text: 'Fuerza de tendencia (ADX) ha caído un ' + dropPct.toFixed(0) + '% en las últimas ' + lookback + ' velas.' });
      }
    }

    if (i > 35) {
      let currLowIdx = -1, currLowVal = Infinity;
      for (let j = i; j >= i - 15; j--) {
        if (l[j] < currLowVal) { currLowVal = l[j]; currLowIdx = j; }
      }
      let prevLowIdx = -1, prevLowVal = Infinity;
      for (let j = i - 20; j >= i - 35; j--) {
        if (l[j] < prevLowVal) { prevLowVal = l[j]; prevLowIdx = j; }
      }
      if (currLowIdx !== -1 && prevLowIdx !== -1 && currLowVal < prevLowVal) {
        if (num(rsiArr[currLowIdx]) && num(rsiArr[prevLowIdx]) && rsiArr[currLowIdx] > rsiArr[prevLowIdx]) {
          alerts.push({ type: 'danger', text: 'Divergencia alcista detectada: Precio hace mínimo más bajo, pero RSI hace mínimo más alto.' });
        }
      }

      let currHighIdx = -1, currHighVal = -Infinity;
      for (let j = i; j >= i - 15; j--) {
        if (h[j] > currHighVal) { currHighVal = h[j]; currHighIdx = j; }
      }
      let prevHighIdx = -1, prevHighVal = -Infinity;
      for (let j = i - 20; j >= i - 35; j--) {
        if (h[j] > prevHighVal) { prevHighVal = h[j]; prevHighIdx = j; }
      }
      if (currHighIdx !== -1 && prevHighIdx !== -1 && currHighVal > prevHighVal) {
        if (num(rsiArr[currHighIdx]) && num(rsiArr[prevHighIdx]) && rsiArr[currHighIdx] < rsiArr[prevHighIdx]) {
          alerts.push({ type: 'danger', text: 'Divergencia bajista detectada: Precio hace máximo más alto, pero RSI hace máximo más bajo.' });
        }
      }
    }

    const volLookback = config.volumeLookback || 20;
    if (i > volLookback) {
      let avgVol = 0;
      for (let j = i - 1; j >= i - volLookback; j--) avgVol += v[j];
      avgVol /= volLookback;
      const lastVol = v[i];
      const isBearish = c[i] < bars[i].o;
      const isBullish = c[i] > bars[i].o;

      if (direction === -1 && isBearish && lastVol < avgVol * (1 - (config.volumeDropPct || 30) / 100)) {
        alerts.push({ type: 'warn', text: 'Volumen bajo en vela bajista. Posible falta de convicción vendedora.' });
      } else if (direction === 1 && isBullish && lastVol < avgVol * (1 - (config.volumeDropPct || 30) / 100)) {
        alerts.push({ type: 'warn', text: 'Volumen bajo en vela alcista. Posible falta de convicción compradora.' });
      }
    }

    return alerts;
  }

  function analyze(barsByTf) {
    const CFG = window.AT_CONFIG || {};
    const exCfg = CFG.exhaustion || {};
    
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
        alerts: [],
        verdictState: 'wait',
        verdictLabel: 'ESPERAR',
        verdictReason: 'Datos insuficientes para operar.',
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
    const thresholds = (CFG.consensus && CFG.consensus.thresholds) || { strong: 75, moderate: 50 };

    if (consensusScore >= thresholds.strong) {
      consensusLabel = overallDirection === 1 ? 'strong_buy' : 'strong_sell';
    } else if (consensusScore >= thresholds.moderate) {
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

    const order = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    const highestTf = valid.reduce(function (a, b) {
      return order.indexOf(a.tf) > order.indexOf(b.tf) ? a : b;
    }).tf;

    const highBars = barsByTf[highestTf];
    let macroMomentum = '—';
    let macroVolatility = '—';
    let alerts = [];
    let atrVal = 0;

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
      const cleanAtr = atrArr.filter(num);
      const avgAtr = I.sma(cleanAtr, 20);
      const avgVal = avgAtr[avgAtr.length - 1];
      
      if (num(lastAtr) && num(avgVal) && avgVal > 0) {
        atrVal = lastAtr;
        const ratio = lastAtr / avgVal;
        if (ratio >= 1.3) macroVolatility = 'Alta';
        else if (ratio <= 0.75) macroVolatility = 'Baja';
        else macroVolatility = 'Normal';
      }

      alerts = detectExhaustion(highBars, overallDirection, exCfg);

      if (consensusScore >= 90 && overallDirection === -1) {
        alerts.push({ type: 'danger', text: 'Consenso casi unánime bajista. Alta probabilidad de sobre-extensión y rebote técnico inminente.' });
      } else if (consensusScore >= 90 && overallDirection === 1) {
        alerts.push({ type: 'danger', text: 'Consenso casi unánime alcista. Alta probabilidad de sobre-extensión y retroceso técnico inminente.' });
      }
    }

    let verdictState = 'wait';
    let verdictLabel = 'ESPERAR';
    let verdictReason = 'Analizando condiciones...';

    const hasDanger = alerts.some(function(a) { return a.type === 'danger'; });
    const currentPrice = valid[0].data.price;
    const levels = findNearestLevels(highBars, currentPrice);

    if (hasDanger) {
      verdictReason = 'Hay alertas críticas de agotamiento. El movimiento está sobreextendido, espera un retroceso.';
    } else if (consensusScore < thresholds.moderate) {
      verdictReason = 'Consenso entre temporalidades menor al 50%. El mercado está indeciso o lateral.';
    } else {
      if (overallDirection === 1) {
        if (levels.support && atrVal > 0) {
          const dist = (currentPrice - levels.support) / atrVal;
          if (dist <= 1.5) {
            verdictState = 'buy';
            verdictLabel = 'PREPARAR COMPRA';
            verdictReason = 'Tendencia alcista y el precio está cerca de un soporte en ' + levels.support.toFixed(CFG.symbols[Object.keys(CFG.symbols)[0]].digits) + '.';
          } else {
            verdictReason = 'Tendencia alcista, pero el precio está lejos del soporte (' + levels.support.toFixed(4) + '). Espera un retroceso.';
          }
        } else {
          verdictReason = 'Tendencia alcista, pero no se detectan soportes cercanos claros. Espera.';
        }
      } else if (overallDirection === -1) {
        if (levels.resistance && atrVal > 0) {
          const dist = (levels.resistance - currentPrice) / atrVal;
          if (dist <= 1.5) {
            verdictState = 'sell';
            verdictLabel = 'PREPARAR VENTA';
            verdictReason = 'Tendencia bajista y el precio está cerca de una resistencia en ' + levels.resistance.toFixed(CFG.symbols[Object.keys(CFG.symbols)[0]].digits) + '.';
          } else {
            verdictReason = 'Tendencia bajista, pero el precio está lejos de la resistencia (' + levels.resistance.toFixed(4) + '). Espera un rebote.';
          }
        } else {
          verdictReason = 'Tendencia bajista, pero no se detectan resistencias cercanas claras. Espera.';
        }
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

    if (alerts.length > 0) {
      conclusionParts.push('⚠️ PRECAUCIÓN: Se han detectado ' + alerts.length + ' señales de agotamiento.');
    }

    return {
      consensusScore: consensusScore,
      consensusLabel: consensusLabel,
      consensusText: consensusText,
      overallDirection: overallDirection,
      perTf: perTf,
      macroTrend: macroTrend,
      macroMomentum: macroMomentum,
      macroVolatility: macroVolatility,
      alerts: alerts,
      verdictState: verdictState,
      verdictLabel: verdictLabel,
      verdictReason: verdictReason,
      conclusion: conclusionParts.join(' ')
    };
  }

  return {
    analyze: analyze,
    LABELS: LABELS
  };
}));