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
function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

// Sharpness = mean absolute gradient (|dx| + |dy|). A crisp fingerprint has high
// ridge-edge energy; a motion-blurred (fast-swipe) frame has low energy. On a
// real CS9711 capture: good frame ~17, motion-blurred ~6.6.
function sharpness(gray, w = IMG_WIDTH, h = IMG_HEIGHT) {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (x > 0) { sum += Math.abs(gray[idx] - gray[idx - 1]); count++; }
      if (y > 0) { sum += Math.abs(gray[idx] - gray[idx - w]); count++; }
    }
  }
  return count ? sum / count : 0;
}

// Pick the best frames from a burst. Per the device guidebook, the correct
// technique is a firm, flat press (don't smear), repeated at a few positions —
// so we want SHARP, finger-present frames, not merely "moved" ones:
//   - std >= minStd     : a finger is actually on the sensor
//   - sharpness >= minSharp : not motion-blurred
//   - then keep the sharpest, dropping only near-identical duplicates
//     (meanAbsDiff < nearDupThreshold), up to maxFrames.
// Returns [{ g, std, sharp }] sorted best-first.
function selectBestFrames(grays, opts = {}) {
  const { minStd = 18, minSharp = 10, maxFrames = 10, nearDupThreshold = 2 } = opts;
  const scored = [];
  for (const g of grays) {
    const std = frameStats(g).std;
    if (std < minStd) continue;
    const sharp = sharpness(g);
    if (sharp < minSharp) continue;
    scored.push({ g, std, sharp });
  }
  scored.sort((a, b) => b.sharp - a.sharp);
  const kept = [];
  for (const s of scored) {
    if (kept.length >= maxFrames) break;
    if (kept.some((k) => meanAbsDiff(k.g, s.g) < nearDupThreshold)) continue;
    kept.push(s);
  }
  return kept;
}

module.exports = { remap, toPGM, frameStats, meanAbsDiff, sharpness, selectBestFrames };
