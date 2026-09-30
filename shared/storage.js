/*
 * SimpleTools – gemeinsame Speicher-Bibliothek
 *
 * Speichert und lädt Tool-Daten als JSON-Datei auf dem lokalen Rechner.
 * Nutzt die File System Access API (Chrome / Edge). In anderen Browsern
 * fällt sie auf Download / Datei-Auswahl zurück.
 *
 * Einbindung (klassisches Script, funktioniert auch per file://):
 *   <script src="../shared/storage.js"></script>
 *
 * Verwendung:
 *   const store = SimpleStorage.create({
 *     name: 'mein-tool',            // eindeutiger Name, wird auch Dateiname
 *     defaults: () => ({ items: [] }),
 *     onChange: (data) => render(data),   // nach Laden/Öffnen
 *     statusEl: document.getElementById('status'),  // optional
 *   });
 *   store.data.items.push(...);  store.changed();  // markiert + autosave
 *   store.open(); store.save(); store.saveAs(); store.new();
 */
(function () {
  'use strict';

  const SUPPORTED = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
  const FILE_TYPES = [{ description: 'JSON-Datei', accept: { 'application/json': ['.json'] } }];

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

    const store = {
      data: defaults(),
      supported: SUPPORTED,
      get fileName() { return handle ? handle.name : null; },
      get dirty() { return dirty; },
    };

    function status(msg, kind) {
      if (opts.statusEl) {
        opts.statusEl.textContent = msg;
        opts.statusEl.dataset.kind = kind || 'info';
      }
    }
    function describe() {
      if (handle) return (dirty ? '● Ungespeichert – ' : '✔ Gespeichert – ') + handle.name;
      return SUPPORTED ? 'Keine Datei verbunden – „Öffnen“ oder „Speichern unter“ wählen'
                       : 'Hinweis: Bitte Chrome oder Edge benutzen (Speichern per Download)';
    }
    function refresh() { status(describe(), dirty ? 'warn' : 'ok'); }

    function wrap(data) {
      return { app: name, version: 1, savedAt: new Date().toISOString(), data };
    }
    function unwrap(obj) {
      // akzeptiert sowohl das Wrapper-Format als auch rohe Daten
      return obj && obj.app === name && 'data' in obj ? obj.data : obj;
    }
    function apply(data) {
      store.data = Object.assign(defaults(), data);
      dirty = false;
      if (opts.onChange) opts.onChange(store.data);
      refresh();
    }

    async function writeTo(h) {
      const w = await h.createWritable();
      await w.write(JSON.stringify(wrap(store.data), null, 2));
      await w.close();
    }
    async function ensurePermission(h, write) {
      const mode = { mode: write ? 'readwrite' : 'read' };
      if ((await h.queryPermission(mode)) === 'granted') return true;
      return (await h.requestPermission(mode)) === 'granted';
    }

    // Muss nach einer Änderung aufgerufen werden. Speichert automatisch, wenn eine Datei verbunden ist.
    store.changed = function () {
      dirty = true;
      refresh();
      if (!handle) return;
      clearTimeout(timer);
      timer = setTimeout(() => store.save().catch(() => {}), 600);
    };

    store.open = async function () {
      try {
        if (!SUPPORTED) return openFallback();
        const [h] = await window.showOpenFilePicker({ types: FILE_TYPES, id: name });
        const obj = JSON.parse(await (await h.getFile()).text());
        handle = h;
        await idbSet(name, h);
        apply(unwrap(obj));
      } catch (e) {
        if (e.name !== 'AbortError') status('Fehler beim Öffnen: ' + e.message, 'error');
      }
    };

    store.save = async function () {
      try {
        if (!SUPPORTED) return downloadFallback();
        if (!handle) return store.saveAs();
        if (!(await ensurePermission(handle, true))) throw new Error('Keine Schreibberechtigung');
        await writeTo(handle);
        dirty = false;
        refresh();
      } catch (e) {
        if (e.name !== 'AbortError') status('Fehler beim Speichern: ' + e.message, 'error');
      }
    };

    store.saveAs = async function () {
      try {
        if (!SUPPORTED) return downloadFallback();
        handle = await window.showSaveFilePicker({ suggestedName: name + '.json', types: FILE_TYPES, id: name });
        await idbSet(name, handle);
        await writeTo(handle);
        dirty = false;
        refresh();
      } catch (e) {
        if (e.name !== 'AbortError') status('Fehler beim Speichern: ' + e.message, 'error');
      }
    };

    store.new = async function () {
      if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
      handle = null;
      await idbSet(name, undefined);
      apply(defaults());
    };

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
        catch (e) { status('Fehler beim Öffnen: ' + e.message, 'error'); }
      };
      inp.click();
    }

    // Beim Start: zuletzt benutzte Datei wieder verbinden (falls erlaubt)
    store.restore = async function () {
      refresh();
      if (!SUPPORTED) return;
      const h = await idbGet(name);
      if (!h) return;
      try {
        if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
          handle = h;
          apply(unwrap(JSON.parse(await (await h.getFile()).text())));
        } else {
          status('Letzte Datei „' + h.name + '“ – zum Fortsetzen auf „Zuletzt geöffnete Datei“ klicken', 'info');
          store.resume = async function () {
            if (await ensurePermission(h, true)) {
              handle = h;
              apply(unwrap(JSON.parse(await (await h.getFile()).text())));
            }
          };
        }
      } catch { /* Datei evtl. verschoben – ignorieren */ }
    };

    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    return store;
  }

  window.SimpleStorage = { create, supported: SUPPORTED };
})();
