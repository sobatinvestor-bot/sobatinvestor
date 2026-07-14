import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, lazy, Suspense } from 'react';
import { ChevronLeft, Send, Trash2, Loader2, TrendingUp, TrendingDown, MessageCircle, Search, X, Briefcase } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { supabase } from './lib/supabase';
import useBackGuard from './useBackGuard.js';
const Backtest = lazy(() => import('./Backtest.jsx'));

const C = {
  cream: '#F4EFE6',
  cream2: '#EBE3D3',
  ink: '#1A2A20',
  inkSoft: '#3A4A40',
  forest: '#1F3B2D',
  sage: '#6B8E5A',
  cuan: '#C49B3C',
  cuanBright: '#E5B842',
  rust: '#B85C38',
  red: '#C0392B',
  green: '#2E7D4F',
};

const fmtTime = (s) =>
  new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDate = (s) =>
  new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

// 4 metrik fundamental andal (Yahoo) untuk pengurutan. dir='asc' = makin kecil makin baik.
const FUND_METRICS = [
  { key: 'per', label: 'PER', dir: 'asc', unit: 'x' },
  { key: 'pbv', label: 'PBV', dir: 'asc', unit: 'x' },
  { key: 'roa', label: 'ROA', dir: 'desc', unit: '%' },
  { key: 'npm', label: 'NPM', dir: 'desc', unit: '%' },
];
const OVERALL_METRIC = { key: 'overall', label: 'Overall', dir: 'desc', unit: '' };

const toNum = (v) => (v == null || isNaN(Number(v)) ? null : Number(v));

// Skor Overall 0-100: rata-rata PERSENTIL peringkat di 4 metrik inti, relatif ke seluruh
// emiten yang punya data. Bobot sama, transparan; metrik yang kosong di-skip (tak dihukum).
function computeOverall(fundsMap) {
  const syms = Object.keys(fundsMap || {});
  const acc = {};
  syms.forEach((s) => { acc[s] = []; });
  FUND_METRICS.forEach((m) => {
    const vals = syms.map((s) => ({ s, v: toNum(fundsMap[s][m.key]) })).filter((x) => x.v !== null);
    if (vals.length < 2) return;
    vals.sort((a, b) => (m.dir === 'asc' ? a.v - b.v : b.v - a.v)); // index 0 = terbaik
    const n = vals.length;
    vals.forEach((x, i) => { acc[x.s].push(1 - i / (n - 1)); }); // 1=terbaik, 0=terburuk
  });
  const out = {};
  syms.forEach((s) => {
    const arr = acc[s];
    out[s] = arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : null;
  });
  return out;
}

export default function AnalisisTab({ userId, userName, onRequireLogin, initialPage, onPageConsumed, initialSymbol, onSymbolConsumed, onGoPortfolio }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [page, setPage] = useState(initialPage || 'umum'); // 'umum' | 'porto' | 'backtest'
  const [mySymbols, setMySymbols] = useState(null); // null = belum dimuat
  const [filter, setFilter] = useState('Semua'); // 'Semua' | 'Syariah'
  const [sortBy, setSortBy] = useState(null); // null = kode A-Z; atau salah satu key fundamental
  const [funds, setFunds] = useState({}); // peta simbol -> baris fundamentals
  const [query, setQuery] = useState(''); // pencarian emiten (kode/nama), hanya di Analisis Umum
  const listScrollY = useRef(0); // posisi scroll daftar, dipulihkan saat kembali dari detail

  // Permintaan buka page tertentu dari luar (mis. kartu Beranda → Backtest)
  useEffect(() => {
    if (initialPage) {
      setPage(initialPage);
      setOpen(null);
      if (onPageConsumed) onPageConsumed();
    }
  }, [initialPage]);

  // Permintaan buka analisis emiten tertentu dari luar (mis. klik simbol di Portofolio)
  useEffect(() => {
    if (!initialSymbol || loading) return; // tunggu daftar analisis termuat
    const sym = initialSymbol.toUpperCase();
    setPage('umum');
    const found = items.find((a) => (a.symbol || '').toUpperCase() === sym);
    if (found) {
      setQuery('');
      setOpen(found.symbol);
      supabase.rpc('increment_analysis_view', { p_symbol: found.symbol });
    } else {
      // belum ada analisis untuk emiten ini → tampilkan pencarian (user lihat status kosong)
      setOpen(null);
      setQuery(sym);
    }
    if (onSymbolConsumed) onSymbolConsumed();
  }, [initialSymbol, loading]);

  // Detail dibuka → mulai dari ATAS. Kembali ke daftar → pulihkan posisi scroll terakhir
  // (kembali tepat ke saham yang tadi diklik, bukan ke paling atas).
  useLayoutEffect(() => {
    if (open) window.scrollTo({ top: 0, behavior: 'auto' });
    else if (listScrollY.current > 0) window.scrollTo({ top: listScrollY.current, behavior: 'auto' });
  }, [open]);

  // Tombol Back browser: saat detail terbuka, Back menutup detail dulu
  // (kembali ke daftar) alih-alih meninggalkan situs.
  useBackGuard(!!open, () => setOpen(null));

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('analyses').select('*').eq('published', true),
      supabase.rpc('analysis_comment_counts'),
    ]).then(([aRes, cRes]) => {
      if (!active) return;
      const counts = {};
      if (!cRes.error && Array.isArray(cRes.data)) {
        cRes.data.forEach((r) => { counts[(r.symbol || '').toUpperCase()] = Number(r.cnt) || 0; });
      }
      const list = (aRes.error ? [] : (aRes.data || [])).map((a) => ({
        ...a,
        _comments: counts[(a.symbol || '').toUpperCase()] || 0,
        _views: Number(a.view_count) || 0,
      }));
      // Urutan: jumlah komentar -> jumlah view -> terbaru
      list.sort((x, y) =>
        (y._comments - x._comments) ||
        (y._views - x._views) ||
        (new Date(y.created_at).getTime() - new Date(x.created_at).getTime())
      );
      setItems(list);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  // Muat simbol holding user untuk page "Saham Kamu" (RLS: hanya miliknya sendiri)
  useEffect(() => {
    if (!userId) { setMySymbols(null); return; }
    let active = true;
    supabase
      .from('holdings')
      .select('symbol')
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setMySymbols([...new Set((data || []).map((h) => (h.symbol || '').toUpperCase()))]);
        else setMySymbols([]);
      });
    return () => { active = false; };
  }, [userId]);

  // Muat data fundamental (publik, read-only) untuk pengurutan & nilai di chip
  useEffect(() => {
    let active = true;
    supabase.from('fundamentals').select('*').then(({ data, error }) => {
      if (!active) return;
      const m = {};
      if (!error && Array.isArray(data)) data.forEach((r) => { m[(r.symbol || '').toUpperCase()] = r; });
      setFunds(m);
    });
    return () => { active = false; };
  }, []);

  // Skor Overall (persentil rata-rata metrik) — HARUS sebelum early return di bawah
  // agar urutan hooks konsisten (kalau di bawah, detail blank karena hooks mismatch).
  const overallScores = useMemo(() => computeOverall(funds), [funds]);
  // Tanggal data fundamental terbaru (dari updated_at) untuk keterangan sumber
  const fundsUpdated = useMemo(() => {
    const ds = Object.values(funds).map((r) => r && r.updated_at).filter(Boolean);
    return ds.length ? ds.sort().slice(-1)[0] : null;
  }, [funds]);

  if (open) {
    const a = items.find((x) => x.symbol === open);
    if (a) return <AnalisisDetail a={a} funds={funds} onBack={() => setOpen(null)} onPortfolio={onGoPortfolio ? () => { setOpen(null); onGoPortfolio(); } : null} userId={userId} userName={userName} onRequireLogin={onRequireLogin} />;
  }

  const isPorto = page === 'porto';
  const base = isPorto && Array.isArray(mySymbols)
    ? items.filter((a) => mySymbols.includes((a.symbol || '').toUpperCase()))
    : items;
  const q = query.trim().toUpperCase();
  const shown = base.filter((a) => {
    if (filter === 'Syariah' && a.is_syariah !== true) return false;
    if (!isPorto && q) {
      const hay = `${(a.symbol || '').toUpperCase()} ${(a.name || '').toUpperCase()}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const noAnalysis = isPorto && Array.isArray(mySymbols)
    ? mySymbols.filter((s) => !items.some((a) => (a.symbol || '').toUpperCase() === s)).sort()
    : [];

  // Urutan tampil: A-Z default; jika sortBy aktif → urut metrik (yang kosong di bawah)
  const metric = sortBy === 'overall' ? OVERALL_METRIC : (sortBy ? FUND_METRICS.find((m) => m.key === sortBy) : null);
  const fval = (a) => {
    if (!metric) return null;
    const sym = (a.symbol || '').toUpperCase();
    if (metric.key === 'overall') { const v = overallScores[sym]; return v == null ? null : Number(v); }
    return toNum(funds[sym] ? funds[sym][metric.key] : null);
  };
  const ordered = metric
    ? [...shown].sort((a, b) => {
        const va = fval(a), vb = fval(b);
        if (va == null && vb == null) return a.symbol.localeCompare(b.symbol);
        if (va == null) return 1;
        if (vb == null) return -1;
        return metric.dir === 'asc' ? va - vb : vb - va;
      })
    : [...shown].sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <div className="fade-up" style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 6 }}>Analisis</h2>
      <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
        Analisis emiten IDX oleh AI - model bisnis, katalis, dan risiko. Diskusikan di kolom komentar tiap analisis.
      </p>

      {/* Sub-tab: Umum / Saham Kamu */}
      <div style={{ display: 'inline-flex', gap: 4, background: C.cream2, borderRadius: 100, padding: 3, marginBottom: 18 }}>
        {[['umum', 'Analisis Umum'], ['porto', 'Saham Kamu'], ['backtest', 'Backtest']].map(([k, lbl]) => (
          <button key={k} onClick={() => setPage(k)}
            style={{ border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 100, background: page === k ? C.forest : 'transparent', color: page === k ? C.cream : C.inkSoft }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Filter Semua | Syariah (ISSI) - di Analisis Umum & Saham Kamu; pencarian hanya di Umum */}
      {(page === 'umum' || page === 'porto') && (
        <div style={{ marginBottom: 18 }}>
          {page === 'umum' && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.inkSoft, pointerEvents: 'none' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari emiten (kode atau nama)…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 34px', borderRadius: 100, border: 'none', background: C.cream2, fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit' }} />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Hapus pencarian"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', alignItems: 'center', padding: 4 }}>
                <X size={15} />
              </button>
            )}
          </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {['Semua', 'Syariah'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100,
                  background: filter === f ? 'rgba(31,59,45,0.08)' : 'transparent',
                  border: `1px solid ${filter === f ? C.forest : 'rgba(58,74,64,0.25)'}`,
                  color: filter === f ? C.forest : C.inkSoft }}>
                {f}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="mono" style={{ fontSize: 9, color: C.inkSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>Urutkan · indikator fundamental</span>
              <span style={{ padding: '2px 7px', borderRadius: 100, background: C.cream2, color: C.inkSoft, fontSize: 8.5, letterSpacing: '0.05em', fontWeight: 700 }}>DATA PUBLIK · YAHOO{fundsUpdated ? ` · PER ${fmtDate(fundsUpdated).toUpperCase()}` : ''}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[...FUND_METRICS, OVERALL_METRIC].map((m) => (
                <button key={m.key} onClick={() => setSortBy(sortBy === m.key ? null : m.key)}
                  title={m.key === 'overall' ? 'Urutkan: skor Overall (ringkasan 4 metrik, tertinggi dulu)' : `Urutkan: ${m.label} (${m.dir === 'asc' ? 'terkecil dulu' : 'terbesar dulu'})`}
                  style={{ cursor: 'pointer', fontSize: 11, fontWeight: m.key === 'overall' ? 700 : 600, padding: '6px 12px', borderRadius: 100,
                    background: sortBy === m.key ? C.cuan : 'transparent',
                    border: `1px solid ${sortBy === m.key ? C.cuan : 'rgba(58,74,64,0.25)'}`,
                    color: sortBy === m.key ? '#fff' : C.inkSoft }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 11, color: C.inkSoft, marginTop: 8 }}>
            {shown.length} analisis{filter === 'Syariah' ? ' · emiten dalam indeks ISSI' : ''}{q && !isPorto ? ` · hasil "${query.trim()}"` : ''}{metric ? ` · urut ${metric.label} (${metric.key === 'overall' ? 'tertinggi dulu' : (metric.dir === 'asc' ? 'terkecil dulu' : 'terbesar dulu')})` : ''}
          </p>
        </div>
      )}

      {page === 'backtest' && !userId ? (
        <div style={{ background: C.cream2, borderRadius: 18, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 14, lineHeight: 1.55 }}>
            Masuk untuk menggunakan Backtest — uji strategi SMA dengan Python engine, gratis untuk member.
          </p>
          <button onClick={onRequireLogin}
            style={{ background: C.forest, color: C.cream, border: 'none', padding: '10px 20px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Masuk / Daftar
          </button>
        </div>
      ) : page === 'backtest' ? (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 14, padding: '12px 0' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Memuat Backtest…</div>}>
          <Backtest userId={userId} />
        </Suspense>
      ) : isPorto && !userId ? (
        <div style={{ background: C.cream2, borderRadius: 18, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 14, lineHeight: 1.55 }}>
            Masuk untuk melihat analisis khusus saham-saham di portofoliomu.
          </p>
          <button onClick={onRequireLogin}
            style={{ background: C.forest, color: C.cream, border: 'none', padding: '10px 20px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Masuk / Daftar
          </button>
        </div>
      ) : loading || (isPorto && mySymbols === null) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 14 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Memuat analisis...
        </div>
      ) : isPorto && Array.isArray(mySymbols) && mySymbols.length === 0 ? (
        <div style={{ fontSize: 14, color: C.inkSoft }}>
          Portofoliomu masih kosong. Tambahkan saham di tab <strong style={{ color: C.ink }}>Portofolio</strong>, lalu analisis yang relevan akan muncul di sini.
        </div>
      ) : shown.length === 0 && !isPorto ? (
        <div style={{ fontSize: 14, color: C.inkSoft }}>
          {q ? `Tidak ada analisis yang cocok dengan "${query.trim()}".` : (filter === 'Syariah' ? 'Belum ada analisis untuk emiten syariah' : 'Belum ada analisis yang dipublikasikan.')}
        </div>
      ) : (
        <div>
          {isPorto && shown.length === 0 && (
            <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 12 }}>Belum ada analisis untuk saham di portofoliomu — daftar emitennya ada di bawah, akan kami prioritaskan.</div>
          )}
          {metric && metric.key === 'overall' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {ordered.map((a) => {
              const v = fval(a);
              const pct = v == null ? 0 : Math.max(2, Math.min(100, v));
              return (
              <button
                key={a.symbol}
                title={a.name}
                onClick={() => { listScrollY.current = window.scrollY; setOpen(a.symbol); supabase.rpc('increment_analysis_view', { p_symbol: a.symbol }); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: '100%' }}
              >
                <span className="mono" style={{ width: 62, flexShrink: 0, textAlign: 'center', fontSize: 12, fontWeight: 700, color: C.ink, letterSpacing: '0.04em', background: C.cream2, borderRadius: 8, padding: '8px 0' }}>{a.symbol}</span>
                <span style={{ flex: 1, position: 'relative', height: 30, background: C.cream2, borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${C.sage}, ${C.forest})`, borderRadius: 8 }} />
                </span>
                <span className="mono" style={{ width: 30, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: v == null ? C.inkSoft : C.ink }}>{v == null ? '—' : v}</span>
              </button>
              );
            })}
          </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
            {ordered.map((a) => {
              const v = metric ? fval(a) : null;
              const disp = !metric ? null : (v == null ? '—' : `${fmtNum(v)}${metric.unit}`);
              return (
              <button
                key={a.symbol}
                title={a.name}
                onClick={() => { listScrollY.current = window.scrollY; setOpen(a.symbol); supabase.rpc('increment_analysis_view', { p_symbol: a.symbol }); }}
                className="mono"
                style={{ width: '100%', textAlign: 'center', background: C.cream2, border: 'none', borderRadius: metric ? 12 : 100, padding: metric ? '7px 0' : '9px 0', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '0.04em' }}>{a.symbol}</span>
                {metric && <span style={{ fontSize: 10, fontWeight: 600, color: disp === '—' ? C.inkSoft : C.forest }}>{disp}</span>}
              </button>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* Saham di portofolio yang belum ada analisisnya */}
      {isPorto && userId && noAnalysis.length > 0 && (
        <div style={{ marginTop: 16, background: C.cream2, borderRadius: 18, padding: 18 }}>
          <div className="mono" style={{ fontSize: 10, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Belum ada analisis</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {noAnalysis.map((s) => (
              <span key={s} className="mono" style={{ fontSize: 12, fontWeight: 600, background: C.cream, borderRadius: 100, padding: '6px 12px', color: C.inkSoft }}>{s}</span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: C.inkSoft, marginTop: 10, lineHeight: 1.5 }}>Analisis untuk emiten di atas sedang disiapkan.</p>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 14, background: 'rgba(192,57,43,0.08)', borderRadius: 12, fontSize: 12, color: C.red, lineHeight: 1.5 }}>
        &#9432; Analisis AI bersifat edukatif berdasarkan data publik, <strong style={{ color: C.red }}>bukan rekomendasi beli/jual</strong>. Keputusan investasi sepenuhnya tanggung jawab kamu.
      </div>
    </div>
  );
}

export function FundamentalStrip({ symbol, funds }) {
  const sym = (symbol || '').toUpperCase();
  const f = funds ? funds[sym] : null;
  const overall = useMemo(() => (funds ? (computeOverall(funds)[sym] ?? null) : null), [funds, sym]);
  if (!f) return null;
  const items = [
    ['PER', f.per != null ? `${fmtNum(f.per)}x` : '—'],
    ['PBV', f.pbv != null ? `${fmtNum(f.pbv)}x` : '—'],
    ['ROA', f.roa != null ? `${fmtNum(f.roa)}%` : '—'],
    ['NPM', f.npm != null ? `${fmtNum(f.npm)}%` : '—'],
    ['DER', f.der != null ? `${fmtNum(f.der)}x` : '—'],
    ['Yield', f.div_yield != null ? `${fmtNum(f.div_yield)}%` : '—'],
    ['Growth EPS', f.eps_growth != null ? `${fmtNum(f.eps_growth)}%` : '—'],
    ['Overall', overall != null ? `${overall}` : '—'],
  ];
  if (!items.some(([, v]) => v !== '—')) return null; // semua kosong → jangan tampilkan strip
  return (
    <div style={{ margin: '4px 0 18px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 8 }}>
        {items.map(([label, val]) => {
          const isOverall = label === 'Overall';
          return (
          <div key={label} style={{ background: isOverall ? 'rgba(196,155,60,0.14)' : C.cream2, borderRadius: 12, padding: '10px 12px', border: isOverall ? `1px solid ${C.cuan}` : '1px solid transparent' }}>
            <div className="mono" style={{ fontSize: 9, color: isOverall ? C.cuan : C.inkSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}{isOverall ? ' /100' : ''}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: val === '—' ? C.inkSoft : C.ink }}>{val}</div>
          </div>
          );
        })}
      </div>
      <p className="mono" style={{ fontSize: 9.5, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
        PER/PBV/ROA/NPM dari data publik (Yahoo), dapat berbeda dari laporan resmi; DER/Yield/Growth EPS dihitung dari laporan keuangan resmi emiten{f.updated_at ? ` · per ${fmtDate(f.updated_at)}` : ''}. Overall = skor relatif 0–100 (rata-rata peringkat 4 metrik inti dibanding emiten lain), bukan nilai absolut. Edukatif, bukan rekomendasi.
      </p>
    </div>
  );
}

function AnalisisDetail({ a, funds, onBack, onPortfolio, userId, userName, onRequireLogin }) {
  const updated = a.updated_at && a.created_at && (new Date(a.updated_at).getTime() - new Date(a.created_at).getTime() > 60000);
  return (
    <div className="fade-up" style={{ padding: '20px 20px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Semua analisis
      </button>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 className="serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>{a.symbol}</h2>
        <span style={{ fontSize: 14, color: C.inkSoft }}>{a.name}</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: C.rust, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{a.sector}</div>
      <div className="mono" style={{ fontSize: 11, color: C.inkSoft, marginBottom: 18 }}>
        {a.created_at && <>Dibuat: {fmtDate(a.created_at)}</>}
        {updated && <> &middot; Diperbarui: {fmtDate(a.updated_at)}</>}
      </div>

      <FundamentalStrip symbol={a.symbol} funds={funds} />

      <PriceChart symbol={a.symbol} />

      {a.ringkasan && <p style={{ fontSize: 15, color: C.ink, lineHeight: 1.6, marginBottom: 18 }}>{a.ringkasan}</p>}

      <AnalysisChart chart={a.chart} />

      <Body text={a.body} />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', margin: '18px 0' }}>
        <ThesisCard kind="bull" items={a.bull || []} />
        <ThesisCard kind="bear" items={a.bear || []} />
      </div>

      <div style={{ padding: 12, background: 'rgba(196,155,60,0.1)', borderRadius: 12, fontSize: 11, color: C.inkSoft, lineHeight: 1.5, marginBottom: 24 }}>
        &#9432; Analisis AI berdasarkan data publik, bukan rekomendasi beli/jual. Angka dapat berubah.
      </div>

      <Comments symbol={a.symbol} userId={userId} userName={userName} onRequireLogin={onRequireLogin} />

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: C.cream2, border: 'none', cursor: 'pointer', color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 100 }}>
          <ChevronLeft size={16} /> Kembali ke semua analisis
        </button>
        {onPortfolio && (
          <button onClick={onPortfolio} style={{ background: C.cream2, border: 'none', cursor: 'pointer', color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 100 }}>
            <Briefcase size={15} /> Kembali ke portofolio
          </button>
        )}
      </div>
    </div>
  );
}

function Body({ text }) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);
  return (
    <div>
      {blocks.map((blk, i) => {
        const t = blk.trim();
        if (!t) return null;
        if (t.startsWith('## ')) {
          return <h3 key={i} className="serif" style={{ fontSize: 17, fontWeight: 600, margin: '18px 0 6px' }}>{t.slice(3)}</h3>;
        }
        const lines = t.split('\n');
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return (
            <ul key={i} style={{ listStyle: 'none', display: 'grid', gap: 6, margin: '4px 0' }}>
              {lines.map((l, j) => (
                <li key={j} style={{ display: 'flex', gap: 8, fontSize: 14, color: C.inkSoft, lineHeight: 1.55 }}>
                  <span style={{ color: C.cuan, flexShrink: 0 }}>&bull;</span> {l.trim().slice(2)}
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i} style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.65, marginBottom: 10 }}>{t}</p>;
      })}
    </div>
  );
}

function PriceChart({ symbol }) {
  const RANGES = [
    { key: '1mo', label: '1B' },
    { key: '3mo', label: '3B' },
    { key: '6mo', label: '6B' },
    { key: 'ytd', label: 'YTD' },
    { key: 'max', label: 'MAX' },
  ];
  const [range, setRange] = useState('ytd');
  const [showSMA, setShowSMA] = useState(false);
  const [series, setSeries] = useState(null); // null=loading, []=kosong
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    setSeries(null); setErr(false);
    fetch(`/api/history?symbols=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!active) return;
        const s = (d.history && d.history[symbol]) || [];
        setSeries(s.map((p) => ({ t: p.t, close: p.close })));
      })
      .catch(() => { if (active) { setErr(true); setSeries([]); } });
    return () => { active = false; };
  }, [symbol, range]);

  const first = series && series.length ? series[0].close : null;
  const last = series && series.length ? series[series.length - 1].close : null;
  const chg = (first && last) ? ((last - first) / first) * 100 : null;
  const up = chg != null && chg >= 0;
  const lineColor = up ? C.green : C.red;

  // SMA sederhana (trailing) dari harga penutupan; null bila data belum cukup.
  const withSMA = useMemo(() => {
    if (!series || !series.length) return series;
    const sma = (i, w) => {
      if (i + 1 < w) return null;
      let s = 0;
      for (let k = i - w + 1; k <= i; k++) s += series[k].close;
      return Math.round((s / w) * 100) / 100;
    };
    return series.map((p, i) => ({ ...p, sma20: sma(i, 20), sma50: sma(i, 50) }));
  }, [series]);

  return (
    <div style={{ background: C.cream2, borderRadius: 16, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Harga</span>
          {chg != null && (
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: lineColor }}>
              {up ? '+' : ''}{chg.toFixed(2)}%
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowSMA((v) => !v)} className="mono"
            title="Tampilkan/sembunyikan rata-rata bergerak SMA 20 & SMA 50"
            style={{
              background: showSMA ? C.cuan : 'transparent',
              color: showSMA ? C.cream : C.inkSoft,
              border: `1px solid ${showSMA ? C.cuan : 'rgba(26,42,32,0.15)'}`,
              borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
            SMA 20/50
          </button>
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRange(r.key)}
                className="mono"
                style={{
                  background: range === r.key ? C.forest : 'transparent',
                  color: range === r.key ? C.cream : C.inkSoft,
                  border: `1px solid ${range === r.key ? C.forest : 'rgba(26,42,32,0.15)'}`,
                  borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {series === null ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkSoft, fontSize: 13, gap: 8 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat harga…
        </div>
      ) : series.length === 0 ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkSoft, fontSize: 13 }}>
          {err ? 'Data harga tidak tersedia.' : 'Belum ada data harga.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={withSMA} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,42,32,0.06)" vertical={false} />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false}
              tickFormatter={(t) => {
                const d = new Date(t);
                return range === 'max'
                  ? String(d.getFullYear())
                  : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
              }}
              minTickGap={40} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={false} tickLine={false}
              width={44} tickFormatter={(v) => Number(v).toLocaleString('id-ID')} />
            <Tooltip
              labelFormatter={(t) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              formatter={(v, name) => [`Rp${Number(v).toLocaleString('id-ID')}`, name === 'sma20' ? 'SMA 20' : name === 'sma50' ? 'SMA 50' : 'Tutup']}
              contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: C.cream }} itemStyle={{ color: C.cuanBright }} />
            <Line type="monotone" dataKey="close" stroke={lineColor} strokeWidth={2} dot={false} />
            {showSMA && <Line type="monotone" dataKey="sma20" stroke={C.cuan} strokeWidth={1.5} dot={false} strokeDasharray="4 2" isAnimationActive={false} />}
            {showSMA && <Line type="monotone" dataKey="sma50" stroke="#3B6EA5" strokeWidth={1.5} dot={false} strokeDasharray="6 3" isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      )}
      {showSMA && series && series.length > 0 && (
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 10, color: C.inkSoft, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 16, height: 0, borderTop: `2px dashed ${C.cuan}` }} /> SMA 20
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 16, height: 0, borderTop: `2px dashed #3B6EA5` }} /> SMA 50
          </span>
          <span>Rata-rata bergerak sederhana harga penutupan.</span>
        </div>
      )}
      <div style={{ fontSize: 10, color: C.inkSoft, marginTop: 6 }}>Harga penutupan harian (data delayed). Bukan rekomendasi.</div>
    </div>
  );
}

function AnalysisChart({ chart }) {
  if (!chart || !Array.isArray(chart.data) || chart.data.length === 0) return null;
  return (
    <div style={{ background: C.cream2, borderRadius: 16, padding: 16, margin: '4px 0 18px' }}>
      {chart.title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{chart.title}</div>}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip
            cursor={{ fill: 'rgba(26,42,32,0.05)' }}
            contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: C.cream }}
            itemStyle={{ color: C.cuanBright }}
            formatter={(v) => [v, 'Nilai']}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chart.data.map((_, i) => <Cell key={i} fill={C.cuan} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {chart.note && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 6 }}>{chart.note}</div>}
    </div>
  );
}

function ThesisCard({ kind, items }) {
  const bull = kind === 'bull';
  const Icon = bull ? TrendingUp : TrendingDown;
  const color = bull ? C.green : C.red;
  if (!items || items.length === 0) return null;
  return (
    <div style={{ background: C.cream2, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        <Icon size={16} /> {bull ? 'Alasan optimis' : 'Risiko / hati-hati'}
      </div>
      <ul style={{ listStyle: 'none', display: 'grid', gap: 8 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: C.ink, lineHeight: 1.45 }}>
            <span style={{ color, flexShrink: 0 }}>{bull ? '\u25B2' : '\u25BC'}</span> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

// user_id akun admin resmi — komentar dari ID ini tampil dengan badge ADMIN.
// Cara isi: daftar akun admin di app, lalu di SQL Editor:
//   select id, email from auth.users where email = 'EMAIL_ADMIN_KAMU';
// salin id-nya ke daftar di bawah (bisa lebih dari satu).
const ADMIN_USER_IDS = [
  'fb34e91b-dde7-42ce-83e9-ff70a2eaf52f', // admin@sobatinvestor.com
];

function Comments({ symbol, userId, userName, onRequireLogin }) {
  const [list, setList] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('symbol', symbol)
      .order('created_at', { ascending: true });
    if (!error) setList(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [symbol]);

  // Admin yang masih memakai nama default otomatis tampil sebagai "Sobat Investor"
  const isAdminUser = ADMIN_USER_IDS.includes(userId);
  const isDefaultName = !userName || userName.indexOf('Investor-') === 0;
  const effectiveName = isAdminUser && isDefaultName ? 'Sobat Investor' : userName;

  async function saveName() {
    const v = nameInput.trim();
    if (!v) return;
    const { error } = await supabase.auth.updateUser({ data: { display_name: v } });
    if (error) alert('Gagal simpan nama: ' + error.message);
    else setEditingName(false); // sesi diperbarui otomatis → userName ikut berubah
  }

  async function post() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const author = effectiveName || 'anon';
    const { error } = await supabase.from('comments').insert({ symbol, user_id: userId, author, body: text });
    if (error) alert('Gagal kirim komentar: ' + error.message);
    else { setBody(''); await load(); }
    setBusy(false);
  }

  async function remove(id) {
    if (!confirm('Hapus komentar ini?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) alert('Gagal hapus: ' + error.message);
    else await load();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <MessageCircle size={18} color={C.forest} />
        <h3 className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Diskusi {symbol}</h3>
        <span style={{ fontSize: 12, color: C.inkSoft }}>({list.length})</span>
      </div>

      {userId ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 6 }}>
            {editingName ? (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={24}
                  placeholder="Nama tampilan"
                  style={{ border: '1px solid rgba(26,42,32,0.15)', borderRadius: 8, padding: '4px 8px', fontSize: 12, background: '#fff', color: C.ink, outline: 'none' }}
                />
                <button onClick={saveName} style={{ background: C.forest, color: C.cream, border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Simpan</button>
                <button onClick={() => setEditingName(false)} style={{ background: 'transparent', border: 'none', color: C.inkSoft, fontSize: 12, cursor: 'pointer' }}>Batal</button>
              </span>
            ) : (
              <span>
                Tampil sebagai <strong style={{ color: C.ink }}>{effectiveName}</strong>
                {ADMIN_USER_IDS.includes(userId) && (
                  <span className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', background: C.cuan, color: C.ink, borderRadius: 100, padding: '2px 8px', marginLeft: 6, verticalAlign: 'middle' }}>ADMIN</span>
                )}{' '}
                <button onClick={() => { setNameInput(userName && userName.indexOf('Investor-') === 0 ? '' : (userName || '')); setEditingName(true); }} style={{ background: 'transparent', border: 'none', color: C.forest, fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0 }}>Ubah</button>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tulis komentar atau pertanyaan..."
              rows={2}
              style={{ flex: 1, resize: 'vertical', border: '1px solid rgba(26,42,32,0.15)', borderRadius: 12, padding: '10px 12px', fontSize: 14, background: '#fff', color: C.ink, outline: 'none' }}
            />
            <button
              onClick={post}
              disabled={busy || !body.trim()}
              style={{ alignSelf: 'flex-end', background: busy || !body.trim() ? 'rgba(31,59,45,0.4)' : C.forest, color: C.cream, border: 'none', borderRadius: 12, padding: '10px 14px', cursor: busy || !body.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
            >
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Kirim
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: C.cream2, borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
          <span style={{ fontSize: 13, color: C.inkSoft }}>Masuk untuk ikut berdiskusi.</span>
          <button
            onClick={() => onRequireLogin && onRequireLogin()}
            style={{ background: C.forest, color: C.cream, border: 'none', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Masuk
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 13 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat komentar...
        </div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkSoft }}>Belum ada komentar. Jadilah yang pertama memulai diskusi.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((c) => {
            const isAdmin = ADMIN_USER_IDS.includes(c.user_id);
            return (
            <div key={c.id} style={{ background: C.cream2, borderRadius: 14, padding: '12px 14px', border: isAdmin ? `1.5px solid ${C.cuan}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {c.author || 'anon'}
                  {isAdmin && (
                    <span className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', background: C.cuan, color: C.ink, borderRadius: 100, padding: '2px 8px' }}>ADMIN</span>
                  )}
                </span>
                <span className="mono" style={{ fontSize: 10, color: C.inkSoft }}>{fmtTime(c.created_at)}</span>
              </div>
              <p style={{ fontSize: 14, color: C.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</p>
              {c.user_id === userId && (
                <button onClick={() => remove(c.id)} style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: C.rust, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
                  <Trash2 size={12} /> Hapus
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
