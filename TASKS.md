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

## ⬜ Task 2 — Matching & enrollment
- [ ] Integrasi SourceAFIS/NBIS: `/enroll` (simpan template) & `/verify` (1:1)
- [ ] Uji FAR/FRR pada citra 68×118
- [ ] Enkripsi template saat disimpan

## ⬜ Task 3 — e-KTP NFC reader
- [ ] Bridge NFC (pola sama: agent native → localhost)
- [ ] Baca NIK + data identitas dari chip e-KTP

## ⬜ Task 4 — Alur registrasi end-to-end
- [ ] e-KTP → sidik jari → foto wajah → terbit ID/QR anggota
- [ ] Persistensi (DB) + audit
