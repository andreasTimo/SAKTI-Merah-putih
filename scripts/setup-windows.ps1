# Fingerprint setup for CS9711 (ChipSailing 0x2541:0x0236) on Windows.
# CS9711 ships NO signed vendor driver, so libusb needs WinUSB bound to the device.
# LIBUSB_ERROR_ACCESS at capture time == this binding has not been done yet.

Write-Host "[win] Fingerprint setup for CS9711 (ChipSailing 0x2541)"

$dev = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match "VID_2541" } | Select-Object -First 1

if (-not $dev) {
  Write-Host "[win] No VID_2541 device present. Plug the CS9711 in, then re-run: npm run setup"
  return
}

Write-Host ("[win] Device : {0}" -f $dev.FriendlyName)
Write-Host ("[win] Id     : {0}" -f $dev.InstanceId)
Write-Host ("[win] Status : {0}" -f $dev.Status)

# Which kernel driver/service currently owns the device?
$svc = (Get-PnpDeviceProperty -InstanceId $dev.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue).Data
Write-Host ("[win] Driver : {0}" -f ($(if ($svc) { $svc } else { '(none)' })))

if ($svc -match 'WinUSB|libusb|libusbK') {
  Write-Host "[win] OK: device is bound to a libusb-compatible driver. Run: npm run doctor"
} else {
  Write-Host ""
  Write-Host "[win] ACTION NEEDED: bind the device to WinUSB (one time):"
  Write-Host "        1) Download Zadig:  https://zadig.akeo.ie"
  Write-Host "        2) Options > List All Devices"
  Write-Host "        3) Select 'CS9711Fingerprint' (USB ID 2541 0236)"
  Write-Host "        4) Pick 'WinUSB' in the target box, click 'Replace Driver'"
  Write-Host "        5) Re-run:  npm run doctor"
  Write-Host ""
  Write-Host "[win] If it still says ACCESS after binding, the Windows Biometric"
  Write-Host "[win] Service may be holding it. In an elevated PowerShell:"
  Write-Host "        Stop-Service WbioSrvc; Set-Service WbioSrvc -StartupType Disabled"
  Write-Host "[win] (Re-enable later with: Set-Service WbioSrvc -StartupType Manual)"
  Write-Host ""
  Write-Host "[win] Unattended alternative: script WinUSB with libwdi 'wdi-simple.exe'."
}
