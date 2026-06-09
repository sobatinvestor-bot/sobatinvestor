// functions/api/dividends.js
// Ambil riwayat dividen REAL dari Yahoo Finance untuk simbol IDX.
// Endpoint: GET /api/dividends?symbols=BBCA,TLKM&range=2y
//
// Catatan: Yahoo memberi JUMLAH dividen (real) + EX-DATE (real).
// Tanggal PEMBAYARAN tidak tersedia di Yahoo — diperkirakan di frontend (ex-date + offset).

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const param = url.searchParams.get("symbols");
  const range = url.searchParams.get("range") || "2y";
  if (!param) return json({ dividends: [] });

  const symbols = param
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    .map((s) => (s.endsWith(".JK") ? s : s + ".JK"));

  const results = await Promise.allSettled(symbols.map((s) => fetchDivs(s, range)));
  const dividends = [];
  results.forEach((r) => { if (r.status === "fulfilled") dividends.push(...r.value); });

  return json({ dividends });
}

async function fetchDivs(symbol, range) {
  const u =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}&events=div`;

  const res = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
    cf: { cacheTtl: 3600, cacheEverything: true }, // dividen jarang berubah → cache 1 jam
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);

  const data = await res.json();
  const events = data?.chart?.result?.[0]?.events?.dividends;
  if (!events) return [];

  const sym = symbol.replace(".JK", "");
  return Object.values(events).map((d) => ({
    symbol: sym,
    amount: d.amount,                                   // Rp per lembar (real)
    exDate: new Date(d.date * 1000).toISOString().slice(0, 10), // ex-date (real)
  }));
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
