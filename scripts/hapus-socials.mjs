#!/usr/bin/env node
// ============================================================
// hapus-socials.mjs — hapus PERMANEN tautan Instagram & TikTok
//
//   node scripts/hapus-socials.mjs --scan   -> lihat saja, tidak mengubah apa pun
//   node scripts/hapus-socials.mjs          -> hapus
//   node scripts/hapus-socials.mjs --check  -> keluar dengan kode 1 bila ada temuan
//
// Mode --check itu penjaganya. Tautan ini terus kembali bukan karena
// penghapusannya gagal, tapi karena ia hidup di kode sumber: setiap kali sebuah
// berkas diganti versi baru, isinya ikut terbawa. Pasang --check di CI
// (.github/workflows/socials-guard.yml) supaya build GAGAL saat itu terjadi,
// bukan ketahuan berbulan-bulan kemudian dari layar ponsel.
//
// Ini pengganti sekali-pakai untuk hide-socials.mjs. Bedanya mendasar:
// hide-socials menyembunyikan dan menyimpan salinannya di sidecar supaya bisa
// dikembalikan. Skrip ini menghapus, lalu MEMBUANG jalur pengembaliannya —
// termasuk hide-socials.mjs dan sidecar-nya sendiri. Setelah dijalankan dan
// di-commit, satu-satunya jalan kembali adalah riwayat git.
//
// Tiga hal yang dibersihkan:
//   1. Elemen <a> yang menunjuk instagram.com / tiktok.com (yang belum sempat
//      disembunyikan, mis. berkas yang diganti versi baru setelah hide dijalankan).
//   2. Baris penanda peninggalan hide-socials.mjs.
//   3. Skrip hide-socials.mjs dan sidecar .social-backup.json.
//
// LinkedIn sengaja TIDAK disentuh.
// ============================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = 'tautan sosial disembunyikan sementara';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.wrangler', '.vercel', '.next']);
const EXT = new Set(['.jsx', '.tsx', '.js', '.ts', '.html', '.htm']);

const toKey = (abs) => relative(ROOT, abs).split(sep).join('/');

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

function targets() {
  const out = [];
  for (const d of ['src', 'public', 'functions']) walk(join(ROOT, d), out);
  const idx = join(ROOT, 'index.html');
  if (existsSync(idx)) out.push(idx);
  return out;
}

// Elemen <a ...>...</a>, boleh membentang beberapa baris. Pola sama dengan
// hide-socials.mjs supaya cakupannya identik — kalau yang lama menemukannya,
// yang ini juga.
const ANCHOR = /<a\b[\s\S]*?<\/a>/g;
const IS_SOCIAL = (html) => /(?:instagram\.com|tiktok\.com)/i.test(html);

const scanSaja = process.argv.includes('--scan');
const modeCheck = process.argv.includes('--check');
const lihatSaja = scanSaja || modeCheck;

let nFile = 0, nTautan = 0, nPenanda = 0;

for (const f of targets()) {
  const asli = readFileSync(f, 'utf8');

  const tautan = (asli.match(ANCHOR) || []).filter(IS_SOCIAL);
  const penanda = (asli.match(new RegExp(MARK, 'g')) || []).length;
  if (!tautan.length && !penanda) continue;

  nFile++; nTautan += tautan.length; nPenanda += penanda;
  console.log(`  ${toKey(f)}  —  tautan: ${tautan.length}, penanda: ${penanda}`);
  if (lihatSaja) { for (const t of tautan) console.log(`        ${(t.match(/href="([^"]+)"/) || [, '?'])[1]}`); continue; }

  let hasil = asli;
  // 1. buang elemen <a> sosial
  hasil = hasil.replace(ANCHOR, (m) => (IS_SOCIAL(m) ? '' : m));
  // 2. buang baris penanda, apa pun gaya komentarnya (HTML atau JSX)
  hasil = hasil.replace(new RegExp(`^[^\\n]*${MARK}[^\\n]*\\n`, 'gm'), '');
  // 3. rapikan baris yang jadi kosong-berspasi akibat penghapusan di atas
  hasil = hasil.replace(/^[ \t]+\n/gm, '');

  writeFileSync(f, hasil);
}

if (!nFile) {
  console.log('  Bersih — tidak ada tautan Instagram/TikTok.');
} else {
  console.log(`\n  ${nFile} berkas · ${nTautan} tautan · ${nPenanda} penanda`);
}

// ---------- penjaga CI ----------
if (modeCheck) {
  if (nFile) {
    console.error('\n  GAGAL: tautan Instagram/TikTok muncul kembali di berkas di atas.');
    console.error('  Hapus dari sumbernya, lalu commit ulang. Jangan jalankan skrip');
    console.error('  penghapus di CI — perbaikannya harus terlihat di riwayat git.');
    process.exit(1);
  }
  process.exit(0);
}

// ---------- buang jalur pengembalian ----------
if (!lihatSaja) {
  for (const rel of ['scripts/hide-socials.mjs', 'scripts/.social-backup.json']) {
    const p = join(ROOT, ...rel.split('/'));
    if (existsSync(p)) { unlinkSync(p); console.log(`  dihapus: ${rel}`); }
  }
  console.log('\n  Selesai. Periksa `git diff` sebelum commit — setelah ini');
  console.log('  pengembalian hanya lewat riwayat git.');
}
