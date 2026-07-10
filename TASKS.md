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

## ⬜ Task 3 — e-KTP NFC reader
- [ ] Bridge NFC (pola sama: agent native → localhost)
- [ ] Baca NIK + data identitas dari chip e-KTP

## ⬜ Task 4 — Alur registrasi end-to-end
- [ ] e-KTP → sidik jari → foto wajah → terbit ID/QR anggota
- [ ] Persistensi (DB) + audit
