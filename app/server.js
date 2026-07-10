'use strict';

// SAKTI web app (runs in Docker). It does NOT touch USB — it calls the native
// host agent over http for capture, and the matcher service for enroll/verify.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const AGENT_URL = process.env.AGENT_URL || 'http://host.docker.internal:7373';
const MATCHER_URL = process.env.MATCHER_URL || 'http://matcher:8090';

const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

async function forward(res, url, method, body) {
  try {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
    });
    const text = await r.text();
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(text);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'upstream unreachable', detail: e.message, url }));
  }
}

const server = http.createServer(async (req, res) => {
  const { url, method } = req;

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(INDEX);
  }
  // Capture bridge (native agent on the host)
  if (url === '/api/health') return forward(res, `${AGENT_URL}/health`, 'GET');
  if (url === '/api/capture' && method === 'POST') return forward(res, `${AGENT_URL}/capture`, 'POST');
  if (url === '/api/capture-burst' && method === 'POST') return forward(res, `${AGENT_URL}/capture-burst`, 'POST');
  if (url === '/api/capture-tap' && method === 'POST') return forward(res, `${AGENT_URL}/capture-tap`, 'POST');

  // Matching service
  if (url === '/api/matcher-health') return forward(res, `${MATCHER_URL}/health`, 'GET');
  if (url === '/api/enroll' && method === 'POST') return forward(res, `${MATCHER_URL}/enroll`, 'POST', await readBody(req));
  if (url === '/api/enroll-tap' && method === 'POST') return forward(res, `${MATCHER_URL}/enroll-tap`, 'POST', await readBody(req));
  if (url === '/api/verify' && method === 'POST') return forward(res, `${MATCHER_URL}/verify`, 'POST', await readBody(req));

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`[app] SAKTI web app on http://localhost:${PORT}`);
  console.log(`[app]   agent   : ${AGENT_URL}`);
  console.log(`[app]   matcher : ${MATCHER_URL}`);
});
