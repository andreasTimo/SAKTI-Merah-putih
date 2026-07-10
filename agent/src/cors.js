'use strict';

function allowedOrigins(value = process.env.AGENT_ALLOWED_ORIGINS || '') {
  return new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean));
}

function browserOriginAllowed(origin, allowed = allowedOrigins()) {
  return Boolean(origin) && allowed.has(origin);
}

function corsHeaders(req, allowed = allowedOrigins()) {
  const origin = req.headers.origin;
  if (!browserOriginAllowed(origin, allowed)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin, Access-Control-Request-Private-Network',
  };
}

module.exports = { allowedOrigins, browserOriginAllowed, corsHeaders };
