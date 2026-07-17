// ============================================================
// SINKRON PERFORMA HARGA — GitHub Actions (gratis).
// Baca semua simbol dari tabel `analyses` -> tarik Yahoo chart (range=1y,
// interval=1d) -> hitung imbal hasil 1 BULAN, YTD, dan 1 TAHUN -> upsert
// ke tabel `performance`.
//
// Dijalankan oleh .github/workflows/perf-sync.yml (cron HARIAN + manual).
// Butuh env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (rahasia).
// Node 20+ (global fetch). Taruh di: scripts/perf-sync.mjs
//
// KENAPA TABEL TERPISAH dari `fundamentals`:
// kadensinya beda — fundamental mingguan (Sabtu), performa HARIAN. Kalau
// digabung, kolom updated_at jadi ambigu dan label "per <tanggal>" di UI
// akan berbohong soal salah satunya.
//
// KENAPA endpoint `chart`, bukan `quoteSummary`:
// chart tidak butuh handshake cookie+crumb, dan SATU panggilan sudah memuat
// seluruh deret harian 1 tahun -> ketiga periode dihitung dari data yang sama.
//
// CATATAN JUJUR: harga Yahoo delayed dan tidak disesuaikan aksi korporasi
// secara sempurna (stock split/dividen dapat menggeser deret historis).
// Nilai yang tidak masuk akal dikosongkan — blank lebih baik daripada salah.
// ============================================================

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DELAY_MS = 400; // jeda antar simbol agar tak kena throttle
const DAY = 86400000;
const YAHOO_RANGE = '2y'; // WAJIB 2y — lihat catatan di fetchSeries()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// Deret harian bersih (buang titik null yang sering muncul di libur bursa).
//
// range=2y, BUKAN 1y. Alasannya penting: dengan range=1y titik pertama deret
// jatuh TEPAT sekitar H-365, dan karena akhir pekan/libur ia sering berada di
// H-364 atau H-361 -> penjaga `series[0].t <= H-365` gagal -> pct_1y null untuk
// hampir semua emiten (gejala: kolom 1Th kosong semua, 1B & YTD normal).
// Dengan 2y, deret pasti melewati H-365, dan penjaga IPO tetap bermakna:
// emiten yang riwayatnya < 1 tahun tetap menghasilkan null (benar).
async function fetchSeries(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}.JK`
    + `?range=${YAHOO_RANGE}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`chart ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const cl = r?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (typeof c === 'number' && isFinite(c) && c > 0) out.push({ t: ts[i] * 1000, c });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// Ringkasan rentang deret — dicetak ke log agar bisa dipastikan versi skrip
// yang BENAR-BENAR jalan (range=1y vs 2y) tanpa menebak.
function rentang(series) {
  if (!series.length) return 'kosong';
  const d = (t) => new Date(t).toISOString().slice(0, 10);
  const hari = Math.round((series[series.length - 1].t - series[0].t) / DAY);
  return `${series.length} titik, ${d(series[0].t)} s/d ${d(series[series.length - 1].t)} (${hari} hari)`;
}

// Harga penutupan pada atau SEBELUM waktu target. null bila deret belum mencapai situ.
function closeAtOrBefore(series, targetMs) {
  let hit = null;
  for (const p of series) {
    if (p.t <= targetMs) hit = p; else break;
  }
  return hit ? hit.c : null;
}

function hitung(series) {
  if (!series.length) return { pct_1m: null, pct_ytd: null, pct_1y: null, base_date_ytd: null };
  const last = series[series.length - 1];
  const now = last.t;

  const pct = (base) => {
    if (base === null || !(base > 0)) return null;
    const v = ((last.c - base) / base) * 100;
    // sanity: pergerakan di luar -100%..+2000% hampir pasti artefak aksi korporasi
    if (!isFinite(v) || v < -100 || v > 2000) return null;
    return round(v, 2);
  };

  // 1 BULAN: penutupan pada/sebelum 30 hari lalu
  const base1m = closeAtOrBefore(series, now - 30 * DAY);

  // 1 TAHUN: penutupan pada/sebelum 365 hari lalu.
  // Bila deret lebih pendek (emiten baru IPO), JANGAN pakai titik pertama —
  // itu bukan "1 tahun" dan akan menyesatkan. Kosongkan.
  const target1y = now - 365 * DAY;
  const base1y = series[0].t <= target1y ? closeAtOrBefore(series, target1y) : null;

  // YTD: konvensi pasar = penutupan terakhir tahun SEBELUMNYA.
  // Untuk emiten yang IPO tahun berjalan, deret tak mencapai tahun lalu -> null
  // (bukan "sejak IPO", karena itu bukan YTD).
  const thn = new Date(now).getUTCFullYear();
  const awalTahun = Date.UTC(thn, 0, 1);
  const sebelumTahunIni = series.filter((p) => p.t < awalTahun);
  const baseYtd = sebelumTahunIni.length ? sebelumTahunIni[sebelumTahunIni.length - 1].c : null;
  const baseYtdDate = sebelumTahunIni.length
    ? new Date(sebelumTahunIni[sebelumTahunIni.length - 1].t).toISOString().slice(0, 10)
    : null;

  return {
    pct_1m: pct(base1m),
    pct_ytd: pct(baseYtd),
    pct_1y: pct(base1y),
    base_date_ytd: baseYtdDate,
  };
}

async function fetchOne(sym) {
  const series = await fetchSeries(sym);
  const h = hitung(series);
  return {
    _rentang: rentang(series),
    _cukup1y: series.length ? (series[0].t <= series[series.length - 1].t - 365 * DAY) : false,
    symbol: sym,
    pct_1m: h.pct_1m,
    pct_ytd: h.pct_ytd,
    pct_1y: h.pct_1y,
    base_date_ytd: h.base_date_ytd,
    updated_at: new Date().toISOString(),
  };
}

async function upsert(rows) {
  if (!rows.length) return 0;
  // Buang field diagnosa (_rentang, _cukup1y) — bukan kolom tabel `performance`.
  rows = rows.map(({ _rentang, _cukup1y, ...r }) => r);
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/performance`, {
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
  console.log(`Rentang tarik Yahoo: ${YAHOO_RANGE}  <- harus '2y'. Kalau tertulis '1y', repo masih memakai skrip lama.`);

  const out = [];
  let ok = 0, fail = 0;
  for (const sym of symbols) {
    try {
      const row = await fetchOne(sym);
      out.push(row);
      const f = (v) => (v === null ? '—' : (v >= 0 ? '+' : '') + v + '%');
      const catatan = row.pct_1y === null
        ? `  <- 1Th kosong. Deret: ${row._rentang}. Cukup 1 th? ${row._cukup1y ? 'YA (cek sanity)' : 'TIDAK -> deret < 365 hari'}`
        : '';
      console.log(`  ${sym}: 1B ${f(row.pct_1m)} | YTD ${f(row.pct_ytd)} | 1Th ${f(row.pct_1y)}${catatan}`);
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
