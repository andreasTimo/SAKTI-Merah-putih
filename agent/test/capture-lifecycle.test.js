'use strict';

// Regression test: the device must NOT be released/closed until the async
// capture body (INIT/SCAN/reads) has fully completed. The original bug closed
// the device synchronously in a `finally` while transfers were still in flight,
// crashing the agent and hanging the HTTP request.

const test = require('node:test');
const assert = require('node:assert');

// Mock the `usb` module BEFORE requiring device.js (device.js keeps a reference
// to the same module object, so mutating its methods here takes effect).
const usb = require('usb');

function makeMockDevice(order) {
  const outEp = {
    direction: 'out',
    address: 0x02,
    transfer(_buf, cb) {
      order.push('transfer');
      setImmediate(() => cb(null));
    },
  };
  const inEp = {
    direction: 'in',
    address: 0x81,
    transfer(len, cb) {
      order.push('transfer');
      setImmediate(() => cb(null, Buffer.alloc(len)));
    },
  };
  const iface = {
    endpoints: [outEp, inEp],
    isKernelDriverActive: () => false,
    claim() {
      order.push('claim');
    },
    release(_close, cb) {
      order.push('release');
      if (cb) setImmediate(() => cb(null));
    },
  };
  return {
    deviceDescriptor: { idVendor: 0x2541, idProduct: 0x0236 },
    open() {
      order.push('open');
    },
    interface() {
      return iface;
    },
    close() {
      order.push('close');
    },
  };
}

test('capture releases/closes the device only AFTER all transfers complete', async () => {
  const order = [];
  const mock = makeMockDevice(order);
  usb.findByIds = () => mock;

  const device = require('../src/device');
  const res = await device.capture({ deadlineMs: 1000 });

  // Correct lifecycle: open/claim → every transfer → release → close.
  const firstRelease = order.indexOf('release');
  const lastTransfer = order.lastIndexOf('transfer');
  assert.ok(lastTransfer !== -1, 'transfers ran');
  assert.ok(
    firstRelease > lastTransfer,
    `device released before transfers finished: ${order.join(' → ')}`
  );
  assert.strictEqual(order.indexOf('close'), order.length - 1, 'close is last');
  assert.strictEqual(res.bytes, 8024, 'returns a full 8024-byte frame');
});

test('two captures cannot run concurrently (device busy lock)', async () => {
  const order = [];
  const mock = makeMockDevice(order);
  usb.findByIds = () => mock;

  const device = require('../src/device');
  const results = await Promise.allSettled([
    device.capture({ deadlineMs: 1000 }),
    device.capture({ deadlineMs: 1000 }),
  ]);
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.strictEqual(rejected.length, 1, 'exactly one capture is rejected as busy');
  assert.match(rejected[0].reason.message, /busy/i);
});
