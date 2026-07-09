#!/usr/bin/env bash
set -euo pipefail

RULE="/etc/udev/rules.d/99-sakti-cs9711.rules"
echo "[linux] Fingerprint setup for CS9711 (ChipSailing 0x2541)"

if [ ! -f "$RULE" ]; then
  echo "[linux] To grant non-root access, install a udev rule (needs sudo):"
  echo "        echo 'SUBSYSTEM==\"usb\", ATTR{idVendor}==\"2541\", MODE=\"0660\", TAG+=\"uaccess\"' | sudo tee $RULE"
  echo "        sudo udevadm control --reload-rules && sudo udevadm trigger"
else
  echo "[linux] udev rule already present: $RULE"
fi
echo "[linux] OK. Verify with: npm run doctor"
