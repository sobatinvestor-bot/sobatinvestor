// scripts/commodity-sync.mjs
// Sinkronisasi harga komoditas bulanan (batu bara, nikel, sawit) dari World Bank Pink Sheet
// ke tabel Supabase `commodity_prices`. Dijalankan oleh GitHub Actions (cron bulanan).
//
// ENV wajib:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ENV opsional: WB_XLSX_URL (paksa URL Excel), WB_PAGE (halaman WB untuk temukan link)
//
// Catatan: layout Pink Sheet bisa berubah. Worker ini GAGAL KERAS (exit 1) bila kolom
// atau nilai tidak ditemukan — supaya tidak menulis data sampah ke DB.

import * as XLSX from "xlsx";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WB_PAGE = process.env.WB_PAGE || "https://www.worldbank.org/en/research/commodity-markets";
const WB_XLSX_URL = process.env.WB_XLSX_URL || "";
const UA = "Mozilla/5.0 (compatible; sobatinvestor-commodity-sync)";

// Target + cara mengenali kolomnya di header Pink Sheet.
const TARGETS = [
  { key: "coal",   label: "Batu bara (Australia)",  match: (n) => /coal/i.test(n) && /australia/i.test(n) },
  { key: "nickel", label: "Nikel (LME)",            match: (n) => /nickel/i.test(n) },
  { key: "cpo",    label: "Sawit / CPO (Malaysia)", match: (n) => /palm\s*oil/i.test(n) },
];

// Tautan grafik harga berjalan (benchmark sama dengan kolom Pink Sheet di atas).
const SOURCE_URL = {
  coal:   "https://tradingeconomics.com/commodity/coal",
  nickel: "https://tradingeconomics.com/commodity/nickel",
  cpo:    "https://tradingeconomics.com/commodity/palm-oil",
};

async function findXlsxUrl() {
  if (WB_XLSX_URL) return WB_XLSX_URL;
  const res = await fetch(WB_PAGE, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Gagal buka halaman WB (HTTP ${res.status})`);
  const html = await res.text();
  const m = html.match(/https?:\/\/[^"'\s)]*CMO-Historical-Data-Monthly\.xlsx/i);
  if (!m) throw new Error("Link CMO-Historical-Data-Monthly.xlsx tidak ditemukan di halaman WB (set WB_XLSX_URL manual).");
  return m[0];
}

function prettyMonth(raw) {
  // '2026M03' -> 'Mar 2026'
  const m = String(raw).match(/(\d{4})M(\d{2})/);
  if (m) {
    const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    const mi = parseInt(m[2], 10) - 1;
    if (mi >= 0 && mi < 12) return `${names[mi]} ${m[1]}`;
  }
  return String(raw);
}

function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSheet(wb) {
  const names = wb.SheetNames;
  const sheetName =
    names.find((n) => /monthly/i.test(n) && /price/i.test(n)) ||
    names.find((n) => /monthly/i.test(n) && !/index|indices/i.test(n)) ||
    names.find((n) => /monthly/i.test(n)) ||
    names[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });

  // Cari baris header yang memuat nama komoditas.
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const joined = (rows[i] || []).map((c) => String(c || "")).join(" | ").toLowerCase();
    if (joined.includes("nickel") || joined.includes("crude oil")) { headerRow = i; break; }
  }
  if (headerRow === -1) throw new Error("Baris header komoditas tidak ditemukan di sheet '" + sheetName + "'.");

  const headers = (rows[headerRow] || []).map((c) => String(c || ""));
  const cols = {};
  for (const t of TARGETS) {
    const idx = headers.findIndex((h) => t.match(h));
    if (idx === -1) throw new Error(`Kolom untuk '${t.key}' (${t.label}) tidak ditemukan di header.`);
    cols[t.key] = idx;
  }

  // Baris data = setelah header, kolom-0 ada isinya, dan minimal satu target berupa angka.
  const dataRows = rows.slice(headerRow + 1).filter(
    (r) => r && r[0] != null && String(r[0]).trim() !== "" &&
      TARGETS.some((t) => num(r[cols[t.key]]) != null)
  );
  if (dataRows.length < 2) throw new Error("Baris data bulanan kurang dari 2.");

  const last = dataRows[dataRows.length - 1];
  const prev = dataRows[dataRows.length - 2];
  const asOf = prettyMonth(last[0]);

  return TARGETS.map((t) => ({
    key: t.key,
    label: t.label,
    value: num(last[cols[t.key]]),
    prev_value: num(prev[cols[t.key]]),
    as_of: asOf,
  }));
}

async function upsert(rows) {
  const payload = rows.map((r) => ({
    key: r.key,
    label: r.label,
    unit: "US$ / ton",
    value: r.value,
    prev_value: r.prev_value,
    as_of: r.as_of,
    source: "World Bank Pink Sheet",
    url: SOURCE_URL[r.key] || "https://www.worldbank.org/en/research/commodity-markets",
    updated_at: new Date().toISOString(),
  }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/commodity_prices?on_conflict=key`, {
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
  const xlsxUrl = await findXlsxUrl();
  console.log("Unduh Pink Sheet:", xlsxUrl);
  const res = await fetch(xlsxUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Gagal unduh Excel (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });

  const rows = parseSheet(wb);
  console.log("Hasil parse:", rows.map((r) => `${r.key}=${r.value} (prev ${r.prev_value}) @${r.as_of}`).join("  |  "));

  if (rows.some((r) => r.value == null)) throw new Error("Ada nilai null — upsert dibatalkan (tidak menulis sampah).");
  await upsert(rows);
  console.log("OK: commodity_prices diperbarui.");
}

export { parseSheet, prettyMonth, num };

const isDirect = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });
}
