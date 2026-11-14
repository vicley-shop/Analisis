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
      setTimeout(function () { finish(false); }, 5000);
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

  function probe() {
    const url = D.base() + '/api/latest?symbols=' + encodeURIComponent(D.feedName('XAUUSD'));
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, 6000) : null;
    const opts = ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' };
    console.log('[AT probe] GET', url);
    return fetch(url, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      console.log('[AT probe] HTTP', r.status, r.ok ? 'OK' : 'KO');
      return { ok: r.ok, status: r.status };
    }, function (e) {
      if (timer) clearTimeout(timer);
      console.warn('[AT probe] fallo:', e && e.message);
      return { ok: false, status: 0, error: e };
    });
  }

  function setError(msg) {
    state.lastError = msg instanceof Error ? msg : new Error(msg);
    if (state.feedMode === 'off' || state.feedMode === 'polling') {
      state.feedMode = 'error';
      App.renderStatus();
    }
  }

  function startFeed() {
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

    App.feed.start().then(function (finalMode) {
      console.log('[AT] feed arrancado en modo:', finalMode);
    }).catch(function (e) {
      console.error('[AT] feed error:', e);
      setError(e);
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
    if (App.wireReconnect) App.wireReconnect();

    App.renderTop();
    App.renderStatus();
    App.renderRisk();
    App.renderGauge(null);
    App.renderMTF();
    App.renderSettings();

    loadNews().then(function () {
      if (state.settings.newsFilter) App.renderPrice();
    });

    if (location.protocol === 'file:') {
      console.warn('[AT] file:// detectado. CORS bloqueará las peticiones a biquote.');
      setTimeout(function () {
        if (state.feedMode === 'off' || state.feedMode === 'polling') {
          setError('Estás abriendo con file://. Usa un servidor local (python -m http.server 8000) y abre http://localhost:8000');
          App.toast('⚠ Abre con http://, no con file://');
        }
      }, 2000);
    }

    probe().then(function (r) {
      if (!r.ok) {
        if (r.status === 0) setError('No se pudo conectar con biquote.io (red/CORS).');
        else if (r.status === 429) setError('biquote.io está limitando consultas (HTTP 429).');
        else setError('biquote.io respondió HTTP ' + r.status);
      }
    });

    startFeed();

    App.loadSymbol(state.symbol).then(function () {
      App.renderLive(true);
      App.renderMTF();
    }).catch(function (e) {
      console.warn('[AT] loadSymbol falló:', e && e.message);
      App.renderLive(true);
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

    setInterval(function () {
      if (!App.feed) return;
      if (state.feedMode === 'polling' || state.feedMode === 'reconnecting') {
        const last = App.feed.lastTickAt ? App.feed.lastTickAt() : 0;
        if (last && Date.now() - last > 30000) {
          console.warn('[AT] 30s sin ticks, forzando reconexión');
          App.feed.reconnect();
        }
      }
    }, 15000);

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