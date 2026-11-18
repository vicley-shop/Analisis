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

  const _cache = new Map();

  function num(v) { return v != null && Number.isFinite(v); }
  function cfg() { return (typeof window !== 'undefined' && window.AT_CONFIG) || {}; }

  function weightFor(tf) {
    return ((cfg().timeframes && cfg().timeframes.weights) || {})[tf] || 1;
  }

  function biasTfs() {
    return (cfg().timeframes && cfg().timeframes.bias) || ['4h', '1d'];
  }

  function normalizeAdx(adx) {
    const ceiling = (cfg().consensus && cfg().consensus.adxNormalizationCeiling) || 40;
    if (!num(adx) || adx <= 0) return 0;
    return Math.min(adx, ceiling) / ceiling;
  }

  function cleanBars(bars) {
    if (!bars || !bars.length) return bars;
    const useClosed = (cfg().analysis && cfg().analysis.useClosedCandlesOnly) !== false;
    return (useClosed && bars.length > 1) ? bars.slice(0, -1) : bars;
  }

  function getTradingHours(family) {
    const th = cfg().tradingHours || {};
    const fallback = { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 22 } };
    return th[family] || th.forex || fallback;
  }

  function getMarketState(symbol, now) {
    const inst = (cfg().symbols || {})[symbol];
    if (!inst) return { open: false, family: 'unknown', alwaysOpen: false, currentMin: 0, openMin: 0, closeMin: 0 };
    const family = inst.family || 'forex';
    const th = getTradingHours(family);
    if (th.alwaysOpen) return { open: true, family: family, alwaysOpen: true, currentMin: 0, openMin: 0, closeMin: 0 };
    const currentMin = now.getUTCDay() * 1440 + now.getUTCHours() * 60 + now.getUTCMinutes();
    const openMin = th.open.day * 1440 + th.open.hour * 60;
    const closeMin = th.close.day * 1440 + th.close.hour * 60;
    return { open: currentMin >= openMin && currentMin < closeMin, family: family, alwaysOpen: false, currentMin: currentMin, openMin: openMin, closeMin: closeMin };
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
    if (liquidityState.overlap) return SESSION_LABELS.highLiquidity;
    if (marketState.alwaysOpen) return SESSION_LABELS.alwaysOpen;
    if (liquidityState.london) return SESSION_LABELS.european;
    if (liquidityState.newYork) return SESSION_LABELS.american;
    return SESSION_LABELS.asian;
  }

  function analyzeTimeframe(bars) {
    const minBars = (cfg().analysis && cfg().analysis.minBarsPerTf) || 50;
    if (!bars || bars.length < minBars) return null;

    const closes = bars.map(function (b) { return b.c; });
    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });

    const rCfg = cfg().regime || {};
    const emaFastP = rCfg.emaFast || 50;
    const emaSlowP = rCfg.emaSlow || 200;
    const adxPeriod = rCfg.adxPeriod || 14;
    const returnLb = rCfg.returnLookback || 30;
    const emaSepMin = rCfg.emaSeparationMinPct || 0.5;
    const returnMin = rCfg.returnMinPct || 0.2;
    const adxMin = rCfg.adxMin || 22;
    const adxStrong = rCfg.adxStrong || 28;

    const fast = I.ema(closes, emaFastP);
    const slow = I.ema(closes, emaSlowP);
    const adxData = I.adx(highs, lows, closes, adxPeriod);

    const i = bars.length - 1;
    const price = closes[i];
    const f = fast[i];
    const s = slow[i];
    const adxVal = adxData.adx[i];

    if (!num(f) || !num(s) || !num(adxVal) || s === 0) return null;

    const direction = f > s ? 1 : -1;
    const emaSepPct = Math.abs((f - s) / s) * 100;

    const retIdx = i - returnLb;
    const returnPct = (retIdx >= 0 && closes[retIdx] > 0)
      ? ((price - closes[retIdx]) / closes[retIdx]) * 100
      : null;

    const adxOk = adxVal >= adxMin;
    const emaOk = emaSepPct >= emaSepMin;
    const returnOk = num(returnPct) && Math.abs(returnPct) >= returnMin && ((returnPct > 0) === (direction === 1));
    const regimeValid = adxOk && emaOk && returnOk;

    return {
      direction: direction,
      adx: adxVal,
      adxStrong: adxVal >= adxStrong,
      emaSepPct: emaSepPct,
      returnPct: returnPct,
      regimeValid: regimeValid,
      price: price,
      fast: f,
      slow: s,
      plusDI: adxData.plusDI[i],
      minusDI: adxData.minusDI[i],
      bars: bars.length
    };
  }

  function getAnalyzedTf(rawBars, tf) {
    if (!rawBars || !rawBars.length) return null;
    const cleaned = cleanBars(rawBars);
    if (!cleaned || !cleaned.length) return null;

    const cleanLen = cleaned.length;
    const last = cleaned[cleanLen - 1];
    const cached = _cache.get(tf);

    if (cached &&
        cached.result != null &&
        cached.rawBarsRef === rawBars &&
        cached.cleanLen === cleanLen &&
        cached.lastT === last.t &&
        cached.lastC === last.c) {
      return cached.result;
    }

    const result = analyzeTimeframe(cleaned);
    if (result != null) {
      _cache.set(tf, {
        rawBarsRef: rawBars,
        cleanLen: cleanLen,
        lastT: last.t,
        lastC: last.c,
        result: result
      });
    } else {
      _cache.delete(tf);
    }
    return result;
  }

  function findNearestLevels(bars, currentPrice, lookback) {
    lookback = lookback || 3;
    const n = bars ? bars.length : 0;
    const empty = { support: null, resistance: null };
    if (!n || n < lookback * 2 + 2 || !num(currentPrice)) return empty;

    const supports = [];
    const resistances = [];

    for (let i = lookback; i < n - lookback; i++) {
      const b = bars[i];
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= lookback; j++) {
        if (bars[i - j].h >= b.h || bars[i + j].h >= b.h) isHigh = false;
        if (bars[i - j].l <= b.l || bars[i + j].l <= b.l) isLow = false;
      }
      if (isHigh) (b.h < currentPrice ? supports : resistances).push(b.h);
      if (isLow) (b.l < currentPrice ? supports : resistances).push(b.l);
    }

    return {
      support: supports.length ? Math.max.apply(null, supports) : null,
      resistance: resistances.length ? Math.min.apply(null, resistances) : null
    };
  }

  function findExtremeIdx(arr, start, end, findMin) {
    let idx = -1;
    let val = findMin ? Infinity : -Infinity;
    for (let j = start; j <= end; j++) {
      if (findMin ? arr[j] < val : arr[j] > val) { val = arr[j]; idx = j; }
    }
    return { idx: idx, val: val };
  }

  function detectExhaustion(bars, direction, exCfg) {
    const alerts = [];
    if (!bars || bars.length < 40) return alerts;

    const closes = bars.map(function (b) { return b.c; });
    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });
    const vols = bars.map(function (b) { return b.v || 0; });

    const i = bars.length - 1;
    const rsiArr = I.rsi(closes, exCfg.rsiPeriod || 14);
    const adxArr = I.adx(highs, lows, closes, 14).adx;

    const lastRsi = rsiArr[i];
    const prevRsi = rsiArr[i - 1];
    const ob = exCfg.rsiOverbought || 80;
    const os = exCfg.rsiOversold || 20;
    if (num(lastRsi) && num(prevRsi)) {
      if (lastRsi > ob && prevRsi <= ob) {
        alerts.push({ type: 'info', text: 'RSI cruza sobrecompra (' + lastRsi.toFixed(1) + ').' });
      } else if (lastRsi < os && prevRsi >= os) {
        alerts.push({ type: 'info', text: 'RSI cruza sobreventa (' + lastRsi.toFixed(1) + ').' });
      }
    }

    const lookback = exCfg.lookbackCandles || 5;
    if (i >= lookback && num(adxArr[i]) && num(adxArr[i - lookback]) && adxArr[i - lookback] > 0) {
      const dropPct = ((adxArr[i - lookback] - adxArr[i]) / adxArr[i - lookback]) * 100;
      if (dropPct > (exCfg.adxDropPct || 30)) {
        alerts.push({ type: 'info', text: 'ADX cae ' + dropPct.toFixed(0) + '% en ' + lookback + ' velas.' });
      }
    }

    const divLb = exCfg.divergenceLookback || 15;
    const gap = exCfg.divergenceGap != null ? exCfg.divergenceGap : 1;
    if (i >= 2 * divLb + gap - 1) {
      const currStart = i - divLb + 1;
      const prevEnd = currStart - gap - 1;
      const prevStart = prevEnd - divLb + 1;

      const currLow = findExtremeIdx(lows, currStart, i, true);
      const prevLow = findExtremeIdx(lows, prevStart, prevEnd, true);
      if (currLow.idx !== -1 && prevLow.idx !== -1 &&
          currLow.val < prevLow.val &&
          num(rsiArr[currLow.idx]) && num(rsiArr[prevLow.idx]) &&
          rsiArr[currLow.idx] > rsiArr[prevLow.idx]) {
        alerts.push({ type: 'danger', text: 'Divergencia alcista RSI.' });
      }

      const currHigh = findExtremeIdx(highs, currStart, i, false);
      const prevHigh = findExtremeIdx(highs, prevStart, prevEnd, false);
      if (currHigh.idx !== -1 && prevHigh.idx !== -1 &&
          currHigh.val > prevHigh.val &&
          num(rsiArr[currHigh.idx]) && num(rsiArr[prevHigh.idx]) &&
          rsiArr[currHigh.idx] < rsiArr[prevHigh.idx]) {
        alerts.push({ type: 'danger', text: 'Divergencia bajista RSI.' });
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
      const threshold = avgVol * (1 - (exCfg.volumeDropPct || 40) / 100);
      if (direction === -1 && isBearish && lastVol < threshold) {
        alerts.push({ type: 'warn', text: 'Volumen bajo en vela bajista.' });
      } else if (direction === 1 && isBullish && lastVol < threshold) {
        alerts.push({ type: 'warn', text: 'Volumen bajo en vela alcista.' });
      }
    }

    return alerts;
  }

  function suggestRisk(entry, support, resistance, atr, direction) {
    const riskCfg = cfg().risk || {};
    const stopMult = riskCfg.atrStopMult || 1.5;
    const targetMult = riskCfg.atrTargetMult || 3.0;
    const minRR = riskCfg.minRR || 1.8;
    if (!num(entry) || !num(atr) || atr <= 0) return null;

    let stop, target;
    if (direction === 1) {
      const atrStop = entry - stopMult * atr;
      stop = num(support) ? Math.min(support, atrStop) : atrStop;
      const atrTarget = entry + targetMult * atr;
      target = num(resistance) ? Math.min(resistance, atrTarget) : atrTarget;
      if (target <= entry) return null;
    } else if (direction === -1) {
      const atrStop = entry + stopMult * atr;
      stop = num(resistance) ? Math.max(resistance, atrStop) : atrStop;
      const atrTarget = entry - targetMult * atr;
      target = num(support) ? Math.max(support, atrTarget) : atrTarget;
      if (target >= entry) return null;
    } else {
      return null;
    }

    const risk = direction === 1 ? entry - stop : stop - entry;
    const reward = direction === 1 ? target - entry : entry - target;
    if (risk <= 0 || reward <= 0) return null;

    const rr = reward / risk;
    return { stop: stop, target: target, rr: rr, valid: rr >= minRR };
  }

  function emptyResult(reason, sessionLabel, marketOpen, symbolFamily) {
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
      marketOpen: !!marketOpen,
      highLiquidity: false,
      sessionLabel: sessionLabel || SESSION_LABELS.closed,
      symbolFamily: symbolFamily || 'unknown',
      entryTf: null,
      conclusion: reason || 'Datos insuficientes.'
    };
  }

  function computeConsensus(valid, thresholds, weightedMajority) {
    let buyWeight = 0;
    let sellWeight = 0;
    for (let i = 0; i < valid.length; i++) {
      if (valid[i].data.direction === 1) buyWeight += valid[i].data.evidence;
      else sellWeight += valid[i].data.evidence;
    }
    const totalWeight = buyWeight + sellWeight;
    const buyShare = totalWeight > 0 ? buyWeight / totalWeight : 0.5;

    let overallDirection = 0;
    if (buyShare >= weightedMajority) overallDirection = 1;
    else if (buyShare <= 1 - weightedMajority) overallDirection = -1;

    let sumAllEvidence = 0;
    let sumAgreeEvidence = 0;
    let sumAgreeAdx = 0;
    let sumOpposedAdx = 0;
    let agreeCount = 0;
    let opposedCount = 0;

    for (let i = 0; i < valid.length; i++) {
      const v = valid[i];
      const agree = overallDirection !== 0 && v.data.direction === overallDirection;
      v.agree = agree;
      sumAllEvidence += v.data.evidence;
      if (agree) {
        sumAgreeEvidence += v.data.evidence;
        sumAgreeAdx += v.data.adx;
        agreeCount++;
      } else {
        sumOpposedAdx += v.data.adx;
        opposedCount++;
      }
    }

    const consensusScore = sumAllEvidence > 0 ? (sumAgreeEvidence / sumAllEvidence) * 100 : 0;
    const avgAdxAligned = agreeCount > 0 ? sumAgreeAdx / agreeCount : 0;
    const avgAdxOpposed = opposedCount > 0 ? sumOpposedAdx / opposedCount : 0;
    const magnitude = avgAdxAligned > 0 ? normalizeAdx(avgAdxAligned) : 0;
    const confidence = overallDirection !== 0 ? magnitude * (consensusScore / 100) * 100 : 0;

    let consensusLabel;
    if (overallDirection === 0) consensusLabel = 'neutral';
    else if (consensusScore >= thresholds.strong) consensusLabel = overallDirection === 1 ? 'strong_buy' : 'strong_sell';
    else if (consensusScore >= thresholds.moderate) consensusLabel = overallDirection === 1 ? 'buy' : 'sell';
    else consensusLabel = 'neutral';

    return {
      overallDirection: overallDirection,
      buyShare: buyShare,
      consensusScore: consensusScore,
      consensusLabel: consensusLabel,
      avgAdxAligned: avgAdxAligned,
      avgAdxOpposed: avgAdxOpposed,
      confidence: confidence
    };
  }

  function computeVerdict(ctx) {
    if (!ctx.marketOpen) {
      return { state: 'wait', label: 'ESPERAR', reason: 'Mercado cerrado (' + ctx.marketFamily + ').' };
    }
    if (ctx.overallDirection === 0) {
      return {
        state: 'wait', label: 'ESPERAR',
        reason: 'Votación ponderada sin sesgo claro (' + (ctx.buyShare * 100).toFixed(0) + '% / ' + ((1 - ctx.buyShare) * 100).toFixed(0) + '%).'
      };
    }
    if (!ctx.biasValid) {
      return {
        state: 'wait', label: 'ESPERAR',
        reason: 'Sesgo ' + (ctx.overallDirection === 1 ? 'alcista' : 'bajista') + ' sin confirmación de 4h/1d.'
      };
    }
    if (ctx.avgAdxAligned < ctx.adxMin) {
      return { state: 'wait', label: 'ESPERAR', reason: 'Régimen débil (ADX ' + ctx.avgAdxAligned.toFixed(1) + ' < ' + ctx.adxMin + ').' };
    }
    if (ctx.consensusLabel === 'neutral') {
      return { state: 'wait', label: 'ESPERAR', reason: 'Consenso insuficiente (' + ctx.consensusScore.toFixed(0) + '%).' };
    }
    if (ctx.dangerCount >= ctx.dangerBlock) {
      return { state: 'wait', label: 'ESPERAR', reason: 'Agotamiento detectado (' + ctx.dangerCount + ' alertas críticas).' };
    }
    if (!ctx.risk) {
      return { state: 'wait', label: 'ESPERAR', reason: 'No se pudo calcular gestión de riesgo.' };
    }
    if (!ctx.risk.valid) {
      return { state: 'wait', label: 'ESPERAR', reason: 'R:R ' + ctx.risk.rr.toFixed(2) + ':1 por debajo del mínimo (' + ctx.minRR + ':1).' };
    }

    const isBuy = ctx.overallDirection === 1;
    return {
      state: isBuy ? 'buy' : 'sell',
      label: isBuy ? 'PREPARAR COMPRA' : 'PREPARAR VENTA',
      reason: 'Sesgo ' + (isBuy ? 'alcista' : 'bajista') +
        ' confirmado. ADX ' + ctx.avgAdxAligned.toFixed(1) +
        ' · R:R ' + ctx.risk.rr.toFixed(2) + ':1 · Stop ' + ctx.fmt(ctx.risk.stop) + ' · Target ' + ctx.fmt(ctx.risk.target) + '.'
    };
  }

  function analyze(barsByTf, opts) {
    try {
      return _analyze(barsByTf, opts);
    } catch (e) {
      console.error('[analysis] analyze() lanzó excepción:', e);
      return emptyResult('Error interno de análisis: ' + (e && e.message ? e.message : 'desconocido'));
    }
  }

  function _analyze(barsByTf, opts) {
    opts = opts || {};
    const c = cfg();
    const consensusCfg = c.consensus || {};
    const riskCfg = c.risk || {};
    const regimeCfg = c.regime || {};
    const exCfg = c.exhaustion || {};
    const thresholds = consensusCfg.thresholds || { strong: 65, moderate: 45 };
    const minValidTfs = consensusCfg.minimumValidTfs || 3;
    const weightedMajority = consensusCfg.weightedMajority || 0.60;
    const adxMin = regimeCfg.adxMin || 22;
    const dangerBlock = exCfg.dangerBlockThreshold || 2;
    const minRR = riskCfg.minRR || 1.8;

    const entryTf = opts.currentTf || (c.timeframes && c.timeframes.entry) || '15m';
    const symbol = opts.symbol || 'XAUUSD';

    const now = new Date();
    const marketState = getMarketState(symbol, now);
    const liquidityState = getLiquidityState(now);
    const sessionLabel = getSessionLabel(marketState, liquidityState);

    const perTf = {};
    const valid = [];
    const keys = Object.keys(barsByTf || {});

    for (let k = 0; k < keys.length; k++) {
      const tf = keys[k];
      try {
        const r = getAnalyzedTf(barsByTf[tf], tf);
        if (!r) continue;
        r.adxNorm = normalizeAdx(r.adx);
        r.weight = weightFor(tf);
        r.evidence = r.weight * r.adxNorm;
        perTf[tf] = r;
        valid.push({ tf: tf, data: r });
      } catch (e) {
        console.error('[analysis] ' + tf + ' excepción durante el análisis:', e);
      }
    }

    if (valid.length < minValidTfs) {
      return emptyResult(
        'Datos insuficientes: se necesitan ≥' + minValidTfs + ' temporalidades válidas (hay ' + valid.length + ').',
        sessionLabel, marketState.open, marketState.family
      );
    }

    const consensus = computeConsensus(valid, thresholds, weightedMajority);
    const overallDirection = consensus.overallDirection;
    const buyShare = consensus.buyShare;
    const consensusScore = consensus.consensusScore;
    const consensusLabel = consensus.consensusLabel;
    const avgAdxAligned = consensus.avgAdxAligned;
    const avgAdxOpposed = consensus.avgAdxOpposed;
    const confidence = consensus.confidence;

    const bias = biasTfs();
    const biasAgree = valid.filter(function (v) {
      return bias.indexOf(v.tf) !== -1 && v.data.regimeValid && v.data.direction === overallDirection;
    });
    const biasOppose = valid.filter(function (v) {
      return bias.indexOf(v.tf) !== -1 && v.data.regimeValid && overallDirection !== 0 && v.data.direction !== overallDirection;
    });
    const biasValid = overallDirection !== 0 && biasAgree.length >= 1 && biasOppose.length === 0;

    const macroTrend =
      avgAdxAligned >= 30 ? 'Muy fuerte' :
      avgAdxAligned >= 25 ? 'Fuerte' :
      avgAdxAligned >= 20 ? 'Moderada' : 'Débil';

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
        macroMomentum = lastRsi >= 60 ? 'Alcista' : lastRsi <= 40 ? 'Bajista' : 'Neutro';
      }

      const atrArr = I.atr(hh, hl, hc, riskCfg.atrPeriod || 14);
      const lastAtr = atrArr[atrArr.length - 1];
      const cleanAtr = atrArr.filter(num);
      const avgAtrArr = I.sma(cleanAtr, 20);
      const avgAtrVal = avgAtrArr[avgAtrArr.length - 1];

      if (num(lastAtr) && num(avgAtrVal) && avgAtrVal > 0) {
        atrVal = lastAtr;
        const ratio = lastAtr / avgAtrVal;
        macroVolatility = ratio >= 1.3 ? 'Alta' : ratio <= 0.75 ? 'Baja' : 'Normal';
      }

      alerts = detectExhaustion(entryBars, overallDirection, exCfg);

      const overext = exCfg.consensusOverextension || 95;
      if (consensusScore >= overext && overallDirection === 1) {
        alerts.push({ type: 'danger', text: 'Consenso unánime alcista. Riesgo de sobre-extensión.' });
      } else if (consensusScore >= overext && overallDirection === -1) {
        alerts.push({ type: 'danger', text: 'Consenso unánime bajista. Riesgo de sobre-extensión.' });
      }
    }

    if (marketState.open && !liquidityState.overlap && !marketState.alwaysOpen) {
      alerts.push({ type: 'info', text: 'Liquidez reducida (fuera de overlap Londres-NY).' });
    }

    const entryData = perTf[entryTf];
    const currentPrice = entryData ? entryData.price : (valid[0] ? valid[0].data.price : null);
    const levels = findNearestLevels(entryBars, currentPrice, 3);
    const risk = overallDirection !== 0
      ? suggestRisk(currentPrice, levels.support, levels.resistance, atrVal, overallDirection)
      : null;

    const digits = (c.symbols && c.symbols[symbol] && c.symbols[symbol].digits) || 2;
    const fmt = function (p) { return num(p) ? p.toFixed(digits) : '—'; };
    const dangerCount = alerts.filter(function (a) { return a.type === 'danger'; }).length;

    const verdict = computeVerdict({
      marketOpen: marketState.open,
      marketFamily: marketState.family,
      overallDirection: overallDirection,
      buyShare: buyShare,
      biasValid: biasValid,
      avgAdxAligned: avgAdxAligned,
      adxMin: adxMin,
      consensusLabel: consensusLabel,
      consensusScore: consensusScore,
      dangerCount: dangerCount,
      dangerBlock: dangerBlock,
      risk: risk,
      minRR: minRR,
      fmt: fmt
    });

    const conclusionParts = [];
    const dirText = overallDirection === 1 ? 'alcista' : overallDirection === -1 ? 'bajista' : 'neutral';
    if (!marketState.open) {
      conclusionParts.push('Mercado cerrado para ' + symbol + ' (' + marketState.family + ').');
    } else if (verdict.state === 'buy' || verdict.state === 'sell') {
      conclusionParts.push('Setup ' + dirText + ' con consenso ' + consensusScore.toFixed(0) + '%, confianza ' + confidence.toFixed(0) + '%.');
      if (alerts.length > 0) conclusionParts.push(alerts.length + ' alerta(s).');
    } else {
      conclusionParts.push('Sin setup válido: ' + verdict.reason);
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
      verdictState: verdict.state,
      verdictLabel: verdict.label,
      verdictReason: verdict.reason,
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