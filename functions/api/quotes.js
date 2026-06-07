// functions/api/quotes.js
// Cloudflare Pages Function — menarik harga IDX REAL (delayed ~15-20 menit) dari Yahoo Finance.
// Endpoint situs: GET /api/quotes
//
// Catatan penting:
// - Data DELAYED, bukan real-time. Di luar jam bursa = harga penutupan terakhir.
// - Yahoo kadang memblokir IP datacenter. Fungsi ini pakai allSettled + cache 60 detik
//   supaya kalau 1-2 simbol gagal, sisanya tetap tampil.

const STOCKS = {
  "BBCA.JK": { name: "Bank Central Asia", sector: "Banking" },
  "BBRI.JK": { name: "Bank Rakyat Indonesia", sector: "Banking" },
  "TLKM.JK": { name: "Telkom Indonesia", sector: "Telecom" },
  "ASII.JK": { name: "Astra International", sector: "Consumer" },
  "GOTO.JK": { name: "GoTo Gojek Tokopedia", sector: "Tech" },
  "BMRI.JK": { name: "Bank Mandiri", sector: "Banking" },
  "UNVR.JK": { name: "Unilever Indonesia", sector: "Consumer" },
};

const INDEX_SYMBOL = "^JKSE"; // IHSG

export async function onRequestGet() {
  const symbols = Object.keys(STOCKS);

  const [stockResults, indexResult] = await Promise.all([
    Promise.allSettled(symbols.map(fetchQuote)),
    fetchQuote(INDEX_SYMBOL).catch(() => null),
  ]);

  const quotes = stockResults
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => {
      const q = r.value;
      const meta = STOCKS[`${q.symbol}.JK`] || {};
      return {
        symbol: q.symbol,
        name: meta.name || q.symbol,
        sector: meta.sector || "-",
        price: q.price,
        change: q.changePct,
        prevClose: q.prevClose,
      };
    });

  const ihsg = indexResult
    ? { value: indexResult.price, change: indexResult.changePct }
    : null;

  return new Response(
    JSON.stringify({
      asOf: new Date().toISOString(),
      delayed: true,
      ihsg,
      quotes,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        // cache di edge 60 detik supaya hemat panggilan ke Yahoo
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

async function fetchQuote(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
    cf: { cacheTtl: 60, cacheEverything: true },
  });

  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.meta) throw new Error(`No data for ${symbol}`);

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  return {
    symbol: symbol.replace(".JK", ""),
    price,
    prevClose,
    changePct,
  };
}
