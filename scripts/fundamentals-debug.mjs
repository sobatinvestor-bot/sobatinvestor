// ============================================================
// DIAGNOSTIK FUNDAMENTAL LENGKAP — cetak field mentah Yahoo, TIDAK menulis DB.
// Untuk verifikasi PER/PBV/DER/ROA/NPM/yield vs sumber tepercaya (Stockbit) sebelum tayang.
// Termasuk komponen neraca agar bisa bandingkan DER versi "utang berbunga" vs "total liabilitas".
// Jalankan via .github/workflows/fundamentals-debug.yml (workflow_dispatch). Node 20+.
// ============================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SYMBOLS = (process.env.SYMBOLS || 'BBCA,BBRI,TLKM,ASII,ICBP,SIDO,ACES,ANTM,ADRO,UNTR,PGAS,MSTI')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const MODULES = 'summaryDetail,financialData,defaultKeyStatistics,price,balanceSheetHistory';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const raw = (x) => (x && typeof x === 'object' && 'raw' in x ? x.raw : x);
const f2 = (v) => (v == null || isNaN(Number(v)) ? '\u2014' : Number(v).toFixed(2));

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
  const sd = d.summaryDetail || {}, fd = d.financialData || {}, ks = d.defaultKeyStatistics || {}, pr = d.price || {};
  const bs = (d.balanceSheetHistory && d.balanceSheetHistory.balanceSheetStatements && d.balanceSheetHistory.balanceSheetStatements[0]) || {};

  const per = raw(sd.trailingPE) ?? raw(ks.trailingPE);
  const pbvSd = raw(sd.priceToBook), pbvKs = raw(ks.priceToBook);
  const derY = raw(fd.debtToEquity);
  const roa = raw(fd.returnOnAssets);
  const npm = raw(fd.profitMargins);
  const tady = raw(sd.trailingAnnualDividendYield);
  const dy = raw(sd.dividendYield);
  const price = raw(pr.regularMarketPrice);

  const totalDebt = raw(fd.totalDebt);
  const equity = raw(bs.totalStockholderEquity) ?? raw(bs.totalEquityGrossMinorityInterest);
  const totalLiab = raw(bs.totalLiab) ?? raw(bs.totalLiabilitiesNetMinorityInterest);
  const derDebt = (totalDebt != null && equity) ? totalDebt / equity : null;
  const derLiab = (totalLiab != null && equity) ? totalLiab / equity : null;

  console.log(`\n=== ${sym}.JK  (harga ${price}) ===`);
  console.log(`  PER  trailingPE=${f2(per)}`);
  console.log(`  PBV  summaryDetail=${f2(pbvSd)}  defaultKeyStats=${f2(pbvKs)}`);
  console.log(`  ROA  returnOnAssets x100=${roa != null ? (roa * 100).toFixed(2) : '\u2014'}%`);
  console.log(`  NPM  profitMargins x100=${npm != null ? (npm * 100).toFixed(2) : '\u2014'}%`);
  console.log(`  YIELD trailingAnnual x100=${tady != null ? (tady * 100).toFixed(2) : '\u2014'}%   dividendYield x100=${dy != null ? (dy * 100).toFixed(2) : '\u2014'}%`);
  console.log(`  DER  Yahoo debtToEquity/100=${derY != null ? (derY / 100).toFixed(2) : '\u2014'}  (basis: utang berbunga)`);
  console.log(`       neraca: totalDebt=${totalDebt}  totalLiab=${totalLiab}  equity=${equity}`);
  console.log(`       DER(utang berbunga/ekuitas)=${f2(derDebt)}   DER(total liabilitas/ekuitas)=${f2(derLiab)}`);
}

async function main() {
  const sess = await getSession();
  console.log(`Sesi Yahoo OK (crumb: ${sess.crumb ? 'ada' : 'KOSONG'})`);
  console.log(`Bandingkan tiap baris dengan Stockbit. Cari nilai yang jauh beda, dan DER versi mana yang cocok.`);
  for (const s of SYMBOLS) { try { await fetchOne(s, sess); } catch (e) { console.log(`${s}: ERROR ${e.message}`); } await sleep(500); }
  console.log('\nSelesai.');
}
main().catch((e) => { console.error(e); process.exit(1); });
