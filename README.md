# SimpleTools

Kleine Tools als einzelne HTML-Seiten – ohne Server, ohne Installation, ohne Build.
Die Daten werden **lokal als JSON-Datei** gespeichert und wieder geladen.
Funktioniert in **Chrome und Edge** (File System Access API). In anderen Browsern gibt es einen Fallback (Download / Datei-Auswahl).

## Benutzen

`index.html` im Browser öffnen (Doppelklick genügt, auch per `file://`) und ein Tool wählen.
Mit „Öffnen…“ oder „Speichern unter…“ eine JSON-Datei verbinden – danach wird **jede Änderung automatisch gespeichert**.
Die Seite prüft alle paar Sekunden (und beim Zurückkehren zum Tab), ob die Verbindung zur Datei noch besteht, und zeigt es oben an:
Datei verschoben/gelöscht, Zugriff nicht mehr erlaubt (nach Browser-Neustart einmal „Verbindung wiederherstellen“ klicken) oder Datei außerhalb geändert (dann wird nicht überschrieben, bis du „Datei neu laden“ oder „Mit meinen Daten überschreiben“ wählst).

## Darstellung

Über den Knopf 🎨 (unten rechts) lassen sich Design (System, Hell, Dunkel, Mitternacht, vier Pastell-Varianten) und ein **Hintergrundbild** (10 % Deckkraft, z. B. zum Branden) wählen. Die Einstellung gilt für alle Tools und liegt im `localStorage` des Browsers. Die Leiste mit Neu/Öffnen/Speichern lässt sich über „▾ Datei“ ein- und ausklappen; eingeklappt bleibt nur der Datei-Status sichtbar.

## Sprachen

Im 🎨-Menü gibt es die Sprachwahl **Deutsch, English, Español, Français**. Die Tools sind auf Deutsch geschrieben; `shared/i18n.js` übersetzt die Oberfläche im Browser anhand der Wörterbücher `shared/lang/<code>.js` (Textknoten, `placeholder`/`title`/`aria-label`, `alert`/`confirm`/`prompt`). Gespeicherte Daten werden nie übersetzt, und der Wechsel geht live ohne Neuladen. Datum, Wochentage, Monate und Beträge folgen der Sprache; Exporte (CSV, .ics) bleiben deutsch.

Neue Tools bekommen Übersetzungen, indem ihre deutschen Texte als Schlüssel in die Wörterbücher aufgenommen werden (Platzhalter `{#}` für Zahlen/Daten, `{q}` für „Zitate“, `{€}` für Beträge, `{w}`/`{m}` für Wochentag/Monat; Details im Kopf von `shared/i18n.js`). Nicht übersetzte Texte bleiben deutsch; `SimpleI18n.misses` listet sie in der Konsole.

## Neues Tool schreiben

1. `tools/mein-tool.html` anlegen (Vorlage: `tools/todo.html`).
2. `shared/style.css`, `shared/i18n.js` und `shared/ui.js` (im `<head>`, in dieser Reihenfolge) und `shared/storage.js` einbinden (die Leiste braucht `#save` in einer `.toolbar` plus `#status`) (klassische `<script>`-Tags, keine ES-Module, damit `file://` funktioniert).
3. `SimpleStorage.create({ name, defaults, onChange, statusEl })` aufrufen; nach jeder Datenänderung `store.changed()`; beim Start `store.restore()`. `statusEl` zeigt Verbindungsstatus und Aktionen.
4. Tool in `index.html` verlinken.

Regeln: eine HTML-Datei pro Tool, keine externen Abhängigkeiten/CDNs, keine Daten an Server senden.
