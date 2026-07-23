// ============================================================
// SINKRON JADWAL DIVIDEN — DINONAKTIFKAN (Juli 2026)
// ============================================================
//
// STATUS: TIDAK AKTIF. Dilumpuhkan bersama fundamentals-sync.mjs/fundamentals-debug.mjs
// dan endpoint quotes/history/dividends/markets, atas keputusan pemilik aplikasi
// setelah audit legal — semua yang bergantung pada endpoint Yahoo Finance tak
// resmi dihentikan sampai ada sumber data berlisensi.
//
// DAMPAK: deteksi OTOMATIS ex-date/nominal dividen dari feed harga berhenti.
// Baris dividend_schedule yang SUDAH ADA (termasuk yang confirmed=true hasil
// verifikasi manual ke pengumuman resmi BEI/KSEI) TIDAK dihapus dan TETAP
// tampil apa adanya di Kalender Dividen & DividendCard — hanya penambahan
// baris baru secara otomatis yang berhenti.
//
// JALUR PENGGANTI YANG SAH: catat manual ke dividend_schedule lewat Supabase
// SQL Editor begitu ada pengumuman resmi BEI/KSEI, sama seperti proses RUNBOOK
// mingguan yang sudah berjalan untuk baris confirmed=true selama ini:
//   insert into public.dividend_schedule (symbol, ex_date, pay_date, amount, source, confirmed)
//   values ('XXXX', '2026-08-01', '2026-08-20', 25, 'Pengumuman BEI', true)
//   on conflict (symbol, ex_date) do nothing;
//
// Cron di .github/workflows/dividend-sync.yml sudah dinonaktifkan (dikomentari).
// ============================================================

console.log('dividend-sync: DINONAKTIFKAN sejak Juli 2026 (audit legal).');
console.log('Alasan: deteksi otomatis bergantung pada endpoint chart Yahoo Finance tak resmi.');
console.log('Baris dividend_schedule yang sudah ada (termasuk confirmed=true) TIDAK dihapus.');
console.log('Jadwal baru dicatat manual lewat Supabase SQL Editor — lihat komentar di file ini.');
console.log('Tidak ada permintaan jaringan yang dilakukan. Keluar dengan status 0.');
process.exit(0);
