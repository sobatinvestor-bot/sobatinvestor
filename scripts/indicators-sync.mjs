// scripts/indicators-sync.mjs
// Auto-update sebagian `economic_indicators` dari FRED (CSV publik St. Louis Fed, TANPA API key).
//   - Fed Funds Rate : DFEDTARU (batas atas) + DFEDTARL (batas bawah) -> mis. "3,50–3,75%"
//   - Japan 10Y      : IRLTLT01JPM156N (bulanan, OECD)                -> mis. "2,11%"
// BI Rate TIDAK disentuh (tetap manual — tidak ada sumber gratis yang andal).
//
// ENV wajib: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Gagal-keras (exit 1) bila nilai tidak ditemukan, supaya tidak menulis data sampah.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UA = "Mozilla/5.0 (compatible; sobatinvestor-indicators-sync)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const fredUrl = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;

// Ambil nilai (dan tanggal) terakhir yang numerik dari CSV FRED.
async function fredLast(id) {
  const res = await fetch(fredUrl(id), { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = lines[i].split(",");
    const val = parts[1];
    const n = Number(val);
    if (val && val.trim() !== "." && Number.isFinite(n)) return { date: parts[0], value: n };
  }
  throw new Error(`FRED ${id}: tidak ada nilai numerik`);
}

function num(n) { return n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function asOf(d) { // 'YYYY-MM-DD' -> 'Mon YYYY'
  const m = String(d).match(/(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(d);
}

async function build() {
  const [up, lo, jp] = await Promise.all([
    fredLast("DFEDTARU"),
    fredLast("DFEDTARL"),
    fredLast("IRLTLT01JPM156N"),
  ]);
  return [
    {
      key: "fed_funds", label: "Fed Funds Rate",
      display: `${num(lo.value)}–${num(up.value)}%`, value: up.value,
      as_of: asOf(up.date), source: "Federal Reserve",
      url: "https://tradingeconomics.com/united-states/interest-rate",
    },
    {
      key: "jp_10y", label: "Japan 10Y",
      display: `${num(jp.value)}%`, value: jp.value,
      as_of: asOf(jp.date), source: "JGB · OECD/FRED (bulanan)",
      url: "https://tradingeconomics.com/japan/government-bond-yield",
    },
  ];
}

async function upsert(rows) {
  const payload = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/economic_indicators?on_conflict=key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Supabase upsert HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("ENV SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY wajib di-set.");
  const rows = await build();
  console.log("Hasil:", rows.map((r) => `${r.key}=${r.display} @${r.as_of}`).join("  |  "));
  if (rows.some((r) => r.value == null || !r.display)) throw new Error("Ada nilai kosong — upsert dibatalkan.");
  await upsert(rows);
  console.log("OK: economic_indicators (fed_funds, jp_10y) diperbarui. BI Rate tetap manual.");
}

export { fredLast, num, asOf };

const isDirect = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirect) main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
