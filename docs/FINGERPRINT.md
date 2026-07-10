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

`npm run agent` menjalankan preflight Windows sebelum server agent dimulai. Bila
`node-usb` tidak dapat dimuat, install dependency ulang pada Windows (`npm ci`)
dan jangan salin `node_modules` dari OS lain. Untuk deployment Cloud Run, lihat
[`CLOUD_RUN.md`](CLOUD_RUN.md): Cloud Run tidak dapat mengakses USB sensor.

## Matching — SIGFM 1:1

CS9711 mengirim citra partial `68×118`. Pengujian menunjukkan SourceAFIS tidak
stabil pada pergeseran jari kecil, sehingga service Docker sekarang memakai
**SIGFM** (pendekatan `libfprint-CS9711`): OpenCV SIFT keypoint/descriptor,
ratio test 0.75, dan pemeriksaan konsistensi geometri. Ini bukan neural network.

- Enrollment: **15 tahap** (`TARGET_AREAS=15`), sesuai konfigurasi driver CS9711.
- Verifikasi: bandingkan probe terhadap setiap descriptor enrollment dan pakai
  skor geometri tertinggi; default `MATCH_THRESHOLD=40`.
- Persistence: descriptor/keypoint diserialisasi sebagai SQLite **BLOB** pada
  volume Docker `matcher-data`; frame PGM tidak disimpan.
- Format BLOB: `sigfm-sift` v1, bukan ISO/IEC 19794-2. Jangan memberi label ISO
  sebelum memakai extractor yang benar-benar dapat mengekspor minutiae ISO.

Endpoint matcher: `POST /enroll`, `POST /enroll-tap`, `POST /verify`,
`GET /health`, dan `GET /diagnostics/member?memberId=...`.

> Matcher ini untuk pengujian interoperabilitas CS9711. Evaluasi FAR/FRR dengan
> beberapa orang dan gunakan enkripsi template sebelum dipakai pada produksi.

### Teknik capture (dari guidebook device)

Sensor = **area kapasitif kecil**, kapasitas **10 template**, FAR <0.001% / FRR <0.1%.
Guidebook: *tekan rata & mantap, pusatkan inti sidik jari, **jangan digeser cepat**,
ulangi beberapa kali di posisi berbeda.*

Burst capture (`/capture-burst`) memilih frame berkualitas, bukan frame "bergerak":
- **std ≥ `MIN_STD`** (default 18) → jari benar-benar menempel
- **sharpness ≥ `MIN_SHARP`** (default 10) → bukan motion-blur (swipe cepat).
  Kalibrasi: frame bagus ~17, blur ~6.6 (mean abs gradient |dx|+|dy|).
- ambil sampai **`MAX_FRAMES`** (default 10) frame paling tajam, buang duplikat.

Knob env di agent (tanpa rebuild): `BURST_MS`, `MIN_STD`, `MIN_SHARP`, `MAX_FRAMES`.
Gejala lama: swipe pelan → 1 frame (dulu difilter by-gerakan); swipe cepat → banyak
frame tapi blur → 0 minutiae. Sekarang dipilih by-ketajaman, bukan by-gerakan.

## Sumber

- https://github.com/archeYR/libfprint-CS9711
- https://github.com/rickcarufel/cs9711-fingerprint-reader
- https://deepwiki.com/archeYR/libfprint-CS9711/4.4-cs9711-driver
- https://botmonster.com/self-hosting/usb_fingerprint/
