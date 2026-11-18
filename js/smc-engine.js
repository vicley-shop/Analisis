window.AT = window.AT || {};
window.AT.smcEngine = (function (I) {
  'use strict';

  const DEFAULT_ATR_PERIOD = 14;
  const DEFAULT_HIGH_CONFLUENCE = 80;
  const DEFAULT_MEDIUM_CONFLUENCE = 50;
  const DEFAULT_MIN_CONFIDENCE = 15;
  const DEFAULT_MIN_COMPONENTS = 2;
  const SWEEP_AGAINST_PENALTY = 15;
  const BOS_WEIGHT_FACTOR = 0.5;
  const STALE_MSS_FACTOR = 0.5;

  function cfg() {
    return (window.AT_CONFIG && window.AT_CONFIG.smc) || {};
  }

  function weights() {
    const w = cfg().weights || {};
    return {
      mss: w.mss != null ? w.mss : 30,
      sweep: w.sweep != null ? w.sweep : 25,
      fvg: w.fvg != null ? w.fvg : 15,
      ob: w.ob != null ? w.ob : 15,
      ote: w.ote != null ? w.ote : 15
    };
  }

  function thresholds() {
    return {
      high: cfg().highConfluence != null ? cfg().highConfluence : DEFAULT_HIGH_CONFLUENCE,
      medium: cfg().mediumConfluence != null ? cfg().mediumConfluence : DEFAULT_MEDIUM_CONFLUENCE
    };
  }

  function requireZoneForHigh() {
    return cfg().requireZoneForHigh !== false;
  }

  function atrPeriod() {
    return cfg().atrPeriod || DEFAULT_ATR_PERIOD;
  }

  function minComponentsForMedium() {
    return cfg().minComponentsForMedium != null ? cfg().minComponentsForMedium : DEFAULT_MIN_COMPONENTS;
  }

  function requireActiveSession() {
    const s = window.AT_CONFIG && window.AT_CONFIG.sessions;
    return !!(s && s.requireActive);
  }

  function num(v) {
    return v != null && Number.isFinite(v);
  }

  function emptyResult(direction, reason, context) {
    context = context || {};
    return {
      score: 0,
      label: 'Sin confluencia suficiente',
      direction: direction || 0,
      trend: 'Débil',
      grade: 'Débil',
      reasons: [reason],
      breakdown: {},
      zones: { ob: null, fvg: null, ote: null, allOBs: [], allFVGs: [] },
      vetoes: [reason],
      vetoed: true,
      activeComponents: 0,
      context: context
    };
  }

  function computeAtr(bars) {
    if (!bars || bars.length < atrPeriod() + 1) return 0;
    const highs = bars.map(function (b) { return b.h; });
    const lows = bars.map(function (b) { return b.l; });
    const closes = bars.map(function (b) { return b.c; });
    const arr = I.atr(highs, lows, closes, atrPeriod());
    for (let i = arr.length - 1; i >= 0; i--) {
      if (num(arr[i]) && arr[i] > 0) return arr[i];
    }
    return 0;
  }

  function evaluateDirection(bars, direction, context, atr, structure, sweeps, obs, fvgs, ote, w) {
    const result = {
      score: 0,
      label: 'Sin confluencia suficiente',
      direction: direction,
      trend: 'Débil',
      reasons: [],
      breakdown: {},
      zones: { ob: null, fvg: null, ote: null, allOBs: obs, allFVGs: fvgs },
      vetoes: [],
      vetoed: false,
      context: context
    };

    const lastIdx = bars.length - 1;
    const currentPrice = bars[lastIdx].c;
    let score = 0;

    const mss = structure.mss;
    const mssMatches = mss && mss.direction === direction;
    if (mssMatches) {
      const base = mss.type && mss.type.indexOf('MSS_') === 0 ? w.mss : w.mss * BOS_WEIGHT_FACTOR;
      const freshness = mss.fresh !== false ? 1 : STALE_MSS_FACTOR;
      const weighted = base * freshness;
      score += weighted;
      result.breakdown.mss = {
        value: base,
        weighted: weighted,
        reason: (mss.type || 'MSS') + ' a favor (barsSince ' + mss.barsSince + ')'
      };
      result.reasons.push('Estructura a favor (' + (mss.type || 'MSS') + ').');
    } else {
      result.breakdown.mss = { value: 0, weighted: 0, reason: 'Sin estructura alineada' };
    }

    const sweepFavor = sweeps.find(function (s) { return s.direction === direction; });
    if (sweepFavor) {
      const rejection = num(sweepFavor.rejectionRatio) ? sweepFavor.rejectionRatio : 1;
      const weighted = w.sweep * rejection;
      score += weighted;
      result.breakdown.sweep = {
        value: w.sweep,
        weighted: weighted,
        rejectionRatio: rejection,
        reason: 'Sweep a favor (rechazo ' + (rejection * 100).toFixed(0) + '%)'
      };
      result.reasons.push('Barrido de liquidez a favor.');
    } else {
      result.breakdown.sweep = { value: 0, weighted: 0, reason: 'Sin sweep a favor' };
    }

    const sweepAgainst = sweeps.find(function (s) { return s.direction !== direction; });
    if (sweepAgainst) {
      const rejection = num(sweepAgainst.rejectionRatio) ? sweepAgainst.rejectionRatio : 0.5;
      const penalty = SWEEP_AGAINST_PENALTY * rejection;
      score -= penalty;
      result.breakdown.penalty = {
        value: penalty,
        weighted: -penalty,
        reason: 'Sweep en contra (penalización ' + penalty.toFixed(0) + ')'
      };
    }

    const activeFvg = window.AT.smc.zones.findActiveZone(fvgs, currentPrice, direction);
    if (activeFvg) {
      const strength = num(activeFvg.strength) ? activeFvg.strength : 1;
      const weighted = w.fvg * strength;
      score += weighted;
      result.zones.fvg = activeFvg;
      result.breakdown.fvg = { value: w.fvg, weighted: weighted, reason: 'FVG activo' };
      result.reasons.push('Precio en FVG.');
    } else {
      result.breakdown.fvg = { value: 0, weighted: 0, reason: 'Fuera de FVG' };
    }

    const activeOb = window.AT.smc.zones.findActiveZone(obs, currentPrice, direction);
    if (activeOb) {
      const strength = num(activeOb.strength) ? activeOb.strength : 1;
      const weighted = w.ob * strength;
      score += weighted;
      result.zones.ob = activeOb;
      result.breakdown.ob = { value: w.ob, weighted: weighted, reason: 'OB activo' };
      result.reasons.push('Precio en Order Block.');
    } else {
      result.breakdown.ob = { value: 0, weighted: 0, reason: 'Fuera de OB' };
    }

    const oteActive = ote && ote.direction === direction && ote.state === 'active';
    if (oteActive) {
      const dev = num(ote.deviation) ? Math.min(1, Math.abs(ote.deviation)) : 0;
      const proximity = 1 - dev;
      const weighted = w.ote * proximity;
      score += weighted;
      result.zones.ote = ote;
      result.breakdown.ote = {
        value: w.ote,
        weighted: weighted,
        reason: 'OTE activa (' + (proximity * 100).toFixed(0) + '%)'
      };
      result.reasons.push('Precio en OTE.');
    } else if (ote && ote.direction === direction && ote.state === 'pending') {
      const weighted = w.ote * 0.3;
      score += weighted;
      result.breakdown.ote = { value: w.ote, weighted: weighted, reason: 'OTE pendiente' };
    } else {
      result.breakdown.ote = { value: 0, weighted: 0, reason: 'Sin OTE' };
    }

    score = Math.max(0, Math.min(100, score));
    result.score = score;
    result.zonesActive = !!(result.zones.fvg || result.zones.ob || result.zones.ote);
    result.structureActive = mssMatches;

    result.activeComponents = ['mss', 'sweep', 'fvg', 'ob', 'ote'].filter(function (k) {
      const b = result.breakdown[k];
      return b && b.weighted > 0;
    }).length;

    return result;
  }

  function applyVetoesAndGrade(result) {
    const th = thresholds();
    const ctx = result.context || {};
    const marketOpen = ctx.marketOpen !== false;
    const sessionActive = ctx.sessionActive !== false;
    const confidence = num(ctx.confidence) ? ctx.confidence : 100;
    const minComp = minComponentsForMedium();

    let vetoed = false;

    if (!marketOpen) {
      result.vetoes.push('Mercado cerrado.');
      vetoed = true;
    }

    if (requireActiveSession() && !sessionActive) {
      result.vetoes.push('Fuera de sesión activa.');
      vetoed = true;
    }

    if (confidence < DEFAULT_MIN_CONFIDENCE) {
      result.vetoes.push('Confianza insuficiente (' + confidence.toFixed(0) + '%).');
      vetoed = true;
    }

    if (vetoed) {
      result.score = 0;
      result.breakdown = { vetoed: { value: 0, weighted: 0, reason: 'Score vetado' } };
      result.reasons = result.vetoes.map(function (v) { return '🚫 ' + v; });
      result.vetoed = true;
      result.grade = 'Débil';
      result.label = 'Sin confluencia suficiente';
      result.trend = 'Débil';
      return result;
    }

    let grade;
    if (result.score >= th.high) {
      if (requireZoneForHigh() && !result.zonesActive) {
        grade = 'Moderada';
        result.vetoes.push('Score alto sin zona: rebajado a Moderada.');
      } else if (result.activeComponents < minComp) {
        grade = 'Débil';
        result.vetoes.push('Score alto con ' + result.activeComponents + ' componente(s) < ' + minComp + '.');
      } else {
        grade = 'Alta';
      }
    } else if (result.score >= th.medium) {
      if (result.activeComponents < minComp) {
        grade = 'Débil';
        result.vetoes.push('Solo ' + result.activeComponents + ' componente(s) activo(s). Mínimo ' + minComp + ' para Moderada.');
      } else {
        grade = 'Moderada';
      }
    } else {
      grade = 'Débil';
    }

    if (grade === 'Alta') {
      result.label = 'ENTRADA DE ALTA PROBABILIDAD';
      result.trend = 'Fuerte';
    } else if (grade === 'Moderada') {
      result.label = 'Entrada Moderada';
      result.trend = 'Media';
    } else {
      result.label = 'Sin confluencia suficiente';
      result.trend = 'Débil';
    }

    result.vetoed = false;
    result.grade = grade;
    return result;
  }

  function evaluate(bars, direction, context) {
    context = context || {};
    direction = direction === 1 || direction === -1 ? direction : 0;

    if (!bars || bars.length < 50) {
      return emptyResult(direction, 'Historial insuficiente para analizar.', context);
    }

    const atr = computeAtr(bars);
    if (!(atr > 0)) {
      return emptyResult(direction, 'Volatilidad (ATR) no disponible.', context);
    }

    const structureModule = window.AT.smc.structure;
    const liquidity = window.AT.smc.liquidity;
    const zones = window.AT.smc.zones;
    const oteModule = window.AT.smc.ote;

    if (!structureModule || !liquidity || !zones || !oteModule) {
      return emptyResult(direction, 'Módulos SMC no disponibles.', context);
    }

    const pivots = structureModule.findPivots(bars);
    const structure = {
      pivots: pivots,
      mss: structureModule.detectMSS(bars, pivots)
    };

    const sweeps = liquidity.detectSweeps(bars, pivots, atr, { allowBidirectional: true });
    const obs = zones.detectOrderBlocks(bars, atr, null);
    const fvgs = zones.detectFVG(bars, atr, null);
    const ote = direction !== 0
      ? oteModule.calculateOTE(bars, pivots, direction, atr)
      : null;

    const w = weights();

    if (direction === 1 || direction === -1) {
      const res = evaluateDirection(bars, direction, context, atr, structure, sweeps, obs, fvgs, ote, w);
      return applyVetoesAndGrade(res);
    }

    const oteLong = oteModule.calculateOTE(bars, pivots, 1, atr);
    const oteShort = oteModule.calculateOTE(bars, pivots, -1, atr);

    const resLong = evaluateDirection(bars, 1, context, atr, structure, sweeps, obs, fvgs, oteLong, w);
    const resShort = evaluateDirection(bars, -1, context, atr, structure, sweeps, obs, fvgs, oteShort, w);

    let winner;
    if (resLong.score > resShort.score) winner = resLong;
    else if (resShort.score > resLong.score) winner = resShort;
    else return emptyResult(0, 'Evaluación bidireccional sin ventaja.', context);

    return applyVetoesAndGrade(winner);
  }

  return {
    evaluate: evaluate
  };
})(window.AT.indicators);