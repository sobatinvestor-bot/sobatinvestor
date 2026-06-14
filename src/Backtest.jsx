import React, { useState } from 'react';
import { ComposedChart, Area, Scatter, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, ReferenceLine } from 'recharts';
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

# Dividen per indeks hari (kosong jika mode tanpa reinvest)
div_map = {}
for d in data.get("divs", []):
    div_map[d["i"]] = div_map.get(d["i"], 0.0) + float(d["amount"])

# Strategi: pegang saham saat SMA cepat > SMA lambat; dividen di-reinvest saat pegang
cash, shares, pos, trades = 1.0, 0.0, 0, 0
equity = []
trade_log = []
div_count = 0
for i, c in enumerate(closes):
    if i in div_map and shares > 0:
        shares += (shares * div_map[i]) / c  # reinvest dividen ke saham yg sama
        div_count += 1
    if f[i] is not None and s[i] is not None:
        if f[i] > s[i] and pos == 0:
            shares = cash / c; cash = 0.0; pos = 1; trades += 1
            trade_log.append({"i": i, "type": "buy", "price": c})
        elif f[i] < s[i] and pos == 1:
            cash = shares * c; shares = 0.0; pos = 0; trades += 1
            trade_log.append({"i": i, "type": "sell", "price": c})
    equity.append(cash + shares * c)

# Beli & tahan: beli di hari pertama, dividen juga di-reinvest
sh_bh = 1.0 / closes[0]
buyhold = []
for i, c in enumerate(closes):
    if i in div_map:
        sh_bh += (sh_bh * div_map[i]) / c
    buyhold.append(sh_bh * c)

result = json.dumps({
    "dates": dates,
    "equity": equity,
    "buyhold": buyhold,
    "strat_return": (equity[-1] - 1) * 100,
    "bh_return": (buyhold[-1] - 1) * 100,
    "trades": trades,
    "trade_log": trade_log,
    "div_count": div_count,
    "n_days": len(closes),
})
result
`;

export default function Backtest() {
  const [symbol, setSymbol] = useState('ADRO');
  const [range, setRange] = useState('2y');
  const [fast, setFast] = useState(20);
  const [slow, setSlow] = useState(50);
  const [divMode, setDivMode] = useState('tanpa'); // 'tanpa' | 'reinvest'
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

      // Dividen (hanya saat mode reinvest): petakan ex-date ke indeks hari di series
      let divs = [];
      if (divMode === 'reinvest') {
        setStatus('Mengambil data dividen...');
        try {
          const rd = await fetch(`/api/dividends?symbols=${encodeURIComponent(sym)}&range=${range}`);
          if (rd.ok) {
            const dd = await rd.json();
            (dd.dividends || []).forEach((dv) => {
              const exT = new Date(dv.exDate).getTime();
              const idx = series.findIndex((p) => p.t >= exT);
              if (idx > 0 && dv.amount > 0) divs.push({ i: idx, amount: dv.amount });
            });
          }
        } catch { /* tanpa dividen jika gagal — hasil tetap valid sebagai price-return */ }
      }

      const pyodide = await ensurePyodide(setStatus);
      setStatus('Menjalankan backtest (Python)...');
      const payload = {
        closes: series.map((p) => p.close),
        dates: series.map((p) => new Date(p.t).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })),
        fast, slow,
        divs,
      };
      pyodide.globals.set('input_json', JSON.stringify(payload));
      const out = pyodide.runPython(PY_BACKTEST);
      const parsed = JSON.parse(out);
      const fullDates = series.map((p) => new Date(p.t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }));
      const divIdx = [...new Set(divs.map((d) => d.i))].sort((a, b) => a - b);
      setRes({ ...parsed, symbol: sym, fullDates, divIdx });
      setStatus('');
    } catch (e) {
      setErr(e.message || 'Terjadi kesalahan.');
      setStatus('');
    } finally { setBusy(false); }
  }

  const chartData = res
    ? res.dates.map((dt, i) => {
        const trade = (res.trade_log || []).find((t) => t.i === i);
        const eq = +(res.equity[i] * 100).toFixed(1);
        return {
          i,
          label: dt,
          strategi: eq,
          belitahan: +(res.buyhold[i] * 100).toFixed(1),
          beli: trade && trade.type === 'buy' ? eq : null,
          jual: trade && trade.type === 'sell' ? eq : null,
        };
      })
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
          <div>
            <label style={lbl}>Dividen</label>
            <select value={divMode} onChange={(e) => setDivMode(e.target.value)} style={inp}>
              <option value="tanpa">Tanpa</option>
              <option value="reinvest">Dengan Reinvest</option>
            </select>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 6 }}>
            <Stat
              label={`STRATEGI SMA ${fast}/${slow}`}
              value={fmtPct(res.strat_return)}
              positive={res.strat_return >= 0}
              sub={`${res.trades}× transaksi${(res.divIdx && res.divIdx.length > 0) ? ` · kebagian dividen ${res.div_count} dari ${res.divIdx.length}` : ''}`}
            />
            <Stat
              label={`BELI & TAHAN ${res.symbol}`}
              value={fmtPct(res.bh_return)}
              positive={res.bh_return >= 0}
              sub={(res.divIdx && res.divIdx.length > 0) ? `0× transaksi · kebagian semua ${res.divIdx.length} dividen` : 'hanya pergerakan harga (tanpa dividen)'}
            />
          </div>
          <div className="mono" style={{ fontSize: 10, color: C.inkSoft, marginBottom: 14 }}>Data: {res.n_days} hari perdagangan</div>

          <div style={{ background: C.cream2, borderRadius: 18, padding: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.cuan} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={C.cuan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10, fill: C.inkSoft }} minTickGap={40} tickFormatter={(v) => (res.dates && res.dates[v]) || ''} />
                <YAxis tick={{ fontSize: 10, fill: C.inkSoft }} domain={['auto', 'auto']} width={42} tickFormatter={(v) => { const r = Math.round(v - 100); return (r > 0 ? '+' : '') + r + '%'; }} />
                <ReferenceLine y={100} stroke={C.inkSoft} strokeDasharray="3 3" strokeOpacity={0.5} />
                {(res.divIdx || []).map((di) => (
                  <ReferenceLine key={di} x={di} stroke={C.cuan} strokeDasharray="2 4" strokeWidth={1.3} />
                ))}
                <Tooltip
                  contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.cream }}
                  labelFormatter={(v) => (res.fullDates && res.fullDates[v]) || (res.dates && res.dates[v]) || v}
                  formatter={(v, name) => {
                    const nm = { strategi: `Strategi SMA`, belitahan: 'Beli & Tahan', beli: '▲ BELI', jual: '▼ JUAL' }[name] || name;
                    const r = v - 100;
                    return [(r >= 0 ? '+' : '') + r.toFixed(1) + '%', nm];
                  }}
                />
                <Legend formatter={(v) => ({ strategi: `Strategi SMA ${fast}/${slow}`, belitahan: 'Beli & Tahan', beli: 'Beli', jual: 'Jual' }[v] || v)} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="strategi" stroke={C.cuan} strokeWidth={2.2} fill="url(#btGrad)" dot={false} />
                <Area type="monotone" dataKey="belitahan" stroke={C.inkSoft} strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />
                <Scatter dataKey="beli" fill={C.green} shape="triangle" legendType="triangle" />
                <Scatter dataKey="jual" fill={C.red} shape="diamond" legendType="diamond" />
              </ComposedChart>
            </ResponsiveContainer>
            {res.divIdx && res.divIdx.length > 0 && (
              <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 6 }}>
                <span style={{ color: C.cuan, fontWeight: 700 }}>┊</span> garis emas vertikal = tanggal ex-dividen ({res.divIdx.length}×)
              </div>
            )}
          </div>

          {res.trade_log && res.trade_log.length > 0 && (
            <div style={{ background: C.cream2, borderRadius: 18, padding: 16, marginTop: 12 }}>
              <div className="mono" style={{ fontSize: 10, color: C.inkSoft, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Riwayat sinyal ({res.trade_log.length})</div>
              {res.trade_log.map((t, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, padding: '7px 0', borderBottom: idx < res.trade_log.length - 1 ? '1px solid rgba(26,42,32,0.06)' : 'none', fontSize: 13, alignItems: 'center' }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: 11, color: t.type === 'buy' ? C.green : C.red }}>
                    {t.type === 'buy' ? '▲ BELI' : '▼ JUAL'}
                  </span>
                  <span style={{ color: C.inkSoft, fontSize: 12 }}>{res.fullDates && res.fullDates[t.i] ? res.fullDates[t.i] : res.dates[t.i]}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{Math.round(t.price).toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, padding: 12, background: 'rgba(192,57,43,0.08)', borderRadius: 12, fontSize: 11, color: C.red, lineHeight: 1.5 }}>
            &#9432; Backtest = simulasi masa lalu (tanpa biaya transaksi & slippage), bukan jaminan hasil masa depan dan bukan rekomendasi beli/jual.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, positive, sub }) {
  return (
    <div style={{ background: C.cream2, borderRadius: 14, padding: 14 }}>
      <div className="mono" style={{ fontSize: 9, color: C.inkSoft, letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div className="serif" style={{ fontSize: 24, fontWeight: 600, color: positive === undefined ? C.ink : (positive ? C.green : C.red) }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
