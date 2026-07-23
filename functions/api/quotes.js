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
  "ADRO.JK": { name: "Alamtri Resources Indonesia", sector: "Energy" },
  "GOTO.JK": { name: "GoTo Gojek Tokopedia", sector: "Tech" },
  "BMRI.JK": { name: "Bank Mandiri", sector: "Banking" },
  "UNVR.JK": { name: "Unilever Indonesia", sector: "Consumer" },
  "MSTI.JK": { name: "Mastersystem Infotama", sector: "Tech" },
  "NCKL.JK": { name: "Trimegah Bangun Persada", sector: "Basic Materials" },
  "MBMA.JK": { name: "Merdeka Battery Materials", sector: "Basic Materials" },
};

const INDEX_SYMBOL = "^JKSE"; // IHSG

export async function onRequestGet(context) {
  // Bisa dipanggil /api/quotes?symbols=BBCA,ANTM untuk simbol milik user.
  // Tanpa param → pakai daftar default STOCKS.
  const url = new URL(context.request.url);
  const param = url.searchParams.get("symbols");
  const symbols = param
    ? param.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
        .map((s) => (s.endsWith(".JK") ? s : s + ".JK"))
    : Object.keys(STOCKS);

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

  // Mode debug: /api/quotes?debug=1 → status tiap simbol (untuk diagnosa throttling Yahoo).
  const body = {
    asOf: new Date().toISOString(),
    delayed: true,
    ihsg,
    quotes,
  };
  if (url.searchParams.get("debug")) {
    body.requested = symbols.length;
    body.ok = quotes.length;
    body.detail = symbols.map((sym, i) => {
      const r = stockResults[i];
      return r.status === "fulfilled" && r.value
        ? { symbol: sym, status: "ok" }
        : { symbol: sym, status: "gagal", reason: r.reason ? String(r.reason.message || r.reason) : "unknown" };
    });
    body.ihsgStatus = ihsg ? "ok" : "gagal";
  }

  return new Response(
    JSON.stringify(body),
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

// Host Yahoo bergantian — bila salah satu memblokir IP Cloudflare, coba yang lain.
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchOnce(symbol, host) {
  const url =
    `https://${host}/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=1d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; sobatinvestor/1.0; +https://sobatinvestor.com)",
      Accept: "application/json",
    },
    cf: { cacheTtl: 120, cacheEverything: true }, // 60->120s: kurangi volume request ke Yahoo; data toh sudah delayed 15-20 menit dari sumbernya, jadi tak ada kehilangan kesegaran nyata
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.meta) throw new Error("No data");

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

// Coba tiap host (query1 lalu query2). Hanya gagal bila SEMUA host gagal,
// sehingga satu simbol tidak mudah hilang dari ticker karena throttling sesaat.
async function fetchQuote(symbol) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      return await fetchOnce(symbol, host);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Yahoo ${symbol}: ${lastErr ? lastErr.message : "gagal"}`);
}
