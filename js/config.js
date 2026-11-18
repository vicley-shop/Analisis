window.AT_CONFIG = {
  version: '3.0.0',
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
    entry: '15m',
    list: ['15m', '1h', '4h', '1d'],
    bias: ['4h', '1d'],
    weights: { '15m': 1, '1h': 2, '4h': 4, '1d': 8 }
  },

  regime: {
    adxPeriod: 14,
    adxMin: 22,
    adxStrong: 28,
    emaFast: 50,
    emaSlow: 200,
    emaSeparationMinPct: 0.5,
    returnLookback: 30,
    returnMinPct: 0.2
  },

  consensus: {
    minimumValidTfs: 3,
    weightedMajority: 0.60,
    thresholds: { strong: 65, moderate: 45 },
    adxNormalizationCeiling: 40,
    tieBreak: 'higher_tf'
  },

  risk: {
    atrPeriod: 14,
    atrStopMult: 1.5,
    atrTargetMult: 3.0,
    minRR: 1.8,
    maxRiskPct: 1.0,
    maxSignalAgeBars: 8
  },

  exhaustion: {
    rsiPeriod: 14,
    rsiOverbought: 80,
    rsiOversold: 20,
    adxDropPct: 30,
    lookbackCandles: 5,
    volumeDropPct: 40,
    volumeLookback: 20,
    divergenceLookback: 15,
    divergenceGap: 1,
    consensusOverextension: 95,
    dangerBlockThreshold: 2
  },

  smc: {
    atrPeriod: 14,
    pivotLookback: 5,
    mssWindow: 15,
    sweepWindow: 5,
    sweepAtrMult: 0.35,
    sweepMaxAtrMult: 1.8,
    sweepRejectionMin: 0.5,
    obAtrMult: 1.8,
    obMaxZones: 3,
    obMaxAgeBars: 150,
    fvgMaxZones: 3,
    fvgMinAtrMult: 0.30,
    fvgMaxAge: 60,
    eqToleranceAtrMult: 0.10,
    oteMin: 0.618,
    oteMax: 0.79,
    oteMid: 0.705,
    oteSwingRecency: 25,
    minSwingAtrMult: 4,
    maxSwingAge: 200,
    weights: { mss: 30, sweep: 25, fvg: 15, ob: 15, ote: 15 },
    requireZoneForHigh: true,
    highConfluence: 80,
    mediumConfluence: 50,
    minComponentsForMedium: 2
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
    minBarsPerTf: 50,
    throttleMs: 1000,
    useClosedCandlesOnly: true
  }
};