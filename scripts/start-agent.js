'use strict';

// Keep `npm run agent` portable, but fail before the HTTP bridge starts when
// node-usb was installed for another OS/Node ABI. This is common when a repo or
// node_modules directory is copied from macOS to Windows.

const { spawn, execFileSync } = require('child_process');
const path = require('path');

function message(text) {
  console.error(`[agent-start] ${text}`);
}

function powerShell(script) {
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch (_) {
    return null;
  }
}

function windowsPreflight() {
  const isAdmin = powerShell(
    '([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).' +
    'IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)'
  );
  const wbio = powerShell('(Get-Service WbioSrvc -ErrorAction SilentlyContinue).Status');

  message(`Windows preflight: Node ${process.version} (${process.arch}).`);
  if (isAdmin === 'False') message('Shell tidak elevated. Bila claim USB gagal, buka PowerShell sebagai Administrator.');
  if (wbio === 'Running') message('WbioSrvc sedang berjalan; bila muncul LIBUSB_ERROR_ACCESS, hentikan service itu sementara lalu jalankan npm run doctor.');
  message('Pastikan CS9711 sudah dibind ke WinUSB dengan npm run setup / Zadig, lalu validasi dengan npm run doctor.');
}

function main() {
  try {
    require('usb');
  } catch (error) {
    message(`node-usb tidak dapat dimuat: ${error.message}`);
    message('Di Windows jalankan npm ci atau npm install PADA mesin Windows ini; jangan salin node_modules dari macOS/Linux.');
    message('Gunakan Node.js LTS x64/arm64 yang sesuai, lalu jalankan npm run setup dan npm run doctor.');
    process.exitCode = 1;
    return;
  }

  if (process.platform === 'win32') windowsPreflight();

  const child = spawn(process.execPath, [path.join(__dirname, '..', 'agent', 'src', 'server.js')], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (error) => {
    message(`gagal memulai agent: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code || 0;
  });
}

main();
