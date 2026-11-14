window.AT_CONFIG = window.AT_CONFIG || {};
window.AT_CONFIG.base = window.AT_CONFIG.base || 'https://biquote.io';
window.AT_CONFIG.alias = window.AT_CONFIG.alias || {
  XAUUSD: 'XAUUSD',
  XAGUSD: 'XAGUSD',
  EURUSD: 'EURUSD',
  BTCUSD: 'BTCUSD'
};
if (window.AT_CONFIG.signalrUrl === undefined) {
  window.AT_CONFIG.signalrUrl = 'https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js';
}