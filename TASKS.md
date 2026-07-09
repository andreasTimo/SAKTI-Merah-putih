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
1. **macOS:** `npm install` → `npm run doctor` ⇒ `PROOF: PASS`
   (libusb load ✓, enumerate `0x2541:0x0236` ✓, claim interface 0 ✓).
2. **Windows:** `npm run setup` → bind WinUSB (Zadig) → `npm run doctor` ⇒ `PROOF: PASS`.
3. **Kedua OS:** `npm run proof` dengan jari di sensor ⇒ `captures/capture-*.pgm`
   ter-generate, `std-dev` gambar > 5 (ada ridge sidik jari, bukan frame kosong).
4. Bukti diarsipkan: `captures/proof-report.json` per OS.

> Status kode: siap uji. Verifikasi akhir butuh sensor CS9711 fisik pada tiap OS
> (mesin dev ini tanpa device → doctor berhenti wajar di langkah "enumeration").

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
