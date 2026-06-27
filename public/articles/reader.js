/* Sobat Investor — Reader mode (paginasi seperti buku)
   Eksternal agar CSP-safe. Tanpa library. */
(function () {
  var book = document.getElementById('book');
  if (!book) return;

  var elCur  = document.getElementById('rcur');
  var elTot  = document.getElementById('rtot');
  var elFill = document.getElementById('rfill');
  var btnMark = document.getElementById('rmark');
  var chip   = document.getElementById('rchip');
  var chipNum = chip ? chip.querySelector('span') : null;
  var toast  = document.getElementById('rtoast');

  var KEY = 'reader:' + location.pathname;
  var pages = 1, cur = 0;

  function getInt(k, d) {
    var v = localStorage.getItem(k);
    return v === null ? d : (parseInt(v, 10) || 0);
  }
  function setInt(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  function pageW() { return book.clientWidth; }

  function measure() {
    var w = pageW();
    // Paksa lebar kolom = lebar layar agar tiap geseran = 1 halaman.
    book.style.columnWidth = w + 'px';
    pages = Math.max(1, Math.round(book.scrollWidth / w));
    if (elTot) elTot.textContent = pages;
    cur = Math.min(pages - 1, Math.round(book.scrollLeft / w));
    render();
  }

  function render() {
    cur = Math.min(pages - 1, Math.max(0, cur));
    if (elCur) elCur.textContent = cur + 1;
    if (elFill) elFill.style.width = ((cur + 1) / pages * 100) + '%';
    var bm = getInt(KEY + ':mark', -1);
    if (chip) {
      if (bm >= 0 && bm < pages) {
        chip.style.display = 'inline-flex';
        if (chipNum) chipNum.textContent = bm + 1;
      } else {
        chip.style.display = 'none';
      }
    }
    if (btnMark) btnMark.classList.toggle('on', bm === cur);
  }

  function goto(i, smooth) {
    cur = Math.min(pages - 1, Math.max(0, i));
    book.scrollTo({ left: cur * pageW(), behavior: smooth ? 'smooth' : 'auto' });
    setInt(KEY + ':last', cur);
    render();
  }
  function next() { goto(cur + 1, true); }
  function prev() { goto(cur - 1, true); }

  // Snap ke halaman terdekat setelah geser bebas
  var st;
  book.addEventListener('scroll', function () {
    clearTimeout(st);
    var w = pageW();
    cur = Math.round(book.scrollLeft / w);
    render();
    st = setTimeout(function () {
      var target = Math.round(book.scrollLeft / w) * w;
      if (Math.abs(book.scrollLeft - target) > 1) {
        book.scrollTo({ left: target, behavior: 'smooth' });
      }
      setInt(KEY + ':last', Math.round(book.scrollLeft / w));
    }, 120);
  }, { passive: true });

  var bN = document.getElementById('rnext');
  var bP = document.getElementById('rprev');
  if (bN) bN.addEventListener('click', next);
  if (bP) bP.addEventListener('click', prev);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); e.preventDefault(); }
  });

  if (btnMark) btnMark.addEventListener('click', function () {
    var bm = getInt(KEY + ':mark', -1);
    if (bm === cur) { localStorage.removeItem(KEY + ':mark'); toastMsg('Tanda dihapus'); }
    else { setInt(KEY + ':mark', cur); toastMsg('Ditandai di halaman ' + (cur + 1)); }
    render();
  });
  if (chip) chip.addEventListener('click', function () {
    var bm = getInt(KEY + ':mark', -1);
    if (bm >= 0) goto(bm, true);
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { var keep = cur; measure(); goto(keep, false); }, 150);
  });

  function toastMsg(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  function init() {
    measure();
    // ukur ulang sekali lagi setelah font/layout benar-benar stabil
    setTimeout(function () {
      var frac = cur;
      measure();
      var last = getInt(KEY + ':last', 0);
      if (last > 0 && last < pages) { goto(last, false); toastMsg('Lanjut dari halaman ' + (last + 1)); }
      else { goto(frac, false); }
    }, 250);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(init, 30); });
  } else {
    window.addEventListener('load', function () { setTimeout(init, 60); });
  }
})();
