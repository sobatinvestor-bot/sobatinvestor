import React, { useState, useEffect } from 'react';
import { ChevronLeft, Send, Trash2, Loader2, TrendingUp, TrendingDown, MessageCircle } from 'lucide-react';
import { supabase } from './lib/supabase';

const C = {
  cream: '#F4EFE6',
  cream2: '#EBE3D3',
  ink: '#1A2A20',
  inkSoft: '#3A4A40',
  forest: '#1F3B2D',
  sage: '#6B8E5A',
  cuan: '#C49B3C',
  rust: '#B85C38',
  red: '#C0392B',
  green: '#2E7D4F',
};

// ====================================================================
// Konten analisis — ditulis AI, di-grounding dengan data publik (Jun 2026).
// Bukan rekomendasi beli/jual. Angka bersifat historis & bisa berubah.
// ====================================================================
const ANALYSES = [
  {
    symbol: 'MSTI',
    name: 'Mastersystem Infotama',
    sector: 'Teknologi · ICT / System Integrator',
    ringkasan:
      'Penyedia infrastruktur ICT dan system integrator untuk korporasi besar. Bisnis menumpang tren digitalisasi perusahaan dan ledakan data center, tapi pendapatannya berbasis proyek sehingga bisa bergelombang antar-kuartal.',
    bisnis:
      'MSTI menyediakan solusi data center, cloud, keamanan siber, dan jaringan (termasuk sebagai mitra Cisco), plus layanan implementasi, migrasi, dan managed services. Pelanggannya mayoritas perbankan, migas, telekomunikasi, dan korporasi. Melantai di BEI sejak November 2023.',
    snapshot:
      'Kapitalisasi pasar ~Rp4,3 triliun; laba bersih ~Rp549 miliar (TTM, sekitar akhir 2025); sempat membagikan dividen interim Rp16/saham.',
    bull: [
      'Belanja IT korporasi & perbankan terus naik seiring digitalisasi.',
      'Permintaan data center dan cloud di Indonesia sedang tumbuh pesat.',
      'Posisi sebagai integrator mapan dengan kemitraan vendor global (mis. Cisco).',
    ],
    bear: [
      'Pendapatan berbasis proyek → kinerja bisa naik-turun tiap kuartal.',
      'Margin bisa tertekan persaingan antar-integrator.',
      'Ketergantungan pada prinsipal/vendor utama.',
      'Saham relatif baru IPO → likuiditas & volatilitas perlu dicermati.',
    ],
  },
  {
    symbol: 'NCKL',
    name: 'Trimegah Bangun Persada (Harita Nickel)',
    sector: 'Tambang · Nikel terintegrasi',
    ringkasan:
      'Produsen nikel terintegrasi dari hulu (tambang) sampai hilir (FeNi, MHP, nikel & kobalt sulfat untuk baterai EV). Pertumbuhan ditopang ramp-up kapasitas baru, tapi sangat sensitif terhadap harga nikel global dan permintaan dari China.',
    bisnis:
      'Bagian dari Grup Harita dengan operasi terpusat di Pulau Obi (Maluku Utara). Rantai bisnis mencakup penambangan bijih, smelter feronikel, hingga pabrik MHP dan nikel/kobalt sulfat — bahan baku baterai kendaraan listrik. Pengendali (Grup Harita) memegang sekitar 86,5% saham.',
    snapshot:
      'Pendapatan semester I-2025 ~Rp14,1 triliun (+10% yoy); laba bersih semester I ~Rp4,1 triliun. Beberapa proyek RKEF/HPAL dalam tahap ramp-up bertahap.',
    bull: [
      'Keunggulan awal di teknologi HPAL & operasi terintegrasi berbiaya rendah.',
      'Kapasitas produksi baru terus naik dalam 2–3 tahun ke depan.',
      'Permintaan jangka panjang dari rantai baterai/EV.',
    ],
    bear: [
      'Kinerja sangat bergantung harga nikel global & permintaan China.',
      'Free float kecil (konsentrasi pengendali sangat tinggi).',
      'Risiko regulasi: royalti, RKAB, mandat B40 menaikkan biaya.',
      'Capex besar untuk ekspansi.',
    ],
  },
  {
    symbol: 'MBMA',
    name: 'Merdeka Battery Materials',
    sector: 'Tambang · Nikel & bahan baku baterai',
    ringkasan:
      'Anak usaha MDKA dengan rantai nilai nikel terintegrasi. Pendapatan 2025 turun karena harga nikel lemah, tetapi laba bersih justru naik berkat efisiensi biaya — menandakan disiplin operasi yang membaik. Cerita pertumbuhannya ada di proyek hilir (AIM, HPAL/MHP).',
    bisnis:
      'Operasi mencakup tambang nikel SCM, produksi NPI (RKEF), High-Grade Nickel Matte, serta proyek Acid Iron Metal (AIM) dan fasilitas HPAL/MHP untuk prekursor baterai EV. Merupakan bagian dari grup PT Merdeka Copper Gold (MDKA).',
    snapshot:
      'Pendapatan FY2025 ~US$1,43 miliar (turun ~22% yoy), namun laba bersih naik ~34% (ke kisaran US$79+ juta) lewat penekanan biaya pokok. Target produksi NPI 70–80 ribu ton untuk 2026; MHP via HPAL menyusul.',
    bull: [
      'Integrasi hulu–hilir + proyek pertumbuhan (AIM, HPAL/MHP).',
      'Efisiensi biaya terbukti menjaga laba meski harga nikel lemah.',
      'Dukungan ekosistem grup MDKA.',
    ],
    bear: [
      'Harga nikel global yang lemah menekan pendapatan.',
      'Biaya naik (royalti, mandat B40) menekan margin.',
      'Risiko eksekusi & perizinan proyek (mis. RKAB MHP).',
      'Valuasi mengikuti siklus komoditas yang fluktuatif.',
    ],
  },
  {
    symbol: 'POWR',
    name: 'Cikarang Listrindo',
    sector: 'Utilitas · Pembangkit listrik swasta',
    ringkasan:
      'Produsen listrik swasta untuk kawasan industri Cikarang. Arus kasnya stabil dan defensif, serta rajin membagi dividen dengan payout tinggi. Pertumbuhan relatif lambat, dengan katalis tambahan dari permintaan data center.',
    bisnis:
      'Membangkitkan, mentransmisi, dan mendistribusikan listrik (pembangkit gas & batu bara, kapasitas >1.100 MW) terutama untuk pelanggan industri di Cikarang (otomotif, elektronik, makanan-minuman, kimia) serta data center (~227 MVA terkoneksi). Mulai merambah energi terbarukan (PLTS atap, SPKLU).',
    snapshot:
      'Pendapatan FY2025 ~US$553,5 juta; laba bersih ~US$72 juta. Pembayar dividen konsisten (DPR ~90%+); dividen final TB2025 Rp49,52/saham dibayar 5 Juni 2026.',
    bull: [
      'Arus kas stabil & defensif dari pelanggan industri.',
      'Dividen tinggi dan konsisten (rekam jejak payout besar).',
      'Katalis pertumbuhan dari sambungan data center.',
      'Ketersediaan pembangkit prima (~96%).',
    ],
    bear: [
      'Pertumbuhan pendapatan cenderung rendah.',
      'Eksposur utang USD (obligasi US$350 juta, Mar 2025).',
      'Risiko transisi energi (porsi batu bara/gas).',
      'Konsentrasi pelanggan di satu kawasan industri.',
    ],
  },
  {
    symbol: 'PBID',
    name: 'Panca Budi Idaman',
    sector: 'Barang konsumer · Kemasan plastik',
    ringkasan:
      'Pemimpin pasar kemasan plastik konsumer (merek Tomat & Wayang) dengan neraca sehat dan dividen besar. Bisnis defensif, tetapi pertumbuhannya terbatas dan margin sensitif terhadap harga bahan baku serta daya beli.',
    bisnis:
      'Memproduksi dan mendistribusikan kemasan plastik serta produk pelengkap, dengan jaringan >12.000 pelanggan. Fokus pasar domestik (ekspor di bawah 5%). Kontributor utama adalah segmen kemasan plastik, ditambah segmen bijih plastik.',
    snapshot:
      'Pendapatan FY2025 ~Rp5,19 triliun (sedikit turun); laba bersih ~Rp400,6 miliar (turun dari ~Rp485 miliar). Membagikan hampir seluruh laba sebagai dividen (~Rp53/saham); utang rendah, ekuitas ~Rp2,9 triliun.',
    bull: [
      'Permintaan kemasan konsumer bersifat defensif (kebutuhan sehari-hari).',
      'Dividen tinggi dengan payout sangat besar.',
      'Pemimpin pasar dengan jaringan distribusi luas.',
      'Neraca kuat, utang rendah.',
    ],
    bear: [
      'Margin tertekan harga bahan baku (resin/biji plastik) & daya beli.',
      'Pertumbuhan terbatas (single-digit).',
      'Eksposur tak langsung ke harga minyak (bahan baku plastik).',
      'Payout hampir 100% → ruang reinvestasi terbatas.',
    ],
  },
];

const fmtTime = (s) =>
  new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function AnalisisTab({ userId, userEmail, onRequireLogin }) {
  const [open, setOpen] = useState(null);

  if (open) {
    const a = ANALYSES.find((x) => x.symbol === open);
    return <AnalisisDetail a={a} onBack={() => setOpen(null)} userId={userId} userEmail={userEmail} onRequireLogin={onRequireLogin} />;
  }

  return (
    <div className="fade-up" style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>
      <h2 className="serif" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 6 }}>Analisis</h2>
      <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.55, marginBottom: 20 }}>
        Analisis mendalam emiten IDX oleh AI — model bisnis, katalis, dan risiko. Diskusikan di kolom komentar tiap analisis.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {ANALYSES.map((a) => (
          <button
            key={a.symbol}
            onClick={() => setOpen(a.symbol)}
            style={{ textAlign: 'left', background: C.cream2, border: 'none', borderRadius: 18, padding: 18, cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span className="serif" style={{ fontSize: 20, fontWeight: 600 }}>{a.symbol}</span>
              <span style={{ fontSize: 12, color: C.inkSoft }}>{a.name}</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: C.rust, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{a.sector}</div>
            <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.55 }}>{a.ringkasan}</p>
            <div style={{ marginTop: 10, fontSize: 12, color: C.forest, fontWeight: 600 }}>Baca analisis & diskusi →</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: 14, background: 'rgba(196,155,60,0.1)', borderRadius: 12, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
        ⓘ Analisis AI bersifat edukatif berdasarkan data publik (Jun 2026), <strong style={{ color: C.ink }}>bukan rekomendasi beli/jual</strong>. Keputusan investasi sepenuhnya tanggung jawab kamu.
      </div>
    </div>
  );
}

function AnalisisDetail({ a, onBack, userId, userEmail, onRequireLogin }) {
  return (
    <div className="fade-up" style={{ padding: '20px 20px 40px', maxWidth: 800, margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, marginBottom: 16, padding: 0 }}>
        <ChevronLeft size={16} /> Semua analisis
      </button>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 className="serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>{a.symbol}</h2>
        <span style={{ fontSize: 14, color: C.inkSoft }}>{a.name}</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: C.rust, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>{a.sector}</div>

      <p style={{ fontSize: 15, color: C.ink, lineHeight: 1.6, marginBottom: 20 }}>{a.ringkasan}</p>

      <Section title="Tentang bisnis">{a.bisnis}</Section>
      <Section title="Snapshot kinerja">{a.snapshot}</Section>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', margin: '18px 0' }}>
        <ThesisCard kind="bull" items={a.bull} />
        <ThesisCard kind="bear" items={a.bear} />
      </div>

      <div style={{ padding: 12, background: 'rgba(196,155,60,0.1)', borderRadius: 12, fontSize: 11, color: C.inkSoft, lineHeight: 1.5, marginBottom: 24 }}>
        ⓘ Analisis AI berdasarkan data publik (Jun 2026), bukan rekomendasi beli/jual. Angka dapat berubah.
      </div>

      <Comments symbol={a.symbol} userId={userId} userEmail={userEmail} onRequireLogin={onRequireLogin} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 className="serif" style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

function ThesisCard({ kind, items }) {
  const bull = kind === 'bull';
  const Icon = bull ? TrendingUp : TrendingDown;
  const color = bull ? C.green : C.red;
  return (
    <div style={{ background: C.cream2, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        <Icon size={16} /> {bull ? 'Alasan optimis' : 'Risiko / hati-hati'}
      </div>
      <ul style={{ listStyle: 'none', display: 'grid', gap: 8 }}>
        {items.map((t, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: C.ink, lineHeight: 1.45 }}>
            <span style={{ color, flexShrink: 0 }}>{bull ? '▲' : '▼'}</span> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Comments({ symbol, userId, userEmail, onRequireLogin }) {
  const [list, setList] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  async function post() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const author = (userEmail || 'anon').split('@')[0];
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

      {/* Input / ajakan login */}
      {userId ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tulis komentar atau pertanyaan…"
            rows={2}
            style={{ flex: 1, resize: 'vertical', border: `1px solid rgba(26,42,32,0.15)`, borderRadius: 12, padding: '10px 12px', fontSize: 14, background: '#fff', color: C.ink, outline: 'none' }}
          />
          <button
            onClick={post}
            disabled={busy || !body.trim()}
            style={{ alignSelf: 'flex-end', background: busy || !body.trim() ? 'rgba(31,59,45,0.4)' : C.forest, color: C.cream, border: 'none', borderRadius: 12, padding: '10px 14px', cursor: busy || !body.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
          >
            {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Kirim
          </button>
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

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.inkSoft, fontSize: 13 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat komentar…
        </div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: C.inkSoft }}>Belum ada komentar. Jadilah yang pertama memulai diskusi.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((c) => (
            <div key={c.id} style={{ background: C.cream2, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.author || 'anon'}</span>
                <span className="mono" style={{ fontSize: 10, color: C.inkSoft }}>{fmtTime(c.created_at)}</span>
              </div>
              <p style={{ fontSize: 14, color: C.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</p>
              {c.user_id === userId && (
                <button onClick={() => remove(c.id)} style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: C.rust, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
                  <Trash2 size={12} /> Hapus
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
