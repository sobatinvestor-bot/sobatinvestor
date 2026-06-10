import React, { useState, useEffect } from 'react';
import { ChevronLeft, Send, Trash2, Loader2, TrendingUp, TrendingDown, MessageCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { supabase } from './lib/supabase';

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

export default function AnalisisTab({ userId, userName, onRequireLogin }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [page, setPage] = useState('umum'); // 'umum' | 'porto'
  const [mySymbols, setMySymbols] = useState(null); // null = belum dimuat

  useEffect(() => {
    let active = true;
    supabase
      .from('analyses')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) setItems(data || []);
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

  if (open) {
    const a = items.find((x) => x.symbol === open);
    if (a) return <AnalisisDetail a={a} onBack={() => setOpen(null)} userId={userId} userName={userName} onRequireLogin={onRequireLogin} />;
  }

  const isPorto = page === 'porto';
  const shown = isPorto && Array.isArray(mySymbols)
    ? items.filter((a) => mySymbols.includes((a.symbol || '').toUpperCase()))
    : items;
  const noAnalysis = isPorto && Array.isArray(mySymbols)
    ? mySymbols.filter((s) => !items.some((a) => (a.symbol || '').toUpperCase() === s)).sort()
    : [];

  return (
    <div className="fade-up" style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>
      <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 6 }}>Analisis</h2>
      <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
        Analisis mendalam emiten IDX oleh AI - model bisnis, katalis, dan risiko. Diskusikan di kolom komentar tiap analisis.
      </p>

      {/* Sub-tab: Umum / Saham Kamu */}
      <div style={{ display: 'inline-flex', gap: 4, background: C.cream2, borderRadius: 100, padding: 3, marginBottom: 18 }}>
        {[['umum', 'Analisis Umum'], ['porto', 'Saham Kamu']].map(([k, lbl]) => (
          <button key={k} onClick={() => setPage(k)}
            style={{ border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 100, background: page === k ? C.forest : 'transparent', color: page === k ? C.cream : C.inkSoft }}>
            {lbl}
          </button>
        ))}
      </div>

      {isPorto && !userId ? (
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
        <div style={{ fontSize: 14, color: C.inkSoft }}>Belum ada analisis yang dipublikasikan.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {isPorto && shown.length === 0 && (
            <div style={{ fontSize: 14, color: C.inkSoft }}>Belum ada analisis untuk saham di portofoliomu — daftar emitennya ada di bawah, akan kami prioritaskan.</div>
          )}
          {shown.map((a) => (
            <button
              key={a.symbol}
              onClick={() => setOpen(a.symbol)}
              style={{ textAlign: 'left', background: C.cream2, border: 'none', borderRadius: 18, padding: 18, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span className="serif" style={{ fontSize: 20, fontWeight: 600 }}>{a.symbol}</span>
                <span style={{ fontSize: 12, color: C.inkSoft }}>{a.name}</span>
                {isPorto && <span className="mono" style={{ fontSize: 9, fontWeight: 700, color: C.cuan, letterSpacing: '0.08em', marginLeft: 'auto' }}>DI PORTOFOLIOMU</span>}
              </div>
              <div className="mono" style={{ fontSize: 10, color: C.rust, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{a.sector}</div>
              <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>{a.ringkasan}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span style={{ fontSize: 12, color: C.forest, fontWeight: 600 }}>Baca analisis & diskusi -&gt;</span>
                {a.created_at && <span className="mono" style={{ fontSize: 10, color: C.inkSoft }}>{fmtDate(a.created_at)}</span>}
              </div>
            </button>
          ))}
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

      <div style={{ marginTop: 16, padding: 14, background: 'rgba(196,155,60,0.1)', borderRadius: 12, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
        &#9432; Analisis AI bersifat edukatif berdasarkan data publik, <strong style={{ color: C.ink }}>bukan rekomendasi beli/jual</strong>. Keputusan investasi sepenuhnya tanggung jawab kamu.
      </div>
    </div>
  );
}

function AnalisisDetail({ a, onBack, userId, userName, onRequireLogin }) {
  const updated = a.updated_at && a.created_at && (new Date(a.updated_at).getTime() - new Date(a.created_at).getTime() > 60000);
  return (
    <div className="fade-up" style={{ padding: '20px 20px 40px', maxWidth: 800, margin: '0 auto' }}>
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
    const author = userName || 'anon';
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
                Tampil sebagai <strong style={{ color: C.ink }}>{userName}</strong>
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
