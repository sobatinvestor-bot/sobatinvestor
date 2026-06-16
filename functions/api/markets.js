// functions/api/markets.js
// Cloudflare Pages Function — pasar global: indeks AS/China/Jepang, kripto (IDR), minyak, emas.
// Sumber: Yahoo Finance (delayed). BTC/ETH dalam IDR dihitung dari harga USD x kurs USD/IDR.
// Endpoint: GET /api/markets  (debug: /api/markets?debug=1)
//
// Catatan: harga komoditas batu bara/nikel/sawit TIDAK disertakan karena tidak ada
// sumber gratis-andal di Yahoo (yang tersedia hanya indeks saham emiten, bukan harga komoditas).

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

const RATE_GROUP = "Kurs, Imbal Hasil & Suku Bunga";

const ITEMS = [
  { sym: "^JKSE",     group: "Indeks Saham Global", label: "IHSG",               sub: "Indonesia",       fmt: "num2" },
  { sym: "^GSPC",     group: "Indeks Saham Global", label: "S&P 500",            sub: "Amerika Serikat", fmt: "num2" },
  { sym: "000001.SS", group: "Indeks Saham Global", label: "Shanghai Composite", sub: "China",           fmt: "num2" },
  { sym: "^N225",     group: "Indeks Saham Global", label: "Nikkei 225",         sub: "Jepang",          fmt: "num2" },
  { sym: "BTC-USD",   group: "Kripto (dalam IDR)",  label: "Bitcoin",            sub: "BTC / IDR",       fmt: "idr", fx: true },
  { sym: "ETH-USD",   group: "Kripto (dalam IDR)",  label: "Ethereum",           sub: "ETH / IDR",       fmt: "idr", fx: true },
  { sym: "BZ=F",      group: "Komoditas",           label: "Minyak Brent",       sub: "US$ / barel",     fmt: "usd2" },
  { sym: "GC=F",      group: "Komoditas",           label: "Emas",               sub: "US$ / troy oz",   fmt: "usd2" },
  { sym: "HG=F",      group: "Komoditas",           label: "Tembaga",            sub: "US$ / lb",        fmt: "usd2" },
  { sym: "USDIDR=X",  group: RATE_GROUP,            label: "Dolar AS",           sub: "USD / IDR",       fmt: "idr" },
  { sym: "CNYIDR=X",  group: RATE_GROUP,            label: "Yuan Tiongkok",      sub: "CNY / IDR",       fmt: "idr", cross: "USDCNY=X" },
  { sym: "^TNX",      group: RATE_GROUP,            label: "US Treasury 10Y",    sub: "Imbal hasil tahunan", fmt: "pct" },
];

const FX_SYMBOL = "USDIDR=X";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const debug = url.searchParams.get("debug");

  const symbols = [...new Set(
    ITEMS.flatMap((it) => (it.cross ? [it.cross] : [it.sym])).concat([FX_SYMBOL])
  )];
  const results = await Promise.allSettled(symbols.map(fetchQuote));
  const bySym = {};
  results.forEach((r, i) => { bySym[symbols[i]] = r.status === "fulfilled" ? r.value : null; });

  const fxObj = bySym[FX_SYMBOL];
  const fx = fxObj ? fxObj.price : null; // USD -> IDR

  // Susun per grup, menjaga urutan kemunculan.
  const order = [];
  const map = {};
  for (const it of ITEMS) {
    let value = null;
    let change = null;
    if (it.cross) {
      // Kurs silang X/IDR = (USD/IDR) / (USD/X). Mis. CNY/IDR = USDIDR / USDCNY.
      const den = bySym[it.cross];
      if (fx && den && den.price) {
        value = fx / den.price;
        if (fxObj && fxObj.prevClose && den.prevClose) {
          const prevCross = fxObj.prevClose / den.prevClose;
          change = round2(((value - prevCross) / prevCross) * 100);
        }
      }
    } else {
      const q = bySym[it.sym];
      value = q ? q.price : null;
      change = q ? round2(q.changePct) : null;
      if (it.fx) value = (q && fx) ? q.price * fx : null;
    }
    const item = {
      label: it.label,
      sub: it.sub,
      display: value == null ? "—" : formatVal(value, it.fmt),
      change,
      url: "https://finance.yahoo.com/quote/" + encodeURIComponent(it.sym),
    };
    if (!map[it.group]) { map[it.group] = { title: it.group, items: [] }; order.push(it.group); }
    map[it.group].items.push(item);
  }
  const groups = order.map((g) => map[g]);

  const body = { asOf: new Date().toISOString(), delayed: true, usdidr: fx, groups };
  if (debug) {
    body.detail = symbols.map((s, i) => ({
      symbol: s,
      status: results[i].status === "fulfilled" && results[i].value ? "ok" : "gagal",
      reason: results[i].status === "rejected" ? String(results[i].reason && results[i].reason.message) : undefined,
    }));
  }

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function round2(n) { return Math.round(n * 100) / 100; }

function formatVal(n, fmt) {
  if (fmt === "idr") return "Rp " + Math.round(n).toLocaleString("id-ID");
  if (fmt === "usd2") return "US$ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (fmt === "pct") return n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  // num2 (indeks)
  return n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchOnce(symbol, host) {
  const u =
    `https://${host}/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
    },
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result || !result.meta) throw new Error("No data");
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return { symbol, price, prevClose, changePct };
}

async function fetchQuote(symbol) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try { return await fetchOnce(symbol, host); } catch (e) { lastErr = e; }
  }
  throw new Error(`${symbol}: ${lastErr ? lastErr.message : "gagal"}`);
}
