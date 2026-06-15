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
  // Fee transaksi (persen) + saldo RDN — dimuat dari user_settings, default praktik umum IDX
  const [settings, setSettings] = useState({ fee_buy: 0.15, fee_sell: 0.15, tax_sell: 0.10, rdn: 0 });

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('user_settings').select('fee_buy,fee_sell,tax_sell,rdn').maybeSingle();
    if (data) setSettings(data);
  }, []);
  useEffect(() => { if (userId) loadSettings(); }, [userId, loadSettings]);
  useEffect(() => {
    const h = () => loadSettings();
    window.addEventListener('sobat-rdn-changed', h);
    return () => window.removeEventListener('sobat-rdn-changed', h);
  }, [loadSettings]);

  // Mutasi saldo RDN atomik via RPC; best-effort (tabel belum ada -> diabaikan)
  async function adjustRdn(delta, note = null, eventDate = null) {
    const { data, error } = await supabase.rpc('adjust_rdn', { p_delta: Math.round(delta), p_note: note, p_event_date: eventDate || null });
    if (!error && data !== null) {
      setSettings((p) => ({ ...p, rdn: Number(data) }));
      window.dispatchEvent(new Event('sobat-rdn-changed'));
    } else if (error) console.warn('RDN tidak terupdate:', error.message);
  }

  async function saveFees(f) {
    const row = { user_id: userId, fee_buy: Number(f.fee_buy), fee_sell: Number(f.fee_sell), tax_sell: Number(f.tax_sell) };
    const { error } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
    if (error) alert('Gagal menyimpan fee: ' + error.message);
    else setSettings((p) => ({ ...p, ...row }));
  }

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

  // Catat transaksi ke riwayat (best-effort: kegagalan tidak memblokir simpan holdings)
  async function recordLot(h, side = 'buy') {
    const { error } = await supabase.from('lots').insert({
      user_id: userId, symbol: h.symbol, qty: h.qty, price: h.avg, buy_date: h.buyDate || null, side,
    });
    if (error) console.warn('Riwayat lot tidak tercatat:', error.message);
    else window.dispatchEvent(new Event('sobat-lots-changed'));
  }

  async function addHolding(h) {
    // Jika emiten sudah ada di portofolio: gabungkan (averaging), jangan tolak.
    // qty dijumlah, avg_price = rata-rata tertimbang, buy_date pakai yang paling awal.
    const existing = holdings.find((x) => x.symbol === h.symbol);
    if (existing) {
      const oldQty = Number(existing.qty);
      const newQty = oldQty + h.qty;
      const mergedAvg = Math.round(((oldQty * Number(existing.avg_price)) + (h.qty * h.avg)) / newQty * 100) / 100;
      const dates = [existing.buy_date, h.buyDate].filter(Boolean).sort();
      const { error } = await supabase.from('holdings').update({
        qty: newQty, avg_price: mergedAvg,
        buy_date: dates[0] || null,
        // nama/sektor lama dipertahankan kecuali sebelumnya kosong
        name: existing.name || h.name, sector: existing.sector || h.sector,
      }).eq('id', existing.id);
      if (error) alert('Gagal menggabungkan: ' + error.message);
      else {
        await recordLot(h);
        await adjustRdn(-(h.qty * h.avg) * (1 + settings.fee_buy / 100), `Beli ${h.symbol}`, h.buyDate || null);
        alert(`${h.symbol} digabung: ${newQty} lembar @ rata-rata Rp${mergedAvg.toLocaleString('id-ID')}`);
      }
      await loadHoldings();
      return;
    }
    const { error } = await supabase.from('holdings').insert({
      user_id: userId,
      symbol: h.symbol, name: h.name, sector: h.sector,
      qty: h.qty, avg_price: h.avg, buy_date: h.buyDate || null,
    });
    if (error) {
      if ((error.message || '').includes('duplicate key')) {
        await loadHoldings();
        alert(`${h.symbol} ternyata sudah ada di portofolio (mungkin ditambah dari perangkat lain). Coba simpan sekali lagi untuk menggabungkannya.`);
        return;
      }
      alert('Gagal menyimpan: ' + error.message);
      return;
    }
    await recordLot(h);
    await adjustRdn(-(h.qty * h.avg) * (1 + settings.fee_buy / 100), `Beli ${h.symbol}`, h.buyDate || null);
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

  async function sellHolding(holding, s) {
    const owned = Number(holding.qty);
    if (s.qty > owned) { alert(`Jumlah jual (${s.qty}) melebihi kepemilikan (${owned} lembar).`); return; }
    const sisa = owned - s.qty;
    let error;
    if (sisa === 0) {
      // jual habis: hapus baris holding, riwayat lots SENGAJA dipertahankan
      ({ error } = await supabase.from('holdings').delete().eq('id', holding.id));
    } else {
      ({ error } = await supabase.from('holdings').update({ qty: sisa }).eq('id', holding.id));
    }
    if (error) { alert('Gagal menjual: ' + error.message); return; }
    await recordLot({ symbol: holding.symbol, qty: s.qty, avg: s.price, buyDate: s.date || null }, 'sell');
    const gross = s.qty * s.price;
    const potongan = gross * ((settings.fee_sell + settings.tax_sell) / 100);
    const net = gross - potongan;
    await adjustRdn(net, `Jual ${holding.symbol}`, s.date || null);
    const realized = (s.price - Number(holding.avg_price)) * s.qty;
    const tanda = realized >= 0 ? '+' : '-';
    alert(`${holding.symbol} terjual ${s.qty.toLocaleString('id-ID')} lembar @ Rp${s.price.toLocaleString('id-ID')}. P/L terealisasi: ${tanda}Rp${Math.abs(Math.round(realized)).toLocaleString('id-ID')}. Masuk RDN (setelah fee+pajak ${(settings.fee_sell + settings.tax_sell).toLocaleString('id-ID')}%): Rp${Math.round(net).toLocaleString('id-ID')}${sisa === 0 ? '. Posisi habis.' : ''}`);
    await loadHoldings();
  }

  async function deleteHolding(id) {
    const sym = (holdings.find((x) => x.id === id) || {}).symbol;
    const { error } = await supabase.from('holdings').delete().eq('id', id);
    if (error) alert('Gagal hapus: ' + error.message);
    else if (sym) {
      await supabase.from('lots').delete().eq('user_id', userId).eq('symbol', sym);
      window.dispatchEvent(new Event('sobat-lots-changed'));
    }
    await loadHoldings();
  }

  async function deleteAll() {
    const { error } = await supabase.from('holdings').delete().eq('user_id', userId);
    if (error) alert('Gagal hapus: ' + error.message);
    else {
      await supabase.from('lots').delete().eq('user_id', userId);
      window.dispatchEvent(new Event('sobat-lots-changed'));
    }
    await loadHoldings();
  }

  return {
    stocks, loading,
    ihsg: ihsg ? ihsg.value : 7800,
    ihsgChange: ihsg ? ihsg.change : 0,
    addHolding, updateHolding, deleteHolding, deleteAll, sellHolding,
    settings, adjustRdn, saveFees,
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
  const [showAsk, setShowAsk] = useState(false);
  const [askEmail, setAskEmail] = useState('');
  const [askMsg, setAskMsg] = useState('');
  const [askWebsite, setAskWebsite] = useState(''); // honeypot
  const [askBusy, setAskBusy] = useState(false);
  const [askSent, setAskSent] = useState(false);
  const [askErr, setAskErr] = useState('');

  async function sendAsk() {
    setAskBusy(true); setAskErr('');
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: askEmail.trim(), message: askMsg.trim(), website: askWebsite }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) setAskSent(true);
      else setAskErr(d.error || 'Gagal mengirim. Coba lagi.');
    } catch {
      setAskErr('Gagal terhubung. Coba lagi.');
    } finally { setAskBusy(false); }
  }

  async function submit() {
    setBusy(true); setMsg('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pw });
        if (error) setMsg(error.message);
        else if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMsg('Email ini sudah terdaftar. Silakan Masuk.');
        } else {
          setMsg('Akun dibuat. Silakan buka email kamu dan konfirmasi.');
        }
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
        <Field icon={Lock} placeholder={mode === 'login' ? 'password' : 'password (min 8: huruf besar, kecil & angka)'} type="password" value={pw} onChange={setPw} />
        {msg && <div style={{ fontSize: 13, color: C.rust, margin: '6px 2px 0' }}>{msg}</div>}
        <button onClick={submit} disabled={busy || !email || pw.length < (mode === 'login' ? 6 : 8)}
          style={{ width: '100%', background: (busy || !email || pw.length < (mode === 'login' ? 6 : 8)) ? 'rgba(26,42,32,0.25)' : C.forest, color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>
          {busy ? 'Memproses…' : (mode === 'login' ? 'Masuk' : 'Buat Akun')}
        </button>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: C.inkSoft }}>
          {mode === 'login' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(''); }}
            style={{ background: 'none', border: 'none', color: C.forest, fontWeight: 700, cursor: 'pointer' }}>
            {mode === 'login' ? 'Daftar' : 'Masuk'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, color: C.inkSoft }}>
          Ada kendala?{' '}
          <button onClick={() => setShowAsk(!showAsk)}
            style={{ background: 'none', border: 'none', color: C.forest, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            Klik di sini untuk tanya admin
          </button>
        </div>
        {showAsk && (
          <div style={{ marginTop: 14, borderTop: `1px solid rgba(26,42,32,0.1)`, paddingTop: 14 }}>
            {askSent ? (
              <div style={{ fontSize: 13, color: C.forest, fontWeight: 600, textAlign: 'center' }}>
                Terkirim! Admin akan membalas ke email kamu. 🌱
              </div>
            ) : (
              <>
                <Field icon={Mail} placeholder="email kamu (untuk dibalas)" value={askEmail} onChange={setAskEmail} />
                <textarea
                  value={askMsg}
                  onChange={(e) => setAskMsg(e.target.value)}
                  placeholder="Tulis pertanyaan atau kendalamu di sini..."
                  rows={3}
                  maxLength={2000}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none', background: C.cream, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
                />
                {/* honeypot anti-bot — disembunyikan dari manusia */}
                <input type="text" value={askWebsite} onChange={(e) => setAskWebsite(e.target.value)} style={{ display: 'none' }} tabIndex={-1} autoComplete="off" aria-hidden="true" />
                {askErr && <div style={{ fontSize: 12, color: C.rust, marginBottom: 8 }}>{askErr}</div>}
                <button onClick={sendAsk} disabled={askBusy || !askEmail || askMsg.trim().length < 10}
                  style={{ width: '100%', background: (askBusy || !askEmail || askMsg.trim().length < 10) ? 'rgba(26,42,32,0.25)' : C.cuan, color: C.ink, border: 'none', padding: 12, borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {askBusy ? 'Mengirim…' : 'Kirim ke Admin'}
                </button>
              </>
            )}
          </div>
        )}
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
// 11 sektor resmi IDX-IC + Lainnya (label lama di data tersimpan tetap dirender via legacyOpt)
const IDX_SECTORS = [
  'Energi', 'Barang Baku', 'Perindustrian', 'Barang Konsumer Primer', 'Barang Konsumer Non-Primer',
  'Kesehatan', 'Keuangan', 'Properti & Real Estat', 'Teknologi', 'Infrastruktur',
  'Transportasi & Logistik', 'Lainnya',
];

export function Editor({ holding, onSave, onClose }) {
  const isNew = !holding.id;
  const [f, setF] = useState({
    symbol: holding.symbol || '', name: holding.name || '', sector: holding.sector || 'Lainnya',
    qty: holding.qty || '', avg: holding.avg || '', buyDate: holding.buyDate || '', id: holding.id,
  });
  // Auto-isi sektor (+ nama jika kosong) dari tabel referensi resmi stock_directory.
  // found: null = belum dicek / kode belum 4 huruf; true/false = hasil lookup.
  const [found, setFound] = useState(null);
  useEffect(() => {
    const sym = f.symbol.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(sym)) { setFound(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('stock_directory').select('symbol,name,sector').eq('symbol', sym).maybeSingle();
      if (!alive) return;
      if (data) {
        setFound(true);
        setF((p) => ({ ...p, sector: data.sector, name: p.name.trim() ? p.name : (data.name || '') }));
      } else {
        setFound(false);
      }
    }, 350); // debounce: tunggu user selesai mengetik
    return () => { alive = false; clearTimeout(t); };
  }, [f.symbol]);
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
        <input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} placeholder="mis. ADRO" style={inp} />
        <Lbl t="Nama (opsional)" />
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Alamtri Resources Indonesia" style={inp} />
        <Lbl t="Sektor" />
        <select value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} style={inp}>
          {/* label lama (mis. "Utilitas", "Tambang & Barang Baku") tetap tampil agar data lama tidak blank */}
          {!IDX_SECTORS.includes(f.sector) && <option value={f.sector}>{f.sector}</option>}
          {IDX_SECTORS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {found === true && (
          <div style={{ fontSize: 11, color: C.green, marginTop: 5 }}>Sektor terisi otomatis dari klasifikasi resmi IDX</div>
        )}
        {found === false && (
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 5 }}>Kode tidak ada di direktori - pilih sektor manual</div>
        )}
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

// ============================================================
// Riwayat pembelian (tabel lots) — kartu collapsible, mandiri.
// Pasang di App.jsx: <LotsHistory userId={userId} />
// ============================================================
export function LotsHistory({ userId }) {
  const [open, setOpen] = useState(false);
  const [lots, setLots] = useState(null); // null = belum dimuat

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('lots')
      .select('id,symbol,qty,price,buy_date,created_at,side')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    setLots(error ? [] : (data || []));
  }, [userId]);

  useEffect(() => {
    if (open && lots === null) load();
  }, [open, lots, load]);

  useEffect(() => {
    const h = () => { if (open) load(); else setLots(null); };
    window.addEventListener('sobat-lots-changed', h);
    return () => window.removeEventListener('sobat-lots-changed', h);
  }, [open, load]);

  const fmtTgl = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ background: C.cream, borderRadius: 16, marginTop: 16, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>Riwayat Pembelian</span>
        <span className="mono" style={{ fontSize: 11, color: C.inkSoft }}>{open ? 'tutup' : 'lihat'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid rgba(26,42,32,0.08)' }}>
          {lots === null && <div style={{ padding: 16, fontSize: 13, color: C.inkSoft }}>Memuat...</div>}
          {lots !== null && lots.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: C.inkSoft }}>
              Belum ada riwayat. Transaksi tercatat otomatis setiap kali kamu menambah saham.
            </div>
          )}
          {lots !== null && lots.map((l) => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '11px 16px', borderBottom: '1px solid rgba(26,42,32,0.06)', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{l.symbol}</span>
                <span className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', marginLeft: 8, color: l.side === 'sell' ? C.rust : C.green }}>
                  {l.side === 'sell' ? 'JUAL' : 'BELI'}
                </span>
                <span className="mono" style={{ fontSize: 12, color: C.inkSoft, marginLeft: 6 }}>
                  {Number(l.qty).toLocaleString('id-ID')} lbr @ Rp{Number(l.price).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="mono" style={{ fontSize: 10, color: C.inkSoft, textAlign: 'right' }}>
                {l.buy_date ? `beli ${fmtTgl(l.buy_date)}` : `dicatat ${fmtTgl(l.created_at)}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ============================================================
// Modal jual/kurangi saham. Pasang di App.jsx (PrivateArea).
// ============================================================
export function SellEditor({ holding, onSell, onClose, fees = { fee_sell: 0.15, tax_sell: 0.10 } }) {
  const [f, setF] = useState({ qty: '', price: '', date: '' });
  const owned = Number(holding.qty);
  const q = Number(f.qty), p = Number(f.price);
  const valid = q > 0 && q <= owned && p > 0;
  const inp = { width: '100%', padding: '12px 14px', borderRadius: 12, border: 'none', background: C.cream2, fontSize: 14, fontFamily: 'inherit', color: C.ink, outline: 'none', boxSizing: 'border-box' };
  const lbl = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: C.inkSoft, textTransform: 'uppercase', display: 'block', margin: '14px 0 6px' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: C.cream, borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="serif" style={{ fontSize: 20, fontWeight: 600 }}>Jual {holding.symbol}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: C.inkSoft }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
          Dimiliki: {owned.toLocaleString('id-ID')} lembar @ rata-rata Rp{Number(holding.avg_price).toLocaleString('id-ID')}
        </div>
        <span style={lbl}>Jumlah dijual (lembar)</span>
        <input type="number" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder={`maks. ${owned}`} style={inp} />
        {q > owned && <div style={{ fontSize: 11, color: C.red, marginTop: 5 }}>Melebihi jumlah yang dimiliki</div>}
        <span style={lbl}>Harga jual / lembar</span>
        <input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="mis. 1250" style={inp} />
        {valid && (
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
            <div style={{ color: (p - Number(holding.avg_price)) >= 0 ? C.green : C.red }}>
              P/L terealisasi: {((p - Number(holding.avg_price)) * q >= 0 ? '+' : '-')}Rp{Math.abs(Math.round((p - Number(holding.avg_price)) * q)).toLocaleString('id-ID')}
            </div>
            <div style={{ color: C.inkSoft }}>
              Fee {Number(fees.fee_sell).toLocaleString('id-ID')}% + pajak {Number(fees.tax_sell).toLocaleString('id-ID')}% = -Rp{Math.round(q * p * ((Number(fees.fee_sell) + Number(fees.tax_sell)) / 100)).toLocaleString('id-ID')}
            </div>
            <div style={{ color: C.ink, fontWeight: 600 }}>
              Masuk RDN: Rp{Math.round(q * p * (1 - (Number(fees.fee_sell) + Number(fees.tax_sell)) / 100)).toLocaleString('id-ID')}
            </div>
          </div>
        )}
        <span style={lbl}>Tanggal jual (opsional)</span>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={inp} />
        <button disabled={!valid} onClick={() => { onSell(holding, { qty: q, price: p, date: f.date }); onClose(); }}
          style={{ width: '100%', marginTop: 18, padding: '13px 0', borderRadius: 999, border: 'none', cursor: valid ? 'pointer' : 'default', background: valid ? C.rust : 'rgba(26,42,32,0.12)', color: valid ? '#fff' : C.inkSoft, fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
          Jual
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Kartu RDN — saldo kas virtual + setor/tarik + pengaturan fee.
// Pasang di App.jsx: <RdnCard settings={settings} onAdjust={adjustRdn} onSaveFees={saveFees} />
// ============================================================
export function RdnCard({ settings, onAdjust, onSaveFees, userId }) {
  const [nominal, setNominal] = useState('');
  const [showFee, setShowFee] = useState(false);
  const [fee, setFee] = useState(null);
  const [showHist, setShowHist] = useState(false);
  const [ledger, setLedger] = useState(null);
  const f = fee || settings;
  const n = Number(nominal);

  const loadLedger = useCallback(async () => {
    if (!userId) { setLedger([]); return; }
    const { data, error } = await supabase
      .from('rdn_ledger').select('id,delta,note,balance,created_at,event_date')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    setLedger(error ? [] : (data || []));
  }, [userId]);

  useEffect(() => { if (showHist && ledger === null) loadLedger(); }, [showHist, ledger, loadLedger]);
  useEffect(() => {
    const h = () => { if (showHist) loadLedger(); else setLedger(null); };
    window.addEventListener('sobat-rdn-changed', h);
    return () => window.removeEventListener('sobat-rdn-changed', h);
  }, [showHist, loadLedger]);

  const fmtTgl = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const inp = { background: C.cream2, border: 'none', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: C.ink, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
  const btn = (bg) => ({ border: 'none', borderRadius: 999, padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: bg, color: '#fff', fontFamily: 'inherit' });
  return (
    <div style={{ background: C.cream, borderRadius: 16, marginTop: 16, padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>Rekening Dana (RDN)</span>
        <button onClick={() => { setShowFee(!showFee); setFee(null); }} title="Atur fee & pajak" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: C.inkSoft, fontFamily: 'inherit' }} className="mono">
          ⚙
        </button>
      </div>
      <div className="serif" style={{ fontSize: 24, fontWeight: 600, marginTop: 6, color: Number(settings.rdn) >= 0 ? C.green : C.red }}>
        Rp{Math.round(Number(settings.rdn)).toLocaleString('id-ID')}
      </div>
      <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 2 }}>
        hasil jual &amp; dividen (gros belum fee dan pajak)
      </div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 14, marginBottom: 6 }}>
        Sesuaikan Saldo dengan Setor/Tarik :
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
        <input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="nominal setor / tarik" style={inp} />
        <button disabled={!(n > 0)} onClick={() => { onAdjust(n, 'Setor'); setNominal(''); }} style={btn(n > 0 ? C.green : 'rgba(26,42,32,0.15)')}>Setor</button>
        <button disabled={!(n > 0)} onClick={() => { onAdjust(-n, 'Tarik'); setNominal(''); }} style={btn(n > 0 ? C.rust : 'rgba(26,42,32,0.15)')}>Tarik</button>
      </div>
      {showFee && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(26,42,32,0.08)', paddingTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[['fee_buy', 'Fee beli %'], ['fee_sell', 'Fee jual %'], ['tax_sell', 'Pajak jual %']].map(([k, label]) => (
              <div key={k}>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '0.06em', color: C.inkSoft, marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
                <input type="number" step="0.01" value={f[k]} onChange={(e) => setFee({ ...f, [k]: e.target.value })} style={inp} />
              </div>
            ))}
          </div>
          <button onClick={() => { onSaveFees(f); setShowFee(false); setFee(null); }} style={{ ...btn(C.forest), marginTop: 10, width: '100%' }}>Simpan Fee</button>
        </div>
      )}

      <button onClick={() => setShowHist(!showHist)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: C.inkSoft, fontFamily: 'inherit', marginTop: 14, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }} className="mono">
        Riwayat RDN {showHist ? '▴' : '▾'}
      </button>
      {showHist && (
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(26,42,32,0.08)' }}>
          {ledger === null && <div style={{ padding: '12px 0', fontSize: 13, color: C.inkSoft }}>Memuat…</div>}
          {ledger !== null && ledger.length === 0 && (
            <div style={{ padding: '12px 0', fontSize: 13, color: C.inkSoft }}>Belum ada mutasi RDN.</div>
          )}
          {ledger !== null && ledger.map((l) => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '9px 0', borderBottom: '1px solid rgba(26,42,32,0.06)', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 12, color: C.ink }}>{l.note || (Number(l.delta) >= 0 ? 'Masuk' : 'Keluar')}</span>
                <span className="mono" style={{ fontSize: 10, color: C.inkSoft, marginLeft: 8 }}>{fmtTgl(l.event_date || l.created_at)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: Number(l.delta) >= 0 ? C.green : C.red }}>
                  {Number(l.delta) >= 0 ? '+' : '-'}Rp{Math.abs(Math.round(Number(l.delta))).toLocaleString('id-ID')}
                </div>
                {l.balance != null && (
                  <div className="mono" style={{ fontSize: 9, color: C.inkSoft }}>saldo Rp{Math.round(Number(l.balance)).toLocaleString('id-ID')}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ============================================================
// Berita per-emiten (Google News RSS via /api/news).
// Hanya judul + sumber + tautan ke artikel asli (legal: tautan balik).
// Pasang di App.jsx: <StockNews symbols={stocks.map(s => s.symbol)} />
// ============================================================
export function StockNews({ stocks }) {
  const tokens = (stocks || []).map((s) => s.name ? `${s.symbol}|${s.name}` : s.symbol);
  const symKey = tokens.join(',');
  const [news, setNews] = useState(symKey ? null : []);

  useEffect(() => {
    if (!symKey) { setNews([]); return; }
    let active = true;
    setNews(null);
    fetch(`/api/news?symbols=${encodeURIComponent(symKey)}&limit=20`)
      .then((r) => (r.ok ? r.json() : { news: [] }))
      .then((d) => { if (active) setNews(d.news || []); })
      .catch(() => { if (active) setNews([]); });
    return () => { active = false; };
  }, [symKey]);

  const fmtWaktu = (iso) => {
    const d = new Date(iso), now = Date.now(), diff = (now - d.getTime()) / 1000;
    if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + ' menit lalu';
    if (diff < 86400) return Math.floor(diff / 3600) + ' jam lalu';
    if (diff < 604800) return Math.floor(diff / 86400) + ' hari lalu';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  return (
    <div style={{ background: C.cream, borderRadius: 16, marginTop: 16, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
        <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>Berita Sahammu</span>
        <span className="mono" style={{ fontSize: 10, color: C.inkSoft, letterSpacing: '0.08em' }}>TERBARU</span>
      </div>
      <div style={{ borderTop: '1px solid rgba(26,42,32,0.08)' }}>
        {news === null && <div style={{ padding: 16, fontSize: 13, color: C.inkSoft }}>Memuat berita…</div>}
        {news !== null && news.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: C.inkSoft }}>Belum ada berita terbaru untuk sahammu.</div>
        )}
        {news !== null && news.map((n, i) => (
          <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', padding: '12px 16px', borderBottom: '1px solid rgba(26,42,32,0.06)', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
              <span className="mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: C.cuan }}>{n.symbol}</span>
              <span className="mono" style={{ fontSize: 10, color: C.inkSoft }}>{n.source}{n.source ? ' · ' : ''}{fmtWaktu(n.date)}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.4, color: C.ink }}>{n.title}</div>
          </a>
        ))}
        {news !== null && news.length > 0 && (
          <div style={{ padding: '10px 16px', fontSize: 10, color: C.inkSoft }}>
            Sumber: Google News. Ketuk untuk baca di situs penerbit asli.
          </div>
        )}
      </div>
    </div>
  );
}
