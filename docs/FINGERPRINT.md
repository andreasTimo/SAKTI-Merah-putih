# CS9711 Fingerprint — Referensi Teknis

Sensor: **ChipSailing CS9711**, USB `VID 0x2541` / `PID 0x0236` (varian dongle),
juga muncul sebagai `0x9711` (GPD Win Max 2). USB Full-Speed 12 Mb/s.
Tipe **Match-on-Host** — tanpa secure element; semua logika di host.

> Tidak ada SDK vendor yang dibutuhkan. Protokol berikut hasil reverse-engineering
> komunitas dan sudah kita implementasikan ulang di `agent/src/`.

## Protokol USB

Semua perintah **8 byte**:

```
byte:  0    1     2  3  4  5   6     7
       EA  <cmd>  00 00 00 00  <cmd>  EA
```

| Perintah | cmd |
|----------|-----|
| INIT     | 1   |
| RESET    | 2   |
| SCAN     | 4   |

- **INIT** → balasan status `EA 01 62 A0 00 00 C3 EA` (mismatch = warning, non-fatal).
- **SCAN** → antrikan bulk IN di endpoint `0x81` **sebelum** kirim SCAN, lalu baca
  gambar dalam 2 transfer (8000 + 24 = **8024 byte**).

## Gambar

- Sensor fisik **34 kolom × 236 baris** = 8024 byte mentah.
- Remap interleaved → **68 × 118** grayscale (`row = y/2`, `col = x*2 + y%2`).
- Disimpan sebagai **PGM (P5)** agar bisa dibuka di viewer mana pun.

Implementasi: [`agent/src/protocol.js`](../agent/src/protocol.js),
[`agent/src/image.js`](../agent/src/image.js),
[`agent/src/device.js`](../agent/src/device.js).

## Matriks lintas-OS

| OS | Driver | Cara klaim device | Catatan |
|----|--------|-------------------|---------|
| **macOS** | tidak perlu | libusb klaim langsung | Plug & play; tidak merebut interface vendor-specific. |
| **Windows** | **WinUSB** (Zadig/libwdi) | setelah binding, libusb klaim | CS9711 tanpa driver bawaan → wajib bind sekali. |
| **Linux** | udev rule | libusb + `uaccess` | `99-sakti-cs9711.rules`. |

Kenapa **bukan Docker** untuk capture: Docker Desktop di Win/macOS menjalankan VM
Linux; USB passthrough tak didukung. Maka agent harus native; hanya `app/` yang
di-Docker.

> **libusb itu lintas-platform**, bukan Mac-only. Paket `usb` (node-usb) mengemas
> binary libusb prebuilt untuk Windows x64/arm64, macOS, dan Linux — **kode agent
> & dependency-nya sama** di semua OS. Yang berbeda hanya izin akses driver.

### Troubleshooting

| Error | Arti | Solusi |
|-------|------|--------|
| `LIBUSB_ERROR_ACCESS` (Windows) | device belum di-bind WinUSB, atau dipegang Windows Biometric Service / app lain | `npm run setup` → Zadig bind WinUSB; bila perlu `Stop-Service WbioSrvc` |
| `LIBUSB_ERROR_ACCESS` (Linux) | izin udev kurang | pasang udev rule (`npm run setup`), cabut-colok |
| `LIBUSB_TRANSFER_TIMED_OUT` | tak ada jari saat polling (normal) | tempel jari saat `npm run proof` |
| `not found (VID 0x2541)` | device tak terdeteksi / lepas dari bus | cek kabel/port, cabut-colok |

## Matching — Task 2 (`matcher/`, SourceAFIS 1:1)

Service Java SourceAFIS 3.18.1, storage **in-memory** (ephemeral). Endpoint
`POST /enroll` (multi-template), `POST /verify` (1:1), `GET /health`.

### DPI calibration (PENTING)

SourceAFIS memakai DPI untuk menormalkan frekuensi ridge. Frame CS9711 kecil
(68×118), jadi **DPI harus rendah** supaya SourceAFIS meng-upscale ke 500 DPI
internalnya dan menemukan minutiae. Hasil uji pada satu capture asli:

| SENSOR_DPI | self-match score |
|---|---|
| 500 (default awal — salah) | **0** (nol minutiae) |
| 200 | 41.9 |
| 180 | 69.5 |
| **150 (default sekarang)** | **711.6** |
| 120 | 1178 |

Default = **150** (`SENSOR_DPI` env). DPI terlalu rendah berisiko memunculkan
minutiae dari noise → naikkan FAR. Nilai final **wajib dikalibrasi di hardware**
dengan pasangan same-finger/different-press dan different-finger.

> Verifikasi yang sudah dilakukan (satu capture asli): print sama → match
> (711.6 ≥ 40) ✓, gambar kosong → tolak (0) ✓, restart → cache kosong ✓.
> Akurasi same-finger/different-press BELUM diuji (butuh device + banyak capture).

Citra parsial → utamakan verifikasi **1:1** setelah identitas dari e-KTP/kartu,
dan gunakan **multi-template** (enroll beberapa "slide") untuk menaikkan akurasi.

## Sumber

- https://github.com/archeYR/libfprint-CS9711
- https://github.com/rickcarufel/cs9711-fingerprint-reader
- https://deepwiki.com/archeYR/libfprint-CS9711/4.4-cs9711-driver
- https://botmonster.com/self-hosting/usb_fingerprint/
