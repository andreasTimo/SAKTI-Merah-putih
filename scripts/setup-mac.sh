#!/usr/bin/env bash
set -euo pipefail

echo "[mac] Fingerprint setup for CS9711 (ChipSailing 0x2541)"
echo "[mac] node-usb ships a prebuilt libusb, so no driver install is required."

if command -v brew >/dev/null 2>&1; then
  if brew list libusb >/dev/null 2>&1; then
    echo "[mac] Homebrew libusb present (optional, fine)."
  else
    echo "[mac] Optional: 'brew install libusb' if you build node-usb from source."
  fi
else
  echo "[mac] Homebrew not found — not needed; node-usb bundles libusb."
fi

echo "[mac] macOS does not claim vendor-specific USB interfaces, so CS9711 is"
echo "[mac] directly claimable by libusb. No Zadig/kext needed."
echo "[mac] OK. Verify with: npm run doctor"
