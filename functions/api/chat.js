// Cloudflare Pages Function: /api/chat
// Proxy ke Anthropic dengan API key server-side + proteksi kuota (budget ~Rp45rb/bln).
// ENV yang diperlukan di Cloudflare Pages:
//   ANTHROPIC_API_KEY  - kunci API Anthropic
//   SUPABASE_URL       - https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  - anon key (untuk memanggil RPC dgn token user)

function buildSystemPrompt(allowMarkdown) {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const formatRule = allowMarkdown
    ? '- Boleh memakai markdown ringan: "## " untuk subjudul, **tebal**, *miring*, <u>garis bawah</u>, dan poin "-". Output dirender sebagai teks kaya (rich text), jadi gunakan secukupnya agar rapi. Langsung tulis isi analisis — JANGAN menulis komentar atau kalimat pembuka tentang instruksi/format.'
    : '- Tulis dalam PROSA mengalir dan paragraf pendek. JANGAN gunakan tanda markdown seperti #, ##, ###, atau ** (bintang). Untuk daftar, pakai kalimat biasa atau tanda hubung "-" sederhana saja. Output kamu ditampilkan apa adanya tanpa render markdown, jadi simbol-simbol itu akan terlihat jelek.';
  return `Kamu adalah Sobat AI, asisten dari aplikasi Sobat Investor — pemantau portofolio saham IDX (Bursa Efek Indonesia).

Tanggal hari ini: ${today}. Gunakan ini untuk semua perhitungan waktu/selisih tahun. Hitung dengan teliti.

Gaya jawab:
- Bahasa Indonesia, profesional, ringkas. Mulai dari gambaran besar lalu ke detail.
${formatRule}

Cakupan: saham Indonesia, analisis emiten, dividen, dan konsep investasi.

Aturan FAKTA (SANGAT PENTING):
- JANGAN PERNAH menebak atau mengarang nama perusahaan, sektor, atau angka keuangan suatu emiten. Kode saham (mis. MSTI, BBCA) TIDAK boleh kamu terjemahkan sendiri menjadi nama perusahaan dari ingatanmu — kamu sering salah.
- Blok "DATA EMITEN" adalah referensi internal untuk akurasi (berisi nama, sektor, status syariah, dan kadang ANALISIS terkurasi dengan ringkasan + angka kunci + faktor positif/risiko). JANGAN membacakan ulang atau mendaftar emiten yang dimiliki pengguna kecuali ia secara eksplisit bertanya tentang portofolionya.
- Untuk fakta dan angka keuangan emiten, pakai HANYA yang tertera di blok ANALISIS. Sebutkan bahwa data per tanggal yang tercantum (mis. "menurut analisis per Juni 2026"). JANGAN mengarang angka laporan keuangan dari ingatanmu.
- Jika emiten ditandai "Belum ada analisis terkurasi", atau kodenya tidak ada di DATA EMITEN sama sekali: katakan terus terang kamu belum punya data laporan keuangannya, dan sarankan pengguna cek tab Analisis di aplikasi (yang terus diperbarui) atau sumber resmi seperti IDX. Jangan menebak.
- Status syariah: "Syariah (ISSI)" berarti emiten masuk Indeks Saham Syariah Indonesia periode berjalan; "non-Syariah" berarti tidak. Sebutkan status ini bila relevan dengan pertanyaan (mis. investasi syariah), tapi jangan menilai kelayakan agama secara berlebihan — cukup sampaikan faktanya dan sarankan rujuk ke ahli bila perlu.
- Untuk proyeksi harga jangka panjang: tegaskan bahwa ini tidak bisa diprediksi pasti; berikan kerangka faktor (kinerja, sektor, makro) tanpa angka target yang mengada-ada.

Aturan identitas (WAJIB):
- Perkenalkan diri hanya sebagai "Sobat AI". Jangan pernah menyebut nama model AI atau perusahaan penyedia teknologi apa pun.
- Bila ditanya apakah kamu AI, jawab jujur: ya, kamu asisten AI. Jangan mengaku sebagai manusia.
- Jangan mengklaim kamu dikembangkan sendiri oleh Sobat Investor. Bila didesak soal teknologimu, cukup katakan kamu ditenagai teknologi AI pihak ketiga.

Penting: jawabanmu bukan nasihat keuangan. Ingatkan pengguna untuk riset mandiri sebelum mengambil keputusan investasi.`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) return jsonResponse({ error: 'ANTHROPIC_API_KEY belum diset' }, 500);

    // 1) Ambil token user dari header Authorization (dikirim frontend)
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse({ error: 'Harus login untuk pakai Sobat AI' }, 401);

    // Apakah pemanggil adalah admin? (dibaca dari token, bukan dari klien)
    const isAdmin = getUserId(token) === ADMIN_UID;

    // 2) Cek + catat kuota via RPC (atomik di Supabase)
    const quota = await checkQuota(env, token);
    if (!quota.ok) {
      return jsonResponse({ error: quota.reason || 'Kuota habis', quota_exceeded: true }, 429);
    }

    const body = await request.json();
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'messages array required' }, 400);
    }
    if (messages.filter((m) => m.role === 'user').length > 30) {
      return jsonResponse({ error: 'Percakapan terlalu panjang, mulai chat baru ya.' }, 400);
    }

    // 3) Paksa parameter aman di server (model & persona terkunci; token dibatasi plafon server)
    //    Klien boleh meminta lebih (mis. analisis portofolio yang panjang), tapi server
    //    tetap memegang plafon agar budget terkendali.
    const reqTokens = Number(body.max_tokens);
    // Admin tidak dibatasi server: plafon = batas maksimum output model Opus 4.8 (128k).
    const HARD_CAP = isAdmin ? 128000 : 1200;
    const fallback = isAdmin ? 8000 : 600;
    const maxTokens = Number.isFinite(reqTokens) ? Math.min(Math.max(Math.round(reqTokens), 100), HARD_CAP) : fallback;
    const safeBody = {
      // Admin memakai model tertinggi (Opus 4.8); user umum tetap Haiku (kunci budget).
      model: isAdmin ? 'claude-opus-4-8' : 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: buildSystemPrompt(body.markdown === true), // markdown diizinkan utk konteks rich-text
      messages,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    });
    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (err) {
    console.error('chat error:', err);
    return jsonResponse({ error: 'Kesalahan server', detail: err.message }, 500);
  }
}

// Panggil RPC ai_check_and_log memakai token user (agar auth.uid() terisi)
async function checkQuota(env, token) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ai_check_and_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: '{}',
    });
    if (!res.ok) {
      // Bila RPC gagal (mis. belum dideploy), tolak demi keamanan budget
      return { ok: false, reason: 'Kuota tidak dapat diverifikasi' };
    }
    return await res.json(); // { ok, reason, sisa_harian }
  } catch {
    return { ok: false, reason: 'Kuota tidak dapat diverifikasi' };
  }
}

// UID admin — hanya akun ini yang memakai model premium.
const ADMIN_UID = 'fb34e91b-dde7-42ce-83e9-ff70a2eaf52f';

// Ambil user id (sub) dari JWT Supabase tanpa panggilan jaringan.
function getUserId(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    return json.sub || null;
  } catch {
    return null;
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
