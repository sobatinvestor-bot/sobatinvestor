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

  // KERAS: hanya kode emiten IDX (2-6 huruf), maksimal MAX_SYMBOLS per request.
  // Tanpa batas ini, satu request bisa memicu ratusan subrequest ke Yahoo
  // (menghabiskan kuota subrequest Worker & memicu blokir IP dari Yahoo).
  const MAX_SYMBOLS = 60;
  const symbols = param
    ? param.split(",")
        .map((s) => s.trim().toUpperCase())
        .map((s) => s.replace(/\.JK$/, ""))
        .filter((s) => /^[A-Z]{2,6}$/.test(s))
        .filter((s, i, a) => a.indexOf(s) === i)   // dedupe: cegah 1 simbol dipanggil berulang
        .slice(0, MAX_SYMBOLS)
        .map((s) => s + ".JK")
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

  // changePct null (prevClose tak tegak) → jangan render IHSG setengah benar.
  const ihsg = (indexResult && typeof indexResult.changePct === "number")
    ? { value: indexResult.price, change: indexResult.changePct }
    : null;

  // Diagnostik ?debug DIHAPUS (Juli 2026): membocorkan pesan error internal
  // (status HTTP Yahoo, nama host, jejak kegagalan) ke siapa pun yang memanggil
  // endpoint. Untuk diagnosa, pakai log Cloudflare (wrangler tail / dashboard).
  const body = {
    asOf: new Date().toISOString(),
    delayed: true,
    ihsg,
    quotes,
  };

  return new Response(
    JSON.stringify(body),
    {
      headers: {
        "Content-Type": "application/json",
        // cache di edge 60 detik supaya hemat panggilan ke Yahoo
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}

// Host Yahoo bergantian — bila salah satu memblokir IP Cloudflare, coba yang lain.
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function fetchOnce(symbol, host) {
  // range=5d (bukan 1d): kita butuh deret close harian untuk menurunkan prevClose
  // sendiri. Jangan andalkan meta.previousClose — untuk ^JKSE field itu terbukti
  // tertinggal satu sesi (28 Ags 2026: price = close Kamis 6.521,75 tapi
  // previousClose = close Selasa 6.501,67 → +0,31%, padahal seharusnya +1,81%
  // terhadap close Rabu 6.405,69).
  const url =
    `https://${host}/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; sobatinvestor/1.0; +https://sobatinvestor.com)",
      Accept: "application/json",
    },
    cf: { cacheTtl: 120, cacheEverything: true },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.meta) throw new Error("No data");

  const meta = result.meta;
  const closes = (result?.indicators?.quote?.[0]?.close || [])
    .filter((c) => typeof c === "number" && c > 0);

  const price = (typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0)
    ? meta.regularMarketPrice
    : (closes.length ? closes[closes.length - 1] : null);
  if (price == null) throw new Error("No price");

  // prevClose = close bar terakhir yang BUKAN sesi berjalan.
  // Saat bursa buka, bar terakhir = hari ini (close-nya = harga berjalan) → ambil bar sebelumnya.
  // Saat bursa tutup, bar terakhir = penutupan hari ini → juga ambil bar sebelumnya.
  let prevClose = null;
  if (closes.length >= 2) {
    const last = closes[closes.length - 1];
    prevClose = Math.abs(last - price) / price < 1e-6
      ? closes[closes.length - 2]
      : last;
  } else if (typeof meta.previousClose === "number" && meta.previousClose > 0) {
    prevClose = meta.previousClose; // fallback tunggal: emiten baru/suspend, deret < 2 bar
  }

  // Blank lebih baik daripada salah: kalau prevClose tak bisa ditegakkan, kirim null,
  // bukan 0 (0% terbaca sebagai "pasar flat" — itu klaim yang tidak kita punya bukti).
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null;

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
