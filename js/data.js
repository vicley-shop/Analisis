(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.AT = root.AT || {}; root.AT.data = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const G = typeof globalThis !== 'undefined' ? globalThis : root;
  const TF = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
  const TF_LIST = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

  const FETCH_TIMEOUT = 8000;
  const POLL_MS = 2000;
  const POLL_SLOW_MS = 20000;
  const RETRY_MS = 60000;
  const BACKOFF_MS = 10000;

  function cfg() { return G.AT_CONFIG || {}; }
  function base() { return cfg().base || 'https://biquote.io'; }
  function aliasMap() { return cfg().alias || {}; }
  function feedName(sym) { return aliasMap()[sym] || sym; }

  function internalName(name) {
    const up = String(name).toUpperCase(), a = aliasMap();
    for (const k in a) if (String(a[k]).toUpperCase() === up) return k;
    return up;
  }

  function getJSON(path, timeoutMs) {
    const t = timeoutMs || FETCH_TIMEOUT;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let aborted = false;
    const timer = ctl ? setTimeout(function () { aborted = true; ctl.abort(); }, t) : null;
    const opts = ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' };
    return G.fetch(base() + path, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) {
        const e = new Error('HTTP ' + r.status + ' en ' + path);
        e.status = r.status;
        e.retryAfter = +(r.headers && r.headers.get && r.headers.get('Retry-After')) || 0;
        throw e;
      }
      return r.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (aborted) {
        const e = new Error('timeout ' + t + 'ms en ' + path);
        e.status = 0;
        e.timeout = true;
        throw e;
      }
      const e = new Error((err && err.message) || 'error de red en ' + path);
      e.status = 0;
      e.network = true;
      throw e;
    });
  }

  function isMissing(e) {
    return !!e && (e.status === 404 || e.status === 400 || e.status === 410 || e.status === 422);
  }

  function normBar(b) {
    const t = Date.parse(b.openTime), o = +b.open, h = +b.high, l = +b.low, c = +b.close;
    if (!isFinite(t) || !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return null;
    return { t: t, o: o, h: h, l: l, c: c, v: +b.tickVolume || 0, live: !!b.isOpen };
  }

  function fetchRaw(name, tf, limit) {
    const path = '/api/' + encodeURIComponent(name) + '/ohlc?interval=' + tf + '&limit=' + (limit || 500);
    return getJSON(path).then(function (d) {
      const arr = Array.isArray(d) ? d : (d && d.bars) || [];
      const bars = [];
      arr.forEach(function (b) { const x = normBar(b); if (x) bars.push(x); });
      if (!bars.length) { const e = new Error('sin datos para ' + name); e.status = 404; throw e; }
      bars.sort(function (a, b) { return a.t - b.t; });
      return bars.filter(function (b, i) { return i === 0 || b.t !== bars[i - 1].t; });
    });
  }

  function fetchBars(symbol, tf, limit) { return fetchRaw(feedName(symbol), tf, limit); }

  function normTick(t) {
    if (!t || typeof t !== 'object') return null;
    const bid = +t.bid, ask = +t.ask;
    let mid = +t.mid;
    if (!isFinite(mid)) mid = (bid + ask) / 2;
    if (!isFinite(mid) || !t.symbol) return null;
    const ts = Date.parse(t.timestamp);
    return {
      symbol: internalName(t.symbol),
      bid: isFinite(bid) ? bid : mid,
      ask: isFinite(ask) ? ask : mid,
      mid: mid,
      spread: isFinite(+t.spread) ? +t.spread : (isFinite(ask - bid) ? ask - bid : 0),
      ts: isFinite(ts) ? ts : Date.now(),
      dayPct: isFinite(+t.dayDiffPercent) ? +t.dayDiffPercent : null,
      high: isFinite(+t.high) ? +t.high : null,
      low: isFinite(+t.low) ? +t.low : null,
      state: t.marketState || 'open',
      stale: !!t.stale
    };
  }

  function fetchLatest(symbols) {
    const q = symbols.map(function (s) { return 'symbols=' + encodeURIComponent(feedName(s)); }).join('&');
    return getJSON('/api/latest?' + q).then(function (d) {
      let arr;
      if (Array.isArray(d)) arr = d;
      else if (d && Array.isArray(d.ticks)) arr = d.ticks;
      else if (d && typeof d === 'object') {
        arr = Object.keys(d).map(function (k) {
          return d[k] && typeof d[k] === 'object' ? Object.assign({ symbol: k }, d[k]) : null;
        });
      } else arr = [];
      return arr.map(normTick).filter(Boolean);
    });
  }

  const HINT = {
    XAUUSD: /gold\b.{0,12}\b(us\s+)?dollar/i,
    XAGUSD: /silver\b.{0,12}\b(us\s+)?dollar/i,
    EURUSD: /euro\b.{0,12}\b(us\s+)?dollar/i,
    BTCUSD: /bitcoin\b.{0,12}\b(us\s+)?dollar/i
  };
  const WORD = { XAUUSD: 'gold', XAGUSD: 'silver', EURUSD: 'euro', BTCUSD: 'bitcoin' };

  function searchCatalog(q) {
    return getJSON('/api/symbols/search?q=' + encodeURIComponent(q) + '&limit=50').then(function (d) {
      return Array.isArray(d) ? d : (d && (d.items || d.symbols || d.results)) || [];
    });
  }

  function rankNames(sym, items) {
    const out = [], seen = {};
    items.forEach(function (it) {
      const name = String((it && (it.name || it.symbol)) || '').trim(), up = name.toUpperCase();
      if (!name || seen[up]) return;
      seen[up] = true;
      const rest = name.slice(sym.length);
      if (/tether|usd\s*coin/i.test(String((it && it.description) || '')) ||
          (up.indexOf(sym) === 0 && (rest === 'T' || rest === 'C'))) return;
      let score = 0;
      if (up === sym) score = 100;
      else if (up.indexOf(sym) === 0 && up.length - sym.length <= 4) score = 90 - (up.length - sym.length);
      else if (up.indexOf(sym) >= 0) score = 60;
      else if (HINT[sym] && HINT[sym].test(String(it.description || ''))) score = 50;
      if (score) out.push({ name: name, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score || a.name.length - b.name.length; });
    return out.map(function (x) { return x.name; });
  }

  function discover(sym) {
    const cur = feedName(sym).toUpperCase(), qs = [sym];
    if (WORD[sym]) qs.push(WORD[sym]);
    return Promise.all(qs.map(function (q) { return searchCatalog(q).catch(function () { return []; }); }))
      .then(function (lists) {
        const names = rankNames(sym, [].concat.apply([], lists))
          .filter(function (n) { return n.toUpperCase() !== cur; }).slice(0, 4);
        return names.reduce(function (p, name) {
          return p.then(function (found) {
            return found || fetchRaw(name, '1h', 5).then(function () { return name; }, function () { return null; });
          });
        }, Promise.resolve(null));
      }).catch(function () { return null; });
  }

  function pool(tasks, limit) {
    const results = new Array(tasks.length);
    let next = 0;
    function worker() {
      if (next >= tasks.length) return Promise.resolve();
      const idx = next++;
      return tasks[idx]().then(
        function (v) { results[idx] = { ok: true, v: v }; },
        function (e) { results[idx] = { ok: false, e: e }; }
      ).then(worker);
    }
    const ws = [];
    for (let i = 0; i < Math.min(limit || 4, tasks.length); i++) ws.push(worker());
    return Promise.all(ws).then(function () { return results; });
  }

  function applyTick(bars, tfMs, price, ts) {
    if (!bars.length) return null;
    const last = bars[bars.length - 1];
    if (ts >= last.t + tfMs) {
      const steps = Math.floor((ts - last.t) / tfMs);
      last.live = false;
      bars.push({ t: last.t + steps * tfMs, o: price, h: price, l: price, c: price, v: 1, live: true });
      return 'new';
    }
    last.live = true;
    if (price > last.h) last.h = price;
    if (price < last.l) last.l = price;
    last.c = price;
    last.v++;
    return 'upd';
  }

  function createFeed(symbols, handlers) {
    let conn = null;
    let pollTimer = null;
    let mode = 'off';
    let backoffUntil = 0;
    let stopped = false;
    let pollInFlight = false;
    let lastTickAt = 0;
    let lastError = null;
    const paused = {};
    const reported = {};

    function active() {
      const now = Date.now();
      return symbols.filter(function (s) { return !(paused[s] > now); });
    }

    function feedList() { return active().map(feedName); }

    function setMode(m, err) {
      if (m === mode && !err) return;
      mode = m;
      if (err) lastError = err;
      if (err) console.warn('[AT feed] ' + m + ':', err.message || err);
      else console.log('[AT feed] modo →', m);
      if (handlers.status) handlers.status(m, err || lastError);
    }

    function give(arr) {
      if (!arr || !arr.length) return;
      lastTickAt = Date.now();
      arr.forEach(function (t) {
        if (reported[t.symbol]) {
          delete reported[t.symbol];
          delete paused[t.symbol];
          if (handlers.found) handlers.found(t.symbol);
        }
        if (handlers.tick) handlers.tick(t);
      });
    }

    function emit(raw) {
      const t = normTick(raw);
      if (t) give([t]);
    }

    function startPolling(ms) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function () { poll(); }, ms);
    }

    function drop(sym) {
      const first = !reported[sym];
      paused[sym] = Date.now() + RETRY_MS;
      reported[sym] = true;
      if (first && handlers.missing) handlers.missing(sym);
    }

    function isolate() {
      return Promise.all(active().map(function (s) {
        return fetchLatest([s]).then(
          function (arr) { give(arr); return { s: s, ok: true }; },
          function (e) { return { s: s, ok: false, miss: isMissing(e), e: e }; }
        );
      })).then(function (r) {
        if (r.some(function (x) { return x.ok; })) {
          r.forEach(function (x) { if (x.miss) drop(x.s); });
          if (mode !== 'live' && mode !== 'polling') setMode('polling');
        } else {
          backoffUntil = Date.now() + BACKOFF_MS;
          if (mode !== 'live') setMode('error', (r[0] && r[0].e) || new Error('sin datos'));
        }
      });
    }

    function poll() {
      if (stopped || pollInFlight) return Promise.resolve();
      if (Date.now() < backoffUntil) return Promise.resolve();
      if (!active().length) return Promise.resolve();
      pollInFlight = true;
      return fetchLatest(active()).then(function (arr) {
        pollInFlight = false;
        give(arr);
        if (mode === 'off' || mode === 'reconnecting') setMode('polling');
      }, function (e) {
        pollInFlight = false;
        if (e && e.status === 429) {
          backoffUntil = Date.now() + (e.retryAfter || 60) * 1000;
          if (mode !== 'live') setMode('error', e);
          return;
        }
        if (isMissing(e)) { isolate(); return; }
        if (e && e.network) console.warn('[AT feed] red:', e.message);
        if (mode !== 'live') setMode('error', e);
      });
    }

    function startSignalR() {
      if (!G.signalR || !active().length) return Promise.resolve(false);
      try {
        conn = new G.signalR.HubConnectionBuilder()
          .withUrl(base() + '/hubs/tick', { withCredentials: false })
          .withAutomaticReconnect().build();

        conn.on('ReceiveTick', emit);

        conn.onreconnecting(function () {
          setMode('reconnecting');
          startPolling(POLL_MS);
        });

        conn.onreconnected(function () {
          conn.invoke('Subscribe', feedList())
            .then(function () { setMode('live'); startPolling(POLL_SLOW_MS); })
            .catch(function () { setMode('polling'); startPolling(POLL_MS); });
        });

        conn.onclose(function () {
          if (!stopped) {
            setMode('polling');
            startPolling(POLL_MS);
          }
        });

        const startP = conn.start();
        const timeoutP = new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('SignalR timeout')); }, 5000);
        });

        return Promise.race([startP, timeoutP])
          .then(function () { return conn.invoke('Subscribe', feedList()); })
          .then(function () {
            setMode('live');
            startPolling(POLL_SLOW_MS);
            return true;
          }, function (err) {
            console.warn('[AT feed] SignalR no disponible:', err && err.message);
            try { conn.stop(); } catch (e) {}
            conn = null;
            return false;
          });
      } catch (e) {
        console.warn('[AT feed] SignalR excepción:', e && e.message);
        conn = null;
        return Promise.resolve(false);
      }
    }

    return {
      start: function () {
        stopped = false;
        setMode('polling');
        if (!pollTimer) startPolling(POLL_MS);
        poll();
        const client = handlers.loadClient
          ? handlers.loadClient().catch(function () { return false; })
          : Promise.resolve(true);
        return client.then(function () {
          return startSignalR();
        }).then(function (ok) {
          if (ok) console.log('[AT feed] live');
          else console.log('[AT feed] polling activo');
          return mode;
        });
      },
      stop: function () {
        stopped = true;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (conn) { try { conn.stop(); } catch (e) {} conn = null; }
        setMode('off');
      },
      mode: function () { return mode; },
      lastError: function () { return lastError; },
      lastTickAt: function () { return lastTickAt; },
      missing: function () { return Object.keys(reported); },
      resubscribe: function (sym) {
        delete paused[sym];
        delete reported[sym];
        if (conn && mode === 'live') conn.invoke('Subscribe', feedList()).catch(function () {});
      },
      reconnect: function () {
        stopped = true;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (conn) { try { conn.stop(); } catch (e) {} conn = null; }
        backoffUntil = 0;
        pollInFlight = false;
        this.start();
      }
    };
  }

  return {
    TF: TF,
    TF_LIST: TF_LIST,
    base: base,
    feedName: feedName,
    internalName: internalName,
    isMissing: isMissing,
    fetchBars: fetchBars,
    fetchLatest: fetchLatest,
    normTick: normTick,
    normBar: normBar,
    rankNames: rankNames,
    discover: discover,
    pool: pool,
    applyTick: applyTick,
    createFeed: createFeed
  };
}));