// ============================================================
// SINKRON JADWAL DIVIDEN — versi GRATIS (GitHub Actions, bukan Cloudflare Worker).
// Cakupan: SIMBOL DENGAN ANALISIS TERKURASI di tabel `analyses` DIGABUNG simbol yang
// dipegang user (lots). Sebelumnya menyisir seluruh direktori BEI (~958 emiten) yang
// menghasilkan antrean panjang (300+) berisi emiten yang tak pernah ditampilkan di
// UI dan tak akan dipegang siapa pun — pekerjaan admin sia-sia. Sekarang dibatasi
// ke emiten yang benar-benar muncul di aplikasi (tab Analisis + portofolio user).
// Logika deteksi sama: tarik dividen (Yahoo via app) -> catat yang belum punya
// tanggal resmi sebagai pending (confirmed=false).
// TIDAK pernah menimpa baris yang sudah ada (ignore-duplicates), jadi tanggal resmi aman.
//
// KONSEKUENSI: bila kelak analisis emiten baru ditambahkan, dividen bulan itu masuk
// antrean di run mingguan berikutnya (bukan terlambat berbulan-bulan). Emiten yang
// dipegang user tetap tercakup penuh, jadi kredit RDN untuk user tidak terganggu.
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

// Sumber cakupan: simbol dengan analisis terkurasi (tab Analisis di aplikasi).
// Emiten di luar daftar ini tidak muncul di UI, jadi tidak perlu jadwal dividen.
async function getAnalysesSymbols() {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/analyses?select=symbol`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`analyses ${r.status}: ${await r.text()}`);
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
  const [analysesSymbols, heldSymbols] = await Promise.all([
    getAnalysesSymbols().catch((e) => { console.error('analyses gagal, lanjut pakai held saja:', e.message); return []; }),
    getHeldSymbols(),
  ]);
  // Union: emiten dengan analisis terkurasi (muncul di tab Analisis) + simbol yang
  // dipegang user (prioritas RDN). Setiap Sabtu penuh, tanpa rotasi — jumlahnya
  // sekarang puluhan, bukan ratusan.
  const symbols = [...new Set([...analysesSymbols, ...heldSymbols])];
  console.log(`dividend-sync: ${analysesSymbols.length} analisis + ${heldSymbols.length} held -> ${symbols.length} simbol unik`);
  if (!symbols.length) { console.log('dividend-sync: tidak ada simbol (analyses & held sama-sama kosong)'); return; }

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
