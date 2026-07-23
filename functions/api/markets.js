// functions/api/markets.js
// ============================================================
// DINONAKTIFKAN (Juli 2026) — audit legal. Alasan lengkap: lihat quotes.js.
// Dulu menarik indeks saham global, kripto, komoditas & kurs dari Yahoo
// Finance tak resmi. TIDAK termasuk data komoditas (Bank Dunia) dan
// indikator makro/suku bunga (FRED) — itu tersimpan di tabel
// commodity_prices/economic_indicators via commodity-sync.mjs &
// indicators-sync.mjs, sumber resmi & tetap aktif, TIDAK terpengaruh sama
// sekali oleh penonaktifan ini. Tab Global akan tetap menampilkan kedua
// grup itu; yang hilang hanya "Indeks Saham Global / Kripto / Kurs".
// ============================================================
export async function onRequestGet() {
  const body = {
    asOf: new Date().toISOString(),
    delayed: true,
    unavailable: true,
    message: 'Indeks saham global, kripto & kurs sedang dinonaktifkan — menunggu sumber data berlisensi. Data komoditas & indikator makro di bawah tidak terpengaruh.',
    usdidr: null,
    groups: [],
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
