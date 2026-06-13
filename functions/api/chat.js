// Cloudflare Pages Function: /api/chat
// Proxy ke Anthropic dengan API key server-side + proteksi kuota (budget ~Rp45rb/bln).
// ENV yang diperlukan di Cloudflare Pages:
//   ANTHROPIC_API_KEY  - kunci API Anthropic
//   SUPABASE_URL       - https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  - anon key (untuk memanggil RPC dgn token user)

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  return `Kamu adalah Sobat AI, asisten dari aplikasi Sobat Investor — pemantau portofolio saham IDX (Bursa Efek Indonesia).

Tanggal hari ini: ${today}. Gunakan ini untuk semua perhitungan waktu/selisih tahun. Hitung dengan teliti.

Gaya jawab:
- Bahasa Indonesia, profesional, ringkas. Mulai dari gambaran besar lalu ke detail.
- Tulis dalam PROSA mengalir dan paragraf pendek. JANGAN gunakan tanda markdown seperti #, ##, ###, atau ** (bintang). Untuk daftar, pakai kalimat biasa atau tanda hubung "-" sederhana saja. Output kamu ditampilkan apa adanya tanpa render markdown, jadi simbol-simbol itu akan terlihat jelek.

Cakupan: saham Indonesia, analisis emiten, dividen, dan konsep investasi.

Aturan FAKTA (SANGAT PENTING):
- JANGAN PERNAH menebak atau mengarang nama perusahaan, sektor, atau angka keuangan suatu emiten. Kode saham (mis. MSTI, BBCA) TIDAK boleh kamu terjemahkan sendiri menjadi nama perusahaan dari ingatanmu — kamu sering salah.
- Jika ada blok "DATA EMITEN" di pesan, pakai HANYA nama, sektor, dan status syariah dari situ. Jika sebuah kode tidak ada di DATA EMITEN, katakan terus terang kamu tidak punya datanya dan jangan mengarang — minta pengguna cek di tab Analisis aplikasi.
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

    // 3) Paksa parameter aman di server (client TIDAK bisa override model/system/token)
    const safeBody = {
      model: 'claude-haiku-4-5-20251001', // model termurah — kunci budget
      max_tokens: 600,                     // chat saham cukup pendek
      system: buildSystemPrompt(),               // persona terkunci di server
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
