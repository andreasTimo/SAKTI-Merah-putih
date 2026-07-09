'use strict';

// Native localhost bridge. The Dockerized web app (and any browser) calls this
// over 127.0.0.1 — the USB/libusb work stays native on the host, never in Docker.

const http = require('http');
const os = require('os');
const device = require('./device');
const { remap, toPGM, frameStats } = require('./image');

const PORT = Number(process.env.AGENT_PORT) || 7373;
const HOST = process.env.AGENT_HOST || '127.0.0.1';

function send(res, code, body) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (req.method === 'GET' && req.url === '/health') {
    let devices = [];
    try {
      devices = device.listCandidates();
    } catch (_) {
      /* usb not ready */
    }
    return send(res, 200, {
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
      return send(res, 200, {
        ok: true,
        initOk: result.initOk,
        width: 68,
        height: 118,
        stats,
        pgmBase64: toPGM(gray).toString('base64'),
      });
    } catch (e) {
      return send(res, 500, { ok: false, error: e.message });
    }
  }

  return send(res, 404, { error: 'not found', routes: ['GET /health', 'POST /capture'] });
});

server.listen(PORT, HOST, () => {
  console.log(`[agent] SAKTI fingerprint agent listening on http://${HOST}:${PORT}`);
  console.log('[agent] routes: GET /health, POST /capture');
});
