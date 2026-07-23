// Kalender Dividen — PUBLIK, mencakup dividend_schedule apa adanya (bukan hanya
// portofolio user). Beda dari DividendCard (App.jsx): DividendCard menghitung
// hak & kas per USER; komponen ini menampilkan JADWAL PASAR — kapan cum-date/
// ex-date, kapan dibayar, berapa per saham — untuk emiten apa pun yang sudah
// tercatat di dividend_schedule.
//
// Kosakata status SENGAJA disamakan dengan DividendCard: FIX (confirmed=true,
// tanggal & nominal resmi hasil verifikasi manual ke pengumuman BEI/emiten) vs
// PERKIRAAN (auto-terdeteksi dari feed harga Yahoo, tanggal bayar ditaksir
// ex-date + 21 hari). Blank lebih baik daripada salah: tidak ada nominal/tanggal
// yang dikarang untuk baris PERKIRAAN.
import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';

const C = {
  cream: '#F4EFE6', cream2: '#EBE3D3', ink: '#1A2A20', inkSoft: '#3A4A40',
  forest: '#1F3B2D', cuan: '#C49B3C', cuanBright: '#E5B842', rust: '#B85C38',
  red: '#C0392B', green: '#2E7D4F',
};

const DAY = 86400000;
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const fmtRp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtTgl = (t) => { const d = new Date(t); return `${d.getDate()} ${BULAN_ID[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const monthKeyOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Jul 2024 - Jul 2027 — cukup luas utk menelusuri riwayat & jadwal yg sudah diumumkan jauh ke depan.
function buildMonthOptions() {
  const opts = []; let y = 2024, m = 6; // Juli 2024
  for (let i = 0; i < 37; i++) {
    opts.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${BULAN_ID[m]} ${y}` });
    m++; if (m > 11) { m = 0; y++; }
  }
  return opts;
}
const MONTH_OPTIONS = buildMonthOptions();

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: C.cream2, borderRadius: 16, padding: '16px 18px' }}>
      <div className="serif" style={{ fontSize: 28, fontWeight: 600, color: C.forest, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>{label}</div>
      {sub && <div className="mono" style={{ fontSize: 9.5, color: C.inkSoft, opacity: 0.75, marginTop: 2, letterSpacing: '0.04em' }}>{sub.toUpperCase()}</div>}
    </div>
  );
}

export default function DividendCalendar() {
  const [rows, setRows] = useState(null); // null = belum dimuat; [] = kosong
  const [names, setNames] = useState({});
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('mendatang'); // 'mendatang' | 'bulan' | 'historis'
  const [status, setStatus] = useState('semua'); // 'semua' | 'fix' | 'perkiraan'
  const [query, setQuery] = useState('');

  const now = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(() => monthKeyOf(now.getTime()), [now]);
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const todayMid = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('dividend_schedule')
          .select('symbol,ex_date,pay_date,amount,source,confirmed')
          .order('ex_date', { ascending: false });
        if (error) throw error;
        if (!active) return;
        setRows(data || []);
        const syms = [...new Set((data || []).map((r) => r.symbol))];
        if (syms.length) {
          const { data: dir } = await supabase.from('stock_directory').select('symbol,name').in('symbol', syms);
          const m = {}; (dir || []).forEach((d) => { m[d.symbol] = d.name; });
          if (active) setNames(m);
        }
      } catch {
        if (active) { setErr('Gagal memuat jadwal dividen. Coba muat ulang halaman.'); setRows([]); }
      }
    })();
    return () => { active = false; };
  }, []);

  // Tanggal bayar TERPAKAI: resmi (FIX) bila ada, kalau tidak taksiran ex+21 hari (PERKIRAAN).
  const enriched = useMemo(() => (rows || []).map((r) => {
    const exTime = new Date(r.ex_date + 'T00:00:00').getTime();
    const payTime = (r.confirmed && r.pay_date) ? new Date(r.pay_date + 'T00:00:00').getTime() : exTime + 21 * DAY;
    return { ...r, exTime, payTime, name: names[r.symbol] || r.symbol };
  }), [rows, names]);

  // Ringkasan selalu atas KESELURUHAN data (bukan hasil filter) — gambaran umum sistem,
  // sama seperti prototipe: kartu ringkasan tidak ikut berubah saat user memfilter tabel.
  const ringkasan = useMemo(() => {
    const emitenBulanIni = new Set(enriched.filter((r) => monthKeyOf(r.exTime) === currentMonthKey).map((r) => r.symbol)).size;
    const weekEnd = todayMid + 7 * DAY;
    const cumPekanIni = enriched.filter((r) => r.exTime >= todayMid && r.exTime < weekEnd).length;
    const bayarMendatang = enriched.filter((r) => r.confirmed && r.payTime > todayMid).length;
    return { emitenBulanIni, cumPekanIni, bayarMendatang };
  }, [enriched, todayMid, currentMonthKey]);

  const shown = useMemo(() => {
    let list = enriched.filter((r) => {
      if (status === 'fix' && !r.confirmed) return false;
      if (status === 'perkiraan' && r.confirmed) return false;
      if (query) {
        const q = query.trim().toUpperCase();
        if (!q) return true;
        if (!r.symbol.includes(q) && !(r.name || '').toUpperCase().includes(q)) return false;
      }
      return true;
    });
    if (mode === 'mendatang') list = list.filter((r) => r.payTime >= todayMid).sort((a, b) => a.payTime - b.payTime);
    else if (mode === 'historis') list = list.filter((r) => r.exTime < todayMid).sort((a, b) => b.exTime - a.exTime);
    else list = list.filter((r) => monthKeyOf(r.exTime) === monthKey).sort((a, b) => a.exTime - b.exTime);
    return list;
  }, [enriched, mode, monthKey, status, query, todayMid]);

  const namaBulanSekarang = `${BULAN_ID[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="fade-up">
      <h3 className="serif" style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: C.ink }}>Kalender Dividen</h3>
      <p style={{ fontSize: 13.5, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18 }}>
        Jadwal dividen emiten IDX yang sudah tercatat di aplikasi. <strong style={{ color: C.ink }}>FIX</strong> = tanggal &amp; nominal resmi hasil verifikasi manual ke pengumuman BEI/emiten. <strong style={{ color: C.ink }}>PERKIRAAN</strong> = ex-date terdeteksi otomatis, tanggal bayar ditaksir (belum diverifikasi).
      </p>

      {/* Ringkasan — selalu bulan berjalan, tak terpengaruh filter di bawah */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatCard label="Emiten" value={ringkasan.emitenBulanIni} sub={namaBulanSekarang} />
        <StatCard label="Cum-date 7 hari ke depan" value={ringkasan.cumPekanIni} />
        <StatCard label="Pembayaran FIX mendatang" value={ringkasan.bayarMendatang} />
      </div>

      {/* Mode: Mendatang / Bulan tertentu / Historis */}
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, background: C.cream2, borderRadius: 100, padding: 3, marginBottom: 12 }}>
        {[['mendatang', 'Mendatang'], ['bulan', 'Pilih Bulan'], ['historis', 'Historis']].map(([k, lbl]) => (
          <button key={k} onClick={() => { setMode(k); if (k === 'bulan') setMonthKey(currentMonthKey); }}
            style={{ border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 100, background: mode === k ? C.forest : 'transparent', color: mode === k ? C.cream : C.inkSoft }}>
            {lbl}
          </button>
        ))}
      </div>

      {mode === 'bulan' && (
        <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
          style={{ display: 'block', marginBottom: 14, padding: '8px 12px', borderRadius: 10, border: `1px solid rgba(26,42,32,0.15)`, background: C.cream, fontSize: 13, color: C.ink, fontFamily: 'inherit' }}>
          {MONTH_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      )}

      {/* Cari + filter status */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.inkSoft, pointerEvents: 'none' }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari kode atau nama emiten…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 34px', borderRadius: 100, border: 'none', background: C.cream2, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Hapus pencarian" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', alignItems: 'center', padding: 4 }}>
            <X size={15} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[['semua', 'Semua status'], ['fix', 'FIX (resmi)'], ['perkiraan', 'Perkiraan']].map(([k, lbl]) => (
          <button key={k} onClick={() => setStatus(k)}
            style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100,
              background: status === k ? 'rgba(31,59,45,0.08)' : 'transparent',
              border: `1px solid ${status === k ? C.forest : 'rgba(58,74,64,0.25)'}`,
              color: status === k ? C.forest : C.inkSoft }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Daftar jadwal */}
      <div style={{ background: C.cream2, borderRadius: 20, padding: rows === null || shown.length === 0 ? 24 : '6px 18px' }}>
        {rows === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 13 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat jadwal dividen…
          </div>
        ) : err ? (
          <div style={{ fontSize: 13, color: C.rust }}>{err}</div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.inkSoft }}>
            <div className="serif" style={{ fontSize: 16, color: C.ink, marginBottom: 4 }}>Belum ada jadwal yang cocok</div>
            <div style={{ fontSize: 12.5 }}>Coba ubah filter, atau jadwal untuk rentang ini memang belum tercatat.</div>
          </div>
        ) : (
          <div>
            {shown.map((r, i) => (
              <div key={`${r.symbol}-${r.ex_date}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: '12px 0', borderBottom: i < shown.length - 1 ? '1px solid rgba(26,42,32,0.06)' : 'none' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.symbol}</div>
                  <div style={{ fontSize: 11, color: C.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 11, color: C.inkSoft }}>ex {fmtTgl(r.exTime)}</div>
                  <div className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: r.confirmed ? C.green : C.inkSoft }}>
                    {r.confirmed ? 'DIBAYAR ' : '±DIBAYAR '}{fmtTgl(r.payTime).toUpperCase()}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 78 }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: r.amount != null ? C.green : C.inkSoft }}>
                    {r.amount != null ? `${fmtRp(r.amount)}/lbr` : '—'}
                  </div>
                  <div className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: r.confirmed ? C.green : C.inkSoft }}>
                    {r.confirmed ? 'FIX' : 'PERKIRAAN'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metodologi — apa adanya, tidak mengklaim lebih dari yang benar-benar dicatat */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(26,42,32,0.10)' }}>
        <h4 className="serif" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Cara kami menyusun data</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 12.5, color: C.inkSoft, lineHeight: 1.55 }}>
          <div><strong style={{ color: C.ink }}>01 · Deteksi otomatis</strong><br />Ex-date &amp; nominal awal ditarik dari feed harga (Yahoo Finance), ditandai PERKIRAAN.</div>
          <div><strong style={{ color: C.ink }}>02 · Verifikasi manual</strong><br />Tanggal bayar &amp; nominal final dicocokkan ke pengumuman resmi BEI/emiten sebelum ditandai FIX.</div>
          <div><strong style={{ color: C.ink }}>03 · Tidak menebak</strong><br />Baris yang belum terverifikasi tetap tampil sebagai PERKIRAAN — bukan disamarkan seolah resmi.</div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: C.inkSoft, marginTop: 14, lineHeight: 1.5 }}>
        Cakupan mengikuti emiten yang sudah tercatat di sistem kami — belum tentu mencakup seluruh emiten IDX. Jadwal dapat berubah sesuai keputusan RUPS emiten. Informasi bukan rekomendasi membeli atau menjual efek.
      </p>
    </div>
  );
}
