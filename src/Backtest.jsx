import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Loader2, Play } from 'lucide-react';

const C = {
  cream: '#F4EFE6', cream2: '#EBE3D3', ink: '#1A2A20', inkSoft: '#3A4A40',
  forest: '#1F3B2D', cuan: '#C49B3C', rust: '#B85C38', red: '#C0392B', green: '#2E7D4F',
};

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

async function ensurePyodide(onStatus) {
  if (window.__pyodide) return window.__pyodide;
  if (!window.loadPyodide) {
    onStatus('Memuat Python engine (±10 detik, sekali saja)...');
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PYODIDE_URL + 'pyodide.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat Pyodide'));
      document.head.appendChild(s);
    });
  }
  onStatus('Menyiapkan interpreter Python...');
  window.__pyodide = await window.loadPyodide({ indexURL: PYODIDE_URL });
  return window.__pyodide;
}

const PY_BACKTEST = `
import json

data = json.loads(input_json)
closes = data["closes"]
dates = data["dates"]
fast_n = int(data["fast"])
slow_n = int(data["slow"])

def sma(arr, n):
    out = [None] * len(arr)
    s = 0.0
    for i, v in enumerate(arr):
        s += v
        if i >= n:
            s -= arr[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out

f = sma(closes, fast_n)
s = sma(closes, slow_n)

# Strategi: pegang saham saat SMA cepat > SMA lambat, cash saat sebaliknya
cash, shares, pos, trades = 1.0, 0.0, 0, 0
equity = []
for i, c in enumerate(closes):
    if f[i] is not None and s[i] is not None:
        if f[i] > s[i] and pos == 0:
            shares = cash / c; cash = 0.0; pos = 1; trades += 1
        elif f[i] < s[i] and pos == 1:
            cash = shares * c; shares = 0.0; pos = 0; trades += 1
    equity.append(cash + shares * c)

buyhold = [c / closes[0] for c in closes]

result = json.dumps({
    "dates": dates,
    "equity": equity,
    "buyhold": buyhold,
    "strat_return": (equity[-1] - 1) * 100,
    "bh_return": (buyhold[-1] - 1) * 100,
    "trades": trades,
    "n_days": len(closes),
})
result
`;

export default function Backtest() {
  const [symbol, setSymbol] = useState('BBCA');
  const [range, setRange] = useState('2y');
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);

  async function run() {
    setBusy(true); setErr(''); setRes(null);
    try {
      if (!symbol.trim()) throw new Error('Isi kode saham dulu.');
      if (fast >= slow) throw new Error('SMA cepat harus lebih kecil dari SMA lambat.');

      setStatus('Mengambil data harga...');
      const sym = symbol.trim().toUpperCase();
      const r = await fetch(`/api/history?symbols=${encodeURIComponent(sym)}&range=${range}`);
      if (!r.ok) throw new Error('Gagal mengambil data harga.');
      const d = await r.json();
      const series = (d.history || {})[sym];
      if (!series || series.length < slow + 10) throw new Error(`Data ${sym} tidak cukup (butuh > ${slow + 10} hari). Cek kode saham.`);

      const pyodide = await ensurePyodide(setStatus);
      setStatus('Menjalankan backtest (Python)...');
      const payload = {
        closes: series.map((p) => p.close),
        dates: series.map((p) => new Date(p.t).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })),
        fast, slow,
      };
      pyodide.globals.set('input_json', JSON.stringify(payload));
      const out = pyodide.runPython(PY_BACKTEST);
      const parsed = JSON.parse(out);
      setRes({ ...parsed, symbol: sym });
      setStatus('');
    } catch (e) {
      setErr(e.message || 'Terjadi kesalahan.');
      setStatus('');
    } finally { setBusy(false); }
  }

  const chartData = res
    ? res.dates.map((dt, i) => ({ label: dt, strategi: +(res.equity[i] * 100).toFixed(1), belitahan: +(res.buyhold[i] * 100).toFixed(1) }))
    : [];

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 12, border: 'none', background: C.cream, fontSize: 14, boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 };

  return (
    <div>
      <div style={{ background: C.cream2, borderRadius: 18, padding: 18, marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 10, color: C.rust, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>// Python Engine — jalan di browser kamu</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Kode saham</label>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BBCA" style={inp} />
          </div>
          <div>
            <label style={lbl}>Periode</label>
            <select value={range} onChange={(e) => setRange(e.target.value)} style={inp}>
              <option value="1y">1 tahun</option>
              <option value="2y">2 tahun</option>
              <option value="5y">5 tahun</option>
            </select>
          </div>
          <div>
            <label style={lbl}>SMA cepat</label>
            <input type="number" min={2} max={100} value={fast} onChange={(e) => setFast(+e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>SMA lambat</label>
            <input type="number" min={5} max={250} value={slow} onChange={(e) => setSlow(+e.target.value)} style={inp} />
          </div>
        </div>
        <button onClick={run} disabled={busy}
          style={{ background: busy ? 'rgba(26,42,32,0.25)' : C.forest, color: C.cream, border: 'none', padding: '12px 22px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={15} />}
          {busy ? (status || 'Memproses...') : 'Jalankan Backtest'}
        </button>
        {err && <div style={{ fontSize: 13, color: C.red, marginTop: 10 }}>{err}</div>}
      </div>

      {res && (
        <div className="fade-up">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Stat label={`STRATEGI SMA ${fast}/${slow}`} value={fmtPct(res.strat_return)} positive={res.strat_return >= 0} />
            <Stat label={`BELI & TAHAN ${res.symbol}`} value={fmtPct(res.bh_return)} positive={res.bh_return >= 0} />
            <Stat label="TRANSAKSI" value={`${res.trades}×`} />
            <Stat label="DATA" value={`${res.n_days} hari`} />
          </div>

          <div style={{ background: C.cream2, borderRadius: 18, padding: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.cuan} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.cuan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.inkSoft }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: C.inkSoft }} domain={['auto', 'auto']} width={42} />
                <Tooltip
                  contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.cream }}
                  formatter={(v, name) => [v + ' (awal=100)', name === 'strategi' ? `Strategi SMA` : 'Beli & Tahan']}
                />
                <Legend formatter={(v) => v === 'strategi' ? `Strategi SMA ${fast}/${slow}` : 'Beli & Tahan'} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="strategi" stroke={C.cuan} strokeWidth={2.2} fill="url(#btGrad)" dot={false} />
                <Area type="monotone" dataKey="belitahan" stroke={C.inkSoft} strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 12, padding: 12, background: 'rgba(192,57,43,0.08)', borderRadius: 12, fontSize: 11, color: C.red, lineHeight: 1.5 }}>
            &#9432; Backtest = simulasi masa lalu (tanpa biaya transaksi & slippage), bukan jaminan hasil masa depan dan bukan rekomendasi beli/jual.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, positive }) {
  return (
    <div style={{ background: C.cream2, borderRadius: 14, padding: 14 }}>
      <div className="mono" style={{ fontSize: 9, color: C.inkSoft, letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: positive === undefined ? C.ink : (positive ? C.green : C.red) }}>{value}</div>
    </div>
  );
}

function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
