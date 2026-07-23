// functions/api/quotes.js
// ============================================================
// DINONAKTIFKAN (Juli 2026) — audit legal.
// Versi lama memanggil endpoint tak resmi Yahoo Finance (query1/query2.finance.
// yahoo.com/v8/finance/chart) dengan User-Agent menyamar browser. Dimatikan atas
// keputusan pemilik aplikasi sampai ada sumber data berlisensi (mis. IDX Data
// Services resmi, atau provider komersial spt Invezgo/Sectors.app).
//
// Endpoint ini TETAP hidup (tidak dihapus) tapi TIDAK melakukan permintaan
// jaringan apa pun — hanya membalas struktur kosong dgn bendera `unavailable`,
// supaya kode klien yang sudah menangani "tidak ada data" (blank > salah) tetap
// berjalan mulus, bukan 404/500 yang bisa bikin app crash.
// ============================================================
export async function onRequestGet() {
  const body = {
    asOf: new Date().toISOString(),
    delayed: true,
    unavailable: true,
    message: 'Data harga saham sedang dinonaktifkan — menunggu sumber data berlisensi.',
    ihsg: null,
    quotes: [],
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
