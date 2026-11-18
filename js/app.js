(function () {
  'use strict';

  const AT = window.AT;
  const D = AT.data;
  const A = AT.analysis;
  const SMC = AT.smcEngine;
  const CFG = window.AT_CONFIG;

  const state = {
    symbol: 'XAUUSD',
    tf: (CFG.timeframes && CFG.timeframes.entry) || '15m',
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
    lastVerdictState: 'wait',
    currentTool: 'cursor',
    drawMenuOpen: false,
    tickBuffer: new Map(),
    rafId: 0,
    gapRefill: {}
  };

  let chart = null;
  let feed = null;

  const MAX_SIGNAL_LOG = 500;

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

  function flushTicks() {
    if (state.rafId) return;
    state.rafId = requestAnimationFrame(function () {
      state.rafId = 0;
      const buffer = state.tickBuffer;
      state.tickBuffer = new Map();
      buffer.forEach(function (tick) { processTick(tick); });
    });
  }

  function refillGap(tf) {
    if (!state.gapRefill) state.gapRefill = {};
    if (state.gapRefill[tf]) return;
    state.gapRefill[tf] = true;

    const myId = state.requestId;
    D.fetchBars(state.symbol, tf, 1000).then(function (bars) {
      if (state.requestId !== myId) return;
      if (bars && bars.length) {
        state.bars[tf] = bars;
        if (chart && state.tf === tf) {
          const inst = CFG.symbols[state.symbol];
          if (inst) chart.setData(bars, { tf: state.tf, digits: inst.digits, symbol: state.symbol });
        }
        scheduleAnalysis(true);
      }
    }).catch(function () { void 0; }).then(function () {
      if (state.gapRefill) delete state.gapRefill[tf];
    });
  }

  function processTick(tick) {
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
        if (result === 'gap') { newBar = true; refillGap(tf); }
      }
    });

    if (chart) {
      const bars = state.bars[state.tf];
      const inst = CFG.symbols[state.symbol];
      if (bars && bars.length && inst) {
        chart.setData(bars, { tf: state.tf, digits: inst.digits, symbol: state.symbol });
      }
    }

    updateSymbolBarPrices();
    renderPrice();
    scheduleAnalysis(newBar);
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
    const a = state.analysis;
    const open = a ? a.marketOpen : false;
    const label = a ? a.sessionLabel : '—';
    sb.textContent = label;
    sb.className = 'session-badge ' + (open ? 'ok' : 'bad');
    sb.title = open
      ? (a && a.highLiquidity ? 'Mercado abierto, liquidez alta' : 'Mercado abierto, liquidez normal')
      : 'Mercado cerrado';
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
    reason.textContent = text;
  }

  function renderSMC() {
    const smc = state.smcResult;
    const scoreEl = $('smcScore');
    const barEl = $('smcBarFill');
    const reasonsEl = $('smcReasons');

    if (!smc) {
      scoreEl.textContent = '0%';
      scoreEl.style.color = 'var(--accent)';
      barEl.style.width = '0%';
      barEl.style.backgroundColor = 'var(--accent)';
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
    const order = ['mss', 'sweep', 'fvg', 'ob', 'ote', 'penalty', 'vetoed'];
    const names = {
      mss: 'Estructura', sweep: 'Sweep', fvg: 'FVG', ob: 'Order Block',
      ote: 'OTE', penalty: 'Penalización', vetoed: 'Veto'
    };

    order.forEach(function (key) {
      const e = bd[key];
      if (!e || !e.weighted) return;
      const sign = (key === 'penalty' || key === 'vetoed') ? '−' : '+';
      const val = Math.abs(e.weighted).toFixed(1);
      const detail = e.reason ? ' — ' + e.reason : '';
      lines.push('<li>' + esc(names[key] || key) + ': ' + sign + val + esc(detail) + '</li>');
    });

    if (lines.length === 0) lines.push('<li class="muted">Sin componentes ponderados.</li>');

    if (smc.vetoes && smc.vetoes.length) {
      smc.vetoes.forEach(function (v) {
        lines.push('<li style="color: var(--warn)">⚠ ' + esc(v) + '</li>');
      });
    }

    reasonsEl.innerHTML = lines.join('');
  }

  function renderAlerts() {
    const a = state.analysis;
    const card = $('alertCard');
    const list = $('alertList');

    if (!a) { card.hidden = true; list.innerHTML = ''; return; }

    const alerts = a.alerts || [];
    if (alerts.length === 0) { card.hidden = true; list.innerHTML = ''; return; }

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

    $('macroMomentum').textContent = a.macroMomentum || '—';
    $('macroVolatility').textContent = a.macroVolatility || '—';

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
    const allTfs = CFG.timeframes.list || ['15m', '1h', '4h', '1d'];
    const optional = CFG.timeframes.optional || [];

    if (box.children.length !== allTfs.length) {
      let html = '';
      allTfs.forEach(function (tf) {
        const isOpt = optional.indexOf(tf) !== -1;
        const selected = tf === state.tf ? 'true' : 'false';
        html += '<button type="button" role="tab" data-tf="' + esc(tf) + '"' +
          ' aria-selected="' + selected + '"' +
          (isOpt ? ' data-optional="true"' : '') + '>' +
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
      if (active) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
      else { btn.classList.remove('active'); btn.setAttribute('aria-selected', 'false'); }

      const lab = btn.querySelector('.lab');
      if (!lab) return;

      if (tfData) {
        if (tfData.direction === 1) { lab.textContent = 'Alcista'; lab.className = 'lab buy'; }
        else { lab.textContent = 'Bajista'; lab.className = 'lab sell'; }
        if (tfData.regimeValid === false) {
          lab.textContent += ' ·';
          lab.title = 'Régimen no válido';
        } else {
          lab.title = '';
        }
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
    chart.setData(bars, { tf: state.tf, digits: inst.digits, symbol: state.symbol });

    const z = state.smcResult && state.smcResult.zones;
    const hasZones = z && (z.ob || z.fvg || z.ote);
    chart.setZones(hasZones ? z : null);
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

  function currentEntryPrice() {
    const t = state.ticks[state.symbol];
    if (t && Number.isFinite(t.mid)) return t.mid;
    const bars = state.bars[state.tf];
    if (bars && bars.length) return bars[bars.length - 1].c;
    return null;
  }

  function logSignalIfChanged(analysis) {
    if (!analysis) return;
    const prev = state.lastVerdictState;
    const curr = analysis.verdictState;

    if (curr !== prev && (curr === 'buy' || curr === 'sell') && analysis.verdictRisk) {
      const entryPrice = currentEntryPrice();
      if (entryPrice != null) {
        state.signalLog.push({
          ts: Date.now(),
          symbol: state.symbol,
          tf: analysis.entryTf,
          direction: analysis.overallDirection,
          entryPrice: entryPrice,
          stopPrice: analysis.verdictRisk.stop,
          targetPrice: analysis.verdictRisk.target,
          rr: analysis.verdictRisk.rr,
          score: analysis.consensusScore,
          confidence: analysis.confidence
        });
        if (state.signalLog.length > MAX_SIGNAL_LOG) state.signalLog.shift();
      }
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
      const analysisCfg = CFG.analysis || {};
      const useClosed = analysisCfg.useClosedCandlesOnly !== false;
      const closedBars = (useClosed && entryBarsRaw.length > 1)
        ? entryBarsRaw.slice(0, -1)
        : entryBarsRaw;

      const smcCtx = {
        confidence: res.confidence,
        marketOpen: res.marketOpen,
        sessionActive: res.highLiquidity,
        entryTf: entryTf
      };
      state.smcResult = SMC.evaluate(closedBars, res.overallDirection, smcCtx);
    } else {
      state.smcResult = {
        score: 0,
        label: 'Sin datos',
        reasons: ['Esperando velas históricas…'],
        vetoes: ['Historial insuficiente'],
        breakdown: {},
        zones: { ob: null, fvg: null, ote: null, allOBs: [], allFVGs: [] },
        direction: 0,
        trend: 'Débil',
        vetoed: true,
        grade: 'Débil',
        activeComponents: 0
      };
    }

    logSignalIfChanged(res);
    renderAll();
  }

  function scheduleAnalysis(force) {
    const throttleMs = (CFG.analysis && CFG.analysis.throttleMs) || 1000;
    const elapsed = Date.now() - state.lastAnalysisAt;

    if (force) {
      if (state.analysisTimer) { clearTimeout(state.analysisTimer); state.analysisTimer = null; }
      runAnalysis();
      return;
    }
    if (state.analysisTimer) return;
    if (elapsed >= throttleMs) { runAnalysis(); return; }
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
        if (r && r.ok) state.bars[tfs[i]] = r.v;
      });
      state.loading = false;
      runAnalysis();
      return results;
    }).catch(function (err) {
      if (state.requestId !== myId) return null;
      state.loading = false;
      const partial = err && err.partial;
      if (partial && Array.isArray(partial) && partial.length === tfs.length) {
        state.bars = {};
        partial.forEach(function (r, i) {
          if (r && r.ok) state.bars[tfs[i]] = r.v;
        });
        runAnalysis();
        return partial;
      }
      console.error('loadAllBars:', err.message || err);
      renderAll();
      return null;
    });
  }

  function selectSymbol(sym) {
    if (state.symbol === sym) return;
    const old = state.symbol;
    state.symbol = sym;
    state.bars = {};
    state.analysis = null;
    state.smcResult = null;
    state.lastVerdictState = 'wait';
    state.gapRefill = {};
    delete state.ticks[old];

    Array.prototype.forEach.call($('symbolBar').children, function (b) {
      if (b.dataset.sym === sym) {
        b.classList.add('active');
        b.setAttribute('aria-pressed', 'true');
      } else {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      }
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
      b.type = 'button';
      b.className = 'sym' + (sym === state.symbol ? ' active' : '');
      b.setAttribute('aria-pressed', sym === state.symbol ? 'true' : 'false');
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
    state.tickBuffer.set(tick.symbol, tick);
    flushTicks();
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

    $('chartFullscreen').addEventListener('click', function () {
      const chartCard = $('chartCard');
      if (!document.fullscreenElement) {
        if (chartCard.requestFullscreen) {
          chartCard.requestFullscreen().catch(function (err) { console.log('Fullscreen:', err.message); });
        }
      } else {
        document.exitFullscreen();
      }
    });

    document.addEventListener('fullscreenchange', function () {
      updateDrawVisibility();
      if (chart) chart.resize();
    });
    document.addEventListener('webkitfullscreenchange', function () {
      updateDrawVisibility();
      if (chart) chart.resize();
    });

    initDrawingMenu();
    initDrawingShortcuts();

    $('mtf').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-tf]');
      if (!b) return;
      state.tf = b.dataset.tf;
      renderMtf();
      renderChart();
      scheduleAnalysis(true);
    });
  }

  function isFullscreen() {
    return document.fullscreenElement === $('chartCard') ||
           document.webkitFullscreenElement === $('chartCard');
  }

  function updateDrawVisibility() {
    const toggle = $('drawToggle');
    if (!toggle) return;
    const fs = isFullscreen();
    const enabled = CFG.drawing && CFG.drawing.enabled !== false;
    if (fs && enabled) { toggle.hidden = false; }
    else { toggle.hidden = true; closeDrawingMenu(); setTool('cursor'); }
  }

  function openDrawingMenu() {
    const menu = $('drawingMenu');
    const toggle = $('drawToggle');
    if (!menu || !toggle) return;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    state.drawMenuOpen = true;
  }

  function closeDrawingMenu() {
    const menu = $('drawingMenu');
    const toggle = $('drawToggle');
    if (!menu || !toggle) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    state.drawMenuOpen = false;
  }

  function toggleDrawingMenu() {
    if (state.drawMenuOpen) closeDrawingMenu();
    else openDrawingMenu();
  }

  function setTool(tool) {
    state.currentTool = tool;
    const menu = $('drawingMenu');
    if (menu) {
      Array.prototype.forEach.call(menu.querySelectorAll('[data-tool]'), function (btn) {
        const isActive = btn.dataset.tool === tool;
        if (isActive) btn.classList.add('active'); else btn.classList.remove('active');
        btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
    }
    const toggle = $('drawToggle');
    if (toggle) {
      if (tool === 'cursor') toggle.classList.remove('active');
      else toggle.classList.add('active');
    }
    if (chart && typeof chart.setTool === 'function') chart.setTool(tool);
  }

  function handleUndo() { if (chart && typeof chart.undo === 'function') chart.undo(); }
  function handleClear() { if (chart && typeof chart.clearDrawings === 'function') chart.clearDrawings(); }

  function initDrawingMenu() {
    const toggle = $('drawToggle');
    const menu = $('drawingMenu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleDrawingMenu();
    });

    menu.addEventListener('click', function (e) {
      const toolBtn = e.target.closest('[data-tool]');
      if (toolBtn) {
        const tool = toolBtn.dataset.tool;
        setTool(tool);
        if (tool !== 'cursor') closeDrawingMenu();
        return;
      }
      if (e.target.closest('#drawUndo')) { handleUndo(); return; }
      if (e.target.closest('#drawClear')) { handleClear(); closeDrawingMenu(); return; }
    });

    document.addEventListener('click', function (e) {
      if (!state.drawMenuOpen) return;
      if (menu.contains(e.target)) return;
      if (toggle.contains(e.target)) return;
      closeDrawingMenu();
    });
  }

  function initDrawingShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (!isFullscreen()) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

      if (e.key === 'Escape') {
        if (state.drawMenuOpen) { closeDrawingMenu(); e.preventDefault(); return; }
        if (state.currentTool !== 'cursor') { setTool('cursor'); e.preventDefault(); }
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); toggleDrawingMenu(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault(); handleUndo(); return;
      }
    });
  }

  function initMtfToggle() {
    const toggle = $('mtfToggle');
    const mtfCard = $('mtfCard');
    const conclusionCard = $('conclusionCard');
    if (!toggle || !mtfCard || !conclusionCard) return;

    toggle.addEventListener('click', function () {
      const isExpanded = mtfCard.classList.toggle('expanded');
      conclusionCard.classList.toggle('shrunk', isExpanded);
      toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      toggle.setAttribute('aria-label', isExpanded ? 'Ocultar temporalidades adicionales' : 'Mostrar temporalidades adicionales');
    });
  }

  function startFeed() {
    feed = D.createFeed(Object.keys(CFG.symbols), {
      tick: onTick,
      status: function (mode) { state.feedMode = mode; renderStatus(); },
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

  function auditSignals() {
    const log = state.signalLog.slice();
    let wins = 0;
    let losses = 0;
    let open = 0;
    let invalid = 0;
    let sumRWin = 0;
    let sumRLoss = 0;

    log.forEach(function (s) {
      if (s.entryPrice == null || s.stopPrice == null || s.targetPrice == null) { invalid++; return; }
      const bars = state.bars[s.tf];
      if (!bars || !bars.length) { invalid++; return; }

      const after = bars.filter(function (b) { return b.t > s.ts; });
      if (!after.length) { open++; return; }

      const risk = Math.abs(s.entryPrice - s.stopPrice);
      if (!(risk > 0)) { invalid++; return; }

      const reward = Math.abs(s.targetPrice - s.entryPrice);
      const rrReal = reward / risk;

      let hitT = false;
      let hitS = false;
      for (let i = 0; i < after.length; i++) {
        const b = after[i];
        if (s.direction === 1) {
          if (b.l <= s.stopPrice) { hitS = true; break; }
          if (b.h >= s.targetPrice) { hitT = true; break; }
        } else {
          if (b.h >= s.stopPrice) { hitS = true; break; }
          if (b.l <= s.targetPrice) { hitT = true; break; }
        }
      }

      if (hitT) { wins++; sumRWin += rrReal; }
      else if (hitS) { losses++; sumRLoss += 1; }
      else { open++; }
    });

    const closed = wins + losses;
    const winRate = closed > 0 ? (wins / closed) * 100 : 0;
    const avgWinR = wins > 0 ? sumRWin / wins : 0;
    const avgLossR = losses > 0 ? sumRLoss / losses : 0;
    const expectancyR = closed > 0
      ? (wins / closed) * avgWinR - (losses / closed) * avgLossR
      : 0;
    const profitFactor = sumRLoss > 0 ? (sumRWin / sumRLoss) : (sumRWin > 0 ? Infinity : 0);

    return {
      total: log.length,
      closed: closed,
      wins: wins,
      losses: losses,
      open: open,
      invalid: invalid,
      winRate: winRate,
      avgWinR: avgWinR,
      avgLossR: avgLossR,
      expectancyR: expectancyR,
      profitFactor: profitFactor
    };
  }

  function init() {
    buildSymbolBar();
    initMtfToggle();
    initChart();
    startFeed();

    loadAllBars().then(function (results) {
      if (!results) return;
      D.fetchLatest(Object.keys(CFG.symbols)).then(function (ticks) {
        ticks.forEach(function (t) { state.ticks[t.symbol] = t; });
        updateSymbolBarPrices();
        renderAll();
      }).catch(function () { void 0; });
    });
  }

  function cleanup() {
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
    if (chart) { if (typeof chart.destroy === 'function') chart.destroy(); chart = null; }
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
    getState: function () { return state; },
    auditSignals: auditSignals
  };
})();