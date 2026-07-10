'use strict';

// Native localhost bridge. The Dockerized web app (and any browser) calls this
// over 127.0.0.1 — the USB/libusb work stays native on the host, never in Docker.

const http = require('http');
const os = require('os');
const device = require('./device');
const { remap, toPGM, frameStats, selectBestFrames } = require('./image');
const { allowedOrigins, browserOriginAllowed, corsHeaders } = require('./cors');

const PORT = Number(process.env.AGENT_PORT) || 7373;
const HOST = process.env.AGENT_HOST || '127.0.0.1';
const ALLOWED_BROWSER_ORIGINS = allowedOrigins();

// Burst quality thresholds — tune without a rebuild via env.
const BURST = {
  durationMs: Number(process.env.BURST_MS) || 5000,
  minStd: Number(process.env.MIN_STD) || 18,
  minSharp: Number(process.env.MIN_SHARP) || 10,
  maxFrames: Number(process.env.MAX_FRAMES) || 10,
};

function send(req, res, code, body) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
    ...corsHeaders(req, ALLOWED_BROWSER_ORIGINS),
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  // Normal local Docker calls have no Origin. Browser-local capture is allowed
  // only for an explicit Cloud Run/web origin, never wildcard CORS.
  if (req.headers.origin && !browserOriginAllowed(req.headers.origin, ALLOWED_BROWSER_ORIGINS)) {
    return send(req, res, 403, { ok: false, error: 'browser origin is not allowed for the local fingerprint agent' });
  }
  if (req.method === 'OPTIONS') return send(req, res, 204, {});

  if (req.method === 'GET' && req.url === '/health') {
    let devices = [];
    try {
      devices = device.listCandidates();
    } catch (_) {
      /* usb not ready */
    }
    return send(req, res, 200, {
      service: 'sakti-fingerprint-agent',
      platform: `${os.platform()}/${os.arch()}`,
      devicePresent: devices.length > 0,
      devices,
    });
  }

  if (req.method === 'POST' && req.url === '/capture') {
    try {
      const result = await device.capture({ timeoutMs: 20000 });
      const gray = remap(result.raw);
      const stats = frameStats(gray);
      return send(req, res, 200, {
        ok: true,
        initOk: result.initOk,
        width: 68,
        height: 118,
        stats,
        pgmBase64: toPGM(gray).toString('base64'),
      });
    } catch (e) {
      return send(req, res, 500, { ok: false, error: e.message });
    }
  }

  // Swipe/burst capture: collect frames while the finger presses/slides, then
  // keep only the SHARP, finger-present ones (drops motion-blurred fast-swipe
  // frames and empty frames). Firm flat press at a few positions = best result.
  if (req.method === 'POST' && req.url === '/capture-burst') {
    try {
      const { raws } = await device.captureBurst({ durationMs: BURST.durationMs, maxFrames: 40 });
      const grays = raws.map(remap);
      const best = selectBestFrames(grays, {
        minStd: BURST.minStd,
        minSharp: BURST.minSharp,
        maxFrames: BURST.maxFrames,
      });
      return send(req, res, 200, {
        ok: true,
        rawFrames: grays.length,
        captured: best.length,
        frames: best.map((b) => toPGM(b.g).toString('base64')),
        quality: best.map((b) => ({ std: b.std, sharp: +b.sharp.toFixed(1) })),
      });
    } catch (e) {
      return send(req, res, 500, { ok: false, error: e.message });
    }
  }

  // Single tap: a short burst, returns only the sharpest frame. For Touch-ID
  // style guided enrollment where the operator taps repeatedly.
  if (req.method === 'POST' && req.url === '/capture-tap') {
    try {
      const tapMs = Number(process.env.TAP_MS) || 2000;
      const { raws } = await device.captureBurst({ durationMs: tapMs, maxFrames: 20 });
      const grays = raws.map(remap);
      const best = selectBestFrames(grays, {
        minStd: BURST.minStd,
        minSharp: BURST.minSharp,
        maxFrames: 1,
      });
      return send(req, res, 200, {
        ok: true,
        rawFrames: grays.length,
        captured: best.length,
        frame: best.length ? toPGM(best[0].g).toString('base64') : null,
        quality: best.length ? { std: best[0].std, sharp: +best[0].sharp.toFixed(1) } : null,
      });
    } catch (e) {
      return send(req, res, 500, { ok: false, error: e.message });
    }
  }

  return send(req, res, 404, {
    error: 'not found',
    routes: ['GET /health', 'POST /capture', 'POST /capture-burst', 'POST /capture-tap'],
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[agent] SAKTI fingerprint agent listening on http://${HOST}:${PORT}`);
  console.log('[agent] routes: GET /health, POST /capture, POST /capture-burst');
  if (ALLOWED_BROWSER_ORIGINS.size) {
    console.log(`[agent] browser-local origins: ${[...ALLOWED_BROWSER_ORIGINS].join(', ')}`);
  }
});

// Crash resilience: a stray USB/JS error must log, not kill the agent.
process.on('uncaughtException', (err) => {
  console.error('[agent] uncaughtException (kept alive):', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('[agent] unhandledRejection (kept alive):', err && err.message);
});
