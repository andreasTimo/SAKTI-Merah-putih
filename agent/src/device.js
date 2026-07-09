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

function releaseInterface(iface) {
  return new Promise((resolve) => {
    if (!iface) return resolve();
    try {
      iface.release(true, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

function setConfiguration(dev, cfg) {
  return new Promise((resolve) => {
    try {
      if (dev.configDescriptor && dev.configDescriptor.bConfigurationValue === cfg) return resolve();
      dev.setConfiguration(cfg, () => resolve());
    } catch (_) {
      resolve();
    }
  });
}

const debug = (...a) => {
  if (process.env.AGENT_DEBUG) console.error('[capture]', ...a);
};
// libusb reports "LIBUSB_TRANSFER_TIMED_OUT"; also match plain "timeout".
const isTimeout = (e) => /tim(e|ed).?out/i.test(e && e.message);

// Turn raw libusb errors into actionable, platform-aware messages.
// NOTE: on Windows this fires even when Device Manager already shows the
// driver as WinUSB — a bound driver does not guarantee an exclusive handle is
// available, so the message must not assert "not bound" as the cause.
function enrichUsbError(e) {
  const msg = (e && e.message) || String(e);
  if (/ACCESS/i.test(msg)) {
    if (process.platform === 'win32') {
      return new Error(
        'LIBUSB_ERROR_ACCESS: device tidak bisa dibuka meski driver mungkin sudah WinUSB. ' +
          'Penyebab paling umum: (1) Windows Biometric Service (WbioSrvc) memegang device, ' +
          '(2) proses lain (termasuk agent lama yang masih jalan) masih membuka handle-nya, ' +
          '(3) shell tidak dijalankan sebagai Administrator. Jalankan "npm run doctor" — ' +
          'ia akan mengecek status WbioSrvc dan elevasi secara otomatis.'
      );
    }
    if (process.platform === 'linux') {
      return new Error(
        'LIBUSB_ERROR_ACCESS: izin udev belum ada. Jalankan "npm run setup" untuk memasang ' +
          'udev rule, lalu cabut-colok perangkat.'
      );
    }
    return new Error('LIBUSB_ERROR_ACCESS: perangkat sedang dipakai proses lain. Tutup app lain lalu coba lagi.');
  }
  if (/BUSY/i.test(msg)) {
    return new Error(msg + ' — perangkat diklaim proses lain; tutup app lain atau cabut-colok.');
  }
  return e;
}

// Only one device session at a time. Overlapping open()/claim() on the same
// physical device throws LIBUSB_ERROR_BUSY and can crash the native layer.
let busy = false;

// Acquire the device, run an async body, then ALWAYS release + close — but only
// AFTER the body has fully settled. This is the core fix: `await fn()` inside the
// try, so `finally` never tears down the device mid-transfer.
async function withInterface(fn) {
  if (busy) throw new Error('device busy: another fingerprint operation is in progress');
  const found = findDevice();
  if (!found) {
    throw new Error('CS9711 not found (VID 0x2541). Plug it in and bind the driver (WinUSB on Windows).');
  }
  busy = true;
  const { dev, pid } = found;
  let iface;
  try {
    try {
      dev.open();
      await setConfiguration(dev, 1); // reference driver sets config before claim
      iface = dev.interface(0);
      if (typeof iface.isKernelDriverActive === 'function' && iface.isKernelDriverActive()) {
        try {
          iface.detachKernelDriver();
        } catch (_) {
          /* not fatal on Windows/macOS */
        }
      }
      iface.claim();
    } catch (e) {
      throw enrichUsbError(e); // e.g. LIBUSB_ERROR_ACCESS on unbound WinUSB
    }
    return await fn({ dev, pid, iface });
  } finally {
    await releaseInterface(iface);
    try {
      dev.close();
    } catch (_) {
      /* ignore */
    }
    busy = false;
  }
}

// Open + claim + inspect endpoints WITHOUT scanning.
// This alone proves the host OS driver stack can talk to the device.
async function probe() {
  return withInterface(async ({ pid, iface }) => {
    const endpoints = iface.endpoints.map((e) => ({
      address: '0x' + e.address.toString(16),
      direction: e.direction,
      type: e.transferType,
    }));
    return { productId: hex(pid), endpoints };
  });
}

// Full capture, matching the reference driver: short-poll reads (300ms) until a
// finger frame arrives (10s deadline), then RESET so the sensor goes idle.
async function capture({ deadlineMs = P.SCAN_DEADLINE_MS } = {}) {
  return withInterface(async ({ pid, iface }) => {
    const outEp = iface.endpoints.find((e) => e.direction === 'out');
    const inEp =
      iface.endpoints.find((e) => e.address === P.IN_ENDPOINT) ||
      iface.endpoints.find((e) => e.direction === 'in');
    if (!outEp || !inEp) throw new Error('Expected bulk IN/OUT endpoints not found on interface 0');
    inEp.timeout = P.READ_TIMEOUT_MS;
    outEp.timeout = P.READ_TIMEOUT_MS;

    // INIT and verify status (non-fatal on mismatch/timeout).
    await transferOut(outEp, P.buildCommand(P.CMD.INIT)).catch(() => {});
    const status = await transferIn(inEp, 8).catch(() => null);
    const initOk = status ? P.INIT_STATUS.equals(status.subarray(0, P.INIT_STATUS.length)) : false;
    debug('INIT status', status ? status.toString('hex') : 'none', 'ok=', initOk);

    // SCAN poll: resend SCAN and try a short read until a frame arrives.
    const start = Date.now();
    let part1 = null;
    let attempts = 0;
    while (Date.now() - start < deadlineMs) {
      attempts++;
      await transferOut(outEp, P.buildCommand(P.CMD.SCAN)).catch(() => {});
      try {
        const d = await transferIn(inEp, P.RECV_CHUNK);
        if (d && d.length > 0) {
          part1 = d;
          break;
        }
      } catch (e) {
        if (!isTimeout(e)) {
          debug('read error', e.message);
          throw e;
        }
        debug('poll timeout', attempts);
      }
    }
    if (!part1) {
      throw new Error(`no frame within ${deadlineMs}ms (no finger on sensor?)`);
    }

    const part2 = await transferIn(inEp, P.RECV_TAIL).catch(() => Buffer.alloc(0));
    await transferOut(outEp, P.buildCommand(P.CMD.RESET)).catch(() => {});
    debug('got frame', part1.length, '+', part2.length, 'in', attempts, 'attempts');

    let raw = Buffer.concat([part1, part2]);
    if (raw.length < P.IMAGE_BYTES) {
      raw = Buffer.concat([raw, Buffer.alloc(P.IMAGE_BYTES - raw.length)]);
    }
    raw = raw.subarray(0, P.IMAGE_BYTES);
    return { raw, initOk, productId: hex(pid), bytes: raw.length, attempts };
  });
}

module.exports = { listCandidates, findDevice, withInterface, probe, capture, hex };
