(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./strategies.js'));
  else { root.AT = root.AT || {}; root.AT.backtest = factory(root.AT.strategies); }
}(typeof self !== 'undefined' ? self : this, function (ST) {
  'use strict';

  const SYMBOLS = (typeof window !== 'undefined' && window.AT_CONFIG && window.AT_CONFIG.symbols) || {
    XAUUSD: { name: 'Oro', digits: 2, contract: 100, spread: 0.30, slippage: 0.05, family: 'metals', bestTf: '1h', defaultSl: 1.5, defaultTp: 2.5 },
    XAGUSD: { name: 'Plata', digits: 3, contract: 5000, spread: 0.03, slippage: 0.005, family: 'metals', bestTf: '4h', defaultSl: 1.5, defaultTp: 2.0 },
    EURUSD: { name: 'Euro / Dólar', digits: 5, contract: 100000, spread: 0.00010, slippage: 0.00002, family: 'forex', bestTf: '1h', defaultSl: 1.5, defaultTp: 1.5 },
    BTCUSD: { name: 'Bitcoin', digits: 2, contract: 1, spread: 0.60, slippage: 0.10, family: 'crypto', bestTf: '4h', defaultSl: 2.0, defaultTp: 3.0 }
  };

  const CFG = (typeof window !== 'undefined' && window.AT_CONFIG) || {};
  const BT = CFG.backtest || {};
  const RISK = CFG.risk || {};

  const DEFAULTS = {
    maxBars: 100,
    exitOnOpposite: true,
    oosFrac: 0.3,
    spread: 0,
    slippage: 0,
    breakeven: false,
    balance: RISK.defaultBalance || 10000,
    riskPct: RISK.defaultRiskPct || 1
  };

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

    trades.forEach(function (t) {
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
      equityUsd: equityUsd
    };
  }

  function verdict(full, oos) {
    if (full.n < 100) return { key: 'small', text: 'Muestra pequeña (n < 100): no concluyente.' };
    if (full.pf < 1.4 || full.expectancy < 0.15) return { key: 'none', text: 'Sin ventaja estadística (PF < 1,4 o esperanza < 0,15R).' };
    if (oos.n < 30) return { key: 'marginal', text: 'Ventaja en el total, pero OOS con muestra pequeña (n < 30).' };
    if (oos.pf < 1.2 || oos.expectancy < 0.05) return { key: 'marginal', text: 'Ventaja débil o no repetida en el último 30%.' };
    return { key: 'edge', text: 'Ventaja robusta (full + OOS). Probar en demo antes de arriesgar.' };
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
    return {
      id: id,
      name: st.name,
      type: st.type,
      trades: trades,
      full: full,
      oos: oos,
      verdict: verdict(full, oos),
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
    const ind = ST.prepare(bars, opts);
    return ST.list.map(function (s) { return run(bars, s.id, Object.assign({}, opts, { ind: ind })); });
  }

  function walkForward(bars, id, opts) {
    opts = opts || {};
    const folds = opts.folds || BT.walkForwardWindows || 4;
    const n = bars.length;
    const segLen = Math.floor(n / (folds + 1));
    if (segLen < 60) return { folds: [], consistency: 0, passed: false };

    const results = [];
    for (let f = 1; f <= folds; f++) {
      const from = f * segLen;
      const to = Math.min((f + 1) * segLen, n);
      const seg = bars.slice(from, to);
      if (seg.length < 60) continue;
      const r = run(seg, id, Object.assign({}, opts, { oosFrac: 0.3 }));
      results.push({
        fold: f,
        from: seg[0].t,
        to: seg[seg.length - 1].t,
        n: r.full.n,
        expectancy: r.full.expectancy,
        pf: r.full.pf,
        winRate: r.full.winRate,
        netR: r.full.netR,
        returnPct: r.full.returnPct
      });
    }
    const positives = results.filter(function (x) { return x.n >= 10 && x.expectancy > 0.05; }).length;
    const consistency = results.length ? positives / results.length : 0;
    return {
      folds: results,
      consistency: consistency,
      passed: results.length >= 3 && consistency >= 0.75
    };
  }

  function monteCarlo(trades, opts) {
    opts = opts || {};
    const runs = opts.runs || BT.monteCarloRuns || 1000;
    const ruinPct = opts.ruinPct || BT.ruinThresholdPct || 20;
    const rs = trades.map(function (t) { return t.r; });
    const n = rs.length;
    if (n < 30) return null;

    const totals = new Array(runs);
    const dds = new Array(runs);
    let ruinCount = 0;
    const startBalance = opts.balance || DEFAULTS.balance;
    const rp = opts.riskPct || DEFAULTS.riskPct;

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
      maxDDWorst: sortedD[runs - 1],
      probNegative: totals.filter(function (x) { return x < 0; }).length / runs,
      probRuin: ruinCount / runs
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