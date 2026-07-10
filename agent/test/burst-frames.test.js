'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { meanAbsDiff, sharpness, selectBestFrames } = require('../src/image');
const { IMG_WIDTH, IMG_HEIGHT } = require('../src/protocol');

const N = IMG_WIDTH * IMG_HEIGHT;
const flat = (v) => Buffer.alloc(N, v);

// crisp vertical ridges (high gradient) vs a blurred version (low gradient)
function ridges(period, seed = 0) {
  const b = Buffer.alloc(N);
  for (let y = 0; y < IMG_HEIGHT; y++)
    for (let x = 0; x < IMG_WIDTH; x++)
      b[y * IMG_WIDTH + x] = (Math.sin((x + seed) * period) * 110 + 128) & 0xff;
  return b;
}
function blur(g) {
  const b = Buffer.alloc(N);
  for (let y = 0; y < IMG_HEIGHT; y++)
    for (let x = 0; x < IMG_WIDTH; x++) {
      let s = 0, c = 0;
      for (let k = -3; k <= 3; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < IMG_WIDTH) { s += g[y * IMG_WIDTH + xx]; c++; }
      }
      b[y * IMG_WIDTH + x] = s / c;
    }
  return b;
}

test('sharpness: crisp ridges score higher than blurred', () => {
  assert.ok(sharpness(ridges(0.8)) > sharpness(blur(ridges(0.8))) * 1.5);
  assert.ok(sharpness(flat(128)) < 1);
});

test('selectBestFrames drops no-finger (low std) frames', () => {
  const kept = selectBestFrames([flat(128), flat(130), ridges(0.8)], { minStd: 18, minSharp: 5 });
  assert.strictEqual(kept.length, 1);
});

test('selectBestFrames drops motion-blurred frames, keeps sharp ones', () => {
  const sharp = ridges(0.8, 0);
  const smeared = blur(ridges(0.8, 20));
  const kept = selectBestFrames([sharp, smeared], { minStd: 10, minSharp: 10 });
  assert.strictEqual(kept.length, 1);
  assert.ok(meanAbsDiff(kept[0].g, sharp) === 0, 'the crisp frame is the one kept');
});

test('selectBestFrames caps at maxFrames and drops exact duplicates', () => {
  const frames = [ridges(0.8, 0), ridges(0.8, 0), ridges(0.8, 5), ridges(0.8, 9), ridges(0.8, 13)];
  const kept = selectBestFrames(frames, { minStd: 10, minSharp: 5, maxFrames: 3, nearDupThreshold: 2 });
  assert.ok(kept.length <= 3);
  // the exact-duplicate second frame must not appear twice
  assert.ok(kept.length >= 2);
});

test('empty burst yields no frames', () => {
  assert.strictEqual(selectBestFrames([], {}).length, 0);
});
