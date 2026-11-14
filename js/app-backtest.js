(function () {
  'use strict';

  const AT = window.AT;
  const App = AT.app;
  const B = AT.backtest;
  const ST = AT.strategies;
  const D = AT.data;
  const state = App.state;

  const $ = function (id) {
    return document.getElementById(id);
  };

  let seq = 0;
  let walkSeq = 0;
  let mcSeq = 0;
  let sweepSeq = 0;

  const BADGE = {
    edge: 'Ventaja robusta',
    marginal: 'Marginal',
    none: 'Sin ventaja',
    small: 'Muestra pequeña'
  };

  function pct(x) {
    return (Number(x) * 100).toFixed(0) + '%';
  }

  function pf(x) {
    return !isFinite(Number(x)) ? '∞' : Number(x).toFixed(2);
  }

  function cls(x) {
    return x > 0 ? 'buy' : x < 0 ? 'sell' : '';
  }

  function usd(x) {
    x = Number(x) || 0;
    return (x < 0 ? '-$' : '+$') + Math.abs(x).toFixed(2);
  }

  function safeNumber(value, digits) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) : '—';
  }

  function setButton(button, disabled, label) {
    if (!button) return;
    button.disabled = !!disabled;
    if (label) button.textContent = label;
  }

  function errorText(error) {
    return error && error.message
      ? error.message
      : 'error desconocido';
  }

  function equitySvg(eqUsd) {
    if (!Array.isArray(eqUsd) || eqUsd.length < 2) return '';

    const values = eqUsd.map(Number).filter(Number.isFinite);
    if (values.length < 2) return '';

    let lo = Math.min.apply(null, values);
    let hi = Math.max.apply(null, values);

    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }

    const n = eqUsd.length - 1;

    const X = function (i) {
      return (i / n * 100).toFixed(2);
    };

    const Y = function (v) {
      return (38 - (Number(v) - lo) / (hi - lo) * 36).toFixed(2);
    };

    const pts = eqUsd.map(function (v, i) {
      return X(i) + ',' + Y(v);
    }).join(' ');

    return '<svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Curva de balance en USD">' +
      '<line class="eq0" x1="0" x2="100" y1="' + Y(eqUsd[0]) + '" y2="' + Y(eqUsd[0]) + '"/>' +
      '<polyline class="eq" points="' + pts + '"/></svg>';
  }

  function card(sym, r) {
    const f = r.full || {};
    const o = r.oos || {};
    const strategy = ST.byId[r.id] || {};

    const verdict = r.verdict || {
      key: 'small',
      text: 'No hay un veredicto disponible.'
    };

    const options = r.opts || {};

    const metric = function (label, value) {
      return '<div><span>' + App.esc(label) +
        '</span><b>' + value + '</b></div>';
    };

    const trades = Array.isArray(r.trades) ? r.trades : [];

    const last = trades.slice(-8).reverse().map(function (t) {
      const direction = t.dir === 1 ? 'Compra' : 'Venta';

      const resultClass =
        Number(t.r) > 0 ? 'buy' :
        Number(t.r) < 0 ? 'sell' : '';

      return '<tr><td>' + App.esc(App.fmtDate(t.t)) + '</td>' +
        '<td>' + direction + '</td>' +
        '<td class="r">' + App.esc(App.fmt(sym, t.entry)) + '</td>' +
        '<td class="r">' + App.esc(App.fmt(sym, t.exit)) + '</td>' +
        '<td>' + App.esc(t.reason || '—') + '</td>' +
        '<td class="r ' + resultClass + '">' +
        App.esc(App.sgn(Number(t.r) || 0, 2)) +
        '</td></tr>';
    }).join('');

    const badgeKey = BADGE[verdict.key]
      ? verdict.key
      : 'small';

    return '<article class="bt-card">' +
      '<div class="bt-head">' +
        '<div>' +
          '<div class="bt-name">' +
            App.esc(r.name || strategy.name || r.id || 'Estrategia') +
          '</div>' +
          '<div class="muted small">' +
            App.esc(strategy.desc || '') +
          '</div>' +
        '</div>' +
        '<span class="badge ' + badgeKey + '">' +
          BADGE[badgeKey] +
        '</span>' +
      '</div>' +

      '<div class="metrics">' +
        metric('Operaciones', safeNumber(f.n, 0)) +
        metric('Acierto', f.n ? pct(f.winRate) : '—') +
        metric('Factor beneficio', f.n ? pf(f.pf) : '—') +
        metric('Esperanza', f.n
          ? App.esc(App.sgn(f.expectancy, 2)) + ' R'
          : '—') +
        metric('Neto', App.esc(App.sgn(Number(f.netR) || 0, 1)) + ' R') +
        metric('Caída máx.', safeNumber(f.maxDD, 1) + ' R') +
        metric('Retorno USD', usd(f.netUsd)) +
        metric('Retorno %', safeNumber(f.returnPct, 1) + '%') +
      '</div>' +

      '<div class="metrics" style="margin-top:4px">' +
        metric('Balance final', '$' + safeNumber(f.balanceEnd, 0)) +
        metric('Últ. 30% · ops', safeNumber(o.n, 0)) +
        metric('Últ. 30% · F.B.', o.n ? pf(o.pf) : '—') +
        metric('Últ. 30% · esp.', o.n
          ? App.esc(App.sgn(o.expectancy, 2)) + ' R'
          : '—') +
      '</div>' +

      '<div class="muted small" style="margin-top:6px">' +
        App.esc(verdict.text || '') +
      '</div>' +

      '<details>' +
        '<summary>Curva y últimas operaciones</summary>' +
        equitySvg(f.equityUsd) +

        '<div class="muted small">' +
          'Stop ' + App.esc(options.slMult) + '×ATR · ' +
          'objetivo ' + App.esc(options.tpMult) + '×ATR · ' +
          'máximo ' + App.esc(options.maxBars) + ' velas · ' +
          'breakeven ' + (options.breakeven ? 'sí' : 'no') +
        '</div>' +

        '<div class="scroll-x">' +
          '<table class="tbl">' +
            '<thead>' +
              '<tr>' +
                '<th>Entrada</th>' +
                '<th>Tipo</th>' +
                '<th class="r">Precio</th>' +
                '<th class="r">Salida</th>' +
                '<th>Motivo</th>' +
                '<th class="r">R</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              (last || '<tr><td colspan="6" class="muted">Todavía no hay operaciones.</td></tr>') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</details>' +
    '</article>';
  }

  function baseOptions(sym, useConfiguredSession) {
    const sessions =
      window.AT_CONFIG && window.AT_CONFIG.sessions
        ? window.AT_CONFIG.sessions
        : {};

    const combined = sessions.combined || {};

    return {
      spread: state.settings.spread[sym],

      slippage: B.SYMBOLS[sym]
        ? B.SYMBOLS[sym].slippage
        : 0,

      slMult: state.settings.sl,
      tpMult: state.settings.tp,
      balance: state.settings.balance,
      riskPct: state.settings.riskPct,

      breakeven: !!state.settings.trailing,
      sessionFilter: !!state.settings.sessionFilter,

      sessionStart:
        useConfiguredSession &&
        Number.isFinite(Number(combined.startGmt))
          ? Number(combined.startGmt)
          : 7,

      sessionEnd:
        useConfiguredSession &&
        Number.isFinite(Number(combined.endGmt))
          ? Number(combined.endGmt)
          : 21,

      adxFilter: !!state.settings.adxFilter
    };
  }

  function showTableMessage(table, message) {
    if (!table) return;

    table.innerHTML =
      '<tbody><tr><td class="muted">' +
      App.esc(message) +
      '</td></tr></tbody>';
  }

  function showGridMessage(container, message) {
    if (!container) return;

    container.innerHTML =
      '<div class="muted small" style="grid-column:1/-1">' +
      App.esc(message) +
      '</div>';
  }

  // ==========================================
  // BACKTEST PRINCIPAL
  // ==========================================

  App.runBacktest = function () {
    const sym = state.symbol;
    const tf = state.tf;
    const my = ++seq;

    const info = $('btInfo');
    const cards = $('btCards');

    const walkCard = $('btWalkCard');
    const mcCard = $('btMCCard');

    if (!info || !cards) return Promise.resolve();

    info.textContent = 'Cargando ' + sym + ' ' + tf + '…';

    cards.innerHTML = '';

    if (walkCard) walkCard.hidden = true;
    if (mcCard) mcCard.hidden = true;

    return App.hist(sym, tf).then(function (bars) {
      if (my !== seq) return;

      if (!Array.isArray(bars) || bars.length < 260) {
        info.textContent =
          'Hay solo ' + (bars && bars.length || 0) +
          ' velas; hacen falta al menos 260 para probar con filtro de 200 periodos.';
        return;
      }

      const opts = baseOptions(sym, true);
      const results = B.runAll(bars, opts);

      const rank = function (r) {
        return (
          (r.verdict && r.verdict.key === 'small' ? -1000 : 0) +
          (Number(r.full && r.full.expectancy) || 0)
        );
      };

      results.sort(function (a, b) {
        return rank(b) - rank(a);
      });

      const date = function (t) {
        const value = new Date(t);

        return Number.isNaN(value.getTime())
          ? '—'
          : value.toLocaleDateString('es', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit'
            });
      };

      info.textContent =
        sym + ' · ' + tf + ' · ' + bars.length +
        ' velas cerradas (' +
        date(bars[0].t) + ' → ' +
        date(bars[bars.length - 1].t) +
        ') · spread ' + App.fmt(sym, opts.spread) +
        ' · slippage ' + App.fmt(sym, opts.slippage) +
        ' · balance $' + state.settings.balance +
        ' · riesgo ' + state.settings.riskPct + '%.';

      cards.innerHTML = results.map(function (result) {
        return card(sym, result);
      }).join('');

    }).catch(function (error) {
      if (my !== seq) return;

      if (D.isMissing(error)) {
        App.markMissing(sym);

        info.textContent =
          sym + ' no tiene datos en biquote.io con el nombre «' +
          D.feedName(sym) +
          '» (mira Ajustes → Datos).';

      } else {
        info.textContent =
          'No se pudo cargar el historial (' +
          errorText(error) + ').';
      }
    });
  };

  // ==========================================
  // WALK FORWARD
  // ==========================================

  App.runWalkForward = function () {
    const sym = state.symbol;
    const tf = state.tf;
    const my = ++walkSeq;

    const cardEl = $('btWalkCard');
    const table = $('btWalkTable');
    const btn = $('btWalk');

    if (!cardEl || !table || !btn) return Promise.resolve();

    setButton(btn, true, 'Calculando…');

    cardEl.hidden = false;

    showTableMessage(table, 'Cargando historial…');

    return App.hist(sym, tf).then(function (bars) {
      if (my !== walkSeq) return;

      if (!Array.isArray(bars) || bars.length < 400) {
        showTableMessage(
          table,
          'Necesitas al menos 400 velas para walk-forward con 4 ventanas.'
        );
        return;
      }

      const opts = baseOptions(sym, false);

      let html =
        '<thead><tr>' +
          '<th>Estrategia</th>' +
          '<th class="r">Consistencia</th>' +
          '<th class="r">F1</th>' +
          '<th class="r">F2</th>' +
          '<th class="r">F3</th>' +
          '<th class="r">F4</th>' +
          '<th class="r">Veredicto</th>' +
        '</tr></thead><tbody>';

      ST.list.forEach(function (strategy) {
        const wf = B.walkForward(bars, strategy.id, opts);

        const folds = Array.isArray(wf.folds)
          ? wf.folds
          : [];

        const foldCells = folds.map(function (fold) {
          const expectancy = Number(fold.expectancy) || 0;
          const count = Number(fold.n) || 0;

          const color =
            expectancy > 0.05 && count >= 10
              ? 'buy'
              : expectancy < 0
                ? 'sell'
                : '';

          return '<td class="r ' + color + '">' +
            App.esc(App.sgn(expectancy, 2)) +
            '<small> n' + count + '</small>' +
          '</td>';
        }).join('');

        let emptyCells = '';

        for (let i = folds.length; i < 4; i++) {
          emptyCells += '<td class="r muted">—</td>';
        }

        const consistency = Number(wf.consistency) || 0;
        const passed = !!wf.passed;

        const badge = passed
          ? '<span class="badge edge">Apto</span>'
          : consistency >= 0.5
            ? '<span class="badge marginal">Débil</span>'
            : '<span class="badge none">No</span>';

        html +=
          '<tr>' +
            '<td style="text-align:left">' +
              App.esc((strategy.name || strategy.id).split(' (')[0]) +
            '</td>' +
            '<td class="r">' +
              (consistency * 100).toFixed(0) + '%' +
            '</td>' +
            foldCells +
            emptyCells +
            '<td class="r">' + badge + '</td>' +
          '</tr>';
      });

      table.innerHTML = html + '</tbody>';

    }).catch(function () {
      if (my !== walkSeq) return;

      showTableMessage(
        table,
        'No se pudo cargar o calcular el historial.'
      );

    }).then(function () {
      if (my === walkSeq) {
        setButton(btn, false, 'Walk-forward');
      }
    });
  };

  // ==========================================
  // MONTE CARLO
  // ==========================================

  App.runMonteCarlo = function () {
    const sym = state.symbol;
    const tf = state.tf;
    const my = ++mcSeq;

    const cardEl = $('btMCCard');
    const out = $('btMCOut');
    const btn = $('btMC');

    if (!cardEl || !out || !btn) return Promise.resolve();

    setButton(btn, true, 'Calculando…');

    cardEl.hidden = false;

    showGridMessage(out, 'Cargando historial y operaciones…');

    return App.hist(sym, tf).then(function (bars) {
      if (my !== mcSeq) return;

      if (!Array.isArray(bars) || bars.length < 260) {
        showGridMessage(out, 'Necesitas al menos 260 velas.');
        return;
      }

      const opts = baseOptions(sym, false);
      const allTrades = [];

      ST.list.forEach(function (strategy) {
        const result = B.run(bars, strategy.id, opts);

        (result.trades || []).forEach(function (trade) {
          allTrades.push({
            r: trade.r,
            strat: strategy.id
          });
        });
      });

      if (allTrades.length < 30) {
        showGridMessage(
          out,
          'No hay suficientes operaciones (' +
          allTrades.length +
          ') para Monte Carlo. Prueba otra estrategia o temporalidad.'
        );
        return;
      }

      const mc = B.monteCarlo(allTrades, {
        runs: 1000,
        ruinPct: 20,
        balance: state.settings.balance,
        riskPct: state.settings.riskPct
      });

      const cell = function (label, value, color) {
        return '<div>' +
          '<span>' + App.esc(label) + '</span>' +
          '<b class="' + (color || '') + '">' +
            value +
          '</b>' +
        '</div>';
      };

      out.innerHTML =
        cell('Trades base', allTrades.length) +

        cell(
          'Mediana (R)',
          App.esc(App.sgn(mc.median, 1)),
          cls(mc.median)
        ) +

        cell(
          'Peor 5% (R)',
          App.esc(App.sgn(mc.p5, 1)),
          cls(mc.p5)
        ) +

        cell(
          'Mejor 95% (R)',
          App.esc(App.sgn(mc.p95, 1)),
          cls(mc.p95)
        ) +

        cell(
          'Prob. negativo',
          (mc.probNegative * 100).toFixed(0) + '%',
          mc.probNegative > 0.4 ? 'sell' : 'buy'
        ) +

        cell(
          'Prob. ruina (>20%)',
          (mc.probRuin * 100).toFixed(1) + '%',
          mc.probRuin > 0.1 ? 'sell' : 'buy'
        ) +

        cell(
          'Caída máx. mediana',
          safeNumber(mc.maxDDMedian, 1) + ' R',
          'sell'
        ) +

        cell(
          'Caída máx. peor',
          safeNumber(mc.maxDDWorst, 1) + ' R',
          'sell'
        );

    }).catch(function () {
      if (my !== mcSeq) return;

      showGridMessage(
        out,
        'No se pudo cargar o calcular el historial.'
      );

    }).then(function () {
      if (my === mcSeq) {
        setButton(btn, false, 'Monte Carlo');
      }
    });
  };

  // ==========================================
  // COMPARACIÓN DE TEMPORALIDADES
  // ==========================================

  App.runSweep = function () {
    const sym = state.symbol;
    const my = ++sweepSeq;

    const btn = $('btSweepBtn');
    const table = $('btSweep');

    if (!btn || !table) return Promise.resolve();

    setButton(btn, true, 'Calculando…');

    table.innerHTML = '';

    const tasks = D.TF_LIST.map(function (tf) {
      return function () {
        return App.hist(sym, tf);
      };
    });

    return D.pool(tasks, 3).then(function (results) {
      if (my !== sweepSeq) return;

      const cells = {};

      ST.list.forEach(function (strategy) {
        cells[strategy.id] = {};
      });

      const opts = baseOptions(sym, false);

      results.forEach(function (result, index) {
        if (
          !result ||
          !result.ok ||
          !Array.isArray(result.v) ||
          result.v.length < 260
        ) {
          return;
        }

        B.runAll(result.v, opts).forEach(function (item) {
          if (!cells[item.id]) {
            cells[item.id] = {};
          }

          cells[item.id][D.TF_LIST[index]] = {
            e: item.full.expectancy,
            n: item.full.n,
            oe: item.oos.expectancy,
            on: item.oos.n
          };
        });
      });

      let html =
        '<thead><tr>' +
          '<th>' + App.esc(sym) + '</th>' +
          D.TF_LIST.map(function (tf) {
            return '<th>' + App.esc(tf) + '</th>';
          }).join('') +
        '</tr></thead><tbody>';

      ST.list.forEach(function (strategy) {
        html +=
          '<tr>' +
            '<td style="text-align:left">' +
              App.esc((strategy.name || strategy.id).split(' (')[0]) +
            '</td>';

        D.TF_LIST.forEach(function (tf) {
          const result =
            cells[strategy.id] &&
            cells[strategy.id][tf];

          if (!result) {
            html += '<td>—</td>';
            return;
          }

          const strong =
            result.n >= 100 &&
            result.on >= 30;

          const colorClass = !strong
            ? 'zero'
            : result.e >= 0.15 && result.oe >= 0.1
              ? 'pos2'
              : result.e > 0
                ? 'pos'
                : result.e < 0
                  ? 'neg'
                  : 'zero';

          html +=
            '<td class="' + colorClass + '"' +
            (!strong ? ' style="opacity:.6"' : '') +
            '>' +
              App.esc(App.sgn(result.e, 2)) +
              '<small>n' + result.n +
              (result.on >= 5
                ? ' · 30% ' + App.esc(App.sgn(result.oe, 2))
                : '') +
              '</small>' +
            '</td>';
        });

        html += '</tr>';
      });

      table.innerHTML = html + '</tbody>';

    }).catch(function () {
      if (my !== sweepSeq) return;

      table.innerHTML =
        '<tbody><tr><td class="muted">' +
        'No se pudieron cargar las temporalidades. ' +
        'Comprueba la conexión e inténtalo otra vez.' +
        '</td></tr></tbody>';

    }).then(function () {
      if (my === sweepSeq) {
        setButton(
          btn,
          false,
          'Calcular las 7 temporalidades'
        );
      }
    });
  };

  // ==========================================
  // EVENTOS
  // ==========================================

  App.wireBacktest = function () {
    const runButton = $('btRun');
    const walkButton = $('btWalk');
    const mcButton = $('btMC');
    const sweepButton = $('btSweepBtn');

    if (runButton) {
      runButton.addEventListener('click', function () {
        delete state.hist[state.symbol + '|' + state.tf];
        App.runBacktest();
      });
    }

    if (walkButton) {
      walkButton.addEventListener(
        'click',
        App.runWalkForward
      );
    }

    if (mcButton) {
      mcButton.addEventListener(
        'click',
        App.runMonteCarlo
      );
    }

    if (sweepButton) {
      sweepButton.addEventListener(
        'click',
        App.runSweep
      );
    }
  };

})();