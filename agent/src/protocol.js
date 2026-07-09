'use strict';

// CS9711 (ChipSailing) USB fingerprint protocol.
// Reverse-engineered — NO vendor SDK required.
// Refs: archeYR/libfprint-CS9711, rickcarufel/cs9711-fingerprint-reader
//       deepwiki.com/archeYR/libfprint-CS9711/4.4-cs9711-driver

const VENDOR_ID = 0x2541; // ChipSailing Electronics
const PRODUCT_IDS = [0x0236, 0x9711]; // USB dongle / GPD Win Max 2 variant

// Command opcodes
const CMD = { INIT: 1, RESET: 2, SCAN: 4 };

const FRAME_BYTE = 0xea; // start & end marker

// 8-byte command frame: EA <cmd> 00 00 00 00 <cmd> EA
function buildCommand(cmd) {
  return Buffer.from([FRAME_BYTE, cmd, 0, 0, 0, 0, cmd, FRAME_BYTE]);
}

// Expected status reply after INIT
const INIT_STATUS = Buffer.from([0xea, 0x01, 0x62, 0xa0, 0x00, 0x00, 0xc3, 0xea]);

const IN_ENDPOINT = 0x81; // bulk IN
const CMD_LEN = 8;

// One frame = 34*236 sensor bytes == 68*118 logical image == 8024 bytes
const IMAGE_BYTES = 8024;
const RECV_CHUNK = 8000; // first bulk IN transfer
const RECV_TAIL = 24; // second bulk IN transfer (8000 + 24 = 8024)

// Reference driver polls with a short per-read timeout until a finger arrives.
const READ_TIMEOUT_MS = 300;
const SCAN_DEADLINE_MS = 10000;

// Sensor geometry -> logical grayscale image
const SENSOR_COLS = 34;
const SENSOR_ROWS = 236;
const IMG_WIDTH = 68;
const IMG_HEIGHT = 118;

module.exports = {
  VENDOR_ID,
  PRODUCT_IDS,
  CMD,
  FRAME_BYTE,
  buildCommand,
  INIT_STATUS,
  IN_ENDPOINT,
  CMD_LEN,
  IMAGE_BYTES,
  RECV_CHUNK,
  RECV_TAIL,
  READ_TIMEOUT_MS,
  SCAN_DEADLINE_MS,
  SENSOR_COLS,
  SENSOR_ROWS,
  IMG_WIDTH,
  IMG_HEIGHT,
};
