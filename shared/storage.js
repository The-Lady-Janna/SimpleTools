/*
 * SimpleTools – gemeinsame Speicher-Bibliothek
 *
 * Speichert und lädt Tool-Daten als JSON-Datei auf dem lokalen Rechner.
 * Nutzt die File System Access API (Chrome / Edge). In anderen Browsern
 * fällt sie auf Download / Datei-Auswahl zurück (ohne Autosave).
 *
 * Änderungen werden automatisch in die verbundene Datei geschrieben.
 * Die Seite prüft regelmäßig, ob die Verbindung zur Datei noch besteht
 * (Datei vorhanden, Zugriff erlaubt, nicht außerhalb geändert).
 *
 * Einbindung (klassisches Script, funktioniert auch per file://):
 *   <script src="../shared/storage.js"></script>
 *
 * Verwendung:
 *   const store = SimpleStorage.create({
 *     name: 'mein-tool',            // eindeutiger Name, wird auch Dateiname
 *     defaults: () => ({ items: [] }),
 *     onChange: (data) => render(data),   // nach Laden/Öffnen
 *     statusEl: document.getElementById('status'),  // zeigt Status + Aktionen
 *   });
 *   store.data.items.push(...);  store.changed();  // markiert + autosave
 *   store.open(); store.save(); store.saveAs(); store.new(); store.restore();
 */
(function () {
  'use strict';

  const SUPPORTED = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  const FILE_TYPES = [{ description: 'JSON-Datei', accept: { 'application/json': ['.json'] } }];
  const CHECK_MS = 3000;
  const SAVE_DELAY_MS = 600;

  // --- Dateihandle in IndexedDB merken, damit die Datei beim nächsten Start wieder da ist ---
  function idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('simpletools', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const q = db.transaction('handles').objectStore('handles').get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => res(undefined);
      });
    } catch { return undefined; }
  }
  async function idbSet(key, val) {
    try {
      const db = await idb();
      await new Promise((res) => {
        const tx = db.transaction('handles', 'readwrite');
        val === undefined ? tx.objectStore('handles').delete(key) : tx.objectStore('handles').put(val, key);
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch { /* ignorieren */ }
  }

  function create(opts) {
    const name = opts.name;
    const defaults = opts.defaults || (() => ({}));
    let handle = null;
    let dirty = false;
    let timer = null;
    let lastMod = null;     // lastModified der Datei nach unserem letzten Lesen/Schreiben
    let needLoad = false;   // Handle wiederhergestellt, Inhalt aber noch nicht geladen
    let busy = false;
    // none | ok | permission | lost | conflict | error
    let state = 'none';
    let errorMsg = '';

    const store = {
      data: defaults(),
      supported: SUPPORTED,
      get fileName() { return handle ? handle.name : null; },
      get dirty() { return dirty; },
      get state() { return state; },
    };

    /* ---------- Statusanzeige ---------- */
    function action(label, fn, primary) {
      const b = document.createElement('button');
      b.textContent = label; b.type = 'button';
      if (primary) b.className = 'primary';
      b.onclick = fn;
      return b;
    }
    function refresh() {
      const el = opts.statusEl;
      if (!el) return;
      let text, kind = 'info', actions = [];
      const file = handle ? handle.name : '';
      if (!SUPPORTED) {
        text = 'Bitte Chrome oder Edge benutzen – hier gibt es kein Autosave (Speichern per Download).';
        kind = 'warn'; actions = [action('Herunterladen', store.save)];
      } else if (state === 'none') {
        text = dirty ? '⚠ Keine Datei verbunden – Änderungen werden NICHT gespeichert.' : 'Keine Datei verbunden. Datei öffnen oder neue anlegen, dann wird automatisch gespeichert.';
        kind = dirty ? 'warn' : 'info';
        actions = [action('Öffnen…', store.open), action('Speichern unter…', store.saveAs, dirty)];
      } else if (state === 'ok') {
        text = dirty ? `● Speichere automatisch… – ${file}` : `✔ Verbunden, alles gespeichert – ${file}`;
        kind = dirty ? 'warn' : 'ok';
      } else if (state === 'permission') {
        text = `⚠ Zugriff auf „${file}“ muss neu erlaubt werden.` + (dirty ? ' Änderungen sind noch nicht gespeichert.' : '');
        kind = 'warn'; actions = [action('Verbindung wiederherstellen', store.reconnect, true)];
      } else if (state === 'lost') {
        text = `⚠ Verbindung zu „${file}“ verloren (Datei verschoben oder gelöscht?). Änderungen sind NICHT gespeichert.`;
        kind = 'error'; actions = [action('Erneut versuchen', () => store.check()), action('Datei öffnen…', store.open), action('Speichern unter…', store.saveAs, true)];
      } else if (state === 'conflict') {
        text = `⚠ „${file}“ wurde außerhalb dieser Seite geändert. Autosave ist pausiert.`;
        kind = 'error'; actions = [action('Datei neu laden', () => store.reload()), action('Mit meinen Daten überschreiben', () => store.save(true), true)];
      } else {
        text = '⚠ Fehler: ' + errorMsg; kind = 'error';
        actions = [action('Erneut versuchen', () => store.check(), true)];
      }
      el.textContent = '';
      el.dataset.kind = kind;
      const span = document.createElement('span');
      span.textContent = text; span.style.marginRight = '8px';
      el.append(span, ...actions);
    }
    function setState(s, msg) { state = s; errorMsg = msg || ''; refresh(); }

    /* ---------- Hilfsfunktionen ---------- */
    const wrap = (data) => ({ app: name, version: 1, savedAt: new Date().toISOString(), data });
    // akzeptiert sowohl das Wrapper-Format als auch rohe Daten
    const unwrap = (obj) => (obj && obj.app === name && 'data' in obj ? obj.data : obj);

    function apply(data) {
      store.data = Object.assign(defaults(), data);
      dirty = false;
      if (opts.onChange) opts.onChange(store.data);
      refresh();
    }
    async function readFrom(h) {
      const file = await h.getFile();
      const obj = JSON.parse(await file.text());
      lastMod = file.lastModified;
      return unwrap(obj);
    }
    async function writeTo(h) {
      const w = await h.createWritable();
      await w.write(JSON.stringify(wrap(store.data), null, 2));
      await w.close();
      lastMod = (await h.getFile()).lastModified;
    }
    const isGone = (e) => e && (e.name === 'NotFoundError' || e.name === 'NotReadableError' || e.name === 'InvalidStateError');

    /* ---------- Verbindungsprüfung ---------- */
    // Prüft Zugriff, Existenz und externe Änderungen. Speichert bei Bedarf.
    store.check = async function () {
      if (!handle || busy) return;
      busy = true;
      try {
        if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return setState('permission');
        const f = await handle.getFile();
        if (needLoad) return;
        if (lastMod !== null && f.lastModified !== lastMod) return setState('conflict');
        if (state !== 'ok') setState('ok'); else refresh();
      } catch (e) {
        return setState(isGone(e) ? 'lost' : 'error', e.message);
      } finally { busy = false; }
      if (dirty) store.save().catch(() => {});
    };
    setInterval(() => { if (!document.hidden) store.check(); }, CHECK_MS);
    window.addEventListener('focus', () => store.check());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) store.check(); });

    // Muss nach einer Änderung aufgerufen werden.
    store.changed = function () {
      dirty = true;
      refresh();
      if (!handle || state !== 'ok') return;
      clearTimeout(timer);
      timer = setTimeout(() => store.save().catch(() => {}), SAVE_DELAY_MS);
    };

    /* ---------- Öffnen / Speichern ---------- */
    store.open = async function () {
      try {
        if (!SUPPORTED) return openFallback();
        if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
        const [h] = await window.showOpenFilePicker({ types: FILE_TYPES, id: name });
        const data = await readFrom(h);
        handle = h; needLoad = false;
        await idbSet(name, h);
        state = 'ok';
        apply(data);
      } catch (e) {
        if (e.name !== 'AbortError') setState('error', 'Öffnen fehlgeschlagen: ' + e.message);
      }
    };

    // force = true überschreibt auch eine außerhalb geänderte Datei
    store.save = async function (force) {
      clearTimeout(timer);
      try {
        if (!SUPPORTED) return downloadFallback();
        if (!handle) return store.saveAs();
        if (force !== true && state !== 'ok') return store.check();
        if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return setState('permission');
        if (force !== true && lastMod !== null && (await handle.getFile()).lastModified !== lastMod) return setState('conflict');
        await writeTo(handle);
        dirty = false;
        setState('ok');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setState(isGone(e) ? 'lost' : 'error', 'Speichern fehlgeschlagen: ' + e.message);
      }
    };

    store.saveAs = async function () {
      try {
        if (!SUPPORTED) return downloadFallback();
        const h = await window.showSaveFilePicker({ suggestedName: name + '.json', types: FILE_TYPES, id: name });
        handle = h; needLoad = false;
        await idbSet(name, h);
        await writeTo(h);
        dirty = false;
        setState('ok');
      } catch (e) {
        if (e.name !== 'AbortError') setState('error', 'Speichern fehlgeschlagen: ' + e.message);
      }
    };

    store.new = async function () {
      if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
      handle = null; lastMod = null; needLoad = false;
      await idbSet(name, undefined);
      state = 'none';
      apply(defaults());
    };

    // Datei neu einlesen und eigene Änderungen verwerfen
    store.reload = async function () {
      if (!handle) return;
      try {
        const data = await readFrom(handle);
        state = 'ok'; needLoad = false;
        apply(data);
      } catch (e) { setState(isGone(e) ? 'lost' : 'error', e.message); }
    };

    // Nach Klick des Nutzers: Zugriff erneut erlauben (nötig nach Browser-Neustart)
    store.reconnect = async function () {
      if (!handle) return;
      try {
        if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return setState('permission');
        if (needLoad) { await store.reload(); return; }
        state = 'ok';
        await store.check();
      } catch (e) { setState(isGone(e) ? 'lost' : 'error', e.message); }
    };

    /* ---------- Fallback für Browser ohne File System Access API ---------- */
    function downloadFallback() {
      const blob = new Blob([JSON.stringify(wrap(store.data), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      dirty = false;
      refresh();
    }
    function openFallback() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => {
        try { apply(unwrap(JSON.parse(await inp.files[0].text()))); }
        catch (e) { setState('error', 'Öffnen fehlgeschlagen: ' + e.message); }
      };
      inp.click();
    }

    // Beim Start: zuletzt benutzte Datei wieder verbinden
    store.restore = async function () {
      refresh();
      if (!SUPPORTED) return;
      const h = await idbGet(name);
      if (!h) return;
      handle = h;
      try {
        if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
          const data = await readFrom(h);
          state = 'ok';
          apply(data);
        } else {
          needLoad = true;
          setState('permission');
        }
      } catch (e) {
        needLoad = false;
        setState(isGone(e) ? 'lost' : 'error', e.message);
      }
    };

    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    return store;
  }

  window.SimpleStorage = { create, supported: SUPPORTED };
})();
