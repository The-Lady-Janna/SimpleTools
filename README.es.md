# SimpleTools

[Deutsch](README.md) · [English](README.en.md) · **Español** · [Français](README.fr.md)

Pequeñas herramientas como páginas HTML independientes: sin servidor, sin instalación, sin compilación.
Los datos se **guardan localmente en un archivo JSON** y se vuelven a cargar después.
Funciona en **Chrome y Edge** (File System Access API). Otros navegadores usan una alternativa (descarga / selector de archivos).

## Uso

Abre `index.html` en el navegador (basta con hacer doble clic, funciona con `file://`) y elige una herramienta.
Con «Abrir…» o «Guardar como…» conectas un archivo JSON; a partir de entonces **cada cambio se guarda automáticamente**.
La página comprueba cada pocos segundos (y al volver a la pestaña) si la conexión con el archivo sigue activa y lo muestra arriba:
archivo movido o eliminado, acceso ya no permitido (tras reiniciar el navegador, pulsa una vez «Restablecer conexión») o archivo modificado desde fuera (no se sobrescribe nada hasta que elijas «Recargar archivo» o «Sobrescribir con mis datos»).

## Apariencia

Con el botón 🎨 (abajo a la derecha) puedes elegir un tema (Sistema, Claro, Oscuro, Medianoche, cuatro variantes pastel) y una **imagen de fondo** (10 % de opacidad, p. ej. para personalizar con tu marca). El ajuste vale para todas las herramientas y se guarda en el `localStorage` del navegador. La barra con Nuevo/Abrir/Guardar se puede plegar y desplegar con «▾ Archivo»; plegada, solo queda visible el estado del archivo.

## Idiomas

El menú 🎨 permite elegir el idioma: **Deutsch, English, Español, Français**. Las herramientas están escritas en alemán; `shared/i18n.js` traduce la interfaz en el navegador con los diccionarios `shared/lang/<código>.js` (nodos de texto, `placeholder`/`title`/`aria-label`, `alert`/`confirm`/`prompt`). Los datos guardados nunca se traducen y el cambio se aplica al instante, sin recargar. Fechas, días de la semana, meses e importes siguen el idioma; las exportaciones (CSV, .ics) permanecen en alemán.

Las herramientas nuevas se traducen añadiendo sus textos en alemán como claves en los diccionarios (marcadores `{#}` para números/fechas, `{q}` para „citas“, `{€}` para importes, `{w}`/`{m}` para día de la semana/mes; detalles en la cabecera de `shared/i18n.js`). Los textos sin traducir se quedan en alemán; `SimpleI18n.misses` los lista en la consola.

## Escribir una herramienta nueva

1. Crea `tools/mi-herramienta.html` (plantilla: `tools/todo.html`).
2. Incluye `shared/style.css`, `shared/i18n.js` y `shared/ui.js` (en el `<head>`, en este orden) y `shared/storage.js` (la barra necesita `#save` dentro de un `.toolbar` más `#status`); usa etiquetas `<script>` clásicas, sin módulos ES, para que `file://` funcione.
3. Llama a `SimpleStorage.create({ name, defaults, onChange, statusEl })`; tras cada cambio de datos llama a `store.changed()`; al iniciar, a `store.restore()`. `statusEl` muestra el estado de la conexión y las acciones.
4. Enlaza la herramienta en `index.html`.

Reglas: un archivo HTML por herramienta, sin dependencias externas ni CDN, sin enviar datos a servidores.
