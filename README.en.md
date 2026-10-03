# SimpleTools

[Deutsch](README.md) · **English** · [Español](README.es.md) · [Français](README.fr.md)

Small tools as single HTML pages – no server, no installation, no build.
Data is **stored locally as a JSON file** and loaded again later.
Works in **Chrome and Edge** (File System Access API). Other browsers use a fallback (download / file picker).

On the start page you can show and hide apps via **⚙️ Customize apps** (tap apps, "Done" to finish). The selection is kept in the browser's `localStorage`.

## Usage

Open `index.html` in your browser (a double-click is enough, `file://` works) and pick a tool.
Connect a JSON file with "Open…" or "Save as…" – from then on **every change is saved automatically**.
The page checks every few seconds (and when you return to the tab) whether the connection to the file still exists and shows it at the top:
file moved/deleted, access no longer granted (after a browser restart click "Reconnect" once) or file changed outside the page (nothing is overwritten until you choose "Reload file" or "Overwrite with my data").

## Appearance

The 🎨 button (bottom right) lets you choose a theme (System, Light, Dark, Midnight, four pastel variants) and a **background image** (10 % opacity, e.g. for branding). The setting applies to all tools and lives in the browser's `localStorage`. The bar with New/Open/Save can be collapsed and expanded via "▾ File"; when collapsed, only the file status stays visible.

## Languages

The 🎨 menu offers the language choice **Deutsch, English, Español, Français**. The tools are written in German; `shared/i18n.js` translates the interface in the browser using the dictionaries `shared/lang/<code>.js` (text nodes, `placeholder`/`title`/`aria-label`, `alert`/`confirm`/`prompt`). Stored data is never translated, and switching happens live without reloading. Dates, weekdays, months and amounts follow the language; exports (CSV, .ics) stay German.

New tools get translations by adding their German texts as keys to the dictionaries (placeholders `{#}` for numbers/dates, `{q}` for „quotes“, `{€}` for amounts, `{w}`/`{m}` for weekday/month; details in the header of `shared/i18n.js`). Untranslated texts stay German; `SimpleI18n.misses` lists them in the console.

## Writing a new tool

1. Create `tools/my-tool.html` (template: `tools/todo.html`).
2. Include `shared/style.css`, `shared/i18n.js` and `shared/ui.js` (in the `<head>`, in this order) and `shared/storage.js` (the bar needs `#save` inside a `.toolbar` plus `#status`) – use classic `<script>` tags, no ES modules, so that `file://` works.
3. Call `SimpleStorage.create({ name, defaults, onChange, statusEl })`; call `store.changed()` after every data change; call `store.restore()` at startup. `statusEl` shows the connection status and actions.
4. Link the tool in `index.html`.

Rules: one HTML file per tool, no external dependencies/CDNs, no data sent to servers.
