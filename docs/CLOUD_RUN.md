# Cloud Run Deployment Boundary

## What Can Run in Cloud Run

Cloud Run can host the SAKTI web/API and matcher containers. It **cannot** read
the CS9711 USB sensor: Cloud Run containers are isolated from host devices and
cannot manipulate or access arbitrary hardware resources. The native agent must
remain on the Windows operator PC.

The deployed flow is therefore:

```text
Windows PC: CS9711 -> native SAKTI agent (127.0.0.1:7373)
                              ^
                              | browser-local HTTPS/loopback capture call
                              v
Cloud Run: web/API -> matcher -> durable production database
```

The frame is captured only by the local agent, then sent by the browser over
HTTPS to the Cloud Run API for enrollment/verification. The matcher must not
persist raw PGM frames.

## Browser-Local Capture Configuration

Set these Cloud Run environment variables on the web/API service:

```text
BIO_MODE=real
TARGET_AREAS=15
CAPTURE_TRANSPORT=browser-local
LOCAL_AGENT_URL=http://127.0.0.1:7373
```

On every authorized Windows operator PC, configure the agent with the exact
HTTPS origin of that Cloud Run service, then run `npm run agent`:

```powershell
$env:AGENT_ALLOWED_ORIGINS = 'https://YOUR_SERVICE-REGION.a.run.app'
npm run setup
npm run doctor
npm run agent
```

The agent remains bound to `127.0.0.1`. It rejects browser origins that are not
explicitly listed and answers the browser Private Network Access preflight. Do
not expose port `7373` to a LAN or the public internet.

Some managed browsers can block public-site-to-loopback access through enterprise
Private Network Access policy. Test Chrome/Edge on the operator image early. If
policy blocks it, use a signed desktop companion/relay that creates an outbound
authenticated connection to the backend; do not make the local agent publicly
reachable.

## Production Gaps Before Deployment

This repository is not yet production-persistent on Cloud Run:

- The member registry in `app/server.js` is in memory and disappears whenever a
  Cloud Run instance is replaced.
- The SIGFM matcher currently uses SQLite. Cloud Run's container filesystem is
  ephemeral, so its SQLite database must be replaced with a managed durable
  store, such as Cloud SQL PostgreSQL, before production.
- Store template BLOBs with envelope encryption/KMS, authorization/audit logs,
  consent and retention/deletion handling. Raw frames must remain transient.
- Cloud Run instances are stateless and can scale horizontally. Any future
  WebSocket relay requires external shared state and reconnect handling.

Until those gaps are addressed, Cloud Run is appropriate only for a stateless UI
demo. It is not appropriate for persistent biometric enrollment data.

## Windows Agent Troubleshooting

Run these commands on the Windows PC itself, from a clean checkout:

```powershell
npm ci
npm run setup
npm run doctor
npm run agent
```

Never copy `node_modules` from macOS/Linux into Windows. `npm run agent` now
fails early with an actionable message if the native `node-usb` binding cannot
load. A detected CS9711 must be bound to **WinUSB** (via the guided Zadig step).
If `npm run doctor` reports `LIBUSB_ERROR_ACCESS`, close other agents, inspect
`WbioSrvc`, and retry in an elevated PowerShell.

## Sources

- [Cloud Run container runtime contract](https://cloud.google.com/run/docs/container-contract)
- [Cloud Run WebSockets guidance](https://cloud.google.com/run/docs/triggering/websockets)
