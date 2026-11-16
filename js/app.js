(function () {
  'use strict';

  const AT = window.AT;
  const D = AT.data;
  const A = AT.analysis;
  const CFG = window.AT_CONFIG;

  const state = {
    symbol: 'XAUUSD',
    tf: '1h',
    bars: {},
    ticks: {},
    analysis: null,
    feedMode: 'off',
    loading: false
  };

  let chart = null;
  let renderTimer = null;

  const $ = function (id) { return document.getElementById(id); };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(sym, price) {
    const inst = CFG.symbols[sym];
    if (!inst || price == null || !isFinite(price)) return '—';
    return Number(price).toFixed(inst.digits);
  }

  function sgn(v, d) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(d);
  }

  function needleAngle(score, dir) {
    if (score < 50) return 0;
    const a = (score - 50) / 50 * 90;
    return dir === 1 ? a : -a;
  }

  function renderStatus() {
    const dot = $('statusDot');
    const txt = $('statusText');
    if (!dot || !txt) return;
    const m = state.feedMode;
    let cls = '', msg = 'Conectando…';
    if (m === 'live') { cls = 'ok'; msg = 'En vivo'; }
    else if (m === 'polling') { cls = 'warn'; msg = 'Sondeo (2s)'; }
    else if (m === 'reconnecting') { cls = 'warn'; msg = 'Reconectando…'; }
    else if (m === 'error') { cls = 'bad'; msg = 'Sin conexión'; }
    dot.className = 'dot ' + cls;
    txt.textContent = msg;
  }

  function renderPrice() {
    const t = state.ticks[state.symbol];
    const bars = state.bars[state.tf] || [];
    const price = t ? t.mid : (bars.length ? bars[bars.length - 1].c : null);
    
    $('priceBig').textContent = fmt(state.symbol, price);
    
    const chg = $('priceChg');
    if (t && t.dayPct != null && t.state !== 'closed') {
      chg.textContent = sgn(t.dayPct, 2) + '% hoy';
      chg.className = 'price-chg ' + (t.dayPct >= 0 ? 'up' : 'down');
    } else {
      chg.textContent = '';
    }

    $('priceSub').textContent = t
      ? 'Bid ' + fmt(state.symbol, t.bid) + ' · Ask ' + fmt(state.symbol, t.ask) + ' · Spread ' + fmt(state.symbol, t.spread)
      : 'Esperando precio…';

    const now = new Date();
    const hour = now.getUTCHours();
    const sess = CFG.sessions.combined;
    const open = hour >= sess.startGmt && hour < sess.endGmt;
    const sb = $('sessionBadge');
    sb.textContent = open ? '✓ Sesión activa' : '✗ Fuera de sesión';
    sb.className = 'session-badge ' + (open ? 'ok' : 'bad');
  }

  function renderGauge() {
    const a = state.analysis;
    const needle = $('needle');
    const label = $('gaugeLabel');
    const score = $('gaugeScore');

    if (!a) {
      needle.style.opacity = '0.3';
      label.textContent = 'Cargando…';
      label.className = 'gauge-label neutral';
      score.textContent = '';
      return;
    }

    needle.style.opacity = '1';
    const angle = needleAngle(a.consensusScore, a.overallDirection);
    needle.setAttribute('transform', 'rotate(' + angle.toFixed(1) + ' 100 100)');

    label.textContent = a.consensusText;
    label.className = 'gauge-label ' + a.consensusLabel;

    score.textContent = 'Fuerza de consenso: ' + a.consensusScore.toFixed(0) + '%';
  }

  function renderAlerts() {
    const a = state.analysis;
    const card = $('alertCard');
    const list = $('alertList');

    if (!a || !a.alerts || a.alerts.length === 0) {
      card.hidden = true;
      list.innerHTML = '';
      return;
    }

    card.hidden = false;
    list.innerHTML = a.alerts.map(function (alert) {
      return '<li><strong>[' + alert.type.toUpperCase() + ']</strong> ' + esc(alert.text) + '</li>';
    }).join('');
  }

  function renderMetrics() {
    const a = state.analysis;
    if (!a) return;
    $('macroTrend').textContent = a.macroTrend || '—';
    $('macroMomentum').textContent = a.macroMomentum || '—';
    $('macroVolatility').textContent = a.macroVolatility || '—';
    
    let structTxt = 'Lateral';
    let structCls = 'metric-val';
    if (a.consensusLabel !== 'neutral') {
      structTxt = a.overallDirection === 1 ? 'Alcista' : 'Bajista';
      structCls += ' ' + (a.overallDirection === 1 ? 'up' : 'down');
    }
    const el = $('macroStructure');
    el.textContent = structTxt;
    el.className = structCls;
  }

  function renderMtf() {
    const a = state.analysis;
    const box = $('mtf');
    let html = '';

    CFG.timeframes.forEach(function (tf) {
      const tfData = a && a.perTf ? a.perTf[tf] : null;
      let lab = '…', key = 'neutral';

      if (tfData) {
        if (tfData.direction === 1) { lab = 'Alcista'; key = 'buy'; }
        else { lab = 'Bajista'; key = 'sell'; }
      } else if (a) {
        lab = '—';
      }

      html += '<button data-tf="' + tf + '" class="' + (tf === state.tf ? 'active' : '') + '">' +
        '<span class="tfn">' + tf + '</span>' +
        '<span class="lab ' + key + '">' + lab + '</span>' +
        '</button>';
    });
    box.innerHTML = html;
  }

  function renderConclusion() {
    const a = state.analysis;
    const el = $('conclusionText');
    if (!a) {
      el.textContent = 'Esperando datos suficientes para generar un veredicto...';
      return;
    }
    el.textContent = a.conclusion;
  }

  function renderChart() {
    if (!chart) return;
    const bars = state.bars[state.tf] || [];
    const inst = CFG.symbols[state.symbol];
    chart.setData(bars, { tf: state.tf, digits: inst.digits });
  }

  function renderAll() {
    renderStatus();
    renderPrice();
    renderGauge();
    renderAlerts();
    renderMetrics();
    renderMtf();
    renderConclusion();
    renderChart();
  }

  function runAnalysis() {
    const res = A.analyze(state.bars);
    state.analysis = res;
    renderAll();
  }

  function loadAllBars() {
    state.loading = true;
    const tasks = CFG.timeframes.map(function (tf) {
      return function () { return D.fetchBars(state.symbol, tf, 500); };
    });

    return D.pool(tasks, 3).then(function (results) {
      state.bars = {};
      results.forEach(function (r, i) {
        if (r.ok) {
          state.bars[CFG.timeframes[i]] = r.v;
        }
      });
      state.loading = false;
      runAnalysis();
    });
  }

  function selectSymbol(sym) {
    if (state.symbol === sym) return;
    state.symbol = sym;
    state.bars = {};
    state.analysis = null;
    
    Array.from($('symbolBar').children).forEach(function (b) {
      b.classList.toggle('active', b.dataset.sym === sym);
    });

    renderAll();
    loadAllBars();
  }

  function buildSymbolBar() {
    const bar = $('symbolBar');
    bar.innerHTML = '';
    Object.keys(CFG.symbols).forEach(function (sym) {
      const b = document.createElement('button');
      b.className = 'sym' + (sym === state.symbol ? ' active' : '');
      b.dataset.sym = sym;
      b.innerHTML = '<span class="sym-name">' + sym + '</span>' +
                    '<span class="sym-price">—</span>' +
                    '<span class="sym-chg muted">&nbsp;</span>';
      b.addEventListener('click', function () { selectSymbol(sym); });
      bar.appendChild(b);
    });
  }

  function updateSymbolBarPrices() {
    Array.from($('symbolBar').children).forEach(function (b) {
      const sym = b.dataset.sym;
      const t = state.ticks[sym];
      const p = b.querySelector('.sym-price');
      const c = b.querySelector('.sym-chg');
      
      if (t) {
        p.textContent = fmt(sym, t.mid);
        if (t.dayPct != null && t.state !== 'closed') {
          c.textContent = sgn(t.dayPct, 2) + '%';
          c.className = 'sym-chg ' + (t.dayPct >= 0 ? 'up' : 'down');
        } else {
          c.textContent = ' ';
          c.className = 'sym-chg muted';
        }
      }
    });
  }

  function onTick(tick) {
    state.ticks[tick.symbol] = tick;

    if (tick.symbol === state.symbol) {
      const tfMs = D.TF;
      Object.keys(state.bars).forEach(function (tf) {
        const ms = tfMs[tf];
        if (ms) D.applyTick(state.bars[tf], ms, tick.mid, tick.ts);
      });

      if (renderTimer) return;
      renderTimer = setTimeout(function () {
        renderTimer = null;
        updateSymbolBarPrices();
        runAnalysis();
      }, 200);
    } else {
      updateSymbolBarPrices();
    }
  }

  function initChart() {
    chart = AT.chart.create($('chart'), {
      onHover: function (bar) {
        const el = $('legend');
        if (!bar) { el.innerHTML = '&nbsp;'; return; }
        const f = function (p) { return fmt(state.symbol, p); };
        const chg = bar.o ? (bar.c - bar.o) / bar.o * 100 : 0;
        el.textContent = 'A ' + f(bar.o) + '  Máx ' + f(bar.h) + '  Mín ' + f(bar.l) +
          '  C ' + f(bar.c) + '  ' + sgn(chg, 2) + '%';
      }
    });
    $('zoomIn').addEventListener('click', function () { chart.zoom(0.8); });
    $('zoomOut').addEventListener('click', function () { chart.zoom(1.25); });
    $('zoomReset').addEventListener('click', function () { chart.reset(); });

    $('mtf').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-tf]');
      if (!b) return;
      state.tf = b.dataset.tf;
      renderMtf();
      renderChart();
    });
  }

  function startFeed() {
    const feed = D.createFeed(Object.keys(CFG.symbols), {
      tick: onTick,
      status: function (mode) {
        state.feedMode = mode;
        renderStatus();
      },
      loadClient: function () {
        return new Promise(function (resolve) {
          if (window.signalR) { resolve(true); return; }
          const s = document.createElement('script');
          s.src = CFG.signalrUrl;
          s.onload = function () { resolve(!!window.signalR); };
          s.onerror = function () { resolve(false); };
          document.head.appendChild(s);
        });
      }
    });
    feed.start();
  }

  function init() {
    buildSymbolBar();
    initChart();
    startFeed();
    
    D.fetchLatest(Object.keys(CFG.symbols)).then(function (ticks) {
      ticks.forEach(function (t) { state.ticks[t.symbol] = t; });
      updateSymbolBarPrices();
      renderPrice();
    }).catch(function () {});

    loadAllBars().then(function () {
      D.fetchLatest(Object.keys(CFG.symbols)).then(function (ticks) {
        ticks.forEach(function (t) { state.ticks[t.symbol] = t; });
        renderAll();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();