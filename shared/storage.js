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
 * Sicherheitsregeln (Datenverlust vermeiden):
 *  - Eine Datei, die nicht erfolgreich gelesen wurde (kaputtes JSON, leer, fremdes
 *    Format, Zugriff fehlt, Lesefehler beim Start), wird NIE automatisch überschrieben.
 *    Die Seite zeigt dann Standarddaten, der Zustand ist 'unloaded' bzw. 'permission'
 *    und es wird nichts gespeichert – außer der Nutzer wählt ausdrücklich
 *    „Mit Standarddaten überschreiben“ (mit Rückfrage) oder „Speichern unter…“.
 *  - Dateien anderer Tools (Wrapper mit anderem app-Namen) und Nicht-Objekte
 *    (Liste, Text, Zahl, null) werden abgelehnt; die bisherige Verbindung und die
 *    aktuellen Daten bleiben unverändert. Rohdaten ohne Wrapper (alte Dateien)
 *    werden akzeptiert, wenn sie ein JSON-Objekt sind.
 *  - reload()/reconnect()/open() verwerfen ungespeicherte Änderungen nie still,
 *    sondern fragen vorher nach.
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
  const PRESS_MAX_MS = 8000;   // Sicherung: Statuszeile nie länger als das „eingefroren“

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

  // --- Fehler, die den Inhalt der Datei betreffen (nicht den Zugriff) ---
  function loadError(msg) { const e = new Error(msg); e.loadError = true; return e; }
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const describe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'eine Liste' : typeof v === 'string' ? 'ein Text' : typeof v === 'number' ? 'eine Zahl' : typeof v === 'boolean' ? 'ein Wahrheitswert' : 'etwas anderes');

  function create(opts) {
    const name = opts.name;
    const defaults = opts.defaults || (() => ({}));
    let handle = null;
    let dirty = false;
    let timer = null;
    let lastMod = null;     // lastModified der Datei nach unserem letzten erfolgreichen Lesen/Schreiben
    // true, solange der Inhalt der verbundenen Datei noch nie erfolgreich gelesen wurde
    // (Zugriff fehlt, kaputte/fremde Datei, Lesefehler). Dann wird NIE automatisch geschrieben.
    let needLoad = false;
    let busy = false;
    // none | ok | permission | unloaded | lost | conflict | error
    let state = 'none';
    let errorMsg = '';
    let notice = '';        // Hinweis zu einer fehlgeschlagenen Aktion (Verbindung/Daten bleiben unverändert)
    let dismissed = '';     // vom Nutzer weggeklickter Hinweis (kommt nicht sofort wieder)

    const store = {
      data: defaults(),
      supported: SUPPORTED,
      get fileName() { return handle ? handle.name : null; },
      get dirty() { return dirty; },
      get state() { return state; },
    };

    /* ---------- Statusanzeige ---------- */
    // Die Buttons werden nur neu gebaut, wenn sich die Liste der Aktionen ändert (Zustandswechsel).
    // Sonst werden nur Text, data-kind und Beschriftungen aktualisiert. Würde ein change/blur-Ereignis
    // (store.changed()) die Buttons mitten im Klick ersetzen, ginge der erste Klick verloren.
    const ACTIONS = {
      download: () => store.save(),
      open: () => store.open(),
      saveAs: () => store.saveAs(),
      reconnect: () => store.reconnect(),
      retry: () => (needLoad ? store.reload() : store.check()),   // nie geladen → Datei wirklich neu lesen
      reload: () => store.reload(),
      overwrite: () => store.save(true),
      overwriteUnloaded: () => overwriteUnloaded(),
    };
    const act = (key, label, primary) => ({ key, label, primary: !!primary });

    function view() {
      const file = handle ? handle.name : '';
      let text, kind = 'info', acts = [];
      if (!SUPPORTED) {
        text = 'Bitte Chrome oder Edge benutzen – hier gibt es kein Autosave (Speichern per Download).';
        kind = 'warn'; acts = [act('download', 'Herunterladen')];
      } else if (state === 'none') {
        text = dirty ? '⚠ Keine Datei verbunden – Änderungen werden NICHT gespeichert.' : 'Keine Datei verbunden. Datei öffnen oder neue anlegen, dann wird automatisch gespeichert.';
        kind = dirty ? 'warn' : 'info';
        acts = [act('open', 'Öffnen…'), act('saveAs', 'Speichern unter…', dirty)];
      } else if (state === 'ok') {
        text = dirty ? `● Speichere automatisch… – ${file}` : `✔ Verbunden, alles gespeichert – ${file}`;
        kind = dirty ? 'warn' : 'ok';
      } else if (state === 'permission') {
        text = `⚠ Zugriff auf „${file}“ muss neu erlaubt werden.`
          + (needLoad ? ' Die Datei ist noch nicht geladen – angezeigt werden Standarddaten.' : '')
          + (dirty ? (needLoad ? ' Änderungen sind noch nicht gespeichert und gehen beim Laden der Datei verloren (vorher mit „Speichern unter…“ sichern).' : ' Änderungen sind noch nicht gespeichert.') : '');
        kind = 'warn'; acts = [act('reconnect', 'Verbindung wiederherstellen', true), act('saveAs', 'Speichern unter…')];
      } else if (state === 'unloaded') {
        text = `⚠ „${file}“ wurde nicht geladen: ${errorMsg} Angezeigt werden Standarddaten. Es wird NICHTS gespeichert – die Datei bleibt unverändert.`
          + (dirty ? ' Deine Änderungen sind NICHT gespeichert.' : '');
        kind = 'error';
        acts = [act('retry', 'Erneut versuchen', true), act('open', 'Datei öffnen…'), act('overwriteUnloaded', dirty ? 'Mit meinen Daten überschreiben' : 'Mit Standarddaten überschreiben')];
      } else if (state === 'lost') {
        text = `⚠ Verbindung zu „${file}“ verloren (Datei verschoben oder gelöscht?). Änderungen sind NICHT gespeichert.`;
        kind = 'error'; acts = [act('retry', 'Erneut versuchen'), act('open', 'Datei öffnen…'), act('saveAs', 'Speichern unter…', true)];
      } else if (state === 'conflict') {
        text = `⚠ „${file}“ wurde außerhalb dieser Seite geändert. Autosave ist pausiert.`;
        kind = 'error'; acts = [act('reload', 'Datei neu laden'), act('overwrite', 'Mit meinen Daten überschreiben', true)];
      } else {
        text = '⚠ Fehler: ' + errorMsg; kind = 'error';
        acts = [act('retry', 'Erneut versuchen', true)];
      }
      return { text, kind, acts };
    }

    let ui = null;   // zuletzt gebautes DOM der Statuszeile
    function buildUi(el, acts) {
      el.textContent = '';
      const note = document.createElement('div');
      note.hidden = true; note.setAttribute('role', 'alert');
      note.style.cssText = 'color:var(--err,#b91c1c);font-weight:600;margin-bottom:4px';
      const noteText = document.createElement('span');
      const ok = document.createElement('button');
      ok.type = 'button'; ok.textContent = 'OK'; ok.setAttribute('aria-label', 'Hinweis schließen'); ok.style.marginLeft = '8px';
      ok.onclick = () => { dismissed = notice; notice = ''; refresh(); };
      note.append(noteText, ok);
      const text = document.createElement('span');
      text.style.marginRight = '8px';
      const btns = acts.map((a) => {
        const b = document.createElement('button');
        b.type = 'button'; b.onclick = () => ACTIONS[a.key]();
        return b;
      });
      el.append(note, text, ...btns);
      ui = { el, note, noteText, text, btns, sig: acts.map((a) => a.key).join('|') };
    }

    // Solange eine Maustaste auf einem Status-Button gedrückt ist, wird die Anzeige nicht verändert
    // (sonst verschiebt sich der Button unter dem Zeiger und der Klick geht verloren).
    let pressing = false, pendingRefresh = false, pressTimer = null;
    function endPress() {
      if (!pressing) return;
      pressing = false; clearTimeout(pressTimer);
      setTimeout(() => { if (pendingRefresh && !pressing) { pendingRefresh = false; refresh(); } }, 30);
    }
    if (opts.statusEl) {
      opts.statusEl.addEventListener('pointerdown', (e) => {
        if (!(e.target instanceof Element) || !e.target.closest('button')) return;
        pressing = true; clearTimeout(pressTimer); pressTimer = setTimeout(endPress, PRESS_MAX_MS);
      }, true);
      window.addEventListener('pointerup', endPress, true);
      window.addEventListener('pointercancel', endPress, true);
    }

    function refresh() {
      const el = opts.statusEl;
      if (!el) return;
      if (pressing) { pendingRefresh = true; return; }
      const v = view();
      const sig = v.acts.map((a) => a.key).join('|');
      const intact = ui && ui.el === el && ui.sig === sig && ui.text.parentNode === el && ui.note.parentNode === el
        && ui.btns.every((b) => b.parentNode === el);
      if (!intact) buildUi(el, v.acts);
      if (ui.text.textContent !== v.text) ui.text.textContent = v.text;
      if (el.dataset.kind !== v.kind) el.dataset.kind = v.kind;
      v.acts.forEach((a, i) => {
        const b = ui.btns[i];
        if (b.textContent !== a.label) b.textContent = a.label;
        const cls = a.primary ? 'primary' : '';
        if (b.className !== cls) b.className = cls;
      });
      if (ui.noteText.textContent !== notice) ui.noteText.textContent = notice;
      ui.note.hidden = !notice;
    }
    function setState(s, msg) { state = s; errorMsg = msg || ''; refresh(); }

    // Hinweis auf eine fehlgeschlagene Aktion, ohne Verbindung oder Daten anzutasten.
    function notify(msg) {
      if (!opts.statusEl) { alert(msg); return; }
      if (msg === dismissed) return;
      notice = msg; refresh();
    }
    function clearNotice() { notice = ''; dismissed = ''; }

    /* ---------- Hilfsfunktionen ---------- */
    const wrap = (data) => ({ app: name, version: 1, savedAt: new Date().toISOString(), data });
    // akzeptiert das Wrapper-Format dieses Tools sowie rohe Daten (Objekt ohne app-Feld).
    // Wirft einen loadError bei fremden Dateien und Nicht-Objekten.
    function unwrap(obj) {
      if (!isPlainObject(obj)) throw loadError(`Die Datei hat kein passendes Format: Erwartet wird ein JSON-Objekt, gefunden wurde ${describe(obj)}.`);
      if (typeof obj.app === 'string' && obj.app !== name) throw loadError(`Diese Datei gehört zum Tool „${obj.app}“, nicht zu „${name}“.`);
      if (obj.app === name) {
        if (!isPlainObject(obj.data)) throw loadError('Die Datei enthält keine gültigen Daten (Feld „data“ fehlt oder ist kein Objekt).');
        return obj.data;
      }
      return obj;
    }
    function parseText(text) {
      if (!text.trim()) throw loadError('Die Datei ist leer.');
      let obj;
      try { obj = JSON.parse(text); } catch (e) { throw loadError(`Die Datei enthält kein gültiges JSON (${e.message}).`); }
      return unwrap(obj);
    }

    function apply(data) {
      clearTimeout(timer);            // ein geplanter Autosave gehört zu den alten Daten
      clearNotice();
      store.data = Object.assign(defaults(), data);
      dirty = false;
      if (opts.onChange) opts.onChange(store.data);
      refresh();
    }
    // Liest und prüft die Datei, ohne irgendetwas zu verändern. Wirft bei jedem Problem.
    async function readFrom(h) {
      const file = await h.getFile();
      const data = parseText(await file.text());
      return { data, mod: file.lastModified };
    }
    // Schreibt die aktuellen Daten und gibt lastModified der Datei zurück.
    async function writeTo(h) {
      const json = JSON.stringify(wrap(store.data), null, 2);
      const w = await h.createWritable();
      try { await w.write(json); await w.close(); }
      catch (e) { try { await w.abort(); } catch { /* ignorieren */ } throw e; }
      return (await h.getFile()).lastModified;
    }
    // Liest h und übernimmt die Datei als Verbindung + aktuelle Daten. Erst nach erfolgreichem
    // Lesen wird irgendetwas verändert. Gibt false zurück, wenn der Nutzer das Verwerfen
    // ungespeicherter Änderungen ablehnt. confirmMsg = null: keine Rückfrage.
    async function loadFile(h, confirmMsg, persist) {
      const r = await readFrom(h);
      if (!persist && h !== handle) return false;   // währenddessen wurde eine andere Datei verbunden
      if (dirty && confirmMsg && !confirm(confirmMsg)) return false;
      if (persist) await idbSet(name, h);
      handle = h; needLoad = false; lastMod = r.mod;
      state = 'ok'; errorMsg = '';
      apply(r.data);
      return true;
    }
    const isGone = (e) => e && (e.name === 'NotFoundError' || e.name === 'NotReadableError' || e.name === 'InvalidStateError');
    // Fehler beim Laden der verbundenen Datei
    function loadFailed(e) {
      if (e && e.loadError) {
        if (needLoad) return setState('unloaded', e.message);   // Datei nie gelesen → nie schreiben
        // Die Daten im Fenster stammen aus dieser Datei und bleiben gültig (z. B. im Zustand 'conflict').
        return notify(`„${handle ? handle.name : 'Datei'}“ konnte nicht gelesen werden: ${e.message} Die Daten im Fenster bleiben unverändert.`);
      }
      if (e && e.name === 'NotAllowedError') return setState('permission');
      setState(isGone(e) ? 'lost' : 'error', e && e.message);
    }

    /* ---------- Verbindungsprüfung ---------- */
    // Prüft Zugriff, Existenz und externe Änderungen. Speichert bei Bedarf.
    store.check = async function () {
      if (!handle || busy) return;
      busy = true;
      try {
        if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return setState('permission');
        const f = await handle.getFile();
        if (needLoad) return;   // Inhalt wurde nie gelesen: niemals von selbst auf 'ok' (= Autosave) schalten
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
      if (!handle || state !== 'ok' || needLoad) return;
      clearTimeout(timer);
      timer = setTimeout(() => store.save().catch(() => {}), SAVE_DELAY_MS);
    };

    /* ---------- Öffnen / Speichern ---------- */
    store.open = async function () {
      let h = null;
      try {
        if (!SUPPORTED) return openFallback();
        [h] = await window.showOpenFilePicker({ types: FILE_TYPES, id: name });
        // Bei Problemen bleiben bisherige Verbindung und Daten unverändert.
        await loadFile(h, 'Ungespeicherte Änderungen verwerfen und diese Datei öffnen?', true);
      } catch (e) {
        if (e.name === 'AbortError') return;
        notify(`„${h ? h.name : 'Datei'}“ konnte nicht geöffnet werden: ${e.message}` + (e.loadError ? ' Die bisherige Verbindung und die Daten bleiben unverändert.' : ''));
      }
    };

    // force = true überschreibt auch eine außerhalb geänderte bzw. nie gelesene Datei
    store.save = async function (force) {
      clearTimeout(timer);
      try {
        if (!SUPPORTED) return downloadFallback();
        if (!handle) return store.saveAs();
        if (needLoad && force !== true) {
          notify(`Nicht gespeichert: Die Datei „${handle.name}“ wurde noch nicht geladen und wird deshalb nicht überschrieben.`);
          return store.check();
        }
        if (force !== true && state !== 'ok') return store.check();
        const h = handle;
        if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return setState('permission');
        if (force !== true && lastMod !== null && (await h.getFile()).lastModified !== lastMod) return setState('conflict');
        const mod = await writeTo(h);
        if (h !== handle) return;   // währenddessen wurde eine andere Datei verbunden
        lastMod = mod; needLoad = false; dirty = false;
        setState('ok');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setState(isGone(e) ? 'lost' : 'error', 'Speichern fehlgeschlagen: ' + e.message);
      }
    };

    // Ausdrückliche Aktion für eine nicht lesbare Datei: Inhalt bewusst durch die aktuellen Daten ersetzen.
    async function overwriteUnloaded() {
      if (!handle) return;
      const what = dirty ? 'den aktuell angezeigten Daten (Standarddaten mit deinen Änderungen)' : 'Standarddaten';
      if (!confirm(`Die Datei „${handle.name}“ konnte nicht geladen werden (${errorMsg.replace(/\.$/, '')}).\n\nWenn du sie jetzt mit ${what} überschreibst, geht ihr bisheriger Inhalt unwiderruflich verloren.\n\nWirklich überschreiben?`)) return;
      await store.save(true);
    }

    store.saveAs = async function () {
      try {
        if (!SUPPORTED) return downloadFallback();
        const h = await window.showSaveFilePicker({ suggestedName: name + '.json', types: FILE_TYPES, id: name });
        const mod = await writeTo(h);   // erst schreiben, dann umschalten: bei Fehler bleibt alles wie es war
        clearTimeout(timer);
        handle = h; needLoad = false; lastMod = mod; dirty = false;
        clearNotice();
        await idbSet(name, h);
        setState('ok');
      } catch (e) {
        if (e.name !== 'AbortError') notify('Speichern fehlgeschlagen: ' + e.message);
      }
    };

    store.new = async function () {
      if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
      handle = null; lastMod = null; needLoad = false;
      await idbSet(name, undefined);
      state = 'none'; errorMsg = '';
      apply(defaults());
    };

    // Datei neu einlesen und eigene Änderungen verwerfen (nach Rückfrage, wenn es welche gibt)
    store.reload = async function () {
      if (!handle) return;
      const h = handle;
      try {
        const msg = needLoad
          ? `Die Datei „${h.name}“ wird jetzt geladen. Änderungen, die du bisher an den angezeigten Standarddaten gemacht hast, gehen dabei verloren.\n\nFortfahren? (Mit „Abbrechen“ kannst du sie vorher mit „Speichern unter…“ in eine andere Datei sichern.)`
          : 'Ungespeicherte Änderungen verwerfen und die Datei neu laden?';
        const done = await loadFile(h, msg, false);
        if (!done && needLoad && h === handle) setState('unloaded', 'Die Datei wurde noch nicht geladen.');
      } catch (e) { loadFailed(e); }
    };

    // Nach Klick des Nutzers: Zugriff erneut erlauben (nötig nach Browser-Neustart).
    // Die Rückfrage vor dem Verwerfen ungespeicherter Änderungen steht in reload() und kommt
    // erst nach requestPermission(), damit die Nutzeraktivierung nicht verbraucht wird.
    store.reconnect = async function () {
      if (!handle) return;
      try {
        if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return setState('permission');
        if (needLoad) { await store.reload(); return; }
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
        const f = inp.files[0];
        if (!f) return;
        try {
          const data = parseText(await f.text());
          if (dirty && !confirm('Ungespeicherte Änderungen verwerfen und diese Datei öffnen?')) return;
          apply(data);
        } catch (e) { notify(`„${f.name}“ konnte nicht geöffnet werden: ${e.message}` + (e.loadError ? ' Die Daten bleiben unverändert.' : '')); }
      };
      inp.click();
    }

    // Beim Start: zuletzt benutzte Datei wieder verbinden
    store.restore = async function () {
      // Änderungen vor restore() stammen von der Initialisierung des Tools (Standarddaten), nicht vom Nutzer.
      if (!handle) dirty = false;
      refresh();
      if (!SUPPORTED) return;
      const h = await idbGet(name);
      if (!h || handle) return;   // nichts gemerkt, oder inzwischen wurde schon eine Datei verbunden
      handle = h; needLoad = true; lastMod = null;   // bis zum erfolgreichen Lesen wird nie geschrieben
      try {
        if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          setState('permission');
        } else {
          await loadFile(h, null, false);
        }
      } catch (e) {
        loadFailed(e);
      }
    };

    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    return store;
  }

  window.SimpleStorage = { create, supported: SUPPORTED };
})();
