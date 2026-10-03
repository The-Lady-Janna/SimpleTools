# SimpleTools

[Deutsch](README.md) · [English](README.en.md) · [Español](README.es.md) · **Français**

De petits outils sous forme de pages HTML indépendantes : sans serveur, sans installation, sans compilation.
Les données sont **enregistrées localement dans un fichier JSON** puis rechargées.
Fonctionne dans **Chrome et Edge** (File System Access API). Les autres navigateurs utilisent une solution de repli (téléchargement / sélecteur de fichiers).

## Utilisation

Ouvrez `index.html` dans le navigateur (un double-clic suffit, `file://` fonctionne) et choisissez un outil.
Avec « Ouvrir… » ou « Enregistrer sous… », vous reliez un fichier JSON ; ensuite **chaque modification est enregistrée automatiquement**.
La page vérifie toutes les quelques secondes (et au retour sur l'onglet) que la connexion au fichier existe toujours et l'indique en haut :
fichier déplacé ou supprimé, accès qui n'est plus autorisé (après un redémarrage du navigateur, cliquez une fois sur « Rétablir la connexion ») ou fichier modifié à l'extérieur (rien n'est écrasé tant que vous n'avez pas choisi « Recharger le fichier » ou « Écraser avec mes données »).

## Apparence

Le bouton 🎨 (en bas à droite) permet de choisir un thème (Système, Clair, Sombre, Minuit, quatre variantes pastel) et une **image d'arrière-plan** (10 % d'opacité, par ex. pour personnaliser avec votre marque). Le réglage s'applique à tous les outils et est conservé dans le `localStorage` du navigateur. La barre Nouveau/Ouvrir/Enregistrer peut être repliée et dépliée via « ▾ Fichier » ; repliée, seul l'état du fichier reste visible.

## Langues

Le menu 🎨 propose le choix de la langue : **Deutsch, English, Español, Français**. Les outils sont écrits en allemand ; `shared/i18n.js` traduit l'interface dans le navigateur à l'aide des dictionnaires `shared/lang/<code>.js` (nœuds de texte, `placeholder`/`title`/`aria-label`, `alert`/`confirm`/`prompt`). Les données enregistrées ne sont jamais traduites et le changement est immédiat, sans rechargement. Les dates, jours de la semaine, mois et montants suivent la langue ; les exports (CSV, .ics) restent en allemand.

Les nouveaux outils sont traduits en ajoutant leurs textes allemands comme clés dans les dictionnaires (marqueurs `{#}` pour les nombres/dates, `{q}` pour les « citations », `{€}` pour les montants, `{w}`/`{m}` pour le jour de la semaine/le mois ; détails dans l'en-tête de `shared/i18n.js`). Les textes non traduits restent en allemand ; `SimpleI18n.misses` les liste dans la console.

## Écrire un nouvel outil

1. Créez `tools/mon-outil.html` (modèle : `tools/todo.html`).
2. Incluez `shared/style.css`, `shared/i18n.js` et `shared/ui.js` (dans le `<head>`, dans cet ordre) ainsi que `shared/storage.js` (la barre a besoin de `#save` dans un `.toolbar` plus `#status`) ; utilisez des balises `<script>` classiques, sans modules ES, pour que `file://` fonctionne.
3. Appelez `SimpleStorage.create({ name, defaults, onChange, statusEl })` ; après chaque modification des données, appelez `store.changed()` ; au démarrage, `store.restore()`. `statusEl` affiche l'état de la connexion et les actions.
4. Ajoutez un lien vers l'outil dans `index.html`.

Règles : un fichier HTML par outil, aucune dépendance externe ni CDN, aucune donnée envoyée à des serveurs.
