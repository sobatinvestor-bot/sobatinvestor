import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { Send, Home, BarChart3, Sparkles, Briefcase, Download, Loader2, Lock, LogOut, Plus, Pencil, Trash2, FileText } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Auth, usePortfolio, Editor, logout } from './Account.jsx';
import AnalisisTab from './Analisis.jsx';

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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = masih cek
  const [tab, setTab] = useState('home');
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
      <Nav ihsg={ihsg} ihsgChange={ihsgChange} session={session} setTab={setTab} />
      <div style={{ paddingBottom: 100 }}>
        {tab === 'home' && <HomeTab stocks={market.quotes} setTab={setTab} />}
        {tab === 'analisis' && (
          <AnalisisTab
            userId={session ? session.user.id : null}
            userName={session ? (session.user.user_metadata && session.user.user_metadata.display_name ? session.user.user_metadata.display_name : 'Investor-' + session.user.id.slice(0, 4)) : null}
            onRequireLogin={() => setTab('portfolio')}
          />
        )}
        {isPrivateTab && !session && <Auth inline />}
        {isPrivateTab && session && <PrivateArea tab={tab} userId={session.user.id} ihsgQuote={market.ihsg} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// Area privat (hanya saat sudah login): Dashboard, Sobat AI, Portfolio
function PrivateArea({ tab, userId, ihsgQuote }) {
  const { stocks, addHolding, updateHolding, deleteHolding, deleteAll } = usePortfolio(userId);
  const [editing, setEditing] = useState(null);

  function handleSave(h) {
    if (h.id) updateHolding(h); else addHolding(h);
    setEditing(null);
  }

  return (
    <>
      {tab === 'portfolio' && (
        <>
          <DashboardTab stocks={stocks} ihsgQuote={ihsgQuote} />
          <PortfolioTab
            stocks={stocks}
            onAdd={() => setEditing({})}
            onEdit={(s) => setEditing(s)}
            onDelete={deleteHolding}
            onDeleteAll={deleteAll}
          />
        </>
      )}
      {tab === 'chat' && <ChatTab stocks={stocks} />}
      {editing && <Editor holding={editing} onSave={handleSave} onClose={() => setEditing(null)} />}
    </>
  );
}

function Nav({ ihsg, ihsgChange, session, setTab }) {
  return (
    <div style={{ borderBottom: `1px solid rgba(26,42,32,0.08)`, background: 'rgba(244,239,230,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse-dot" style={{ width: 9, height: 9, borderRadius: '50%', background: C.cuan, display: 'inline-block' }} />
          sobat<span style={{ color: C.cuan, fontWeight: 700 }}>.</span>investor
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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

function HomeTab({ stocks, setTab }) {
  return (
    <div className="fade-up">
      <div style={{ padding: '40px 20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.cream2, padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500, color: C.inkSoft, marginBottom: 20 }}>
          <span style={{ color: C.rust, fontWeight: 700 }}>●</span> Live • Powered by AI
        </div>
        <h1 className="serif" style={{ fontSize: 'clamp(40px, 8vw, 72px)', lineHeight: 0.96, letterSpacing: '-0.03em', fontWeight: 500, marginBottom: 20 }}>
          Sobat AI yang bantu kamu{' '}
          <em style={{ color: C.forest, position: 'relative', display: 'inline-block' }}>
            cuan
            <span style={{ position: 'absolute', bottom: 4, left: 0, right: 0, height: 6, background: C.cuan, opacity: 0.4, zIndex: -1 }} />
          </em>
          .
        </h1>
        <p style={{ fontSize: 17, color: C.inkSoft, lineHeight: 1.55, maxWidth: 540, marginBottom: 28 }}>
          Analisis saham IDX otomatis. Tanya apa aja, dapat insight berbasis data — bukan tebak-tebakan.
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
            { num: '01', title: 'Python Engine', desc: 'Auto-fetch IDX, Yahoo Finance. Backtest dan indikator teknikal jalan otomatis.', bg: C.forest, fg: C.cream },
            { num: '02', title: 'Agentic AI', desc: 'Bukan chatbot biasa — bisa riset emiten dan eksekusi analisis untuk kamu.', bg: C.cream2, fg: C.ink },
            { num: '03', title: 'Excel Export', desc: 'Laporan portfolio + chart, siap kirim ke bos atau buat lapor pajak.', bg: C.cream2, fg: C.ink },
            { num: '04', title: 'Live Dashboard', desc: 'P/L real-time, alokasi sektor, dividend calendar di satu layar.', bg: C.cream2, fg: C.ink },
          ].map((f) => (
            <div key={f.num} style={{ background: f.bg, color: f.fg, padding: 24, borderRadius: 20, border: `1px solid rgba(26,42,32,0.05)` }}>
              <div className="mono" style={{ fontSize: 11, opacity: 0.6, marginBottom: 16, letterSpacing: '0.1em' }}>{f.num} /</div>
              <h3 className="serif" style={{ fontSize: 24, fontWeight: 500, marginBottom: 8, letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
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
      const pct = (baseSet && valueStart > 0 && value > 0) ? ((value / valueStart) - 1) * 100 : null;
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
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={perfData}>
            <defs>
              <linearGradient id="cuanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cuan} stopOpacity={0.4} />
                <stop offset="100%" stopColor={C.cuan} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={[(min) => min * 0.999, (max) => max * 1.001]} />
            <Tooltip content={<PerfTooltip />} />
            <ReferenceLine x={todayLabel} stroke={C.inkSoft} strokeDasharray="3 3" label={{ value: 'Hari ini', position: 'insideTopRight', fontSize: 10, fill: C.inkSoft }} />
            <Area type="linear" dataKey="value" stroke={C.cuan} strokeWidth={2.5} fill="url(#cuanGrad)" />
            {hasIhsg && <Area type="linear" dataKey="ihsg" stroke={C.inkSoft} strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />}
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
          Kiri "Hari ini" = harga historis asli tiap saham. Kanan = proyeksi datar di harga terakhir. Garis putus-putus = IHSG (disetarakan ke nilai awal). Lonjakan = dividen masuk (perkiraan tgl bayar).{totalDivWindow > 0 ? ` Total dividen di jendela ini: ${fmtRp(totalDivWindow)}.` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.cream2, borderRadius: 20, padding: 20 }}>
          <h3 className="serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Alokasi Sektor</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={sectorData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2}>
                {sectorData.map((_, i) => <Cell key={i} fill={sectorColors[i % sectorColors.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12, color: C.cream }}
                itemStyle={{ color: C.cream }}
                formatter={(v) => fmtRp(v)}
              />
            </PieChart>
          </ResponsiveContainer>
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
function ChatTab({ stocks }) {
  return (
    <div className="fade-up" style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px 60px', minHeight: 'calc(100vh - 60px - 80px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      
      {/* Lock Icon Badge */}
      <div style={{
        width: 80,
        height: 80,
        borderRadius: 24,
        background: C.forest,
        color: C.cuanBright,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        boxShadow: '0 8px 24px rgba(31,59,45,0.2)'
      }}>
        <Lock size={36} />
      </div>

      {/* Premium Badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: C.cuan,
        color: C.ink,
        padding: '6px 14px',
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 16
      }}>
        <Sparkles size={12} /> Member Premium
      </div>

      {/* Heading */}
      <h2 className="serif" style={{
        fontSize: 'clamp(28px, 6vw, 42px)',
        fontWeight: 500,
        letterSpacing: '-0.02em',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 1.1
      }}>
        Sobat AI{' '}
        <em style={{ color: C.forest }}>Premium</em>
      </h2>

      {/* Description */}
      <p style={{
        fontSize: 16,
        color: C.inkSoft,
        lineHeight: 1.6,
        textAlign: 'center',
        maxWidth: 480,
        marginBottom: 32
      }}>
        Asisten AI eksklusif untuk member premium. Dapatkan analisis saham mendalam, 
        rekomendasi portofolio, dan insight pasar real-time yang dipersonalisasi.
      </p>

      {/* Features List */}
      <div style={{
        background: C.cream2,
        borderRadius: 20,
        padding: 24,
        maxWidth: 480,
        width: '100%',
        marginBottom: 24
      }}>
        <div className="mono" style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: C.rust,
          marginBottom: 14,
          fontWeight: 500
        }}>
          // Yang akan kamu dapat
        </div>
        {[
          'Analisis fundamental & teknikal mendalam',
          'Rekomendasi portofolio personal',
          'Insight makro & sektor real-time',
          'Strategi rebalancing otomatis',
        ].map((feature, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 0',
            fontSize: 14,
            color: C.ink
          }}>
            <span style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: C.forest,
              color: C.cuanBright,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0
            }}>✓</span>
            {feature}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        style={{
          background: C.forest,
          color: C.cream,
          padding: '14px 28px',
          borderRadius: 100,
          border: 'none',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        }}
        onClick={() => alert('Fitur premium akan tersedia segera. Stay tuned, sobat! 🌱')}
      >
        <Sparkles size={16} /> Coming Soon
      </button>

      <p style={{
        fontSize: 12,
        color: C.inkSoft,
        textAlign: 'center'
      }}>
        Fitur ini sedang kami siapkan. Pantau update kami ya, sobat. 🌱
      </p>
    </div>
  );
}

function PortfolioTab({ stocks, onAdd, onEdit, onDelete, onDeleteAll }) {
  const [confirmDel, setConfirmDel] = useState(null); // stock yang mau dihapus
  const [wipeStep, setWipeStep] = useState(0);        // 0=off, 1=dialog 1, 2=dialog final
  const [wipeText, setWipeText] = useState('');
  function exportCSV() {
    const headers = ['Symbol', 'Nama', 'Qty', 'Avg Price', 'Current Price', 'Market Value', 'P/L', 'P/L %', 'Sector'];
    const rows = stocks.map(s => {
      const mv = s.price * s.qty;
      const pl = mv - s.avg * s.qty;
      const plPct = ((s.price - s.avg) / s.avg) * 100;
      return [s.symbol, `"${s.name}"`, s.qty, Math.round(s.avg), Math.round(s.price), Math.round(mv), Math.round(pl), plPct.toFixed(2), s.sector];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sobat-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
              onClick={exportCSV}
              style={{ background: C.cuan, color: C.ink, border: 'none', padding: '10px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} /> Export
            </button>
          )}
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
          <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 80px 64px', padding: '14px 16px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.inkSoft, textTransform: 'uppercase', borderBottom: `1px solid rgba(26,42,32,0.08)` }}>
            <span>SAHAM</span>
            <span style={{ textAlign: 'right' }}>QTY</span>
            <span style={{ textAlign: 'right' }}>HARGA</span>
            <span style={{ textAlign: 'right' }}>P/L</span>
            <span></span>
          </div>
          {stocks.map((s) => {
            const pl = s.avg ? (s.price - s.avg) / s.avg * 100 : 0;
            return (
              <div key={s.id || s.symbol} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 80px 64px', padding: '14px 16px', borderBottom: `1px solid rgba(26,42,32,0.06)`, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.symbol}</div>
                  <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{s.name}</div>
                  {s.buyDate && <div className="mono" style={{ fontSize: 10, color: C.inkSoft, marginTop: 2 }}>beli {new Date(s.buyDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                </div>
                <div className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{s.qty.toLocaleString('id-ID')}</div>
                <div className="mono" style={{ fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{Math.round(s.price).toLocaleString('id-ID')}</div>
                <div className="mono" style={{ fontSize: 13, textAlign: 'right', fontWeight: 600, color: pl >= 0 ? C.green : C.red }}>{fmtPct(pl)}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => onEdit(s)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}><Pencil size={14} color={C.inkSoft} /></button>
                  <button onClick={() => setConfirmDel(s)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}><Trash2 size={14} color={C.rust} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stocks.length > 0 && <DividendCard stocks={stocks} />}

      {stocks.length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button
            onClick={() => { setWipeText(''); setWipeStep(1); }}
            style={{ background: 'transparent', color: C.rust, border: `1.5px solid ${C.rust}`, padding: '8px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={13} /> Hapus Semua Portofolio
          </button>
        </div>
      )}

      {/* Hapus semua — konfirmasi tahap 1 */}
      {wipeStep === 1 && (
        <div onClick={() => setWipeStep(0)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, padding: 24, maxWidth: 380, width: '100%' }}>
            <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Hapus semua portofolio?</h3>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 18 }}>
              Seluruh <strong style={{ color: C.ink }}>{stocks.length} saham</strong> di portofoliomu akan dihapus permanen. Riwayat dividen & grafik ikut kosong.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setWipeStep(0)} style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.2)`, padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
              <button onClick={() => setWipeStep(2)} style={{ background: C.rust, color: C.cream, border: 'none', padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Lanjut</button>
            </div>
          </div>
        </div>
      )}

      {/* Hapus semua — konfirmasi final (ketik HAPUS) */}
      {wipeStep === 2 && (
        <div onClick={() => setWipeStep(0)} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 20, padding: 24, maxWidth: 380, width: '100%' }}>
            <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Konfirmasi terakhir</h3>
            <p style={{ fontSize: 13, color: C.rust, fontWeight: 600, marginBottom: 12 }}>Tindakan ini tidak bisa dibatalkan.</p>
            <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 10 }}>
              Ketik <strong className="mono" style={{ color: C.ink }}>HAPUS</strong> untuk menghapus seluruh portofolio:
            </p>
            <input
              value={wipeText}
              onChange={(e) => setWipeText(e.target.value)}
              placeholder="HAPUS"
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1.5px solid rgba(26,42,32,0.2)`, background: C.cream2, fontSize: 14, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setWipeStep(0)} style={{ background: 'transparent', color: C.ink, border: `1.5px solid rgba(26,42,32,0.2)`, padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Batal</button>
              <button
                disabled={wipeText.trim().toUpperCase() !== 'HAPUS'}
                onClick={() => { onDeleteAll(); setWipeStep(0); }}
                style={{ background: wipeText.trim().toUpperCase() === 'HAPUS' ? C.red : 'rgba(192,57,43,0.35)', color: C.cream, border: 'none', padding: '10px 18px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: wipeText.trim().toUpperCase() === 'HAPUS' ? 'pointer' : 'not-allowed' }}
              >
                Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

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

// Cash from Dividend — jumlah real dari Yahoo, tanggal bayar = perkiraan (ex-date + offset)
function DividendCard({ stocks }) {
  const symKey = stocks.map((s) => s.symbol).join(',');
  const [raw, setRaw] = useState([]);   // [{ symbol, amount, exDate }]
  const [loading, setLoading] = useState(true);
  const OFFSET_DAYS = 21; // perkiraan jeda ex-date → tanggal bayar (pola umum IDX)

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
  const now = Date.now();
  const horizon = now + YEAR;

  const real = raw.map((d) => {
    const exTime = new Date(d.exDate).getTime();
    const qty = qtyMap[d.symbol] || 0;
    return { symbol: d.symbol, amount: d.amount, qty, cash: d.amount * qty, payTime: exTime + OFFSET, fix: true };
  }).filter((r) => r.cash > 0 && r.payTime > now && r.payTime <= horizon);

  const proj = raw.map((d) => {
    const exTime = new Date(d.exDate).getTime();
    const qty = qtyMap[d.symbol] || 0;
    return { symbol: d.symbol, amount: d.amount, qty, cash: d.amount * qty, exTime, payTime: exTime + YEAR + OFFSET, fix: false };
  }).filter((r) => r.cash > 0 && r.exTime >= now - YEAR && r.exTime <= now && r.payTime <= horizon);

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
  const fmtDate = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ background: C.cream2, borderRadius: 20, padding: 20, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <h3 className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Cash from Dividend</h3>
        <span className="mono" style={{ fontSize: 10, color: C.inkSoft, letterSpacing: '0.08em' }}>12 BULAN KE DEPAN</span>
      </div>

      <div className="serif" style={{ fontSize: 26, fontWeight: 600, color: C.green, marginBottom: 4 }}>{fmtRp(total12)}</div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 16 }}>perkiraan dividen 12 bulan ke depan — tanggal pasti dipakai bila sudah diumumkan, sisanya proyeksi pola tahun lalu</div>

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
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.symbol}</div>
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
        ⓘ <strong style={{ color: C.ink }}>FIX</strong> = dividen yang tanggalnya sudah diumumkan. <strong style={{ color: C.ink }}>PERKIRAAN</strong> = proyeksi dari pola tahun lalu (+~1 tahun). Jumlah &amp; tanggal final bergantung keputusan RUPS emiten.
      </div>
    </div>
  );
}
