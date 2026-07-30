// Cloudflare Pages Function: /api/notify-signup
// Menerima webhook dari trigger Supabase saat ada pendaftar baru (profiles INSERT),
// lalu mengirim email notifikasi ke admin via Resend.
//
// ENV yang diperlukan di Cloudflare Pages:
//   SIGNUP_WEBHOOK_SECRET - rahasia bersama, harus sama dengan yang disimpan di Supabase Vault
//   RESEND_API_KEY        - kunci API Resend
//   NOTIFY_TO             - (opsional) email tujuan, default admin@sobatinvestor.com
//   SUPABASE_URL          - sudah ada (dipakai chat.js)
//   SUPABASE_SERVICE_KEY  - sudah ada (dipakai chat.js)
//
// Desain keamanan:
//   - Payload dari webhook HANYA berisi { id }. Email & status diambil sendiri dari
//     database pakai service key. Kalaupun rahasia bocor, penyerang tidak bisa
//     menyetir isi email — request palsu hanya menghasilkan sesuatu bila user
//     memang ada dan memang masih pending.
//   - Semua kegagalan dijawab generik; tidak ada detail internal yang bocor.

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    // 1) Verifikasi rahasia bersama
    const secret = env.SIGNUP_WEBHOOK_SECRET;
    if (!secret) return json({ ok: false }, 500);
    const given = request.headers.get('X-Signup-Secret') || '';
    if (!timingSafeEqual(given, secret)) return json({ ok: false }, 403);

    // 2) Payload minimal: { id }
    let body;
    try { body = await request.json(); } catch { return json({ ok: false }, 400); }
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    // UUID v4 sederhana — tolak selain itu
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return json({ ok: false }, 400);
    }

    // 3) Ambil status dari profiles — hanya lanjut bila user ada & masih pending
    const profRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&select=id,approved,created_at`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    if (!profRes.ok) return json({ ok: false }, 502);
    const rows = await profRes.json();
    const prof = Array.isArray(rows) ? rows[0] : null;
    if (!prof) return json({ ok: true, skipped: 'not_found' });      // jangan bocorkan beda kasus ke penyerang lebih dari perlu
    if (prof.approved === true) return json({ ok: true, skipped: 'already_approved' });

    // 4) Ambil email dari Auth Admin API (sumber kebenaran email, bukan profiles)
    const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!userRes.ok) return json({ ok: false }, 502);
    const user = await userRes.json();
    const email = user?.email || '(email tidak terbaca)';
    const confirmed = user?.email_confirmed_at ? 'sudah konfirmasi email' : 'BELUM konfirmasi email';

    // 5) Kirim email via Resend
    const to = env.NOTIFY_TO || 'admin@sobatinvestor.com';
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Sobat Investor <admin@sobatinvestor.com>',
        to: [to],
        subject: `[SobatInvestor] Pendaftar baru menunggu persetujuan: ${email}`,
        text: [
          'Ada pendaftar baru di sobatinvestor.com.',
          '',
          `Email    : ${email}`,
          `Status   : ${confirmed}`,
          `User ID  : ${id}`,
          `Waktu    : ${waktu} WIB`,
          '',
          'Buka tab Admin di aplikasi untuk menyetujui atau menolak.',
          'https://sobatinvestor.com',
        ].join('\n'),
      }),
    });
    if (!mailRes.ok) return json({ ok: false }, 502);

    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
}

// Perbandingan string dengan waktu konstan — hindari timing attack pada rahasia
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
