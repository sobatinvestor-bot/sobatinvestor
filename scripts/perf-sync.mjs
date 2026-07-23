// ============================================================
// SINKRON PERFORMA HARGA — DINONAKTIFKAN (Juli 2026)
// ============================================================
//
// STATUS: TIDAK AKTIF. Dilumpuhkan bersama seluruh pipeline Yahoo Finance
// lain (quotes/history/dividends/markets, fundamentals-sync, dividend-sync)
// atas keputusan pemilik aplikasi setelah audit legal.
//
// Versi lama menarik deret harga 1 tahun (endpoint chart Yahoo) per simbol
// di tabel `analyses` utk menghitung imbal hasil 1 Bulan/YTD/1 Tahun ->
// tabel `performance`. Dihentikan sampai ada sumber data berlisensi.
//
// DAMPAK: kolom performa (1M/YTD/1Y) di analisis emiten berhenti diperbarui.
// Baris `performance` yang SUDAH ADA tidak dihapus — tetap tampil dgn
// tanggal "per <update terakhir>" apa adanya (bukan data baru yg dikira
// terkini). Cron di .github/workflows/perf-sync.yml sudah dinonaktifkan.
// ============================================================

console.log('perf-sync: DINONAKTIFKAN sejak Juli 2026 (audit legal).');
console.log('Alasan: bergantung pada endpoint chart Yahoo Finance tak resmi.');
console.log('Tabel performance TIDAK dihapus, hanya berhenti diperbarui otomatis.');
console.log('Tidak ada permintaan jaringan yang dilakukan. Keluar dengan status 0.');
process.exit(0);
