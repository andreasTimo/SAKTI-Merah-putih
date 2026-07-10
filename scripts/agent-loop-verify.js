'use strict';

// Direct CS9711 calibration harness: native agent -> matcher, with no web app.
// It logs only quality/match metadata. The captured image remains in process
// memory long enough to build the matcher template and is never written to disk.

const AGENT_URL = process.env.AGENT_URL || 'http://127.0.0.1:7373';
const MATCHER_URL = process.env.MATCHER_URL || 'http://127.0.0.1:8090';
const MEMBER_ID = process.env.MEMBER_ID || `agent-loop-${Date.now()}`;
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 0; // 0 = keep running

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

async function capture(label) {
  for (;;) {
    const result = await request(`${AGENT_URL}/capture-tap`, { method: 'POST' });
    if (result.frame) {
      const quality = result.quality || {};
      console.log(`[${label}] frame accepted (raw=${result.rawFrames}, std=${quality.std}, sharp=${quality.sharp})`);
      return result.frame;
    }
    console.log(`[${label}] no usable frame yet; keep the same finger flat on the sensor.`);
  }
}

async function main() {
  console.log(`[loop] memberId=${MEMBER_ID}`);
  console.log('[loop] Keep one finger flat and still on the CS9711. Press Ctrl+C to stop.');

  const enrollmentFrame = await capture('enroll');
  const enrollment = await request(`${MATCHER_URL}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: MEMBER_ID, images: [enrollmentFrame] }),
  });
  console.log(`[loop] template stored (${enrollment.templatesTotal} template). Starting direct verification...`);

  for (let attempt = 1; !MAX_ATTEMPTS || attempt <= MAX_ATTEMPTS; attempt++) {
    const frame = await capture(`verify ${attempt}`);
    const verification = await request(`${MATCHER_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: MEMBER_ID, image: frame }),
    });
    console.log(`[verify ${attempt}] score=${verification.score.toFixed(2)} threshold=${verification.threshold}`);
    if (verification.matched) {
      console.log(`[loop] MATCH after ${attempt} verification capture(s).`);
      return;
    }
  }
  throw new Error(`no match after ${MAX_ATTEMPTS} attempt(s)`);
}

main().catch((error) => {
  console.error(`[loop] failed: ${error.message}`);
  process.exitCode = 1;
});
