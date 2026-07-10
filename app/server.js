'use strict';

// SAKTI web app (Docker). Orchestrates the "card/Member-ID -> 1:1 fingerprint"
// flow. It does NOT touch USB — capture goes to the native agent, matching to
// the matcher service. A BIO_MODE=mock lets the whole flow run with no sensor.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const AGENT_URL = process.env.AGENT_URL || 'http://host.docker.internal:7373';
const MATCHER_URL = process.env.MATCHER_URL || 'http://matcher:8090';
const BIO_MODE = process.env.BIO_MODE === 'real' ? 'real' : 'mock';
const TARGET_AREAS = Number(process.env.TARGET_AREAS) || 8;

const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

// In-memory member registry (ephemeral, testing). memberId -> record.
const members = new Map();

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};
async function parse(req) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch {
    return null;
  }
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
    json(res, 502, { error: 'upstream unreachable', detail: e.message, url });
  }
}

const server = http.createServer(async (req, res) => {
  const { url, method } = req;

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(INDEX);
  }

  // ---- config & health ----
  if (url === '/api/config') return json(res, 200, { bioMode: BIO_MODE, target: TARGET_AREAS });
  if (url === '/api/health') return forward(res, `${AGENT_URL}/health`, 'GET');
  if (url === '/api/matcher-health') return forward(res, `${MATCHER_URL}/health`, 'GET');

  // ---- member registry ----
  if (url === '/api/members' && method === 'GET') {
    return json(res, 200, { members: [...members.values()] });
  }
  if (url === '/api/members' && method === 'POST') {
    const b = await parse(req);
    if (!b || !b.memberId || !b.name) return json(res, 400, { error: 'memberId & name wajib' });
    if (members.has(b.memberId)) return json(res, 409, { error: `Member-ID sudah ada: ${b.memberId}` });
    const rec = {
      memberId: String(b.memberId).trim(),
      name: String(b.name).trim(),
      nik: b.nik ? String(b.nik).trim() : null,
      enrolled: false,
      createdAt: new Date().toISOString(),
    };
    members.set(rec.memberId, rec);
    return json(res, 200, { ok: true, member: rec, qr: rec.memberId });
  }
  const mMember = url.match(/^\/api\/members\/([^/]+)$/);
  if (mMember && method === 'GET') {
    const rec = members.get(decodeURIComponent(mMember[1]));
    return rec ? json(res, 200, { member: rec }) : json(res, 404, { error: 'member tidak ditemukan' });
  }

  // ---- capture bridge (native agent) ----
  if (url === '/api/capture-tap' && method === 'POST') return forward(res, `${AGENT_URL}/capture-tap`, 'POST');
  if (url === '/api/capture-burst' && method === 'POST') return forward(res, `${AGENT_URL}/capture-burst`, 'POST');

  // ---- biometric enroll/verify (real -> matcher, mock -> simulated) ----
  if (url === '/api/enroll-tap' && method === 'POST') {
    const raw = await readBody(req);
    return forward(res, `${MATCHER_URL}/enroll-tap`, 'POST', raw);
  }
  if (url === '/api/verify' && method === 'POST') {
    const raw = await readBody(req);
    return forward(res, `${MATCHER_URL}/verify`, 'POST', raw);
  }

  // Mock backend: finish the flow with no sensor. mark enrolled / simulate a match.
  if (url === '/api/mock/enroll' && method === 'POST') {
    const b = await parse(req);
    const rec = b && members.get(b.memberId);
    if (!rec) return json(res, 404, { error: 'member tidak ditemukan' });
    rec.enrolled = true;
    return json(res, 200, { ok: true, memberId: rec.memberId, templatesTotal: TARGET_AREAS, coverageComplete: true, mock: true });
  }
  if (url === '/api/mock/verify' && method === 'POST') {
    const b = await parse(req);
    const rec = b && members.get(b.memberId);
    if (!rec) return json(res, 404, { error: 'member tidak ditemukan' });
    if (!rec.enrolled) return json(res, 400, { error: 'member belum enroll' });
    const matched = !(b.simulateWrong === true); // toggle to demo the reject path
    return json(res, 200, { ok: true, memberId: rec.memberId, matched, score: matched ? 512 : 3, threshold: 40, mock: true });
  }

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[app] SAKTI web app on http://localhost:${PORT}  (BIO_MODE=${BIO_MODE})`);
  console.log(`[app]   agent   : ${AGENT_URL}`);
  console.log(`[app]   matcher : ${MATCHER_URL}`);
});
