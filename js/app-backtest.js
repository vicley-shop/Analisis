(function () {
  'use strict';
  const AT = window.AT, App = AT.app, B = AT.backtest, ST = AT.strategies, D = AT.data;
  const state = App.state;
  const $ = function (id) { return document.getElementById(id); };
  let seq = 0;
  let walkSeq = 0;
  let mcSeq = 0;

  function pct(x) { return (x * 100).toFixed(0) + '%'; }
  function pf(x) { return !isFinite(x) ? '∞' : x.toFixed(2); }
  function cls(x) { return x > 0 ? 'buy' : x < 0 ? 'sell' : ''; }
  function usd(x) { return (x < 0 ? '-$' : '+$') + Math.abs(x).toFixed(2); }

  const BADGE = {
    edge: 'Ventaja robusta',
    marginal: 'Marginal',
    none: 'Sin ventaja',
    small: 'Muestra pequeña'
  };

  function equitySvg(eqUsd) {
    const n = eqUsd.length - 1;
    if (n < 1) return '';
    let lo = Math.min.apply(null, eqUsd), hi = Math.max.apply(null, eqUsd);
    if (hi === lo) { hi += 1; lo -= 1; }
    const X = function (i) { return (i / n * 100).toFixed(2); };
    const Y = function (v) { return (38 - (v - lo) / (hi - lo) * 36).toFixed(2); };
    const pts = eqUsd.map(function (v, i) { return X(i) + ',' + Y(v); }).join(' ');
    return '<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Curva de balance en USD">' +
      '<line class="eq0" x1="0" x2="100" y1="' + Y(eqUsd[0]) + '" y2="' + Y(eqUsd[0]) + '"/>' +
      '<polyline class="eq" points="' + pts + '"/></svg>';
  }

  function card(sym, r) {
    const f = r.full, o = r.oos, st = ST.byId[r.id];
    const m = function (k, v) { return '<div><span>' + k + '</span><b>' + v + '</b></div>'; };
    const last = r.trades.slice(-8).reverse().map(function (t) {
      return '<tr><td>' + App.fmtDate(t.t) + '</td>' +
        '<td>' + (t.dir === 1 ? 'Compra' : 'Venta') + '</td>' +
        '<td class="r">' + App.fmt(sym, t.entry) + '</td>' +
        '<td class="r">' + App.fmt(sym, t.exit) + '</td>' +
        '<td>' + t.reason + '</td>' +
        '<td class="r ' + (t.r > 0 ? 'buy' : 'sell') + '">' + App.sgn(t.r, 2) + '</td></tr>';
    }).join('');
    return '<div class="bt-card">' +
      '<div class="bt-head">' +
        '<div><div class="bt-name">' + App.esc(r.name) + '</div>' +
        '<div class="muted small">' + App.esc(st.desc) + '</div></div>' +
        '<span class="badge ' + r.verdict.key + '">' + BADGE[r.verdict.key] + '</span>' +
      '</div>' +
      '<div class="metrics">' +
        m('Operaciones', f.n) +
        m('Acierto', f.n ? pct(f.winRate) : '—') +
        m('Factor beneficio', f.n ? pf(f.pf) : '—') +
        m('Esperanza', f.n ? App.sgn(f.expectancy, 2) + ' R' : '—') +
        m('Neto', App.sgn(f.netR, 1) + ' R') +
        m('Caída máx.', f.maxDD.toFixed(1) + ' R') +
        m('Retorno USD', usd(f.netUsd)) +
        m('Retorno %', f.returnPct.toFixed(1) + '%') +
      '</div>' +
      '<div class="metrics" style="margin-top:4px">' +
        m('Balance final', '$' + f.balanceEnd.toFixed(0)) +
        m('Últ. 30% · ops', o.n) +
        m('Últ. 30% · F.B.', o.n ? pf(o.pf) : '—') +
        m('Últ. 30% · esp.', o.n ? App.sgn(o.expectancy, 2) + ' R' : '—') +
      '</div>' +
      '<div class="muted small" style="margin-top:6px">' + App.esc(r.verdict.text) + '</div>' +
      '<details><summary>Curva y últimas operaciones</summary>' +
        equitySvg(f.equityUsd) +
        '<div class="muted small">Stop ' + r.opts.slMult + '×ATR · objetivo ' + r.opts.tpMult +
        '×ATR · máximo ' + r.opts.maxBars + ' velas · breakeven ' + (r.opts.breakeven ? 'sí' : 'no') + '</div>' +
        '<div class="scroll-x"><table class="tbl"><thead><tr><th>Entrada</th><th>Tipo</th><th class="r">Precio</th><th class="r">Salida</th><th>Motivo</th><th class="r">R</th></tr></thead><tbody>' +
        last + '</tbody></table></div>' +
      '</details></div>';
  }

  App.runBacktest = function () {
    const sym = state.symbol, tf = state.tf, my = ++seq, info = $('btInfo');
    info.textContent = 'Cargando ' + sym + ' ' + tf + '…';
    $('btCards').innerHTML = '';
    $('btWalkCard').hidden = true;
    $('btMCCard').hidden = true;
    return App.hist(sym, tf).then(function (bars) {
      if (my !== seq) return;
      if (bars.length < 260) {
        info.textContent = 'Hay solo ' + bars.length + ' velas; hacen falta al menos 260 para probar con filtro de 200 periodos.';
        return;
      }
      const spread = state.settings.spread[sym];
      const slip = B.SYMBOLS[sym] ? B.SYMBOLS[sym].slippage : 0;
      const res = B.runAll(bars, {
        spread: spread,
        slippage: slip,
        slMult: state.settings.sl,
        tpMult: state.settings.tp,
        balance: state.settings.balance,
        riskPct: state.settings.riskPct,
        breakeven: !!state.settings.trailing,
        sessionFilter: !!state.settings.sessionFilter,
        sessionStart: (window.AT_CONFIG.sessions || {}).combined ? window.AT_CONFIG.sessions.combined.startGmt : 7,
        sessionEnd: (window.AT_CONFIG.sessions || {}).combined ? window.AT_CONFIG.sessions.combined.endGmt : 21,
        adxFilter: !!state.settings.adxFilter
      });
      const rank = function (r) {
        return (r.verdict.key === 'small' ? -1000 : 0) + r.full.expectancy;
      };
      res.sort(function (a, b) { return rank(b) - rank(a); });
      const d = function (t) {
        return new Date(t).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
      };
      info.textContent = sym + ' · ' + tf + ' · ' + bars.length + ' velas cerradas (' +
        d(bars[0].t) + ' → ' + d(bars[bars.length - 1].t) + ') · spread ' + App.fmt(sym, spread) +
        ' · slippage ' + App.fmt(sym, slip) + ' · balance $' + state.settings.balance +
        ' · riesgo ' + state.settings.riskPct + '%.';
      $('btCards').innerHTML = res.map(function (r) { return card(sym, r); }).join('');
    }, function (e) {
      if (my !== seq) return;
      if (D.isMissing(e)) {
        App.markMissing(sym);
        info.textContent = sym + ' no tiene datos en biquote.io con el nombre «' + D.feedName(sym) + '» (mira Ajustes → Datos).';
      } else {
        info.textContent = 'No se pudo cargar el historial (' + ((e && e.message) || 'error') + ').';
      }
    });
  };

  App.runWalkForward = function () {
    const sym = state.symbol, tf = state.tf, my = ++walkSeq;
    const cardEl = $('btWalkCard'), tbl = $('btWalkTable'), btn = $('btWalk');
    btn.disabled = true;
    btn.textContent = 'Calculando…';
    cardEl.hidden = false;
    tbl.innerHTML = '<tbody><tr><td class="muted">Cargando historial…</td></tr></tbody>';
    return App.hist(sym, tf).then(function (bars) {
      if (my !== walkSeq) return;
      if (bars.length < 400) {
        tbl.innerHTML = '<tbody><tr><td class="muted">Necesitas al menos 400 velas para walk-forward con 4 ventanas.</td></tr></tbody>';
        return;
      }
      const spread = state.settings.spread[sym];
      const slip = B.SYMBOLS[sym] ? B.SYMBOLS[sym].slippage : 0;
      const baseOpts = {
        spread: spread,
        slippage: slip,
        slMult: state.settings.sl,
        tpMult: state.settings.tp,
        balance: state.settings.balance,
        riskPct: state.settings.riskPct,
        breakeven: !!state.settings.trailing,
        sessionFilter: !!state.settings.sessionFilter,
        sessionStart: 7,
        sessionEnd: 21,
        adxFilter: !!state.settings.adxFilter
      };

      let html = '<thead><tr><th>Estrategia</th><th class="r">Consistencia</th>' +
        '<th class="r">F1</th><th class="r">F2</th><th class="r">F3</th><th class="r">F4</th>' +
        '<th class="r">Veredicto</th></tr></thead><tbody>';

      ST.list.forEach(function (s) {
        const wf = B.walkForward(bars, s.id, baseOpts);
        const foldCells = wf.folds.map(function (f) {
          const c = f.expectancy > 0.05 && f.n >= 10 ? 'buy' : f.expectancy < 0 ? 'sell' : '';
          return '<td class="r ' + c + '">' + App.sgn(f.expectancy, 2) + '<small> n' + f.n + '</small></td>';
        }).join('');
        const totalCells = 4;
        let emptyCells = '';
        for (let i = wf.folds.length; i < totalCells; i++) emptyCells += '<td class="r muted">—</td>';
        const pass = wf.passed;
        const badge = pass
          ? '<span class="badge edge">Apto</span>'
          : wf.consistency >= 0.5
            ? '<span class="badge marginal">Débil</span>'
            : '<span class="badge none">No</span>';
        html += '<tr><td style="text-align:left">' + App.esc(s.name.split(' (')[0]) + '</td>' +
          '<td class="r">' + (wf.consistency * 100).toFixed(0) + '%</td>' +
          foldCells + emptyCells +
          '<td class="r">' + badge + '</td></tr>';
      });

      tbl.innerHTML = html + '</tbody>';
    }, function () {
      if (my !== walkSeq) return;
      tbl.innerHTML = '<tbody><tr><td class="muted">No se pudo cargar el historial.</td></tr></tbody>';
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Walk-forward';
    });
  };

  App.runMonteCarlo = function () {
    const sym = state.symbol, tf = state.tf, my = ++mcSeq;
    const cardEl = $('btMCCard'), out = $('btMCOut'), btn = $('btMC');
    btn.disabled = true;
    btn.textContent = 'Calculando…';
    cardEl.hidden = false;
    out.innerHTML = '<div class="muted small" style="grid-column:1/-1">Cargando historial y trades…</div>';
    return App.hist(sym, tf).then(function (bars) {
      if (my !== mcSeq) return;
      if (bars.length < 260) {
        out.innerHTML = '<div class="muted small" style="grid-column:1/-1">Necesitas al menos 260 velas.</div>';
        return;
      }
      const spread = state.settings.spread[sym];
      const slip = B.SYMBOLS[sym] ? B.SYMBOLS[sym].slippage : 0;
      const baseOpts = {
        spread: spread,
        slippage: slip,
        slMult: state.settings.sl,
        tpMult: state.settings.tp,
        balance: state.settings.balance,
        riskPct: state.settings.riskPct,
        breakeven: !!state.settings.trailing,
        sessionFilter: !!state.settings.sessionFilter,
        sessionStart: 7,
        sessionEnd: 21,
        adxFilter: !!state.settings.adxFilter
      };

      const allTrades = [];
      ST.list.forEach(function (s) {
        const r = B.run(bars, s.id, baseOpts);
        r.trades.forEach(function (t) { allTrades.push({ r: t.r, strat: s.id }); });
      });

      if (allTrades.length < 30) {
        out.innerHTML = '<div class="muted small" style="grid-column:1/-1">No hay suficientes trades (' +
          allTrades.length + ') para Monte Carlo. Prueba otra estrategia o temporalidad.</div>';
        return;
      }

      const mc = B.monteCarlo(allTrades, {
        runs: 1000,
        ruinPct: 20,
        balance: state.settings.balance,
        riskPct: state.settings.riskPct
      });

      const cell = function (k, v, c) {
        return '<div><span>' + k + '</span><b class="' + (c || '') + '">' + v + '</b></div>';
      };

      out.innerHTML =
        cell('Trades base', allTrades.length) +
        cell('Mediana (R)', App.sgn(mc.median, 1), cls(mc.median)) +
        cell('Peor 5% (R)', App.sgn(mc.p5, 1), cls(mc.p5)) +
        cell('Mejor 95% (R)', App.sgn(mc.p95, 1), cls(mc.p95)) +
        cell('Prob. negativo', (mc.probNegative * 100).toFixed(0) + '%', mc.probNegative > 0.4 ? 'sell' : 'buy') +
        cell('Prob. ruina (>20%)', (mc.probRuin * 100).toFixed(1) + '%', mc.probRuin > 0.1 ? 'sell' : 'buy') +
        cell('Caída máx. mediana', mc.maxDDMedian.toFixed(1) + ' R', 'sell') +
        cell('Caída máx. peor', mc.maxDDWorst.toFixed(1) + ' R', 'sell');
    }, function () {
      if (my !== mcSeq) return;
      out.innerHTML = '<div class="muted small" style="grid-column:1/-1">No se pudo cargar el historial.</div>';
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Monte Carlo';
    });
  };

  App.runSweep = function () {
    const sym = state.symbol, btn = $('btSweepBtn');
    btn.disabled = true;
    btn.textContent = 'Calculando…';
    const tasks = D.TF_LIST.map(function (tf) {
      return function () { return App.hist(sym, tf); };
    });
    return D.pool(tasks, 3).then(function (results) {
      const cells = {};
      ST.list.forEach(function (s) { cells[s.id] = {}; });
      const spread = state.settings.spread[sym];
      const slip = B.SYMBOLS[sym] ? B.SYMBOLS[sym].slippage : 0;
      const baseOpts = {
        spread: spread,
        slippage: slip,
        slMult: state.settings.sl,
        tpMult: state.settings.tp,
        balance: state.settings.balance,
        riskPct: state.settings.riskPct,
        breakeven: !!state.settings.trailing,
        sessionFilter: !!state.settings.sessionFilter,
        sessionStart: 7,
        sessionEnd: 21,
        adxFilter: !!state.settings.adxFilter
      };
      results.forEach(function (r, i) {
        if (!r.ok || r.v.length < 260) return;
        B.runAll(r.v, baseOpts).forEach(function (x) {
          cells[x.id][D.TF_LIST[i]] = {
            e: x.full.expectancy,
            n: x.full.n,
            oe: x.oos.expectancy,
            on: x.oos.n
          };
        });
      });
      let html = '<thead><tr><th>' + sym + '</th>' +
        D.TF_LIST.map(function (tf) { return '<th>' + tf + '</th>'; }).join('') + '</tr></thead><tbody>';
      ST.list.forEach(function (s) {
        html += '<tr><td style="text-align:left">' + App.esc(s.name.split(' (')[0]) + '</td>';
        D.TF_LIST.forEach(function (tf) {
          const c = cells[s.id][tf];
          if (!c) { html += '<td>—</td>'; return; }
          const strong = c.n >= 100 && c.on >= 30;
          const cls2 = !strong ? 'zero' :
            (c.e >= 0.15 && c.oe >= 0.1 ? 'pos2' : c.e > 0 ? 'pos' : c.e < 0 ? 'neg' : 'zero');
          html += '<td class="' + cls2 + '"' + (!strong ? ' style="opacity:.6"' : '') + '>' +
            App.sgn(c.e, 2) +
            '<small>n' + c.n + (c.on >= 5 ? ' · 30% ' + App.sgn(c.oe, 2) : '') + '</small></td>';
        });
        html += '</tr>';
      });
      $('btSweep').innerHTML = html + '</tbody>';
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Calcular las 7 temporalidades';
    }, function () {
      btn.disabled = false;
      btn.textContent = 'Reintentar';
    });
  };

  App.wireBacktest = function () {
    $('btRun').addEventListener('click', function () {
      delete state.hist[state.symbol + '|' + state.tf];
      App.runBacktest();
    });
    $('btWalk').addEventListener('click', App.runWalkForward);
    $('btMC').addEventListener('click', App.runMonteCarlo);
    $('btSweepBtn').addEventListener('click', App.runSweep);
  };
})();