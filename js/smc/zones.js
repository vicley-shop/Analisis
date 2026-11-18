window.AT = window.AT || {};
window.AT.smc = window.AT.smc || {};

window.AT.smc.zones = (function () {
  'use strict';

  const DEFAULT_OB_ATR_MULT = 1.8;
  const DEFAULT_OB_MAX_ZONES = 3;
  const DEFAULT_OB_MAX_AGE_BARS = 150;
  const DEFAULT_FVG_MIN_ATR_MULT = 0.30;
  const DEFAULT_FVG_MAX_AGE = 60;
  const DEFAULT_FVG_MAX_ZONES = 3;
  const OB_STRENGTH_CEILING_ATR = 5;
  const FVG_STRENGTH_CEILING_ATR = 3;

  function cfg() {
    return (window.AT_CONFIG && window.AT_CONFIG.smc) || {};
  }

  function obMult() {
    return cfg().obAtrMult != null ? cfg().obAtrMult : DEFAULT_OB_ATR_MULT;
  }

  function obMaxZones() {
    return cfg().obMaxZones != null ? cfg().obMaxZones : DEFAULT_OB_MAX_ZONES;
  }

  function obMaxAgeBars() {
    return cfg().obMaxAgeBars != null ? cfg().obMaxAgeBars : DEFAULT_OB_MAX_AGE_BARS;
  }

  function obCloseOnly() {
    return cfg().obMitigationCloseOnly !== false;
  }

  function fvgMinMult() {
    return cfg().fvgMinAtrMult != null ? cfg().fvgMinAtrMult : DEFAULT_FVG_MIN_ATR_MULT;
  }

  function fvgMaxAge() {
    return cfg().fvgMaxAge != null ? cfg().fvgMaxAge : DEFAULT_FVG_MAX_AGE;
  }

  function fvgMaxZones() {
    return cfg().fvgMaxZones != null ? cfg().fvgMaxZones : DEFAULT_FVG_MAX_ZONES;
  }

  function fvgCloseOnly() {
    return cfg().fvgMitigationCloseOnly !== false;
  }

  function resolveAtrArray(bars, atr) {
    const n = bars.length;
    if (atr == null) return null;
    if (typeof atr === 'number') {
      if (!Number.isFinite(atr) || atr <= 0) return null;
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = atr;
      return out;
    }
    if (!Array.isArray(atr) || !atr.length) return null;
    if (atr.length === n) return atr;
    const offset = n - atr.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = i >= offset ? atr[i - offset] : null;
    }
    return out;
  }

  function atrAt(atrArr, i) {
    if (!atrArr) return 0;
    const v = atrArr[i];
    return v != null && Number.isFinite(v) && v > 0 ? v : 0;
  }

  function applyBar(zone, bar, i, closeOnly) {
    if (zone.mitigated) return;
    if (zone.direction === 1) {
      if (bar.l < zone.top && bar.h > zone.bottom) zone.touched = true;
      const threshold = closeOnly ? bar.c : bar.l;
      if (threshold < zone.bottom) {
        zone.mitigated = true;
        zone.mitigationBar = i;
      }
    } else {
      if (bar.h > zone.bottom && bar.l < zone.top) zone.touched = true;
      const threshold = closeOnly ? bar.c : bar.h;
      if (threshold > zone.top) {
        zone.mitigated = true;
        zone.mitigationBar = i;
      }
    }
  }

  function makeZone(index, top, bottom, direction, type, atr, strength, age) {
    return {
      index: index,
      top: top,
      bottom: bottom,
      direction: direction,
      type: type,
      createdAtr: atr,
      strength: strength,
      ageBars: age,
      touched: false,
      mitigated: false,
      mitigationBar: null,
      createdAtIndex: -1
    };
  }

  function finalizeZones(activeZones, direction, maxZones) {
    const filtered = [];
    for (let i = 0; i < activeZones.length; i++) {
      const z = activeZones[i];
      if (z.mitigated) continue;
      if (direction === 1 || direction === -1) {
        if (z.direction !== direction) continue;
      }
      filtered.push(z);
    }

    filtered.sort(function (a, b) {
      if (b.index !== a.index) return b.index - a.index;
      return b.strength - a.strength;
    });

    const sliced = filtered.slice(0, maxZones);
    for (let i = 0; i < sliced.length; i++) {
      delete sliced[i].createdAtIndex;
    }
    return sliced;
  }

  function runZonesFSM(bars, atrArr, opts) {
    const n = bars ? bars.length : 0;
    if (n < 3) return { obs: [], fvgs: [] };

    const wantOB = opts.wantOB !== false;
    const wantFVG = opts.wantFVG !== false;
    const obMultVal = opts.obAtrMult != null ? opts.obAtrMult : obMult();
    const obMaxAge = opts.obMaxAge != null ? opts.obMaxAge : obMaxAgeBars();
    const fvgMinMultVal = opts.fvgMinAtrMult != null ? opts.fvgMinAtrMult : fvgMinMult();
    const fvgMaxAgeVal = opts.fvgMaxAge != null ? opts.fvgMaxAge : fvgMaxAge();
    const wantBothDir = opts.direction !== 1 && opts.direction !== -1;
    const wantBull = wantBothDir || opts.direction === 1;
    const wantBear = wantBothDir || opts.direction === -1;
    const lastIdx = n - 1;
    const obClose = obCloseOnly();
    const fvgClose = fvgCloseOnly();

    const activeOB = [];
    const activeFVG = [];

    for (let i = 0; i < n; i++) {
      if (wantOB && i >= 1) {
        const candle = bars[i - 1];
        const next = bars[i];
        const a = atrAt(atrArr, i - 1);
        if (a > 0) {
          const age = lastIdx - (i - 1);
          if (age <= obMaxAge) {
            const magnitude = Math.abs(next.c - candle.c);
            if (magnitude >= obMultVal * a) {
              const strength = Math.min(1, magnitude / (OB_STRENGTH_CEILING_ATR * a));
              const top = Math.max(candle.o, candle.c);
              const bottom = Math.min(candle.o, candle.c);

              if (wantBull && candle.c < candle.o && next.c > next.o) {
                const z = makeZone(i - 1, top, bottom, 1, 'Bullish_OB', a, strength, age);
                z.createdAtIndex = i;
                activeOB.push(z);
              }
              if (wantBear && candle.c > candle.o && next.c < next.o) {
                const z = makeZone(i - 1, top, bottom, -1, 'Bearish_OB', a, strength, age);
                z.createdAtIndex = i;
                activeOB.push(z);
              }
            }
          }
        }
      }

      if (wantFVG && i >= 2) {
        const c1 = bars[i - 2];
        const c3 = bars[i];
        const a = atrAt(atrArr, i);
        if (a > 0) {
          const age = lastIdx - i;
          if (age <= fvgMaxAgeVal) {
            if (wantBull && c3.l > c1.h) {
              const gap = c3.l - c1.h;
              if (gap >= fvgMinMultVal * a) {
                const strength = Math.min(1, gap / (FVG_STRENGTH_CEILING_ATR * a));
                const z = makeZone(i, c3.l, c1.h, 1, 'Bullish_FVG', a, strength, age);
                z.createdAtIndex = i;
                activeFVG.push(z);
              }
            }
            if (wantBear && c3.h < c1.l) {
              const gap = c1.l - c3.h;
              if (gap >= fvgMinMultVal * a) {
                const strength = Math.min(1, gap / (FVG_STRENGTH_CEILING_ATR * a));
                const z = makeZone(i, c1.l, c3.h, -1, 'Bearish_FVG', a, strength, age);
                z.createdAtIndex = i;
                activeFVG.push(z);
              }
            }
          }
        }
      }

      const bar = bars[i];

      for (let k = 0; k < activeOB.length; k++) {
        const z = activeOB[k];
        if (z.createdAtIndex < i) applyBar(z, bar, i, obClose);
      }
      for (let k = 0; k < activeFVG.length; k++) {
        const z = activeFVG[k];
        if (z.createdAtIndex < i) applyBar(z, bar, i, fvgClose);
      }
    }

    return { obs: activeOB, fvgs: activeFVG };
  }

  function detectOrderBlocks(bars, atr, direction, opts) {
    opts = opts || {};
    if (!bars || bars.length < 3) return [];
    const atrArr = resolveAtrArray(bars, atr);
    if (!atrArr) return [];

    const result = runZonesFSM(bars, atrArr, {
      direction: direction,
      obAtrMult: opts.obAtrMult,
      obMaxAge: opts.maxAge,
      wantOB: true,
      wantFVG: false
    });

    const max = opts.maxZones != null ? opts.maxZones : obMaxZones();
    return finalizeZones(result.obs, direction, max);
  }

  function detectFVG(bars, atr, direction, opts) {
    opts = opts || {};
    if (!bars || bars.length < 3) return [];
    const atrArr = resolveAtrArray(bars, atr);
    if (!atrArr) return [];

    const result = runZonesFSM(bars, atrArr, {
      direction: direction,
      fvgMinAtrMult: opts.fvgMinAtrMult,
      fvgMaxAge: opts.maxAge,
      wantOB: false,
      wantFVG: true
    });

    const max = opts.maxZones != null ? opts.maxZones : fvgMaxZones();
    return finalizeZones(result.fvgs, direction, max);
  }

  function findActiveZone(zones, price, direction) {
    if (!zones || !zones.length) return null;
    const filterDir = direction === 1 || direction === -1;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (filterDir && z.direction !== direction) continue;
      if (price >= z.bottom && price <= z.top) return z;
    }
    return null;
  }

  return {
    detectOrderBlocks: detectOrderBlocks,
    detectFVG: detectFVG,
    findActiveZone: findActiveZone
  };
})();