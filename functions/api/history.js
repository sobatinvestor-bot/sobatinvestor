// functions/api/history.js
// Harga penutupan HARIAN historis (real) dari Yahoo untuk grafik portofolio.
// Endpoint: GET /api/history?symbols=BBCA,TLKM&range=2mo

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const param = url.searchParams.get("symbols");
  if (!param) return json({ history: {} });

  // range dibatasi daftar putih — mencegah nilai sembarang diteruskan ke Yahoo.
  const ALLOWED_RANGES = new Set(["1mo", "2mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]);
  const rawRange = url.searchParams.get("range") || "2mo";
  const range = ALLOWED_RANGES.has(rawRange) ? rawRange : "2mo";

  // KERAS: kode emiten IDX (2-6 huruf) atau indeks yang diizinkan saja,
  // maksimal MAX_SYMBOLS per request agar fan-out subrequest terbatas.
  const MAX_SYMBOLS = 60;
  const ALLOWED_INDEXES = new Set(["^JKSE"]);
  const symbols = param
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .map((s) => (s.startsWith("^") ? s : s.replace(/\.JK$/, "")))
    .filter((s) => (s.startsWith("^") ? ALLOWED_INDEXES.has(s) : /^[A-Z]{2,6}$/.test(s)))
    .filter((s, i, a) => a.indexOf(s) === i)   // dedupe
    .slice(0, MAX_SYMBOLS)
    .map((s) => (s.startsWith("^") ? s : s + ".JK"));

  if (symbols.length === 0) return json({ history: {} });

  const results = await Promise.allSettled(symbols.map((s) => fetchHist(s, range)));
  const history = {};
  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value) history[r.value.symbol] = r.value.series;
  });

  return json({ history });
}

async function fetchHist(symbol, range) {
  // Yahoo men-downsample range=max (sering jadi mingguan) walau interval=1d diminta.
  // Untuk MAX, pakai period1/period2 agar granularitas benar-benar HARIAN penuh
  // (inception -> sekarang), konsisten dengan timeframe lain & engine Backtest.
  let query;
  if (range === "max") {
    const now = Math.floor(Date.now() / 1000);
    query = `period1=0&period2=${now}&interval=1d`;
  } else {
    query = `interval=1d&range=${encodeURIComponent(range)}`;
  }
  const u =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?${query}`;

  const res = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; sobatinvestor/1.0; +https://sobatinvestor.com)",
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
    },
  });
}
