'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { allowedOrigins, browserOriginAllowed, corsHeaders } = require('../src/cors');

test('only explicitly configured browser origins receive agent CORS access', () => {
  const allowed = allowedOrigins('https://sakti.example, https://other.example');
  assert.equal(browserOriginAllowed('https://sakti.example', allowed), true);
  assert.equal(browserOriginAllowed('https://attacker.example', allowed), false);
  assert.deepEqual(corsHeaders({ headers: { origin: 'https://attacker.example' } }, allowed), {});
  assert.equal(
    corsHeaders({ headers: { origin: 'https://sakti.example' } }, allowed)['Access-Control-Allow-Origin'],
    'https://sakti.example'
  );
});
