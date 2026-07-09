'use strict';

// SAKTI web app (runs in Docker). It does NOT touch USB — it calls the native
// host agent over http. From inside Docker the host is host.docker.internal.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const AGENT_URL = process.env.AGENT_URL || 'http://host.docker.internal:7373';

const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

async function proxy(pathname, method) {
  const res = await fetch(`${AGENT_URL}${pathname}`, { method });
  const body = await res.text();
  return { status: res.status, body };
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(INDEX);
  }
  if (req.url === '/api/health') {
    try {
      const r = await proxy('/health', 'GET');
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      return res.end(r.body);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'agent unreachable', detail: e.message, AGENT_URL }));
    }
  }
  if (req.url === '/api/capture' && req.method === 'POST') {
    try {
      const r = await proxy('/capture', 'POST');
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      return res.end(r.body);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'agent unreachable', detail: e.message }));
    }
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`[app] SAKTI web app on http://localhost:${PORT}  (agent: ${AGENT_URL})`);
});
