#!/usr/bin/env node
// ============================================================
// hide-socials.mjs — sembunyikan / kembalikan tautan Instagram & TikTok
//
// Jalankan dari root repo:
//   node scripts/hide-socials.mjs            -> sembunyikan
//   node scripts/hide-socials.mjs --restore  -> kembalikan
//   node scripts/hide-socials.mjs --status   -> cek kondisi saat ini
//
// Cara kerja: baris <a> Instagram/TikTok dipotong dari file dan disimpan utuh
// di scripts/.social-backup.json, lalu diganti penanda satu baris. Pemulihan
// membaca sidecar itu, jadi tidak ada escaping HTML/JSX yang bisa rusak dan
// tidak ada risiko markup asli hilang.
//
// LinkedIn sengaja TIDAK disentuh — baris sosial tetap punya isi, tata letak aman.
// ============================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = join(ROOT, 'scripts', '.social-backup.json');
const MARK_HTML = '<!-- tautan sosial disembunyikan sementara: node scripts/hide-socials.mjs --restore -->';
const MARK_JSX = '{/* tautan sosial disembunyikan sementara: node scripts/hide-socials.mjs --restore */}';

// Kunci sidecar SELALU memakai garis miring depan, apa pun OS-nya. Di Windows
// path.join menghasilkan backslash, sehingga string-replace naif akan gagal dan
// membuat kunci berisi jalur absolut — pemulihan lalu rusak. relative() + normalisasi
// separator membuat sidecar yang dibuat di Windows tetap bisa dipulihkan di macOS/Linux.
const toKey = (abs) => relative(ROOT, abs).split(sep).join('/');
const fromKey = (key) => join(ROOT, ...key.split('/'));

// Kumpulkan target: App.jsx + seluruh HTML di public/
function targets() {
  const out = [];
  const push = (p) => { if (existsSync(p)) out.push(p); };
  push(join(ROOT, 'src', 'App.jsx'));
  for (const dir of [join(ROOT, 'public'), join(ROOT, 'public', 'articles')]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.html')) push(join(dir, f));
  }
  return out;
}

const isSocialLine = (line) =>
  /aria-label="(Instagram|TikTok)"/.test(line) && /<a\s/.test(line);

const mode = process.argv.includes('--restore') ? 'restore'
  : process.argv.includes('--status') ? 'status' : 'hide';

// ---------- STATUS ----------
if (mode === 'status') {
  let hidden = 0, active = 0;
  for (const f of targets()) {
    const s = readFileSync(f, 'utf8');
    const h = (s.match(/tautan sosial disembunyikan sementara/g) || []).length;
    const a = s.split('\n').filter(isSocialLine).length;
    hidden += h; active += a;
    if (h || a) console.log(`  ${toKey(f)}: ${a} aktif, ${h} tersembunyi`);
  }
  console.log(`\nTotal: ${active} tautan aktif, ${hidden} penanda tersembunyi`);
  console.log(existsSync(BACKUP) ? 'Sidecar backup ADA.' : 'Sidecar backup tidak ada.');
  process.exit(0);
}

// ---------- RESTORE ----------
if (mode === 'restore') {
  if (!existsSync(BACKUP)) {
    console.error('GAGAL: scripts/.social-backup.json tidak ditemukan. Tidak ada yang bisa dipulihkan.');
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(BACKUP, 'utf8'));
  let n = 0;
  for (const [rel, lines] of Object.entries(backup)) {
    const file = fromKey(rel);
    if (!existsSync(file)) { console.warn(`  LEWAT (tidak ada): ${rel}`); continue; }
    const src = readFileSync(file, 'utf8').split('\n');
    const queue = [...lines];
    const out = src.map((line) => {
      if (line.includes('tautan sosial disembunyikan sementara') && queue.length) { n++; return queue.shift(); }
      return line;
    });
    if (queue.length) console.warn(`  PERINGATAN ${rel}: ${queue.length} baris tersisa di backup, penanda kurang.`);
    writeFileSync(file, out.join('\n'));
    console.log(`  pulih: ${rel}`);
  }
  unlinkSync(BACKUP);
  console.log(`\n${n} tautan dipulihkan. Sidecar backup dihapus.`);
  process.exit(0);
}

// ---------- HIDE ----------
if (existsSync(BACKUP)) {
  console.error('GAGAL: scripts/.social-backup.json sudah ada — tautan tampaknya sudah disembunyikan.');
  console.error('Jalankan --restore dulu, atau hapus sidecar itu bila memang sudah tidak relevan.');
  process.exit(1);
}
const backup = {};
let n = 0;
for (const file of targets()) {
  const rel = toKey(file);
  const src = readFileSync(file, 'utf8').split('\n');
  const removed = [];
  const out = src.map((line) => {
    if (!isSocialLine(line)) return line;
    removed.push(line);
    n++;
    const indent = line.match(/^\s*/)[0];
    return indent + (file.endsWith('.jsx') ? MARK_JSX : MARK_HTML);
  });
  if (!removed.length) continue;
  backup[rel] = removed;
  writeFileSync(file, out.join('\n'));
  console.log(`  ${rel}: ${removed.length} tautan disembunyikan`);
}
if (!n) { console.log('Tidak ada tautan Instagram/TikTok yang ditemukan.'); process.exit(0); }
writeFileSync(BACKUP, JSON.stringify(backup, null, 2));
console.log(`\n${n} tautan disembunyikan di ${Object.keys(backup).length} file.`);
console.log('Markup asli tersimpan di scripts/.social-backup.json — JANGAN dihapus, itu kunci pemulihan.');
console.log('Commit sidecar ini juga supaya pemulihan tetap bisa dilakukan dari mesin lain.');
