/*
 * SimpleTools – Sprachumschaltung (Deutsch ist die Quellsprache)
 *
 * Die Tools sind auf Deutsch geschrieben. Für andere Sprachen wird die Oberfläche im Browser
 * übersetzt (Textknoten und Attribute wie placeholder/title/aria-label sowie alert/confirm/prompt).
 * Gespeicherte Daten werden NIE übersetzt – nur die Anzeige.
 *
 * Wörterbücher: shared/lang/<code>.js rufen SimpleI18n.add(code, { dict, frag, pages }) auf.
 *   dict:  { "Deutscher Text": "Translation", "Kündigen in {#} Tg.": "Cancel in {#} d." }
 *          {#} = Zahl/Datum/Uhrzeit im Text (der Reihe nach, oder {#1},{#2} für andere Reihenfolge),
 *          „{q}“ = in Anführungszeichen stehender Text (z. B. Namen, bleiben unübersetzt).
 *   frag:  { "Kündigen in ": "Cancel in " }  Textbausteine (mit Leerzeichen), die in zusammengesetzten Texten ersetzt werden.
 *   pages: { "kanban": { dict: {...} } }       Seiten-spezifische Übersetzungen (haben Vorrang).
 * Debug: SimpleI18n.misses (nicht übersetzte Texte der aktuellen Sprache).
 */
(function () {
  'use strict';
  var LANGS = [['de', 'Deutsch', 'de-DE'], ['en', 'English', 'en-GB'], ['es', 'Español', 'es-ES'], ['fr', 'Français', 'fr-FR']];
  var KEY = 'simpletools.lang';
  var cur = 'de', stores = {}, listeners = [];
  var misses = new Set();
  var script = document.currentScript, base = script && script.src ? script.src.replace(/[^\/]*$/, '') : '';
  var page = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '') || 'index';

  try { var s = localStorage.getItem(KEY); if (s && LANGS.some(function (l) { return l[0] === s; })) cur = s; } catch (e) {}
  function locale() { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === cur) return LANGS[i][2]; return 'de-DE'; }

  /* ---------- Zahlen- und Datumsformate folgen der Sprache ---------- */
  function fixLoc(l) { return (l === 'de-DE' || l === 'de') ? locale() : l; }
  [[Date.prototype, 'toLocaleDateString'], [Date.prototype, 'toLocaleTimeString'], [Date.prototype, 'toLocaleString'], [Number.prototype, 'toLocaleString']].forEach(function (p) {
    var orig = p[0][p[1]];
    p[0][p[1]] = function (loc) { var a = Array.prototype.slice.call(arguments); a[0] = fixLoc(loc); return orig.apply(this, a); };
  });

  /* ---------- Wörterbuch ---------- */
  var D = {}, PD = {}, FR = [], FRRE = null;
  function rebuild() {
    D = {}; PD = {}; FR = [];
    var st = stores[cur]; if (!st) return;
    D = st.dict || {};
    PD = (st.pages && st.pages[page] && st.pages[page].dict) || {};
    var f = Object.assign({}, st.frag || {}, (st.pages && st.pages[page] && st.pages[page].frag) || {});
    FR = Object.keys(f).sort(function (a, b) { return b.length - a.length; }).map(function (k) { return [k, f[k]]; });
    FRRE = FR.length ? new RegExp(FR.map(function (x) { return x[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|'), 'g') : null;
  }
  function add(code, data) {
    var st = stores[code] || (stores[code] = { dict: {}, frag: {}, pages: {} });
    Object.assign(st.dict, data.dict || {}); Object.assign(st.frag, data.frag || {});
    for (var p in (data.pages || {})) { var d = st.pages[p] || (st.pages[p] = { dict: {}, frag: {} }); Object.assign(d.dict, data.pages[p].dict || {}); Object.assign(d.frag, data.pages[p].frag || {}); }
    if (code === cur) { rebuild(); if (ready) applyAll(); }
  }

  var ABS = /(„[^“”"]*[“”"])|(\d+(?:[.,:]\d+)*)/g;
  function abstractText(s) {
    var nums = [], qs = [];
    var key = s.replace(ABS, function (m, q, n) {
      if (q) { qs.push(q.slice(1, -1)); return q.charAt(0) + '{q}' + q.charAt(q.length - 1); }
      nums.push(n); return '{#}';
    });
    return { key: key, nums: nums, qs: qs };
  }
  function fill(tpl, nums, qs) {
    var ni = 0, qi = 0;
    return tpl.replace(/\{(#|q)(\d*)\}/g, function (m, k, i) {
      var arr = k === '#' ? nums : qs;
      if (i) return arr[+i - 1] != null ? arr[+i - 1] : m;
      var v = arr[k === '#' ? ni++ : qi++]; return v != null ? v : m;
    });
  }
  function lookup(core) {
    var r = PD[core]; if (r == null) r = D[core];
    if (r != null) return r;
    var a = abstractText(core);
    if (a.key !== core) { r = PD[a.key]; if (r == null) r = D[a.key]; if (r != null) return fill(r, a.nums, a.qs); }
    return null;
  }
  function piece(core) {
    var r = lookup(core); if (r != null) return r;
    if (FRRE) { var out = core.replace(FRRE, function (m) { for (var i = 0; i < FR.length; i++) if (FR[i][0] === m) return FR[i][1]; return m; }); if (out !== core) return out; }
    return null;
  }
  // Gesamttext → Übersetzung (Leerraum außen bleibt erhalten)
  function translate(s) {
    if (cur === 'de' || !s) return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), lead = m[1], core = m[2], trail = m[3];
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return s;
    var r = piece(core);
    if (r == null && core.indexOf('\n') >= 0) {
      var changed = false, lines = core.split('\n').map(function (l) { var t = translate(l); if (t !== l) changed = true; return t; });
      if (changed) r = lines.join('\n');
    }
    if (r == null) {
      // Zerlegen an „A: B“, „A · B“, „A – B“, „A | B“
      var parts = core.split(/(?<=: )|(?<= · )|(?<= – )|(?<= \| )/), any = false;
      if (parts.length > 1) {
        var outp = parts.map(function (p) {
          var mm = /^([\s\S]*?)(:|·|–|\|)?(\s*)$/.exec(p), body = mm[1], sep = mm[2] || '', sp = mm[3];
          if (!body.trim() || !/[A-Za-zÀ-ÿ]/.test(body)) return p;
          var t = piece(body.trim()); if (t == null) return p;
          any = true; return body.match(/^\s*/)[0] + t + sep + sp;
        });
        if (any) r = outp.join('');
      }
    }
    if (r == null) { if (/[A-Za-zÀ-ÿ]{2}/.test(core)) misses.add(core); return s; }
    return lead + r + trail;
  }

  /* ---------- DOM ---------- */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  function skipEl(el) { return SKIP[el.nodeName] || (el.hasAttribute && (el.hasAttribute('data-notranslate') || el.getAttribute('translate') === 'no')) || el.isContentEditable; }
  function doText(n) {
    var v = n.nodeValue, rec = n.__st, orig = rec && rec.out === v ? rec.orig : v;
    var out = cur === 'de' ? orig : translate(orig);
    n.__st = { orig: orig, out: out };
    if (out !== v) n.nodeValue = out;
  }
  function doAttr(el, a) {
    var v = el.getAttribute(a); if (v == null) return;
    var rec = el.__sa && el.__sa[a], orig = rec && rec.out === v ? rec.orig : v;
    var out = cur === 'de' ? orig : translate(orig);
    (el.__sa || (el.__sa = {}))[a] = { orig: orig, out: out };
    if (out !== v) el.setAttribute(a, out);
  }
  function walk(node) {
    if (node.nodeType === 3) { if (!(node.parentNode && skipEl(node.parentNode))) doText(node); return; }
    if (node.nodeType !== 1) return;
    var skipped = skipEl(node);
    if (!skipped || node.nodeName === 'TEXTAREA') for (var i = 0; i < ATTRS.length; i++) if (node.hasAttribute(ATTRS[i])) doAttr(node, ATTRS[i]);   // Platzhalter/aria-label auch bei Textfeldern
    if (skipped) return;
    if (node.nodeName === 'INPUT' && /^(button|submit|reset)$/.test(node.type)) doAttr(node, 'value');
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  var ready = false, obs = null;
  function applyAll() { if (document.documentElement) walk(document.documentElement); document.documentElement.lang = cur; }
  function startObserver() {
    obs = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') { if (!(m.target.parentNode && skipEl(m.target.parentNode))) doText(m.target); }
        else if (m.type === 'attributes') { if (m.attributeName === 'value') { if (!/^(button|submit|reset)$/.test(m.target.type)) continue; } doAttr(m.target, m.attributeName); }
      }
    });
    obs.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) });
  }

  /* ---------- Dialoge ---------- */
  ['alert', 'confirm', 'prompt'].forEach(function (n) {
    var orig = window[n];
    window[n] = function () { var a = Array.prototype.slice.call(arguments); if (typeof a[0] === 'string') a[0] = translate(a[0]); return orig.apply(window, a); };
  });

  /* ---------- Sprache wechseln ---------- */
  function load(code, cb) {
    if (code === 'de' || stores[code]) return cb();
    var s = document.createElement('script'); s.src = base + 'lang/' + code + '.js';
    s.onload = cb; s.onerror = cb; (document.head || document.documentElement).appendChild(s);
  }
  function setLang(code) {
    if (!LANGS.some(function (l) { return l[0] === code; })) return;
    try { localStorage.setItem(KEY, code); } catch (e) {}
    load(code, function () {
      cur = code; misses.clear(); rebuild(); applyAll();
      listeners.forEach(function (f) { try { f(cur); } catch (e) {} });
      window.dispatchEvent(new Event('simpletools-lang'));
    });
  }

  window.SimpleI18n = {
    languages: LANGS.map(function (l) { return { code: l[0], name: l[1], locale: l[2] }; }),
    get lang() { return cur; }, get locale() { return locale(); }, get misses() { return misses; }, get page() { return page; },
    add: add, setLang: setLang, translate: translate, apply: applyAll, onChange: function (f) { listeners.push(f); }
  };

  // Wörterbuch der gespeicherten Sprache synchron laden (vor dem Rendern der Seite)
  if (cur !== 'de' && base) document.write('<script src="' + base + 'lang/' + cur + '.js"><\/script>');
  // Entwicklung/Tests: window.__STDICT = { en: { dict, frag, pages } } (z. B. per Playwright addInitScript)
  if (window.__STDICT) for (var c in window.__STDICT) add(c, window.__STDICT[c]);
  rebuild();
  startObserver();
  function start() { ready = true; rebuild(); applyAll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('load', function () { applyAll(); });
})();
