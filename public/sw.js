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
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Hanya tangani navigasi (buka halaman) → selalu ambil dari jaringan (network-only).
  // Keberadaan handler 'fetch' inilah yang membuat situs dianggap installable.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
  // Request lain (aset, /api) dibiarkan default → tanpa cache, selalu segar.
});

// ── (Masa depan) Push notification dividen ──────────────────────────────
// Saat fitur digarap, tambahkan di sini:
// self.addEventListener('push', (event) => { ... showNotification ... });
// self.addEventListener('notificationclick', (event) => { ... focus/open ... });
