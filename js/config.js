window.AT_CONFIG = window.AT_CONFIG || {};

window.AT_CONFIG.base = window.AT_CONFIG.base || 'https://biquote.io';

window.AT_CONFIG.signalrUrl = window.AT_CONFIG.signalrUrl ||
  'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js';

window.AT_CONFIG.alias = {
  XAUUSD: 'XAUUSD',
  XAGUSD: 'XAGUSD',
  EURUSD: 'EURUSD',
  BTCUSD: 'BTCUSD'
};

window.AT_CONFIG.symbols = {
  XAUUSD: {
    name: 'Oro',
    digits: 2,
    contract: 100,
    spread: 0.30,
    slippage: 0.05,
    family: 'metals',
    bestTf: '1h',
    defaultSl: 1.5,
    defaultTp: 2.5
  },
  XAGUSD: {
    name: 'Plata',
    digits: 3,
    contract: 5000,
    spread: 0.03,
    slippage: 0.005,
    family: 'metals',
    bestTf: '4h',
    defaultSl: 1.5,
    defaultTp: 2.0
  },
  EURUSD: {
    name: 'Euro / Dólar',
    digits: 5,
    contract: 100000,
    spread: 0.00010,
    slippage: 0.00002,
    family: 'forex',
    bestTf: '1h',
    defaultSl: 1.5,
    defaultTp: 1.5
  },
  BTCUSD: {
    name: 'Bitcoin',
    digits: 2,
    contract: 1,
    spread: 0.60,
    slippage: 0.10,
    family: 'crypto',
    bestTf: '4h',
    defaultSl: 2.0,
    defaultTp: 3.0
  }
};

window.AT_CONFIG.families = {
  metals: ['XAUUSD', 'XAGUSD'],
  forex: ['EURUSD'],
  crypto: ['BTCUSD']
};

window.AT_CONFIG.sessions = {
  london: { startGmt: 7, endGmt: 16 },
  newYork: { startGmt: 12, endGmt: 21 },
  combined: { startGmt: 7, endGmt: 21 }
};

window.AT_CONFIG.backtest = {
  walkForwardWindows: 4,
  minTradesEdge: 100,
  minTradesOos: 30,
  monteCarloRuns: 1000,
  ruinThresholdPct: 20
};

window.AT_CONFIG.risk = {
  defaultBalance: 10000,
  defaultRiskPct: 1,
  defaultMaxAggregatePct: 2,
  defaultMaxTradesPerFamily: 1
};

window.AT_CONFIG.indicators = {
  trendSet: ['EMA 50', 'EMA 200', 'Ichimoku base (26)', 'VWMA (20)'],
  momentumSet: ['RSI (14)', 'MACD (12,26,9)', 'Stochastic (14,3,3)', 'ADX (14)']
};