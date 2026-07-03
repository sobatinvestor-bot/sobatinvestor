// ============================================================
// DIAGNOSTIK EPS GROWTH — cek apakah Yahoo memberi growth kuartalan Q1'26 vs Q1'25
// untuk emiten IDX, LENGKAP dengan TANGGAL periode. TIDAK menulis DB.
// Jalankan via .github/workflows/fundamentals-debug.yml (workflow_dispatch). Node 20+.
// ============================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SYMBOLS = (process.env.SYMBOLS || 'LSIP,BSSR,INDF,DMAS,SIDO')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const MODULES = 'financialData,defaultKeyStatistics,earnings,earningsHistory,earningsTrend';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : x);
const pct = (v) => (v == null ? '\u2014' : (v * 100).toFixed(2) + '%');

async function getSession() {
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  let sc = [];
  if (typeof r1.headers.getSetCookie === 'function') sc = r1.headers.getSetCookie();
  else { const v = r1.headers.get('set-cookie'); if (v) sc = [v]; }
  const cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, cookie } });
  const crumb = (await r2.text()).trim();
  return { cookie, crumb };
}

async function fetchOne(sym, sess) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}.JK`
    + `?modules=${MODULES}&crumb=${encodeURIComponent(sess.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, cookie: sess.cookie } });
  if (!res.ok) { console.log(`\n${sym}: HTTP ${res.status}`); return; }
  const j = await res.json();
  const d = j?.quoteSummary?.result?.[0] || {};
  const fd = d.financialData || {}, ks = d.defaultKeyStatistics || {};
  const eh = d.earningsHistory?.history || [];
  const et = d.earningsTrend?.trend || [];

  console.log(`\n=== ${sym}.JK ===`);
  console.log(`  [field yg dulu dipakai]`);
  console.log(`    financialData.earningsGrowth        = ${pct(raw(fd.earningsGrowth))}  (periode TIDAK jelas)`);
  console.log(`    defaultKeyStats.earningsQuarterlyGrowth = ${pct(raw(ks.earningsQuarterlyGrowth))}  (klaim: kuartalan YoY)`);

  console.log(`  [earningsHistory — 4 kuartal terakhir, dgn TANGGAL]`);
  if (!eh.length) console.log(`    (kosong)`);
  eh.forEach((h) => {
    console.log(`    ${h.quarter?.fmt || '?'}: EPS aktual=${raw(h.epsActual)}  estimasi=${raw(h.epsEstimate)}`);
  });

  console.log(`  [earningsTrend — proyeksi growth per periode]`);
  if (!et.length) console.log(`    (kosong)`);
  et.forEach((t) => {
    const g = raw(t.growth);
    if (t.period) console.log(`    period=${t.period} endDate=${t.endDate || '?'}  growth=${pct(g)}`);
  });
}

async function main() {
  const sess = await getSession();
  console.log(`Sesi Yahoo OK (crumb: ${sess.crumb ? 'ada' : 'KOSONG'})`);
  console.log(`Tujuan: lihat apakah ada growth kuartalan dgn TANGGAL Q1'26 vs Q1'25. Bandingkan dgn laporan resmi IDX.`);
  for (const s of SYMBOLS) { try { await fetchOne(s, sess); } catch (e) { console.log(`${s}: ERROR ${e.message}`); } await sleep(500); }
  console.log('\nSelesai.');
}
main().catch((e) => { console.error(e); process.exit(1); });
