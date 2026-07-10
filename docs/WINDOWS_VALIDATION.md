# Windows Validation Record

Date: 2026-07-10

## Environment

- Host: Windows 10.0.26200, x64
- Node.js: v24.0.1
- npm: 11.16.0
- Sensor: CS9711, USB `0x2541:0x0236`
- Repository: `C:\Users\radit\OneDrive\Dokumen\Project\SAKTI-Merah-putih`
- Final tested commit: `ed7ef73 fix(capture): honor configured scan deadline`

## Results

- `npm run doctor`: `PROOF: PASS`; node-usb loaded, CS9711 enumerated, interface 0 claimed successfully; endpoints `0x81` and `0x1`.
- Baseline `npm run proof`: `PROOF: PASS`, 8024 bytes, `68x118`, std-dev `56.38`.
- After local fix, commit/push, and Windows fast-forward pull: `PROOF: PASS`, 8024 bytes, `68x118`, std-dev `65.98`.
- Elevated agent direct `/capture-tap`: `ok=true`, one frame captured, std-dev `79.97`, sharpness `13.1`.

No fingerprint image was committed. Capture artifacts remain under ignored `captures/`.

## Fix Verified

The capture callers previously passed `timeoutMs`, while `device.capture()` consumed `deadlineMs`. The implementation now uses `deadlineMs` and preserves `timeoutMs` as a compatibility alias. Agent unit tests passed (`8/8`).

## Windows Access Finding

The app enrollment error was caused by the running agent process, not SIGFM matching. A stale/non-elevated agent held port `7373` and could not open the USB device. After stopping it and running a fresh agent from an elevated terminal, direct capture succeeded.

Run one persistent agent only:

```powershell
# PowerShell / Windows Terminal: Run as Administrator
cd C:\Users\radit\OneDrive\Dokumen\Project\SAKTI-Merah-putih
npm run doctor
npm run agent
```

Keep that terminal open while the app is used. Do not start a second agent. `WbioSrvc` was stopped during the validation; if access fails again after reboot, check the service and stale Node processes before changing matcher thresholds.

## Docker Note

The native agent validation is independent of Docker. A remote SSH attempt to run `npm run app` reached Docker Desktop but failed before the Dockerfiles were built because Windows Docker used `credsStore=desktop` without an interactive logon session. Run Docker Desktop and `npm run app` from the logged-in Windows desktop session; this is a Docker credential/session issue, not an image or CS9711 protocol failure.

