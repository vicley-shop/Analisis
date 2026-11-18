window.AT_CONFIG = {
  version: '4.0.0',
  base: 'https://biquote.io',
  signalrUrl: 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js',

  timings: {
    updateIntervalMs: 1000,
    priceCheckMs: 500,
    cycleBudgetMs: 4500,
    staleBarsMs: 20000,
    maxSignalAgeMs: 5000
  },

  symbols: {
    XAUUSD: { name: 'Oro / Dólar',     digits: 2, contract: 100,    spread: 0.30,    family: 'metals', enabled: true },
    XAGUSD: { name: 'Plata / Dólar',   digits: 3, contract: 5000,   spread: 0.03,    family: 'metals', enabled: true },
    XAUEUR: { name: 'Oro / Euro',      digits: 2, contract: 100,    spread: 0.40,    family: 'metals', enabled: true },
    EURUSD: { name: 'Euro / Dólar',    digits: 5, contract: 100000, spread: 0.00010, family: 'forex',  enabled: true },
    BNBUSD: { name: 'BNB / Dólar',     digits: 2, contract: 1,      spread: 0.30,    family: 'crypto', enabled: true },
    BTCUSD: { name: 'Bitcoin / Dólar', digits: 2, contract: 1,      spread: 0.60,    family: 'crypto', enabled: true }
  },

  timeframes: {
    entry: '15m',
    list: ['15m', '1h', '4h', '1d'],
    bias: ['4h', '1d'],
    weights: { '15m': 1, '1h': 2, '4h': 4, '1d': 8 }
  },

  regime: {
    adxPeriod: 14,
    adxMin: 20,
    adxStrong: 25,
    emaFast: 50,
    emaSlow: 200,
    emaSeparationMinPct: 0.15,
    returnLookback: 30,
    returnMinPct: 0.1
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
    minRR: 1.5,
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
    dangerBlockThreshold: 3,
    enableVolumeAlert: false
  },

  smc: {
    atrPeriod: 14,
    pivotLookback: 5,
    mssWindow: 15,
    mssDisplacementBodyRatio: 0.55,
    mssDisplacementAtrMult: 1.0,
    displacementEnabled: false,
    zigzagAtrMult: 1.8,
    zigzagEnabled: true,
    sweepWindow: 5,
    sweepAtrMult: 0.35,
    sweepMaxAtrMult: 1.8,
    sweepRejectionMin: 0.5,
    obAtrMult: 1.8,
    obMaxZones: 3,
    obMaxAgeBars: 150,
    obMitigationCloseOnly: true,
    fvgMaxZones: 3,
    fvgMinAtrMult: 0.30,
    fvgMaxAge: 60,
    fvgMitigationCloseOnly: true,
    eqToleranceAtrMult: 0.10,
    oteMin: 0.618,
    oteMax: 0.79,
    oteMid: 0.705,
    oteSwingRecency: 25,
    minSwingAtrMult: 4,
    maxSwingAge: 200,
    swingBodyRatioMin: 0.5,
    requireBosForOte: false,
    requirePremiumDiscount: false,
    weights: { mss: 30, sweep: 25, fvg: 15, ob: 15, ote: 15 },
    bosWeightFactor: 0.5,
    staleMssFactor: 0.5,
    sweepAgainstPenalty: 15,
    htfBiasBonus: 10,
    htfBiasPenalty: 10,
    requireZoneForHigh: true,
    highConfluence: 80,
    mediumConfluence: 50,
    minComponentsForMedium: 2,
    minConfidence: 15,
    riskTiers: { high: 1.0, medium: 0.5, low: 0.25, vetoed: 0.0 },
    blockers: {
      enabled: false,
      strict: false,
      lowVolumeHours: [],
      newsWindows: []
    }
  },

  sessions: {
    london:   { startGmt: 8,  endGmt: 16 },
    newYork:  { startGmt: 13, endGmt: 21 },
    combined: { startGmt: 13, endGmt: 16 },
    dstAdjust: false,
    requireActive: false
  },

  tradingHours: {
    forex:  { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 22 } },
    metals: { alwaysOpen: false, open: { day: 0, hour: 23 }, close: { day: 5, hour: 22 } },
    crypto: { alwaysOpen: true },
    index:  { alwaysOpen: false, open: { day: 0, hour: 22 }, close: { day: 5, hour: 21 } }
  },

  feed: {
    fetchTimeout: 8000,
    globalTimeout: 20000,
    pollMs: 2000,
    pollSlowMs: 20000,
    retryMs: 60000,
    backoffMs: 10000,
    maxConcurrent: 3,
    staleThresholdMs: 15000,
    maxRetries: 3
  },

  chart: {
    defaultCount: 150,
    minCount: 20,
    maxCount: 1000,
    emaPeriods: [20, 50, 200],
    colors: {
      ema20: '#F59E0B',
      ema50: '#22D3EE',
      ema200: '#A855F7',
      up: '#00D4AA',
      down: '#FF4D6A',
      grid: 'rgba(255, 255, 255, 0.04)',
      zoneOB: 'rgba(0, 212, 170, 0.14)',
      zoneOBbear: 'rgba(255, 77, 106, 0.14)',
      zoneFVG: 'rgba(79, 140, 255, 0.14)',
      zoneOTE: 'rgba(168, 85, 247, 0.14)',
      drawing: '#4F8CFF',
      drawingInProgress: 'rgba(79, 140, 255, 0.75)',
      drawingText: 'rgba(241, 245, 249, 0.85)'
    }
  },

  drawing: {
    enabled: true,
    fullscreenOnly: true,
    defaultColor: '#4F8CFF',
    lineWidth: 1.8,
    previewDash: [4, 4],
    fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
    maxPerScope: 100
  },

  analysis: {
    minBarsPerTf: 210,
    useClosedCandlesOnly: true
  }
};