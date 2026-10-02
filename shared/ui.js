/* Gemeinsame Oberfläche: Theme, Hintergrundbild, einklappbare Dateileiste.
 * Einbinden mit <script src="../shared/ui.js"></script> am Ende des <body>.
 * Einstellungen liegen im localStorage des Browsers (gelten für alle Tools). */
(function () {
  'use strict';
  var KEY = 'simpletools.ui';
  var THEMES = [
    ['auto', 'System', 'linear-gradient(135deg,#f6f7f9 50%,#12151c 50%)'],
    ['light', 'Hell', '#f6f7f9'],
    ['dark', 'Dunkel', '#12151c'],
    ['midnight', 'Mitternacht', '#0b1020'],
    ['pastel-rose', 'Pastell Rosa', '#fdf0f5'],
    ['pastel-mint', 'Pastell Mint', '#ecf9f2'],
    ['pastel-lavender', 'Pastell Lavendel', '#f2effc'],
    ['pastel-sky', 'Pastell Himmel', '#eaf4fd'],
    ['candy', 'Candy 🍬', 'linear-gradient(135deg,#ff3d9a,#19c3e6 60%,#ffc933)'],
    ['sunset', 'Sonnenuntergang', 'linear-gradient(135deg,#ffb347,#e4572e 55%,#8e5bd6)'],
    ['ocean', 'Ozean', 'linear-gradient(135deg,#17b3a3,#0a85ad 55%,#6366f1)'],
    ['forest', 'Wald', 'linear-gradient(135deg,#8bc34a,#2e8b57 60%,#3a9bb0)'],
    ['rainbow', 'Regenbogen 🌈', 'linear-gradient(90deg,#ff4d6d,#ffa62b,#2ed47a,#3b9cff,#9b5cff)'],
    ['neon', 'Neon', 'linear-gradient(135deg,#0d0221 30%,#ff2bd6 60%,#2bf0ff)'],
    ['arcade', 'Arcade 🎮', 'linear-gradient(135deg,#14123a 40%,#ffd23f)']
  ];
  var FUN = [['color', '🎨 Bunte Karten'], ['round', '🫧 Runde Formen'], ['anim', '✨ Animationen'], ['confetti', '🎉 Konfetti']];
  var root = document.documentElement;
  var cfg = { theme: 'auto', bg: '', collapsed: true, width: 'full', fun: [] };

  function load() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); if (o && typeof o === 'object') for (var k in cfg) if (k in o) cfg[k] = o[k]; } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; }
  }

  function applyTheme() {
    if (cfg.theme === 'auto' || !THEMES.some(function (t) { return t[0] === cfg.theme; })) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', cfg.theme);
    window.dispatchEvent(new Event('simpletools-theme')); // z. B. Canvas neu zeichnen
  }
  function applyBg() {
    if (cfg.bg) {
      root.style.setProperty('--bg-image', 'url("' + cfg.bg + '")');
      root.setAttribute('data-bgimg', '');
    } else {
      root.style.removeProperty('--bg-image');
      root.removeAttribute('data-bgimg');
    }
  }
  function applyWidth() {
    if (cfg.width === 'narrow') root.setAttribute('data-width', 'narrow'); else root.removeAttribute('data-width');
    window.dispatchEvent(new Event('resize'));
  }
  function applyFun() {
    var f = Array.isArray(cfg.fun) ? cfg.fun.filter(function (x) { return FUN.some(function (t) { return t[0] === x; }); }) : [];
    if (f.length) root.setAttribute('data-fun', f.join(' ')); else root.removeAttribute('data-fun');
  }
  function hasFun(k) { return Array.isArray(cfg.fun) && cfg.fun.indexOf(k) >= 0; }
  load(); applyTheme(); applyBg(); applyWidth(); applyFun();

  // Konfetti beim Abhaken (nur mit Option „Konfetti“, nicht bei reduzierter Bewegung)
  function confetti(el) {
    if (!hasFun('confetti') || !el || !el.getBoundingClientRect) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var r = el.getBoundingClientRect(), cs = getComputedStyle(root), cols = ['--c1', '--c2', '--c3', '--c4', '--c5'].map(function (v) { return cs.getPropertyValue(v).trim() || '#f59e0b'; });
    for (var i = 0; i < 22; i++) {
      var p = document.createElement('span'); p.className = 'st-confetti';
      p.style.left = (r.left + r.width / 2) + 'px'; p.style.top = (r.top + r.height / 2) + 'px'; p.style.background = cols[i % cols.length];
      document.body.append(p);
      var a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90, rot = (Math.random() - 0.5) * 900;
      if (p.animate) {
        p.animate([{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d + 70) + 'px) rotate(' + rot + 'deg)', opacity: 0 }],
          { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = function (ev) { ev.target.effect.target.remove(); };
      }
      setTimeout(function (q) { return function () { q.remove(); }; }(p), 1500);
    }
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.type === 'checkbox' && t.checked && !t.closest('form, .toolbar, summary, label')) confetti(t);
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button');
    if (!b) return;
    if (/^\s*✓/.test(b.textContent) && b.textContent.trim().length > 1 || ((b.classList.contains('cell') || b.classList.contains('big')) && !b.classList.contains('done'))) confetti(b);
  }, true);

  // Bild verkleinern (max. 1600 px, JPEG), damit es in den localStorage passt.
  function shrink(file, cb) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var s = Math.min(1, 1600 / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    for (var k in (props || {})) e[k] = props[k];
    (kids || []).forEach(function (c) { e.append(c); });
    return e;
  }

  function buildMenu() {
    var fab = el('button', { type: 'button', className: 'ui-fab', title: 'Darstellung', textContent: '🎨' });
    fab.setAttribute('aria-label', 'Darstellung'); fab.setAttribute('aria-expanded', 'false');
    var panel = el('div', { className: 'ui-panel', hidden: true });
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Darstellung');

    var grid = el('div', { className: 'ui-themes' });
    function markThemes() {
      Array.prototype.forEach.call(grid.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === cfg.theme)); });
    }
    THEMES.forEach(function (t) {
      var sw = el('span', { className: 'ui-sw' }); sw.style.background = t[2];
      var b = el('button', { type: 'button' }, [sw, t[1]]);
      b.dataset.theme = t[0];
      b.onclick = function () { cfg.theme = t[0]; save(); applyTheme(); markThemes(); };
      grid.append(b);
    });
    markThemes();

    var file = el('input', { type: 'file', accept: 'image/*', hidden: true });
    var hint = el('p', { className: 'ui-hint' });
    function setHint() { hint.textContent = cfg.bg ? 'Bild aktiv (10 % Deckkraft).' : 'Wird mit 10 % Deckkraft im Hintergrund angezeigt (z. B. Logo oder Foto). Bleibt nur in diesem Browser gespeichert.'; }
    setHint();
    var pick = el('button', { type: 'button', textContent: 'Bild wählen…' });
    var clear = el('button', { type: 'button', textContent: 'Entfernen' });
    pick.onclick = function () { file.click(); };
    clear.onclick = function () { cfg.bg = ''; save(); applyBg(); setHint(); };
    file.onchange = function () {
      var f = file.files && file.files[0]; file.value = '';
      if (!f) return;
      shrink(f, function (data) {
        if (!data) { hint.textContent = 'Das Bild konnte nicht gelesen werden.'; return; }
        var old = cfg.bg; cfg.bg = data;
        if (!save()) { cfg.bg = old; hint.textContent = 'Zu groß für den Browser-Speicher – bitte ein kleineres Bild wählen.'; return; }
        applyBg(); setHint();
      });
    };

    var wBtns = [['full', 'Volle Breite'], ['narrow', 'Begrenzt']].map(function (w) {
      var b = el('button', { type: 'button', textContent: w[1] }); b.dataset.w = w[0];
      b.onclick = function () { cfg.width = w[0]; save(); applyWidth(); markW(); };
      return b;
    });
    function markW() { wBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.w === cfg.width)); }); }
    markW();

    var fBtns = FUN.map(function (f) {
      var b = el('button', { type: 'button', textContent: f[1] }); b.dataset.f = f[0];
      b.onclick = function () { var i = cfg.fun.indexOf(f[0]); if (i >= 0) cfg.fun.splice(i, 1); else cfg.fun.push(f[0]); save(); applyFun(); markF(); if (f[0] === 'confetti' && hasFun('confetti')) confetti(b); };
      return b;
    });
    function markF() { fBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(hasFun(b.dataset.f))); }); }
    markF();
    var party = el('button', { type: 'button', className: 'ui-party', textContent: '🎉 Spaß-Modus an' });
    party.onclick = function () { cfg.theme = 'candy'; cfg.fun = FUN.map(function (f) { return f[0]; }); save(); applyTheme(); applyFun(); markThemes(); markF(); confetti(party); };

    panel.append(el('h2', { textContent: 'Design' }), grid,
      el('h2', { textContent: 'Spaß' }), el('div', { className: 'ui-row ui-fun' }, fBtns), party,
      el('h2', { textContent: 'Seitenbreite' }), el('div', { className: 'ui-row ui-width' }, wBtns),
      el('h2', { textContent: 'Hintergrundbild' }), el('div', { className: 'ui-row' }, [pick, clear, file]), hint);

    function toggle(open) {
      panel.hidden = !open; fab.setAttribute('aria-expanded', String(open));
    }
    fab.onclick = function () { toggle(panel.hidden); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { toggle(false); fab.focus(); } });
    document.addEventListener('pointerdown', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== fab) toggle(false);
    });
    document.body.append(panel, fab);
  }

  // Dateileiste (Neu/Öffnen/Speichern…) einklappbar machen: eingeklappt bleibt nur der Datei-Status sichtbar.
  function buildFilebar() {
    var status = document.getElementById('status'), saveBtn = document.getElementById('save');
    var bar = saveBtn && saveBtn.closest('.toolbar');
    if (!status || !bar || status.closest('.filebar')) return;
    var wrap = el('div', { className: 'filebar' });
    var head = el('div', { className: 'filebar-head' });
    var tg = el('button', { type: 'button', className: 'filebar-toggle' });
    bar.before(wrap);
    wrap.append(bar, head);
    head.append(status, tg);
    function sync() {
      if (cfg.collapsed) wrap.setAttribute('data-collapsed', ''); else wrap.removeAttribute('data-collapsed');
      tg.textContent = cfg.collapsed ? '▾ Datei' : '▴ Einklappen';
      tg.setAttribute('aria-expanded', String(!cfg.collapsed));
      tg.title = cfg.collapsed ? 'Neu, Öffnen, Speichern … einblenden' : 'Leiste einklappen';
    }
    tg.onclick = function () { cfg.collapsed = !cfg.collapsed; save(); sync(); };
    sync();
  }

  function init() { buildFilebar(); buildMenu(); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
