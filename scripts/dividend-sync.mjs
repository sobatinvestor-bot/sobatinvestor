// ============================================================
// SINKRON JADWAL DIVIDEN — versi GRATIS (GitHub Actions, bukan Cloudflare Worker).
// Cakupan: SELURUH emiten di stock_directory (~958, sumber Kalender Dividen publik)
// DIGABUNG simbol yang dipegang user (lots) sbg jaring pengaman utk simbol lawas yang
// belum tentu ada di direktori. Logika deteksi sama seperti sebelumnya: tarik dividen
// (Yahoo via app) -> catat yang belum punya tanggal resmi sebagai pending (confirmed=false).
// TIDAK pernah menimpa baris yang sudah ada (ignore-duplicates), jadi tanggal resmi aman.
//
// PERINGATAN SKALA: dulu hanya menyisir simbol yang dipegang user (puluhan). Sekarang
// ~958 simbol -> ~48 chunk berurutan ke /api/dividends (masing2 20 simbol paralel di
// dalamnya). Ada jeda antar-chunk (CHUNK_DELAY_MS) supaya tidak membombardir Yahoo
// sekaligus dan berisiko IP datacenter diblokir.
//
// Dijalankan oleh .github/workflows/dividend-sync.yml (cron mingguan + tombol manual).
// Butuh env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (rahasia), APP_BASE_URL.
// Node 18+ (punya global fetch). Taruh file ini di:  scripts/dividend-sync.mjs
// ============================================================

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  APP_BASE_URL: process.env.APP_BASE_URL,
};

const OFFSET_DAYS = 21;
const WINDOW_PAST_DAYS = 100;
const CHUNK = 20;
const CHUNK_DELAY_MS = 300; // jeda sopan antar-chunk ke Yahoo (bukan batasan teknis, sekadar hati-hati)

// MITIGASI RISIKO: jangan hantam SELURUH direktori (~958 simbol) ke Yahoo tiap
// minggu — itu jejak besar utk endpoint tak resmi. Rotasi 4 batch (deterministik
// dari nomor minggu ISO, tanpa perlu simpan state) -> tiap Sabtu cuma ~1/4 direktori
// (~240 simbol) + SEMUA simbol yang dipegang user (prioritas tetap penuh, karena itu
// yang memengaruhi kredit RDN). Konsekuensi: cakupan market-wide utk Kalender Dividen
// terisi bertahap ±1 bulan, bukan seketika — trade-off yang sengaja diambil demi
// jejak lebih kecil ke Yahoo.
const DIRECTORY_BATCHES = 4;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function currentBatchIndex(total) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
  return week % total;
}

function svcHeaders() {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function getHeldSymbols() {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lots?select=symbol`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`lots ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return [...new Set(rows.map((x) => (x.symbol || '').toUpperCase()).filter(Boolean))];
}

// Sumber cakupan MARKET-WIDE untuk Kalender Dividen publik — direktori resmi BEI
// (~958 emiten), sama yang dipakai fitur sektor IDX-IC di tempat lain.
async function getDirectorySymbols() {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/stock_directory?select=symbol`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`stock_directory ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return [...new Set(rows.map((x) => (x.symbol || '').toUpperCase()).filter(Boolean))];
}

async function getExisting() {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/dividend_schedule?select=symbol,ex_date`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`schedule ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return new Set(rows.map((x) => `${x.symbol}|${x.ex_date}`));
}

async function fetchDividends(symbols) {
  const out = [];
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK);
    const url = `${env.APP_BASE_URL}/api/dividends?symbols=${encodeURIComponent(chunk.join(','))}&range=2y`;
    try {
      const r = await fetch(url);
      if (r.ok) { const d = await r.json(); for (const x of (d.dividends || [])) out.push(x); }
      else console.error(`dividends ${chunk.join(',')}: ${r.status}`);
    } catch (e) { console.error(`dividends ${chunk.join(',')}: ${e.message}`); }
    if (i + CHUNK < symbols.length) await sleep(CHUNK_DELAY_MS);
  }
  return out;
}

async function insertPending(rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/dividend_schedule`, {
    method: 'POST',
    headers: { ...svcHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`insert ${r.status}: ${await r.text()}`);
  return rows.length;
}

async function main() {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_BASE_URL']) {
    if (!env[k]) { console.error(`ENV ${k} kosong`); process.exit(1); }
  }
  const [directorySymbols, heldSymbols] = await Promise.all([
    getDirectorySymbols().catch((e) => { console.error('stock_directory gagal, lanjut pakai held saja:', e.message); return []; }),
    getHeldSymbols(),
  ]);
  // Gabungan: SATU BATCH direktori resmi (rotasi mingguan, lihat DIRECTORY_BATCHES)
  // + held (selalu penuh, prioritas RDN). Union, bukan salah satu saja.
  const batchIdx = currentBatchIndex(DIRECTORY_BATCHES);
  const directoryBatch = directorySymbols.filter((_, i) => i % DIRECTORY_BATCHES === batchIdx);
  const symbols = [...new Set([...directoryBatch, ...heldSymbols])];
  console.log(`dividend-sync: batch direktori ${batchIdx + 1}/${DIRECTORY_BATCHES} (${directoryBatch.length}/${directorySymbols.length} simbol direktori) + ${heldSymbols.length} held`);
  if (!symbols.length) { console.log('dividend-sync: tidak ada simbol (direktori & held sama-sama kosong)'); return; }

  const [existing, divs] = await Promise.all([getExisting(), fetchDividends(symbols)]);

  const DAY = 86400000;
  const now = Date.now();
  const minEx = now - WINDOW_PAST_DAYS * DAY;

  const seen = new Set();
  const pending = [];
  for (const d of divs) {
    const symbol = (d.symbol || '').toUpperCase();
    const exDate = (d.exDate || '').slice(0, 10);
    if (!symbol || !exDate) continue;
    const key = `${symbol}|${exDate}`;
    if (existing.has(key) || seen.has(key)) continue;
    const exTime = new Date(exDate + 'T00:00:00Z').getTime();
    if (isNaN(exTime) || exTime < minEx) continue;
    seen.add(key);
    const payEst = new Date(exTime + OFFSET_DAYS * DAY).toISOString().slice(0, 10);
    pending.push({ symbol, ex_date: exDate, pay_date: payEst, source: 'auto-detect (perlu tanggal resmi)', confirmed: false });
  }

  const n = await insertPending(pending);
  console.log(`dividend-sync: ${symbols.length} simbol, ${divs.length} dividen, ${n} pending baru ditambahkan`);
}

main().catch((e) => { console.error('dividend-sync gagal:', e.message); process.exit(1); });
