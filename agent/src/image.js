'use strict';

const { SENSOR_COLS, SENSOR_ROWS, IMG_WIDTH, IMG_HEIGHT } = require('./protocol');

// Interleaved remap: sensor pixel (x,y) -> output (row = y/2, col = x*2 + y%2).
// Two consecutive sensor rows are interleaved side-by-side into one output row.
function remap(raw) {
  const out = Buffer.alloc(IMG_WIDTH * IMG_HEIGHT);
  for (let y = 0; y < SENSOR_ROWS; y++) {
    for (let x = 0; x < SENSOR_COLS; x++) {
      const src = y * SENSOR_COLS + x;
      const row = y >> 1;
      const col = x * 2 + (y & 1);
      out[row * IMG_WIDTH + col] = raw[src] || 0;
    }
  }
  return out;
}

// Encode an 8-bit grayscale buffer as a binary PGM (P5) — viewable in any image tool.
function toPGM(gray) {
  const header = Buffer.from(`P5\n${IMG_WIDTH} ${IMG_HEIGHT}\n255\n`, 'ascii');
  return Buffer.concat([header, gray]);
}

// Cheap quality signal: a flat frame (low std-dev) means no finger / bad contact.
function frameStats(gray) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  let varSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / gray.length);
  return { mean: +mean.toFixed(2), std: +std.toFixed(2), pixels: gray.length };
}

// Mean absolute pixel difference between two same-size grayscale frames.
// Used to tell whether the finger actually moved between two burst frames.
function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

// From a burst of raw grayscale frames, keep only the ones that (a) have real
// ridge content (std >= minStd, i.e. a finger is present) and (b) differ enough
// from the last kept frame (meanAbsDiff >= diffThreshold, i.e. the finger moved).
// This turns a continuous swipe into a set of distinct, non-redundant views.
function selectDistinctFrames(grays, { minStd = 12, diffThreshold = 6 } = {}) {
  const kept = [];
  let last = null;
  for (const g of grays) {
    if (frameStats(g).std < minStd) continue;
    if (last && meanAbsDiff(g, last) < diffThreshold) continue;
    kept.push(g);
    last = g;
  }
  return kept;
}

module.exports = { remap, toPGM, frameStats, meanAbsDiff, selectDistinctFrames };
