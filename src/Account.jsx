// src/Account.jsx
// Login/daftar (Supabase Auth) + hook portofolio per-user (CRUD ke tabel holdings,
// digabung harga live dari /api/quotes) + modal tambah/edit saham.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, Lock, X, LogOut, Eye, EyeOff } from 'lucide-react';
import { supabase } from './lib/supabase';

const C = {
  cream: '#F4EFE6', cream2: '#EBE3D3', ink: '#1A2A20', inkSoft: '#3A4A40',
  forest: '#1F3B2D', cuan: '#C49B3C', rust: '#B85C38', red: '#C0392B', green: '#2E7D4F',
};

// ============================================================
// Turnstile (Cloudflare CAPTCHA) — proteksi anti-bot di login/daftar.
// GANTI nilai di bawah dengan Site Key dari Cloudflare Turnstile (kunci PUBLIK, aman di-commit).
// Secret Key TIDAK ditaruh di sini — itu dipasang di Supabase Dashboard.
// ============================================================
const TURNSTILE_SITE_KEY = '0x4AAAAAADntn_G_x8NJZSju';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Widget Turnstile dengan rendering eksplisit. Mengekspos reset() lewat ref.
// Aman saat renderToString (SSR): useEffect tidak jalan, hanya div kosong yang dirender.
const TurnstileWidget = React.forwardRef(function TurnstileWidget({ onToken }, ref) {
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  React.useImperativeHandle(ref, () => ({
    reset() {
      try {
        if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
          window.turnstile.reset(widgetIdRef.current);
        }
      } catch { /* abaikan */ }
    },
  }), []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !boxRef.current || !window.turnstile) return;
      if (widgetIdRef.current !== null) return; // sudah dirender
      try {
        widgetIdRef.current = window.turnstile.render(boxRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'light',
          callback: (token) => onTokenRef.current(token),
          'error-callback': () => onTokenRef.current(''),
          'expired-callback': () => onTokenRef.current(''),
        });
      } catch { /* abaikan bila gagal render */ }
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      let s = document.querySelector('script[data-turnstile]');
      if (!s) {
        s = document.createElement('script');
        s.src = TURNSTILE_SRC;
        s.async = true;
        s.defer = true;
        s.setAttribute('data-turnstile', '1');
        document.head.appendChild(s);
      }
      s.addEventListener('load', renderWidget);
    }

    return () => {
      cancelled = true;
      // Bersihkan widget saat unmount supaya tidak jadi "widget yatim" di SPA
      // (penyebab peringatan "Cannot find Widget ...").
      try {
        if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch { /* abaikan */ }
      widgetIdRef.current = null;
    };
  }, []);

  return <div ref={boxRef} style={{ marginTop: 12, minHeight: 65 }} />;
});

// ============================================================
// Hook: muat holding user + harga live, sediakan fungsi CRUD
// ============================================================
export function usePortfolio(userId) {
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [ihsg, setIhsg] = useState(null);
  const [loading, setLoading] = useState(true);
  // Fee transaksi (persen) + saldo RDN — dimuat dari user_settings, default praktik umum IDX
  const [settings, setSettings] = useState({ fee_buy: 0.15, fee_sell: 0.15, tax_sell: 0.10, rdn: 0, modal_awal: 0, zakat_paid: 0 });

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('user_settings').select('fee_buy,fee_sell,tax_sell,rdn,modal_awal,zakat_paid').maybeSingle();
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

  // Zakat dividen yang sudah dibayar — input manual, tersimpan di user_settings
  async function saveZakatPaid(v) {
    const val = Math.max(0, Math.round(Number(v) || 0));
    const row = { user_id: userId, fee_buy: Number(settings.fee_buy), fee_sell: Number(settings.fee_sell), tax_sell: Number(settings.tax_sell), zakat_paid: val };
    const { error } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
    if (error) { alert('Gagal menyimpan zakat dibayar: ' + error.message); return false; }
    setSettings((p) => ({ ...p, zakat_paid: val }));
    return true;
  }

  // Modal awal banget (setoran pokok, dipisah dari gain & dividen) — input manual
  async function saveModalAwal(v) {
    const val = Math.max(0, Math.round(Number(v) || 0));
    const row = { user_id: userId, fee_buy: Number(settings.fee_buy), fee_sell: Number(settings.fee_sell), tax_sell: Number(settings.tax_sell), modal_awal: val };
    const { error } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
    if (error) { alert('Gagal menyimpan modal awal: ' + error.message); return false; }
    setSettings((p) => ({ ...p, modal_awal: val }));
    return true;
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
      hasLive: !!live,
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
        await adjustRdn(-(h.qty * h.avg) * (1 + settings.fee_buy / 100), `Beli ${h.symbol} ${Number(h.qty).toLocaleString('id-ID')} @ Rp${Math.round(h.avg).toLocaleString('id-ID')}`, h.buyDate || null);
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
    await adjustRdn(-(h.qty * h.avg) * (1 + settings.fee_buy / 100), `Beli ${h.symbol} ${Number(h.qty).toLocaleString('id-ID')} @ Rp${Math.round(h.avg).toLocaleString('id-ID')}`, h.buyDate || null);
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
    await adjustRdn(net, `Jual ${holding.symbol} ${Number(s.qty).toLocaleString('id-ID')} @ Rp${Math.round(s.price).toLocaleString('id-ID')}`, s.date || null);
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
    if (error) { alert('Gagal hapus: ' + error.message); return; }
    await supabase.from('lots').delete().eq('user_id', userId);
    const { error: rerr } = await supabase.rpc('reset_rdn'); // bersihkan ledger + saldo RDN
    if (rerr) console.warn('RDN tidak terreset:', rerr.message);
    setSettings((p) => ({ ...p, rdn: 0 }));
    window.dispatchEvent(new Event('sobat-lots-changed'));
    window.dispatchEvent(new Event('sobat-rdn-changed'));
    await loadHoldings();
  }

  // Export CSV: portofolio + RDN (saldo & riwayat). Format ber-section agar bisa diimpor balik.
  async function exportCSV() {
    const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [];
    lines.push('SOBATINVESTOR EXPORT,v1');
    lines.push('Saldo RDN,' + Math.round(Number(settings.rdn || 0)));
    lines.push('');
    lines.push('[PORTOFOLIO]');
    lines.push(['Symbol', 'Nama', 'Qty', 'Avg Price', 'Harga Kini', 'Nilai Pasar', 'P/L', 'P/L %', 'Sektor', 'Tgl Beli'].join(','));
    stocks.forEach((s) => {
      const mv = s.price * s.qty, pl = mv - s.avg * s.qty, plPct = s.avg ? ((s.price - s.avg) / s.avg) * 100 : 0;
      lines.push([s.symbol, esc(s.name), s.qty, Math.round(s.avg), s.hasLive ? Math.round(s.price) : '', Math.round(mv), Math.round(pl), plPct.toFixed(2), esc(s.sector), s.buyDate || ''].join(','));
    });
    lines.push('');
    lines.push('[RDN]');
    lines.push(['Tanggal', 'Catatan', 'Nominal'].join(','));
    const { data: ledger } = await supabase.from('rdn_ledger').select('delta,note,event_date,created_at').order('created_at', { ascending: true });
    (ledger || []).forEach((l) => {
      const tgl = l.event_date || (l.created_at ? l.created_at.slice(0, 10) : '');
      lines.push([tgl, esc(l.note), Math.round(Number(l.delta))].join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sobatinvestor-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Impor CSV (restore — GANTI TOTAL). `parsed` dari parseSobatCSV().
  async function importData({ holdings = [], rdn = [] }) {
    await supabase.from('holdings').delete().eq('user_id', userId);
    await supabase.from('lots').delete().eq('user_id', userId);
    await supabase.rpc('reset_rdn');
    for (const h of holdings) {
      const { error } = await supabase.from('holdings').insert({
        user_id: userId, symbol: h.symbol, name: h.name || h.symbol, sector: h.sector || null,
        qty: h.qty, avg_price: h.avg, buy_date: h.buyDate || null,
      });
      if (error) { console.warn('Impor holding gagal:', h.symbol, error.message); continue; }
      await supabase.from('lots').insert({ user_id: userId, symbol: h.symbol, qty: h.qty, price: h.avg, buy_date: h.buyDate || null, side: 'buy' });
    }
    for (const r of rdn) {
      await supabase.rpc('adjust_rdn', { p_delta: Math.round(r.delta), p_note: r.note || null, p_event_date: r.tgl || null });
    }
    window.dispatchEvent(new Event('sobat-lots-changed'));
    window.dispatchEvent(new Event('sobat-rdn-changed'));
    await loadSettings();
    await loadHoldings();
    return { holdings: holdings.length, rdn: rdn.length };
  }

  return {
    stocks, loading,
    ihsg: ihsg ? ihsg.value : 7800,
    ihsgChange: ihsg ? ihsg.change : 0,
    addHolding, updateHolding, deleteHolding, deleteAll, sellHolding,
    settings, adjustRdn, saveFees, saveModalAwal, saveZakatPaid, exportCSV, importData,
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
  const [remember, setRemember] = useState(false);
  const [autoLocked, setAutoLocked] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);

  // Muat email yang diingat (jika ada). Hanya email — tidak pernah password.
  // Sekaligus cek apakah sesi sebelumnya berakhir otomatis karena idle.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sb_remember_email');
      if (saved) { setEmail(saved); setRemember(true); }
    } catch { /* localStorage bisa terblokir; abaikan */ }
    try {
      if (sessionStorage.getItem('sb_autolocked') === '1') {
        setAutoLocked(true);
        sessionStorage.removeItem('sb_autolocked');
      }
    } catch { /* abaikan */ }
  }, []);

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
    if (!captchaToken) {
      setMsg('Verifikasi keamanan belum selesai. Tunggu sebentar lalu coba lagi.');
      return;
    }
    setBusy(true); setMsg('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw, options: { captchaToken } });
        if (error) setMsg(error.message);
        else {
          try {
            if (remember) localStorage.setItem('sb_remember_email', email);
            else localStorage.removeItem('sb_remember_email');
          } catch { /* abaikan bila localStorage terblokir */ }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { captchaToken } });
        if (error) {
          const m = (error.message || '').toLowerCase();
          if (m.includes('password')) {
            setMsg('Password belum memenuhi syarat: minimal 10 karakter dan mengandung huruf besar, huruf kecil, angka, dan simbol.');
          } else {
            setMsg(error.message);
          }
        }
        else if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMsg('Email ini sudah terdaftar. Silakan Masuk.');
        } else {
          setMsg('Akun dibuat. Silakan buka email kamu dan konfirmasi.');
        }
      }
    } finally {
      setBusy(false);
      // Token Turnstile sekali pakai — minta token baru untuk percobaan berikutnya.
      setCaptchaToken('');
      if (captchaRef.current) captchaRef.current.reset();
    }
  }

  // Jalur B — kirim email reset kata sandi
  async function forgotPassword() {
    if (!email) { setMsg('Masukkan email kamu dulu di kolom di atas.'); return; }
    if (!captchaToken) { setMsg('Tunggu verifikasi keamanan (kotak Cloudflare) selesai, lalu klik lagi.'); return; }
    setBusy(true); setMsg('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin, captchaToken });
      if (error) setMsg(error.message);
      else setMsg('Link reset kata sandi sudah dikirim ke email kamu. Cek inbox (dan folder spam).');
    } finally {
      setBusy(false);
      // Token Turnstile sekali pakai — minta yang baru untuk aksi berikutnya.
      setCaptchaToken('');
      if (captchaRef.current) captchaRef.current.reset();
    }
  }

  // Syarat password (HARUS sama dengan setelan Supabase: min 10 + huruf besar/kecil/angka/simbol)
  const pwReqs = [
    { ok: pw.length >= 10, label: 'Minimal 10 karakter' },
    { ok: /[a-z]/.test(pw), label: 'Huruf kecil (a–z)' },
    { ok: /[A-Z]/.test(pw), label: 'Huruf besar (A–Z)' },
    { ok: /[0-9]/.test(pw), label: 'Angka (0–9)' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'Simbol (!@#$…)' },
  ];
  const pwValid = pwReqs.every((r) => r.ok);

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
        {autoLocked && mode === 'login' && (
          <div style={{ fontSize: 13, color: C.inkSoft, background: C.cream, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            Sesi terkunci otomatis karena tidak aktif. Masuk lagi dengan password kamu.
          </div>
        )}
        <Field icon={Mail} placeholder="email@kamu.com" value={email} onChange={setEmail} />
        <Field icon={Lock} placeholder={mode === 'login' ? 'password' : 'password (min 10 karakter)'} type="password" value={pw} onChange={setPw} />
        {mode === 'signup' && pw.length > 0 && (
          <div style={{ margin: '8px 4px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pwReqs.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: r.ok ? C.green : C.inkSoft }}>
                <span style={{ fontWeight: 700, width: 14, display: 'inline-block', textAlign: 'center' }}>{r.ok ? '✓' : '○'}</span>
                {r.label}
              </div>
            ))}
          </div>
        )}
        {mode === 'login' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.inkSoft, margin: '2px 2px 0', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={remember}
              onChange={(e) => { const v = e.target.checked; setRemember(v); try { if (!v) localStorage.removeItem('sb_remember_email'); } catch {} }}
              style={{ width: 16, height: 16, accentColor: C.forest, cursor: 'pointer' }} />
            Ingat email saya
          </label>
        )}
        {mode === 'login' && (
          <div style={{ margin: '8px 2px 0', textAlign: 'right' }}>
            <button type="button" onClick={forgotPassword} disabled={busy}
              style={{ background: 'none', border: 'none', color: C.forest, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>
              Lupa password?
            </button>
          </div>
        )}
        {msg && <div style={{ fontSize: 13, color: C.rust, margin: '6px 2px 0' }}>{msg}</div>}
        <TurnstileWidget ref={captchaRef} onToken={setCaptchaToken} />
        <button onClick={submit} disabled={busy || !email || (mode === 'login' ? pw.length < 6 : !pwValid)}
          style={{ width: '100%', background: (busy || !email || (mode === 'login' ? pw.length < 6 : !pwValid)) ? 'rgba(26,42,32,0.25)' : C.forest, color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>
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
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.cream, borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
      <Icon size={16} color={C.inkSoft} />
      <input type={inputType} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: C.ink, fontFamily: 'inherit' }} />
      {isPassword && (
        <button type="button" onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Sembunyikan password' : 'Lihat password'}
          title={show ? 'Sembunyikan password' : 'Lihat password'}
          style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: C.inkSoft }}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
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
  const [open, setOpen] = useState(false); // default tertutup (minimize)

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
      <button onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span className="serif" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>Berita Sahammu</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: C.inkSoft, letterSpacing: '0.08em' }}>
            {open ? 'TERBARU' : (Array.isArray(news) && news.length ? news.length + ' BERITA' : 'TERBARU')}
          </span>
          <span style={{ fontSize: 11, color: C.inkSoft, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', display: 'inline-block' }}>▾</span>
        </span>
      </button>
      {open && (
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
      )}
    </div>
  );
}

// ── Parser CSV hasil Export Sobat Investor (section [PORTOFOLIO] & [RDN]) ──
function splitCSVLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseSobatCSV(text) {
  try {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const lines = clean.split(/\r?\n/);
    let section = null;
    const holdings = [], rdn = [];
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) continue;
      if (t === '[PORTOFOLIO]') { section = 'p'; continue; }
      if (t === '[RDN]') { section = 'r'; continue; }
      const c = splitCSVLine(raw);
      if (section === 'p') {
        if ((c[0] || '').trim() === 'Symbol') continue;
        const symbol = (c[0] || '').trim().toUpperCase();
        if (!/^[A-Z]{4}$/.test(symbol)) continue;
        const qty = Number(c[2]), avg = Number(c[3]);
        if (!(qty > 0) || !(avg > 0)) continue;
        holdings.push({ symbol, name: (c[1] || '').trim(), qty, avg, sector: (c[8] || '').trim(), buyDate: (c[9] || '').trim() || null });
      } else if (section === 'r') {
        if ((c[0] || '').trim() === 'Tanggal') continue;
        const delta = Number(c[2]);
        if (!isFinite(delta) || delta === 0) continue;
        rdn.push({ tgl: (c[0] || '').trim() || null, note: (c[1] || '').trim(), delta });
      }
    }
    if (holdings.length === 0 && rdn.length === 0)
      return { ok: false, error: 'File tidak berisi data yang dikenali. Pastikan ini CSV hasil Export dari Sobat Investor.' };
    return { ok: true, holdings, rdn };
  } catch (e) {
    return { ok: false, error: 'Gagal membaca file: ' + (e.message || e) };
  }
}

// ============================================================
// Ganti Kata Sandi (saat user sudah login) — Jalur A
// Verifikasi password lama via signInWithPassword (+Turnstile) → updateUser(password baru).
// ============================================================
export function ChangePassword({ open, email, onClose, onSuccess }) {
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const cRef = useRef(null);

  if (!open) return null;

  const reqs = [
    { ok: newPw.length >= 10, label: 'Minimal 10 karakter' },
    { ok: /[a-z]/.test(newPw), label: 'Huruf kecil (a–z)' },
    { ok: /[A-Z]/.test(newPw), label: 'Huruf besar (A–Z)' },
    { ok: /[0-9]/.test(newPw), label: 'Angka (0–9)' },
    { ok: /[^A-Za-z0-9]/.test(newPw), label: 'Simbol (!@#$…)' },
  ];
  const valid = reqs.every((r) => r.ok);

  function close() {
    setCurPw(''); setNewPw(''); setMsg(''); setDone(false); setCaptchaToken('');
    if (onClose) onClose();
  }

  async function submit() {
    if (!captchaToken) { setMsg('Selesaikan verifikasi keamanan dulu.'); return; }
    if (!valid) { setMsg('Kata sandi baru belum memenuhi syarat.'); return; }
    if (newPw === curPw) { setMsg('Kata sandi baru harus berbeda dari yang lama.'); return; }
    setBusy(true); setMsg('');
    try {
      const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: curPw, options: { captchaToken } });
      if (e1) { setMsg('Kata sandi saat ini salah atau verifikasi gagal.'); return; }
      const { error: e2 } = await supabase.auth.updateUser({ password: newPw });
      if (e2) {
        const m = (e2.message || '').toLowerCase();
        if (m.includes('reauth') || m.includes('nonce') || m.includes('current password') || m.includes('requires')) {
          setMsg('Verifikasi tambahan diperlukan. Matikan "Require current password when updating" di Supabase (Authentication → Sign In / Providers → Email), lalu coba lagi. Keamanan tetap aman karena kata sandi lama sudah diverifikasi.');
        } else if (m.includes('different') || m.includes('same')) {
          setMsg('Kata sandi baru harus berbeda dari yang lama.');
        } else if (m.includes('at least') || m.includes('should contain') || m.includes('weak') || m.includes('characters')) {
          setMsg('Kata sandi baru belum memenuhi syarat keamanan.');
        } else {
          setMsg(e2.message);
        }
        return;
      }
      setDone(true);
      if (onSuccess) onSuccess();
    } finally {
      setBusy(false);
      setCaptchaToken('');
      if (cRef.current) cRef.current.reset();
    }
  }

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,32,0.45)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, borderRadius: 18, maxWidth: 400, width: '100%', padding: 24, boxShadow: '0 20px 60px rgba(26,42,32,0.25)', maxHeight: '88vh', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className="serif" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: C.ink }}>Ganti Kata Sandi</h2>
          <button onClick={close} aria-label="Tutup" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.inkSoft, padding: 4 }}><X size={20} /></button>
        </div>
        {done ? (
          <div>
            <p style={{ fontSize: 14, color: C.green, fontWeight: 600, margin: '0 0 12px' }}>Kata sandi berhasil diperbarui.</p>
            <button onClick={close} style={{ width: '100%', background: C.forest, color: C.cream, border: 'none', padding: 13, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Selesai</button>
          </div>
        ) : (
          <>
            <Field icon={Lock} placeholder="kata sandi saat ini" type="password" value={curPw} onChange={setCurPw} />
            <Field icon={Lock} placeholder="kata sandi baru (min 10 karakter)" type="password" value={newPw} onChange={setNewPw} />
            {newPw.length > 0 && (
              <div style={{ margin: '2px 4px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {reqs.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: r.ok ? C.green : C.inkSoft }}>
                    <span style={{ fontWeight: 700, width: 14, display: 'inline-block', textAlign: 'center' }}>{r.ok ? '✓' : '○'}</span>{r.label}
                  </div>
                ))}
              </div>
            )}
            {msg && <div style={{ fontSize: 13, color: C.rust, margin: '4px 2px 8px' }}>{msg}</div>}
            <TurnstileWidget ref={cRef} onToken={setCaptchaToken} />
            <button onClick={submit} disabled={busy || !curPw || !valid || !captchaToken}
              style={{ width: '100%', background: (busy || !curPw || !valid || !captchaToken) ? 'rgba(26,42,32,0.25)' : C.forest, color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>
              {busy ? 'Memproses…' : 'Perbarui Kata Sandi'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Set Kata Sandi Baru (halaman recovery) — Jalur B
// Tampil saat user membuka link reset dari email (event PASSWORD_RECOVERY).
// Sesi recovery sudah terautentikasi → cukup updateUser(password baru).
// ============================================================
export function SetNewPassword({ onDone }) {
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  const reqs = [
    { ok: newPw.length >= 10, label: 'Minimal 10 karakter' },
    { ok: /[a-z]/.test(newPw), label: 'Huruf kecil (a–z)' },
    { ok: /[A-Z]/.test(newPw), label: 'Huruf besar (A–Z)' },
    { ok: /[0-9]/.test(newPw), label: 'Angka (0–9)' },
    { ok: /[^A-Za-z0-9]/.test(newPw), label: 'Simbol (!@#$…)' },
  ];
  const valid = reqs.every((r) => r.ok);

  async function submit() {
    if (!valid) { setMsg('Kata sandi belum memenuhi syarat.'); return; }
    setBusy(true); setMsg('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        const m = (error.message || '').toLowerCase();
        if (m.includes('different') || m.includes('same')) setMsg('Kata sandi baru harus berbeda dari yang lama.');
        else if (m.includes('at least') || m.includes('should contain') || m.includes('weak') || m.includes('characters')) setMsg('Kata sandi belum memenuhi syarat keamanan.');
        else setMsg(error.message);
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.cream, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <div style={{ background: C.cream2, borderRadius: 24, padding: 28, width: '100%', maxWidth: 380 }}>
        <h1 className="serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 6, color: C.ink }}>Set Kata Sandi Baru</h1>
        {done ? (
          <>
            <p style={{ fontSize: 14, color: C.green, fontWeight: 600, margin: '8px 0 16px' }}>Kata sandi berhasil diganti. Kamu sekarang sudah masuk.</p>
            <button onClick={onDone} style={{ width: '100%', background: C.forest, color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Lanjut ke aplikasi</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: C.inkSoft, marginBottom: 18 }}>Masukkan kata sandi baru untuk akunmu.</p>
            <Field icon={Lock} placeholder="kata sandi baru (min 10 karakter)" type="password" value={newPw} onChange={setNewPw} />
            {newPw.length > 0 && (
              <div style={{ margin: '2px 4px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {reqs.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: r.ok ? C.green : C.inkSoft }}>
                    <span style={{ fontWeight: 700, width: 14, display: 'inline-block', textAlign: 'center' }}>{r.ok ? '✓' : '○'}</span>{r.label}
                  </div>
                ))}
              </div>
            )}
            {msg && <div style={{ fontSize: 13, color: C.rust, margin: '4px 2px 8px' }}>{msg}</div>}
            <button onClick={submit} disabled={busy || !valid}
              style={{ width: '100%', background: (busy || !valid) ? 'rgba(26,42,32,0.25)' : C.forest, color: C.cream, border: 'none', padding: 14, borderRadius: 100, fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 }}>
              {busy ? 'Memproses…' : 'Simpan Kata Sandi'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
