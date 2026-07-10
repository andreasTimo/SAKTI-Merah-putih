# Skema Database Hackathon (`hackathon_2026`)

Sumber: `metadata_database_hackathon_final.xlsx` (disediakan panitia Hackathon Koperasi Desa Merah Putih). 
Didokumentasikan setelah migrasi dataset ini dari endpoint hackathon bersama ke Cloud SQL milik tim sendiri (lihat [Migrasi Cloud SQL](#migrasi-cloud-sql)).

## Ringkasan

- **27 tabel**, semua di schema `public`, PostgreSQL 18.4 (sumber) / PostgreSQL 17 (Cloud SQL tujuan)
- **27 primary key**, **32 foreign key**
- Semua tabel berelasi ke `referensi_koperasi_wilayah.koperasi_ref` atau `referensi_wilayah.kode_wilayah` secara langsung/tidak langsung — data terpusat per koperasi dan per wilayah administratif

## Diagram Relasi (ringkas)

```
referensi_wilayah (kode_wilayah)
  |-- referensi_koperasi_wilayah (koperasi_ref)  <- pusat relasi setiap tabel *_koperasi
  |-- referensi_profil_desa
  |-- referensi_komoditas_desa
  `-- anggota_koperasi.kode_wilayah

referensi_koperasi_wilayah (koperasi_ref)
  |-- akun_bank_koperasi, anggota_koperasi, aset_koperasi, barang_keluar_produk,
  |   barang_masuk_produk, dokumen_koperasi, gerai_koperasi, inventaris_produk,
  |   karyawan_koperasi, kbli_koperasi, modal_koperasi, pengajuan_domain,
  |   pengajuan_kemitraan, pengajuan_pembiayaan, pengajuan_rekening_bank,
  |   pengurus_koperasi, produk_koperasi, profil_koperasi (0..1), rat_koperasi,
  |   simpanan_anggota, transaksi_penjualan

produk_koperasi (produk_sample_id)
  |-- barang_keluar_produk, barang_masuk_produk, inventaris_produk

transaksi_penjualan (transaksi_sample_id) -- barang_keluar_produk
anggota_koperasi (anggota_ref) -- simpanan_anggota
dokumen_koperasi.jenis_dokumen_ref -- referensi_dokumen_koperasi
gerai_koperasi.jenis_gerai_ref -- referensi_gerai_koperasi
```

## Tabel

### `akun_bank_koperasi`

Primary key: `akun_bank_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `akun_bank_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu akun bank koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama_rekening` | text | NULLABLE | Nama pemilik rekening sebagaimana tercatat pada akun bank koperasi. |
| `nama_bank` | text | NULLABLE | Nama bank tempat rekening koperasi terdaftar. Nilai pada data memiliki variasi penulisan sehingga standardisasi disarankan sebelum agregasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `anggota_koperasi`

Primary key: `anggota_ref`

- FK `kode_wilayah` → `referensi_wilayah.kode_wilayah` (Parent 1 : Child 0..N)
- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `anggota_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu anggota koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama` | text | NULLABLE | Nama individu atau entitas sesuai konteks tabel. |
| `nik` | text | NULLABLE | Nomor Induk Kependudukan individu; nilai pada dataset telah disamarkan untuk menjaga privasi. |
| `kode_wilayah` | text | NULLABLE | Kode wilayah administrasi yang menghubungkan record dengan tabel referensi_wilayah. |
| `jenis_kelamin` | text | NULLABLE | Kategori jenis kelamin individu pada record. |
| `status_keanggotaan` | text | NULLABLE | Status proses atau keaktifan keanggotaan anggota koperasi. |
| `tanggal_terdaftar` | date | NULLABLE | Tanggal anggota mulai terdaftar pada koperasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |
| `file_ktp` | text | NULLABLE | Referensi berkas KTP yang terkait dengan individu. |
| `status_akun` | text | NULLABLE | Status kepemilikan akun pengguna oleh anggota. |
| `pekerjaan` | text | NULLABLE | Jenis pekerjaan atau mata pencaharian individu. |

### `aset_koperasi`

Primary key: `aset_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `aset_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu aset koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama_aset` | text | NULLABLE | Nama atau label aset yang dicatat oleh koperasi. |
| `tipe_aset` | text | NULLABLE | Kategori kepemilikan atau klasifikasi aset koperasi. |
| `status` | text | NULLABLE | Status atau kondisi record sesuai proses bisnis pada tabel. |
| `progres_pembangunan` | numeric | NULLABLE | Persentase kemajuan pembangunan aset dengan rentang nilai 0 sampai 100. |
| `foto_utama` | text | NULLABLE | Referensi berkas foto utama aset. |
| `foto_sekunder` | text | NULLABLE | Referensi berkas foto tambahan aset. |
| `dokumen_utama` | text | NULLABLE | Referensi berkas dokumen utama aset. |
| `dokumen_sekunder` | text | NULLABLE | Referensi berkas dokumen tambahan aset. |
| `dokumen_lainnya` | text | NULLABLE | Referensi berkas dokumen pendukung lainnya. |
| `luas_lahan` | numeric | NULLABLE | Luas lahan yang terkait dengan aset koperasi. |
| `panjang_lahan` | numeric | NULLABLE | Ukuran panjang lahan yang terkait dengan aset koperasi. |
| `lebar_lahan` | numeric | NULLABLE | Ukuran lebar lahan yang terkait dengan aset koperasi. |
| `akses_jalan` | text | NULLABLE | Kondisi atau tingkat kemudahan akses jalan menuju aset atau gerai. |
| `koordinat_dibulatkan` | text | NULLABLE | Koordinat lokasi yang telah dibulatkan untuk mengurangi tingkat presisi lokasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `barang_keluar_produk`

Primary key: `__row_id`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)
- FK `produk_sample_id` → `produk_koperasi.produk_sample_id` (Parent 1 : Child 0..N)
- FK `transaksi_sample_id` → `transaksi_penjualan.transaksi_sample_id` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `__row_id` | integer | NOT NULL | Nomor urut teknis yang menjadi identitas unik setiap baris pada tabel. |
| `transaksi_sample_id` | text | NOT NULL | Kode unik transaksi penjualan pada dataset hackathon. |
| `produk_sample_id` | text | NOT NULL | Kode unik produk pada dataset hackathon. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `kode_barcode` | text | NULLABLE | Kode barcode yang digunakan untuk mengidentifikasi produk. |
| `tanggal_keluar` | timestamp without time zone | NULLABLE | Waktu produk keluar dari persediaan melalui transaksi. |
| `status` | text | NULLABLE | Status atau kondisi record sesuai proses bisnis pada tabel. |
| `nama_produk` | text | NULLABLE | Nama produk sebagaimana tercatat pada data produk atau transaksi. |
| `nama_tampilan` | text | NULLABLE | Nama produk yang digunakan untuk tampilan pada aplikasi atau laporan. |
| `jumlah_keluar` | numeric | NULLABLE | Kuantitas produk yang keluar pada record transaksi. |
| `harga` | numeric | NULLABLE | Harga per unit produk pada detail barang keluar. |
| `total_nilai` | numeric | NULLABLE | Nilai total barang keluar pada record. |
| `status_transaksi` | text | NULLABLE | Status penyelesaian transaksi penjualan. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `barang_masuk_produk`

Primary key: `barang_masuk_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)
- FK `produk_sample_id` → `produk_koperasi.produk_sample_id` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `barang_masuk_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu transaksi atau batch barang masuk. |
| `produk_sample_id` | text | NOT NULL | Kode unik produk pada dataset hackathon. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `kode_barcode` | text | NULLABLE | Kode barcode yang digunakan untuk mengidentifikasi produk. |
| `nama_produk` | text | NULLABLE | Nama produk sebagaimana tercatat pada data produk atau transaksi. |
| `nama_tampilan` | text | NULLABLE | Nama produk yang digunakan untuk tampilan pada aplikasi atau laporan. |
| `jumlah_masuk` | numeric | NULLABLE | Kuantitas produk yang diterima pada record barang masuk. |
| `jumlah_tersedia` | numeric | NULLABLE | Kuantitas produk dari barang masuk yang masih tersedia. |
| `harga_beli` | numeric | NULLABLE | Harga pembelian produk per unit. |
| `harga_jual` | numeric | NULLABLE | Harga penjualan produk per unit. |
| `total_biaya` | numeric | NULLABLE | Nilai total biaya barang masuk pada record. |
| `keterangan` | text | NULLABLE | Catatan atau keterangan tambahan mengenai record. |
| `status` | text | NULLABLE | Status atau kondisi record sesuai proses bisnis pada tabel. |
| `tanggal_masuk` | timestamp without time zone | NULLABLE | Waktu produk diterima atau masuk ke persediaan. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `dokumen_koperasi`

Primary key: `dokumen_ref`

- FK `jenis_dokumen_ref` → `referensi_dokumen_koperasi.jenis_dokumen_ref` (Parent 1 : Child 0..N)
- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `dokumen_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu dokumen koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `jenis_dokumen_ref` | text | NOT NULL | Kode referensi jenis dokumen yang menghubungkan dokumen dengan tabel referensi_dokumen_koperasi. |
| `nomor` | text | NULLABLE | Nomor resmi atau nomor administrasi dokumen. |
| `tanggal_berlaku` | date | NULLABLE | Tanggal mulai berlakunya dokumen. |
| `tanggal_kadaluarsa` | date | NULLABLE | Tanggal berakhirnya masa berlaku dokumen. |
| `alamat_pada_dokumen` | text | NULLABLE | Alamat yang tercantum pada dokumen. |
| `unggahan_dokumen` | text | NULLABLE | Referensi berkas hasil unggahan dokumen. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `gerai_koperasi`

Primary key: `gerai_ref`

- FK `jenis_gerai_ref` → `referensi_gerai_koperasi.jenis_gerai_ref` (Parent 1 : Child 0..N)
- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `gerai_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu gerai koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `jenis_gerai_ref` | text | NOT NULL | Kode referensi jenis gerai yang menghubungkan gerai dengan tabel referensi_gerai_koperasi. |
| `status_gerai` | text | NULLABLE | Status operasional atau kesiapan gerai koperasi. |
| `foto_gerai` | text | NULLABLE | Referensi berkas foto gerai koperasi. |
| `pengisi` | text | NULLABLE | Pihak atau sumber yang mengisi informasi gerai. |
| `akses_internet` | text | NULLABLE | Ketersediaan atau kondisi akses internet pada gerai. |
| `akses_listrik` | text | NULLABLE | Ketersediaan atau kondisi akses listrik pada gerai. |
| `status_kepemilikan_aset_gerai` | text | NULLABLE | Status kepemilikan aset yang digunakan sebagai gerai. |
| `status_pemanfaatan_aset_gerai` | text | NULLABLE | Skema atau status pemanfaatan aset gerai. |
| `sumber_air_bersih` | text | NULLABLE | Sumber air bersih yang tersedia pada gerai. |
| `jenis_bangunan` | text | NULLABLE | Jenis bangunan yang digunakan sebagai gerai. |
| `koordinat_dibulatkan` | text | NULLABLE | Koordinat lokasi yang telah dibulatkan untuk mengurangi tingkat presisi lokasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `inventaris_produk`

Primary key: `inventaris_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)
- FK `produk_sample_id` → `produk_koperasi.produk_sample_id` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `inventaris_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu record inventaris produk. |
| `produk_sample_id` | text | NOT NULL | Kode unik produk pada dataset hackathon. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama_produk` | text | NULLABLE | Nama produk sebagaimana tercatat pada data produk atau transaksi. |
| `stok` | numeric | NULLABLE | Saldo stok produk yang tercatat pada inventaris. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |
| `kode_barcode` | text | NULLABLE | Kode barcode yang digunakan untuk mengidentifikasi produk. |

### `karyawan_koperasi`

Primary key: `karyawan_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `karyawan_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu karyawan koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama` | text | NULLABLE | Nama individu atau entitas sesuai konteks tabel. |
| `jabatan` | text | NULLABLE | Jabatan atau peran individu dalam struktur organisasi koperasi. |
| `nomor_hp_karyawan` | text | NULLABLE | Nomor telepon karyawan; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `jenis_kelamin` | text | NULLABLE | Kategori jenis kelamin individu pada record. |
| `nik` | text | NULLABLE | Nomor Induk Kependudukan individu; nilai pada dataset telah disamarkan untuk menjaga privasi. |
| `email` | text | NULLABLE | Alamat email individu; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `status_karyawan` | text | NULLABLE | Status hubungan kerja karyawan dengan koperasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `kbli_koperasi`

Primary key: `__row_id`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `__row_id` | integer | NOT NULL | Nomor urut teknis yang menjadi identitas unik setiap baris pada tabel. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `kode_kbli` | text | NULLABLE | Kode Klasifikasi Baku Lapangan Usaha Indonesia yang dimiliki koperasi. |
| `nama_kbli` | text | NULLABLE | Nama kegiatan usaha sesuai kode KBLI. |
| `tipe_izin_usaha` | text | NULLABLE | Jenis atau tingkat izin usaha yang berkaitan dengan KBLI. |
| `tahun_kbli` | smallint | NULLABLE | Tahun referensi penerbitan atau pencatatan KBLI. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `modal_koperasi`

Primary key: `modal_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `modal_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu sumber atau penerimaan modal. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nomor_perjanjian` | text | NULLABLE | Nomor dokumen perjanjian sumber modal. |
| `tipe_sumber` | text | NULLABLE | Kategori sumber pemberi modal. |
| `nama_sumber` | text | NULLABLE | Nama pihak atau program yang menjadi sumber modal. |
| `tipe_modal` | text | NULLABLE | Kategori modal yang diterima koperasi. |
| `jumlah` | numeric | NULLABLE | Jumlah nilai modal yang diterima. |
| `tanggal_diterima` | date | NULLABLE | Tanggal modal diterima oleh koperasi. |
| `file_perjanjian` | text | NULLABLE | Referensi berkas perjanjian sumber modal. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `pengajuan_domain`

Primary key: `domain_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `domain_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu pengajuan domain. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `domain_koperasi` | text | NULLABLE | Nama domain yang diajukan untuk koperasi. |
| `status_verifikasi` | text | NULLABLE | Status pemeriksaan atau verifikasi pengajuan domain. |
| `status_domain` | text | NULLABLE | Status aktivasi atau penggunaan domain koperasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `pengajuan_kemitraan`

Primary key: `pengajuan_kemitraan_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `pengajuan_kemitraan_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu pengajuan kemitraan. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nik` | text | NULLABLE | Nomor Induk Kependudukan individu; nilai pada dataset telah disamarkan untuk menjaga privasi. |
| `penanggung_jawab` | text | NULLABLE | Nama pihak yang bertanggung jawab atas pengajuan. |
| `nomor_penanggung_jawab` | text | NULLABLE | Nomor kontak penanggung jawab; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `status_permohonan` | text | NULLABLE | Status proses permohonan atau pengajuan. |
| `bisnis_kemitraan` | text | NULLABLE | Nama atau jenis bisnis yang diajukan dalam kemitraan. |
| `paket_kemitraan` | text | NULLABLE | Paket kerja sama yang dipilih dalam pengajuan kemitraan. |
| `formulir_permohonan` | text | NULLABLE | Referensi berkas formulir pengajuan kemitraan. |
| `ktp_penanggung_jawab` | text | NULLABLE | Referensi berkas KTP penanggung jawab. |
| `tipe_kemitraan` | text | NULLABLE | Kategori pola kemitraan yang diajukan. |
| `catatan` | text | NULLABLE | Catatan tambahan mengenai pengajuan. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `pengajuan_pembiayaan`

Primary key: `pengajuan_pembiayaan_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `pengajuan_pembiayaan_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu pengajuan pembiayaan. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nik` | text | NULLABLE | Nomor Induk Kependudukan individu; nilai pada dataset telah disamarkan untuk menjaga privasi. |
| `penanggung_jawab` | text | NULLABLE | Nama pihak yang bertanggung jawab atas pengajuan. |
| `nomor_penanggung_jawab` | text | NULLABLE | Nomor kontak penanggung jawab; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `status_permohonan` | text | NULLABLE | Status proses permohonan atau pengajuan. |
| `formulir_permohonan_pembiayaan` | text | NULLABLE | Referensi berkas formulir pengajuan pembiayaan. |
| `nominal_permohonan` | real | NULLABLE | Nilai pembiayaan yang diajukan oleh koperasi. |
| `tenor` | integer | NULLABLE | Jangka waktu pembiayaan yang diajukan. |
| `tujuan_permohonan` | text | NULLABLE | Tujuan penggunaan dana pembiayaan yang diajukan. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `pengajuan_rekening_bank`

Primary key: `pengajuan_rekening_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `pengajuan_rekening_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu pengajuan rekening bank. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nik` | text | NULLABLE | Nomor Induk Kependudukan individu; nilai pada dataset telah disamarkan untuk menjaga privasi. |
| `penanggung_jawab` | text | NULLABLE | Nama pihak yang bertanggung jawab atas pengajuan. |
| `nomor_penanggung_jawab` | text | NULLABLE | Nomor kontak penanggung jawab; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `status` | text | NULLABLE | Status atau kondisi record sesuai proses bisnis pada tabel. |
| `kode_bank` | text | NULLABLE | Kode bank yang dipilih pada pengajuan rekening. |
| `nama_bank` | text | NULLABLE | Nama bank tempat rekening koperasi terdaftar. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `pengurus_koperasi`

Primary key: `pengurus_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `pengurus_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu pengurus koperasi. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama` | text | NULLABLE | Nama individu atau entitas sesuai konteks tabel. |
| `jabatan` | text | NULLABLE | Jabatan atau peran individu dalam struktur organisasi koperasi. |
| `status` | text | NULLABLE | Status atau kondisi record sesuai proses bisnis pada tabel. |
| `no_hp` | text | NULLABLE | Nomor telepon pengurus; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `nik` | text | NULLABLE | Nomor Induk Kependudukan individu; nilai pada dataset telah disamarkan untuk menjaga privasi. |
| `jenis_kelamin` | text | NULLABLE | Kategori jenis kelamin individu pada record. |
| `foto_profil` | text | NULLABLE | Referensi berkas foto profil pengurus. |
| `email` | text | NULLABLE | Alamat email individu; ditampilkan dalam bentuk tersamarkan pada output publik. |
| `alamat` | text | NULLABLE | Alamat tempat tinggal atau alamat korespondensi pengurus. |
| `kode_pos` | text | NULLABLE | Kode pos alamat pengurus atau koperasi. |
| `tanggal_lahir` | text | NULLABLE | Tanggal lahir pengurus dalam format tersamarkan, misalnya YYYY-**-**. |
| `status_pendidikan` | text | NULLABLE | Jenjang pendidikan terakhir pengurus. |
| `periode_mulai` | text | NULLABLE | Tanggal mulai periode kepengurusan; nilai 0000-00-00 menandakan tanggal tidak tersedia. |
| `periode_selesai` | date | NULLABLE | Tanggal akhir periode kepengurusan. |
| `file_ktp` | text | NULLABLE | Referensi berkas KTP yang terkait dengan individu. |
| `sumber_data` | text | NULLABLE | Sumber sistem atau proses yang menyediakan data pengurus. Nilai pada data memiliki variasi penulisan sehingga standardisasi disarankan sebelum agregasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `produk_koperasi`

Primary key: `produk_sample_id`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `produk_sample_id` | text | NOT NULL | Kode unik produk pada dataset hackathon. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `kode_barcode` | text | NULLABLE | Kode barcode yang digunakan untuk mengidentifikasi produk. |
| `nama_produk` | text | NULLABLE | Nama produk sebagaimana tercatat pada data produk atau transaksi. |
| `unit` | text | NULLABLE | Satuan pengukuran produk. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `profil_koperasi`

Primary key: `koperasi_ref`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..1)

| Field | Tipe | Deskripsi |
|---|---|---|
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama_koperasi` | text | NULLABLE | Nama resmi atau nama tampilan koperasi. |
| `status_registrasi` | text | NULLABLE | Status registrasi koperasi pada sistem. |
| `bentuk_koperasi` | text | NULLABLE | Bentuk kelembagaan koperasi. |
| `kategori_usaha` | text | NULLABLE | Kategori utama kegiatan usaha koperasi. |
| `nik_koperasi` | text | NULLABLE | Nomor Induk Koperasi yang digunakan sebagai identitas administratif koperasi. |
| `alamat_lengkap` | text | NULLABLE | Alamat lengkap kantor atau lokasi koperasi. |
| `kode_pos` | text | NULLABLE | Kode pos alamat pengurus atau koperasi. |
| `koordinat_dibulatkan` | text | NULLABLE | Koordinat lokasi yang telah dibulatkan untuk mengurangi tingkat presisi lokasi. |
| `modal_awal` | text | NULLABLE | Nilai atau keterangan modal awal koperasi sebagaimana tercatat pada sumber. |
| `sumber_persetujuan` | text | NULLABLE | Sistem atau institusi sumber persetujuan koperasi. |
| `tentang_koperasi` | text | NULLABLE | Deskripsi singkat mengenai profil dan kegiatan koperasi. |
| `pola_pengelolaan` | text | NULLABLE | Pola atau prinsip pengelolaan koperasi. |
| `metode_pengisian` | text | NULLABLE | Cara data profil koperasi diisi atau diperbarui. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `rat_koperasi`

Primary key: `rat_sample_id`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `rat_sample_id` | text | NOT NULL | Kode unik yang mengidentifikasi satu record pelaksanaan RAT. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `jenis_sektor_koperasi` | text | NULLABLE | Kategori sektor koperasi pada pelaksanaan RAT. |
| `urutan_rat` | text | NULLABLE | Nomor urut pelaksanaan RAT koperasi. |
| `tahun_buku` | smallint | NULLABLE | Tahun buku yang dilaporkan dalam RAT. |
| `tahun_rencana_kerja` | smallint | NULLABLE | Tahun yang menjadi periode rencana kerja koperasi. |
| `tahun_rencana_anggaran` | smallint | NULLABLE | Tahun yang menjadi periode rencana anggaran koperasi. |
| `tanggal_rat` | date | NULLABLE | Tanggal pelaksanaan Rapat Anggota Tahunan. |
| `jumlah_peserta_rat` | integer | NULLABLE | Jumlah peserta yang menghadiri RAT. |
| `status_rat` | text | NULLABLE | Status pelaksanaan atau pelaporan RAT. |
| `tahap_rat` | text | NULLABLE | Tahap proses penyelesaian RAT. |
| `laporan_posisi_keuangan` | text | NULLABLE | Ringkasan laporan posisi keuangan yang disampaikan dalam RAT. |
| `laporan_hasil_usaha` | text | NULLABLE | Ringkasan laporan hasil usaha yang disampaikan dalam RAT. |
| `rapb_posisi_keuangan` | text | NULLABLE | Rencana anggaran posisi keuangan koperasi. |
| `rapb_hasil_usaha` | text | NULLABLE | Rencana anggaran hasil usaha koperasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `referensi_dokumen_koperasi`

Primary key: `jenis_dokumen_ref`

| Field | Tipe | Deskripsi |
|---|---|---|
| `jenis_dokumen_ref` | text | NOT NULL | Kode referensi jenis dokumen yang menghubungkan dokumen dengan tabel referensi_dokumen_koperasi. |
| `nama_dokumen` | text | NULLABLE | Nama jenis dokumen koperasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `referensi_gerai_koperasi`

Primary key: `jenis_gerai_ref`

| Field | Tipe | Deskripsi |
|---|---|---|
| `jenis_gerai_ref` | text | NOT NULL | Kode referensi jenis gerai yang menghubungkan gerai dengan tabel referensi_gerai_koperasi. |
| `nama_jenis_gerai` | text | NULLABLE | Nama kategori atau jenis gerai koperasi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `referensi_komoditas_desa`

Primary key: `komoditas_ref`

- FK `kode_wilayah` → `referensi_wilayah.kode_wilayah` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `komoditas_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu komoditas desa. |
| `kode_wilayah` | text | NOT NULL | Kode wilayah administrasi yang menghubungkan record dengan tabel referensi_wilayah. |
| `nama_komoditas` | text | NULLABLE | Nama komoditas atau potensi ekonomi desa. |
| `luas_area` | text | NULLABLE | Luas area yang digunakan atau berpotensi untuk komoditas. |
| `volume` | text | NULLABLE | Volume produksi atau potensi komoditas sebagaimana tercatat pada sumber. |
| `jumlah_sdm_terlibat` | real | NULLABLE | Jumlah sumber daya manusia yang terlibat dalam komoditas. |
| `nilai_potensi_desa` | bigint | NULLABLE | Estimasi nilai ekonomi potensi komoditas desa. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `referensi_koperasi_wilayah`

Primary key: `koperasi_ref`

- FK `kode_wilayah` → `referensi_wilayah.kode_wilayah` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `kode_wilayah` | text | NULLABLE | Kode wilayah administrasi yang menghubungkan record dengan tabel referensi_wilayah. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `referensi_profil_desa`

Primary key: `kode_wilayah`

- FK `kode_wilayah` → `referensi_wilayah.kode_wilayah` (Parent 1 : Child 0..1)

| Field | Tipe | Deskripsi |
|---|---|---|
| `kode_wilayah` | text | NOT NULL | Kode wilayah administrasi yang menghubungkan record dengan tabel referensi_wilayah. |
| `tahun_populasi` | integer | NULLABLE | Tahun referensi data kependudukan desa. |
| `total_penduduk` | integer | NULLABLE | Jumlah seluruh penduduk desa. |
| `penduduk_laki_laki` | integer | NULLABLE | Jumlah penduduk laki-laki. |
| `penduduk_perempuan` | integer | NULLABLE | Jumlah penduduk perempuan. |
| `tahun_pendanaan` | integer | NULLABLE | Tahun referensi anggaran dana desa. |
| `anggaran_dana_desa` | numeric | NULLABLE | Nilai anggaran dana desa pada tahun referensi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `referensi_wilayah`

Primary key: `kode_wilayah`

| Field | Tipe | Deskripsi |
|---|---|---|
| `provinsi` | text | NULLABLE | Nama provinsi pada hierarki wilayah administrasi. |
| `kab_kota` | text | NULLABLE | Nama kabupaten atau kota pada hierarki wilayah administrasi. |
| `kecamatan` | text | NULLABLE | Nama kecamatan pada hierarki wilayah administrasi. |
| `desa_kelurahan` | text | NULLABLE | Nama desa atau kelurahan pada hierarki wilayah administrasi. |
| `kode_wilayah` | text | NOT NULL | Kode wilayah administrasi yang menghubungkan record dengan tabel referensi_wilayah. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |

### `simpanan_anggota`

Primary key: `simpanan_ref`

- FK `anggota_ref` → `anggota_koperasi.anggota_ref` (Parent 1 : Child 0..N)
- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `simpanan_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu record simpanan anggota. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `anggota_ref` | text | NOT NULL | Kode unik yang mengidentifikasi satu anggota koperasi. |
| `periode_pembayaran` | text | NULLABLE | Jenis atau periode kewajiban pembayaran simpanan anggota. |
| `jumlah_simpanan` | numeric | NULLABLE | Nilai simpanan anggota. |
| `status` | text | NULLABLE | Status atau kondisi record sesuai proses bisnis pada tabel. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `dibayar_pada` | timestamp without time zone | NULLABLE | Waktu pembayaran simpanan anggota. |

### `transaksi_penjualan`

Primary key: `transaksi_sample_id`

- FK `koperasi_ref` → `referensi_koperasi_wilayah.koperasi_ref` (Parent 1 : Child 0..N)

| Field | Tipe | Deskripsi |
|---|---|---|
| `transaksi_sample_id` | text | NOT NULL | Kode unik transaksi penjualan pada dataset hackathon. |
| `koperasi_ref` | text | NOT NULL | Kode referensi koperasi yang digunakan untuk menghubungkan data koperasi antartabel. |
| `nama_pelanggan` | text | NULLABLE | Nama pelanggan pada transaksi penjualan. |
| `tanggal_dibuat` | timestamp without time zone | NULLABLE | Waktu transaksi penjualan dibuat. |
| `total_pembayaran` | numeric | NULLABLE | Total nilai pembayaran transaksi penjualan. |
| `status_transaksi` | text | NULLABLE | Status penyelesaian transaksi penjualan. |
| `metode_pembayaran` | text | NULLABLE | Metode pembayaran yang digunakan pada transaksi. |
| `dibuat_pada` | timestamp without time zone | NULLABLE | Waktu ketika record pertama kali dibuat pada sistem sumber. |
| `diperbarui_pada` | timestamp without time zone | NULLABLE | Waktu terakhir record diperbarui pada sistem sumber. |
## Migrasi Cloud SQL

Dataset di atas awalnya hanya bisa diakses lewat endpoint PostgreSQL bersama milik panitia hackathon (satu host untuk semua peserta). Pada 2026-07-10/11 seluruh isi database (skema + data, 27 tabel) di-dump dan diimpor ke instance Cloud SQL milik tim sendiri agar tidak bergantung pada endpoint bersama.

**Sumber (read-only, disediakan panitia):**

| | |
|---|---|
| Host | `34.101.155.200:5432` |
| Database | `hackathon_2026` |
| User | `hackathon_participant_2026` |
| Versi | PostgreSQL 18.4 |

**Tujuan (milik tim, hasil migrasi):**

| | |
|---|---|
| GCP Project | `kemenkop-hackathon-2026-e906` |
| Instance | `koperasi-hackathon-2026` |
| Region | `asia-southeast2` (Jakarta) |
| Edition / Tier | Enterprise, `db-f1-micro` |
| Versi | PostgreSQL 17 |
| Public IP | `34.50.77.80` |
| Connection name | `kemenkop-hackathon-2026-e906:asia-southeast2:koperasi-hackathon-2026` |
| Database / User | `hackathon_2026` / `hackathon_app` |

**Alur migrasi:**

1. `pg_dump --no-owner --no-privileges --no-acl` dari sumber ke file SQL lokal
2. Upload file dump ke bucket GCS baru (`kemenkop-hackathon-2026-e906-sqlimport`, uniform bucket-level access)
3. Grant `roles/storage.objectViewer` pada **bucket** (bukan object — ditolak saat uniform bucket-level access aktif) untuk service account instance Cloud SQL
4. `gcloud sql import sql` — restore langsung dari GCS ke instance tujuan
5. Verifikasi: `COUNT(*)` exact pada seluruh 27 tabel, semua cocok dengan sumber (mis. `anggota_koperasi` 74.269, `simpanan_anggota` 372.407, `kbli_koperasi` 35.591)

**Catatan operasional:**

- Instance memakai edition `ENTERPRISE` secara eksplisit — project ini defaultnya Enterprise Plus, yang menolak tier shared-core seperti `db-f1-micro`.
- Public IP belum memiliki authorized networks — verifikasi koneksi memakai Cloud SQL Auth Proxy (`--gcloud-auth`), bukan koneksi langsung ke IP publik. Untuk koneksi aplikasi produksi, gunakan Cloud SQL Auth Proxy atau connector resmi, bukan authorized-networks yang dibuka lebar.
- Kredensial koneksi baru disimpan sebagai `CLOUDSQL_DB_*` di `.env` lokal (`SAKTI-MerahPutih/.env`), terpisah dari variabel `DB_*` milik sumber hackathon supaya kedua endpoint tetap bisa dibandingkan.
- Instance ini terus menimbulkan biaya GCP selama berjalan.
