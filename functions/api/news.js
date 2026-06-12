// functions/api/news.js
// Berita per-emiten dari Google News RSS (agregator legal: judul + ringkasan + TAUTAN
// ke sumber asli, tanpa muat artikel penuh).
// Endpoint: GET /api/news?symbols=BBCA|Bank Central Asia,TLKM|Telkom&limit=20
//
// Legal note: hanya judul, tanggal, sumber, dan link dikembalikan — pengguna
// diarahkan ke situs penerbit asli. Tidak ada teks artikel yang disalin.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const param = url.searchParams.get("symbols");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "8", 10), 20);
  if (!param) return json({ news: [] });

  // Tiap item: "SYMBOL" atau "SYMBOL|Nama Perusahaan" (nama mempertajam query)
  const items = param
    .split(",").map((s) => s.trim()).filter(Boolean)
    .slice(0, 15)
    .map((tok) => {
      const [sym, ...rest] = tok.split("|");
      return { symbol: (sym || "").trim().toUpperCase(), name: rest.join("|").trim() };
    })
    .filter((it) => /^[A-Z]{4}$/.test(it.symbol));

  const results = await Promise.allSettled(items.map((it) => fetchNews(it)));
  let news = [];
  results.forEach((r) => { if (r.status === "fulfilled") news.push(...r.value); });

  // Dedupe per judul, urutkan terbaru, potong ke limit
  const seen = new Set();
  news = news
    .filter((n) => { const k = n.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map(({ time, ...rest }) => ({ ...rest, date: new Date(time).toISOString() }));

  return json({ news });
}

async function fetchNews({ symbol, name }) {
  // Query mempertajam relevansi: kode emiten DAN nama perusahaan (bila ada).
  // Format: ("KODE" OR "Nama Perusahaan") saham  -> kurangi false positive utk
  // kode yang kebetulan kata umum, sekaligus tangkap berita yg sebut nama saja.
  const namePart = name ? ` OR "${name}"` : "";
  const q = encodeURIComponent(`("${symbol}"${namePart}) saham`);
  const u = `https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`;

  const res = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    cf: { cacheTtl: 1800, cacheEverything: true }, // berita: cache 30 menit
  });
  if (!res.ok) throw new Error(`GNews ${symbol} HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  // Parse RSS sederhana tanpa dependensi (Workers tidak punya DOMParser)
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of itemMatches.slice(0, 10)) {
    const title = clean(pick(block, "title"));
    const link = clean(pick(block, "link"));
    const pubDate = pick(block, "pubDate");
    const source = clean(pick(block, "source")) || "";
    if (!title || !link) continue;
    const time = pubDate ? new Date(pubDate).getTime() : Date.now();
    if (isNaN(time)) continue;
    items.push({ symbol, title, link, source, time });
  }
  return items;
}

// Ambil isi tag pertama (mendukung CDATA & atribut)
function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1] : "";
}

// Bersihkan CDATA, entitas HTML dasar, dan tag sisa
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
      "Cache-Control": "public, max-age=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
