(function () {
  'use strict';

  const AT = window.AT;
  const D = AT.data;
  const A = AT.analysis;
  const SMC = AT.smcEngine;
  const CFG = window.AT_CONFIG;

  const state = {
    symbol: 'XAUUSD',
    tf: '15m',
    bars: {},
    ticks: {},
    analysis: null,
    smcResult: null,
    feedMode: 'off',
    soundEnabled: true,
    signalLog: [],
    lastVerdictState: 'wait'
  };

  let chart = null, feed = null;

  function $ (id) { return document.getElementById(id); }

  function playAlertSound(type) {
    if (!state.soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === 'buy' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(type === 'buy' ? 587.33 : 329.63, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(type === 'buy' ? 880 : 220, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  function renderStatus() {
    const dot = $('statusDot'), txt = $('statusText');
    if (!dot || !txt) return;
    const m = state.feedMode;
    dot.className = 'conn-dot ' + (m === 'live' ? 'ok' : m === 'polling' ? 'warn' : 'bad');
    txt.textContent = m === 'live' ? 'En vivo' : m === 'polling' ? 'Sondeo activo' : 'Conectando…';
  }

  function renderPrice() {
    const t = state.ticks[state.symbol];
    const bars = state.bars[state.tf] || [];
    const price = t ? t.mid : (bars.length ? bars[bars.length - 1].c : null);
    const digits = CFG.symbols[state.symbol]?.digits || 2;

    const el = $('priceBig');
    if (el) el.textContent = price != null ? price.toFixed(digits) : '—';

    const chg = $('priceChg');
    if (chg && t && t.dayPct != null) {
      chg.textContent = (t.dayPct >= 0 ? '+' : '') + t.dayPct.toFixed(2) + '% hoy';
      chg.className = 'price-chg ' + (t.dayPct >= 0 ? 'up' : 'down');
    }
  }

  function renderGauge() {
    const a = state.analysis;
    const needle = $('needle'), label = $('gaugeLabel'), scoreTag = $('gaugeScore');
    if (!a || !needle) return;

    const angle = (a.consensusScore / 100) * 90 * a.overallDirection;
    needle.setAttribute('transform', 'rotate(' + angle.toFixed(1) + ' 100 100)');
    label.textContent = a.consensusText;
    label.className = 'gauge-text ' + (a.overallDirection === 1 ? 'up' : a.overallDirection === -1 ? 'down' : 'neutral');
    scoreTag.textContent = a.consensusScore.toFixed(0) + '%';
  }

  function renderVerdict() {
    const a = state.analysis, smc = state.smcResult;
    const badge = $('verdictBadge'), reason = $('verdictReason'), confTag = $('verdictConfidence');
    const levelsBox = $('tradeLevels'), banner = $('signalBanner');
    if (!badge || !a) return;

    confTag.textContent = 'Confianza: ' + a.confidence.toFixed(0) + '%';
    const isBuy = a.overallDirection === 1 && smc && smc.score >= 50;
    const isSell = a.overallDirection === -1 && smc && smc.score >= 50;

    if (isBuy || isSell) {
      const type = isBuy ? 'buy' : 'sell';
      const label = isBuy ? '▲ COMPRA INSTITUCIONAL' : '▼ VENTA INSTITUCIONAL';
      badge.innerHTML = '<span class="signal-icon">' + (isBuy ? '▲' : '▼') + '</span><span class="signal-label">' + label + '</span>';
      badge.className = 'signal-pill ' + type;
      reason.textContent = smc.reasons[0] || 'Confluencia SMC y multi-temporal confirmada.';

      const price = state.ticks[state.symbol]?.mid || barsLastClose();
      if (price) {
        levelsBox.hidden = false;
        const stop = isBuy ? price * 0.995 : price * 1.005;
        const target = isBuy ? price * 1.015 : price * 0.985;
        $('lvlEntry').textContent = price.toFixed(2);
        $('lvlStop').textContent = stop.toFixed(2);
        $('lvlTarget').textContent = target.toFixed(2);
        $('lvlRR').textContent = '1 : 3.0';

        if (state.lastVerdictState !== type) {
          state.lastVerdictState = type;
          playAlertSound(type);
          if (banner) {
            banner.hidden = false;
            banner.className = 'signal-banner ' + (type === 'sell' ? 'sell-alert' : '');
            $('signalBannerDetail').textContent = label + ' en ' + state.symbol + ' a ' + price.toFixed(2);
          }
          logSignal(type, price, stop, target);
        }
      }
    } else {
      badge.innerHTML = '<span class="signal-icon">◷</span><span class="signal-label">ESPERANDO SETUP</span>';
      badge.className = 'signal-pill wait';
      reason.textContent = 'Sin confluencia suficiente entre estructura SMC y momentum.';
      levelsBox.hidden = true;
      state.lastVerdictState = 'wait';
    }
  }

  function barsLastClose() {
    const bars = state.bars[state.tf];
    return bars && bars.length ? bars[bars.length - 1].c : null;
  }

  function logSignal(type, entry, stop, target) {
    const list = $('signalHistory');
    if (!list) return;
    if (state.signalLog.length === 0) list.innerHTML = '';
    const item = document.createElement('li');
    item.className = 'log-item ' + type;
    item.innerHTML = '<span><strong>' + state.symbol + '</strong> (' + state.tf + ')</span>' +
                     '<span class="' + type + '">' + type.toUpperCase() + ' @ ' + entry.toFixed(2) + '</span>' +
                     '<span>TP: ' + target.toFixed(2) + '</span>';
    list.prepend(item);
    state.signalLog.push({ type: type, entry: entry });
    $('signalCount').textContent = state.signalLog.length + ' señales';
  }

  function renderSMC() {
    const smc = state.smcResult;
    const scoreEl = $('smcScore'), barEl = $('smcBarFill'), reasonsEl = $('smcReasons');
    if (!scoreEl || !smc) return;

    scoreEl.textContent = smc.score.toFixed(0) + '%';
    barEl.style.width = smc.score + '%';
    reasonsEl.innerHTML = smc.reasons.map(function (r) { return '<li>' + r + '</li>'; }).join('');
  }

  function renderMtf() {
    const box = $('mtf');
    if (!box) return;
    const tfs = CFG.timeframes.list;
    if (box.children.length === 0) {
      box.innerHTML = tfs.map(function (tf) {
        return '<button type="button" class="tf-btn ' + (tf === state.tf ? 'active' : '') + '" data-tf="' + tf + '">' + tf + '</button>';
      }).join('');
    }
  }

  function renderAll() {
    renderStatus();
    renderPrice();
    renderGauge();
    renderVerdict();
    renderSMC();
    if (chart) {
      chart.setData(state.bars[state.tf] || []);
      if (state.smcResult) chart.setZones(state.smcResult.zones);
    }
  }

  function runCycle() {
    try {
      state.analysis = A.analyze(state.bars);
      const entryBars = state.bars[state.tf] || [];
      state.smcResult = SMC.evaluate(entryBars, state.analysis.overallDirection);
      renderAll();
    } catch (e) {
      console.error('[App] Error en ciclo:', e);
    }
  }

  function loadSymbolBars(sym) {
    const tfs = CFG.timeframes.list;
    const tasks = tfs.map(function (tf) {
      return function () { return D.fetchBars(sym, tf, 200); };
    });
    return D.pool(tasks, 3).then(function (results) {
      state.bars = {};
      results.forEach(function (r, i) {
        if (r && r.ok) state.bars[tfs[i]] = r.v;
      });
      runCycle();
    });
  }

  function selectSymbol(sym) {
    if (state.symbol === sym) return;
    state.symbol = sym;
    document.querySelectorAll('.sym').forEach(function (b) {
      b.classList.toggle('active', b.dataset.sym === sym);
    });
    loadSymbolBars(sym);
  }

  function buildSymbolBar() {
    const bar = $('symbolBar');
    if (!bar) return;
    bar.innerHTML = Object.keys(CFG.symbols).map(function (sym) {
      return '<button type="button" class="sym ' + (sym === state.symbol ? 'active' : '') + '" data-sym="' + sym + '">' +
               '<span class="sym-name">' + sym + '</span>' +
               '<span class="sym-price">—</span>' +
             '</button>';
    }).join('');

    bar.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-sym]');
      if (btn) selectSymbol(btn.dataset.sym);
    });
  }

  function initChart() {
    const canvas = $('chart');
    if (!canvas) return;
    chart = AT.chart.create(canvas);

    $('zoomIn').addEventListener('click', function () { chart.zoom(0.85); });
    $('zoomOut').addEventListener('click', function () { chart.zoom(1.15); });
    $('zoomReset').addEventListener('click', function () { chart.reset(); });
    $('chartFullscreen').addEventListener('click', function () {
      const card = $('chartCard');
      if (!document.fullscreenElement) card.requestFullscreen();
      else document.exitFullscreen();
    });

    $('mtf').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-tf]');
      if (btn) {
        state.tf = btn.dataset.tf;
        document.querySelectorAll('.tf-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tf === state.tf); });
        runCycle();
      }
    });

    $('soundToggle').addEventListener('click', function () {
      state.soundEnabled = !state.soundEnabled;
      $('soundToggle').classList.toggle('active', state.soundEnabled);
    });

    $('signalBannerClose').addEventListener('click', function () {
      $('signalBanner').hidden = true;
    });
  }

  function init() {
    buildSymbolBar();
    renderMtf();
    initChart();

    feed = D.createFeed(Object.keys(CFG.symbols), {
      tick: function (t) {
        state.ticks[t.symbol] = t;
        if (t.symbol === state.symbol) {
          D.applyTick(state.bars[state.tf], D.TF[state.tf] || 900000, t.mid, t.ts);
          renderPrice();
        }
      },
      status: function (mode) { state.feedMode = mode; renderStatus(); }
    });
    feed.start();

    loadSymbolBars(state.symbol);
    setInterval(runCycle, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
