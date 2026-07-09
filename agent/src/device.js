'use strict';

const usb = require('usb');
const P = require('./protocol');

function hex(n) {
  return '0x' + n.toString(16).padStart(4, '0');
}

// Any ChipSailing device currently on the bus (for diagnostics).
function listCandidates() {
  return usb
    .getDeviceList()
    .filter((d) => d.deviceDescriptor.idVendor === P.VENDOR_ID)
    .map((d) => ({
      vendorId: d.deviceDescriptor.idVendor,
      productId: d.deviceDescriptor.idProduct,
      label: `${hex(d.deviceDescriptor.idVendor)}:${hex(d.deviceDescriptor.idProduct)}`,
    }));
}

// Match a known CS9711 product id.
function findDevice() {
  for (const pid of P.PRODUCT_IDS) {
    const dev = usb.findByIds(P.VENDOR_ID, pid);
    if (dev) return { dev, pid };
  }
  return null;
}

function transferOut(endpoint, data) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(data, (err) => (err ? reject(err) : resolve()));
  });
}

function transferIn(endpoint, length) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(length, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function withInterface(fn) {
  const found = findDevice();
  if (!found) {
    throw new Error('CS9711 not found (VID 0x2541). Plug it in and bind the driver (WinUSB on Windows).');
  }
  const { dev, pid } = found;
  dev.open();
  let iface;
  try {
    iface = dev.interface(0);
    if (typeof iface.isKernelDriverActive === 'function' && iface.isKernelDriverActive()) {
      try {
        iface.detachKernelDriver();
      } catch (_) {
        /* not fatal on Windows/macOS */
      }
    }
    iface.claim();
    return fn({ dev, pid, iface });
  } finally {
    try {
      if (iface) iface.release(true, () => {});
    } catch (_) {
      /* ignore */
    }
    try {
      dev.close();
    } catch (_) {
      /* ignore */
    }
  }
}

// Open + claim + inspect endpoints WITHOUT scanning.
// This alone proves the host OS driver stack can talk to the device.
function probe() {
  return withInterface(({ pid, iface }) => {
    const endpoints = iface.endpoints.map((e) => ({
      address: '0x' + e.address.toString(16),
      direction: e.direction,
      type: e.transferType,
    }));
    return { productId: hex(pid), endpoints };
  });
}

// Full capture: INIT -> SCAN -> read one image frame.
async function capture({ timeoutMs = 15000 } = {}) {
  return await Promise.resolve(
    withInterface(async ({ pid, iface }) => {
      const outEp = iface.endpoints.find((e) => e.direction === 'out');
      const inEp =
        iface.endpoints.find((e) => e.address === P.IN_ENDPOINT) ||
        iface.endpoints.find((e) => e.direction === 'in');
      if (!outEp || !inEp) throw new Error('Expected bulk IN/OUT endpoints not found on interface 0');
      inEp.timeout = timeoutMs;
      outEp.timeout = timeoutMs;

      // INIT and verify status
      await transferOut(outEp, P.buildCommand(P.CMD.INIT));
      const status = await transferIn(inEp, 64).catch(() => null);
      const initOk = status
        ? P.INIT_STATUS.equals(status.subarray(0, P.INIT_STATUS.length))
        : false;

      // Queue the IN read BEFORE SCAN so streaming starts immediately.
      const p1 = transferIn(inEp, P.RECV_CHUNK);
      await transferOut(outEp, P.buildCommand(P.CMD.SCAN));
      const part1 = await p1;
      const part2 = await transferIn(inEp, P.RECV_CHUNK).catch(() => Buffer.alloc(0));

      let raw = Buffer.concat([part1, part2]);
      if (raw.length < P.IMAGE_BYTES) {
        raw = Buffer.concat([raw, Buffer.alloc(P.IMAGE_BYTES - raw.length)]);
      }
      raw = raw.subarray(0, P.IMAGE_BYTES);
      return { raw, initOk, productId: hex(pid), bytes: raw.length };
    })
  );
}

module.exports = { listCandidates, findDevice, probe, capture, hex };
