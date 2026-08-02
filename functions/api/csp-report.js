// functions/api/csp-report.js
// Penerima laporan pelanggaran Content-Security-Policy.
// Dipasang lewat direktif `report-uri /api/csp-report` di header CSP.
//
// TUJUAN: menangkap kerusakan CSP secara otomatis setelah deploy. Contoh nyata —
// handler inline `onload="this.media='all'"` pada link font yang membuat seluruh
// font gagal dimuat; pelanggaran seperti itu tidak menimbulkan error yang terlihat
// dan hanya ketahuan bila seseorang kebetulan membuka Console.
//
// KEPUTUSAN DESAIN — kenapa hanya menulis log, bukan menyimpan ke database:
//   Endpoint ini menerima POST TANPA autentikasi (browser tidak bisa dimintai
//   kredensial saat mengirim laporan). Menulis ke tabel dari endpoint tak
//   terautentikasi berarti membuka jalur penulisan database bagi siapa pun.
//   Laporan CSP juga sangat berisik: mayoritas pelanggaran di dunia nyata berasal
//   dari EKSTENSI BROWSER pengunjung, bukan dari situsmu. Menulis log ke
//   Cloudflare jauh lebih aman dan sudah cukup untuk keperluan diagnosis.
//
// CARA MELIHAT LAPORAN:
//   Cloudflare Dashboard -> Workers & Pages -> sobatinvestor -> tab Logs
//   (atau `npx wrangler pages deployment tail` dari terminal).
//   Cari baris berawalan "CSP-VIOLATION".

// Sumber yang diabaikan: pelanggaran dari ekstensi browser pengunjung, bukan
// masalah pada situs. Tanpa penyaringan ini, log akan tenggelam oleh derau.
const SUMBER_DIABAIKAN = [
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'safari-web-extension://',
  'ms-browser-extension://',
  'webkit-masked-url://',
  'about:blank',
];

function dariEkstensi(laporan) {
  const kandidat = [
    laporan['source-file'],
    laporan['blocked-uri'],
    laporan['document-uri'],
  ];
  return kandidat.some(
    (v) => typeof v === 'string' && SUMBER_DIABAIKAN.some((p) => v.startsWith(p))
  );
}

// Potong string panjang agar satu laporan tidak membanjiri log.
function potong(v, n = 300) {
  if (typeof v !== 'string') return undefined;
  return v.length > n ? v.slice(0, n) + '…' : v;
}

export async function onRequestPost(context) {
  const { request } = context;
  try {
    // Batas ukuran badan permintaan. Browser mengirim laporan kecil (< 2 KB);
    // apa pun di atas 8 KB bukan laporan sah dan langsung ditolak.
    const panjang = Number(request.headers.get('Content-Length') || 0);
    if (panjang > 8192) return new Response(null, { status: 413 });

    const teks = await request.text();
    if (teks.length > 8192) return new Response(null, { status: 413 });

    let payload;
    try {
      payload = JSON.parse(teks);
    } catch {
      return new Response(null, { status: 400 });
    }

    // Format lama (report-uri) membungkus dalam kunci "csp-report".
    const laporan = payload['csp-report'] || payload;
    if (!laporan || typeof laporan !== 'object') {
      return new Response(null, { status: 400 });
    }

    if (dariEkstensi(laporan)) {
      // Diterima diam-diam supaya browser berhenti mencoba ulang.
      return new Response(null, { status: 204 });
    }

    // Hanya field yang berguna untuk diagnosis. Sengaja TIDAK mencatat
    // "script-sample" — isinya bisa memuat potongan data pengguna.
    console.log(
      'CSP-VIOLATION ' +
        JSON.stringify({
          direktif: potong(laporan['effective-directive'] || laporan['violated-directive'], 100),
          diblokir: potong(laporan['blocked-uri'], 200),
          halaman: potong(laporan['document-uri'], 200),
          berkas: potong(laporan['source-file'], 200),
          baris: typeof laporan['line-number'] === 'number' ? laporan['line-number'] : undefined,
          disposisi: potong(laporan['disposition'], 20),
        })
    );

    return new Response(null, { status: 204 });
  } catch {
    // Jangan pernah membocorkan detail internal ke pengirim laporan.
    return new Response(null, { status: 204 });
  }
}

// Metode selain POST tidak dilayani.
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response(null, { status: 405 });
}
