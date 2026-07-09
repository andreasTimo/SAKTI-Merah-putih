# Fingerprint setup for CS9711 (ChipSailing 0x2541:0x0236) on Windows.
# CS9711 ships NO signed vendor driver, so libusb needs WinUSB bound to the device.

Write-Host "[win] Fingerprint setup for CS9711 (ChipSailing 0x2541)"

$dev = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match "VID_2541" }

if ($dev) {
  Write-Host ("[win] Device detected: {0}" -f $dev.FriendlyName)
  Write-Host ("[win] InstanceId    : {0}" -f $dev.InstanceId)
  Write-Host ("[win] Driver status : {0}" -f $dev.Status)
  Write-Host ""
  Write-Host "[win] libusb requires WinUSB bound to this device. One-time binding:"
  Write-Host "        1) Download Zadig:  https://zadig.akeo.ie"
  Write-Host "        2) Options > List All Devices"
  Write-Host "        3) Select 'CS9711Fingerprint' (USB ID 2541 0236)"
  Write-Host "        4) Pick 'WinUSB' in the target box, click 'Replace Driver'"
  Write-Host "        5) Re-run:  npm run doctor"
  Write-Host ""
  Write-Host "[win] (For unattended installs, script this with libwdi's 'wdi-simple.exe'.)"
} else {
  Write-Host "[win] No VID_2541 device present."
  Write-Host "[win] Plug the CS9711 in, then re-run:  npm run setup"
}
