// functions/api/history.js
// Harga penutupan HARIAN historis (real) dari Yahoo untuk grafik portofolio.
// Endpoint: GET /api/history?symbols=BBCA,TLKM&range=2mo

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const param = url.searchParams.get("symbols");
  const range = url.searchParams.get("range") || "2mo";
  if (!param) return json({ history: {} });

  const symbols = param
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    .map((s) => (s.endsWith(".JK") ? s : s + ".JK"));

  const results = await Promise.allSettled(symbols.map((s) => fetchHist(s, range)));
  const history = {};
  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value) history[r.value.symbol] = r.value.series;
  });

  return json({ history });
}

async function fetchHist(symbol, range) {
  const u =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;

  const res = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
    cf: { cacheTtl: 1800, cacheEverything: true }, // cache 30 menit
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];

  const series = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] != null) series.push({ t: ts[i] * 1000, close: closes[i] });
  }
  return { symbol: symbol.replace(".JK", ""), series };
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
