import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Send, Home, BarChart3, Sparkles, Briefcase, Download, Loader2 } from 'lucide-react';

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
  const [tab, setTab] = useState('home');
  const [stocks, setStocks] = useState(initialStocks);
  const [ihsg, setIhsg] = useState(7842.31);
  const [ihsgChange, setIhsgChange] = useState(0.84);

  useEffect(() => {
    const id = setInterval(() => {
      setStocks((prev) =>
        prev.map((s) => {
          const drift = (Math.random() - 0.5) * 0.008;
          const newPrice = Math.max(1, s.price * (1 + drift));
          return { ...s, price: newPrice, change: s.change + drift * 100 };
        })
      );
      setIhsg((v) => v * (1 + (Math.random() - 0.5) * 0.002));
      setIhsgChange((v) => v + (Math.random() - 0.5) * 0.1);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ background: C.cream, minHeight: '100vh', color: C.ink }}>
      <Nav ihsg={ihsg} ihsgChange={ihsgChange} />
      <div style={{ paddingBottom: 100 }}>
        {tab === 'home' && <HomeTab stocks={stocks} setTab={setTab} />}
        {tab === 'dashboard' && <DashboardTab stocks={stocks} />}
        {tab === 'chat' && <ChatTab stocks={stocks} />}
        {tab === 'portfolio' && <PortfolioTab stocks={stocks} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

function Nav({ ihsg, ihsgChange }) {
  return (
    <div style={{ borderBottom: `1px solid rgba(26,42,32,0.08)`, background: 'rgba(244,239,230,0.9)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1280, margin: '0 auto' }}>
        <div className="serif" style={{ fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse-dot" style={{ width: 9, height: 9, borderRadius: '50%', background: C.cuan, display: 'inline-block' }} />
          sobat<span style={{ color: C.cuan, fontWeight: 700 }}>.</span>investor
        </div>
        <div className="mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.inkSoft }}>
          <span style={{ fontWeight: 600, color: C.ink }}>{ihsg.toFixed(2)}</span>
          <span style={{ color: ihsgChange >= 0 ? C.green : C.red, fontWeight: 600 }}>{fmtPct(ihsgChange)}</span>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { id: 'home', label: 'Beranda', icon: Home },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'chat', label: 'Sobat AI', icon: Sparkles },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
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
            onClick={() => setTab('dashboard')}
            style={{ background: 'transparent', color: C.ink, padding: '14px 24px', borderRadius: 100, border: `1.5px solid rgba(26,42,32,0.15)`, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Lihat Dashboard →
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

function DashboardTab({ stocks }) {
  const totalValue = stocks.reduce((sum, s) => sum + s.price * s.qty, 0);
  const totalCost = stocks.reduce((sum, s) => sum + s.avg * s.qty, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = (totalPL / totalCost) * 100;

  const perfData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    value: totalCost / 1e6 + Math.sin(i / 3) * 5 + i * 0.4 + (Math.random() - 0.5) * 2,
  }));

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
      <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 20 }}>Dashboard</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="PORTFOLIO" value={fmtRp(totalValue)} sub={fmtPct(totalPLPct)} positive={totalPL >= 0} highlight />
        <StatCard label="UNREALIZED P/L" value={fmtRp(totalPL)} sub={`dari ${fmtRp(totalCost)}`} positive={totalPL >= 0} />
        <StatCard label="HOLDINGS" value={stocks.length.toString()} sub="emiten aktif" />
      </div>

      <div style={{ background: C.cream2, borderRadius: 20, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="serif" style={{ fontSize: 18, fontWeight: 600 }}>Performa 30 Hari</h3>
          <span className="mono" style={{ fontSize: 11, color: C.inkSoft }}>UPDATE: LIVE</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={perfData}>
            <defs>
              <linearGradient id="cuanGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.cuan} stopOpacity={0.4} />
                <stop offset="100%" stopColor={C.cuan} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
            <Tooltip
              contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: C.cream }}
              itemStyle={{ color: C.cuanBright }}
              formatter={(v) => [`Rp ${v.toFixed(1)}jt`, 'Value']}
            />
            <Area type="monotone" dataKey="value" stroke={C.cuan} strokeWidth={2.5} fill="url(#cuanGrad)" />
          </AreaChart>
        </ResponsiveContainer>
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

function ChatTab({ stocks }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Halo sobat! 👋 Aku Sobat AI, asisten investasi saham Indonesia kamu. Mau tanya apa hari ini?\n\nBisa nanya soal:\n• Analisis saham IDX (BBCA, BBRI, TLKM, dll)\n• Strategi portofolio\n• Konsep investasi (fundamental, teknikal)\n• Kondisi pasar terkini' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const portfolioContext = stocks.map(s => `${s.symbol} (${s.name}): ${s.qty} lot @ avg ${Math.round(s.avg)}, harga skrg ${Math.round(s.price)}, P/L ${(((s.price - s.avg) / s.avg) * 100).toFixed(2)}%`).join('\n');

  const systemPrompt = `Kamu adalah "Sobat AI", asisten investasi saham Indonesia yang ramah, ahli, dan to-the-point.

KARAKTER:
- Panggil pengguna "sobat" atau "kamu", santai tapi profesional
- Pakai bahasa Indonesia, boleh selipkan istilah saham (cuan, fundamental, teknikal, bluechip, dll)
- Jawaban SINGKAT (3-6 kalimat untuk pertanyaan biasa), pakai bullet kalau perlu
- Hindari basa-basi panjang

YANG KAMU KUASAI:
- Saham IDX (LQ45, IDX30, perbankan, telco, consumer, dll)
- Fundamental analysis (ROE, P/E, P/B, DER, dividend)
- Technical analysis (MA, RSI, support resistance, candlestick)
- Makro Indonesia (BI Rate, IHSG, sektor)
- Portfolio management & risk

PORTOFOLIO PENGGUNA SAAT INI:
${portfolioContext}

ATURAN PENTING:
- JANGAN kasih rekomendasi beli/jual yang pasti — selalu bingkai sebagai "kerangka berpikir" atau "yang perlu dipertimbangkan"
- Selalu tutup dengan reminder singkat bahwa ini bukan saran finansial profesional
- Kalau ditanya soal harga real-time atau berita terkini yang kamu tidak tahu pasti, bilang dengan jujur dan suggest untuk cek sumber resmi (IDX, Stockbit, dll)`;

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // Call our own Cloudflare Pages Function — NOT Anthropic directly (so API key stays secret)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || 'Maaf sobat, ada masalah teknis. Coba lagi ya.';
      setMessages([...newMessages, { role: 'assistant', content: text }]);
    } catch (err) {
      console.error(err);
      setMessages([...newMessages, { role: 'assistant', content: 'Maaf sobat, aku gak bisa connect ke server. Coba lagi nanti ya 🙏' }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    'Analisis singkat portofolio aku',
    'Saham bank mana yang paling kuat fundamental?',
    'Jelasin RSI dong',
    'Strategi rebalancing untuk pemula?',
  ];

  return (
    <div className="fade-up" style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px - 80px)' }}>
      <div style={{ padding: '20px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: C.forest, color: C.cuanBright, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="serif" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>Sobat AI</h2>
            <div style={{ fontSize: 12, color: C.green, fontWeight: 500 }}>● Online</div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div
              style={{
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: 16,
                background: m.role === 'user' ? C.forest : C.cream2,
                color: m.role === 'user' ? C.cream : C.ink,
                fontSize: 14,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ padding: '12px 16px', borderRadius: 16, background: C.cream2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: C.inkSoft }} />
              <span style={{ fontSize: 13, color: C.inkSoft }}>Sobat lagi mikir...</span>
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div style={{ padding: '0 20px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              style={{ background: C.cream2, color: C.ink, border: 'none', padding: '8px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 20px 20px', borderTop: `1px solid rgba(26,42,32,0.06)`, background: C.cream }}>
        <div style={{ display: 'flex', gap: 8, background: C.cream2, borderRadius: 100, padding: '6px 6px 6px 18px', alignItems: 'center' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Tanya apa aja ke Sobat..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: C.ink }}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{ background: input.trim() && !loading ? C.forest : 'rgba(26,42,32,0.2)', color: C.cream, border: 'none', width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed' }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PortfolioTab({ stocks }) {
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
        <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em' }}>Portfolio</h2>
        <button
          onClick={exportCSV}
          style={{ background: C.cuan, color: C.ink, border: 'none', padding: '10px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Download size={14} /> Export ke Excel
        </button>
      </div>

      <div style={{ background: C.cream2, borderRadius: 20, overflow: 'hidden' }}>
        <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px', padding: '14px 16px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.inkSoft, textTransform: 'uppercase', borderBottom: `1px solid rgba(26,42,32,0.08)` }}>
          <span>SAHAM</span>
          <span style={{ textAlign: 'right' }}>QTY</span>
          <span style={{ textAlign: 'right' }}>HARGA</span>
          <span style={{ textAlign: 'right' }}>P/L</span>
        </div>
        {stocks.map((s) => {
          const pl = (s.price - s.avg) / s.avg * 100;
          return (
            <div key={s.symbol} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px', padding: '14px 16px', borderBottom: `1px solid rgba(26,42,32,0.06)`, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.symbol}</div>
                <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>{s.name}</div>
              </div>
              <div className="mono" style={{ fontSize: 13, textAlign: 'right' }}>{s.qty.toLocaleString('id-ID')}</div>
              <div className="mono" style={{ fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{Math.round(s.price).toLocaleString('id-ID')}</div>
              <div className="mono" style={{ fontSize: 13, textAlign: 'right', fontWeight: 600, color: pl >= 0 ? C.green : C.red }}>{fmtPct(pl)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, padding: 14, background: 'rgba(196,155,60,0.1)', borderRadius: 12, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
        💡 <strong style={{ color: C.ink }}>Tips:</strong> Data ini adalah simulasi demo. Versi production akan auto-sync dari Stockbit/Ajaib/IPOT kamu (read-only, aman).
      </div>
    </div>
  );
}
