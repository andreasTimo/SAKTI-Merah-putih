'use strict';

// Live evidence-gathering for Windows LIBUSB_ERROR_ACCESS, so we diagnose the
// real cause (biometric service, elevation, stale handle) instead of guessing.
// Only meaningful on win32; callers should gate on process.platform.

const { execFileSync } = require('child_process');

function ps(script) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch (e) {
    return null;
  }
}

function wbioStatus() {
  return ps('(Get-Service WbioSrvc -ErrorAction SilentlyContinue).Status');
}

function isElevated() {
  const out = ps(
    '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()' +
      ').IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)'
  );
  return out === 'True';
}

// Other node processes that could be holding a stale device handle
// (e.g. a crashed/orphaned `npm run agent` from a previous session).
function otherNodeProcesses() {
  const out = ps(
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
      'Select-Object -ExpandProperty ProcessId | Where-Object { $_ -ne ' +
      process.pid +
      ' }'
  );
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function diagnose() {
  if (process.platform !== 'win32') return null;
  return {
    wbioStatus: wbioStatus(),
    elevated: isElevated(),
    otherNodePids: otherNodeProcesses(),
  };
}

module.exports = { diagnose };
