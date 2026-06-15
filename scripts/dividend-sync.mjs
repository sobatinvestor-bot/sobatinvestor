// ============================================================
// SINKRON JADWAL DIVIDEN — versi GRATIS (GitHub Actions, bukan Cloudflare Worker).
// Logika sama dgn worker: kumpulkan simbol dipegang user -> tarik dividen (Yahoo via
// app) -> catat yang belum punya tanggal resmi sebagai pending (confirmed=false).
// TIDAK pernah menimpa baris yang sudah ada (ignore-duplicates), jadi tanggal resmi aman.
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
  const symbols = await getHeldSymbols();
  if (!symbols.length) { console.log('dividend-sync: tidak ada simbol dipegang'); return; }

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
