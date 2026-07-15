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

// Simbol yang angka fundamentalnya DIKUNCI MANUAL dari laporan keuangan resmi
// (lebih akurat dari Yahoo). Worker tidak menimpa emiten ini.
// Tambahkan di sini bila ada koreksi LK manual lain di masa depan.
const MANUAL_LOCK = new Set(['MSTI']);

async function getSymbols() {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/analyses?select=symbol`, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`analyses ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return [...new Set(rows.map((x) => (x.symbol || '').toUpperCase().replace('.JK', '')).filter(Boolean))]
    .filter((s) => !MANUAL_LOCK.has(s));
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
  const pbv = num(sd.priceToBook) ?? num(ks.priceToBook);   // summaryDetail dulu (lebih andal)
  const roa = num(fd.returnOnAssets);                  // fraksi
  const npm = num(fd.profitMargins);                   // fraksi
  // Catatan: DER, Yield, Growth dari Yahoo TIDAK andal untuk emiten IDX (terbukti via debug),
  // jadi tidak ditulis. Hanya PER/PBV/ROA/NPM yang dipakai.

  // sanity check: buang nilai tak masuk akal -> null (lebih baik kosong daripada salah)
  const sane = (v, lo, hi) => (v === null || v < lo || v > hi ? null : v);

  // PER: emiten RUGI menghasilkan PER negatif. PER negatif TIDAK bermakna sebagai
  // valuasi, dan karena pengurutan PER memakai dir='asc' (makin kecil makin baik),
  // nilai negatif akan menempati peringkat teratas seolah "paling murah" -> skor
  // Overall jadi menyesatkan. Maka PER < 0 dikosongkan.
  const perOk = sane(per, 0, 1000);
  // PBV: negatif hanya terjadi bila ekuitas negatif -> tidak bermakna, dikosongkan.
  const pbvOk = sane(pbv, 0, 1000);
  // ROA & NPM: nilai NEGATIF adalah FAKTA (emiten rugi), bukan data salah -> TETAP
  // ditampilkan. Pengurutannya dir='desc', jadi negatif otomatis peringkat terbawah:
  // sudah benar. Batas di bawah hanya menyaring OUTLIER/sampah dari Yahoo,
  // bukan menyaring kerugian. Satuan di sini masih fraksi (-10 = -1000%).
  const roaOk = sane(roa, -10, 10);
  const npmOk = sane(npm, -10, 10);

  return {
    symbol: sym,
    per: round(perOk, 2),
    pbv: round(pbvOk, 2),
    roa: roaOk === null ? null : round(roaOk * 100, 2),   // -> %
    npm: npmOk === null ? null : round(npmOk * 100, 2),   // -> %
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
      const filled = ['per', 'pbv', 'roa', 'npm'].filter((k) => row[k] !== null).length;
      console.log(`  ${sym}: ${filled}/4 terisi`);
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
