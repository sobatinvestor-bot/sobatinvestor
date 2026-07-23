// functions/api/history.js
// ============================================================
// DINONAKTIFKAN (Juli 2026) — audit legal. Alasan lengkap: lihat quotes.js.
// Dulu memanggil endpoint chart Yahoo Finance tak resmi. Sekarang membalas
// deret kosong per simbol yang diminta (bukan 404/500), supaya PriceChart,
// Backtest, dan kalkulasi P/L 30 hari tetap menampilkan status "tidak ada
// data" yang sudah mereka tangani, bukan crash.
// ============================================================
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbols = (url.searchParams.get("symbols") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const history = {};
  for (const s of symbols) history[s.replace(".JK", "")] = [];
  const body = {
    unavailable: true,
    message: 'Data historis harga sedang dinonaktifkan — menunggu sumber data berlisensi.',
    history,
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
