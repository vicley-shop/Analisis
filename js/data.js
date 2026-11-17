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
  function base() { return cfg().base || 'https://biquote.io'; }
  function aliasMap() { return cfg().alias || {}; }
  function feedName(sym) { return aliasMap()[sym] || sym; }

  function internalName(name) {
    const up = String(name).toUpperCase();
    const a = aliasMap();
    for (const k in a) if (String(a[k]).toUpperCase() === up) return k;
    return up;
  }

  function toNum(x) {
    if (x == null || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function parseTs(x) {
    if (x == null) return null;
    if (typeof x === 'number' && Number.isFinite(x)) {
      const t = x < 1e12 ? x * 1000 : x;
      return t > 0 ? t : null;
    }
    const t = Date.parse(x);
    return Number.isFinite(t) && t > 0 ? t : null;
  }

  function retryable(e) {
    if (!e) return false;
    if (e.network || e.timeout) return true;
    return e.status >= 500 && e.status < 600;
  }

  function getJSON(path, timeoutMs, attempt) {
    const timeout = timeoutMs || feedCfg().fetchTimeout || 8000;
    const maxAttempts = 3;
    attempt = attempt || 1;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let aborted = false;
    const timer = ctl ? setTimeout(function () { aborted = true; ctl.abort(); }, timeout) : null;
    const opts = ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' };

    return G.fetch(base() + path, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) {
        const e = new Error('HTTP ' + r.status + ' en ' + path);
        e.status = r.status;
        e.retryAfter = Number((r.headers && r.headers.get && r.headers.get('Retry-After')) || 0) || 0;
        throw e;
      }
      return r.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (aborted) {
        const e = new Error('timeout ' + timeout + 'ms en ' + path);
        e.status = 0;
        e.timeout = true;
        throw e;
      }
      const e = new Error((err && err.message) || 'error de red en ' + path);
      e.status = 0;
      e.network = true;
      throw e;
    }).catch(function (e) {
      if (attempt < maxAttempts && retryable(e)) {
        const delay = Math.min(2000, Math.pow(2, attempt - 1) * 300);
        const jitter = Math.random() * 200;
        return new Promise(function (resolve) { setTimeout(resolve, delay + jitter); })
          .then(function () { return getJSON(path, timeoutMs, attempt + 1); });
      }
      throw e;
    });
  }

  function isMissing(e) {
    return !!e && (e.status === 404 || e.status === 410);
  }

  function normBar(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const t = parseTs(raw.openTime);
    const o = toNum(raw.open);
    const h = toNum(raw.high);
    const l = toNum(raw.low);
    const c = toNum(raw.close);
    if (t == null || o == null || h == null || l == null || c == null) return null;
    if (h < l) return null;
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return null;
    const v = toNum(raw.tickVolume);
    const vb = toNum(raw.volume);
    const vc = toNum(raw.vol);
    return {
      t: t,
      o: o,
      h: h,
      l: l,
      c: c,
      v: v != null ? v : (vb != null ? vb : (vc != null ? vc : 0)),
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

  function fetchRaw(name, tf, limit) {
    const path = '/api/' + encodeURIComponent(name) + '/ohlc?interval=' + tf + '&limit=' + (limit || 500);
    return getJSON(path).then(function (d) {
      const arr = Array.isArray(d) ? d : (d && Array.isArray(d.bars) ? d.bars : []);
      const bars = normalizeBars(arr);
      if (!bars.length) {
        const e = new Error('sin datos para ' + name);
        e.status = 404;
        throw e;
      }
      return bars;
    });
  }

  function fetchBars(symbol, tf, limit) {
    return fetchRaw(feedName(symbol), tf, limit);
  }

  function normTick(raw) {
    if (!raw || typeof raw !== 'object' || !raw.symbol) return null;
    const bid = toNum(raw.bid);
    const ask = toNum(raw.ask);
    const midRaw = toNum(raw.mid);
    const mid = midRaw != null ? midRaw : (bid != null && ask != null ? (bid + ask) / 2 : null);
    if (mid == null || mid <= 0) return null;
    const ts = parseTs(raw.timestamp);
    const spreadRaw = toNum(raw.spread);
    return {
      symbol: internalName(raw.symbol),
      bid: bid != null && bid > 0 ? bid : mid,
      ask: ask != null && ask > 0 ? ask : mid,
      mid: mid,
      spread: spreadRaw != null ? spreadRaw : (bid != null && ask != null ? Math.max(0, ask - bid) : 0),
      ts: ts != null ? ts : Date.now(),
      dayPct: toNum(raw.dayDiffPercent),
      high: toNum(raw.high),
      low: toNum(raw.low),
      state: raw.marketState || 'open',
      stale: !!raw.stale
    };
  }

  function parseLatestPayload(d) {
    let arr;
    if (Array.isArray(d)) {
      arr = d;
    } else if (d && Array.isArray(d.ticks)) {
      arr = d.ticks;
    } else if (d && typeof d === 'object') {
      arr = Object.keys(d).map(function (k) {
        const v = d[k];
        return v && typeof v === 'object' ? Object.assign({ symbol: k }, v) : null;
      });
    } else {
      arr = [];
    }
    return arr.map(normTick).filter(Boolean);
  }

  function fetchLatest(symbols) {
    if (!symbols || !symbols.length) return Promise.resolve([]);
    const q = symbols.map(function (s) {
      return 'symbols=' + encodeURIComponent(feedName(s));
    }).join('&');
    return getJSON('/api/latest?' + q).then(parseLatestPayload);
  }

  function pool(tasks, limit, globalTimeoutMs) {
    if (!tasks || !tasks.length) return Promise.resolve([]);
    const results = new Array(tasks.length);
    let next = 0;

    function worker() {
      if (next >= tasks.length) return Promise.resolve();
      const idx = next++;
      return Promise.resolve()
        .then(function () { return tasks[idx](); })
        .then(
          function (v) { results[idx] = { ok: true, v: v }; },
          function (e) { results[idx] = { ok: false, e: e }; }
        )
        .then(worker);
    }

    const workers = [];
    const parallel = Math.min(limit || 4, tasks.length);
    for (let i = 0; i < parallel; i++) workers.push(worker());
    const run = Promise.all(workers).then(function () { return results; });

    if (!globalTimeoutMs) return run;

    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        const err = new Error('pool timeout ' + globalTimeoutMs + 'ms');
        err.timeout = true;
        err.partial = results.slice();
        reject(err);
      }, globalTimeoutMs);
      run.then(
        function (r) { clearTimeout(timer); resolve(r); },
        function (e) { clearTimeout(timer); reject(e); }
      );
    });
  }

  function applyTick(bars, tfMs, price, ts, volume) {
    if (!bars || !bars.length) return null;
    if (!Number.isFinite(price) || price <= 0) return null;
    if (!Number.isFinite(ts) || !Number.isFinite(tfMs) || tfMs <= 0) return null;
    const last = bars[bars.length - 1];
    const vol = Number.isFinite(volume) && volume >= 0 ? volume : 1;

    if (ts >= last.t + tfMs) {
      last.live = false;
      const newBarT = Math.floor(ts / tfMs) * tfMs;
      bars.push({
        t: newBarT,
        o: price,
        h: price,
        l: price,
        c: price,
        v: vol,
        live: true
      });
      return newBarT > last.t + tfMs ? 'gap' : 'new';
    }

    if (ts < last.t) return null;

    last.live = true;
    if (price > last.h) last.h = price;
    if (price < last.l) last.l = price;
    last.c = price;
    last.v += vol;
    return 'upd';
  }

  function createFeed(symbols, handlers) {
    handlers = handlers || {};

    const pollMs = feedCfg().pollMs || 2000;
    const pollSlowMs = feedCfg().pollSlowMs || 20000;
    const retryMs = feedCfg().retryMs || 60000;

    let conn = null;
    let pollTimer = null;
    let pollInterval = pollMs;
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

    function feedList() {
      return active().map(feedName);
    }

    function setMode(m, err) {
      if (m === mode && !err) return;
      mode = m;
      if (err) lastError = err;
      if (handlers.status) handlers.status(m, err || lastError);
    }

    function give(arr) {
      if (!arr || !arr.length) return;
      lastTickAt = Date.now();
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        if (reported[t.symbol]) {
          delete reported[t.symbol];
          delete paused[t.symbol];
          if (handlers.found) handlers.found(t.symbol);
        }
        if (handlers.tick) handlers.tick(t);
      }
    }

    function emit(raw) {
      const t = normTick(raw);
      if (t) give([t]);
    }

    function startPolling(ms) {
      pollInterval = ms;
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        poll().catch(function () { void 0; });
      }, ms);
    }

    function drop(sym) {
      const first = !reported[sym];
      paused[sym] = Date.now() + retryMs;
      reported[sym] = true;
      if (first && handlers.missing) handlers.missing(sym);
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
        if (isMissing(e)) {
          active().forEach(function (s) { drop(s); });
          return;
        }
        if (mode !== 'live') setMode('error', e);
      });
    }

    function startSignalR() {
      if (!G.signalR || !active().length) return Promise.resolve(false);
      try {
        conn = new G.signalR.HubConnectionBuilder()
          .withUrl(base() + '/hubs/tick', { withCredentials: false })
          .withAutomaticReconnect()
          .build();

        conn.on('ReceiveTick', emit);

        conn.onreconnecting(function () {
          setMode('reconnecting');
          startPolling(pollMs);
        });

        conn.onreconnected(function () {
          conn.invoke('Subscribe', feedList())
            .then(function () {
              setMode('live');
              startPolling(pollSlowMs);
            })
            .catch(function () {
              setMode('polling');
              startPolling(pollMs);
            });
        });

        conn.onclose(function () {
          if (!stopped) {
            setMode('polling');
            startPolling(pollMs);
          }
        });

        const startP = conn.start();
        startP.catch(function () { void 0; });
        const timeoutP = new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('SignalR timeout')); }, 5000);
        });

        return Promise.race([startP, timeoutP])
          .then(function () {
            return conn.invoke('Subscribe', feedList());
          })
          .then(function () {
            setMode('live');
            startPolling(pollSlowMs);
            return true;
          }, function () {
            try { conn.stop(); } catch (e) { void 0; }
            conn = null;
            return false;
          });
      } catch (e) {
        conn = null;
        return Promise.resolve(false);
      }
    }

    return {
      start: function () {
        stopped = false;
        setMode('polling');
        if (!pollTimer) startPolling(pollMs);
        poll().catch(function () { void 0; });
        const client = handlers.loadClient
          ? handlers.loadClient().catch(function () { return false; })
          : Promise.resolve(true);
        return client.then(function () {
          return startSignalR();
        }).then(function () {
          return mode;
        });
      },
      stop: function () {
        stopped = true;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (conn) { try { conn.stop(); } catch (e) { void 0; } conn = null; }
        setMode('off');
      },
      mode: function () { return mode; },
      interval: function () { return pollInterval; },
      lastTickAt: function () { return lastTickAt; },
      reconnect: function () {
        stopped = true;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (conn) { try { conn.stop(); } catch (e) { void 0; } conn = null; }
        backoffUntil = 0;
        pollInFlight = false;
        this.start();
      }
    };
  }

  return {
    TF: TF_MS,
    base: base,
    feedName: feedName,
    isMissing: isMissing,
    fetchBars: fetchBars,
    fetchLatest: fetchLatest,
    pool: pool,
    applyTick: applyTick,
    createFeed: createFeed
  };
}));