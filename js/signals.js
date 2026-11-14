(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./indicators.js'));
  else { root.AT = root.AT || {}; root.AT.signals = factory(root.AT.indicators); }
}(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  const BUY = 1, SELL = -1, NEUTRAL = 0;

  function cols(bars) {
    const n = bars.length;
    const k = { o: new Array(n), h: new Array(n), l: new Array(n), c: new Array(n), v: new Array(n), t: new Array(n), n: n };
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      k.o[i] = b.o; k.h[i] = b.h; k.l[i] = b.l; k.c[i] = b.c; k.v[i] = b.v || 0; k.t[i] = b.t;
    }
    return k;
  }

  function compute(bars) {
    const k = cols(bars), h = k.h, l = k.l, c = k.c;
    const ind = { k: k, x: {} };
    ind.ema50 = I.ema(c, 50);
    ind.ema200 = I.ema(c, 200);
    ind.kijun = I.ichimoku(h, l).kijun;
    ind.vwma = I.vwma(c, k.v, 20);
    ind.rsi = I.rsi(c, 14);
    ind.macd = I.macd(c, 12, 26, 9);
    ind.stoch = I.stoch(h, l, c, 14, 3, 3);
    ind.adx = I.adx(h, l, c, 14);
    ind.atr = I.atr(h, l, c, 14);
    return ind;
  }

  function num(v) { return v != null && isFinite(v); }

  function trendVotes(ind, i) {
    const out = [];
    const price = ind.k.c[i];

    function add(name, value, action, weight) {
      out.push({ name: name, value: value, action: action, weight: weight });
    }

    if (num(ind.ema50[i]) && num(ind.ema200[i])) {
      const above50 = price > ind.ema50[i];
      const above200 = price > ind.ema200[i];
      const trendUp = ind.ema50[i] > ind.ema200[i];
      let action = NEUTRAL;
      if (above50 && above200 && trendUp) action = BUY;
      else if (!above50 && !above200 && !trendUp) action = SELL;
      add('EMA 50/200', ind.ema50[i], action, 1.5);
    }

    if (num(ind.kijun[i])) {
      add('Ichimoku Kijun', ind.kijun[i], price > ind.kijun[i] ? BUY : price < ind.kijun[i] ? SELL : NEUTRAL, 1);
    }

    if (num(ind.vwma[i])) {
      add('VWMA (20)', ind.vwma[i], price > ind.vwma[i] ? BUY : price < ind.vwma[i] ? SELL : NEUTRAL, 0.5);
    }

    return out;
  }

  function momentumVotes(ind, i) {
    const out = [];
    const p = i - 1;
    if (p < 0) return out;

    function add(name, value, action, weight) {
      out.push({ name: name, value: value, action: action, weight: weight });
    }

    if (num(ind.rsi[i]) && num(ind.rsi[p])) {
      const r = ind.rsi[i], rp = ind.rsi[p];
      let action = NEUTRAL;
      if (r < 30 && r > rp) action = BUY;
      else if (r > 70 && r < rp) action = SELL;
      else if (r >= 50 && r > rp) action = BUY;
      else if (r < 50 && r < rp) action = SELL;
      add('RSI (14)', r, action, 1);
    }

    if (num(ind.macd.macd[i]) && num(ind.macd.signal[i])) {
      const m = ind.macd.macd[i], s = ind.macd.signal[i];
      add('MACD (12,26,9)', m, m > s ? BUY : m < s ? SELL : NEUTRAL, 1.5);
    }

    if (num(ind.stoch.k[i]) && num(ind.stoch.d[i])) {
      const k = ind.stoch.k[i], d = ind.stoch.d[i];
      let action = NEUTRAL;
      if (k < 20 && d < 20 && k > d) action = BUY;
      else if (k > 80 && d > 80 && k < d) action = SELL;
      add('Stochastic (14,3,3)', k, action, 1);
    }

    if (num(ind.adx.adx[i]) && num(ind.adx.pdi[i]) && num(ind.adx.mdi[i])) {
      const a = ind.adx.adx[i], pd = ind.adx.pdi[i], md = ind.adx.mdi[i];
      let action = NEUTRAL;
      if (a >= 20) action = pd > md ? BUY : pd < md ? SELL : NEUTRAL;
      add('ADX (14)', a, action, 0.5);
    }

    return out;
  }

  function tally(votes) {
    let b = 0, s = 0, z = 0, wb = 0, ws = 0, wz = 0;
    votes.forEach(function (v) {
      const w = v.weight != null ? v.weight : 1;
      if (v.action === BUY) { b++; wb += w; }
      else if (v.action === SELL) { s++; ws += w; }
      else { z++; wz += w; }
    });
    const total = wb + ws + wz;
    return {
      buy: b, sell: s, neutral: z,
      total: votes.length,
      wBuy: wb, wSell: ws, wNeutral: wz,
      score: total > 0 ? (wb - ws) / total : 0
    };
  }

  function label(score) {
    if (!isFinite(score)) score = 0;
    if (score >= 0.5) return { key: 'strong_buy', text: 'Compra fuerte', dir: 1 };
    if (score >= 0.15) return { key: 'buy', text: 'Compra', dir: 1 };
    if (score > -0.15) return { key: 'neutral', text: 'Neutral', dir: 0 };
    if (score > -0.5) return { key: 'sell', text: 'Venta', dir: -1 };
    return { key: 'strong_sell', text: 'Venta fuerte', dir: -1 };
  }

  function summaryAt(ind, i) {
    const m = trendVotes(ind, i), o = momentumVotes(ind, i);
    const tm = tally(m), to = tally(o);
    const all = tally(m.concat(o));
    let score = 0;
    if (m.length && o.length) score = (tm.score + to.score) / 2;
    else if (m.length) score = tm.score;
    else if (o.length) score = to.score;
    return {
      score: score,
      label: label(score),
      trend: { votes: m, t: tm, label: label(tm.score) },
      momentum: { votes: o, t: to, label: label(to.score) },
      counts: { buy: all.buy, sell: all.sell, neutral: all.neutral }
    };
  }

  function analyze(bars) {
    if (!bars || bars.length < 30) return null;
    const ind = compute(bars), i = bars.length - 1;
    const s = summaryAt(ind, i);
    s.ind = ind;
    s.price = bars[i].c;
    s.atr = ind.atr[i];
    s.adx = ind.adx.adx[i];
    s.rsi = ind.rsi[i];
    return s;
  }

  function ratingSeries(ind, warmup) {
    const n = ind.k.n, out = new Array(n).fill(null);
    for (let i = Math.max(1, warmup || 0); i < n; i++) out[i] = summaryAt(ind, i).score;
    return out;
  }

  function inSession(t, startGmt, endGmt) {
    const h = new Date(t).getUTCHours();
    if (startGmt <= endGmt) return h >= startGmt && h < endGmt;
    return h >= startGmt || h < endGmt;
  }

  return {
    BUY: BUY, SELL: SELL, NEUTRAL: NEUTRAL,
    compute: compute,
    summaryAt: summaryAt,
    analyze: analyze,
    ratingSeries: ratingSeries,
    label: label,
    tally: tally,
    inSession: inSession
  };
}));