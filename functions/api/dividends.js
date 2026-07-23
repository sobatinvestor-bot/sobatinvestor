// functions/api/dividends.js
// ============================================================
// DINONAKTIFKAN (Juli 2026) — audit legal. Alasan lengkap: lihat quotes.js.
// Dulu mendeteksi ex-date & nominal dividen dari events Yahoo Finance tak
// resmi. Data yang SUDAH tercatat di tabel dividend_schedule (termasuk yang
// FIX hasil verifikasi manual ke pengumuman BEI) TIDAK terpengaruh dan tetap
// tampil — hanya deteksi OTOMATIS baris baru yang berhenti.
// ============================================================
export async function onRequestGet() {
  const body = {
    unavailable: true,
    message: 'Deteksi otomatis dividen sedang dinonaktifkan — menunggu sumber data berlisensi. Jadwal yang sudah terverifikasi tetap tampil di Kalender Dividen.',
    dividends: [],
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
