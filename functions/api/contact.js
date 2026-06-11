// Cloudflare Pages Function: /api/contact
// Mengirim pertanyaan user ke admin@sobatinvestor.com via Resend.
// Set RESEND_API_KEY sebagai environment variable di Cloudflare Pages.

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.RESEND_API_KEY) {
      return json({ error: 'RESEND_API_KEY belum dikonfigurasi' }, 500);
    }

    const body = await request.json();
    const email = String(body.email || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 2000);
    const honeypot = String(body.website || ''); // anti-bot: field tersembunyi, manusia tidak mengisinya

    if (honeypot) return json({ ok: true }, 200); // bot: pura-pura sukses, tidak dikirim
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email tidak valid' }, 400);
    }
    if (message.length < 10) {
      return json({ error: 'Pesan terlalu pendek (min 10 karakter)' }, 400);
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Sobat Investor <admin@sobatinvestor.com>',
        to: ['admin@sobatinvestor.com'],
        reply_to: email,
        subject: `Pertanyaan dari ${email}`,
        text: `Dari: ${email}\n\n${message}\n\n—\nDikirim via form Tanya Admin sobatinvestor.com`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return json({ error: 'Gagal mengirim. Coba lagi nanti.' }, 502);
    }
    return json({ ok: true }, 200);
  } catch (e) {
    console.error('contact error:', e);
    return json({ error: 'Internal error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
