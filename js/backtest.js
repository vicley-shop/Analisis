(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./strategies.js'), require('./config.js'));
  else { root.AT = root.AT || {}; root.AT.backtest = factory(root.AT.strategies, root.AT_CONFIG); }
}(typeof self !== 'undefined' ? self : this, function (ST, CFG) {
  'use strict';

  CFG = CFG || {};
  const BT_CFG = CFG.backtest || {};
  const RISK_CFG = CFG.risk || {};

  const SYMBOLS = (CFG && CFG.symbols) || {
    XAUUSD: { name: 'Oro', digits: 2, contract: 100, spread: 0.30, slippage: 0.05, family: 'metals', bestTf: '1h', defaultSl: 1.5, defaultTp: 2.5 },
    XAGUSD: { name: 'Plata', digits: 3, contract: 5000, spread: 0.03, slippage: 0.005, family: 'metals', bestTf: '4h', defaultSl: 1.5, defaultTp: 2.0 },
    EURUSD: { name: 'Euro / Dólar', digits: 5, contract: 100000, spread: 0.00010, slippage: 0.00002, family: 'forex', bestTf: '1h', defaultSl: 1.5, defaultTp: 1.5 },
    BTCUSD: { name: 'Bitcoin', digits: 2, contract: 1, spread: 0.60, slippage: 0.10, family: 'crypto', bestTf: '4h', defaultSl: 2.0, defaultTp: 3.0 }
  };

  const DEFAULTS = {
    maxBars: 100,
    exitOnOpposite: true,
    oosFrac: BT_CFG.oosFrac || 0.30,
    spread: 0,
    slippage: 0,
    breakeven: false,
    balance: RISK_CFG.defaultBalance || 10000,
    riskPct: RISK_CFG.defaultRiskPct || 1,
    strategyCount: BT_CFG.strategyCount || 9
  };

  const EULER = 0.5772156649015329;

  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const plow = 0.02425, phigh = 1 - plow;
    let q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > phigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function normCdf(z) {
    if (!isFinite(z)) return z > 0 ? 1 : 0;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }

  function std(a) {
    if (a.length < 2) return 0;
    const m = mean(a), s = a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0);
    return Math.sqrt(s / (a.length - 1));
  }

  function skewness(a) {
    const n = a.length, m = mean(a), s = std(a);
    if (n < 3 || s === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.pow((a[i] - m) / s, 3);
    return n / ((n - 1) * (n - 2)) * sum;
  }

  function kurtosis(a) {
    const n = a.length, m = mean(a), s = std(a);
    if (n < 4 || s === 0) return 3;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.pow((a[i] - m) / s, 4);
    return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * sum - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
  }

  function sharpe(rs) {
    const s = std(rs);
    return s > 0 ? mean(rs) / s : 0;
  }

  function expectedMaxSharpe(sigmaSR, N) {
    if (N < 2) return 0;
    return sigmaSR * ((1 - EULER) * normInv(1 - 1 / N) + EULER * normInv(1 - 1 / (N * Math.E)));
  }

  function deflatedSharpe(sr, T, skew, kurt, sigmaSR, N) {
    if (T < 5 || !isFinite(sr)) return { value: 0, pValue: 1 };
    const srStar = expectedMaxSharpe(sigmaSR, N);
    const denom = Math.sqrt(1 - skew * sr + (kurt - 1) / 4 * sr * sr);
    if (denom <= 0) return { value: 0, pValue: 1 };
    const z = (sr - srStar) * Math.sqrt(T - 1) / denom;
    return { value: normCdf(z), pValue: 1 - normCdf(z) };
  }

  function simulate(ind, sig, o) {
    const k = ind.k, n = k.n, atr = ind.atr, trades = [];
    let pos = null;

    function close(i, price, reason) {
      const slip = o.slippage || 0;
      const fill = pos.dir === 1 ? price - slip : price + slip;
      const pnl = pos.dir * (fill - pos.entry) - (o.spread || 0);
      trades.push({
        dir: pos.dir,
        entryIdx: pos.entryIdx,
        exitIdx: i,
        t: pos.t,
        tExit: k.t[i],
        entry: pos.entry,
        exit: fill,
        sl: pos.sl,
        tp: pos.tp,
        pnl: pnl,
        r: pos.risk > 0 ? pnl / pos.risk : 0,
        reason: reason
      });
      pos = null;
    }

    for (let i = 1; i < n; i++) {
      if (!pos && sig[i - 1] !== 0 && atr[i - 1] != null && atr[i - 1] > 0) {
        const dir = sig[i - 1];
        const risk = o.slMult * atr[i - 1];
        const rawEntry = k.o[i];
        const slipEntry = dir === 1 ? rawEntry + (o.slippage || 0) : rawEntry - (o.slippage || 0);
        pos = {
          dir: dir,
          entryIdx: i,
          t: k.t[i],
          entry: slipEntry,
          risk: risk,
          rawEntry: rawEntry,
          sl: rawEntry - dir * risk,
          tp: rawEntry + dir * o.tpMult * atr[i - 1]
        };
      }
      if (!pos) continue;

      const gap = i > pos.entryIdx;

      if (o.breakeven && pos.dir === 1 && k.h[i] >= pos.entry + pos.risk && pos.sl < pos.entry) {
        pos.sl = pos.entry;
      } else if (o.breakeven && pos.dir === -1 && k.l[i] <= pos.entry - pos.risk && pos.sl > pos.entry) {
        pos.sl = pos.entry;
      }

      if (pos.dir === 1) {
        if (gap && k.o[i] <= pos.sl) { close(i, k.o[i], 'sl'); continue; }
        if (gap && k.o[i] >= pos.tp) { close(i, k.o[i], 'tp'); continue; }
        if (k.l[i] <= pos.sl) { close(i, pos.sl, 'sl'); continue; }
        if (k.h[i] >= pos.tp) { close(i, pos.tp, 'tp'); continue; }
      } else {
        if (gap && k.o[i] >= pos.sl) { close(i, k.o[i], 'sl'); continue; }
        if (gap && k.o[i] <= pos.tp) { close(i, k.o[i], 'tp'); continue; }
        if (k.h[i] >= pos.sl) { close(i, pos.sl, 'sl'); continue; }
        if (k.l[i] <= pos.tp) { close(i, pos.tp, 'tp'); continue; }
      }

      if (o.exitOnOpposite && sig[i] === -pos.dir) close(i, k.c[i], 'opuesta');
      else if (i - pos.entryIdx + 1 >= o.maxBars) close(i, k.c[i], 'tiempo');
    }

    return trades;
  }

  function stats(trades, balance, riskPct) {
    const n = trades.length;
    const startBalance = balance || DEFAULTS.balance;
    const rp = riskPct || DEFAULTS.riskPct;
    let wins = 0, gw = 0, gl = 0, sumR = 0, eq = 0, peak = 0, maxDD = 0, pnlSum = 0;
    let balanceNow = startBalance, peakBal = startBalance, maxDDBal = 0;
    const equity = [0];
    const equityUsd = [startBalance];
    const rs = [];

    trades.forEach(function (t) {
      rs.push(t.r);
      if (t.r > 0) { wins++; gw += t.r; } else gl += -t.r;
      sumR += t.r;
      eq += t.r;
      equity.push(eq);
      if (eq > peak) peak = eq;
      if (peak - eq > maxDD) maxDD = peak - eq;

      const riskUsd = balanceNow * rp / 100;
      const pnlUsd = t.r * riskUsd;
      balanceNow += pnlUsd;
      pnlSum += pnlUsd;
      equityUsd.push(balanceNow);
      if (balanceNow > peakBal) peakBal = balanceNow;
      const dd = (peakBal - balanceNow) / peakBal * 100;
      if (dd > maxDDBal) maxDDBal = dd;
    });

    return {
      n: n,
      wins: wins,
      winRate: n ? wins / n : 0,
      pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      expectancy: n ? sumR / n : 0,
      netR: sumR,
      maxDD: maxDD,
      avgWin: wins ? gw / wins : 0,
      avgLoss: (n - wins) ? gl / (n - wins) : 0,
      equity: equity,
      balanceStart: startBalance,
      balanceEnd: balanceNow,
      netUsd: pnlSum,
      returnPct: startBalance > 0 ? (balanceNow - startBalance) / startBalance * 100 : 0,
      maxDDBalPct: maxDDBal,
      equityUsd: equityUsd,
      sharpe: sharpe(rs),
      skew: skewness(rs),
      kurt: kurtosis(rs)
    };
  }

  function verdict(full, oos, dsr, cfg) {
    const C = cfg || BT_CFG;
    const minN = C.minTradesEdge || 100;
    const minPf = C.minPfEdge || 1.4;
    const minExp = C.minExpectancyEdge || 0.15;
    const minOosN = C.minTradesOos || 30;
    const minOosPf = C.minPfOos || 1.2;
    const minOosExp = C.minExpectancyOos || 0.05;
    const minDsr = 0.95;

    if (full.n < minN) return { key: 'small', text: 'Muestra pequeña (n < ' + minN + '): no concluyente.' };
    if (dsr < minDsr) return { key: 'none', text: 'Deflated Sharpe < ' + minDsr + ': no sobrevive al ajuste por comparaciones múltiples.' };
    if (full.pf < minPf || full.expectancy < minExp) return { key: 'none', text: 'Sin ventaja estadística tras deflactar (PF < ' + minPf + ' o esperanza < ' + minExp + 'R).' };
    if (oos.n < minOosN) return { key: 'marginal', text: 'Ventaja en el total, pero OOS con muestra pequeña (n < ' + minOosN + ').' };
    if (oos.pf < minOosPf || oos.expectancy < minOosExp) return { key: 'marginal', text: 'Ventaja débil o no repetida en el último 30%.' };
    return { key: 'edge', text: 'Ventaja robusta (DSR ≥ ' + minDsr + ', full + OOS). Probar en demo antes de arriesgar.' };
  }

  function run(bars, id, opts) {
    opts = opts || {};
    const st = ST.byId[id];
    if (!st) throw new Error('Estrategia desconocida: ' + id);
    const ind = opts.ind || ST.prepare(bars, opts);
    const o = Object.assign({}, DEFAULTS, opts);
    o.slMult = opts.slMult || st.sl;
    o.tpMult = opts.tpMult || st.tp;
    const sig = st.run(ind);
    const trades = simulate(ind, sig, o);
    const split = Math.floor(ind.k.n * (1 - o.oosFrac));
    const full = stats(trades, o.balance, o.riskPct);
    const oos = stats(trades.filter(function (t) { return t.entryIdx >= split; }), o.balance, o.riskPct);

    const sigmaSR = opts.sigmaSR != null ? opts.sigmaSR : 0.5;
    const N = o.strategyCount || DEFAULTS.strategyCount;
    const dsr = deflatedSharpe(full.sharpe, full.n, full.skew, full.kurt, sigmaSR, N);

    return {
      id: id,
      name: st.name,
      type: st.type,
      trades: trades,
      full: full,
      oos: oos,
      dsr: dsr.value,
      dsrP: dsr.pValue,
      verdict: verdict(full, oos, dsr.value, BT_CFG),
      opts: {
        slMult: o.slMult, tpMult: o.tpMult,
        spread: o.spread, slippage: o.slippage,
        maxBars: o.maxBars, breakeven: o.breakeven
      },
      splitIdx: split,
      sig: sig
    };
  }

  function runAll(bars, opts) {
    opts = opts || {};
    const ind = ST.prepare(bars, opts);
    const first = ST.list.map(function (s) { return run(bars, s.id, Object.assign({}, opts, { ind: ind, sigmaSR: 0.5 })); });
    const sh = first.map(function (r) { return r.full.sharpe; }).filter(isFinite);
    const sigmaSR = sh.length > 1 ? std(sh) : 0.5;
    return first.map(function (r) {
      const dsr = deflatedSharpe(r.full.sharpe, r.full.n, r.full.skew, r.full.kurt, sigmaSR, first.length);
      return Object.assign({}, r, {
        dsr: dsr.value,
        dsrP: dsr.pValue,
        verdict: verdict(r.full, r.oos, dsr.value, BT_CFG)
      });
    });
  }

  function walkForward(bars, id, opts) {
    opts = opts || {};
    const folds = opts.folds || BT_CFG.walkForwardWindows || 4;
    const n = bars.length;
    const segLen = Math.floor(n / (folds + 1));
    if (segLen < 60) return { folds: [], consistency: 0, passed: false };

    const results = [];
    for (let f = 1; f <= folds; f++) {
      const from = f * segLen;
      const to = Math.min((f + 1) * segLen, n);
      const seg = bars.slice(from, to);
      if (seg.length < 60) continue;
      const r = run(seg, id, Object.assign({}, opts, { oosFrac: 0.3, sigmaSR: 0.5 }));
      results.push({
        fold: f,
        from: seg[0].t,
        to: seg[seg.length - 1].t,
        n: r.full.n,
        expectancy: r.full.expectancy,
        pf: r.full.pf,
        winRate: r.full.winRate,
        netR: r.full.netR,
        returnPct: r.full.returnPct,
        dsr: r.dsr
      });
    }
    const positives = results.filter(function (x) { return x.n >= 10 && x.expectancy > 0.05 && x.dsr >= 0.95; }).length;
    const consistency = results.length ? positives / results.length : 0;
    return {
      folds: results,
      consistency: consistency,
      passed: results.length >= 3 && consistency >= 0.75
    };
  }

  function monteCarlo(trades, opts) {
    opts = opts || {};
    const runs = opts.runs || BT_CFG.monteCarloRuns || 1000;
    const ruinPct = opts.ruinPct || BT_CFG.ruinThresholdPct || 20;
    const rs = trades.map(function (t) { return t.r; });
    const n = rs.length;
    if (n < 30) return null;

    const totals = new Array(runs);
    const dds = new Array(runs);
    let ruinCount = 0;
    const startBalance = opts.balance || DEFAULTS.balance;
    const rp = opts.riskPct || DEFAULTS.riskPct;
    const observedMean = mean(rs);
    let permCount = 0;

    for (let k = 0; k < runs; k++) {
      let totalR = 0;
      let eq = 0, peak = 0, maxDD = 0;
      let bal = startBalance;
      for (let i = 0; i < n; i++) {
        const r = rs[Math.floor(Math.random() * n)];
        totalR += r;
        eq += r;
        if (eq > peak) peak = eq;
        if (peak - eq > maxDD) maxDD = peak - eq;
        bal += r * (bal * rp / 100);
        if (bal < startBalance * (1 - ruinPct / 100)) { ruinCount++; bal = -Infinity; }
      }
      totals[k] = totalR;
      dds[k] = maxDD;

      let permTotal = 0;
      for (let i = 0; i < n; i++) permTotal += rs[i] * (Math.random() < 0.5 ? 1 : -1);
      if (permTotal / n >= observedMean) permCount++;
    }

    const sortedT = totals.slice().sort(function (a, b) { return a - b; });
    const sortedD = dds.slice().sort(function (a, b) { return a - b; });

    return {
      runs: runs,
      median: sortedT[Math.floor(runs * 0.5)],
      p5: sortedT[Math.floor(runs * 0.05)],
      p95: sortedT[Math.floor(runs * 0.95)],
      worst: sortedT[0],
      best: sortedT[runs - 1],
      maxDDMedian: sortedD[Math.floor(runs * 0.5)],
      maxDDp5: sortedD[Math.floor(runs * 0.05)],
      maxDDWorst: sortedD[runs - 1],
      probNegative: totals.filter(function (x) { return x < 0; }).length / runs,
      probRuin: ruinCount / runs,
      permP: (permCount + 1) / (runs + 1)
    };
  }

  function plan(dir, price, atr, o) {
    o = o || {};
    const slMult = o.slMult || 1.5;
    const tpMult = o.tpMult || 2.5;
    const risk = slMult * atr;
    const reward = tpMult * atr;
    const balance = o.balance || DEFAULTS.balance;
    const riskPct = o.riskPct || DEFAULTS.riskPct;
    const riskUsd = balance * riskPct / 100;
    const contract = o.contract || 1;
    const lots = contract > 0 && risk > 0 ? Math.floor(riskUsd / (risk * contract) * 100) / 100 : 0;
    return {
      dir: dir,
      entry: price,
      sl: price - dir * risk,
      tp: price + dir * reward,
      risk: risk,
      reward: reward,
      rr: reward / risk,
      lots: lots,
      riskUsd: riskUsd,
      atr: atr
    };
  }

  return {
    SYMBOLS: SYMBOLS,
    deflatedSharpe: deflatedSharpe,
    simulate: simulate,
    stats: stats,
    verdict: verdict,
    run: run,
    runAll: runAll,
    walkForward: walkForward,
    monteCarlo: monteCarlo,
    plan: plan
  };
}));