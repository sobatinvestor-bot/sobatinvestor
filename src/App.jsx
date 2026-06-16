import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Send, Home, BarChart3, Sparkles, Briefcase, Download, Upload, Loader2, Lock, LogOut, Plus, Pencil, Trash2, FileText, Minus } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Auth, usePortfolio, Editor, logout, SellEditor, RdnCard, StockNews, parseSobatCSV } from './Account.jsx';
const AnalisisTab = lazy(() => import('./Analisis.jsx'));
const PerfChart = lazy(() => import('./DashboardCharts.jsx').then((m) => ({ default: m.PerfChart })));
const SectorPie = lazy(() => import('./DashboardCharts.jsx').then((m) => ({ default: m.SectorPie })));

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

const initialStocks = [
  { symbol: 'BBCA', name: 'Bank Central Asia', price: 10275, change: 1.24, qty: 100, avg: 9800, sector: 'Banking' },
  { symbol: 'BBRI', name: 'Bank Rakyat Indonesia', price: 4820, change: -0.41, qty: 500, avg: 4950, sector: 'Banking' },
  { symbol: 'TLKM', name: 'Telkom Indonesia', price: 2890, change: 0.69, qty: 1000, avg: 2750, sector: 'Telecom' },
  { symbol: 'ASII', name: 'Astra International', price: 5125, change: 2.15, qty: 200, avg: 4800, sector: 'Consumer' },
  { symbol: 'GOTO', name: 'GoTo Gojek Tokopedia', price: 68, change: -1.45, qty: 10000, avg: 75, sector: 'Tech' },
  { symbol: 'BMRI', name: 'Bank Mandiri', price: 6800, change: 1.87, qty: 150, avg: 6200, sector: 'Banking' },
  { symbol: 'UNVR', name: 'Unilever Indonesia', price: 2150, change: 0.93, qty: 300, avg: 2100, sector: 'Consumer' },
];

const fmtRp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const ADMIN_UID = 'fb34e91b-dde7-42ce-83e9-ff70a2eaf52f';

// Menangkap error render agar satu komponen bermasalah tidak memblank seluruh app.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('App error:', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 20, margin: 16, background: C.cream, borderRadius: 16, color: C.ink, fontFamily: 'inherit' }}>
          <div className="serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Ada bagian yang gagal dimuat</div>
          <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 12 }}>
            Coba muat ulang halaman. Jika masih bermasalah, detail teknis di bawah membantu perbaikan.
          </div>
          <pre style={{ fontSize: 11, color: C.rust, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: C.cream2, padding: 12, borderRadius: 10, margin: 0 }}>
            {String(this.state.err && this.state.err.message || this.state.err)}
          </pre>
          <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: C.forest, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>Muat ulang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = masih cek
  const [tab, setTab] = useState('home');
  const [analisisPage, setAnalisisPage] = useState(null); // permintaan buka page tertentu di tab Analisis
  const [analisisSymbol, setAnalisisSymbol] = useState(null); // permintaan buka analisis emiten tertentu

  function goTo(tabId, page) {
    setAnalisisPage(page || null);
    setTab(tabId);
  }
  const goAnalisis = (sym) => { if (!sym) return; setAnalisisSymbol(sym.toUpperCase()); setTab('analisis'); };
  const [market, setMarket] = useState({ quotes: [], ihsg: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Data pasar publik (ticker Beranda + IHSG di header) — tanpa login
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/quotes');
        if (!res.ok) return;
        const data = await res.json();
        if (active) setMarket({ quotes: data.quotes || [], ihsg: data.ihsg || null });
      } catch (e) { console.error(e); }
    }
    load();
    const id = setInterval(load, 60000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (session === undefined) {
    return (
      <div style={{ background: C.cream, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkSoft }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const ihsg = market.ihsg ? market.ihsg.value : 7800;
  const ihsgChange = market.ihsg ? market.ihsg.change : 0;
  const publicTabs = ['home', 'analisis'];
  const isPrivateTab = !publicTabs.includes(tab);

  return (
    <div style={{ background: C.cream, minHeight: '100vh', color: C.ink }}>
      <Nav ihsg={ihsg} ihsgChange={ihsgChange} session={session} setTab={setTab} tab={tab} />
      <div style={{ paddingBottom: 100 }}>
        <div style={{ display: tab === 'home' ? 'block' : 'none' }}>
          <HomeTab stocks={market.quotes} setTab={setTab} goTo={goTo} />
        </div>
        <div style={{ display: tab === 'analisis' ? 'block' : 'none' }}>
          <Suspense fallback={<div style={{ padding: '40px 20px', textAlign: 'center', color: C.inkSoft, fontSize: 13 }}>Memuat analisis…</div>}>
            <AnalisisTab
              userId={session ? session.user.id : null}
              userName={session ? (session.user.user_metadata && session.user.user_metadata.display_name ? session.user.user_metadata.display_name : 'Investor-' + session.user.id.slice(0, 4)) : null}
              onRequireLogin={() => setTab('portfolio')}
              initialPage={analisisPage}
              onPageConsumed={() => setAnalisisPage(null)}
              initialSymbol={analisisSymbol}
              onSymbolConsumed={() => setAnalisisSymbol(null)}
              onGoPortfolio={() => setTab('portfolio')}
            />
          </Suspense>
        </div>
        {isPrivateTab && !session && <Auth inline />}
        {session && (
          <div style={{ display: isPrivateTab ? 'block' : 'none' }}>
            <ErrorBoundary>
              <PrivateArea tab={tab} userId={session.user.id} ihsgQuote={market.ihsg} goAnalisis={goAnalisis} />
            </ErrorBoundary>
          </div>
        )}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// Area privat (hanya saat sudah login): Dashboard, Sobat AI, Portfolio
function PrivateArea({ tab, userId, ihsgQuote, goAnalisis }) {
  const { stocks, addHolding, updateHolding, deleteHolding, deleteAll, sellHolding, settings, adjustRdn, saveFees, exportCSV, importData } = usePortfolio(userId);
  const [editing, setEditing] = useState(null);
  const [selling, setSelling] = useState(null);

  function handleSave(h) {
    if (h.id) updateHolding(h); else addHolding(h);
    setEditing(null);
  }

  return (
    <>
      <div style={{ display: tab === 'portfolio' ? 'block' : 'none' }}>
        <DashboardTab stocks={stocks} ihsgQuote={ihsgQuote} />
        <div id="sec-saham" style={{ scrollMarginTop: 70 }}>
          <PortfolioTab
            stocks={stocks}
            onAdd={() => setEditing({})}
            onEdit={(s) => setEditing(s)}
            onDelete={deleteHolding}
            onSell={(s) => setSelling(s)}
            onExport={exportCSV}
            onImport={importData}
            onSymbol={goAnalisis}
          />
        </div>
        <div id="sec-rdn" style={{ scrollMarginTop: 70 }}><RdnCard settings={settings} onAdjust={adjustRdn} onSaveFees={saveFees} userId={userId} /></div>
        {(stocks.length > 0 || Number(settings.rdn) !== 0) && <DeleteAllPortfolio count={stocks.length} onDeleteAll={deleteAll} />}
        <div id="sec-berita" style={{ scrollMarginTop: 70 }}><StockNews stocks={stocks} /></div>
        {userId === ADMIN_UID && <div id="sec-admin" style={{ scrollMarginTop: 70 }}><DividendAdmin userId={userId} /></div>}
      </div>
      <ChatTab stocks={stocks} active={tab === 'chat'} />
      {editing && <Editor holding={editing} onSave={handleSave} onClose={() => setEditing(null)} />}
      {selling && <SellEditor holding={selling} onSell={sellHolding} onClose={() => setSelling(null)} fees={settings} />}
    </>
  );
}

export function Nav({ ihsg, ihsgChange, session, setTab, tab }) {
  return (
    <div style={{ borderBottom: `1px solid rgba(26,42,32,0.08)`, background: 'rgba(244,239,230,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse-dot" style={{ width: 9, height: 9, borderRadius: '50%', background: C.cuan, display: 'inline-block' }} />
          sobat<span style={{ color: C.cuan, fontWeight: 700 }}>.</span>investor
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {session && tab === 'portfolio' && (
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[['sec-saham', 'Saham'], ['sec-dividen', 'Dividen'], ['sec-rdn', 'RDN'], ['sec-berita', 'Berita'], ...((session && session.user && session.user.id === ADMIN_UID) ? [['sec-admin', 'Admin']] : [])].map(([id, lbl]) => (
                <button key={id} onClick={() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  className="mono"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, fontSize: 11, fontWeight: 600, padding: '4px 7px', borderRadius: 100, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {lbl}
                </button>
              ))}
            </div>
          )}
          <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.inkSoft }}>
            <span style={{ fontWeight: 600, color: C.ink }}>{ihsg.toFixed(2)}</span>
            <span style={{ color: ihsgChange >= 0 ? C.green : C.red, fontWeight: 600 }}>{fmtPct(ihsgChange)}</span>
          </div>
          {session ? (
            <button onClick={logout} title="Keluar"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'flex', alignItems: 'center' }}>
              <LogOut size={16} />
            </button>
          ) : (
            <button onClick={() => setTab('portfolio')}
              style={{ background: C.forest, color: C.cream, border: 'none', padding: '7px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Masuk
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { id: 'home', label: 'Beranda', icon: Home },
    { id: 'analisis', label: 'Analisis', icon: FileText },
    { id: 'portfolio', label: 'Portofolio', icon: Briefcase },
    { id: 'chat', label: 'Sobat AI', icon: Sparkles },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(244,239,230,0.95)', backdropFilter: 'blur(12px)', borderTop: `1px solid rgba(26,42,32,0.1)`, zIndex: 50 }}>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 8px', maxWidth: 600, margin: '0 auto' }}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                background: active ? C.forest : 'transparent',
                color: active ? C.cream : C.inkSoft,
                border: 'none',
                padding: '8px 14px',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                transition: 'all 0.2s',
                minWidth: 64,
              }}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HomeTab({ stocks, setTab, goTo }) {
  return (
    <div className="fade-up">
      <div style={{ padding: '40px 20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.cream2, padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500, color: C.inkSoft, marginBottom: 20 }}>
          <span style={{ color: C.rust, fontWeight: 700 }}>●</span> Live • Powered by AI
        </div>
        <h1 className="serif" style={{ fontSize: 'clamp(38px, 7.5vw, 72px)', lineHeight: 1.05, letterSpacing: '-0.03em', fontWeight: 500, marginBottom: 20 }}>
          Sobat AI,{' '}
          <em style={{ color: C.forest, fontStyle: 'italic', backgroundImage: `linear-gradient(transparent 70%, ${C.cuan}66 70%)`, WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone', paddingBottom: 1 }}>
            asisten saham pribadimu
          </em>
        </h1>
        <p style={{ fontSize: 17, color: C.inkSoft, lineHeight: 1.55, maxWidth: 540, marginBottom: 28 }}>
          Analisis saham IDX. Tanya apa aja, dapat insight berbasis data — bukan tebak-tebakan.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setTab('chat')}
            style={{ background: C.forest, color: C.cream, padding: '14px 24px', borderRadius: 100, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Sparkles size={16} /> Ngobrol sama Sobat
          </button>
          <button
            onClick={() => setTab('portfolio')}
            style={{ background: 'transparent', color: C.ink, padding: '14px 24px', borderRadius: 100, border: `1.5px solid rgba(26,42,32,0.15)`, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Lihat Portofolio →
          </button>
        </div>
      </div>

      <div style={{ background: C.ink, color: C.cream, padding: '14px 0', overflow: 'hidden', margin: '20px', borderRadius: 14 }}>
        <div className="ticker-track mono" style={{ display: 'flex', gap: 36, whiteSpace: 'nowrap', fontSize: 13 }}>
          {[...stocks, ...stocks].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontWeight: 600 }}>{s.symbol}</span>
              <span style={{ color: 'rgba(244,239,230,0.6)' }}>{Math.round(s.price).toLocaleString('id-ID')}</span>
              <span style={{ color: s.change >= 0 ? '#6BCF8F' : '#F47766', fontWeight: 600 }}>
                {s.change >= 0 ? '▲' : '▼'} {Math.abs(s.change).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '40px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', color: C.rust, marginBottom: 12, fontWeight: 500 }}>
          // Empat alat, satu sobat
        </div>
        <h2 className="serif" style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05, marginBottom: 32 }}>
          Cara baru ngerti{' '}
          <em style={{ color: C.forest }}>pasar saham.</em>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {[
            { num: '01', title: 'Backtest', desc: 'Backtest strategi SMA dengan Python asli yang jalan di browser-mu. Data harga & dividen IDX real — khusus member.', bg: C.forest, fg: C.cream, tab: 'analisis', page: 'backtest' },
            { num: '02', title: 'Analisis AI', desc: 'Analisis emiten oleh AI: model bisnis, katalis, dan risiko. Plus halaman khusus saham di portofoliomu.', bg: C.cream2, fg: C.ink, tab: 'analisis' },
            { num: '03', title: 'Export & Import', desc: 'Export portofolio + RDN ke CSV untuk laporan di Excel — atau impor untuk memulihkan seluruh data kapan saja.', bg: C.cream2, fg: C.ink, tab: 'portfolio' },
            { num: '04', title: 'Live Dashboard', desc: 'P/L live, alokasi sektor, dan proyeksi dividen 12 bulan di satu layar.', bg: C.cream2, fg: C.ink, tab: 'portfolio' },
          ].map((f) => (
            <button
              key={f.num}
              onClick={() => (goTo ? goTo(f.tab, f.page) : setTab(f.tab))}
              style={{ textAlign: 'left', background: f.bg, color: f.fg, padding: 24, borderRadius: 20, border: `1px solid rgba(26,42,32,0.05)`, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div className="mono" style={{ fontSize: 11, opacity: 0.6, marginBottom: 16, letterSpacing: '0.1em' }}>{f.num} /</div>
              <h3 className="serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 8, letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.55 }}>{f.desc}</p>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 14, opacity: 0.85 }}>Coba sekarang →</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PerfTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: C.ink, borderRadius: 8, padding: '8px 11px', fontSize: 12 }}>
      <div style={{ color: C.cream, marginBottom: 3 }}>{p.label}</div>
      <div style={{ color: C.cuanBright, fontWeight: 600 }}>{fmtRp(p.value)}</div>
      {p.pct != null && (
        <div style={{ color: p.pct >= 0 ? '#6BCF8F' : '#F47766', fontWeight: 600, marginTop: 2 }}>
          Porto {fmtPct(p.pct)}
        </div>
      )}
      {p.ihsgPct != null && (
        <div style={{ color: 'rgba(244,239,230,0.7)', marginTop: 2 }}>
          IHSG {fmtPct(p.ihsgPct)}
        </div>
      )}
    </div>
  );
}

function DashboardTab({ stocks, ihsgQuote }) {
  const ihsgChange = ihsgQuote && typeof ihsgQuote.change === 'number' ? ihsgQuote.change : null;
  const ihsgLive = ihsgQuote && typeof ihsgQuote.value === 'number' ? ihsgQuote.value : null;
  const totalValue = stocks.reduce((sum, s) => sum + s.price * s.qty, 0);
  const totalCost = stocks.reduce((sum, s) => sum + s.avg * s.qty, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost ? (totalPL / totalCost) * 100 : 0;

  // Pilihan rentang grafik
  const [range, setRange] = useState('30d'); // '30d' | 'ytd'

  // Data dividen + harga historis untuk grafik
  const symKey = stocks.map((s) => s.symbol).join(',');
  const [rawDiv, setRawDiv] = useState([]);
  const [hist, setHist] = useState({});
  useEffect(() => {
    if (!symKey) { setRawDiv([]); setHist({}); return; }
    let active = true;
    const histRange = range === 'ytd' ? 'ytd' : '2mo';
    fetch(`/api/dividends?symbols=${encodeURIComponent(symKey)}&range=1y`)
      .then((r) => (r.ok ? r.json() : { dividends: [] }))
      .then((d) => { if (active) setRawDiv(d.dividends || []); })
      .catch(() => {});
    fetch(`/api/history?symbols=${encodeURIComponent(symKey + ',^JKSE')}&range=${histRange}`)
      .then((r) => (r.ok ? r.json() : { history: {} }))
      .then((d) => { if (active) setHist(d.history || {}); })
      .catch(() => {});
    return () => { active = false; };
  }, [symKey, range]);

  // Masa lalu = harga historis asli; masa depan (30 hari) = harga terakhir (datar) + dividen.
  const DAY = 86400000;
  const OFFSET_DAYS = 21;
  const FUTURE_DAYS = 30;
  const qtyMap = {};
  const priceMap = {};
  const buyMap = {};
  stocks.forEach((s) => {
    qtyMap[s.symbol] = s.qty;
    priceMap[s.symbol] = s.price;
    buyMap[s.symbol] = s.buyDate ? new Date(s.buyDate).getTime() : 0;
  });

  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const todayTime = midnight.getTime();
  // hari kerja (trading day) sebelumnya dari data harian (untuk mode 1 hari)
  const refSeries = (hist['^JKSE'] && hist['^JKSE'].length >= 2)
    ? hist['^JKSE']
    : stocks.map((s) => hist[s.symbol]).find((se) => se && se.length >= 2);
  const prevTradingT = (refSeries && refSeries.length >= 2)
    ? Math.floor(refSeries[refSeries.length - 2].t / DAY) * DAY
    : todayTime - 3 * DAY;
  const startTime = range === 'ytd'
    ? new Date(midnight.getFullYear(), 0, 1).getTime()
    : range === '1d'
      ? prevTradingT
      : todayTime - 30 * DAY;
  const endTime = todayTime + FUTURE_DAYS * DAY;

  // harga penutupan historis terdekat (<= t) per simbol; fallback ke harga live
  function closeAt(sym, t) {
    const series = hist[sym];
    if (!series || !series.length) return priceMap[sym] || 0;
    const tDay = Math.floor(t / DAY);
    let c = series[0].close;
    for (let k = 0; k < series.length; k++) {
      if (Math.floor(series[k].t / DAY) <= tDay) c = series[k].close; else break;
    }
    return c;
  }

  const divEvents = rawDiv
    .map((d) => {
      const exTime = new Date(d.exDate).getTime();
      const owned = exTime >= (buyMap[d.symbol] || 0); // dividen hanya jika sudah dipegang saat ex-date
      return {
        payTime: exTime + OFFSET_DAYS * DAY,
        cash: owned ? d.amount * (qtyMap[d.symbol] || 0) : 0,
      };
    })
    .filter((e) => e.cash > 0 && e.payTime >= startTime && e.payTime <= endTime);

  const fmtShort = (t) => new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const isDay = range === '1d';

  // 1 hari: pakai % perubahan harian dari /api/quotes (sumber sama dengan ticker IHSG)
  let tVal = 0, yVal = 0;
  stocks.forEach((s) => {
    const today = s.price * s.qty;
    const prev = (typeof s.change === 'number' && s.change > -100) ? (s.price / (1 + s.change / 100)) * s.qty : today;
    tVal += today; yVal += prev;
  });
  const portOneDay = yVal > 0 ? (tVal / yVal - 1) * 100 : null;
  const ihsgOneDay = (typeof ihsgChange === 'number') ? ihsgChange : null;

  let perfData, todayIdx, todayLabel, curPct, ihsgPeriodPct, hasIhsg;

  if (isDay) {
    // Kemarin → hari ini (dari quotes) + proyeksi 30 hari (datar + dividen)
    hasIhsg = ihsgOneDay != null;
    const ihsgEnd = yVal * (1 + (ihsgOneDay || 0) / 100);
    const pts = [{ label: 'Kemarin', value: yVal || null, pct: 0, ihsg: hasIhsg ? yVal : null, ihsgPct: 0 }];
    for (let i = 0; i <= FUTURE_DAYS; i++) {
      const t = todayTime + i * DAY;
      const cumDiv = divEvents.filter((e) => e.payTime <= t).reduce((s, e) => s + e.cash, 0);
      const value = tVal + cumDiv;
      pts.push({
        label: i === 0 ? 'Hari ini' : fmtShort(t),
        value: value || null,
        pct: yVal > 0 ? (value / yVal - 1) * 100 : null,
        ihsg: hasIhsg ? ihsgEnd : null,
        ihsgPct: ihsgOneDay,
      });
    }
    perfData = pts;
    todayIdx = 1;
    todayLabel = 'Hari ini';
    curPct = portOneDay;
    ihsgPeriodPct = ihsgOneDay;
  } else {
    // 30 hari / YTD: dari harga penutupan historis harian
    const totalDays = Math.round((endTime - startTime) / DAY) + 1;
    hasIhsg = !!(hist['^JKSE'] && hist['^JKSE'].length);
    let valueStart = 0, ihsgStart = 0, baseSet = false;
    for (let i = 0; i < totalDays; i++) {
      const t = startTime + i * DAY;
      let v = 0;
      stocks.forEach((s) => {
        if (t < (buyMap[s.symbol] || 0)) return;
        const px = t < todayTime ? closeAt(s.symbol, t) : (priceMap[s.symbol] || 0);
        v += px * s.qty;
      });
      if (v > 0) { valueStart = v; ihsgStart = hasIhsg ? closeAt('^JKSE', t) : 0; baseSet = true; break; }
    }
    perfData = Array.from({ length: totalDays }, (_, i) => {
      const t = startTime + i * DAY;
      let base = 0;
      stocks.forEach((s) => {
        if (t < (buyMap[s.symbol] || 0)) return;
        const px = t < todayTime ? closeAt(s.symbol, t) : (priceMap[s.symbol] || 0);
        base += px * s.qty;
      });
      const cumDiv = divEvents.filter((e) => e.payTime <= t).reduce((s, e) => s + e.cash, 0);
      const value = base + cumDiv;
      // pct portofolio = price-return MURNI (tanpa dividen) agar setara dgn IHSG
      // yang juga price-return. Dividen tetap masuk ke `value` (Rupiah & grafik).
      const pct = (baseSet && valueStart > 0 && base > 0) ? ((base / valueStart) - 1) * 100 : null;
      let ihsg = null, ihsgPct = null;
      if (hasIhsg && ihsgStart > 0 && baseSet) {
        const idx = (t >= todayTime && ihsgLive != null) ? ihsgLive : closeAt('^JKSE', t);
        ihsg = valueStart * (idx / ihsgStart);
        ihsgPct = (idx / ihsgStart - 1) * 100;
      }
      return { label: fmtShort(t), value: value || null, pct, ihsg, ihsgPct };
    });
    todayIdx = Math.round((todayTime - startTime) / DAY);
    todayLabel = perfData[todayIdx] ? perfData[todayIdx].label : fmtShort(todayTime);
    const tp = perfData[todayIdx] || perfData[perfData.length - 1];
    curPct = tp ? tp.pct : null;
    ihsgPeriodPct = tp ? tp.ihsgPct : null;
  }

  const totalDivWindow = divEvents.reduce((s, e) => s + e.cash, 0);
  const portShown = isDay ? portOneDay : curPct;
  const ihsgShown = isDay ? ihsgOneDay : ihsgPeriodPct;
  const periodLabel = isDay ? '1 hari' : 'periode';

  const sectorMap = {};
  stocks.forEach((s) => {
    const val = s.price * s.qty;
    sectorMap[s.sector] = (sectorMap[s.sector] || 0) + val;
  });
  const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value }));
  const sectorColors = [C.forest, C.cuan, C.rust, C.sage, C.inkSoft];

  const sortedByChange = [...stocks].sort((a, b) => b.change - a.change);
  const gainers = sortedByChange.slice(0, 3);
  const losers = sortedByChange.slice(-3).reverse();

  return (
    <div className="fade-up" style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 20 }}>Ringkasan</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="PORTFOLIO" value={fmtRp(totalValue)} sub={fmtPct(totalPLPct)} positive={totalPL >= 0} highlight />
        <StatCard label="UNREALIZED P/L" value={fmtRp(totalPL)} sub={`dari ${fmtRp(totalCost)}`} positive={totalPL >= 0} />
        <StatCard label="HOLDINGS" value={stocks.length.toString()} sub="emiten aktif" />
      </div>

      <div style={{ background: C.cream2, borderRadius: 20, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Nilai Portofolio</h3>
            {portShown != null && (
              <div style={{ fontSize: 13, marginTop: 2 }}>
                <span style={{ fontWeight: 600, color: portShown >= 0 ? C.green : C.red }}>Porto {fmtPct(portShown)}</span>
                {ihsgShown != null && <>{' · '}<span style={{ fontWeight: 600, color: ihsgShown >= 0 ? C.green : C.red }}>IHSG {fmtPct(ihsgShown)}</span></>}
                <span style={{ color: C.inkSoft, fontWeight: 500 }}> · {periodLabel}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, background: C.cream, borderRadius: 100, padding: 3 }}>
            {[['1d', '1 Hari'], ['30d', '30 Hari'], ['ytd', 'YTD']].map(([k, lbl]) => (
              <button key={k} onClick={() => setRange(k)}
                style={{ border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 100, background: range === k ? C.forest : 'transparent', color: range === k ? C.cream : C.inkSoft }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <Suspense fallback={<div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkSoft, fontSize: 12 }}>memuat grafik…</div>}>
          <PerfChart perfData={perfData} todayLabel={todayLabel} hasIhsg={hasIhsg} />
        </Suspense>
        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
          Kiri "Hari ini" = harga historis asli tiap saham. Kanan = proyeksi datar di harga terakhir. Garis putus-putus = IHSG (disetarakan ke nilai awal). Lonjakan = dividen masuk (perkiraan tgl bayar).{totalDivWindow > 0 ? ` Total dividen di jendela ini: ${fmtRp(totalDivWindow)}.` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.cream2, borderRadius: 20, padding: 20 }}>
          <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Alokasi Sektor</h3>
          <Suspense fallback={<div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.inkSoft, fontSize: 12 }}>memuat grafik…</div>}>
            <SectorPie sectorData={sectorData} sectorColors={sectorColors} />
          </Suspense>
          <div style={{ marginTop: 8 }}>
            {sectorData.map((s, i) => (
              <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, background: sectorColors[i], borderRadius: 2 }} />
                  {s.name}
                </span>
                <span className="mono" style={{ color: C.inkSoft }}>{((s.value / totalValue) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.cream2, borderRadius: 20, padding: 20 }}>
          <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Top Movers</h3>
          <div style={{ marginBottom: 16 }}>
            <div className="mono" style={{ fontSize: 10, color: C.green, marginBottom: 6, letterSpacing: '0.1em' }}>▲ GAINERS</div>
            {gainers.map((s) => (
              <div key={s.symbol} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{s.symbol}</span>
                <span style={{ color: C.green, fontWeight: 600 }} className="mono">{fmtPct(s.change)}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10, color: C.red, marginBottom: 6, letterSpacing: '0.1em' }}>▼ LOSERS</div>
            {losers.map((s) => (
              <div key={s.symbol} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{s.symbol}</span>
                <span style={{ color: C.red, fontWeight: 600 }} className="mono">{fmtPct(s.change)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, positive, highlight }) {
  return (
    <div style={{ background: highlight ? C.forest : C.cream2, color: highlight ? C.cream : C.ink, borderRadius: 16, padding: 18 }}>
      <div className="mono" style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
      <div className="serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: highlight ? 'rgba(244,239,230,0.7)' : (positive ? C.green : C.red), fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

// ============================================
// AI Chat - DISABLED (Member Premium placeholder)
// To re-enable: restore the original ChatTab function from git history
// ============================================
export function ChatTab({ stocks, active = true }) {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [quota, setQuota] = useState(null); // { login, admin, limit_harian, dipakai, sisa_harian }
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  async function refreshQuota() {
    try {
      const { data, error } = await supabase.rpc('ai_quota_status');
      if (!error && data) setQuota(data);
    } catch { /* abaikan */ }
  }

  // Muat sisa kuota saat tab dibuka
  useEffect(() => { if (active) refreshQuota(); }, [active]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Textarea auto-grow: tinggi menyesuaikan jumlah baris (maks ~6 baris)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setErr('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      // Token user wajib (endpoint pakai utk verifikasi kuota)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setErr('Harus login untuk pakai Sobat AI.'); setLoading(false); return; }

      // Konteks emiten: gabungan yang DIMILIKI + yang DISEBUT di pertanyaan.
      let ctx = '';
      try {
        const ownedSyms = (stocks || []).map((s) => s.symbol);
        // Deteksi kode saham dari pertanyaan:
        //  (a) kata 4 huruf DITULIS KAPITAL (mis. "PTBA"), selalu dianggap kode.
        //  (b) bila kalimat memuat kata kunci emiten (saham/emiten/kode/ticker/stock),
        //      SEMUA kata 4-huruf di kalimat jadi kandidat (kecuali kata umum),
        //      sehingga "saham ptba dan msti" menangkap ptba DAN msti.
        const upper = (text.match(/\b[A-Z]{4}\b/g) || []);
        const STOP = new Set(['YANG','ATAU','SAJA','PADA','DARI','AKAN','BISA','SUDA','APAA','MASA','BUAT','LAGI','JUGA','PUNYA','MILIK','MASU','SEKT','APAK','DLLL','TADI','GMNA','GIMA','KALO','KLAU','UNTU','PALI','SAMA','LEBI','KARE','SETE','TENT','HARU','MAUP','BAIK']);
        const hasKeyword = /\b(saham|emiten|kode|ticker|stock)\b/i.test(text);
        const byKeyword = [];
        if (hasKeyword) {
          const all = text.match(/\b[a-zA-Z]{4}\b/g) || [];
          for (const w of all) {
            const c = w.toUpperCase();
            if (!STOP.has(c) && !/^(SAHA|EMIT|KODE|TICK|STOC)$/.test(c)) byKeyword.push(c);
          }
        }
        const mentioned = [...upper, ...byKeyword];
        // Prioritas: emiten yang DISEBUT di pertanyaan dulu (itu yang user tanyakan),
        // baru emiten yang DIMILIKI. Mencegah holding banyak menggusur emiten yg ditanya
        // saat dipotong ke 12.
        const relevant = [...new Set([...mentioned, ...ownedSyms])].slice(0, 12);
        if (relevant.length) {
          // Direktori: nama, sektor, syariah
          const { data: dir } = await supabase
            .from('stock_directory').select('symbol,name,sector,is_syariah').in('symbol', relevant);
          const dirMap = {};
          (dir || []).forEach((d) => { dirMap[d.symbol] = d; });

          // Analisis terkurasi: ringkasan + angka kunci + bull/bear (hanya yang published)
          const { data: ana } = await supabase
            .from('analyses').select('symbol,name,sector,ringkasan,bull,bear,chart,updated_at')
            .in('symbol', relevant).eq('published', true);
          const anaMap = {};
          (ana || []).forEach((a) => { anaMap[a.symbol] = a; });

          const blocks = relevant.map((sym) => {
            const d = dirMap[sym] || {};
            const a = anaMap[sym];
            const nama = ((a && a.name) || d.name || sym).trim();
            const sektor = ((a && a.sector) || d.sector || '-').trim();
            const syariah = d.is_syariah === true ? 'Syariah (ISSI)' : (d.is_syariah === false ? 'non-Syariah' : 'status syariah tidak diketahui');
            let blok = `${sym} = ${nama} (sektor: ${sektor}; ${syariah})`;
            if (a) {
              const angka = a.chart && a.chart.data
                ? `${a.chart.title || 'Data'}: ` + a.chart.data.map((p) => `${p.label} ${p.value}`).join(', ')
                : '';
              const bull = Array.isArray(a.bull) ? a.bull.slice(0, 3).join('; ') : '';
              const bear = Array.isArray(a.bear) ? a.bear.slice(0, 3).join('; ') : '';
              blok += `. ANALISIS (per ${(a.updated_at || '').slice(0, 10)}): ${a.ringkasan || ''}`;
              if (angka) blok += ` Angka kunci: ${angka}.`;
              if (bull) blok += ` Positif: ${bull}.`;
              if (bear) blok += ` Risiko: ${bear}.`;
            } else {
              blok += `. (Belum ada analisis terkurasi di aplikasi untuk emiten ini.)`;
            }
            return blok;
          });
          ctx = `DATA EMITEN (sumber resmi & analisis terkurasi aplikasi — pakai HANYA info ini untuk fakta/angka, jangan menebak atau mengarang angka laporan keuangan; ini referensi internal, jangan dibacakan sebagai daftar kecuali pengguna bertanya tentang emiten tersebut):\n${blocks.join('\n')}`;
        }
      } catch { /* abaikan; AI akan jawab tanpa konteks */ }
      const payload = next.map((m, i) =>
        i === next.length - 1 && ctx ? { role: m.role, content: `${ctx}\n\n${m.content}` } : m
      );

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: payload }),
      });
      const data = await res.json();

      if (res.status === 429 || data.quota_exceeded) {
        setErr(data.error || 'Kuota Sobat AI habis. Coba lagi nanti.');
        setMessages(messages); // kembalikan, tidak hitung pesan gagal
        setLoading(false);
        refreshQuota();
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Gagal memuat jawaban');

      const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      setMessages([...next, { role: 'assistant', content: reply || '(kosong)' }]);
      refreshQuota();
    } catch (e) {
      setErr(e.message || 'Terjadi kesalahan.');
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = ['Apa itu dividen yield?', 'Jelaskan rasio PER sederhana', 'Tips diversifikasi portofolio'];

  return (
    <div className="fade-up" style={{ display: active ? 'flex' : 'none', maxWidth: 760, margin: '0 auto', padding: '24px 16px 40px', flexDirection: 'column', minHeight: 'calc(100vh - 60px - 80px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.forest, color: C.cuanBright, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="serif" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>Sobat AI</h2>
          <div style={{ fontSize: 11, color: C.inkSoft }}>Ditenagai teknologi AI pihak ketiga</div>
        </div>
        {quota && quota.login && (
          <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 100, whiteSpace: 'nowrap',
            background: C.cream2,
            color: (!quota.admin && quota.sisa_harian === 0) ? C.rust : C.inkSoft }}>
            {quota.admin ? 'Admin · tanpa batas' : `Sisa chat hari ini: ${quota.sisa_harian}/${quota.limit_harian}`}
          </div>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 0', minHeight: 240 }}>
        {messages.length === 0 && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 14 }}>
              Tanya apa saja seputar saham Indonesia, emiten, atau dividen. Sobat AI bukan pemberi nasihat keuangan — selalu riset mandiri sebelum berinvestasi.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  style={{ background: C.cream2, border: 'none', borderRadius: 100, padding: '8px 14px', fontSize: 12, color: C.ink, cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? C.forest : C.cream2, color: m.role === 'user' ? '#fff' : C.ink }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 13 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sobat AI sedang mengetik…
          </div>
        )}
        {err && <div style={{ fontSize: 13, color: C.rust, padding: '8px 0' }}>{err}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: '1px solid rgba(26,42,32,0.08)', paddingTop: 12 }}>
        <textarea ref={taRef} value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Tulis pertanyaanmu…" rows={1}
          style={{ flex: 1, resize: 'none', padding: '12px 14px', borderRadius: 14, border: 'none', background: C.cream2, fontSize: 14, fontFamily: 'inherit', color: C.ink, outline: 'none', overflowY: 'auto', lineHeight: 1.4 }} />
        <button onClick={send} disabled={!input.trim() || loading}
          style={{ background: input.trim() && !loading ? C.forest : 'rgba(26,42,32,0.15)', color: '#fff', border: 'none', borderRadius: 14, width: 46, height: 46, cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

function ImportButton({ onApply }) {
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null); // { holdings, rdn }
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const r = parseSobatCSV(text);
      if (!r.ok) { alert(r.error || 'File tidak dikenali.'); return; }
      setParsed(r);
    } catch (err) { alert('Gagal membaca file: ' + err.message); }
  }

  async function apply() {
    setBusy(true);
    try {
      const res = await onApply(parsed);
      setParsed(null);
      alert(`Impor selesai: ${res.holdings} saham & ${res.rdn} transaksi RDN dipulihkan.`);
    } catch (err) { alert('Gagal impor: ' + err.message); }
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => fileRef.current && fileRef.current.click()}
        style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.25)`, padding: '10px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Upload size={14} /> Import
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />

      {parsed && (
        <div onClick={() => !busy && setParsed(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, padding: 24, maxWidth: 400, width: '100%' }}>
            <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Impor &amp; ganti total?</h3>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
              File berisi <strong style={{ color: C.ink }}>{parsed.holdings.length} saham</strong> dan <strong style={{ color: C.ink }}>{parsed.rdn.length} transaksi RDN</strong>.
            </p>
            <p style={{ fontSize: 13, color: C.rust, fontWeight: 600, lineHeight: 1.5, marginBottom: 18 }}>
              Seluruh portofolio &amp; RDN-mu yang sekarang akan diganti dengan isi file ini. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button disabled={busy} onClick={() => setParsed(null)} style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.2)`, padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Batal</button>
              <button disabled={busy} onClick={apply} style={{ background: busy ? 'rgba(31,59,45,0.5)' : C.forest, color: C.cream, border: 'none', padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {busy ? <><Loader2 size={14} className="spin" /> Memproses…</> : 'Ganti & Impor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DeleteAllPortfolio({ count, onDeleteAll }) {
  const [step, setStep] = useState(0); // 0=off, 1=konfirmasi, 2=ketik HAPUS
  const [text, setText] = useState('');
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4px 20px 8px' }}>
      <div style={{ textAlign: 'right' }}>
        <button
          onClick={() => { setText(''); setStep(1); }}
          style={{ background: 'transparent', color: C.rust, border: `1.5px solid ${C.rust}`, padding: '8px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Trash2 size={13} /> Hapus Semua Portofolio & RDN
        </button>
      </div>

      {step === 1 && (
        <div onClick={() => setStep(0)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, padding: 24, maxWidth: 380, width: '100%' }}>
            <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Hapus semua data portofolio?</h3>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18 }}>
              Seluruh <strong style={{ color: C.ink }}>{count} saham</strong>, riwayat dividen, grafik, <strong style={{ color: C.ink }}>serta saldo &amp; riwayat RDN</strong> akan dihapus permanen.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(0)} style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.2)`, padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
              <button onClick={() => setStep(2)} style={{ background: C.rust, color: C.cream, border: 'none', padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Lanjut</button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div onClick={() => setStep(0)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, padding: 24, maxWidth: 380, width: '100%' }}>
            <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Konfirmasi terakhir</h3>
            <p style={{ fontSize: 13, color: C.rust, fontWeight: 600, marginBottom: 12 }}>Tindakan ini tidak bisa dibatalkan.</p>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
              Ketik <strong className="mono" style={{ color: C.ink }}>HAPUS</strong> untuk menghapus portofolio &amp; RDN:
            </p>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="HAPUS"
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid rgba(26,42,32,0.2)`, background: C.cream2, fontSize: 14, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(0)} style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.2)`, padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
              <button
                disabled={text.trim().toUpperCase() !== 'HAPUS'}
                onClick={() => { onDeleteAll(); setStep(0); }}
                style={{ background: text.trim().toUpperCase() === 'HAPUS' ? C.red : 'rgba(192,57,43,0.35)', color: C.cream, border: 'none', padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: text.trim().toUpperCase() === 'HAPUS' ? 'pointer' : 'not-allowed' }}
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PortfolioTab({ stocks, onAdd, onEdit, onDelete, onSell, onExport, onImport, onSymbol }) {
  const [confirmDel, setConfirmDel] = useState(null); // stock yang mau dihapus

  return (
    <div className="fade-up" style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em' }}>Daftar Saham</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onAdd}
            style={{ background: C.forest, color: C.cream, border: 'none', padding: '10px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Tambah Saham
          </button>
          {stocks.length > 0 && (
            <button
              onClick={onExport}
              style={{ background: C.cuan, color: C.ink, border: 'none', padding: '10px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} /> Export
            </button>
          )}
          {onImport && <ImportButton onApply={onImport} />}
        </div>
      </div>

      {stocks.length === 0 ? (
        <div style={{ background: C.cream2, borderRadius: 20, padding: '48px 24px', textAlign: 'center', color: C.inkSoft }}>
          <div className="serif" style={{ fontSize: 20, color: C.ink, marginBottom: 8 }}>Portofolio masih kosong</div>
          <p style={{ fontSize: 14, marginBottom: 18 }}>Mulai bangun portofoliomu — tambahkan saham pertamamu.</p>
          <button onClick={onAdd} style={{ background: C.forest, color: C.cream, border: 'none', padding: '12px 20px', borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Tambah Saham
          </button>
        </div>
      ) : (
        <div style={{ background: C.cream2, borderRadius: 20, overflow: 'hidden' }}>
          <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 48px 72px 86px 100px', padding: '14px 16px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.inkSoft, textTransform: 'uppercase', borderBottom: `1px solid rgba(26,42,32,0.08)` }}>
            <span>SAHAM</span>
            <span style={{ textAlign: 'right' }}>QTY</span>
            <span style={{ textAlign: 'right' }}>HARGA</span>
            <span style={{ textAlign: 'right' }}>P/L</span>
            <span></span>
          </div>
          {stocks.map((s) => {
            const plPct = (s.hasLive && s.avg) ? (s.price - s.avg) / s.avg * 100 : null;
            const plRp = s.hasLive ? (s.price - s.avg) * s.qty : null;
            return (
              <div key={s.id || s.symbol} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 72px 86px 100px', padding: '14px 16px', borderBottom: `1px solid rgba(26,42,32,0.06)`, alignItems: 'center' }}>
                <div>
                  <div onClick={onSymbol ? () => onSymbol(s.symbol) : undefined} title={onSymbol ? `Lihat analisis ${s.symbol}` : undefined} style={{ fontWeight: 700, fontSize: 14, cursor: onSymbol ? 'pointer' : 'default', textDecoration: onSymbol ? 'underline' : 'none', textDecorationStyle: 'dotted', textDecorationColor: 'rgba(26,42,32,0.35)', textUnderlineOffset: 3, display: 'inline-block' }}>{s.symbol}</div>
                  <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{s.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: C.inkSoft, marginTop: 2 }}>
                    avg Rp{Math.round(s.avg).toLocaleString('id-ID')}{s.buyDate ? ` · beli ${new Date(s.buyDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{s.qty.toLocaleString('id-ID')}</div>
                <div className="mono" style={{ fontSize: 13, textAlign: 'right', fontWeight: 600 }}>
                  {s.hasLive ? Math.round(s.price).toLocaleString('id-ID') : <span style={{ color: C.inkSoft }} title="harga live tak tersedia">—</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {plPct != null ? (
                    <>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: plPct >= 0 ? C.green : C.red }}>{fmtPct(plPct)}</div>
                      <div className="mono" style={{ fontSize: 9, color: plPct >= 0 ? C.green : C.red }}>{plRp >= 0 ? '+' : '-'}Rp{Math.abs(Math.round(plRp)).toLocaleString('id-ID')}</div>
                    </>
                  ) : <span className="mono" style={{ fontSize: 13, color: C.inkSoft }}>—</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button onClick={() => onSell(s)} title="Jual saham ini" style={{ background: C.cuan, border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: 100, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>Jual</button>
                  <button onClick={() => onEdit(s)} title="Edit" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3 }}><Pencil size={14} color={C.inkSoft} /></button>
                  <button onClick={() => setConfirmDel(s)} title="Hapus" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 3 }}><Trash2 size={14} color={C.rust} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stocks.length > 0 && <div id="sec-dividen" style={{ scrollMarginTop: 70 }}><DividendCard stocks={stocks} onSymbol={onSymbol} /></div>}

      <div style={{ marginTop: 16, padding: 14, background: 'rgba(196,155,60,0.1)', borderRadius: 12, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
        💡 <strong style={{ color: C.ink }}>Privat:</strong> Hanya kamu yang bisa melihat portofolio ini. Tersimpan di akunmu &amp; sinkron lintas perangkat. Harga live (delayed) dari pasar.
      </div>

      {/* Konfirmasi hapus */}
      {confirmDel && (
        <div
          onClick={() => setConfirmDel(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, padding: 24, maxWidth: 360, width: '100%' }}>
            <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Hapus {confirmDel.symbol}?</h3>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 6 }}>
              {confirmDel.name || confirmDel.symbol} — {Number(confirmDel.qty).toLocaleString('id-ID')} lembar akan dihapus dari portofoliomu.
            </p>
            <p style={{ fontSize: 12, color: C.rust, marginBottom: 18 }}>Tindakan ini tidak bisa dibatalkan.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDel(null)}
                style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.2)`, padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={() => { onDelete(confirmDel.id); setConfirmDel(null); }}
                style={{ background: C.red, color: C.cream, border: 'none', padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Ya, hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Panel admin: konfirmasi tanggal bayar dividen yang masih pending (confirmed=false).
// Hanya untuk admin. RLS tetap melindungi penulisan di sisi server.
function DividendAdmin({ userId }) {
  const [rows, setRows] = useState(null);

  async function load() {
    setRows(null);
    const { data } = await supabase.from('dividend_schedule')
      .select('id,symbol,ex_date,pay_date')
      .eq('confirmed', false)
      .order('ex_date', { ascending: true });
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  if (userId !== ADMIN_UID) return null;

  return (
    <div style={{ background: C.cream2, borderRadius: 20, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h3 className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Admin · Antrean Dividen{rows && rows.length > 0 ? ` (${rows.length})` : ''}</h3>
        <button onClick={load} className="mono" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, fontSize: 11, fontWeight: 600 }}>MUAT ULANG</button>
      </div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 12 }}>Dividen terdeteksi worker (semua saham yang dipegang user) yang belum punya tanggal bayar resmi. Kirim daftar ini ke Boba untuk diisikan tanggal resminya.</div>
      {rows === null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 13 }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkSoft }}>Tidak ada antrean — semua dividen sudah punya tanggal resmi. ✓</div>
      ) : rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid rgba(26,42,32,0.06)' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{r.symbol}</span>
          <span className="mono" style={{ fontSize: 11, color: C.inkSoft }}>ex {r.ex_date} · estimasi {r.pay_date}</span>
        </div>
      ))}
    </div>
  );
}

// Cash from Dividend — jumlah real dari Yahoo; tanggal bayar = resmi dari tabel
// dividend_schedule (bila diumumkan) atau perkiraan (ex-date + offset).
export function DividendCard({ stocks, onSymbol }) {
  const symKey = stocks.map((s) => s.symbol).join(',');
  const [raw, setRaw] = useState([]);   // [{ symbol, amount, exDate }]
  const [loading, setLoading] = useState(true);
  const OFFSET_DAYS = 21; // perkiraan jeda ex-date → tanggal bayar (pola umum IDX)
  const [lots, setLots] = useState(null); // riwayat pembelian utk hitung kelayakan ex-date
  const [schedule, setSchedule] = useState([]); // [{ symbol, ex_date, pay_date }] tanggal bayar resmi

  useEffect(() => {
    let active = true;
    supabase.from('lots').select('symbol,qty,buy_date,created_at,side')
      .then(({ data }) => { if (active) setLots(data || []); })
      .catch(() => { if (active) setLots([]); });
    return () => { active = false; };
  }, [symKey]);

  // Jadwal dividen resmi (tanggal bayar yang sudah diumumkan) untuk saham yang dipegang
  useEffect(() => {
    if (!symKey) { setSchedule([]); return; }
    let active = true;
    supabase.from('dividend_schedule').select('symbol,ex_date,pay_date')
      .eq('confirmed', true)
      .in('symbol', stocks.map((s) => s.symbol))
      .then(({ data }) => { if (active) setSchedule(data || []); })
      .catch(() => { if (active) setSchedule([]); });
    return () => { active = false; };
  }, [symKey]);


  useEffect(() => {
    if (!symKey) { setRaw([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    fetch(`/api/dividends?symbols=${encodeURIComponent(symKey)}&range=2y`)
      .then((r) => (r.ok ? r.json() : { dividends: [] }))
      .then((d) => { if (active) { setRaw(d.dividends || []); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [symKey]);

  const qtyMap = {};
  stocks.forEach((s) => { qtyMap[s.symbol] = s.qty; });

  // 12 bulan ke depan:
  //  - Dividen yang tanggalnya sudah PASTI (ex-date sudah diumumkan, pembayaran masih akan datang) → pakai tanggal asli (FIX).
  //  - Selain itu → proyeksi dividen 12 bulan terakhir + ~1 tahun (PERKIRAAN).
  //  - Anti-double: untuk simbol sama, buang entri yang berdekatan (<45 hari); yang FIX diutamakan.
  const DAY = 86400000;
  const YEAR = 365 * DAY;
  const OFFSET = OFFSET_DAYS * DAY;
  const NEAR = 45 * DAY;

  // Cari tanggal bayar resmi dari tabel; toleransi 2 hari (tanggal feed bisa bergeser
  // sehari akibat zona waktu). Null bila belum ada → pakai estimasi ex-date + offset.
  function lookupPayDate(symbol, exTime) {
    const TOL = 2 * DAY;
    const ov = schedule.find((o) => o.symbol === symbol && Math.abs(new Date(o.ex_date + 'T00:00:00Z').getTime() - exTime) <= TOL);
    return ov ? new Date(ov.pay_date + 'T00:00:00Z').getTime() : null;
  }

  const now = Date.now();
  const horizon = now + YEAR;

  const real = raw.map((d) => {
    const exTime = new Date(d.exDate).getTime();
    const qty = qtyMap[d.symbol] || 0;
    const ov = lookupPayDate(d.symbol, exTime);
    return { symbol: d.symbol, amount: d.amount, qty, cash: d.amount * qty, exTime, payTime: ov != null ? ov : exTime + OFFSET, fix: true, exact: ov != null };
  }).filter((r) => r.cash > 0 && r.exTime > now && r.exTime <= horizon);

  const proj = raw.map((d) => {
    const exTime = new Date(d.exDate).getTime();
    const qty = qtyMap[d.symbol] || 0;
    return { symbol: d.symbol, amount: d.amount, qty, cash: d.amount * qty, exTime, payTime: exTime + YEAR + OFFSET, fix: false };
  }).filter((r) => r.cash > 0 && r.exTime >= now - YEAR && r.exTime <= now);

  // FIX diproses lebih dulu supaya menang saat dedupe
  const merged = [...real, ...proj].sort((a, b) => (a.fix === b.fix ? a.payTime - b.payTime : (a.fix ? -1 : 1)));
  const kept = [];
  merged.forEach((r) => {
    if (kept.some((k) => k.symbol === r.symbol && Math.abs(k.payTime - r.payTime) < NEAR)) return;
    kept.push(r);
  });
  const rows = kept
    .map((r) => ({ symbol: r.symbol, amount: r.amount, qty: r.qty, cash: r.cash, fix: r.fix, payDate: new Date(r.payTime) }))
    .sort((a, b) => a.payDate - b.payDate);

  const total12 = rows.reduce((s, r) => s + r.cash, 0);

  // ---- Riwayat dividen 12 bulan terakhir ----
  // Lembar yang berhak = lembar yang DIMILIKI sebelum ex-date (cum date).
  // Sumber: tabel lots (buy_date, fallback tanggal pencatatan). Jika emiten
  // belum punya lot sama sekali (data lama), fallback ke buy_date holding;
  // tanpa tanggal sama sekali dianggap sudah dimiliki sejak lama.
  const buyDateMap = {};
  stocks.forEach((s) => { buyDateMap[s.symbol] = s.buyDate || null; });
  function eligibleQty(symbol, exTime) {
    // Toleransi 1 hari: tanggal dividen dari feed (Yahoo) bisa bergeser sehari
    // antara cum-date dan ex-date akibat konversi zona waktu. Lot dianggap berhak
    // bila dibeli pada atau sebelum tanggal feed (gugur hanya jika dibeli SESUDAH).
    const cutoff = exTime + DAY;
    const symLots = (lots || []).filter((l) => l.symbol === symbol);
    if (symLots.length > 0) {
      const q = symLots.reduce((sum, l) => {
        const t = new Date(l.buy_date || (l.created_at || '').slice(0, 10)).getTime();
        if (t >= cutoff) return sum;
        return sum + (l.side === 'sell' ? -Number(l.qty) : Number(l.qty));
      }, 0);
      return Math.max(0, q);
    }
    const bd = buyDateMap[symbol];
    if (bd && new Date(bd).getTime() >= cutoff) return 0;
    return qtyMap[symbol] || 0;
  }
  const hist = raw.map((d) => {
    const exTime = new Date(d.exDate).getTime();
    const q = eligibleQty(d.symbol, exTime);
    const ov = lookupPayDate(d.symbol, exTime);
    return { symbol: d.symbol, amount: d.amount, qty: q, cash: d.amount * q, exTime, payEst: new Date(ov != null ? ov : exTime + OFFSET), exact: ov != null };
  })
    .filter((r) => r.exTime <= now && r.exTime >= now - YEAR && r.cash > 0)
    .sort((a, b) => b.exTime - a.exTime);
  const totalHist = hist.reduce((s, r) => s + r.cash, 0);

  // Kredit otomatis dividen yang estimasi tanggal bayarnya sudah lewat ke saldo RDN.
  // RPC credit_dividend idempoten (dedupe per user+symbol+ex_date), jadi aman
  // dipanggil ulang lintas reload/perangkat. Guard ref mencegah spam per render.
  const creditedKey = useRef('');
  useEffect(() => {
    if (lots === null || raw.length === 0) return;
    if (creditedKey.current === symKey) return;
    creditedKey.current = symKey;
    (async () => {
      const paid = hist.filter((r) => r.payEst.getTime() <= Date.now());
      let adaBaru = false;
      for (const r of paid) {
        const { data, error } = await supabase.rpc('credit_dividend', {
          p_symbol: r.symbol,
          p_ex_date: new Date(r.exTime).toISOString().slice(0, 10),
          p_amount: Math.round(r.cash),
          p_pay_date: r.payEst.toISOString().slice(0, 10),
        });
        if (!error && data !== null) adaBaru = true;
      }
      if (adaBaru) window.dispatchEvent(new Event('sobat-rdn-changed'));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, raw, symKey]);
  const fmtDate = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ background: C.cream2, borderRadius: 20, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h3 className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Total Dividen</h3>
      </div>

      <div className="serif" style={{ fontSize: 30, fontWeight: 600, color: C.green, marginBottom: 16 }}>{fmtRp(totalHist + total12)}</div>

      {hist.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <h4 className="serif" style={{ fontSize: 15, fontWeight: 600 }}>Riwayat Dividen</h4>
            <span className="mono" style={{ fontSize: 10, color: C.inkSoft, letterSpacing: '0.08em' }}>12 BULAN TERAKHIR</span>
          </div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: C.green, marginBottom: 8 }}>{fmtRp(totalHist)}</div>
          {hist.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(26,42,32,0.06)` }}>
              <div>
                <div onClick={onSymbol ? () => onSymbol(r.symbol) : undefined} title={onSymbol ? `Lihat analisis ${r.symbol}` : undefined} style={{ fontWeight: 700, fontSize: 13, cursor: onSymbol ? 'pointer' : 'default', textDecoration: onSymbol ? 'underline' : 'none', textDecorationStyle: 'dotted', textDecorationColor: 'rgba(26,42,32,0.35)', textUnderlineOffset: 3, display: 'inline-block' }}>{r.symbol}</div>
                <div style={{ fontSize: 11, color: C.inkSoft }}>{fmtRp(r.amount)}/lembar × {r.qty.toLocaleString('id-ID')} berhak</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 11, color: C.inkSoft }}>ex {fmtDate(new Date(r.exTime))}</div>
                <div className="mono" style={{ fontSize: 8, letterSpacing: '0.06em', color: r.exact ? C.green : C.inkSoft }}>{r.exact ? 'DIBAYAR ' : '±DIBAYAR '}{fmtDate(r.payEst).toUpperCase()}</div>
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: C.green, textAlign: 'right', minWidth: 84 }}>{fmtRp(r.cash)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h4 className="serif" style={{ fontSize: 15, fontWeight: 600 }}>Akan Datang</h4>
        <span className="mono" style={{ fontSize: 10, color: C.inkSoft, letterSpacing: '0.08em' }}>12 BULAN KE DEPAN</span>
      </div>
      {rows.length > 0 && (
        <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: C.green, marginBottom: 4 }}>{fmtRp(total12)}</div>
      )}
      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 12 }}>perkiraan dividen 12 bulan ke depan — tanggal pasti dipakai bila sudah diumumkan, sisanya proyeksi pola tahun lalu</div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 13 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat data dividen…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkSoft }}>Belum ada dividen 12 bulan terakhir untuk diproyeksikan.</div>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(26,42,32,0.06)` }}>
              <div>
                <div onClick={onSymbol ? () => onSymbol(r.symbol) : undefined} title={onSymbol ? `Lihat analisis ${r.symbol}` : undefined} style={{ fontWeight: 700, fontSize: 13, cursor: onSymbol ? 'pointer' : 'default', textDecoration: onSymbol ? 'underline' : 'none', textDecorationStyle: 'dotted', textDecorationColor: 'rgba(26,42,32,0.35)', textUnderlineOffset: 3, display: 'inline-block' }}>{r.symbol}</div>
                <div style={{ fontSize: 11, color: C.inkSoft }}>{fmtRp(r.amount)}/lembar × {r.qty.toLocaleString('id-ID')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 11, color: C.inkSoft }}>{fmtDate(r.payDate)}</div>
                <div className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: r.fix ? C.green : C.inkSoft }}>{r.fix ? 'FIX' : 'PERKIRAAN'}</div>
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: C.green, textAlign: 'right', minWidth: 84 }}>{fmtRp(r.cash)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: C.inkSoft, lineHeight: 1.5 }}>
        ⓘ <strong style={{ color: C.ink }}>FIX</strong> = dividen yang tanggalnya sudah diumumkan. <strong style={{ color: C.ink }}>PERKIRAAN</strong> = proyeksi dari pola tahun lalu (+~1 tahun). Jumlah &amp; tanggal final bergantung keputusan RUPS emiten. Riwayat: ex-date adalah tanggal aktual; tanggal bayar memakai jadwal resmi emiten bila sudah diumumkan (tanpa tanda ±), selain itu diperkirakan ±21 hari dari ex-date; lembar yang berhak dihitung dari kepemilikan sebelum ex-date berdasarkan riwayat pembelian.
      </div>
    </div>
  );
}
