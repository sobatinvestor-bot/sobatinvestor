/* Sobat Investor — Reader mode (paginasi seperti buku)
   + gelembung Daftar Isi yang bisa di-drag (ala AssistiveTouch iPhone).
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
  function setStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function pageW() { return book.clientWidth; }

  function measure() {
    var w = pageW();
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
      if (bm >= 0 && bm < pages) { chip.style.display = 'inline-flex'; if (chipNum) chipNum.textContent = bm + 1; }
      else { chip.style.display = 'none'; }
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

  var st;
  book.addEventListener('scroll', function () {
    clearTimeout(st);
    var w = pageW();
    cur = Math.round(book.scrollLeft / w);
    render();
    st = setTimeout(function () {
      var target = Math.round(book.scrollLeft / w) * w;
      if (Math.abs(book.scrollLeft - target) > 1) book.scrollTo({ left: target, behavior: 'smooth' });
      setInt(KEY + ':last', Math.round(book.scrollLeft / w));
    }, 120);
  }, { passive: true });

  var bN = document.getElementById('rnext');
  var bP = document.getElementById('rprev');
  if (bN) bN.addEventListener('click', next);
  if (bP) bP.addEventListener('click', prev);

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeTOC(); return; }
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

  function toastMsg(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  }

  /* =================== Gelembung Daftar Isi (drag) =================== */
  var SZ = 48, bubble, back, panel, list, dimT;

  function injectCSS() {
    var css = '' +
      '.fab{position:fixed;width:' + SZ + 'px;height:' + SZ + 'px;border-radius:50%;z-index:70;' +
        'background:#1F3B2D;color:#F4EFE6;border:2px solid #C49B3C;display:flex;align-items:center;' +
        'justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(26,42,32,.3);opacity:.55;' +
        'transition:opacity .25s,transform .1s;touch-action:none;user-select:none;-webkit-user-select:none;}' +
      '.fab.show{opacity:1;}.fab:active{transform:scale(.93);}' +
      '.toc-back{position:fixed;inset:0;background:rgba(20,30,25,.45);z-index:80;opacity:0;' +
        'pointer-events:none;transition:opacity .2s;}' +
      '.toc-panel{position:fixed;left:0;right:0;bottom:0;z-index:81;max-height:72vh;background:#F4EFE6;' +
        'border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(26,42,32,.25);transform:translateY(101%);' +
        'transition:transform .26s ease;display:flex;flex-direction:column;' +
        "font-family:'Plus Jakarta Sans',system-ui,sans-serif;}" +
      '.toc-open .toc-back{opacity:1;pointer-events:auto;}.toc-open .toc-panel{transform:translateY(0);}' +
      ".toc-head{padding:15px 18px 11px;font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:18px;" +
        'color:#1F3B2D;border-bottom:1px solid rgba(26,42,32,.1);display:flex;align-items:center;justify-content:space-between;}' +
      '.toc-head .x{background:none;border:none;font-size:22px;line-height:1;color:#46584d;cursor:pointer;padding:0 4px;}' +
      '.toc-list{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 10px 22px;}' +
      '.toc-item{width:100%;text-align:left;background:none;border:none;cursor:pointer;display:flex;' +
        'align-items:baseline;justify-content:space-between;gap:12px;padding:11px 12px;border-radius:10px;font-family:inherit;}' +
      '.toc-item:active{background:rgba(31,59,45,.08);}.toc-item.cur{background:rgba(196,155,60,.16);}' +
      '.toc-t{font-size:14.5px;color:#1A2A20;line-height:1.35;}' +
      '.toc-item.cur .toc-t{font-weight:700;color:#1F3B2D;}' +
      '.toc-p{font-size:12px;color:#46584d;font-variant-numeric:tabular-nums;flex-shrink:0;}' +
      '.toc-empty{padding:18px;color:#46584d;font-size:14px;}';
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  function buildElements() {
    bubble = document.createElement('button');
    bubble.className = 'fab';
    bubble.setAttribute('aria-label', 'Daftar isi');
    bubble.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="3.6" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.6" cy="18" r="1.1" fill="currentColor" stroke="none"/></svg>';

    back = document.createElement('div'); back.className = 'toc-back';
    panel = document.createElement('div'); panel.className = 'toc-panel';
    var head = document.createElement('div'); head.className = 'toc-head';
    head.innerHTML = '<span>Daftar Isi</span><button class="x" aria-label="Tutup">&times;</button>';
    list = document.createElement('div'); list.className = 'toc-list';
    panel.appendChild(head); panel.appendChild(list);

    document.body.appendChild(bubble);
    document.body.appendChild(back);
    document.body.appendChild(panel);

    head.querySelector('.x').addEventListener('click', closeTOC);
    back.addEventListener('click', closeTOC);
  }

  function wake() {
    if (!bubble) return;
    bubble.classList.add('show');
    clearTimeout(dimT);
    dimT = setTimeout(function () { bubble.classList.remove('show'); }, 2600);
  }

  function placeFab() {
    var v = localStorage.getItem(KEY + ':fab');
    var edge = 'r', tr = 0.62;
    if (v) { var p = v.split(':'); edge = p[0] === 'l' ? 'l' : 'r'; tr = parseFloat(p[1]); if (isNaN(tr)) tr = 0.62; }
    var x = edge === 'r' ? (window.innerWidth - SZ - 12) : 12;
    var y = Math.min(window.innerHeight - SZ - 12, Math.max(58, tr * window.innerHeight));
    bubble.style.left = x + 'px'; bubble.style.top = y + 'px';
    bubble.style.right = 'auto'; bubble.style.bottom = 'auto';
  }
  function savePos() {
    var r = bubble.getBoundingClientRect();
    var edge = (r.left + r.width / 2) > window.innerWidth / 2 ? 'r' : 'l';
    setStr(KEY + ':fab', edge + ':' + (r.top / window.innerHeight).toFixed(4));
  }

  function setupDrag() {
    var down = false, sx, sy, ox, oy;
    bubble.addEventListener('pointerdown', function (e) {
      down = true; wake();
      try { bubble.setPointerCapture(e.pointerId); } catch (er) {}
      var r = bubble.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      e.preventDefault();
    });
    bubble.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      var nx = Math.min(window.innerWidth - SZ - 6, Math.max(6, ox + dx));
      var ny = Math.min(window.innerHeight - SZ - 6, Math.max(54, oy + dy));
      bubble.style.left = nx + 'px'; bubble.style.top = ny + 'px';
    });
    function end(e) {
      if (!down) return; down = false;
      var ex = (e.clientX != null) ? e.clientX : sx;
      var ey = (e.clientY != null) ? e.clientY : sy;
      var dist = Math.sqrt((ex - sx) * (ex - sx) + (ey - sy) * (ey - sy));
      if (dist < 12) {
        bubble.style.left = ox + 'px'; bubble.style.top = oy + 'px';
        openTOC();
      } else {
        var r = bubble.getBoundingClientRect();
        var toRight = (r.left + r.width / 2) > window.innerWidth / 2;
        bubble.style.left = (toRight ? (window.innerWidth - SZ - 12) : 12) + 'px';
        savePos();
      }
      wake();
    }
    bubble.addEventListener('pointerup', end);
    bubble.addEventListener('pointercancel', function () { down = false; });
    bubble.addEventListener('click', function () {
      if (!document.body.classList.contains('toc-open')) openTOC();
    });
  }

  function chapterPage(el) {
    var bx = book.getBoundingClientRect().left;
    var x = el.getBoundingClientRect().left - bx + book.scrollLeft;
    return Math.max(0, Math.min(pages - 1, Math.round(x / book.clientWidth)));
  }

  function buildTOC() {
    list.innerHTML = '';
    var hs = book.querySelectorAll('article h2');
    if (!hs.length) { list.innerHTML = '<div class="toc-empty">Tidak ada bab.</div>'; return; }
    var items = [];
    hs.forEach(function (h) {
      var pg = chapterPage(h);
      var b = document.createElement('button'); b.className = 'toc-item';
      var t = document.createElement('span'); t.className = 'toc-t'; t.textContent = h.textContent.trim();
      var p = document.createElement('span'); p.className = 'toc-p'; p.textContent = 'hal ' + (pg + 1);
      b.appendChild(t); b.appendChild(p);
      b.addEventListener('click', function () { closeTOC(); goto(pg, true); });
      b._pg = pg; list.appendChild(b); items.push(b);
    });
    var active = null;
    items.forEach(function (b) { if (b._pg <= cur) active = b; });
    if (active) active.classList.add('cur');
  }

  function openTOC() { buildTOC(); document.body.classList.add('toc-open'); }
  function closeTOC() { document.body.classList.remove('toc-open'); }

  function setupTOC() { injectCSS(); buildElements(); setupDrag(); placeFab(); wake(); }

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { var keep = cur; measure(); goto(keep, false); if (bubble) placeFab(); }, 150);
  });

  function init() {
    measure();
    setupTOC();
    setTimeout(function () {
      var frac = cur; measure();
      var last = getInt(KEY + ':last', 0);
      if (last > 0 && last < pages) { goto(last, false); toastMsg('Lanjut dari halaman ' + (last + 1)); }
      else { goto(frac, false); }
    }, 250);
  }

  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { setTimeout(init, 30); }); }
  else { window.addEventListener('load', function () { setTimeout(init, 60); }); }
})();
