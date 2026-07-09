#!/usr/bin/env node
'use strict';

// SAKTI Fingerprint Doctor — cross-platform proof harness for the CS9711.
// Usage:
//   node src/doctor.js            # diagnostics only (no scan)
//   node src/doctor.js --capture  # full proof: scan a finger + write a PGM image

const os = require('os');
const fs = require('fs');
const path = require('path');

const C = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m' };
const section = (t) => console.log(`\n${C.bold}${t}${C.reset}`);
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const warn = (m) => console.log(`  ${C.yellow}!${C.reset} ${m}`);
const fail = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`);

const CAPTURE_DIR = path.join(__dirname, '..', '..', 'captures');

function platformHint() {
  section('How to fix');
  if (os.platform() === 'win32') {
    warn('Windows: CS9711 ships no signed driver, so libusb needs WinUSB bound to it.');
    console.log(`  ${C.dim}Run: npm run setup   (guides Zadig/WinUSB binding), then re-run.${C.reset}`);
  } else if (os.platform() === 'darwin') {
    warn('macOS: the device should be claimable directly — check the cable/port and USB tree.');
    console.log(`  ${C.dim}Confirm it appears in System Report ▸ USB as "CS9711Fingerprint".${C.reset}`);
  } else {
    warn('Linux: add a udev rule granting access to VID 2541, then replug.');
  }
}

function writeReport(report, code) {
  try {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CAPTURE_DIR, 'proof-report.json'), JSON.stringify(report, null, 2));
  } catch (_) {
    /* ignore */
  }
  section(report.pass ? `${C.green}PROOF: PASS${C.reset}` : `${C.red}PROOF: INCOMPLETE${C.reset}`);
  console.log(`  ${C.dim}report: captures/proof-report.json${C.reset}`);
  process.exit(code);
}

async function main() {
  const doCapture = process.argv.includes('--capture');
  const report = {
    ts: new Date().toISOString(),
    platform: `${os.platform()}/${os.arch()}`,
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    checks: {},
    pass: false,
  };

  section('SAKTI Fingerprint Doctor — CS9711 (ChipSailing 0x2541)');
  console.log(`  OS   : ${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`);
  console.log(`  Node : ${process.version}`);
  console.log(`  Mode : ${doCapture ? 'proof (scan)' : 'diagnostics'}`);

  // 1. libusb binding loads
  section('1. libusb binding');
  let dev;
  try {
    dev = require('./device');
    require('usb');
    ok('node-usb / libusb loaded for this platform');
    report.checks.libusb = true;
  } catch (e) {
    fail(`cannot load usb module: ${e.message}`);
    report.checks.libusb = false;
    return writeReport(report, 1);
  }

  // 2. Enumeration
  section('2. Device enumeration');
  const candidates = dev.listCandidates();
  if (candidates.length === 0) {
    fail('No ChipSailing (VID 0x2541) device on the USB bus.');
    report.checks.enumerated = false;
    platformHint();
    return writeReport(report, 2);
  }
  candidates.forEach((c) => ok(`found ${c.label}`));
  report.checks.enumerated = true;
  report.devices = candidates;

  // 3. Claim (open + claim interface) — the real cross-OS proof
  section('3. Device claim (open + claim interface 0)');
  try {
    const info = await dev.probe();
    ok(`claimed ${info.productId}; endpoints: ${info.endpoints.map((e) => e.address).join(', ')}`);
    report.checks.claimed = true;
    report.probe = info;
  } catch (e) {
    fail(`claim failed: ${e.message}`);
    report.checks.claimed = false;
    platformHint();
    return writeReport(report, 3);
  }

  // 4. Optional end-to-end capture
  if (!doCapture) {
    report.pass = true;
    section('Diagnostics complete');
    console.log(`  ${C.dim}Run "npm run proof" and hold a finger on the sensor for a full capture.${C.reset}`);
    return writeReport(report, 0);
  }

  section('4. Capture (place finger on sensor…)');
  try {
    const { remap, toPGM, frameStats } = require('./image');
    const res = await dev.capture({ timeoutMs: 20000 });
    const gray = remap(res.raw);
    const stats = frameStats(gray);
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    const pgmPath = path.join(CAPTURE_DIR, `capture-${Date.now()}.pgm`);
    fs.writeFileSync(pgmPath, toPGM(gray));
    ok(`INIT status ${res.initOk ? 'matched' : 'MISMATCH (non-fatal)'}`);
    ok(`read ${res.bytes} bytes -> 68x118 image, std-dev ${stats.std}`);
    if (stats.std < 5) warn('very flat frame — likely no finger contact; try again pressing firmly.');
    ok(`saved ${path.relative(process.cwd(), pgmPath)}`);
    report.checks.captured = true;
    report.capture = { ...stats, initOk: res.initOk, file: path.basename(pgmPath) };
    report.pass = true;
    return writeReport(report, 0);
  } catch (e) {
    fail(`capture failed: ${e.message}`);
    report.checks.captured = false;
    return writeReport(report, 4);
  }
}

main().catch((e) => {
  fail(`unexpected: ${e.stack || e.message}`);
  process.exit(10);
});
