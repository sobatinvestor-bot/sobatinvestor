// src/Account.jsx
// Login/daftar (Supabase Auth) + hook portofolio per-user (CRUD ke tabel holdings,
// digabung harga live dari /api/quotes) + modal tambah/edit saham.
import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Lock, X, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';

const C = {
  cream: '#F4EFE6', cream2: '#EBE3D3', ink: '#1A2A20', inkSoft: '#3A4A40',
  forest: '#1F3B2D', cuan: '#C49B3C', rust: '#B85C38', red: '#C0392B', green: '#2E7D4F',
};

// ============================================================
// Hook: muat holding user + harga live, sediakan fungsi CRUD
// ============================================================
export function usePortfolio(userId) {
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [ihsg, setIhsg] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadHoldings = useCallback(async () => {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) setHoldings(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  // Ambil harga untuk simbol yang dimiliki + IHSG; refresh tiap 60 detik
  useEffect(() => {
    let active = true;
    async function loadPrices() {
      try {
        const syms = holdings.map((h) => h.symbol).join(',');
        const url = syms ? `/api/quotes?symbols=${encodeURIComponent(syms)}` : '/api/quotes';
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const map = {};
        (data.quotes || []).forEach((q) => { map[q.symbol] = q; });
        setPrices(map);
        if (data.ihsg) setIhsg(data.ihsg);
      } catch (e) { console.error('Gagal memuat harga:', e); }
    }
    loadPrices();
    const id = setInterval(loadPrices, 60000);
    return () => { active = false; clearInterval(id); };
  }, [holdings]);

  // Bentuk data "stocks" yang dipakai komponen lama
  const stocks = holdings.map((h) => {
    const live = prices[h.symbol];
    return {
      id: h.id,
      symbol: h.symbol,
      name: h.name || h.symbol,
      sector: h.sector || 'Lainnya',
      qty: Number(h.qty),
      avg: Number(h.avg_price),
      buyDate: h.buy_date || null,
      price: live ? live.price : Number(h.avg_price),
      change: live ? live.change : 0,
    };
  });

  async function addHolding(h) {
    const { error } = await supabase.from('holdings').insert({
      user_id: userId,
      symbol: h.symbol, name: h.name, sector: h.sector,
      qty: h.qty, avg_price: h.avg, buy_date: h.buyDate || null,
    });
    if (error) alert('Gagal menyimpan: ' + error.message);
    await loadHoldings();
  }

  async function updateHolding(h) {
    const { error } = await supabase.from('holdings').update({
      symbol: h.symbol, name: h.name, sector: h.sector,
      qty: h.qty, avg_price: h.avg, buy_date: h.buyDate || null,
    }).eq('id', h.id);
    if (error) alert('Gagal update: ' + error.message);
    await loadHoldings();
  }

  async function deleteHolding(id) {
    const { error } = await supabase.from('holdings').delete().eq('id', id);
    if (error) alert('Gagal hapus: ' + error.message);
    await loadHoldings();
  }

  async function deleteAll() {
    const { error } = await supabase.from('holdings').delete().eq('user_id', userId);
    if (error) alert('Gagal hapus: ' + error.message);
    await loadHoldings();
  }

  return {
    stocks, loading,
    ihsg: ihsg ? ihsg.value : 7800,
    ihsgChange: ihsg ? ihsg.change : 0,
    addHolding, updateHolding, deleteHolding, deleteAll,
  };
}

// ============================================================
// Layar Login / Daftar
// ============================================================
export function Auth({ inline }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setMsg('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg(error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) setMsg(error.message);
        else setMsg('Akun dibuat. Silakan Masuk.');
      }
    } finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: inline ? 'calc(100vh - 180px)' : '100vh', background: C.cream, color: C.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {!inline && (
        <div className="serif" style={{ fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 26 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.cuan }} />
          sobat<span style={{ color: C.cuan }}>.</span>investor
        </div>
      )}
      <div style={{ background: C.cream2, borderRadius: 24, padding: 28, width: '100%', maxWidth: 380 }}>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 600, marginBottom: 6 }}>{mode === 'login' ? 'Masuk' : 'Daftar'}</h1>
        <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 22 }}>
          {mode === 'login' ? 'Dashboard portofolio pribadimu.' : 'Buat akun, simpan portofolio sendiri.'}
        </p>
        <Field icon={Mail} placeholder="email@kamu.com" value={email} onChange={setEmail} />
        <Field icon={Lock} placeholder="password (min 6 karakter)" type="password" value={pw} onChange={setPw} />
        {msg && <div style={{ fontSize: 13, color: C.rust, margin: '6px 2px 0' }}>{msg}</div>}
        <button onClick={submit} disabled={busy || !email || pw.length < 6}
          style={{ width: '100%', background: (busy || !email || pw.length < 6) ? 'rgba(26,42,32,0.25)' : C.forest, color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>
          {busy ? 'Memproses…' : (mode === 'login' ? 'Masuk' : 'Buat Akun')}
        </button>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: C.inkSoft }}>
          {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(''); }}
            style={{ background: 'none', border: 'none', color: C.forest, fontWeight: 700, cursor: 'pointer' }}>
            {mode === 'login' ? 'Daftar' : 'Masuk'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, placeholder, value, onChange, type = 'text' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.cream, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
      <Icon size={16} color={C.inkSoft} />
      <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: C.ink, fontFamily: 'inherit' }} />
    </div>
  );
}

export function logout() { supabase.auth.signOut(); }

// ============================================================
// Modal tambah / edit saham
// ============================================================
export function Editor({ holding, onSave, onClose }) {
  const isNew = !holding.id;
  const [f, setF] = useState({
    symbol: holding.symbol || '', name: holding.name || '', sector: holding.sector || 'Lainnya',
    qty: holding.qty || '', avg: holding.avg || '', buyDate: holding.buyDate || '', id: holding.id,
  });
  const valid = f.symbol.trim() && Number(f.qty) > 0 && Number(f.avg) > 0;
  const Lbl = ({ t }) => <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: C.inkSoft, margin: '10px 0 5px', textTransform: 'uppercase' }}>{t}</div>;
  const inp = { width: '100%', background: C.cream2, border: 'none', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: '24px 24px 0 0', padding: 24, width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 className="serif" style={{ fontSize: 20, fontWeight: 600 }}>{isNew ? 'Tambah Saham' : 'Edit Saham'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color={C.inkSoft} /></button>
        </div>
        <Lbl t="Kode saham" />
        <input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} placeholder="mis. BBCA" style={inp} />
        <Lbl t="Nama (opsional)" />
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Bank Central Asia" style={inp} />
        <Lbl t="Sektor" />
        <select value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} style={inp}>
          {['Perbankan & Keuangan', 'Energi', 'Tambang & Barang Baku', 'Industri', 'Barang Konsumer Primer', 'Barang Konsumer Non-Primer', 'Kesehatan', 'Properti & Real Estate', 'Teknologi', 'Infrastruktur', 'Transportasi & Logistik', 'Telekomunikasi', 'Utilitas', 'Lainnya'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Lbl t="Jumlah (lembar)" /><input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="100" style={inp} /></div>
          <div style={{ flex: 1 }}><Lbl t="Harga rata-rata" /><input type="number" value={f.avg} onChange={(e) => setF({ ...f, avg: e.target.value })} placeholder="9800" style={inp} /></div>
        </div>
        <Lbl t="Tanggal beli (opsional)" />
        <input type="date" value={f.buyDate || ''} onChange={(e) => setF({ ...f, buyDate: e.target.value })} style={inp} />
        <button disabled={!valid} onClick={() => onSave({ ...f, qty: Number(f.qty), avg: Number(f.avg) })}
          style={{ width: '100%', background: valid ? C.forest : 'rgba(26,42,32,0.2)', color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: valid ? 'pointer' : 'not-allowed', marginTop: 14 }}>
          {isNew ? 'Simpan ke Portofolio' : 'Update'}
        </button>
      </div>
    </div>
  );
}
