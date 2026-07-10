'use strict';

// One guided capture step for testing slight finger movement without the web app.
const action = process.argv[2];
if (!['enroll', 'verify'].includes(action)) {
  console.error('usage: MEMBER_ID=... node scripts/agent-motion-step.js <enroll|verify>');
  process.exit(2);
}

const agentUrl = process.env.AGENT_URL || 'http://127.0.0.1:7373';
const matcherUrl = process.env.MATCHER_URL || 'http://127.0.0.1:8090';
const memberId = process.env.MEMBER_ID;
if (!memberId) {
  console.error('MEMBER_ID is required');
  process.exit(2);
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.error || `${response.status} ${response.statusText}`);
  return result;
}

async function main() {
  const capture = await post(`${agentUrl}/capture-tap`, {});
  if (!capture.frame) throw new Error('no usable fingerprint frame');
  const quality = capture.quality || {};
  const body = action === 'enroll'
    ? { memberId, images: [capture.frame] }
    : { memberId, image: capture.frame };
  const result = await post(`${matcherUrl}/${action === 'enroll' ? 'enroll' : 'verify'}`, body);
  console.log(JSON.stringify({
    action,
    memberId,
    quality: { rawFrames: capture.rawFrames, std: quality.std, sharp: quality.sharp },
    templatesTotal: result.templatesTotal,
    score: result.score,
    threshold: result.threshold,
    matched: result.matched,
  }));
}

main().catch((error) => {
  console.error(`[motion-step] failed: ${error.message}`);
  process.exitCode = 1;
});
