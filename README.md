# SAKTI Merah Putih

**Sistem Anggota Koperasi Terintegrasi Identitas Merah Putih** — digitalisasi
registrasi anggota koperasi berbasis **e-KTP (NFC)** + **biometrik sidik jari**.

Repo ini berisi **Task 1: setup fingerprint** untuk sensor **CS9711 (ChipSailing,
USB `0x2541:0x0236`)** yang jalan di **Windows dan macOS** tanpa SDK vendor.

## Arsitektur (kenapa bukan "semua di Docker")

```
┌───────────────────────────────┐
│  agent/  — NATIVE (libusb)     │  wajib native di PC petugas.
│  capture CS9711 → gambar 68×118│  Docker TIDAK bisa passthrough USB
│  http://127.0.0.1:7373         │  di Windows/macOS.
└───────────────┬───────────────┘
                │ localhost HTTP
┌───────────────┴───────────────┐
│  app/  — DOCKER                │  web UI + API. Identik Win/macOS.
│  http://localhost:8080         │  panggil agent via host.docker.internal
└────────────────────────────────┘
```

Sensor CS9711 bertipe **Match-on-Host**: alat hanya mengirim gambar mentah; init,
capture, dan (nanti) matching dilakukan software di host. Protokol USB-nya sudah
di-reverse-engineer komunitas — lihat [`docs/FINGERPRINT.md`](docs/FINGERPRINT.md).

## Prasyarat

- Node.js ≥ 18 (agent teruji di Node 26)
- Docker Desktop (untuk `app/`)
- Sensor CS9711 terhubung ke port USB PC petugas

## Setup — "seperti npm install"

```bash
npm install        # install requirement fingerprint + jalankan setup per-OS otomatis
```

`npm install` akan:
1. memasang dependency native (`usb` / libusb, prebuilt untuk Win & macOS), lalu
2. menjalankan `scripts/setup.js` yang memilih setup sesuai OS:
   - **macOS** → tanpa driver tambahan (libusb bisa klaim langsung).
   - **Windows** → memandu binding **WinUSB** (Zadig), karena CS9711 tak punya driver bawaan.

## Task 1 — Proof device works (Windows & macOS)

```bash
npm run doctor     # diagnostik: load libusb → enumerate → open+claim interface
npm run proof      # + capture: tempelkan jari → tulis captures/*.pgm + proof-report.json
```

`npm run doctor` lulus (`PROOF: PASS`) bila OS berhasil **membuka & meng-claim**
device — inilah bukti lintas-OS. `npm run proof` menambah bukti end-to-end berupa
gambar sidik jari nyata (68×118 grayscale, bisa dibuka di viewer apa pun).

Lihat kriteria PASS lengkap di [`TASKS.md`](TASKS.md).

## Menjalankan aplikasi (Docker)

```bash
npm run agent      # Terminal 1: bridge native di host (biarkan jalan)
npm run app        # Terminal 2: docker compose up --build  → http://localhost:8080
```

Buka `http://localhost:8080`, status agent tampil, klik **Rekam Sidik Jari**.

## Struktur

| Path | Isi |
|------|-----|
| `agent/` | Bridge fingerprint native (Node + libusb). Capture + doctor + server. |
| `app/` | Web app SAKTI (Docker). Tidak menyentuh USB; proxy ke agent. |
| `scripts/` | Setup per-OS (`setup-mac.sh`, `setup-windows.ps1`, `setup-linux.sh`). |
| `docs/` | Referensi protokol CS9711 & matriks lintas-OS. |
| `captures/` | Output gambar & laporan proof (git-ignored — data biometrik). |

## Keamanan

Gambar/template sidik jari = data biometrik sensitif (UU PDP No. 27/2022).
`captures/` di-git-ignore. Untuk produksi: simpan **template terenkripsi**, bukan
gambar mentah; jadikan sidik jari verifikasi **1:1** setelah e-KTP/kartu, bukan
identifikasi 1:N murni (citra parsial 68×118 → risiko false-accept).
