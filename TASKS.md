# SAKTI Merah Putih — Task Board

## ✅ Task 1 — Setup fingerprint & proof (Windows + macOS)

**Tujuan:** device CS9711 terpasang lewat `npm install`, terbukti bekerja di Mac & Windows.

**Deliverable (selesai):**
- [x] `git init` + `.gitignore` (captures/biometrik dikecualikan)
- [x] Requirement fingerprint terpasang via `npm install` (workspace `agent`, dep `usb`/libusb)
- [x] Setup per-OS otomatis (`scripts/setup-mac.sh`, `setup-windows.ps1`, `setup-linux.sh`)
- [x] Implementasi protokol CS9711 (INIT/SCAN, endpoint 0x81, remap 68×118)
- [x] Harness proof: `npm run doctor` (claim) & `npm run proof` (capture + PGM)
- [x] App dalam bentuk Docker (`app/` + `docker-compose.yml`)

**Kriteria PASS (dijalankan di hardware nyata):**
1. ✅ **macOS — TERVERIFIKASI** (Darwin 25.3, Apple Silicon, Node 26):
   `npm run proof` ⇒ `PROOF: PASS` — INIT status match, frame 8000+24,
   std-dev 49.65, `captures/capture-*.pgm` valid (min 12 / max 254). Tanpa crash.
2. ⬜ **Windows:** `npm run setup` → bind WinUSB (Zadig) → `npm run proof` ⇒ `PROOF: PASS`.
3. **Kedua OS:** `npm run proof` dengan jari di sensor ⇒ `captures/capture-*.pgm`
   ter-generate, `std-dev` > 5 (ada ridge, bukan frame kosong).
4. Bukti diarsipkan: `captures/proof-report.json` per OS.

### Bugfix log (dari uji hardware)
- **Crash + status "Merekam…" nyangkut:** `withInterface` menutup device (release/close)
  secara sinkron di `finally` sebelum transfer async selesai → native crash + request
  menggantung. Fix: `await fn()` di dalam `try` + busy-lock. Ditutup dengan test regresi.
- **`LIBUSB_TRANSFER_ERROR` / capture gagal:** protokol tak sesuai referensi. Fix:
  `set_configuration` sebelum claim, short-poll read 300ms (deadline 10s), read 8000+**24**
  (bukan 8000+8000), deteksi timeout `LIBUSB_TRANSFER_TIMED_OUT` di-retry (bukan fatal).

## 🔨 Task 2 — Verifikasi 1:1 (SourceAFIS, cache in-memory)

**Keputusan desain (brainstorming):** matcher = SourceAFIS (template minutiae =
"vektor"); enroll = multi-template (5–8 capture/"slide"); storage = **in-memory
ephemeral** (hilang saat app mati) untuk fase pengetesan — DB design menyusul.
Embedding/Gemini ditolak untuk sekarang (lihat catatan Future).

- [x] `matcher/` service Java SourceAFIS 3.18.1, `POST /enroll` + `POST /verify` (1:1), `GET /health`
- [x] Storage in-memory (`ConcurrentHashMap`) — restart = data terhapus
- [x] Multi-template: skor = max over template member, threshold 40 (env `MATCH_THRESHOLD`)
- [x] Parser PGM (P5) → `FingerprintImage` dpi 500 → `FingerprintTemplate`
- [x] Unit test (JUnit): parse PGM, roundtrip template, integrasi real-print (gated `FP_SAMPLE`)
- [x] App: proxy `/api/enroll`, `/api/verify`, `/api/capture-burst`; UI Enroll + Verifikasi 1:1
- [x] **Swipe/burst capture** (`/capture-burst`): rekam banyak frame, pilih yang
      **tajam** (quality-first) — buang frame kosong & motion-blur. Verify juga burst.
- [x] **Fix seleksi frame** (feedback user + guidebook): dulu filter by-gerakan →
      swipe pelan cuma 1 frame, swipe cepat blur/0 minutiae. Sekarang gate std +
      sharpness (kalibrasi: bagus ~17, blur ~6.6), knob env `MIN_STD/MIN_SHARP/MAX_FRAMES/BURST_MS`.
- [x] **Enroll gaya Touch ID (tap-coverage)**: `/capture-tap` (1 frame tertajam per tap) +
      matcher `/enroll-tap` — simpan hanya area BARU (overlap < `REDUNDANT_SCORE`=60),
      progress ke `TARGET_AREAS`=8, deteksi "sudah ada" vs "area baru". UI: loop tap +
      progress bar. Verify = 1 tap. Terverifikasi: tap sama→redundant, verify→match.
      Catatan: label "ujung vs tengah" absolut TIDAK dibuat (butuh core-detection); pakai
      panduan relative coverage. Embedding TIDAK diperlukan untuk ini (tetap upgrade masa depan).
- [x] `docker-compose`: service `matcher` + app `depends_on`
- [x] **Kalibrasi DPI**: CS9711 68×118 butuh `SENSOR_DPI=150` (500 → 0 minutiae). Default di-set 150.
- [x] Smoke test (capture asli): same→match 711.6 ✓, blank→tolak 0 ✓, restart→cache kosong ✓
- [ ] Verifikasi hardware same-finger/different-press + different-finger (FAR/FRR) — butuh device
- [ ] 1:N identification (task lanjutan)
- [ ] Enkripsi template + DB persisten (task lanjutan, saat DB design)

**Future — embedding lokal (bukan sekarang):** upgrade ke fixed-length embedding
(gaya DeepPrint) + pgvector untuk 1:N skala besar. Bukan Gemini (API teks, bukan
image; general-vision tak diskriminatif untuk biometrik; cloud melanggar UU PDP).
Rujukan: github.com/tim-rohwedder/fixed-length-fingerprint-extractors. Perlu
kumpulkan dataset dari CS9711 + kemungkinan fine-tune.

## 🔨 Task 3 — Flow "Kartu/Member-ID → Verifikasi 1:1" (identitas non-biometrik)

**Realita e-KTP (diverifikasi):** baca NIK/biodata dari chip e-KTP **terkunci** —
butuh **SAM Dukcapil + PKS** + mutual-auth. NFC reader biasa hanya bisa baca **UID
kartu** (bukan NIK). Jadi identitas resmi e-KTP = jalur Dukcapil (di luar scope MVP).

**Touch ID/Face ID (diverifikasi):** LocalAuthentication/BiometricPrompt hanya
pass/fail untuk **pemilik device**, tak bisa identifikasi dari DB — **tidak cocok**
untuk satu alat banyak anggota (kasus koperasi). CS9711 tetap hardware yang benar.

**Keputusan:** identitas dari **Member-ID/QR** yang SAKTI terbitkan (sesuai proposal
"QR Member"), sidik jari untuk **1:1**. Backend biometrik **pluggable** (`BIO_MODE`)
supaya flow bisa dibangun tanpa terhambat kualitas sensor.

- [x] Registry anggota in-memory (memberId, nama, NIK) — `POST/GET /api/members`
- [x] Flow registrasi: daftar → enroll → terbitkan Kartu/Member-ID
- [x] Flow layanan: resolve Member-ID → verifikasi 1:1 → verdict + nama anggota
- [x] `BIO_MODE=mock` (bangun/uji flow tanpa sensor) | `real` (CS9711+matcher)
- [x] Terverifikasi end-to-end (mock): register→enroll→resolve→verify(match/wrong)→404
- [ ] Uji flow di `BIO_MODE=real` dengan CS9711 (enroll tap + verify)
- [ ] QR visual (render + scan webcam) — sekarang Member-ID diketik/scan manual
- [ ] (Opsional) baca UID NFC kartu via reader PC/SC sebagai token
- [ ] (Resmi/nanti) integrasi Dukcapil SAM untuk biodata e-KTP asli

## ⬜ Task 4 — Alur registrasi end-to-end
- [ ] e-KTP → sidik jari → foto wajah → terbit ID/QR anggota
- [ ] Persistensi (DB) + audit
