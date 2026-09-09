import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Auto-recovery deploy: bila shell yang sedang jalan menunjuk chunk lama yang
// hash-nya sudah berubah (file lama 404 → server balas index.html/HTML → dynamic
// import gagal dgn "MIME text/html"), muat ulang SEKALI untuk mengambil shell +
// chunk terbaru. Guard sessionStorage mencegah loop bila gagal bukan karena versi.
window.addEventListener('vite:preloadError', (event) => {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (!sessionStorage.getItem('sw_reloaded_once')) {
    sessionStorage.setItem('sw_reloaded_once', '1');
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registrasi service worker — PWA installable (beforeinstallprompt) + pondasi push.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* abaikan kegagalan registrasi */ });
  });
}
