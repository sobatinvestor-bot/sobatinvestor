// ============================================================
// SINKRON FUNDAMENTAL — DINONAKTIFKAN (Juli 2026)
// ============================================================
//
// STATUS: TIDAK AKTIF. Skrip ini sengaja dilumpuhkan atas keputusan pemilik aplikasi
// setelah audit legal, dan TIDAK boleh diaktifkan kembali dalam bentuk lamanya.
//
// ALASAN — versi lama skrip ini melakukan hal berikut untuk membuka endpoint
// Yahoo `quoteSummary` yang digembok:
//   1. fetch ke https://fc.yahoo.com  -> panen cookie sesi
//   2. fetch ke .../v1/test/getcrumb  -> ambil token "crumb" anti-bot
//   3. pakai cookie + crumb utk membuka quoteSummary yang tak bisa diakses tanpa itu
//
// Langkah 1-3 itu BUKAN sekadar "mengambil data publik". Yahoo memasang cookie+crumb
// justru SEBAGAI mekanisme pengaman supaya endpoint tsb tidak diakses otomatis.
// Menembusnya = deliberate circumvention of a technical protection measure — kategori
// risiko yang jauh lebih berat daripada sekadar membaca endpoint terbuka, dan berpotensi
// bersinggungan dengan ketentuan akses tanpa hak (mis. UU ITE Pasal 30) selain pelanggaran
// ToS Yahoo. Ini satu-satunya bagian aplikasi yang melakukan hal tsb.
//
// DAMPAK KE APLIKASI:
//   - Kolom PER / PBV / ROA / NPM di Daftar Saham & tab Analisis TIDAK lagi terisi otomatis.
//   - Baris `fundamentals` yang SUDAH ada di database TIDAK dihapus — tetap tampil apa adanya,
//     hanya berhenti diperbarui otomatis. Yang belum ada akan tampil "—".
//   - Ini KONSISTEN dengan prinsip aplikasi: "blank lebih baik daripada salah". Lagipula
//     catatan proyek sendiri menyimpulkan data fundamental Yahoo untuk emiten IDX memang
//     tidak andal (DER, dividend yield, EPS growth terbukti meleset; PBV bahkan mengembalikan
//     sampah utk ADRO/AMMN/BSSR sampai perlu sanity check).
//
// JALUR PENGGANTI YANG SAH (sudah dipakai & terbukti lebih akurat):
//   Kurasi manual dari laporan keuangan resmi emiten di keterbukaan BEI — persis yang
//   sudah dilakukan untuk MSTI dan DSSA (lihat MANUAL_LOCK di versi lama). Angka dari
//   laporan keuangan resmi adalah FAKTA yang wajib dipublikasikan emiten; memakainya
//   tidak bermasalah. Prosesnya lebih lambat, tapi legal dan lebih akurat.
//
//   Isi/perbarui lewat Supabase SQL Editor, contoh:
//     insert into public.fundamentals (symbol, per, pbv, roa, npm, updated_at)
//     values ('XXXX', 12.34, 1.56, 7.89, 10.11, now())
//     on conflict (symbol) do update
//       set per = excluded.per, pbv = excluded.pbv, roa = excluded.roa,
//           npm = excluded.npm, updated_at = excluded.updated_at;
//
// CARA MEMATIKAN JADWALNYA: cron di .github/workflows/fundamentals-sync.yml juga sudah
// dinonaktifkan (baris schedule dikomentari). Skrip ini tetap ada sebagai dokumentasi
// keputusan + jalur manual, bukan sebagai kode mati tanpa penjelasan.
// ============================================================

console.log('fundamentals-sync: DINONAKTIFKAN sejak Juli 2026 (audit legal).');
console.log('Alasan: versi lama menembus proteksi cookie+crumb Yahoo utk membuka endpoint quoteSummary yang digembok.');
console.log('Data fundamental kini diisi manual dari laporan keuangan resmi BEI — lihat komentar di dalam file ini.');
console.log('Tidak ada permintaan jaringan yang dilakukan. Keluar dengan status 0 (sukses, bukan gagal).');
process.exit(0);
