// functions/api/_middleware.js
// Gerbang untuk SEMUA endpoint /api/* (B3 — penghalang kasual + CORS ketat).
//
// Tujuan:
//   1. Tolak request /api/* yang DATANG dari origin lain (mis. situs clone) di browser.
//   2. Perketat CORS: ganti `Access-Control-Allow-Origin: *` (yang di-set tiap handler)
//      menjadi origin spesifik milik kita saja.
//
// Sifat: PENGHALANG KASUAL, bukan benteng. Server-to-server bisa memalsukan/menghilangkan
// header Origin/Referer, jadi proteksi nyata endpoint sensitif tetap = auth + RLS + kuota
// (mis. /api/chat sudah butuh JWT user + kuota per-user). Middleware ini menutup penyalahgunaan
// berbasis-browser dari domain lain (clone tidak bisa "menumpang" backend-mu).
//
// Catatan perilaku:
//   - Browser SELALU mengirim header Origin untuk request lintas-origin → itu yang kita blokir.
//   - Request same-origin GET sering TANPA Origin (hanya Referer) → tetap diizinkan.
//   - Request tanpa Origin & tanpa Referer (cron/health/akses langsung) → DIIZINKAN
//     (tidak bisa dibedakan dari pemanggil sah; sengaja longgar agar tak memutus layanan).

const ALLOWED_ORIGINS = [
  "https://sobatinvestor.com",
  "https://www.sobatinvestor.com",
  // Dev lokal (aman: halaman jahat di browser korban tetap memakai origin aslinya,
  // tidak bisa memalsukan localhost). Hapus bila tak perlu.
  "http://localhost:5173",
  "http://localhost:8788",
];

// Normalisasi sebuah nilai header (Origin atau Referer) menjadi "protocol//host".
// Return: string origin bila cocok daftar putih, false bila TIDAK cocok, null bila kosong/tak valid.
function matchOrigin(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    const origin = `${u.protocol}//${u.host}`;
    return ALLOWED_ORIGINS.includes(origin) ? origin : false;
  } catch {
    return false;
  }
}

function forbidden(reason) {
  return new Response(JSON.stringify({ error: "Forbidden", reason }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequest(context) {
  const { request, next } = context;
  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");

  const originMatch = matchOrigin(origin);   // string | false | null
  const refererMatch = matchOrigin(referer); // string | false | null

  // --- Preflight CORS (hanya muncul untuk request lintas-origin) ---
  if (request.method === "OPTIONS") {
    if (originMatch) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": originMatch,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin",
        },
      });
    }
    // OPTIONS dari origin asing → tolak
    return forbidden("origin");
  }

  // --- Gerbang utama ---
  // Origin hadir tapi tidak cocok → blokir (kasus clone di browser).
  if (origin && originMatch === false) return forbidden("origin");
  // Origin tidak ada, tapi Referer hadir & tidak cocok → blokir.
  if (!origin && referer && refererMatch === false) return forbidden("referer");
  // Selain itu (cocok, atau kedua header kosong) → lanjut ke handler.

  const response = await next();

  // Perketat CORS: bila origin/referer cocok, timpa ACAO '*' dari handler dengan origin spesifik.
  const allow = originMatch || refererMatch;
  if (allow) {
    const tightened = new Response(response.body, response);
    tightened.headers.set("Access-Control-Allow-Origin", allow);
    tightened.headers.append("Vary", "Origin");
    return tightened;
  }

  return response;
}
