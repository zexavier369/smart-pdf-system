# Panduan Lengkap Penggunaan: Multi-Mode Smart PDF Processing System

Selamat! Website sistem pemrosesan PDF pintar Anda kini telah resmi aktif di internet dan dapat diakses kapan saja dari PC, laptop, maupun smartphone.

---

## 🌐 1. Alamat Resmi Website Anda

Website Anda dapat diakses secara publik melalui tautan aman berikut:
- **Alamat Utama (Cloudflare Pages)**:  
  👉 **`https://smart-pdf-system.pages.dev`**
- **Alamat Alternatif / Mesin Backend (Vercel)**:  
  👉 **`https://smart-pdf-system.vercel.app`**

> [!NOTE]
> Kedua tautan di atas dapat dibuka langsung melalui browser (Google Chrome, Microsoft Edge, Safari, Mozilla Firefox) di perangkat apa pun tanpa perlu memasang aplikasi tambahan.

---

## 🔐 2. Cara Masuk (Login) & Hak Akses Pengguna

Aplikasi ini dilindungi oleh sistem keamanan tertutup (*Allowlist*). Hanya alamat email yang terdaftar yang dapat memproses dokumen.

### Akun yang Saat Ini Diizinkan:
1. `zexavier369@gmail.com` (Pemilik / Admin)
2. `accnidzaenal@gmail.com` (Pengguna Resmi)

### Langkah Masuk:
1. Buka website: `https://smart-pdf-system.pages.dev`
2. Klik tombol **"Masuk dengan Google"**.
3. Pilih salah satu akun Google Anda yang terdaftar di atas.
4. Setelah berhasil masuk, status di pojok kanan atas akan menampilkan tanda hijau: **"Izin Diberikan"**.
5. *Catatan*: Jika seseorang mencoba masuk dengan email yang tidak terdaftar, sistem akan otomatis menolak dengan pesan *"Akses Ditolak: Alamat email belum terdaftar di izin sistem"*.

---

## 📑 3. Modul 1: PDF Matcher (Pencocok PO)

Digunakan untuk mencocokkan dua bundel dokumen PDF berdasarkan nomor Purchase Order (PO) dan menggabungkannya menjadi satu file PDF terpadu.

### Langkah-langkah Penggunaan:
1. **Langkah 1: Pilih Mode Pencocokan** (Wajib dipilih sebelum unggah):
   - **Mode 1:1**: 1 Halaman Dokumen A dipasangkan dengan 1 Halaman Dokumen B (Hasil akhir: 2 halaman per PO, urutan: A lalu B).
   - **Mode 1:2**: 1 Halaman Dokumen A dipasangkan dengan 2 Halaman Dokumen B (Hasil akhir: 3 halaman per PO, urutan: A, B1, lalu B2).
2. **Langkah 2: Unggah Dokumen**:
   - Pilih berkas **Dokumen A** (format PO tunggal 1 halaman).
   - Pilih berkas **Dokumen B** (format pasangan multi-halaman).
   - Klik tombol **"Mulai Analisis & Pencocokan"**.
3. **Langkah 3: Tinjau Hasil & Koreksi Manual**:
   - Sistem akan menampilkan ringkasan jumlah PO yang cocok sempurna dan daftar masalah (jika ada nomor PO buram / hilang).
   - Jika ada nomor PO yang salah atau tidak terbaca:
     - Anda dapat langsung mengetik nomor PO yang benar di kolom tabel.
     - Klik link **"Lihat Halaman"** untuk melihat gambar asli dokumen sebagai pembanding.
     - Klik tombol **"🔄 Jalankan Validasi Ulang"** untuk menyinkronkan status kecocokan.
4. **Langkah 4: Unduh Hasil**:
   - Klik **"✓ Unduh PDF Gabungan Lengkap"** untuk mendapatkan PDF akhir dengan urutan presisi mengikuti Dokumen A.
   - Klik **"📥 Unduh Laporan CSV"** untuk mengunduh rekap data pencocokan ke file Excel/CSV.

---

## 🚚 4. Modul 2: PDF Renamer (Surat Jalan)

Digunakan untuk memecah PDF berisi banyak Surat Jalan, di mana **tepat 1 halaman = 1 Surat Jalan = 1 file PDF baru**, dengan nama file otomatis berdasarkan nomor SJ dan tanggal.

### Format Penamaan Standar:
`SJ_[NomorSJ]-[Tanggal].pdf`
*(Contoh: Nomor SJ `260100001` dengan tanggal `1 Januari 2026` menghasilkan nama file: `SJ_260100001-1.pdf`)*.

### Langkah-langkah Penggunaan:
1. **Langkah 1: Unggah Berkas Surat Jalan**:
   - Anda dapat memilih satu atau beberapa berkas PDF sekaligus (*Multi-upload*).
   - Klik tombol **"Mulai Analisis & Penamaan Surat Jalan"**.
2. **Langkah 2: Validasi Kalender & Duplikasi Otomatis**:
   - Sistem membaca 12 nama bulan bahasa Indonesia (*Januari s.d. Desember*).
   - Menolak tanggal kalender yang tidak sah (misal: 30 Februari atau 32 Januari).
   - Mendeteksi jika terdapat nomor SJ yang kembar / duplikat.
3. **Langkah 3: Koreksi Manual**:
   - Anda dapat mengedit nomor SJ, tanggal, atau nama file final langsung di tabel jika hasil pindaian buram.
   - Klik **"Lihat Halaman"** untuk melihat pratinjau dokumen asli.
4. **Langkah 4: Unduh Hasil**:
   - Klik tombol **"Unduh Satuan"** di setiap baris untuk mengambil 1 file PDF tertentu.
   - Klik tombol **"📦 Unduh Seluruh Hasil (.ZIP)"** untuk mengunduh seluruh file Surat Jalan yang sudah terpisah rapi dalam satu arsip ZIP.
   - Klik **"📥 Unduh Laporan CSV"** untuk rekapitulasi audit data.

---

## 🔒 5. Privasi & Keamanan Dokumen (Zero-Retention Policy)

Aplikasi ini memproses dokumen dengan standar kerahasiaan tinggi:
1. **Bebas AI Eksternal**: Sistem **TIDAK MENGIRIMKAN** isi dokumen Anda ke server OpenAI, ChatGPT, Claude, atau layanan publik lainnya.
2. **Tanpa Database / Penyimpanan Permanen**: Seluruh file hanya diproses sesaat di memori server dan otomatis dimusnahkan seketika setelah proses unduh selesai. Dokumen Anda tidak akan pernah tersimpan di cloud hosting.
3. **Batas Berkas Aman**: Maksimal 25 MB per berkas dan 200 halaman per proses demi menjaga kestabilan memori server.

---

## ⚙️ 6. Cara Menambah Email Pengguna Baru di Masa Depan

Jika di kemudian hari Anda ingin memberikan akses kepada rekan kerja baru (misal: `rekan1@gmail.com`):
1. Buka dashboard Vercel Anda di: `https://vercel.com/`
2. Pilih project `smart-pdf-system` > Masuk ke tab **Settings** > **Environment Variables**.
3. Edit variabel `ALLOWED_EMAILS` dan tambahkan email baru dipisahkan tanda koma:  
   `accnidzaenal@gmail.com,zexavier369@gmail.com,rekan1@gmail.com`
4. Klik **Save**. Rekan baru Anda langsung bisa login ke website!
