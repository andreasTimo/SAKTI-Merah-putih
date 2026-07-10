# SAKTI Merah Putih

**Sistem Anggota Koperasi Terintegrasi Identitas Merah Putih** — digitalisasi
registrasi anggota koperasi berbasis **e-KTP (NFC)** + **biometrik sidik jari**.

Repo ini berisi **Task 1: setup fingerprint** untuk sensor **CS9711 (ChipSailing,
USB `0x2541:0x0236`)** yang jalan di **Windows dan macOS** tanpa SDK vendor.

> **Status deployment:** UI pengujian berjalan lokal di `http://localhost:8080`.
> Tidak ada deployment Cloud Run aktif. Cloud Run tidak dapat mengakses USB
> CS9711; agent tetap wajib berjalan native pada PC petugas. Runbook cadangan
> tersedia di [`docs/CLOUD_RUN.md`](docs/CLOUD_RUN.md) bila deployment diminta
> kemudian.

## Arsitektur (kenapa bukan "semua di Docker")

```
┌───────────────────────────────┐
│  agent/  — NATIVE (libusb)     │  wajib native di PC petugas.
│  capture CS9711 → PGM 68×118   │  Docker TIDAK bisa passthrough USB
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
Ini adalah alur pengujian utama dan tidak memerlukan akun atau resource cloud.

Di Windows, jalankan dari checkout bersih yang dependency-nya diinstal pada
Windows itu sendiri: `npm ci`, `npm run setup`, `npm run doctor`, lalu
`npm run agent`. Script agent melakukan preflight `node-usb`, WinUSB, dan
indikator Windows Biometric Service sebelum bridge dimulai.

Hasil validasi hardware Windows tersedia di
[`docs/WINDOWS_VALIDATION.md`](docs/WINDOWS_VALIDATION.md). Agent harus
dijalankan satu kali dari terminal Administrator dan dibiarkan hidup selama
web app digunakan.

> **Repo terkait:** fitur sidik jari ini akan digabung sebagai satu Feature ke
> repo utama koperasi (`sakti-merah-putih-main`, Next.js/Prisma). Dataset
> hackathon 27-tabel yang menyertai proyek ini (dan sudah dimigrasi ke Cloud SQL
> milik tim) didokumentasikan di
> [`docs/HACKATHON_DATABASE_SCHEMA.md`](docs/HACKATHON_DATABASE_SCHEMA.md).

## Struktur

| Path | Isi |
|------|-----|
| `agent/` | Bridge fingerprint native (Node + libusb). Capture + doctor + server. |
| `app/` | Web app SAKTI (Docker). Tidak menyentuh USB; proxy ke agent. |
| `scripts/` | Setup per-OS (`setup-mac.sh`, `setup-windows.ps1`, `setup-linux.sh`). |
| `docs/` | Referensi protokol CS9711, matriks lintas-OS, & skema database hackathon. |
| `captures/` | Output gambar & laporan proof (git-ignored — data biometrik). |

## Matching CS9711

CS9711 mengirim citra partial `68×118`. Matcher aktif adalah **SIGFM** yang
mengikuti pendekatan driver `archeYR/libfprint-CS9711`: OpenCV SIFT descriptor,
ratio matching, dan pemeriksaan konsistensi geometri. Enrollment membutuhkan
**15** capture; setiap capture menghasilkan template descriptor, bukan citra.

Template SIGFM diserialisasi ke SQLite BLOB pada Docker volume `matcher-data`.
Ini format internal `sigfm-sift` v1, **bukan ISO/IEC 19794-2**. Standar ISO dapat
ditambahkan hanya bila extractor yang dipakai benar-benar menghasilkan record
minutiae ISO. SourceAFIS Java tetap berada di `matcher/src/` sebagai referensi
legacy, tetapi bukan service matcher yang dibangun Docker.

## Keamanan

Gambar/template sidik jari = data biometrik sensitif (UU PDP No. 27/2022).
`captures/` di-git-ignore. Untuk testing, matcher menyimpan descriptor SIGFM
sebagai SQLite **BLOB** dalam volume Docker `matcher-data`; gambar mentah tidak
disimpan. Database testing ini belum dienkripsi. Untuk produksi, gunakan enkripsi
kolom/volume yang dikelola kunci dan jadikan sidik jari verifikasi **1:1** setelah
e-KTP/kartu, bukan identifikasi 1:N murni.
