#!/usr/bin/env node
// ============================================================
// hide-socials.mjs v2 — sembunyikan / kembalikan tautan Instagram & TikTok
//
//   node scripts/hide-socials.mjs --scan      -> LIHAT SAJA, tidak mengubah apa pun
//   node scripts/hide-socials.mjs             -> sembunyikan
//   node scripts/hide-socials.mjs --restore   -> kembalikan
//   node scripts/hide-socials.mjs --status    -> ringkasan kondisi
//
// Perubahan dari v1:
//  1. Pencarian REKURSIF ke seluruh src/, public/, dan functions/
//     (v1 hanya melihat dua folder dan melewatkan subfolder).
//  2. Pencocokan berdasarkan URL instagram.com / tiktok.com pada elemen <a>,
//     bukan berdasarkan aria-label. Tautan tanpa aria-label kini ikut tertangkap.
//  3. Menangani elemen <a> yang membentang lebih dari satu baris.
//  4. AMAN DIJALANKAN ULANG. Ini yang paling penting: setiap kali sebuah file
//     diganti versi baru (App.jsx hasil edit, artikel baru), tautannya ikut
//     kembali. Cukup jalankan lagi — entri sidecar ditambah, yang sudah
//     tersembunyi dilewati dengan sendirinya karena tidak lagi cocok pola.
//
// LinkedIn sengaja TIDAK disentuh.
// ============================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = join(ROOT, 'scripts', '.social-backup.json');
const MARK = 'tautan sosial disembunyikan sementara';
const MARK_HTML = `<!-- ${MARK}: node scripts/hide-socials.mjs --restore -->`;
const MARK_JSX = `{/* ${MARK}: node scripts/hide-socials.mjs --restore */}`;

const toKey = (abs) => relative(ROOT, abs).split(sep).join('/');
const fromKey = (key) => join(ROOT, ...key.split('/'));

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.wrangler', '.vercel', '.next']);
const EXT = new Set(['.jsx', '.js', '.html', '.htm']);

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

// Elemen <a ...> ... </a>, boleh membentang beberapa baris.
const ANCHOR = /<a\b[\s\S]*?<\/a>/g;
const IS_SOCIAL = (html) => /(?:instagram\.com|tiktok\.com)/i.test(html);

const mode = process.argv.includes('--restore') ? 'restore'
  : process.argv.includes('--status') ? 'status'
  : process.argv.includes('--scan') ? 'scan' : 'hide';

// ---------- SCAN / STATUS ----------
if (mode === 'scan' || mode === 'status') {
  let aktif = 0, tersembunyi = 0, nFile = 0;
  for (const f of targets()) {
    const s = readFileSync(f, 'utf8');
    const hits = (s.match(ANCHOR) || []).filter(IS_SOCIAL);
    const marks = (s.match(new RegExp(MARK, 'g')) || []).length;
    if (!hits.length && !marks) continue;
    nFile++; aktif += hits.length; tersembunyi += marks;
    console.log(`  ${toKey(f)}  —  aktif: ${hits.length}, tersembunyi: ${marks}`);
    if (mode === 'scan') for (const h of hits) {
      const url = (h.match(/href="([^"]+)"/) || [, '?'])[1];
      console.log(`        ${url}`);
    }
  }
  console.log(`\n${nFile} file tersentuh · ${aktif} tautan MASIH AKTIF · ${tersembunyi} penanda tersembunyi`);
  console.log(existsSync(BACKUP) ? 'Sidecar backup: ADA.' : 'Sidecar backup: tidak ada.');
  if (aktif && mode === 'scan') console.log('\nJalankan tanpa argumen untuk menyembunyikan yang masih aktif.');
  process.exit(0);
}

// ---------- RESTORE ----------
if (mode === 'restore') {
  if (!existsSync(BACKUP)) {
    console.error('GAGAL: scripts/.social-backup.json tidak ada. Tidak ada yang bisa dipulihkan.');
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(BACKUP, 'utf8'));
  let n = 0, lewat = 0;
  for (const [key, blocks] of Object.entries(backup)) {
    const file = fromKey(key);
    if (!existsSync(file)) { console.warn(`  LEWAT (file tidak ada): ${key}`); lewat++; continue; }
    let s = readFileSync(file, 'utf8');
    const q = [...blocks];
    for (const m of [MARK_JSX, MARK_HTML]) {
      while (q.length && s.includes(m)) { s = s.replace(m, q.shift()); n++; }
    }
    if (q.length) console.warn(`  PERINGATAN ${key}: ${q.length} blok tanpa penanda pasangan (file mungkin sudah diganti versi baru).`);
    writeFileSync(file, s);
    console.log(`  pulih: ${key}`);
  }
  unlinkSync(BACKUP);
  console.log(`\n${n} tautan dipulihkan${lewat ? `, ${lewat} file dilewati` : ''}. Sidecar dihapus.`);
  process.exit(0);
}

// ---------- HIDE (idempoten, aman dijalankan berulang) ----------
const backup = existsSync(BACKUP) ? JSON.parse(readFileSync(BACKUP, 'utf8')) : {};
if (Object.keys(backup).length) console.log('Sidecar sudah ada — mode lanjutan, entri lama dipertahankan.\n');

let n = 0, nFile = 0;
for (const file of targets()) {
  const key = toKey(file);
  const isJsx = /\.jsx?$/i.test(file);
  const removed = [];
  const s = readFileSync(file, 'utf8').replace(ANCHOR, (m) => {
    if (!IS_SOCIAL(m)) return m;
    removed.push(m);
    return isJsx ? MARK_JSX : MARK_HTML;
  });
  if (!removed.length) continue;
  backup[key] = (backup[key] || []).concat(removed);
  writeFileSync(file, s);
  n += removed.length; nFile++;
  console.log(`  ${key}: ${removed.length} tautan disembunyikan`);
}

if (!n) {
  console.log('Tidak ada tautan Instagram/TikTok aktif. Semua sudah bersih.');
  process.exit(0);
}
writeFileSync(BACKUP, JSON.stringify(backup, null, 2));
console.log(`\n${n} tautan disembunyikan di ${nFile} file.`);
console.log('Markup asli tersimpan di scripts/.social-backup.json — WAJIB ikut di-commit.');
console.log('\nIngat: setiap kali menimpa file dengan versi baru, jalankan skrip ini lagi.');
