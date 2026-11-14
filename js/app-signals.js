(function () {
  'use strict';
  const AT = window.AT, App = AT.app, B = AT.backtest, D = AT.data;
  const state = App.state;
  const $ = function (id) { return document.getElementById(id); };
  const LABEL = { strong_buy: 'Compra fuerte', buy: 'Compra', neutral: 'Neutral', sell: 'Venta', strong_sell: 'Venta fuerte' };

  let chart = null, renders = 0, tablesKey = '';

  App.copy = function (text) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); App.toast('Copiado'); }
      catch (e) { App.toast('No se pudo copiar'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { App.toast('Copiado'); }, fallback);
    } else fallback();
  };

  App.buildSymbolBar = function () {
    const bar = $('symbolBar');
    bar.innerHTML = '';
    App.SYMS.forEach(function (sym) {
      const b = document.createElement('button');
      b.className = 'sym';
      b.dataset.sym = sym;
      b.setAttribute('role', 'tab');
      b.innerHTML = '<span class="sym-name">' + sym + '</span><span class="sym-price">—</span><span class="sym-chg muted">&nbsp;</span>';
      b.addEventListener('click', function () { App.selectSymbol(sym); });
      bar.appendChild(b);
    });
  };

  App.buildTfBar = function () {
    const bar = $('tfBar');
    bar.innerHTML = '';
    D.TF_LIST.forEach(function (tf) {
      const b = document.createElement('button');
      b.dataset.tf = tf;
      b.textContent = tf;
      b.addEventListener('click', function () { App.selectTf(tf); });
      bar.appendChild(b);
    });
    $('mtf').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-tf]');
      if (b) App.selectTf(b.dataset.tf);
    });
  };

  App.initChart = function () {
    chart = AT.chart.create($('chart'), { onHover: function (bar) { App.setLegend(bar); } });
    $('zoomIn').addEventListener('click', function () { chart.zoom(0.8); });
    $('zoomOut').addEventListener('click', function () { chart.zoom(1.25); });
    $('zoomReset').addEventListener('click', function () { chart.reset(); });
  };

  App.wireSignals = function () {
    $('planDir').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-dir]');
      if (!b) return;
      state.planDir = +b.dataset.dir;
      Array.prototype.forEach.call($('planDir').children, function (x) {
        x.classList.toggle('active', x === b);
      });
      App.renderPlan();
      App.renderChart();
    });

    $('planCopy').addEventListener('click', function () {
      const p = App.planFor(state.symbol, state.tf, state.planDir);
      if (!p || p.neutral) return;
      App.copy((p.dir === 1 ? 'COMPRA ' : 'VENTA ') + p.symbol + ' (' + p.tf + ') · entrada ' +
        App.fmt(p.symbol, p.entry) + ' · SL ' + App.fmt(p.symbol, p.sl) +
        ' · TP ' + App.fmt(p.symbol, p.tp) + ' · R:R ' + p.rr.toFixed(2) +
        ' · lotes ' + p.lots.toFixed(2) + ' (riesgo $' + p.riskUsd.toFixed(0) + ')');
    });

    $('planLog').addEventListener('click', function () {
      const p = App.planFor(state.symbol, state.tf, state.planDir);
      if (!p || p.neutral) return;
      const check = App.canOpenNow(p.symbol, p.riskUsd);
      if (!check.ok) { App.toast('No se puede abrir: ' + check.reason); return; }
      state.journal.open({
        symbol: p.symbol,
        tf: p.tf,
        strategy: 'manual',
        dir: p.dir,
        entry: p.entry,
        sl: p.sl,
        tp: p.tp,
        lots: p.lots,
        source: 'manual',
        note: 'Plan manual (medidor ' + p.tf + ')'
      });
      App.toast('Registrado en el diario');
      if (App.renderRisk) App.renderRisk();
    });

    $('calcSignal').addEventListener('click', App.calculateSignal);

    $('copySignal').addEventListener('click', function () {
      if (!state.lastSignal || !state.lastSignal.text) return;
      App.copy(state.lastSignal.text);
    });
  };

  App.calculateSignal = function () {
    const sym = state.symbol, tf = state.tf;
    const box = $('signalBox'), copyBtn = $('copySignal');
    const st = state.settings;
    const symCfg = B.SYMBOLS[sym];

    const bars = state.bars[sym][tf] || [];
    if (bars.length < 60) {
      box.innerHTML = '<div class="msg warn">Cargando historial… (' + bars.length + '/60 velas). Espera unos segundos y vuelve a pulsar.</div>';
      copyBtn.disabled = true;
      state.lastSignal = null;
      return;
    }

    const closed = bars.slice(0, -1);
    const a = AT.signals.analyze(closed);
    if (!a || a.atr == null) {
      box.innerHTML = '<div class="msg warn">ATR no disponible todavía.</div>';
      copyBtn.disabled = true;
      state.lastSignal = null;
      return;
    }

    const slMult = st.sl != null ? st.sl : (symCfg.defaultSl || 1.5);
    const tpMult = st.tp != null ? st.tp : (symCfg.defaultTp || 2.5);

    let dir = a.label.dir;
    let forced = false;
    if (dir === 0) {
      if (state.planDir !== 0) {
        dir = state.planDir;
        forced = true;
      } else {
        box.innerHTML = '<div class="msg warn">El medidor está en <b>Neutral</b> (score ' +
          a.score.toFixed(2) + '). Usa los botones «Comprar» o «Vender» del plan de operación ' +
          'para forzar una señal, o espera a que salga de la zona neutral.</div>';
        copyBtn.disabled = true;
        state.lastSignal = null;
        return;
      }
    }

    if (st.sessionFilter && !App.sessionInfo().open && !forced) {
      box.innerHTML = '<div class="msg warn">Fuera de sesión Londres/NY (' +
        App.sessionInfo().startGmt + ':00–' + App.sessionInfo().endGmt + ':00 GMT). ' +
        'La señal se calcula, pero el filtro de sesión está activo. Puedes forzar la dirección para ignorarlo.</div>';
    }

    const tick = state.ticks[sym];
    const lastClosed = closed[closed.length - 1];
    const entry = tick ? (dir === 1 ? tick.ask : tick.bid) : lastClosed.c;
    const risk = slMult * a.atr;
    const reward = tpMult * a.atr;
    const sl = entry - dir * risk;
    const tp = entry + dir * reward;
    const rr = reward / risk;
    const riskUsd = st.balance * st.riskPct / 100;
    const lots = symCfg.contract > 0 && risk > 0
      ? Math.floor(riskUsd / (risk * symCfg.contract) * 100) / 100
      : 0;

    const digits = symCfg.digits;
    const fmt = function (p) { return p.toFixed(digits); };
    const dirTxt = dir === 1 ? 'COMPRA' : 'VENTA';

    const text = 'SEÑAL ' + dirTxt + ' ' + sym + ' ' + tf.toUpperCase() + (forced ? ' (forzada)' : '') + '\n' +
      'Entrada: ' + fmt(entry) + '\n' +
      'SL: ' + fmt(sl) + ' (' + risk.toFixed(digits) + ' · ' + slMult + '×ATR)\n' +
      'TP: ' + fmt(tp) + ' (' + reward.toFixed(digits) + ' · ' + tpMult + '×ATR)\n' +
      'R:R 1:' + rr.toFixed(2) + '\n' +
      'Lotes: ' + (lots >= 0.01 ? lots.toFixed(2) : '<0.01') + '\n' +
      'Riesgo: $' + riskUsd.toFixed(0) + ' (' + st.riskPct + '% de $' + st.balance + ')\n' +
      'ATR (' + tf + '): ' + fmt(a.atr);

    state.lastSignal = {
      symbol: sym, tf: tf, dir: dir, entry: entry, sl: sl, tp: tp,
      rr: rr, lots: lots, text: text, time: Date.now(), forced: forced
    };

    const cell = function (k, v, cls) {
      return '<div class="cell"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';
    };

    let html = cell('Dirección', dirTxt + (forced ? ' ⚠' : ''), dir === 1 ? 'buy' : 'sell') +
      cell('Entrada', fmt(entry)) +
      cell('Stop-Loss', fmt(sl), 'sell') +
      cell('Take-Profit', fmt(tp), 'buy') +
      cell('R:R', '1:' + rr.toFixed(2)) +
      cell('Lotes', lots >= 0.01 ? lots.toFixed(2) : '<0.01') +
      cell('Riesgo', '$' + riskUsd.toFixed(0) + ' (' + st.riskPct + '%)') +
      cell('ATR (' + tf + ')', fmt(a.atr));

    if (forced) {
      html += '<div class="msg small warn">Dirección forzada por ti. El medidor está neutral — úsalo bajo tu criterio.</div>';
    }
    if (tf !== symCfg.bestTf) {
      html += '<div class="msg small">Temporalidad recomendada para ' + sym + ': ' +
        symCfg.bestTf.toUpperCase() + '. Estás en ' + tf.toUpperCase() + '.</div>';
    }

    box.innerHTML = html;
    copyBtn.disabled = false;
    App.toast('Señal: ' + dirTxt + ' ' + sym + ' ' + tf + (forced ? ' (forzada)' : ''));
  };

  App.selectSymbol = function (sym) {
    state.symbol = sym;
    state.planDir = 0;
    state.lastSignal = null;
    $('copySignal').disabled = true;
    $('signalBox').innerHTML = '';
    Array.prototype.forEach.call($('planDir').children, function (x, i) {
      x.classList.toggle('active', i === 0);
    });
    if (state.tab === 'backtest' && App.runBacktest) App.runBacktest();
    const need = !state.bars[sym][state.tf];
    if (need) App.loadSymbol(sym).then(function () { App.renderLive(true); App.renderMTF(); });
    else App.refresh(false);
    App.renderLive(true);
    App.renderMTF();
  };

  App.selectTf = function (tf) {
    state.tf = tf;
    state.lastSignal = null;
    $('copySignal').disabled = true;
    $('signalBox').innerHTML = '';
    if (!state.bars[state.symbol][tf]) {
      App.load(state.symbol, tf, 500).then(function () {
        App.renderLive(true); App.renderMTF();
      }, function () {});
    } else if (Date.now() - (state.fetchedAt[state.symbol + '|' + tf] || 0) > 60000) {
      App.load(state.symbol, tf, 500).catch(function () {});
    }
    if (state.tab === 'backtest' && App.runBacktest) App.runBacktest();
    App.renderLive(true);
    App.renderMTF();
  };

  App.renderStatus = function () {
    const dot = $('statusDot'), txt = $('statusText'), m = state.feedMode, t = state.ticks[state.symbol];
    let cls = '', msg = 'conectando…';
    if (m === 'live') { cls = 'ok'; msg = 'en vivo'; }
    else if (m === 'polling') { cls = 'warn'; msg = 'consulta cada 2 s'; }
    else if (m === 'reconnecting') { cls = 'warn'; msg = 'reconectando…'; }
    else if (m === 'error') {
      cls = 'bad';
      msg = state.lastError && state.lastError.status === 429 ? 'límite de consultas, reintenta' : 'sin conexión con biquote.io';
    }
    if (t && t.state === 'closed') msg += ' · mercado cerrado';
    const miss = App.SYMS.filter(App.isMissing);
    if (miss.length) msg += ' · sin datos: ' + miss.join(', ');
    dot.className = 'dot ' + cls;
    txt.textContent = msg;
    const c = $('sConn');
    if (c) c.textContent = 'Estado: ' + msg + '.';
  };

  App.renderRisk = function () {
    const fill = $('riskFill'), val = $('riskValue'), alertEl = $('riskAlert');
    if (!fill || !val) return;
    const exp = App.exposureNow();
    const s = state.settings;
    const pct = exp.pct;
    const maxPct = s.maxAggPct || 2;
    const ratio = maxPct > 0 ? pct / maxPct : 0;
    fill.style.width = Math.min(100, ratio * 100) + '%';
    fill.className = 'risk-fill' + (ratio >= 1 ? ' bad' : ratio >= 0.7 ? ' warn' : '');
    val.textContent = pct.toFixed(2) + '% / ' + maxPct.toFixed(2) + '%';
    if (alertEl) alertEl.textContent = ratio >= 1 ? 'LÍMITE' : '';
  };

  App.renderTop = function () {
    Array.prototype.forEach.call($('symbolBar').children, function (b) {
      const sym = b.dataset.sym, t = state.ticks[sym];
      b.classList.toggle('active', sym === state.symbol);
      b.setAttribute('aria-selected', sym === state.symbol);
      b.querySelector('.sym-price').textContent = t ? App.fmt(sym, t.mid) : '—';
      const c = b.querySelector('.sym-chg');
      if (App.isMissing(sym) && !t) { c.textContent = 'sin datos'; c.className = 'sym-chg muted'; return; }
      if (t && t.dayPct != null && t.state !== 'closed') {
        c.textContent = App.sgn(t.dayPct, 2) + '%';
        c.className = 'sym-chg ' + (t.dayPct >= 0 ? 'up' : 'down');
      } else {
        c.textContent = t && t.state === 'closed' ? 'cerrado' : ' ';
        c.className = 'sym-chg muted';
      }
    });
    Array.prototype.forEach.call($('tfBar').children, function (b) {
      b.classList.toggle('active', b.dataset.tf === state.tf);
    });
  };

  App.renderPrice = function () {
    const sym = state.symbol, t = state.ticks[sym], bars = state.bars[sym][state.tf] || [];
    if (App.isMissing(sym) && !t && !bars.length) {
      $('priceBig').textContent = '—';
      $('priceChg').textContent = '';
      $('priceSub').textContent = sym + ' no responde con el nombre «' + D.feedName(sym) + '». ' +
        (state.discoverFailed[sym] ? 'Tampoco se halló otro nombre parecido: escríbelo en js/config.js (alias).' : 'Buscando el nombre correcto…');
    } else {
      const price = t ? t.mid : (bars.length ? bars[bars.length - 1].c : null);
      $('priceBig').textContent = App.fmt(sym, price);
      const chg = $('priceChg');
      if (t && t.dayPct != null && t.state !== 'closed') {
        chg.textContent = App.sgn(t.dayPct, 2) + '% hoy';
        chg.className = 'price-chg ' + (t.dayPct >= 0 ? 'up' : 'down');
      } else {
        chg.textContent = '';
      }
      $('priceSub').textContent = t
        ? 'Bid ' + App.fmt(sym, t.bid) + ' · Ask ' + App.fmt(sym, t.ask) + ' · spread ' + App.fmt(sym, t.spread) +
          (t.state === 'closed' ? ' · mercado cerrado, último precio' : '')
        : 'Esperando precio…';
    }

    const sb = $('sessionBadge');
    if (sb) {
      const sess = App.sessionInfo();
      const blocked = App.inBlackout();
      if (blocked) {
        sb.textContent = '⛔ Noticias: bloqueado';
        sb.className = 'session-badge bad';
      } else if (sess.open) {
        sb.textContent = '✓ Sesión Londres/NY abierta';
        sb.className = 'session-badge ok';
      } else {
        sb.textContent = '✗ Fuera de sesión (' + sess.startGmt + ':00–' + sess.endGmt + ':00 GMT)';
        sb.className = 'session-badge bad';
      }
    }
  };

  App.needleAngle = function (score) {
    const s = Math.max(-1, Math.min(1, score)), a = Math.abs(s);
    const deg = a <= 0.1 ? a / 0.1 * 18 : a <= 0.5 ? 18 + (a - 0.1) / 0.4 * 36 : 54 + (a - 0.5) / 0.5 * 36;
    return s < 0 ? -deg : deg;
  };

  App.renderGauge = function (a) {
    const lab = $('gaugeLabel');
    $('needle').style.opacity = a ? '1' : '0.25';
    if (!a) {
      lab.textContent = App.isMissing(state.symbol) ? 'Sin datos' : 'Cargando…';
      lab.className = 'gauge-label neutral';
      $('gaugeScore').textContent = '';
      $('needle').setAttribute('transform', 'rotate(0 100 100)');
      ['cntSell', 'cntNeutral', 'cntBuy'].forEach(function (id) { $(id).textContent = '0'; });
      $('maSummary').textContent = '—';
      $('oscSummary').textContent = '—';
      return;
    }
    $('needle').setAttribute('transform', 'rotate(' + App.needleAngle(a.score).toFixed(1) + ' 100 100)');
    lab.textContent = LABEL[a.label.key];
    lab.className = 'gauge-label ' + a.label.key;
    $('gaugeScore').textContent = 'Puntuación ' + App.sgn(a.score, 2) + ' · ' + state.symbol + ' ' + state.tf;
    $('cntSell').textContent = a.counts.sell;
    $('cntNeutral').textContent = a.counts.neutral;
    $('cntBuy').textContent = a.counts.buy;
    const ma = $('maSummary'), os = $('oscSummary');
    ma.textContent = LABEL[a.trend.label.key];
    ma.className = a.trend.label.key;
    os.textContent = LABEL[a.momentum.label.key];
    os.className = a.momentum.label.key;
  };

  App.renderMTF = function () {
    let html = '';
    D.TF_LIST.forEach(function (tf) {
      const a = App.analysis(state.symbol, tf);
      html += '<button data-tf="' + tf + '" class="' + (tf === state.tf ? 'active' : '') + '">' +
        '<span class="tfn">' + tf + '</span>' +
        '<span class="lab ' + (a ? a.label.key : 'neutral') + '">' +
        (a ? LABEL[a.label.key] : App.isMissing(state.symbol) ? '—' : '…') + '</span></button>';
    });
    $('mtf').innerHTML = html;
  };

  App.setLegend = function (bar) {
    const el = $('legend'), bars = state.bars[state.symbol][state.tf] || [], b = bar || bars[bars.length - 1];
    if (!b) { el.innerHTML = '&nbsp;'; return; }
    const sym = state.symbol;
    const f = function (p) { return App.fmt(sym, p); };
    const chg = b.o ? (b.c - b.o) / b.o * 100 : 0;
    el.textContent = (bar ? App.fmtDate(b.t) + '  ' : '') + 'A ' + f(b.o) + '  Máx ' + f(b.h) + '  Mín ' + f(b.l) +
      '  C ' + f(b.c) + '  ' + App.sgn(chg, 2) + '%';
  };

  App.renderChart = function () {
    const sym = state.symbol, bars = state.bars[sym][state.tf] || [], t = state.ticks[sym];
    chart.setData(bars, { tf: state.tf, digits: B.SYMBOLS[sym].digits });
    const lines = [];
    if (t) lines.push({ price: t.mid, color: '#3b82f6', label: '', dash: true, range: false });
    const p = App.planFor(sym, state.tf, state.planDir);
    if (p && !p.neutral) {
      lines.push({ price: p.entry, color: '#6b7280', label: 'E', dash: true, range: true });
      lines.push({ price: p.sl, color: '#ef4444', label: 'SL', dash: false, range: true });
      lines.push({ price: p.tp, color: '#22c55e', label: 'TP', dash: false, range: true });
    }
    chart.setLines(lines);
    App.setLegend(null);
  };

  App.renderPlan = function () {
    const box = $('planBox'), p = App.planFor(state.symbol, state.tf, state.planDir), sym = state.symbol;
    const off = !p || p.neutral;
    $('planCopy').disabled = off;
    $('planLog').disabled = off;
    if (!p) {
      box.innerHTML = '<div class="msg">' + (App.isMissing(sym) ? 'Sin datos de este activo.' : 'Esperando datos…') + '</div>';
      return;
    }
    if (p.neutral) {
      box.innerHTML = '<div class="msg">El medidor está en Neutral: no hay señal clara. Si quieres ver un plan, elige Comprar o Vender arriba.</div>';
      return;
    }
    const lots = p.lots >= 0.01 ? p.lots.toFixed(2) : '<0,01';
    const cell = function (k, v, cls) {
      return '<div class="cell"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';
    };
    const check = App.canOpenNow(p.symbol, p.riskUsd);
    box.innerHTML =
      cell('Dirección', p.dir === 1 ? 'COMPRA' : 'VENTA', p.dir === 1 ? 'buy' : 'sell') +
      cell('Entrada', App.fmt(sym, p.entry)) +
      cell('Stop-loss', App.fmt(sym, p.sl), 'sell') +
      cell('Objetivo', App.fmt(sym, p.tp), 'buy') +
      cell('Relación R:R', '1 : ' + p.rr.toFixed(2)) +
      cell('Lotes (riesgo $' + p.riskUsd.toFixed(0) + ')', lots) +
      '<div class="msg small">Stop a ' + App.fmt(sym, p.risk) + ' del precio (' +
        (state.settings.sl || B.SYMBOLS[sym].defaultSl) + '×ATR).</div>' +
      (!check.ok
        ? '<div class="msg small bad">No se puede registrar: ' + check.reason + '</div>'
        : '');
  };

  function fmtVal(v) {
    const a = Math.abs(v);
    return a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(5);
  }

  App.renderTables = function (a) {
    function rows(votes, price) {
      return votes.map(function (v) {
        const key = v.action === 1 ? 'buy' : v.action === -1 ? 'sell' : 'neutral';
        return '<tr><td>' + App.esc(v.name) + '</td>' +
          '<td class="r">' + (price ? App.fmt(state.symbol, v.value) : fmtVal(v.value)) + '</td>' +
          '<td class="r ' + key + '">' + LABEL[key] + '</td></tr>';
      }).join('');
    }
    $('maTable').tBodies[0].innerHTML = a ? rows(a.trend.votes, true) : '';
    $('oscTable').tBodies[0].innerHTML = a ? rows(a.momentum.votes, false) : '';
  };

  App.renderLive = function (full) {
    App.renderTop();
    App.renderStatus();
    App.renderRisk();
    if (state.tab === 'journal' && App.renderJournalLive) { App.renderJournalLive(); return; }
    if (state.tab === 'settings' && App.renderSymbolStatus) { App.renderSymbolStatus(); return; }
    if (state.tab !== 'signals') return;
    App.renderPrice();
    const a = App.analysis(state.symbol, state.tf);
    App.renderGauge(a);
    App.renderChart();
    App.renderPlan();
    const key = state.symbol + '|' + state.tf + '|' + (a ? 1 : 0);
    if (full || key !== tablesKey || renders++ % 5 === 0) {
      App.renderTables(a);
      tablesKey = key;
    }
  };
})();