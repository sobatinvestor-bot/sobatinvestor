// functions/api/news.js
// Berita per-emiten (judul + sumber + TAUTAN ke artikel asli; tanpa muat teks penuh).
// Endpoint: GET /api/news?symbols=BBCA|Bank Central Asia,TLKM|Telkom&limit=20
//   &debug=1  -> sertakan diagnosa per sumber (status, jumlah item, cuplikan)
//
// Sumber: Google News RSS (utama) -> fallback Bing News RSS bila Google kosong.
// Legal: hanya judul, tanggal, sumber, link. Pengguna diarahkan ke penerbit asli.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const param = url.searchParams.get("symbols");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "8", 10), 20);
  const debug = url.searchParams.get("debug") === "1";
  if (!param) return json({ news: [] });

  const items = param
    .split(",").map((s) => s.trim()).filter(Boolean)
    .slice(0, 15)
    .map((tok) => {
      const [sym, ...rest] = tok.split("|");
      return { symbol: (sym || "").trim().toUpperCase(), name: rest.join("|").trim() };
    })
    .filter((it) => /^[A-Z]{4}$/.test(it.symbol));

  const diag = [];
  const results = await Promise.allSettled(items.map((it) => fetchForSymbol(it, diag)));
  let news = [];
  results.forEach((r) => { if (r.status === "fulfilled") news.push(...r.value); });

  const seen = new Set();
  news = news
    .filter((n) => { const k = n.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map(({ time, ...rest }) => ({ ...rest, date: new Date(time).toISOString() }));

  return json(debug ? { news, diag } : { news });
}

// Coba Google dulu; kalau 0 item, fallback ke Bing.
async function fetchForSymbol(it, diag) {
  let out = await fetchRss(googleUrl(it), it.symbol, "google", diag);
  if (out.length === 0) out = await fetchRss(bingUrl(it), it.symbol, "bing", diag);
  return out;
}

function googleUrl({ symbol, name }) {
  const q = encodeURIComponent(`${name ? `"${name}"` : symbol} saham`);
  return `https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`;
}
function bingUrl({ symbol, name }) {
  const q = encodeURIComponent(`${name || symbol} saham`);
  return `https://www.bing.com/news/search?q=${q}&format=rss&setlang=id&cc=ID`;
}

async function fetchRss(u, symbol, src, diag) {
  try {
    const res = await fetch(u, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "id-ID,id;q=0.9",
      },
      cf: { cacheTtl: 600 }, // cache ringan; tidak cacheEverything agar gagal tak tersimpan
    });
    const xml = await res.text();
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const items = [];
    for (const block of blocks.slice(0, 10)) {
      const title = clean(pick(block, "title"));
      const link = clean(pick(block, "link")) || clean(pickAttr(block, "link", "href"));
      const pubDate = pick(block, "pubDate") || pick(block, "pubdate");
      const source = clean(pick(block, "source"));
      if (!title || !link) continue;
      const time = pubDate ? new Date(pubDate).getTime() : Date.now();
      if (isNaN(time)) continue;
      items.push({ symbol, title, link, source: source || "", time });
    }
    if (diag) diag.push({ symbol, src, status: res.status, items: items.length, sample: xml.slice(0, 200) });
    return items;
  } catch (e) {
    if (diag) diag.push({ symbol, src, error: String(e) });
    return [];
  }
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1] : "";
}
function pickAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
}
function clean(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .trim();
}
function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
