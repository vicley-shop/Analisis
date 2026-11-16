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

  const SESSION_LABELS = {
    closed: 'Mercado cerrado',
    alwaysOpen: 'Mercado 24/7',
    highLiquidity: 'Alta liquidez (Londres-NY)',
    european: 'Sesión europea',
    american: 'Sesión americana',
    asian: 'Sesión asiática'
  };

  function num(v) {
    return v != null && Number.isFinite(v);
  }

  function cfg() {
    return (typeof window !== 'undefined' && window.AT_CONFIG) || {};
  }

  function weightFor(tf) {
    const w = (cfg().timeframes && cfg().timeframes.weights) || {};
    return w[tf] || 1;
  }

  function normalizeAdx(adx) {
    const ceiling = (cfg().consensus && cfg().consensus.adxNormalizationCeiling) || 50;
    if (!num(adx) || adx <= 0) return 0;
    return Math.min(adx, ceiling) / ceiling;
  }

  function cleanBars(bars) {
    if (!bars || !bars.length) return bars;
    const useClosed = cfg().analysis && cfg().analysis.useClosedCandlesOnly !== false;
    if (useClosed && bars.length > 1) return bars.slice(0, -1);
    return bars;
  }

  function getTradingHours(family) {
    const th = cfg().tradingHours || {};
    const fallback = { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 22 } };
    return th[family] || th.forex || fallback;
  }

  function getMarketState(symbol, now) {
    const inst = (cfg().symbols || {})[symbol];
    if (!inst) {
      return { open: false, family: 'unknown', alwaysOpen: false, currentMin: 0, openMin: 0, closeMin: 0 };
    }
    const family = inst.family || 'forex';
    const th = getTradingHours(family);

    if (th.alwaysOpen) {
      return { open: true, family: family, alwaysOpen: true, currentMin: 0, openMin: 0, closeMin: 0 };
    }

    const dow = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    const currentMin = dow * 24 * 60 + hour * 60 + minute;
    const openMin = (th.open.day * 24 * 60) + (th.open.hour * 60);
    const closeMin = (th.close.day * 24 * 60) + (th.close.hour * 60);

    const open = currentMin >= openMin && currentMin < closeMin;

    return {
      open: open,
      family: family,
      alwaysOpen: false,
      currentMin: currentMin,
      openMin: openMin,
      closeMin: closeMin
    };
  }

  function getLiquidityState(now) {
    const sess = cfg().sessions || {};
    const combined = sess.combined || { startGmt: 13, endGmt: 16 };
    const london = sess.london || { startGmt: 8, endGmt: 16 };
    const ny = sess.newYork || { startGmt: 13, endGmt: 21 };

    const hour = now.getUTCHours() + now.getUTCMinutes() / 60;

    return {
      overlap: hour >= combined.startGmt && hour < combined.endGmt,
      london: hour >= london.startGmt && hour < london.endGmt,
      newYork: hour >= ny.startGmt && hour < ny.endGmt,
      hour: hour
    };
  }

  function getSessionLabel(marketState, liquidityState) {
    if (!marketState.open) return SESSION_LABELS.closed;
    if (marketState.alwaysOpen) {
      if (liquidityState.overlap) return SESSION_LABELS.highLiquidity;
      return SESSION_LABELS.alwaysOpen;
    }
    if (liquidityState.overlap) return SESSION_LABELS.highLiquidity;
    if (liquidityState.london) return SESSION_LABELS.european;
    if (liquidityState.newYork) return SESSION_LABELS.american;
    return SESSION_LABELS.asian;
  }

  function analyzeTimeframe(bars) {
    if (!bars || bars.length < 60) return null;
    const closes = bars.map(function (b) { return b.c; });
    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });

    const emaPeriods = (cfg().chart && cfg().chart.emaPeriods) || [20, 50, 200];
    const fast = I.ema(closes, emaPeriods[0]);
    const slow = I.ema(closes, emaPeriods[1]);
    const adxData = I.adx(highs, lows, closes, 14);

    const i = bars.length - 1;
    const price = closes[i];
    const f = fast[i];
    const s = slow[i];
    const adxVal = adxData.adx[i];

    if (!num(f) || !num(s) || !num(adxVal)) return null;

    return {
      direction: f > s ? 1 : -1,
      adx: adxVal,
      priceAboveSlow: price > s,
      price: price,
      fast: f,
      slow: s,
      plusDI: adxData.plusDI[i],
      minusDI: adxData.minusDI[i],
      bars: bars.length
    };
  }

  function findNearestLevels(bars, currentPrice, lookback) {
    lookback = lookback || 3;
    if (!bars || bars.length < lookback * 2 + 2) return { support: null, resistance: null };
    const supports = [];
    const resistances = [];

    for (let i = lookback; i < bars.length - lookback; i++) {
      const b = bars[i];
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (bars[i - j].h >= b.h || bars[i + j].h >= b.h) isHigh = false;
        if (bars[i - j].l <= b.l || bars[i + j].l <= b.l) isLow = false;
      }
      if (isHigh) {
        if (b.h < currentPrice) supports.push(b.h);
        else resistances.push(b.h);
      }
      if (isLow) {
        if (b.l < currentPrice) supports.push(b.l);
        else resistances.push(b.l);
      }
    }

    return {
      support: supports.length ? Math.max.apply(null, supports) : null,
      resistance: resistances.length ? Math.min.apply(null, resistances) : null
    };
  }

  function detectExhaustion(bars, direction, exCfg) {
    const alerts = [];
    if (!bars || bars.length < 40) return alerts;

    const closes = bars.map(function (b) { return b.c; });
    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });
    const vols = bars.map(function (b) { return b.v || 0; });

    const i = bars.length - 1;
    const rsiPeriod = exCfg.rsiPeriod || 14;
    const rsiArr = I.rsi(closes, rsiPeriod);
    const adxData = I.adx(highs, lows, closes, 14);
    const adxArr = adxData.adx;

    const lastRsi = rsiArr[i];
    if (num(lastRsi)) {
      if (lastRsi > (exCfg.rsiOverbought || 70)) {
        alerts.push({ type: 'warn', text: 'RSI en sobrecompra (' + lastRsi.toFixed(1) + '). Posible agotamiento alcista.' });
      } else if (lastRsi < (exCfg.rsiOversold || 30)) {
        alerts.push({ type: 'warn', text: 'RSI en sobreventa (' + lastRsi.toFixed(1) + '). Posible agotamiento bajista.' });
      }
    }

    const lookback = exCfg.lookbackCandles || 5;
    if (i >= lookback && num(adxArr[i]) && num(adxArr[i - lookback]) && adxArr[i - lookback] > 0) {
      const dropPct = ((adxArr[i - lookback] - adxArr[i]) / adxArr[i - lookback]) * 100;
      if (dropPct > (exCfg.adxDropPct || 20)) {
        alerts.push({ type: 'info', text: 'ADX ha caído ' + dropPct.toFixed(0) + '% en ' + lookback + ' velas.' });
      }
    }

    const divLb = exCfg.divergenceLookback || 15;
    const gap = exCfg.divergenceGap != null ? exCfg.divergenceGap : 1;
    const minIdx = 2 * divLb + gap;
    if (i >= minIdx) {
      const currLowStart = i - divLb + 1;
      const prevLowEnd = currLowStart - gap;
      const prevLowStart = prevLowEnd - divLb + 1;
      let currLowIdx = -1, currLowVal = Infinity;
      let prevLowIdx = -1, prevLowVal = Infinity;
      for (let j = currLowStart; j <= i; j++) if (lows[j] < currLowVal) { currLowVal = lows[j]; currLowIdx = j; }
      for (let j = prevLowStart; j <= prevLowEnd; j++) if (lows[j] < prevLowVal) { prevLowVal = lows[j]; prevLowIdx = j; }
      if (currLowIdx !== -1 && prevLowIdx !== -1 && currLowVal < prevLowVal &&
          num(rsiArr[currLowIdx]) && num(rsiArr[prevLowIdx]) && rsiArr[currLowIdx] > rsiArr[prevLowIdx]) {
        alerts.push({ type: 'danger', text: 'Divergencia alcista: precio hace mínimo más bajo, RSI mínimo más alto.' });
      }

      const currHighStart = i - divLb + 1;
      const prevHighEnd = currHighStart - gap;
      const prevHighStart = prevHighEnd - divLb + 1;
      let currHighIdx = -1, currHighVal = -Infinity;
      let prevHighIdx = -1, prevHighVal = -Infinity;
      for (let j = currHighStart; j <= i; j++) if (highs[j] > currHighVal) { currHighVal = highs[j]; currHighIdx = j; }
      for (let j = prevHighStart; j <= prevHighEnd; j++) if (highs[j] > prevHighVal) { prevHighVal = highs[j]; prevHighIdx = j; }
      if (currHighIdx !== -1 && prevHighIdx !== -1 && currHighVal > prevHighVal &&
          num(rsiArr[currHighIdx]) && num(rsiArr[prevHighIdx]) && rsiArr[currHighIdx] < rsiArr[prevHighIdx]) {
        alerts.push({ type: 'danger', text: 'Divergencia bajista: precio hace máximo más alto, RSI máximo más bajo.' });
      }
    }

    const volLb = exCfg.volumeLookback || 20;
    if (i > volLb) {
      let avgVol = 0;
      for (let j = i - 1; j >= i - volLb; j--) avgVol += vols[j];
      avgVol /= volLb;
      const lastVol = vols[i];
      const isBearish = closes[i] < bars[i].o;
      const isBullish = closes[i] > bars[i].o;
      const threshold = avgVol * (1 - (exCfg.volumeDropPct || 30) / 100);
      if (direction === -1 && isBearish && lastVol < threshold) {
        alerts.push({ type: 'warn', text: 'Volumen bajo en vela bajista. Falta de convicción vendedora.' });
      } else if (direction === 1 && isBullish && lastVol < threshold) {
        alerts.push({ type: 'warn', text: 'Volumen bajo en vela alcista. Falta de convicción compradora.' });
      }
    }

    return alerts;
  }

  function suggestRisk(entry, support, resistance, atr, direction) {
    const riskCfg = cfg().risk || {};
    const stopMult = riskCfg.atrStopMult || 1.5;
    const targetMult = riskCfg.atrTargetMult || 3.0;
    const minRR = riskCfg.minRR || 1.5;
    if (!num(entry) || !num(atr) || atr <= 0) return null;

    let stop, target, risk, reward;
    if (direction === 1) {
      const atrStop = entry - stopMult * atr;
      stop = num(support) ? Math.min(support, atrStop) : atrStop;
      const atrTarget = entry + targetMult * atr;
      target = num(resistance) ? Math.max(resistance, atrTarget) : atrTarget;
      risk = entry - stop;
      reward = target - entry;
    } else if (direction === -1) {
      const atrStop = entry + stopMult * atr;
      stop = num(resistance) ? Math.max(resistance, atrStop) : atrStop;
      const atrTarget = entry - targetMult * atr;
      target = num(support) ? Math.min(support, atrTarget) : atrTarget;
      risk = stop - entry;
      reward = entry - target;
    } else {
      return null;
    }

    if (risk <= 0 || reward <= 0) return null;
    const rr = reward / risk;
    return { stop: stop, target: target, rr: rr, valid: rr >= minRR };
  }

  function emptyResult(reason, sessionLabel) {
    return {
      consensusScore: 0,
      consensusLabel: 'neutral',
      consensusText: LABELS.neutral,
      confidence: 0,
      overallDirection: 0,
      perTf: {},
      macroTrend: '—',
      macroMomentum: '—',
      macroVolatility: '—',
      avgAdxAligned: 0,
      avgAdxOpposed: 0,
      alerts: [],
      verdictState: 'wait',
      verdictLabel: 'ESPERAR',
      verdictReason: reason || 'Datos insuficientes.',
      verdictRisk: null,
      marketOpen: false,
      highLiquidity: false,
      sessionLabel: sessionLabel || SESSION_LABELS.closed,
      symbolFamily: 'unknown',
      entryTf: null,
      conclusion: reason || 'Datos insuficientes. Se necesitan al menos dos temporalidades con historial suficiente.'
    };
  }

  function analyze(barsByTf, opts) {
    opts = opts || {};
    const c = cfg();
    const consensusCfg = c.consensus || {};
    const thresholds = consensusCfg.thresholds || { strong: 70, moderate: 50 };
    const minValidTfs = consensusCfg.minimumValidTfs || 2;
    const tieBreak = consensusCfg.tieBreak || 'higher_tf';
    const entryTf = opts.currentTf || (c.timeframes && c.timeframes.entry) || '1h';
    const symbol = opts.symbol || 'XAUUSD';

    const now = new Date();
    const marketState = getMarketState(symbol, now);
    const liquidityState = getLiquidityState(now);
    const sessionLabel = getSessionLabel(marketState, liquidityState);

    const tfs = Object.keys(barsByTf || {});
    const perTf = {};
    const valid = [];

    tfs.forEach(function (tf) {
      const bars = cleanBars(barsByTf[tf]);
      const r = analyzeTimeframe(bars);
      if (r) {
        r.adxNorm = normalizeAdx(r.adx);
        r.weight = weightFor(tf);
        r.evidence = r.weight * r.adxNorm;
        perTf[tf] = r;
        valid.push({ tf: tf, data: r });
      }
    });

    if (valid.length < minValidTfs) {
      return emptyResult('Datos insuficientes: se necesitan al menos ' + minValidTfs + ' temporalidades con historial suficiente.', sessionLabel);
    }

    let buyVotes = 0;
    let sellVotes = 0;
    valid.forEach(function (v) {
      if (v.data.direction === 1) buyVotes++;
      else sellVotes++;
    });

    let overallDirection;
    if (buyVotes > sellVotes) overallDirection = 1;
    else if (sellVotes > buyVotes) overallDirection = -1;
    else overallDirection = tieBreak === 'neutral' ? 0 : (function () {
      const sorted = valid.slice().sort(function (a, b) { return b.data.weight - a.data.weight; });
      return sorted.length && sorted[0].data.direction ? sorted[0].data.direction : 0;
    })();

    let sumAllEvidence = 0;
    let sumAgreeEvidence = 0;
    let sumAllWeight = 0;
    let sumAgreeAdx = 0;
    let sumOpposedAdx = 0;
    let agreeCount = 0;
    let opposedCount = 0;

    valid.forEach(function (v) {
      const agree = overallDirection === 0 ? false : v.data.direction === overallDirection;
      v.agree = agree;
      perTf[v.tf].agree = agree;
      sumAllEvidence += v.data.evidence;
      sumAllWeight += v.data.weight;
      if (agree) {
        sumAgreeEvidence += v.data.evidence;
        sumAgreeAdx += v.data.adx;
        agreeCount++;
      } else {
        sumOpposedAdx += v.data.adx;
        opposedCount++;
      }
    });

    const consensusScore = sumAllEvidence > 0 ? (sumAgreeEvidence / sumAllEvidence) * 100 : 0;
    const magnitude = sumAllWeight > 0 ? sumAllEvidence / sumAllWeight : 0;
    const confidence = overallDirection === 0 ? 0 : magnitude * (consensusScore / 100) * 100;

    let consensusLabel;
    if (overallDirection === 0) consensusLabel = 'neutral';
    else if (consensusScore >= thresholds.strong) consensusLabel = overallDirection === 1 ? 'strong_buy' : 'strong_sell';
    else if (consensusScore >= thresholds.moderate) consensusLabel = overallDirection === 1 ? 'buy' : 'sell';
    else consensusLabel = 'neutral';

    const avgAdxAligned = agreeCount > 0 ? sumAgreeAdx / agreeCount : 0;
    const avgAdxOpposed = opposedCount > 0 ? sumOpposedAdx / opposedCount : 0;

    let macroTrend;
    if (avgAdxAligned >= 30) macroTrend = 'Muy fuerte';
    else if (avgAdxAligned >= 25) macroTrend = 'Fuerte';
    else if (avgAdxAligned >= 20) macroTrend = 'Moderada';
    else macroTrend = 'Débil';

    const entryBarsRaw = barsByTf[entryTf] || null;
    const entryBars = entryBarsRaw ? cleanBars(entryBarsRaw) : null;

    let macroMomentum = '—';
    let macroVolatility = '—';
    let alerts = [];
    let atrVal = 0;

    if (entryBars && entryBars.length > 30) {
      const hc = entryBars.map(function (b) { return b.c; });
      const hh = entryBars.map(function (b) { return b.h; });
      const hl = entryBars.map(function (b) { return b.l; });

      const rsiArr = I.rsi(hc, 14);
      const lastRsi = rsiArr[rsiArr.length - 1];
      if (num(lastRsi)) {
        if (lastRsi >= 60) macroMomentum = 'Alcista';
        else if (lastRsi <= 40) macroMomentum = 'Bajista';
        else macroMomentum = 'Neutro';
      }

      const atrArr = I.atr(hh, hl, hc, 14);
      const lastAtr = atrArr[atrArr.length - 1];
      const cleanAtr = atrArr.filter(num);
      const avgAtrArr = I.sma(cleanAtr, 20);
      const avgAtrVal = avgAtrArr[avgAtrArr.length - 1];

      if (num(lastAtr) && num(avgAtrVal) && avgAtrVal > 0) {
        atrVal = lastAtr;
        const ratio = lastAtr / avgAtrVal;
        if (ratio >= 1.3) macroVolatility = 'Alta';
        else if (ratio <= 0.75) macroVolatility = 'Baja';
        else macroVolatility = 'Normal';
      }

      alerts = detectExhaustion(entryBars, overallDirection, c.exhaustion || {});

      const overext = (c.exhaustion && c.exhaustion.consensusOverextension) || 90;
      if (consensusScore >= overext && overallDirection === 1) {
        alerts.push({ type: 'danger', text: 'Consenso casi unánime alcista. Alta probabilidad de sobre-extensión y retroceso.' });
      } else if (consensusScore >= overext && overallDirection === -1) {
        alerts.push({ type: 'danger', text: 'Consenso casi unánime bajista. Alta probabilidad de sobre-extensión y rebote.' });
      }
    }

    if (marketState.open && !liquidityState.overlap && !marketState.alwaysOpen) {
      alerts.push({ type: 'info', text: 'Liquidez reducida fuera del overlap Londres-NY. Spread puede ser más ancho.' });
    }

    const currentPrice = valid[0].data.price;
    const levels = findNearestLevels(entryBars, currentPrice, 3);
    const risk = overallDirection !== 0 ? suggestRisk(currentPrice, levels.support, levels.resistance, atrVal, overallDirection) : null;

    const digits = (c.symbols && c.symbols[symbol] && c.symbols[symbol].digits) || 2;
    const fmt = function (p) { return num(p) ? p.toFixed(digits) : '—'; };

    let verdictState = 'wait';
    let verdictLabel = 'ESPERAR';
    let verdictReason = 'Analizando condiciones...';

    const hasDanger = alerts.some(function (a) { return a.type === 'danger'; });

    if (!marketState.open) {
      verdictReason = 'Mercado cerrado (' + marketState.family + '). No se opera hasta la próxima apertura.';
    } else if (overallDirection === 0) {
      verdictReason = 'Temporalidades empatadas. Sin sesgo direccional claro.';
    } else if (consensusLabel === 'neutral') {
      verdictReason = 'Consenso entre temporalidades por debajo del umbral (' + consensusScore.toFixed(0) + '%).';
    } else if (hasDanger) {
      verdictReason = 'Alertas críticas de agotamiento. El movimiento está sobreextendido; espera retroceso.';
    } else if (confidence < 20) {
      verdictReason = 'Confianza insuficiente (' + confidence.toFixed(0) + '%). La evidencia es débil o contradictoria.';
    } else if (!risk) {
      verdictReason = 'No se pudo calcular una gestión de riesgo válida (ATR o niveles insuficientes).';
    } else if (!risk.valid) {
      verdictReason = 'R:R ' + risk.rr.toFixed(2) + ':1 por debajo del mínimo requerido (' + ((c.risk && c.risk.minRR) || 1.5) + ':1).';
    } else if (overallDirection === 1) {
      const dist = atrVal > 0 ? (currentPrice - levels.support) / atrVal : Infinity;
      if (dist <= 1.5) {
        verdictState = 'buy';
        verdictLabel = 'PREPARAR COMPRA';
        verdictReason = 'Sesgo alcista, precio cerca de soporte en ' + fmt(levels.support) + '. R:R ' + risk.rr.toFixed(2) + ':1.';
      } else {
        verdictReason = 'Sesgo alcista, pero el precio está a ' + dist.toFixed(1) + '×ATR del soporte. Espera retroceso.';
      }
    } else if (overallDirection === -1) {
      const dist = atrVal > 0 ? (levels.resistance - currentPrice) / atrVal : Infinity;
      if (dist <= 1.5) {
        verdictState = 'sell';
        verdictLabel = 'PREPARAR VENTA';
        verdictReason = 'Sesgo bajista, precio cerca de resistencia en ' + fmt(levels.resistance) + '. R:R ' + risk.rr.toFixed(2) + ':1.';
      } else {
        verdictReason = 'Sesgo bajista, pero el precio está a ' + dist.toFixed(1) + '×ATR de la resistencia. Espera rebote.';
      }
    }

    const conclusionParts = [];
    const dirText = overallDirection === 1 ? 'alcista' : overallDirection === -1 ? 'bajista' : 'neutral';

    if (!marketState.open) {
      conclusionParts.push('Mercado cerrado para ' + symbol + ' (' + marketState.family + '). Sin operativa hasta apertura.');
    } else if (consensusLabel === 'strong_buy' || consensusLabel === 'strong_sell') {
      conclusionParts.push('Sesgo ' + dirText + ' fuerte con consenso del ' + consensusScore.toFixed(0) + '% y confianza del ' + confidence.toFixed(0) + '%.');
    } else if (consensusLabel === 'buy' || consensusLabel === 'sell') {
      conclusionParts.push('Sesgo ' + dirText + ' moderado (consenso ' + consensusScore.toFixed(0) + '%, confianza ' + confidence.toFixed(0) + '%).');
    } else {
      conclusionParts.push('Temporalidades divididas o sin fuerza (consenso ' + consensusScore.toFixed(0) + '%). Mercado en rango o transición.');
    }

    if (marketState.open) {
      conclusionParts.push('Fuerza a favor: ' + macroTrend + ' (ADX ' + avgAdxAligned.toFixed(1) + ').');
      if (opposedCount > 0 && avgAdxOpposed > 0) {
        conclusionParts.push('Fuerza en contra: ADX ' + avgAdxOpposed.toFixed(1) + '.');
      }
      if (macroMomentum !== '—') conclusionParts.push('Momentum en ' + entryTf.toUpperCase() + ': ' + macroMomentum + '.');
      if (alerts.length > 0) conclusionParts.push('⚠️ ' + alerts.length + ' señal(es) detectada(s).');
    }

    return {
      consensusScore: consensusScore,
      consensusLabel: consensusLabel,
      consensusText: LABELS[consensusLabel],
      confidence: confidence,
      overallDirection: overallDirection,
      perTf: perTf,
      macroTrend: macroTrend,
      macroMomentum: macroMomentum,
      macroVolatility: macroVolatility,
      avgAdxAligned: avgAdxAligned,
      avgAdxOpposed: avgAdxOpposed,
      alerts: alerts,
      verdictState: verdictState,
      verdictLabel: verdictLabel,
      verdictReason: verdictReason,
      verdictRisk: risk,
      marketOpen: marketState.open,
      highLiquidity: liquidityState.overlap,
      sessionLabel: sessionLabel,
      symbolFamily: marketState.family,
      entryTf: entryTf,
      conclusion: conclusionParts.join(' ')
    };
  }

  return {
    analyze: analyze,
    LABELS: LABELS,
    SESSION_LABELS: SESSION_LABELS,
    getMarketState: getMarketState,
    getLiquidityState: getLiquidityState,
    getSessionLabel: getSessionLabel
  };
}));