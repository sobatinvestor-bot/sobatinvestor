// ============================================================
// SINKRON FUNDAMENTAL — GitHub Actions (gratis).
// Baca semua simbol dari tabel `analyses` -> tarik Yahoo quoteSummary
// (PER, PBV, DER, ROA, NPM, div yield, growth laba) -> upsert ke `fundamentals`.
// Yang tidak tersedia dibiarkan NULL ("kosong saja").
//
// Dijalankan oleh .github/workflows/fundamentals-sync.yml (cron mingguan + manual).
// Butuh env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (rahasia).
// Node 20+ (global fetch + Headers.getSetCookie). Taruh di: scripts/fundamentals-sync.mjs
//
// CATATAN JUJUR: Yahoo quoteSummary butuh handshake cookie+crumb dan kadang
// memblokir IP datacenter. Kalau gagal total, lihat log; mungkin perlu retry
// atau sumber lain. Data publik bisa lag 1 kuartal dari laporan resmi emiten.
// ============================================================

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MODULES = 'summaryDetail,financialData,defaultKeyStatistics';
const DELAY_MS = 600; // jeda antar simbol agar tak kena throttle

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (x) => (x && typeof x.raw === 'number' && isFinite(x.raw) ? x.raw : null);
const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

function svcHeaders() {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function getSymbols() {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/analyses?select=symbol`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`analyses ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return [...new Set(rows.map((x) => (x.symbol || '').toUpperCase().replace('.JK', '')).filter(Boolean))];
}

async function getYahooSession() {
  // 1) cookie
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  let setCookies = [];
  if (typeof r1.headers.getSetCookie === 'function') setCookies = r1.headers.getSetCookie();
  else { const sc = r1.headers.get('set-cookie'); if (sc) setCookies = [sc]; }
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  // 2) crumb
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, cookie },
  });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.length > 30) throw new Error(`crumb tidak valid: "${crumb}"`);
  return { cookie, crumb };
}

async function fetchOne(sym, sess) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}.JK`
    + `?modules=${MODULES}&crumb=${encodeURIComponent(sess.crumb)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, cookie: sess.cookie } });
  if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
  const j = await r.json();
  const res = j?.quoteSummary?.result?.[0];
  if (!res) throw new Error(`${sym} tidak ada hasil`);
  const sd = res.summaryDetail || {};
  const fd = res.financialData || {};
  const ks = res.defaultKeyStatistics || {};

  const per = num(sd.trailingPE) ?? num(ks.trailingPE);
  const pbv = num(ks.priceToBook) ?? num(sd.priceToBook);
  const derRaw = num(fd.debtToEquity);                 // Yahoo: persen total-debt/ekuitas
  const roa = num(fd.returnOnAssets);                  // fraksi
  const npm = num(fd.profitMargins);                   // fraksi
  const dy = num(sd.dividendYield) ?? num(sd.trailingAnnualDividendYield); // fraksi
  const pg = num(fd.earningsGrowth) ?? num(ks.earningsQuarterlyGrowth);    // fraksi

  return {
    symbol: sym,
    per: round(per, 2),
    pbv: round(pbv, 2),
    der: derRaw === null ? null : round(derRaw / 100, 2), // -> rasio
    roa: roa === null ? null : round(roa * 100, 2),       // -> %
    npm: npm === null ? null : round(npm * 100, 2),       // -> %
    div_yield: dy === null ? null : round(dy * 100, 2),   // -> %
    profit_growth: pg === null ? null : round(pg * 100, 2), // -> %
    updated_at: new Date().toISOString(),
  };
}

async function upsert(rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/fundamentals`, {
    method: 'POST',
    headers: { ...svcHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${r.status}: ${await r.text()}`);
  return rows.length;
}

async function main() {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[k]) { console.error(`ENV ${k} kosong`); process.exit(1); }
  }
  const symbols = await getSymbols();
  console.log(`Simbol: ${symbols.length}`);
  const sess = await getYahooSession();
  console.log(`Sesi Yahoo OK (crumb didapat)`);

  const out = [];
  let ok = 0, fail = 0;
  for (const sym of symbols) {
    try {
      const row = await fetchOne(sym, sess);
      out.push(row);
      const filled = ['per','pbv','der','roa','npm','div_yield','profit_growth'].filter((k) => row[k] !== null).length;
      console.log(`  ${sym}: ${filled}/7 terisi`);
      ok++;
    } catch (e) {
      console.error(`  ${sym}: GAGAL — ${e.message}`);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  const n = await upsert(out);
  console.log(`\nSelesai. Upsert ${n} baris. Sukses ${ok}, gagal ${fail}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
