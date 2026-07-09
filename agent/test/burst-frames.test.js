'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { meanAbsDiff, selectDistinctFrames } = require('../src/image');

// helpers to fabricate grayscale frames
const flat = (v, n = 100) => Buffer.alloc(n, v);
function ridges(seed, n = 100) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (Math.sin(i * 0.5 + seed) * 90 + 128) & 0xff;
  return b;
}

test('meanAbsDiff is 0 for identical frames and grows with difference', () => {
  const a = ridges(0);
  assert.strictEqual(meanAbsDiff(a, a), 0);
  assert.ok(meanAbsDiff(ridges(0), ridges(3)) > 5);
});

test('selectDistinctFrames drops low-contrast (no-finger) frames', () => {
  const frames = [flat(128), flat(130), ridges(0)];
  const kept = selectDistinctFrames(frames, { minStd: 12, diffThreshold: 1 });
  assert.strictEqual(kept.length, 1, 'only the ridge frame survives the std filter');
});

test('selectDistinctFrames dedups near-identical consecutive frames', () => {
  const a = ridges(0);
  const aSame = Buffer.from(a); // finger did not move
  const b = ridges(4); // finger moved
  const kept = selectDistinctFrames([a, aSame, b], { minStd: 5, diffThreshold: 8 });
  assert.strictEqual(kept.length, 2, 'identical middle frame is dropped, moved frame kept');
});

test('empty burst yields no frames', () => {
  assert.strictEqual(selectDistinctFrames([], {}).length, 0);
});
