// ============================================================
// DEBUG FUNDAMENTAL — DINONAKTIFKAN (Juli 2026)
// ============================================================
//
// STATUS: TIDAK AKTIF. Dilumpuhkan bersama fundamentals-sync.mjs.
//
// ALASAN: skrip ini memakai teknik yang SAMA PERSIS dengan yang dinonaktifkan di
// fundamentals-sync.mjs — panen cookie dari fc.yahoo.com, ambil token anti-bot lewat
// /v1/test/getcrumb, lalu memakainya untuk membuka endpoint quoteSummary yang digembok.
// Melumpuhkan sync tapi membiarkan debug tetap hidup = celah yang sama masih terbuka,
// jadi keduanya dimatikan bersamaan.
//
// Penjelasan lengkap, dampak ke aplikasi, dan jalur pengganti yang sah (kurasi manual
// dari laporan keuangan resmi BEI) ada di komentar fundamentals-sync.mjs.
//
// Cron di .github/workflows/fundamentals-debug.yml juga sudah dinonaktifkan.
// ============================================================

console.log('fundamentals-debug: DINONAKTIFKAN sejak Juli 2026 (audit legal).');
console.log('Memakai teknik cookie+crumb yang sama dengan fundamentals-sync — dimatikan bersamaan.');
console.log('Tidak ada permintaan jaringan yang dilakukan.');
process.exit(0);
