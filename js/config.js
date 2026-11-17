window.AT_CONFIG = {
  version: '2.4.0',
  base: 'https://biquote.io',
  signalrUrl: 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js',

  symbols: {
    XAUUSD: { name: 'Oro / Dólar', digits: 2, contract: 100, spread: 0.30, family: 'metals', enabled: true },
    XAGUSD: { name: 'Plata / Dólar', digits: 3, contract: 5000, spread: 0.03, family: 'metals', enabled: true },
    XAUEUR: { name: 'Oro / Euro', digits: 2, contract: 100, spread: 0.40, family: 'metals', enabled: true },
    EURUSD: { name: 'Euro / Dólar', digits: 5, contract: 100000, spread: 0.00010, family: 'forex', enabled: true },
    BNBUSD: { name: 'BNB / Dólar', digits: 2, contract: 1, spread: 0.30, family: 'crypto', enabled: true },
    BTCUSD: { name: 'Bitcoin / Dólar', digits: 2, contract: 1, spread: 0.60, family: 'crypto', enabled: true }
  },

  alias: {
    XAUUSD: 'XAUUSD',
    XAGUSD: 'XAGUSD',
    XAUEUR: 'XAUEUR',
    EURUSD: 'EURUSD',
    BNBUSD: 'BNBUSD',
    BTCUSD: 'BTCUSD'
  },

  timeframes: {
    entry: '1h',
    list: ['1m', '5m', '15m', '1h', '4h', '1d'],
    visible: ['15m', '1h', '4h', '1d'],
    optional: ['1m', '5m'],
    weights: { '1m': 1, '5m': 1, '15m': 1, '1h': 2, '4h': 3, '1d': 4 }
  },

  sessions: {
    london: { startGmt: 8, endGmt: 16 },
    newYork: { startGmt: 13, endGmt: 21 },
    combined: { startGmt: 13, endGmt: 16 },
    dstAdjust: false,
    requireActive: false
  },

  tradingHours: {
    forex: { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 22 } },
    metals: { alwaysOpen: false, open: { day: 0, hour: 23 }, close: { day: 5, hour: 22 } },
    crypto: { alwaysOpen: true },
    index: { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 21 } }
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
    sweepWindow: 5,
    sweepAtrMult: 0.25,
    sweepMaxAtrMult: 2.5,
    obAtrMult: 1.5,
    obMaxZones: 3,
    fvgMaxZones: 3,
    fvgMinAtrMult: 0.10,
    fvgMaxAge: 100,
    eqToleranceAtrMult: 0.10,
    oteMin: 0.618,
    oteMax: 0.79,
    oteMid: 0.705,
    oteSwingRecency: 40,
    minSwingAtrMult: 3,
    maxSwingAge: 200,
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
      ema50: '#00b8d9',
      ema200: '#a855f7',
      up: '#10b981',
      down: '#f43f5e',
      grid: 'rgba(255, 255, 255, 0.06)',
      zoneOB: 'rgba(16, 185, 129, 0.15)',
      zoneFVG: 'rgba(0, 184, 217, 0.15)',
      zoneOTE: 'rgba(168, 85, 247, 0.15)',
      drawing: '#00b8d9',
      drawingInProgress: 'rgba(34, 211, 238, 0.75)',
      drawingText: 'rgba(230, 237, 243, 0.85)'
    }
  },

  drawing: {
    enabled: true,
    fullscreenOnly: true,
    defaultColor: '#00b8d9',
    lineWidth: 1.8,
    previewDash: [4, 4],
    fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    maxPerScope: 100
  },

  analysis: {
    minBarsPerTf: 60,
    throttleMs: 1000,
    useClosedCandlesOnly: true
  }
};