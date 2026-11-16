window.AT_CONFIG = {
  version: '2.0.0',
  base: 'https://biquote.io',
  signalrUrl: 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js',

  symbols: {
    XAUUSD: { name: 'Oro / Dólar',      digits: 2, contract: 100,    spread: 0.30,    family: 'metals', enabled: true },
    XAGUSD: { name: 'Plata / Dólar',    digits: 3, contract: 5000,   spread: 0.03,    family: 'metals', enabled: true },
    EURUSD: { name: 'Euro / Dólar',     digits: 5, contract: 100000, spread: 0.00010, family: 'forex',  enabled: true },
    BTCUSD: { name: 'Bitcoin / Dólar',  digits: 2, contract: 1,      spread: 0.60,    family: 'crypto', enabled: true }
  },

  alias: {
    XAUUSD: 'XAUUSD',
    XAGUSD: 'XAGUSD',
    EURUSD: 'EURUSD',
    BTCUSD: 'BTCUSD'
  },

  timeframes: {
    entry: '1h',
    list: ['15m', '1h', '4h', '1d'],
    weights: { '15m': 1, '1h': 2, '4h': 3, '1d': 4 },
    optional: ['1m', '5m', '30m']
  },

  sessions: {
    london:   { startGmt: 7,  endGmt: 16 },
    newYork:  { startGmt: 12, endGmt: 21 },
    combined: { startGmt: 7,  endGmt: 21 },
    dstAdjust: true,
    requireActive: true
  },

  consensus: {
    thresholds: { strong: 70, moderate: 50 },
    adxNormalizationCeiling: 50,
    minimumValidTfs: 3,
    tieBreak: 'higher_tf'
  },

  exhaustion: {
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    adxDropPct: 20,
    lookbackCandles: 5,
    volumeDropPct: 30,
    volumeLookback: 20,
    divergenceLookback: 15,
    divergenceGap: 1,
    consensusOverextension: 90
  },

  smc: {
    atrPeriod: 14,
    pivotLookback: 5,
    mssWindow: 15,
    sweepWindow: 3,
    sweepAtrMult: 0.25,
    obAtrMult: 1.5,
    obMaxZones: 3,
    fvgMaxZones: 3,
    oteMin: 0.618,
    oteMax: 0.79,
    oteMid: 0.705,
    oteSwingRecency: 30,
    weights: { mss: 30, sweep: 25, fvg: 15, ob: 15, ote: 15 },
    requireZoneForHigh: true,
    highConfluence: 80,
    mediumConfluence: 50
  },

  risk: {
    atrStopMult: 1.5,
    atrTargetMult: 3.0,
    minRR: 1.5,
    maxRiskPct: 1.0,
    maxSignalAgeBars: 5
  },

  feed: {
    fetchTimeout: 8000,
    globalTimeout: 20000,
    pollMs: 2000,
    pollSlowMs: 20000,
    retryMs: 60000,
    backoffMs: 10000,
    maxConcurrent: 3,
    staleThresholdMs: 15000
  },

  chart: {
    defaultCount: 150,
    minCount: 20,
    maxCount: 1000,
    emaPeriods: [20, 50, 200],
    colors: {
      ema20: '#f59e0b',
      ema50: '#3b82f6',
      ema200: '#a855f7',
      up: '#22c55e',
      down: '#ef4444',
      grid: 'rgba(255, 255, 255, 0.05)',
      zoneOB: 'rgba(34, 197, 94, 0.15)',
      zoneFVG: 'rgba(59, 130, 246, 0.15)',
      zoneOTE: 'rgba(168, 85, 247, 0.15)'
    }
  },

  analysis: {
    minBarsPerTf: 60,
    throttleMs: 1000,
    useClosedCandlesOnly: true
  }
};