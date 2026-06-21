// Service worker minimal — Sobat Investor
// Tujuan:
//  (1) membuat situs memenuhi syarat "installable" → memicu beforeinstallprompt
//      (tombol "Pasang" one-tap di Android & Chrome desktop),
//  (2) pondasi untuk push notification di masa depan.
//
// SENGAJA tidak meng-cache agresif: data saham & versi app harus selalu segar
// (hindari tampilan blank/stale setelah deploy — konsisten dgn kebijakan no-cache index.html).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Hapus cache lama peninggalan versi SW sebelumnya (kalau ada) → cegah shell basi.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) { /* abaikan */ }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  // Hanya tangani navigasi (buka halaman) → selalu ambil dari jaringan (network-only).
  // Keberadaan handler 'fetch' inilah yang membuat situs dianggap installable.
  if (event.request.mode === 'navigate') {
    // Selalu ambil index.html SEGAR dari jaringan, lewati cache HTTP browser
    // ({ cache: 'no-store' }) → mencegah shell basi yang menunjuk chunk lama
    // setelah deploy. Fallback ke fetch biasa bila no-store gagal.
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
    );
  }
  // Request lain (aset, /api) dibiarkan default → tanpa cache, selalu segar.
});

// ── (Masa depan) Push notification dividen ──────────────────────────────
// Saat fitur digarap, tambahkan di sini:
// self.addEventListener('push', (event) => { ... showNotification ... });
// self.addEventListener('notificationclick', (event) => { ... focus/open ... });
