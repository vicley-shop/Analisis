(function () {
  'use strict';

  const AT = window.AT;
  const D = AT.data;
  const A = AT.analysis;
  const SMC = AT.smcEngine;
  const CFG = window.AT_CONFIG;

  const state = {
    symbol: 'XAUUSD',
    tf: (CFG.timeframes && CFG.timeframes.entry) || '1h',
    bars: {},
    ticks: {},
    analysis: null,
    smcResult: null,
    feedMode: 'off',
    loading: false,
    requestId: 0,
    renderTimer: null,
    analysisTimer: null,
    lastAnalysisAt: 0,
    signalLog: [],
    lastVerdictState: 'wait'
  };

  let chart = null;
  let feed = null;

  const MAX_SIGNAL_LOG = 200;

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(sym, price) {
    const inst = CFG.symbols[sym];
    if (!inst || price == null || !Number.isFinite(price)) return '—';
    return Number(price).toFixed(inst.digits);
  }

  function sgn(v, d) {
    if (v == null || !Number.isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(d);
  }

  function needleAngle(score, dir) {
    if (dir === 0 || dir == null) return 0;
    const s = Math.max(0, Math.min(100, score || 0));
    return (s / 100) * 90 * dir;
  }

  function renderStatus() {
    const dot = $('statusDot');
    const txt = $('statusText');
    if (!dot || !txt) return;
    const m = state.feedMode;
    let cls = '';
    let msg = 'Conectando…';
    if (m === 'live') { cls = 'ok'; msg = 'En vivo'; }
    else if (m === 'polling') { cls = 'warn'; msg = 'Sondeo'; }
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

    const sb = $('sessionBadge');
    const active = state.analysis ? state.analysis.sessionActive : false;
    sb.textContent = active ? '✓ Sesión activa' : '✗ Fuera de sesión';
    sb.className = 'session-badge ' + (active ? 'ok' : 'bad');
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

    const parts = ['Consenso: ' + a.consensusScore.toFixed(0) + '%'];
    if (Number.isFinite(a.confidence)) parts.push('confianza: ' + a.confidence.toFixed(0) + '%');
    score.textContent = parts.join(' · ');
  }

  function renderVerdict() {
    const a = state.analysis;
    const badge = $('verdictBadge');
    const reason = $('verdictReason');

    if (!a) {
      badge.textContent = 'ESPERAR';
      badge.className = 'verdict-badge wait';
      reason.textContent = 'Esperando datos del mercado...';
      return;
    }

    badge.textContent = a.verdictLabel;
    badge.className = 'verdict-badge ' + a.verdictState;

    let text = a.verdictReason || '';
    if (a.verdictRisk && a.verdictRisk.valid) {
      const r = a.verdictRisk;
      text += ' · Stop ' + fmt(state.symbol, r.stop) + ' · Target ' + fmt(state.symbol, r.target);
    }
    if (!a.sessionActive) {
      text = '⚠️ ' + text;
    }
    reason.textContent = text;
  }

  function renderSMC() {
    const smc = state.smcResult;
    const scoreEl = $('smcScore');
    const barEl = $('smcBarFill');
    const reasonsEl = $('smcReasons');

    if (!smc) {
      scoreEl.textContent = '0%';
      barEl.style.width = '0%';
      barEl.style.backgroundColor = 'var(--ema2)';
      reasonsEl.innerHTML = '<li class="muted">Esperando datos...</li>';
      return;
    }

    scoreEl.textContent = smc.score.toFixed(0) + '%';
    barEl.style.width = smc.score + '%';

    if (smc.score >= 80) {
      barEl.style.backgroundColor = 'var(--up)';
      scoreEl.style.color = 'var(--up)';
    } else if (smc.score >= 50) {
      barEl.style.backgroundColor = 'var(--warn)';
      scoreEl.style.color = 'var(--warn)';
    } else {
      barEl.style.backgroundColor = 'var(--down)';
      scoreEl.style.color = 'var(--down)';
    }

    const lines = [];
    const bd = smc.breakdown || {};
    const order = ['mss', 'sweep', 'fvg', 'ob', 'ote', 'penalty'];
    const names = { mss: 'Estructura', sweep: 'Sweep', fvg: 'FVG', ob: 'Order Block', ote: 'OTE', penalty: 'Penalización' };

    order.forEach(function (key) {
      const e = bd[key];
      if (!e || !e.weighted) return;
      const sign = key === 'penalty' ? '−' : '+';
      const val = Math.abs(e.weighted).toFixed(1);
      const detail = e.reason ? ' — ' + e.reason : '';
      lines.push('<li>' + esc(names[key] || key) + ': ' + sign + val + esc(detail) + '</li>');
    });

    if (lines.length === 0) {
      lines.push('<li class="muted">Sin componentes ponderados.</li>');
    }

    if (smc.vetoes && smc.vetoes.length) {
      smc.vetoes.forEach(function (v) {
        lines.push('<li style="color: var(--warn)">⚠️ ' + esc(v) + '</li>');
      });
    }

    reasonsEl.innerHTML = lines.join('');
  }

  function renderAlerts() {
    const a = state.analysis;
    const card = $('alertCard');
    const list = $('alertList');

    if (!a) {
      card.hidden = true;
      list.innerHTML = '';
      return;
    }

    const alerts = (a.alerts || []).slice();
    if (!a.sessionActive) {
      alerts.unshift({ type: 'warn', text: 'Fuera de sesión activa. Baja liquidez, spreads más anchos.' });
    }

    if (alerts.length === 0) {
      card.hidden = true;
      list.innerHTML = '';
      return;
    }

    card.hidden = false;
    list.innerHTML = alerts.map(function (alert) {
      return '<li><strong>[' + esc(alert.type.toUpperCase()) + ']</strong> ' + esc(alert.text) + '</li>';
    }).join('');
  }

  function renderMetrics() {
    const a = state.analysis;
    if (!a) return;

    const tEl = $('macroTrend');
    let trendTxt = a.macroTrend || '—';
    if (Number.isFinite(a.avgAdxAligned) && a.avgAdxAligned > 0) {
      trendTxt += ' (' + a.avgAdxAligned.toFixed(1) + ')';
    }
    tEl.textContent = trendTxt;

    const oEl = $('macroMomentum');
    oEl.textContent = a.macroMomentum || '—';

    const vEl = $('macroVolatility');
    vEl.textContent = a.macroVolatility || '—';

    const sEl = $('macroStructure');
    let structTxt = 'Lateral';
    let structCls = 'metric-val';
    if (a.consensusLabel !== 'neutral' && a.overallDirection !== 0) {
      structTxt = a.overallDirection === 1 ? 'Alcista' : 'Bajista';
      structCls += ' ' + (a.overallDirection === 1 ? 'up' : 'down');
      if (Number.isFinite(a.avgAdxOpposed) && a.avgAdxOpposed > 0) {
        structTxt += ' · contra ' + a.avgAdxOpposed.toFixed(1);
      }
    }
    sEl.textContent = structTxt;
    sEl.className = structCls;
  }

  function renderMtf() {
    const a = state.analysis;
    const box = $('mtf');
    const tfs = CFG.timeframes.list || ['15m', '1h', '4h', '1d'];

    if (box.children.length !== tfs.length) {
      let html = '';
      tfs.forEach(function (tf) {
        html += '<button data-tf="' + esc(tf) + '">' +
          '<span class="tfn">' + esc(tf) + '</span>' +
          '<span class="lab neutral">—</span>' +
          '</button>';
      });
      box.innerHTML = html;
    }

    Array.prototype.forEach.call(box.children, function (btn) {
      const tf = btn.dataset.tf;
      const tfData = a && a.perTf ? a.perTf[tf] : null;
      const active = tf === state.tf;
      if (active) btn.classList.add('active'); else btn.classList.remove('active');

      const lab = btn.querySelector('.lab');
      if (!lab) return;

      if (tfData) {
        if (tfData.direction === 1) { lab.textContent = 'Alcista'; lab.className = 'lab buy'; }
        else { lab.textContent = 'Bajista'; lab.className = 'lab sell'; }
      } else if (a) {
        lab.textContent = '—';
        lab.className = 'lab neutral';
      } else {
        lab.textContent = '…';
        lab.className = 'lab neutral';
      }
    });
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
    if (!inst) return;
    chart.setData(bars, { tf: state.tf, digits: inst.digits });

    if (state.smcResult && state.smcResult.zones) {
      chart.setZones(state.smcResult.zones);
    } else {
      chart.setZones(null);
    }
  }

  function renderAll() {
    renderStatus();
    renderPrice();
    renderGauge();
    renderVerdict();
    renderSMC();
    renderAlerts();
    renderMetrics();
    renderMtf();
    renderConclusion();
    renderChart();
  }

  function logSignalIfChanged(analysis) {
    if (!analysis) return;
    const prev = state.lastVerdictState;
    const curr = analysis.verdictState;
    if (curr !== prev && (curr === 'buy' || curr === 'sell')) {
      state.signalLog.push({
        ts: Date.now(),
        symbol: state.symbol,
        tf: analysis.entryTf,
        direction: analysis.overallDirection,
        price: analysis.verdictRisk ? analysis.verdictRisk.stop : null,
        target: analysis.verdictRisk ? analysis.verdictRisk.target : null,
        rr: analysis.verdictRisk ? analysis.verdictRisk.rr : null,
        score: analysis.consensusScore,
        confidence: analysis.confidence
      });
      if (state.signalLog.length > MAX_SIGNAL_LOG) state.signalLog.shift();
    }
    state.lastVerdictState = curr;
  }

  function runAnalysis() {
    state.lastAnalysisAt = Date.now();

    const res = A.analyze(state.bars, { currentTf: state.tf, symbol: state.symbol });
    state.analysis = res;

    const entryTf = res.entryTf || state.tf;
    const entryBarsRaw = state.bars[entryTf];

    if (entryBarsRaw && entryBarsRaw.length > 50) {
      const closedBars = entryBarsRaw.slice(0, -1);
      const smcCtx = {
        confidence: res.confidence,
        sessionActive: res.sessionActive,
        entryTf: entryTf
      };
      state.smcResult = SMC.evaluate(closedBars, res.overallDirection, smcCtx);
    } else {
      state.smcResult = {
        score: 0,
        label: 'Sin datos',
        reasons: ['Esperando suficientes velas históricas…'],
        vetoes: ['Historial insuficiente'],
        breakdown: {},
        zones: {},
        direction: 0,
        trend: 'Débil'
      };
    }

    logSignalIfChanged(res);
    renderAll();
  }

  function scheduleAnalysis(force) {
    const throttleMs = (CFG.analysis && CFG.analysis.throttleMs) || 1000;
    const elapsed = Date.now() - state.lastAnalysisAt;

    if (force) {
      if (state.analysisTimer) {
        clearTimeout(state.analysisTimer);
        state.analysisTimer = null;
      }
      runAnalysis();
      return;
    }

    if (state.analysisTimer) return;

    if (elapsed >= throttleMs) {
      runAnalysis();
      return;
    }

    state.analysisTimer = setTimeout(function () {
      state.analysisTimer = null;
      runAnalysis();
    }, throttleMs - elapsed);
  }

  function loadAllBars() {
    state.loading = true;
    state.requestId++;
    const myId = state.requestId;
    const tfs = CFG.timeframes.list || ['15m', '1h', '4h', '1d'];

    const tasks = tfs.map(function (tf) {
      return function () { return D.fetchBars(state.symbol, tf, 1000); };
    });

    return D.pool(tasks, 3, 20000).then(function (results) {
      if (state.requestId !== myId) return null;
      state.bars = {};
      results.forEach(function (r, i) {
        if (r.ok) state.bars[tfs[i]] = r.v;
      });
      state.loading = false;
      runAnalysis();
      return results;
    }).catch(function (err) {
      if (state.requestId !== myId) return null;
      state.loading = false;
      console.error('loadAllBars:', err.message || err);
      renderAll();
      return null;
    });
  }

  function selectSymbol(sym) {
    if (state.symbol === sym) return;
    state.symbol = sym;
    state.bars = {};
    state.analysis = null;
    state.smcResult = null;
    state.lastVerdictState = 'wait';

    Array.prototype.forEach.call($('symbolBar').children, function (b) {
      if (b.dataset.sym === sym) b.classList.add('active');
      else b.classList.remove('active');
    });

    renderAll();
    loadAllBars();
  }

  function buildSymbolBar() {
    const bar = $('symbolBar');
    bar.innerHTML = '';
    Object.keys(CFG.symbols).forEach(function (sym) {
      const def = CFG.symbols[sym];
      if (def.enabled === false) return;
      const b = document.createElement('button');
      b.className = 'sym' + (sym === state.symbol ? ' active' : '');
      b.dataset.sym = sym;
      b.innerHTML = '<span class="sym-name">' + esc(sym) + '</span>' +
                    '<span class="sym-price">—</span>' +
                    '<span class="sym-chg muted">&nbsp;</span>';
      b.addEventListener('click', function () { selectSymbol(sym); });
      bar.appendChild(b);
    });
  }

  function updateSymbolBarPrices() {
    Array.prototype.forEach.call($('symbolBar').children, function (b) {
      const sym = b.dataset.sym;
      const t = state.ticks[sym];
      const p = b.querySelector('.sym-price');
      const c = b.querySelector('.sym-chg');
      if (!t) return;
      p.textContent = fmt(sym, t.mid);
      if (t.dayPct != null && t.state !== 'closed') {
        c.textContent = sgn(t.dayPct, 2) + '%';
        c.className = 'sym-chg ' + (t.dayPct >= 0 ? 'up' : 'down');
      } else {
        c.textContent = ' ';
        c.className = 'sym-chg muted';
      }
    });
  }

  function onTick(tick) {
    if (!tick || !tick.symbol) return;
    state.ticks[tick.symbol] = tick;

    if (tick.symbol !== state.symbol) {
      updateSymbolBarPrices();
      return;
    }

    if (tick.stale) return;

    let newBar = false;
    const tfMs = D.TF;
    Object.keys(state.bars).forEach(function (tf) {
      const ms = tfMs[tf];
      if (ms && state.bars[tf] && state.bars[tf].length) {
        const result = D.applyTick(state.bars[tf], ms, tick.mid, tick.ts);
        if (result === 'new') newBar = true;
      }
    });

    if (state.renderTimer) return;
    state.renderTimer = setTimeout(function () {
      state.renderTimer = null;
      updateSymbolBarPrices();
      renderPrice();
      scheduleAnalysis(newBar);
    }, 100);
  }

  function initChart() {
    const canvas = $('chart');
    if (!canvas) return;

    chart = AT.chart.create(canvas, {
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

    const chartCard = document.querySelector('.chart-card');
    $('chartFullscreen').addEventListener('click', function () {
      if (!document.fullscreenElement) {
        if (chartCard.requestFullscreen) {
          chartCard.requestFullscreen().catch(function (err) {
            console.log('Fullscreen:', err.message);
          });
        }
      } else {
        document.exitFullscreen();
      }
    });

    document.addEventListener('fullscreenchange', function () {
      if (chart) chart.resize();
    });

    $('mtf').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-tf]');
      if (!b) return;
      state.tf = b.dataset.tf;
      renderMtf();
      renderChart();
      scheduleAnalysis(true);
    });
  }

  function startFeed() {
    feed = D.createFeed(Object.keys(CFG.symbols), {
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

    loadAllBars().then(function (results) {
      if (!results) return;
      D.fetchLatest(Object.keys(CFG.symbols)).then(function (ticks) {
        ticks.forEach(function (t) { state.ticks[t.symbol] = t; });
        updateSymbolBarPrices();
        renderAll();
      }).catch(function () {});
    });
  }

  function cleanup() {
    if (chart) { chart.destroy(); chart = null; }
    if (feed) { feed.stop(); feed = null; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', cleanup);

  AT.app = {
    getSignalLog: function () { return state.signalLog.slice(); },
    getState: function () { return state; }
  };
})();