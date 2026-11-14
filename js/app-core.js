
(function () {
  'use strict';

  const AT = window.AT;
  const S = AT.signals;
  const ST = AT.strategies;
  const B = AT.backtest;
  const D = AT.data;
  const J = AT.journal;

  const App = AT.app = {};
  const SYMS = Object.keys(B.SYMBOLS || {});
  const SETTINGS_KEY = 'at.settings.v3';
  const CFG = window.AT_CONFIG || {};
  const RISK_CFG = CFG.risk || {};

  // ==========================================
  // CONFIGURACIÓN PREDETERMINADA
  // ==========================================

  const DEFAULTS = {
    balance: RISK_CFG.defaultBalance || 10000,
    riskPct: RISK_CFG.defaultRiskPct || 1,
    maxAggPct: RISK_CFG.defaultMaxAggregatePct || 2,
    maxTradesPerFamily: RISK_CFG.defaultMaxTradesPerFamily || 1,

    sl: null,
    tp: null,
    spread: {},

    auto: true,
    journalTf: '15m',
    journalStrategy: 'consenso',

    sessionFilter: true,
    newsFilter: false,
    trailing: false,
    adxFilter: true
  };

  SYMS.forEach(function (sym) {
    DEFAULTS.spread[sym] = B.SYMBOLS[sym].spread;
  });

  // ==========================================
  // ALMACENAMIENTO
  // ==========================================

  function pickStorage() {
    try {
      const storage = window.localStorage;
      const testKey = '__at_storage_test__';

      storage.setItem(testKey, '1');
      storage.removeItem(testKey);

      return storage;
    } catch (error) {
      return J.memoryStorage();
    }
  }

  const store = pickStorage();

  function validPositive(value, fallback, allowZero) {
    const number = Number(value);

    if (!Number.isFinite(number)) return fallback;
    if (allowZero ? number < 0 : number <= 0) return fallback;

    return number;
  }

  function normalizeSettings(saved) {
    const source = saved && typeof saved === 'object'
      ? saved
      : {};

    const out = Object.assign({}, DEFAULTS, source);

    out.balance = validPositive(
      source.balance,
      DEFAULTS.balance,
      false
    );

    out.riskPct = validPositive(
      source.riskPct,
      DEFAULTS.riskPct,
      false
    );

    out.maxAggPct = validPositive(
      source.maxAggPct,
      DEFAULTS.maxAggPct,
      false
    );

    out.maxTradesPerFamily = Math.max(
      1,
      Math.floor(validPositive(
        source.maxTradesPerFamily,
        DEFAULTS.maxTradesPerFamily,
        false
      ))
    );

    out.sl = source.sl == null
      ? null
      : validPositive(source.sl, null, false);

    out.tp = source.tp == null
      ? null
      : validPositive(source.tp, null, false);

    out.spread = Object.assign(
      {},
      DEFAULTS.spread,
      source.spread || {}
    );

    SYMS.forEach(function (sym) {
      out.spread[sym] = validPositive(
        out.spread[sym],
        DEFAULTS.spread[sym],
        true
      );
    });

    if (!ST.byId[out.journalStrategy]) {
      out.journalStrategy = DEFAULTS.journalStrategy;
    }

    if (!D.TF[out.journalTf]) {
      out.journalTf = DEFAULTS.journalTf;
    }

    out.auto = !!out.auto;
    out.sessionFilter = !!out.sessionFilter;
    out.newsFilter = !!out.newsFilter;
    out.trailing = !!out.trailing;
    out.adxFilter = !!out.adxFilter;

    return out;
  }

  function loadSettings() {
    let saved = {};

    try {
      saved = JSON.parse(store.getItem(SETTINGS_KEY)) || {};
    } catch (error) {
      saved = {};
    }

    return normalizeSettings(saved);
  }

  // ==========================================
  // ESTADO GLOBAL
  // ==========================================

  const state = App.state = {
    symbol: SYMS.indexOf('XAUUSD') !== -1
      ? 'XAUUSD'
      : SYMS[0],

    tf: '15m',
    tab: 'signals',
    planDir: 0,

    bars: {},
    ticks: {},
    loading: {},
    fetchedAt: {},

    aCache: {},
    hist: {},
    histLoading: {},

    feedMode: 'off',
    lastError: null,

    unavailable: {},
    discoverTried: {},
    discoverFailed: {},
    missingAt: {},

    settings: loadSettings(),
    journal: J.create(store),

    news: []
  };

  SYMS.forEach(function (sym) {
    state.bars[sym] = {};
  });

  App.SYMS = SYMS;

  App.defaults = function () {
    return JSON.parse(JSON.stringify(DEFAULTS));
  };

  App.saveSettings = function () {
    try {
      store.setItem(
        SETTINGS_KEY,
        JSON.stringify(state.settings)
      );
    } catch (error) {
      App.toast('No se pudieron guardar los ajustes.');
    }
  };

  // ==========================================
  // FORMATO Y UTILIDADES
  // ==========================================

  App.esc = function (value) {
    return String(value == null ? '' : value).replace(
      /[&<>"']/g,
      function (character) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character];
      }
    );
  };

  App.fmt = function (sym, price) {
    const instrument = B.SYMBOLS[sym];

    if (
      price == null ||
      !Number.isFinite(Number(price)) ||
      !instrument
    ) {
      return '—';
    }

    return Number(price).toFixed(instrument.digits);
  };

  App.sgn = function (value, digits) {
    const number = Number(value);

    if (!Number.isFinite(number)) return '—';

    return (number >= 0 ? '+' : '') +
      number.toFixed(digits);
  };

  App.fmtDate = function (milliseconds) {
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleString('es', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  App.fmtTime = function (milliseconds) {
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // ==========================================
  // NOTIFICACIONES
  // ==========================================

  App.toast = function (message) {
    let element = document.getElementById('toast');

    if (!element) {
      element = document.createElement('div');
      element.id = 'toast';
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');

      document.body.appendChild(element);
    }

    element.textContent = String(message || '');
    element.className = 'show';

    clearTimeout(App._tt);

    App._tt = setTimeout(function () {
      element.className = '';
    }, 4500);
  };

  // ==========================================
  // SESIONES DE MERCADO
  // ==========================================

  App.sessionInfo = function (timestamp) {
    const ts = Number.isFinite(Number(timestamp))
      ? Number(timestamp)
      : Date.now();

    const hour = new Date(ts).getUTCHours();

    const config =
      (CFG.sessions && CFG.sessions.combined) ||
      { startGmt: 7, endGmt: 21 };

    const start = Number(config.startGmt);
    const end = Number(config.endGmt);

    const startHour = Number.isFinite(start) ? start : 7;
    const endHour = Number.isFinite(end) ? end : 21;

    const open = startHour <= endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;

    return {
      open: open,
      hourGmt: hour,
      startGmt: startHour,
      endGmt: endHour
    };
  };

  // ==========================================
  // FILTRO DE NOTICIAS
  // ==========================================

  App.inBlackout = function (timestamp) {
    if (!state.settings.newsFilter) return false;

    const ts = Number.isFinite(Number(timestamp))
      ? Number(timestamp)
      : Date.now();

    return state.news.some(function (news) {
      const newsTime = Number(news.ts);

      if (!Number.isFinite(newsTime)) return false;

      const windowMs = Number(news.windowMs);

      const duration = Number.isFinite(windowMs) && windowMs >= 0
        ? windowMs
        : 30 * 60000;

      return Math.abs(newsTime - ts) < duration;
    });
  };

  // ==========================================
  // CARGA DE VELAS
  // ==========================================

  App.load = function (sym, tf, limit) {
    if (!B.SYMBOLS[sym] || !D.TF[tf]) {
      return Promise.reject(
        new Error('Símbolo o temporalidad no válida.')
      );
    }

    const key = sym + '|' + tf;

    if (state.loading[key]) {
      return state.loading[key];
    }

    const request = D.fetchBars(
      sym,
      tf,
      limit || 500
    ).then(function (bars) {
      if (!Array.isArray(bars)) {
        throw new Error('La fuente devolvió datos inválidos.');
      }

      state.bars[sym][tf] = bars;
      state.fetchedAt[key] = Date.now();

      delete state.loading[key];
      delete state.unavailable[sym];

      App.onBarsLoaded(sym, tf);

      return bars;

    }).catch(function (error) {
      delete state.loading[key];

      if (D.isMissing(error)) {
        state.missingAt[sym] = Date.now();
        App.markMissing(sym);
      } else {
        state.lastError = error;
      }

      if (App.renderStatus) {
        App.renderStatus();
      }

      throw error;
    });

    state.loading[key] = request;

    return request;
  };

  // ==========================================
  // CARGA DE UN SÍMBOLO
  // ==========================================

  App.loadSymbol = function (sym) {
    if (!B.SYMBOLS[sym]) {
      return Promise.reject(
        new Error('Símbolo no reconocido: ' + sym)
      );
    }

    return App.load(sym, state.tf, 500).then(
      function () {
        return true;
      },
      function (error) {
        return !D.isMissing(error);
      }
    ).then(function (continueLoading) {
      if (!continueLoading) return null;

      const remaining = D.TF_LIST.filter(function (tf) {
        return (
          tf !== state.tf &&
          !state.bars[sym][tf]
        );
      }).map(function (tf) {
        return function () {
          return App.load(sym, tf, 500);
        };
      });

      return D.pool(remaining, 2);
    });
  };

  // ==========================================
  // DETECCIÓN DE SÍMBOLOS
  // ==========================================

  App.isMissing = function (sym) {
    return !!state.unavailable[sym];
  };

  App.markMissing = function (sym) {
    if (!B.SYMBOLS[sym]) return;
    if (state.unavailable[sym]) return;

    state.unavailable[sym] = true;

    if (App.renderStatus) {
      App.renderStatus();
    }

    if (App.renderSymbolStatus) {
      App.renderSymbolStatus();
    }

    App.scheduleRender();

    if (state.discoverTried[sym]) return;

    state.discoverTried[sym] = true;

    D.discover(sym).then(function (name) {
      if (!name) {
        state.discoverFailed[sym] = true;

        App.toast(
          sym + ': no se encontraron datos con ese nombre.'
        );

        App.scheduleRender();
        return;
      }

      CFG.alias = CFG.alias || {};
      CFG.alias[sym] = name;

      delete state.unavailable[sym];

      if (App.feed) {
        App.feed.resubscribe(sym);
      }

      App.toast(
        sym + ' se llama «' + name + '». Cargando…'
      );

      const request = sym === state.symbol
        ? App.loadSymbol(sym)
        : App.load(sym, state.settings.journalTf, 500);

      return request.then(function () {
        App.renderLive(true);
        App.renderMTF();
      }).catch(function () {
        App.toast('No se pudieron recuperar los datos de ' + sym + '.');
      });

    }).catch(function () {
      state.discoverFailed[sym] = true;

      App.toast(
        'No se pudo buscar automáticamente el símbolo ' + sym + '.'
      );

      App.scheduleRender();
    });
  };

  App.markFound = function (sym) {
    if (!B.SYMBOLS[sym]) return;

    if (!state.unavailable[sym]) return;

    delete state.unavailable[sym];

    if (App.renderStatus) {
      App.renderStatus();
    }

    if (App.renderSymbolStatus) {
      App.renderSymbolStatus();
    }

    if (
      !state.bars[sym][state.tf] &&
      !state.loading[sym + '|' + state.tf]
    ) {
      const request = sym === state.symbol
        ? App.loadSymbol(sym)
        : App.load(sym, state.settings.journalTf, 500);

      request.then(function () {
        App.renderLive(true);
        App.renderMTF();
      }).catch(function () {});
    }

    App.scheduleRender();
  };

  // ==========================================
  // HISTORIAL PARA BACKTEST
  // ==========================================

  App.hist = function (sym, tf) {
    if (!B.SYMBOLS[sym] || !D.TF[tf]) {
      return Promise.reject(
        new Error('Símbolo o temporalidad no válida.')
      );
    }

    const key = sym + '|' + tf;
    const cached = state.hist[key];

    if (
      cached &&
      Date.now() - cached.at < 300000
    ) {
      return Promise.resolve(cached.bars);
    }

    if (state.histLoading[key]) {
      return state.histLoading[key];
    }

    const request = D.fetchBars(sym, tf, 1000).then(function (bars) {
      if (!Array.isArray(bars)) {
        throw new Error('Historial inválido.');
      }

      if (
        bars.length &&
        bars[bars.length - 1].live
      ) {
        bars = bars.slice(0, -1);
      }

      state.hist[key] = {
        at: Date.now(),
        bars: bars
      };

      delete state.histLoading[key];

      return bars;

    }).catch(function (error) {
      delete state.histLoading[key];
      throw error;
    });

    state.histLoading[key] = request;

    return request;
  };

  // ==========================================
  // ACTUALIZACIÓN GENERAL
  // ==========================================

  App.refresh = function (all) {
    const tasks = [];

    D.TF_LIST.forEach(function (tf) {
      const key = state.symbol + '|' + tf;

      const exists = state.bars[state.symbol][tf];

      const expired =
        Date.now() - (state.fetchedAt[key] || 0) > 300000;

      if (exists && (all || tf === state.tf || expired)) {
        tasks.push(function () {
          return App.load(state.symbol, tf, 500);
        });
      }
    });

    SYMS.forEach(function (sym) {
      if (sym === state.symbol) return;

      if (
        App.isMissing(sym) &&
        Date.now() - (state.missingAt[sym] || 0) < 300000
      ) {
        return;
      }

      tasks.push(function () {
        return App.load(
          sym,
          state.settings.journalTf,
          500
        );
      });
    });

    return D.pool(tasks, 3).then(function () {
      SYMS.forEach(function (sym) {
        App.checkAuto(sym);
      });
    });
  };

  // ==========================================
  // OPCIONES DE ESTRATEGIA
  // ==========================================

  App.strategyOpts = function () {
    const settings = state.settings;

    const session =
      CFG.sessions &&
      CFG.sessions.combined;

    return {
      sessionFilter: !!settings.sessionFilter,

      sessionStart: session
        ? session.startGmt
        : 7,

      sessionEnd: session
        ? session.endGmt
        : 21,

      adxFilter: !!settings.adxFilter
    };
  };

  // ==========================================
  // ANÁLISIS TÉCNICO CON CACHÉ
  // ==========================================

  App.analysis = function (sym, tf) {
    const key = sym + '|' + tf;
    const cached = state.aCache[key];
    const now = Date.now();

    if (
      cached &&
      now - cached.at < 700
    ) {
      return cached.v;
    }

    const bars =
      state.bars[sym] &&
      state.bars[sym][tf];

    const value =
      bars && bars.length >= 60
        ? S.analyze(bars)
        : null;

    state.aCache[key] = {
      at: now,
      v: value
    };

    return value;
  };

  // ==========================================
  // EVENTO: VELAS CARGADAS
  // ==========================================

  App.onBarsLoaded = function (sym, tf) {
    if (tf === state.settings.journalTf) {
      App.primeSeen(sym, false);
    }

    if (
      sym === state.symbol &&
      App.scheduleRender
    ) {
      App.scheduleRender();
    }
  };

  // ==========================================
  // EVENTO: TICK EN TIEMPO REAL
  // ==========================================

  App.onTick = function (tick) {
    const per = state.bars[tick.symbol];

    if (!per) return;

    state.ticks[tick.symbol] = tick;

    if (tick.state === 'closed' || tick.stale) {
      App.scheduleRender();
      return;
    }

    let newJournalBar = false;

    Object.keys(per).forEach(function (tf) {
      const bars = per[tf];

      if (!bars || !bars.length) return;

      const result = D.applyTick(
        bars,
        D.TF[tf],
        tick.mid,
        tick.ts
      );

      if (
        result === 'new' &&
        tf === state.settings.journalTf
      ) {
        newJournalBar = true;
      }
    });

    const closed = state.journal.onTick(tick);

    if (closed && closed.length) {
      App.onJournalClosed(closed);
    }

    if (newJournalBar) {
      App.checkAuto(tick.symbol);
    }

    App.scheduleRender();
  };

  // ==========================================
  // OPERACIONES CERRADAS
  // ==========================================

  App.onJournalClosed = function (trades) {
    if (!Array.isArray(trades)) return;

    trades.forEach(function (trade) {
      const reason =
        trade.reason === 'tp'
          ? 'objetivo'
          : trade.reason === 'sl'
            ? 'stop'
            : 'cierre';

      App.toast(
        trade.symbol + ' ' +
        reason + ': ' +
        App.sgn(trade.r, 2) + ' R'
      );
    });

    if (
      state.tab === 'journal' &&
      App.renderJournal
    ) {
      App.renderJournal();
    }

    if (App.renderRisk) {
      App.renderRisk();
    }
  };

  // ==========================================
  // ACTUALIZACIÓN VISUAL CONTROLADA
  // ==========================================

  let renderTimer = 0;
  let lastRender = 0;

  App.scheduleRender = function () {
    if (renderTimer) return;

    renderTimer = setTimeout(function () {
      renderTimer = 0;
      lastRender = Date.now();

      if (App.renderLive) {
        App.renderLive();
      }

      if (App.renderRisk) {
        App.renderRisk();
      }
    }, Math.max(
      0,
      400 - (Date.now() - lastRender)
    ));
  };

  // ==========================================
  // PLAN DE OPERACIÓN
  // ==========================================

  App.planFor = function (sym, tf, dirOverride) {
    const analysis = App.analysis(sym, tf);
    const settings = state.settings;

    if (!analysis || analysis.atr == null) {
      return null;
    }

    const dir = dirOverride || analysis.label.dir;

    if (!dir) {
      return {
        neutral: true,
        a: analysis
      };
    }

    const tick = state.ticks[sym];

    const entry = tick
      ? (dir === 1 ? tick.ask : tick.bid)
      : analysis.price;

    const instrument = B.SYMBOLS[sym];

    if (!instrument) return null;

    const plan = B.plan(
      dir,
      entry,
      analysis.atr,
      {
        slMult: settings.sl || instrument.defaultSl,
        tpMult: settings.tp || instrument.defaultTp,
        balance: settings.balance,
        riskPct: settings.riskPct,
        contract: instrument.contract
      }
    );

    if (!plan) return null;

    plan.symbol = sym;
    plan.tf = tf;
    plan.a = analysis;

    return plan;
  };

  // ==========================================
  // CONTROL DE SEÑALES YA PROCESADAS
  // ==========================================

  function seenKey(sym) {
    return (
      sym + '|' +
      state.settings.journalTf + '|' +
      state.settings.journalStrategy
    );
  }

  App.primeSeen = function (sym, force) {
    const bars =
      state.bars[sym] &&
      state.bars[sym][state.settings.journalTf];

    if (!bars || bars.length < 2) return;

    if (
      !force &&
      state.journal.seen(seenKey(sym)) !== undefined
    ) {
      return;
    }

    state.journal.markSeen(
      seenKey(sym),
      bars[bars.length - 2].t
    );
  };

  // ==========================================
  // SISTEMA AUTOMÁTICO DE SEÑALES
  // ==========================================

  App.checkAuto = function (sym) {
    const settings = state.settings;

    if (!settings.auto) return;
    if (!B.SYMBOLS[sym]) return;

    const bars =
      state.bars[sym] &&
      state.bars[sym][settings.journalTf];

    if (!bars || bars.length < 60) return;

    if (
      settings.sessionFilter &&
      !App.sessionInfo().open
    ) {
      return;
    }

    if (App.inBlackout()) return;

    const strategy = ST.byId[settings.journalStrategy];

    if (!strategy) return;

    const key = seenKey(sym);

    const signal = J.checkSignal(
      bars,
      settings.journalStrategy,
      state.journal.seen(key),
      App.strategyOpts()
    );

    if (!signal) return;

    state.journal.markSeen(key, signal.barT);

    if (signal.dir === 0) return;

    if (state.journal.openTrades(sym).length) {
      return;
    }

    const timeframeMs = D.TF[settings.journalTf];

    if (!timeframeMs) return;

    const signalAge = Date.now() -
      (signal.barT + timeframeMs);

    if (signalAge > 2 * timeframeMs + 30000) {
      return;
    }

    const instrument = B.SYMBOLS[sym];

    if (!instrument) return;

    const tick = state.ticks[sym];

    const entry = tick
      ? (signal.dir === 1 ? tick.ask : tick.bid)
      : signal.price;

    const plan = B.plan(
      signal.dir,
      entry,
      signal.atr,
      {
        slMult: settings.sl || strategy.sl,
        tpMult: settings.tp || strategy.tp,
        balance: settings.balance,
        riskPct: settings.riskPct,
        contract: instrument.contract
      }
    );

    if (!plan || !Number.isFinite(plan.riskUsd)) {
      return;
    }

    const check = state.journal.canOpen(sym, {
      balance: settings.balance,
      maxAggPct: settings.maxAggPct,
      maxTradesPerFamily: settings.maxTradesPerFamily,
      riskUsd: plan.riskUsd
    });

    if (!check.ok) {
      App.toast(
        'Señal en ' + sym +
        ' bloqueada: ' + check.reason
      );

      return;
    }

    state.journal.open({
      symbol: sym,
      tf: settings.journalTf,
      strategy: settings.journalStrategy,

      dir: signal.dir,

      entry: plan.entry,
      sl: plan.sl,
      tp: plan.tp,
      lots: plan.lots,

      source: 'auto',
      note: strategy.name
    });

    App.toast(
      'Nueva señal: ' +
      (signal.dir === 1 ? 'COMPRA ' : 'VENTA ') +
      sym + ' @ ' +
      App.fmt(sym, plan.entry)
    );

    if (
      state.tab === 'journal' &&
      App.renderJournal
    ) {
      App.renderJournal();
    }

    if (App.renderRisk) {
      App.renderRisk();
    }
  };

  // ==========================================
  // EXPOSICIÓN Y CONTROL DE RIESGO
  // ==========================================

  App.exposureNow = function () {
    return state.journal.exposure(
      state.settings.balance
    );
  };

  App.canOpenNow = function (sym, riskUsd) {
    if (!B.SYMBOLS[sym]) {
      return {
        ok: false,
        reason: 'Símbolo no reconocido.'
      };
    }

    return state.journal.canOpen(sym, {
      balance: state.settings.balance,
      maxAggPct: state.settings.maxAggPct,
      maxTradesPerFamily: state.settings.maxTradesPerFamily,
      riskUsd: riskUsd || 0
    });
  };

})();
