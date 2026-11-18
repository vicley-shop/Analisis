window.AT_CONFIG = {
  version: '5.0.0',
  base: 'https://biquote.io',
  signalrUrl: 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js',

  timings: {
    updateIntervalMs: 1000,
    priceCheckMs: 400,
    cycleBudgetMs: 4000,
    maxSignalAgeMs: 15000
  },

  symbols: {
    XAUUSD: { name: 'Oro / Dólar',     digits: 2, family: 'metals', enabled: true },
    XAGUSD: { name: 'Plata / Dólar',   digits: 3, family: 'metals', enabled: true },
    XAUEUR: { name: 'Oro / Euro',      digits: 2, family: 'metals', enabled: true },
    EURUSD: { name: 'Euro / Dólar',    digits: 5, family: 'forex',  enabled: true },
    BNBUSD: { name: 'BNB / Dólar',     digits: 2, family: 'crypto', enabled: true },
    BTCUSD: { name: 'Bitcoin / Dólar', digits: 2, family: 'crypto', enabled: true }
  },

  timeframes: {
    entry: '15m',
    list: ['15m', '1h', '4h', '1d'],
    bias: ['4h', '1d'],
    weights: { '15m': 1, '1h': 2, '4h': 4, '1d': 8 }
  },

  analysis: {
    minBarsPerTf: 60,
    useClosedCandlesOnly: true
  },

  regime: {
    adxPeriod: 14,
    adxMin: 18,
    adxStrong: 25,
    emaFast: 20,
    emaMid: 50,
    emaSlow: 200,
    rsiPeriod: 14,
    momentumPeriod: 10
  },

  consensus: {
    minimumValidTfs: 2,
    weightedMajority: 0.58,
    thresholds: { strong: 65, moderate: 45 },
    adxNormalizationCeiling: 40
  },

  risk: {
    atrPeriod: 14,
    atrStopMult: 1.5,
    atrTargetMult: 3.0,
    minRR: 1.5
  },

  exhaustion: {
    rsiPeriod: 14,
    rsiOverbought: 78,
    rsiOversold: 22,
    divergenceLookback: 14
  },

  smc: {
    atrPeriod: 14,
    pivotLookback: 4,
    mssWindow: 15,
    zigzagAtrMult: 1.6,
    zigzagEnabled: true,
    sweepWindow: 6,
    sweepAtrMult: 0.30,
    sweepMaxAtrMult: 2.0,
    sweepRejectionMin: 0.45,
    obAtrMult: 1.5,
    obMaxZones: 3,
    obMaxAgeBars: 120,
    fvgMaxZones: 3,
    fvgMinAtrMult: 0.25,
    fvgMaxAge: 60,
    oteMin: 0.618,
    oteMax: 0.79,
    oteMid: 0.705,
    oteSwingRecency: 30,
    minSwingAtrMult: 3.0,
    maxSwingAge: 180,
    weights: { mss: 30, sweep: 25, fvg: 15, ob: 15, ote: 15 },
    highConfluence: 75,
    mediumConfluence: 45,
    minConfidence: 15
  },

  sessions: {
    london:   { startGmt: 8,  endGmt: 16 },
    newYork:  { startGmt: 13, endGmt: 21 },
    combined: { startGmt: 13, endGmt: 16 }
  },

  tradingHours: {
    forex:  { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 22 } },
    metals: { alwaysOpen: false, open: { day: 0, hour: 23 }, close: { day: 5, hour: 22 } },
    crypto: { alwaysOpen: true }
  },

  feed: {
    fetchTimeout: 8000,
    globalTimeout: 20000,
    pollMs: 2000,
    pollSlowMs: 15000,
    retryMs: 30000,
    staleThresholdMs: 15000,
    maxRetries: 3
  },

  chart: {
    defaultCount: 140,
    colors: {
      ema20: '#F59E0B',
      ema50: '#06B6D4',
      ema200: '#A855F7',
      up: '#10B981',
      down: '#F43F5E',
      grid: 'rgba(255, 255, 255, 0.04)',
      zoneOB: 'rgba(16, 185, 129, 0.16)',
      zoneOBbear: 'rgba(244, 63, 94, 0.16)',
      zoneFVG: 'rgba(59, 130, 246, 0.16)',
      zoneOTE: 'rgba(168, 85, 247, 0.16)',
      drawing: '#3B82F6',
      drawingInProgress: 'rgba(59, 130, 246, 0.7)'
    }
  },

  drawing: {
    enabled: true,
    defaultColor: '#3B82F6',
    lineWidth: 1.8,
    fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    maxPerScope: 100
  }
};
