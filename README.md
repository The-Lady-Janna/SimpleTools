# SimpleTools

Kleine Tools als einzelne HTML-Seiten – ohne Server, ohne Installation, ohne Build.
Die Daten werden **lokal als JSON-Datei** gespeichert und wieder geladen.
Funktioniert in **Chrome und Edge** (File System Access API). In anderen Browsern gibt es einen Fallback (Download / Datei-Auswahl).

## Benutzen

`index.html` im Browser öffnen (Doppelklick genügt, auch per `file://`) und ein Tool wählen.
Mit „Öffnen…“ oder „Speichern unter…“ eine JSON-Datei verbinden – danach wird **jede Änderung automatisch gespeichert**.
Die Seite prüft alle paar Sekunden (und beim Zurückkehren zum Tab), ob die Verbindung zur Datei noch besteht, und zeigt es oben an:
Datei verschoben/gelöscht, Zugriff nicht mehr erlaubt (nach Browser-Neustart einmal „Verbindung wiederherstellen“ klicken) oder Datei außerhalb geändert (dann wird nicht überschrieben, bis du „Datei neu laden“ oder „Mit meinen Daten überschreiben“ wählst).

## Neues Tool schreiben

1. `tools/mein-tool.html` anlegen (Vorlage: `tools/todo.html`).
2. `shared/style.css` und `shared/storage.js` einbinden (klassische `<script>`-Tags, keine ES-Module, damit `file://` funktioniert).
3. `SimpleStorage.create({ name, defaults, onChange, statusEl })` aufrufen; nach jeder Datenänderung `store.changed()`; beim Start `store.restore()`. `statusEl` zeigt Verbindungsstatus und Aktionen.
4. Tool in `index.html` verlinken.

Regeln: eine HTML-Datei pro Tool, keine externen Abhängigkeiten/CDNs, keine Daten an Server senden.
