// src/fundamentals-live.js
//
// Satu-satunya tempat PER / PBV / imbal hasil dividen dihitung.
//
// ALASAN ADA BERKAS INI
//   Sebelumnya ketiganya disimpan di tabel sebagai hasil jadi pada harga
//   tertentu, lalu basi diam-diam saat harga bergerak. Sekarang tabel hanya
//   menyimpan fakta laporan keuangan (eps_ttm, bvps) dan view menyediakan DPS
//   12 bulan; pembagian dengan harga terjadi di sini, dengan harga live yang
//   sama dengan yang dilihat pengguna di layar.
//
//   Kalau nanti ada tempat keempat yang menampilkan PER, ia memanggil fungsi
//   ini juga — bukan menghitung sendiri. Tiga tempat yang menghitung dengan
//   caranya masing-masing adalah cara paling pasti menghasilkan tiga angka
//   berbeda untuk hal yang sama.

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

/**
 * Hitung turunan berbasis harga untuk SATU baris fundamentals_live.
 *
 * @param {object} row   baris dari view `fundamentals_live`
 * @param {number} price harga pasar terakhir (Rp). null/0 = tidak tersedia.
 * @returns {object} salinan row dengan per / pbv / div_yield sudah hidup,
 *                   plus penanda asal tiap angka untuk keperluan UI.
 */
export function deriveFund(row, price) {
  if (!row) return null;
  const px = Number(price);
  const punyaHarga = Number.isFinite(px) && px > 0;

  const eps = Number(row.eps_ttm);
  const bvps = Number(row.bvps);
  const dps = Number(row.dps12);

  // PER: EPS <= 0 sengaja menghasilkan null, bukan angka negatif. PER negatif
  // tidak bermakna dan akan merusak pengurutan tabel — konsisten dengan
  // computeOverall yang juga tidak menilai emiten merugi.
  const perLive = punyaHarga && Number.isFinite(eps) && eps > 0 ? px / eps : null;
  const pbvLive = punyaHarga && Number.isFinite(bvps) && bvps > 0 ? px / bvps : null;

  // Imbal hasil hanya dihitung bila SETIAP baris dividen dalam 12 bulan punya
  // nominal (flag dps_lengkap dari view). Satu amount NULL membuat jumlahnya
  // kurang, dan yield yang terlalu rendah lebih menyesatkan daripada strip
  // kosong yang jujur bilang "belum diverifikasi".
  const dyLive =
    punyaHarga && row.dps_lengkap && Number.isFinite(dps) && dps > 0
      ? (dps / px) * 100
      : null;

  return {
    ...row,
    per: r2(perLive) ?? row.per ?? null,
    pbv: r2(pbvLive) ?? row.pbv ?? null,
    div_yield: r2(dyLive) ?? row.div_yield ?? null,
    // Asal angka — dipakai UI untuk menulis catatan kaki yang benar.
    // 'live'     : dihitung dari harga sekarang
    // 'tersimpan': nilai kurasi lama, bisa basi
    // null       : tidak ada keduanya
    _asal: {
      per: perLive != null ? 'live' : row.per != null ? 'tersimpan' : null,
      pbv: pbvLive != null ? 'live' : row.pbv != null ? 'tersimpan' : null,
      div_yield: dyLive != null ? 'live' : row.div_yield != null ? 'tersimpan' : null,
    },
  };
}

/**
 * Versi peta: terima array baris + fungsi pencari harga, kembalikan
 * peta simbol -> baris yang sudah hidup.
 *
 * @param {Array}    rows     hasil select dari `fundamentals_live`
 * @param {Function} priceOf  (symbol) => number|null
 */
export function hydrateFunds(rows, priceOf) {
  const m = {};
  if (!Array.isArray(rows)) return m;
  for (const row of rows) {
    const sym = String(row.symbol || '').toUpperCase();
    if (!sym) continue;
    m[sym] = deriveFund(row, priceOf ? priceOf(sym) : null);
  }
  return m;
}

/**
 * Catatan kaki yang jujur soal asal angka. Dipakai FundamentalStrip supaya
 * teksnya tidak lagi mengklaim semuanya "dikurasi manual" padahal sebagian
 * kini dihitung live.
 */
export function catatanAsal(f) {
  if (!f) return '';
  const live = Object.entries(f._asal || {})
    .filter(([, v]) => v === 'live')
    .map(([k]) => ({ per: 'PER', pbv: 'PBV', div_yield: 'Yield' }[k]));
  if (!live.length) return '';
  return `${live.join('/')} dihitung dari harga pasar terakhir dibagi EPS/BVPS laporan keuangan${
    f.basis_date ? ` per ${f.basis_date}` : ''
  }${f.basis_per ? ` (basis ${f.basis_per})` : ''}.`;
}
