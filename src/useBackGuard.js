import { useEffect, useRef } from 'react';

// Cegah tombol Back browser langsung keluar situs.
// Tiap view "dalam" (mis. detail analisis, tab non-Beranda) memanggil
// useBackGuard(active, onBack). Saat aktif, satu entri riwayat didaftarkan;
// menekan Back menjalankan onBack (menutup view itu) alih-alih meninggalkan situs.
//
// Implementasi pakai SATU listener popstate bersama + tumpukan guard, supaya
// untuk view bersarang hanya yang TERDALAM yang ditutup per satu kali Back
// (bukan semua listener ikut terpicu). Penutupan via kontrol in-app membuang
// sentinel-nya sendiri (history.back) dengan flag suppress agar tidak salah
// memicu guard induk.

const stack = []; // [{ id, onBack, popped }] — terdalam di akhir
let installed = false;
let suppress = 0; // jumlah event popstate berikutnya yang harus diabaikan (dari history.back kita sendiri)
let nextId = 1;

function onPop() {
  if (suppress > 0) { suppress -= 1; return; }
  const top = stack[stack.length - 1];
  if (!top) return; // tak ada guard → biarkan browser bernavigasi normal
  top.popped = true; // browser sudah membuang sentinel level ini
  top.onBack();
}

function pushGuard(onBack) {
  if (!installed && typeof window !== 'undefined') {
    window.addEventListener('popstate', onPop);
    installed = true;
  }
  const entry = { id: nextId++, onBack, popped: false };
  stack.push(entry);
  window.history.pushState({ sbGuard: entry.id }, '');
  return entry;
}

function releaseGuard(entry) {
  const idx = stack.indexOf(entry);
  if (idx === -1) return;
  stack.splice(idx, 1);
  if (!entry.popped) {
    // Ditutup lewat kontrol in-app (bukan Back browser) → buang sentinel kita
    // supaya riwayat tetap seimbang. popstate yang dihasilkan diabaikan.
    suppress += 1;
    window.history.back();
  }
}

// Diekspor untuk keperluan uji (logika murni, tanpa React).
export const _internal = { stack, pushGuard, releaseGuard, onPop, reset() { stack.length = 0; suppress = 0; installed = false; nextId = 1; } };

export default function useBackGuard(active, onBack) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry = pushGuard(() => cb.current());
    return () => releaseGuard(entry);
  }, [active]);
}
