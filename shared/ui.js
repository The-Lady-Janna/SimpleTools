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
    ['pastel-sky', 'Pastell Himmel', '#eaf4fd']
  ];
  var root = document.documentElement;
  var cfg = { theme: 'auto', bg: '', collapsed: true };

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
  load(); applyTheme(); applyBg();

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

    panel.append(el('h2', { textContent: 'Design' }), grid,
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
