window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.zones = (function () {
  'use strict';

  function detectOrderBlocks(bars, atr, direction) {
    if (!bars || bars.length < 3 || !(atr > 0)) return [];
    const obs = [];
    const lastIdx = bars.length - 1;

    for (let i = Math.max(1, lastIdx - 40); i < lastIdx; i++) {
      const prev = bars[i - 1];
      const curr = bars[i];
      const mag = Math.abs(curr.c - prev.c);
      if (mag >= 1.2 * atr) {
        if (prev.c < prev.o && curr.c > curr.o && (direction === 1 || !direction)) {
          obs.push({ index: i - 1, top: Math.max(prev.o, prev.c), bottom: Math.min(prev.o, prev.c), direction: 1, strength: 1 });
        } else if (prev.c > prev.o && curr.c < curr.o && (direction === -1 || !direction)) {
          obs.push({ index: i - 1, top: Math.max(prev.o, prev.c), bottom: Math.min(prev.o, prev.c), direction: -1, strength: 1 });
        }
      }
    }
    return obs;
  }

  function detectFVG(bars, atr, direction) {
    if (!bars || bars.length < 3 || !(atr > 0)) return [];
    const fvgs = [];
    const lastIdx = bars.length - 1;

    for (let i = Math.max(2, lastIdx - 30); i <= lastIdx; i++) {
      const c1 = bars[i - 2];
      const c3 = bars[i];
      if (c3.l > c1.h && (direction === 1 || !direction)) {
        fvgs.push({ index: i, top: c3.l, bottom: c1.h, direction: 1, strength: 1 });
      } else if (c3.h < c1.l && (direction === -1 || !direction)) {
        fvgs.push({ index: i, top: c1.l, bottom: c3.h, direction: -1, strength: 1 });
      }
    }
    return fvgs;
  }

  function findActiveZone(zones, price, direction) {
    if (!zones || !zones.length) return null;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (direction && z.direction !== direction) continue;
      if (price >= z.bottom && price <= z.top) return z;
    }
    return null;
  }

  return { detectOrderBlocks: detectOrderBlocks, detectFVG: detectFVG, findActiveZone: findActiveZone };
})();
