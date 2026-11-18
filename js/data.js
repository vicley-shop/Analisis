(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else { root.AT = root.AT || {}; root.AT.data = factory(root); }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const G = typeof globalThis !== 'undefined' ? globalThis : root;

  const TF_MS = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000
  };

  function cfg() { return G.AT_CONFIG || {}; }
  function feedCfg() { return cfg().feed || {}; }
  function analysisCfg() { return cfg().analysis || {}; }
  function base() { return cfg().base || 'https://biquote.io'; }
  function feedName(sym) { return sym; }

  function toNum(x) {
    if (x == null || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function parseTs(x) {
    if (x == null) return null;
    if (typeof x === 'number' && Number.isFinite(x)) {
      return x < 1e12 ? x * 1000 : x;
    }
    const t = Date.parse(x);
    return Number.isFinite(t) && t > 0 ? t : null;
  }

  function getJSON(path, timeoutMs, attempt, externalSignal) {
    const timeout = timeoutMs || feedCfg().fetchTimeout || 8000;
    const maxAttempts = feedCfg().maxRetries || 3;
    attempt = attempt || 1;

    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = ctl ? setTimeout(function () {
      timedOut = true;
      ctl.abort();
    }, timeout) : null;

    const opts = ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' };

    return G.fetch(base() + path, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) {
        const e = new Error('HTTP ' + r.status + ' en ' + path);
        e.status = r.status;
        e.retryAfter = Number(r.headers.get && r.headers.get('Retry-After')) || 0;
        throw e;
      }
      return r.json();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      if (attempt < maxAttempts && (timedOut || err.name === 'TypeError')) {
        const delay = Math.min(3000, Math.pow(2, attempt - 1) * 400);
        return new Promise(function (res) { setTimeout(res, delay); })
          .then(function () { return getJSON(path, timeoutMs, attempt + 1, externalSignal); });
      }
      throw err;
    });
  }

  function normBar(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const t = parseTs(raw.openTime);
    const o = toNum(raw.open);
    const h = toNum(raw.high);
    const l = toNum(raw.low);
    const c = toNum(raw.close);
    if (t == null || o == null || h == null || l == null || c == null) return null;
    if (h < l || o <= 0 || h <= 0 || l <= 0 || c <= 0) return null;
    return {
      t: t, o: o, h: h, l: l, c: c,
      v: toNum(raw.tickVolume) || toNum(raw.volume) || 0,
      live: !!raw.isOpen
    };
  }

  function normalizeBars(arr) {
    const seen = new Map();
    for (let i = 0; i < arr.length; i++) {
      const b = normBar(arr[i]);
      if (b) seen.set(b.t, b);
    }
    return Array.from(seen.values()).sort(function (a, b) { return a.t - b.t; });
  }

  function fetchBars(symbol, tf, limit, signal) {
    const minBars = analysisCfg().minBarsPerTf || 60;
    const ask = Math.max(limit || 0, minBars + 20);
    const path = '/api/' + encodeURIComponent(feedName(symbol)) + '/ohlc?interval=' + tf + '&limit=' + ask;
    return getJSON(path, null, 1, signal).then(function (d) {
      const arr = Array.isArray(d) ? d : (d && Array.isArray(d.bars) ? d.bars : []);
      const bars = normalizeBars(arr);
      if (!bars.length) {
        const e = new Error('Sin datos para ' + symbol);
        e.status = 404;
        throw e;
      }
      return bars;
    });
  }

  function normTick(raw) {
    if (!raw || typeof raw !== 'object' || !raw.symbol) return null;
    const bid = toNum(raw.bid);
    const ask = toNum(raw.ask);
    const mid = toNum(raw.mid) || (bid && ask ? (bid + ask) / 2 : null);
    if (mid == null || mid <= 0) return null;
    return {
      symbol: String(raw.symbol).toUpperCase(),
      bid: bid || mid,
      ask: ask || mid,
      mid: mid,
      spread: toNum(raw.spread) || (bid && ask ? Math.max(0, ask - bid) : 0),
      ts: parseTs(raw.timestamp) || Date.now(),
      dayPct: toNum(raw.dayDiffPercent),
      state: raw.marketState || 'open',
      stale: !!raw.stale
    };
  }

  function fetchLatest(symbols, signal) {
    if (!symbols || !symbols.length) return Promise.resolve([]);
    const q = symbols.map(function (s) { return 'symbols=' + encodeURIComponent(feedName(s)); }).join('&');
    return getJSON('/api/latest?' + q, null, 1, signal).then(function (d) {
      let arr = Array.isArray(d) ? d : (d && Array.isArray(d.ticks) ? d.ticks : []);
      if (!arr.length && d && typeof d === 'object') {
        arr = Object.keys(d).map(function (k) { return Object.assign({ symbol: k }, d[k]); });
      }
      return arr.map(normTick).filter(Boolean);
    });
  }

  function pool(tasks, limit) {
    if (!tasks || !tasks.length) return Promise.resolve([]);
    const results = new Array(tasks.length);
    let next = 0;
    function worker() {
      if (next >= tasks.length) return Promise.resolve();
      const idx = next++;
      return Promise.resolve()
        .then(function () { return tasks[idx](); })
        .then(function (v) { results[idx] = { ok: true, v: v }; },
              function (e) { results[idx] = { ok: false, e: e }; })
        .then(worker);
    }
    const workers = [];
    for (let i = 0; i < Math.min(limit || 3, tasks.length); i++) workers.push(worker());
    return Promise.all(workers).then(function () { return results; });
  }

  function applyTick(bars, tfMs, price, ts) {
    if (!bars || !bars.length || !Number.isFinite(price) || price <= 0) return null;
    const last = bars[bars.length - 1];
    const currentBucket = Math.floor(ts / tfMs) * tfMs;
    const lastBucket = Math.floor(last.t / tfMs) * tfMs;

    if (currentBucket > lastBucket) {
      last.live = false;
      bars.push({ t: currentBucket, o: price, h: price, l: price, c: price, v: 1, live: true });
      return (currentBucket - lastBucket) > tfMs ? 'gap' : 'new';
    }
    if (ts < last.t) return null;
    last.live = true;
    if (price > last.h) last.h = price;
    if (price < last.l) last.l = price;
    last.c = price;
    last.v += 1;
    return 'upd';
  }

  function createFeed(symbols, handlers) {
    handlers = handlers || {};
    let conn = null, pollTimer = null, mode = 'off', stopped = false, lastTickAt = 0;
    const paused = {};

    function setMode(m, err) {
      mode = m;
      if (handlers.status) handlers.status(m, err);
    }

    function give(arr) {
      if (!arr || !arr.length) return;
      lastTickAt = Date.now();
      for (let i = 0; i < arr.length; i++) {
        if (handlers.tick) handlers.tick(arr[i]);
      }
    }

    function poll() {
      if (stopped) return;
      fetchLatest(symbols).then(function (arr) {
        give(arr);
        if (mode !== 'live') setMode('polling');
      }).catch(function (e) {
        if (mode !== 'live') setMode('error', e);
      });
    }

    function startSignalR() {
      if (!G.signalR) return Promise.resolve(false);
      try {
        conn = new G.signalR.HubConnectionBuilder()
          .withUrl(base() + '/hubs/tick')
          .withAutomaticReconnect()
          .build();
        conn.on('ReceiveTick', function (raw) { const t = normTick(raw); if (t) give([t]); });
        conn.onreconnecting(function () { setMode('reconnecting'); });
        conn.onreconnected(function () {
          conn.invoke('Subscribe', symbols).then(function () { setMode('live'); });
        });
        return conn.start().then(function () {
          return conn.invoke('Subscribe', symbols);
        }).then(function () {
          setMode('live');
          return true;
        }).catch(function () { conn = null; return false; });
      } catch (e) { conn = null; return Promise.resolve(false); }
    }

    return {
      start: function () {
        stopped = false;
        setMode('polling');
        pollTimer = setInterval(poll, feedCfg().pollMs || 2000);
        poll();
        const client = handlers.loadClient ? handlers.loadClient() : Promise.resolve(true);
        client.then(function (ok) { if (ok) startSignalR(); });
      },
      stop: function () {
        stopped = true;
        if (pollTimer) clearInterval(pollTimer);
        if (conn) try { conn.stop(); } catch (e) {}
        setMode('off');
      },
      mode: function () { return mode; }
    };
  }

  return { TF: TF_MS, fetchBars: fetchBars, fetchLatest: fetchLatest, pool: pool, applyTick: applyTick, createFeed: createFeed };
}));
