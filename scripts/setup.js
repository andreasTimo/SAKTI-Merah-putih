'use strict';

// Cross-platform post-install dispatcher. Runs the correct native setup for the
// fingerprint requirement so that a plain `npm install` gets you a working host.

const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const quiet = process.argv.includes('--quiet');
const plat = os.platform();

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  return r.status === 0;
}

console.log(`\nSAKTI setup — platform ${plat}/${os.arch()}`);

if (plat === 'win32') {
  run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'setup-windows.ps1')]);
} else if (plat === 'darwin') {
  run('bash', [path.join(__dirname, 'setup-mac.sh')]);
} else {
  run('bash', [path.join(__dirname, 'setup-linux.sh')]);
}

if (!quiet) {
  console.log('\nNext steps:');
  console.log('  1) npm run doctor   # verify device is detected & claimable on this OS');
  console.log('  2) npm run proof    # hold finger on sensor -> writes captures/*.pgm');
  console.log('  3) npm run agent    # start localhost bridge (http://127.0.0.1:7373)');
} else {
  console.log('Run "npm run doctor" to verify the fingerprint device on this OS.');
}
