(function () {
  'use strict';
  const AT = window.AT, App = AT.app, D = AT.data, state = App.state;

  function loadSignalR() {
    return new Promise(function (resolve) {
      if (window.signalR) { resolve(true); return; }
      const url = window.AT_CONFIG && window.AT_CONFIG.signalrUrl;
      if (!url) { resolve(false); return; }
      let done = false;
      function finish(ok) { if (!done) { done = true; resolve(ok); } }
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { finish(!!window.signalR); };
      s.onerror = function () { finish(false); };
      setTimeout(function () { finish(false); }, 6000);
      document.head.appendChild(s);
    });
  }

  function loadNews() {
    return new Promise(function (resolve) {
      if (typeof fetch !== 'function') { resolve(false); return; }
      fetch('data/news.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (Array.isArray(d)) {
            state.news = d.filter(function (n) {
              return n && isFinite(n.ts) && n.impact === 'high';
            }).map(function (n) {
              return { ts: n.ts, impact: n.impact, title: n.title || '', windowMs: (n.windowMin || 30) * 60000 };
            });
          }
          resolve(true);
        })
        .catch(function () { resolve(false); });
    });
  }

  function init() {
    App.buildSymbolBar();
    App.buildTfBar();
    App.initChart();
    App.buildJournalControls();
    App.wireSignals();
    App.wireBacktest();
    App.wireTabs();
    App.wireJournal();
    App.wireSettings();

    App.renderTop();
    App.renderStatus();
    App.renderRisk();
    App.renderGauge(null);
    App.renderMTF();
    App.renderSettings();

    loadNews().then(function () {
      if (state.settings.newsFilter) App.renderPrice();
    });

    App.feed = D.createFeed(App.SYMS, {
      tick: App.onTick,
      status: function (mode, err) {
        state.feedMode = mode;
        if (err) state.lastError = err;
        App.renderStatus();
      },
      missing: function (sym) { App.markMissing(sym); },
      found: function (sym) { App.markFound(sym); },
      loadClient: loadSignalR
    });

    App.feed.start().catch(function () {
      state.feedMode = 'error';
      App.renderStatus();
    });

    App.loadSymbol(state.symbol).then(function () {
      App.renderLive(true);
      App.renderMTF();
    });

    App.SYMS.forEach(function (s) {
      if (s !== state.symbol) {
        App.load(s, state.settings.journalTf, 500).catch(function () {});
      }
    });

    setInterval(function () {
      if (state.tab === 'signals') App.renderMTF();
      App.renderRisk();
    }, 5000);

    setInterval(function () {
      App.refresh(false);
    }, 60000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        App.refresh(false);
        App.scheduleRender();
      }
    });

    window.addEventListener('resize', function () { App.scheduleRender(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();