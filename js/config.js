window.AT_CONFIG = {
  base: 'https://biquote.io',
  signalrUrl: 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js',
  alias: {
    XAUUSD: 'XAUUSD',
    XAGUSD: 'XAGUSD',
    EURUSD: 'EURUSD',
    BTCUSD: 'BTCUSD'
  },
  symbols: {
    XAUUSD: { name: 'Oro / Dólar', digits: 2, contract: 100, spread: 0.30, family: 'metals' },
    XAGUSD: { name: 'Plata / Dólar', digits: 3, contract: 5000, spread: 0.03, family: 'metals' },
    EURUSD: { name: 'Euro / Dólar', digits: 5, contract: 100000, spread: 0.00010, family: 'forex' },
    BTCUSD: { name: 'Bitcoin / Dólar', digits: 2, contract: 1, spread: 0.60, family: 'crypto' }
  },
  sessions: {
    london: { startGmt: 7, endGmt: 16 },
    newYork: { startGmt: 12, endGmt: 21 },
    combined: { startGmt: 7, endGmt: 21 }
  },
  timeframes: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
  defaultTf: '1h',
  consensus: {
    thresholds: {
      strong: 75,
      moderate: 50
    }
  },
  exhaustion: {
    rsiOverbought: 70,
    rsiOversold: 30,
    adxDropPct: 20,
    lookbackCandles: 5,
    volumeDropPct: 30,
    volumeLookback: 20
  }
};