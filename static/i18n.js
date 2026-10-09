/* i18n.js — traduction FR -> EN de l'interface (réglage Options > Langue).
   Fonctionnement : le français reste la langue source dans le code ; quand
   la langue est "en", un MutationObserver traduit à la volée les nœuds texte
   et les attributs title / data-tip / placeholder via le dictionnaire
   ci-dessous (correspondance exacte après trim, puis règles regex pour les
   chaînes paramétrées). T(s) traduit les chaînes hors DOM (confirm/alert). */

const PF_I18N_EN = {
  /* ---- onglets & barre principale ---- */
  "Vue d'ensemble": "Overview",
  "Par style": "By style",
  "Sélection globale": "Global picks",
  "Génération": "Generation",
  "Tri des textures": "Texture triage",
  "changer de jeu": "switch game",
  "mettre la file en pause / reprendre": "pause / resume the queue",
  "vider la file d'attente": "clear the queue",
  "raccourcis clavier (touche ?)": "keyboard shortcuts (? key)",
  "options de l'app": "app options",
  "⚙ Options": "⚙ Options",
  "Style :": "Style:",
  "🔍 filtrer": "🔍 filter",
  "filtre la liste des artistes au clavier": "filter the style list",
  "style précédent": "previous style",
  "style suivant": "next style",
  "Générer les manquants": "Generate missing",
  "génère X variantes pour chaque personnage, avec ou sans images, sélectionné ou pas": "generate X variants for every character, with or without images, selected or not",
  "de chaque": "each",
  "Générer": "Generate",
  "Sélection auto": "Auto-select",
  "sélectionne la variante la plus récente pour chaque personnage sans sélection": "select the most recent variant for every character without a pick",
  "filtrer les personnages par sexe": "filter characters by sex",
  "Sexe :": "Sex:",
  "Tous": "All",
  "à traiter": "to do",
  "n'afficher que les personnages sans sélection": "only show characters without a pick",
  "Exporter": "Export",
  "🗑 Non sélectionnées": "🗑 Unselected",
  "supprime les images non sélectionnées de ce style (avec confirmation)": "delete this style's unselected images (with confirmation)",
  "🗑 Tout le style": "🗑 Whole style",
  "supprime TOUTES les images générées de ce style — les originaux sont conservés (avec confirmation)": "delete ALL generated images of this style — originals are kept (with confirmation)",
  "réf. du style :": "style refs:",

  /* ---- options ---- */
  "Général": "General",
  "Prompts": "Prompts",
  "Artistes": "Artists",
  "Chemins": "Paths",
  "Steps (vide = 28) :": "Steps (empty = 28):",
  "moins = plus rapide, plus = plus fin": "lower = faster, higher = finer",
  "Résolution :": "Resolution:",
  "768 pour itérer vite, 1216+ pour la qualité finale": "768 to iterate fast, 1216+ for final quality",
  "défaut (1024)": "default (1024)",
  "768 (rapide)": "768 (fast)",
  "1216 (qualité)": "1216 (quality)",
  "1536 (lent)": "1536 (slow)",
  "défaut (euler ancestral / normal)": "default (euler ancestral / normal)",
  "dpm++ 2m / karras (net)": "dpm++ 2m / karras (sharp)",
  "plus haut = suit plus le prompt": "higher = follows the prompt more",
  "lineart respecte mieux les traits des portraits dessinés": "lineart better preserves drawn portrait strokes",
  "canny (contours)": "canny (edges)",
  "lineart anime (traits)": "anime lineart (strokes)",
  "Utiliser les tags auto des portraits ⓘ": "Use the portraits' auto tags ⓘ",
  "injecte les couleurs de cheveux/yeux et accessoires détectés dans le prompt de chaque perso": "inject detected hair/eye colors and accessories into each character's prompt",
  "Seuil de détection des tags :": "Tag detection threshold:",
  "plus bas = plus de tags détectés (défaut 0.35)": "lower = more tags detected (default 0.35)",
  "Anti-halo sur les contours ⓘ": "Anti-halo on edges ⓘ",
  "retire le voile blanc sur les bords semi-transparents des images générées": "removes the white veil on semi-transparent edges of generated images",
  "Notification Windows en fin de génération ⓘ": "Windows notification when generation ends ⓘ",
  "affiche une notification Windows quand toutes les générations sont finies (demande l'autorisation du navigateur)": "shows a Windows notification when all generations are done (asks for browser permission)",
  "Préfixe qualité Pony :": "Pony quality prefix:",
  "Négatif de base Pony :": "Pony base negative:",
  "Préfixe qualité Illustrious :": "Illustrious quality prefix:",
  "Négatif de base Illustrious :": "Illustrious base negative:",
  "Suffixe commun (fin du prompt positif) :": "Common suffix (end of positive prompt):",
  "Chaîne finale : préfixe + [sexe + tags auto] + prompt du style + suffixe (+ tes ajouts Custom).": "Final chain: prefix + [sex + auto tags] + style prompt + suffix (+ your Custom additions).",
  "Images par clic sur \"⟳ Regénération\" :": "Images per \"⟳ Regenerate\" click:",
  "Quantité par défaut du panneau Custom :": "Default quantity in the Custom panel:",
  "Images par clic sur \"Générer X de chaque\" :": "Images per \"Generate X each\" click:",
  "Utiliser le denoise propre à chaque style": "Use each style's own denoise",
  "Denoise global :": "Global denoise:",
  "Images affichées dans le mur \"Génération\" :": "Images shown on the \"Generation\" wall:",
  "Taille des vignettes :": "Thumbnail size:",
  "petites": "small",
  "moyennes": "medium",
  "grandes": "large",
  "Langue / Language :": "Language:",
  "Artistes affichés :": "Visible artists:",
  "fiche →": "sheet →",
  "ouvrir la fiche dans Par style": "open the sheet in By style",
  "Les réglages par style (LoRA, denoise, ControlNet) se font dans l'onglet\n   \"Par style\", via ⚙ Custom / Générer les manquants / Générer X de chaque.": "Per-style settings (LoRA, denoise, ControlNet) are made in the \"By style\" tab, through ⚙ Custom / Generate missing / Generate X each.",
  "Répertoire du pack de textures (export) :": "Texture pack directory (export):",
  "URL de ComfyUI (vide = http://127.0.0.1:8188) :": "ComfyUI URL (empty = http://127.0.0.1:8188):",
  "📂 Miniatures": "📂 Thumbnails",
  "Redimensionner à la taille d'origine à l'export ⓘ": "Resize to the original size on export ⓘ",
  "décoché : les images sont installées en 1024px (plus net si l'émulateur accepte les tailles supérieures)": "unchecked: images are installed at 1024px (sharper if the emulator accepts larger sizes)",
  "Backup du pack avant écrasement ⓘ": "Back up the pack before overwriting ⓘ",
  "sauvegarde l'original du pack dans _pack_backup au premier remplacement": "saves the pack's original into _pack_backup on first replacement",
  "↩ Restaurer les portraits d'origine": "↩ Restore original portraits",
  "recopie les portraits de _originals dans le pack": "copies the _originals portraits back into the pack",
  "Clé API Civitai :": "Civitai API key:",
  "32 caractères hexadécimaux": "32 hexadecimal characters",
  "Fermer": "Close",

  /* ---- jeux ---- */
  "🎮 Jeux": "🎮 Games",
  "＋ Ajouter un jeu": "＋ Add a game",
  "Nouveau jeu": "New game",
  "Nom :": "Name:",
  "Répertoire de destination (pack de textures, optionnel) :": "Destination directory (texture pack, optional):",
  "choisir avec l'explorateur Windows": "pick with Windows Explorer",
  "📂 Parcourir…": "📂 Browse…",
  "Ajouter et ouvrir": "Add and open",

  /* ---- recadrage upload ---- */
  "✂ Recadrer": "✂ Crop",
  "pivoter de 90° vers la gauche": "rotate 90° left",
  "pivoter de 90° vers la droite": "rotate 90° right",
  "⇋ Miroir H": "⇋ Flip H",
  "miroir horizontal (gauche ↔ droite)": "horizontal flip (left ↔ right)",
  "⇵ Miroir V": "⇵ Flip V",
  "miroir vertical (haut ↔ bas)": "vertical flip (top ↔ bottom)",
  "🪄 Fond": "🪄 Background",
  "baguette magique : activer puis cliquer sur le fond uni pour le rendre transparent (plusieurs clics possibles)": "magic wand: enable then click the flat background to make it transparent (several clicks allowed)",
  "tolérance de la baguette : écart de couleur accepté autour du pixel cliqué": "wand tolerance: accepted color distance around the clicked pixel",
  "↺ Réinit": "↺ Reset",
  "annuler rotation / miroir / baguette : revenir à l'image d'origine": "undo rotation / flip / wand: back to the original image",
  "Annuler": "Cancel",
  "ne pas uploader cette image (Échap)": "don't upload this image (Esc)",
  "Image entière": "Whole image",
  "uploader l'image entière, sans recadrage": "upload the whole image, uncropped",
  "✔ Valider le recadrage": "✔ Apply crop",
  "uploader la zone recadrée (Entrée)": "upload the cropped area (Enter)",

  /* ---- zoom / lightbox ---- */
  "original — le survol affiche l'image globale de ce personnage": "original — hover shows this character's global image",
  "original": "original",
  "sélection pour ce style — clic : afficher cette image": "pick for this style — click: show this image",
  "sélection actuelle": "current pick",
  "ouvrir le dossier dans l'explorateur": "open the folder in Explorer",
  "ouvrir l'image dans le visualiseur système": "open the image in the system viewer",
  "revenir au personnage précédent (Ctrl+←)": "previous character (Ctrl+←)",
  "passer au personnage suivant (Ctrl+→)": "next character (Ctrl+→)",
  "fermer (Échap)": "close (Esc)",
  "couleur du fond derrière les images": "background color behind the images",
  "basculer entre l'affichage classique et l'affichage dense (A original · B globale · C sélection · D consultée)": "toggle between classic and dense layout (A original · B global · C pick · D current)",
  "pas d'image globale": "no global image",
  "pas de sélection pour ce style": "no pick for this style",
  "image précédente — raccourci : ← ou molette · Ctrl+← : personnage précédent": "previous image — shortcut: ← or wheel · Ctrl+←: previous character",
  "image suivante — raccourci : → ou molette · Ctrl+→ : personnage suivant": "next image — shortcut: → or wheel · Ctrl+→: next character",
  "✓ Sélectionner cette image": "✓ Select this image",
  "raccourci : Entrée ou ↑": "shortcut: Enter or ↑",
  "☆ Définir comme globale": "☆ Set as global",
  "cette image sera celle exportée pour ce personnage dans la Sélection globale (tous styles confondus)": "this image will be the one exported for this character in Global picks (across all styles)",
  "⟳ Regénération": "⟳ Regenerate",
  "régénérer avec les paramètres utilisés pour CETTE image": "regenerate with the parameters used for THIS image",
  "⚙ Custom": "⚙ Custom",
  "denoise, quantité, prompts, LoRA/ControlNet": "denoise, quantity, prompts, LoRA/ControlNet",
  "🗑 Supprimer": "🗑 Delete",
  "supprimer cette image — raccourci : Suppr ou ↓": "delete this image — shortcut: Del or ↓",

  /* ---- popup Régénérer / Custom ---- */
  "Régénérer": "Regenerate",
  "Quantité :": "Quantity:",
  "Base :": "Base:",
  "— Checkpoint :": "— Checkpoint:",
  "🔍 filtrer les checkpoints": "🔍 filter checkpoints",
  "Presets :": "Presets:",
  "🔥 Style renforcé": "🔥 Strong style",
  "denoise ≥ 0.75, ControlNet allégé (0.35 / fin 0.6), LoRA +0.1 — le style de l'artiste s'exprime beaucoup plus fortement, ressemblance un peu réduite": "denoise ≥ 0.75, lighter ControlNet (0.35 / end 0.6), LoRA +0.1 — the artist's style shows much more, slightly lower likeness",
  "⚖️ Équilibré": "⚖️ Balanced",
  "réglages d'origine : denoise 0.70, ControlNet 0.5 / fin 0.75, LoRA 0.9 — bon équilibre style / fidélité au portrait": "original settings: denoise 0.70, ControlNet 0.5 / end 0.75, LoRA 0.9 — good balance of style vs likeness",
  "Denoise :": "Denoise:",
  "Force LoRA": "LoRA strength",
  "ControlNet fin": "ControlNet end",
  "Seed (vide = aléatoire) :": "Seed (empty = random):",
  "vide = aléatoire ; fixer une seed permet de reproduire/varier finement une image": "empty = random; fixing a seed lets you reproduce/finely vary an image",
  "même seed": "same seed",
  "reprendre la seed exacte de l'image consultée": "reuse the exact seed of the viewed image",
  "Mémoriser LoRA / denoise / ControlNet pour ce style": "Remember LoRA / denoise / ControlNet for this style",
  "Ajouter au prompt positif (fin de prompt) :": "Add to the positive prompt (end of prompt):",
  "Ajouter au prompt négatif (fin de prompt) :": "Add to the negative prompt (end of prompt):",
  "ex: smiling, red scarf, freckles": "e.g. smiling, red scarf, freckles",
  "ex: hat, beard, angry": "e.g. hat, beard, angry",
  "⚡ Générer en priorité": "⚡ Generate first",
  "passe devant tout ce qui est déjà en file d'attente": "jumps ahead of everything already queued",
  "Lancer": "Start",
  "Régénérer (paramètres de cette image)": "Regenerate (this image's parameters)",

  /* ---- vues (chaînes construites en JS) ---- */
  "Perso": "Character",
  "Original": "Original",
  "Choix": "Pick",
  "✨ Custom": "✨ Custom",
  "clic gauche : toutes les versions de ce portrait (tous styles)": "left click: all versions of this portrait (all styles)",
  "clic gauche : toutes les versions de ce portrait": "left click: all versions of this portrait",
  "clic gauche : toutes les versions de ce portrait (tous styles) · clic droit : zoom": "left click: all versions of this portrait (all styles) · right click: zoom",
  "image qui sera exportée pour ce personnage": "image that will be exported for this character",
  "clic gauche : ouvrir la vue Par style pour cet artiste": "left click: open the By style view for this artist",
  "clic gauche : ouvrir la vue Par style": "left click: open the By style view",
  "clic gauche : uploader des images dans la catégorie ✨ Custom de ce portrait · clic droit : zoom": "left click: upload images into this portrait's ✨ Custom category · right click: zoom",
  "clic gauche : uploader des images dans la catégorie ✨ Custom de ce portrait": "left click: upload images into this portrait's ✨ Custom category",
  "clic gauche : fiche de l'artiste sur ce personnage · clic droit : zoom": "left click: this artist's sheet for this character · right click: zoom",
  "clic gauche : fiche de l'artiste sur ce personnage": "left click: this artist's sheet for this character",
  "clic gauche : choisir la version pour ce style": "left click: choose the version for this style",
  "texture originale · clic gauche : toutes les versions · clic droit : zoom": "original texture · left click: all versions · right click: zoom",
  "pas d'image globale · clic gauche : toutes les versions": "no global image · left click: all versions",
  "clic gauche : garder la texture ORIGINALE pour ce personnage · clic droit : zoom": "left click: keep the ORIGINAL texture for this character · right click: zoom",
  "clic gauche : choisir comme image globale (re-clic : retirer) · clic droit : menu regénération/custom": "left click: choose as global image (click again: remove) · right click: regenerate/custom menu",
  "clic droit : menu de génération pour ce style": "right click: generation menu for this style",
  "clic gauche : versions pour ce perso / cet artiste": "left click: versions for this character / artist",
  "clic gauche : sélectionner (re-clic : désélectionner) · clic droit : zoom": "left click: select (click again: deselect) · right click: zoom",
  "variantes": "variants",
  "♂ Mâle": "♂ Male",
  "♀ Fem.": "♀ Fem.",
  "✎ Autre": "✎ Other",
  "mâle": "male",
  "femelle": "female",
  "autre (texte libre)": "other (free text)",
  "ex: monster, furry": "e.g. monster, furry",
  "régénérer": "regenerate",
  "en file…": "queued…",
  "denoise, quantité, prompts + / −": "denoise, quantity, prompts + / −",
  "supprimer les variantes NON sélectionnées de cette ligne": "delete this row's UNSELECTED variants",
  "⬆ Uploader…": "⬆ Upload…",
  "ajouter une ou plusieurs images dans la catégorie ✨ Custom de ce personnage (recadrage au ratio de la texture)": "add one or more images to this character's ✨ Custom category (cropped to the texture's ratio)",
  "supprimer": "delete",
  "✕ Supprimer": "✕ Delete",
  "⟳ Regénérer": "⟳ Regenerate",
  "regénérer avec les paramètres de cette image (ou custom si l'image n'en a pas)": "regenerate with this image's parameters (or custom if it has none)",
  "définir comme image globale du personnage (re-clic : retirer)": "set as the character's global image (click again: remove)",
  "texture originale · clic droit : zoom": "original texture · right click: zoom",
  "texture originale": "original texture",
  "globale": "global",
  "(clic = sélectionner pour ce style, re-clic = désélectionner)": "(click = select for this style, click again = deselect)",
  "clic gauche : sélectionner pour ce style (re-clic : désélectionner) · clic droit : zoom": "left click: select for this style (click again: deselect) · right click: zoom",
  "⚙ Regénérer chaque style actif…": "⚙ Regenerate every active style…",
  "mettre en file X générations de ce personnage dans chacun des styles actifs (réglages propres à chaque style)": "queue X generations of this character in every active style (each style's own settings)",
  "clic gauche : ouvrir la fiche de l'artiste sur ce personnage": "left click: open this artist's sheet for this character",
  "image exportée pour ce personnage · clic droit : zoom": "image exported for this character · right click: zoom",
  " (auto)": " (auto)",

  /* ---- génération ---- */
  "Dernières images générées": "Latest generated images",
  "(clic = fiche du perso, clic droit = zoom)": "(click = character sheet, right click = zoom)",
  "📂 Ouvrir le dossier des images": "📂 Open the images folder",
  "ouvrir le répertoire des images générées dans l'explorateur": "open the generated images folder in Explorer",
  "Aucune génération en cours": "No generation running",
  "supprimer cette image (annulable : lien du toast ou Ctrl+Z)": "delete this image (undo via the toast link or Ctrl+Z)",
  "chargement…": "loading…",

  /* ---- tri ---- */
  "Stylisé": "Stylized",
  "Garder l'original": "Keep original",
  "🏷 Analyser les portraits (tags auto)": "🏷 Analyze portraits (auto tags)",
  "✓ déjà analysés": "✓ already analyzed",
  "par date de création": "by creation date",
  "par sexe": "by sex",
  "par nom de texture": "by texture name",
  "custom (glisser-déposer)": "custom (drag & drop)",

  /* ---- toasts & messages ---- */
  "Image supprimée": "Image deleted",
  "annuler": "undo",
  "(Ctrl+Z)": "(Ctrl+Z)",
  "reprendre": "resume",
  "Rien à supprimer": "Nothing to delete",
  "★ Image globale définie pour ce personnage": "★ Global image set for this character",
  "Image globale retirée (retour automatique)": "Global image removed (back to automatic)",
  "⚠ Notifications refusées par le navigateur": "⚠ Notifications denied by the browser",
  "— pack introuvable, installation ignorée": "— pack not found, install skipped",
  "❌ Erreur pendant l'export": "❌ Export failed",
  "✅ Rien à traiter": "✅ Nothing to do",
  "Afficher tous les personnages": "Show all characters",
  "Exporter quand même": "Export anyway",
  "(clic sur un personnage : ouvrir toutes ses versions)": "(click a character: open all its versions)",

  "Les portraits de ce jeu n'ont jamais été analysés (tags auto : couleurs de cheveux, yeux, accessoires — améliore la fidélité des générations).": "This game's portraits were never analyzed (auto tags: hair/eye colors, accessories — improves generation fidelity).",
  "Lancer l'analyse maintenant ? (~1-2 min, en arrière-plan)": "Run the analysis now? (~1-2 min, in the background)",
  "Répertoire du pack introuvable — vérifie le chemin dans les options": "Pack directory not found — check the path in the options",

  /* ---- aide ---- */
  "⌨ Raccourcis clavier": "⌨ Keyboard shortcuts",
  "Partout": "Everywhere",
  "fermer le popup / zoom / menu ouvert": "close the open popup / zoom / menu",
  "restaurer la dernière image supprimée": "restore the last deleted image",
  "cette aide": "this help",
  "faire défiler le tableau": "scroll the table",
  "personnage précédent / suivant": "previous / next character",
  "style précédent / suivant": "previous / next style",
  "sélectionner la variante n°N du personnage courant (re-appui : désélectionner)": "select variant #N of the current character (press again: deselect)",
  "supprimer la vignette survolée": "delete the hovered thumbnail",
  "Zoom (comparaison)": "Zoom (compare)",
  "image précédente / suivante": "previous / next image",
  "sélectionner l'image affichée": "select the shown image",
  "supprimer l'image affichée": "delete the shown image",
  "personnage précédent / suivant (Alt : seulement ceux à ≥2 images)": "previous / next character (Alt: only those with ≥2 images)",
  "molette": "wheel",
  "Toutes les versions": "All versions",
  "portrait précédent / suivant": "previous / next portrait",
  "portrait précédent (←)": "previous portrait (←)",
  "portrait suivant (→)": "next portrait (→)"
};

/* chaînes paramétrées (nombres, noms) — chaque regex ne matche QUE du français,
   la sortie anglaise n'est donc jamais retraduite */
const PF_I18N_RULES = [
  [/^Toutes les versions — (.+)$/, "All versions — $1"],
  [/^★ Image globale — (.+)$/, "★ Global image — $1"],
  [/^génère : (.+)$/, "generating: $1"],
  [/^(\d+) en attente$/, "$1 queued"],
  [/^\| (\d+) en attente/, "| $1 queued"],
  [/ en attente \| reste ~(.+)$/, " queued | ~$1 left"],
  [/^⏸ EN PAUSE \| /, "⏸ PAUSED | "],
  [/^génération : (\d+)\/(\d+) \((\d+)%\)(.*)$/, "generating: $1/$2 ($3%)$4"],
  [/ — reste ~(.+)$/, " — ~$1 left"],
  [/^reste ~(.+)$/, "~$1 left"],
  [/^erreur : (.+)$/, "error: $1"],
  [/^⏸ (\d+) génération\(s\) en attente — file en pause · $/, "⏸ $1 generation(s) waiting — queue paused · "],
  [/^à l'instant$/, "just now"],
  [/^il y a (\d+) minutes?$/, "$1 min ago"],
  [/^il y a (\d+) heures?$/, "$1 h ago"],
  [/^il y a (\d+) jours?$/, "$1 days ago"],
  [/^⚙ En cours : $/, "⚙ Running: "],
  [/^Images générées : $/, "Images generated: "],
  [/^depuis 1 min/, "last 1 min"],
  [/^depuis 1 h/, "last 1 h"],
  [/^depuis 24 h/, "last 24 h"],
  [/^🗑 (\d+) images mises à la corbeille \(_appdata\/trash, 7 jours\)$/, "🗑 $1 images moved to the app trash (_appdata/trash, 7 days)"],
  [/^✅ (\d+) portraits exportés(.*)$/, "✅ $1 portraits exported$2"],
  [/ — (\d+) installés dans le pack \((\d+) backups créés\)$/, " — $1 installed in the pack ($2 backups created)"],
  [/^(\d+) générations mises en file \(tous les personnages\)$/, "$1 generations queued (all characters)"],
  [/^(\d+) générations mises en file \(personnages sans sélection\)$/, "$1 generations queued (characters without a pick)"],
  [/^⚠ Export incomplet — (\d+) personnages? sans image choisie$/, "⚠ Incomplete export — $1 character(s) without a chosen image"],
  [/^Exporter quand même \((\d+) portraits\)$/, "Export anyway ($1 portraits)"],
  [/^Supprimer les (\d+) images NON sélectionnées de « (.+) » \?$/, "Delete the $1 UNSELECTED images of “$2”?"],
  [/^\(les (\d+) images sélectionnées sont conservées\)$/, "(the $1 selected images are kept)"],
  [/^Supprimer TOUTES les images générées de « (.+) » \((\d+) images\) \?$/, "Delete ALL generated images of “$1” ($2 images)?"],
  [/^Les originaux sont conservés\.$/, "Originals are kept."],
  [/^Elles vont dans la corbeille de l'app \(restaurables 7 jours\)\.$/, "They go to the app trash (restorable for 7 days)."],
  [/^Régénérer — (.+)$/, "Regenerate — $1"],
  [/^Création custom — (.+)$/, "Custom creation — $1"],
  [/^Régénérer chaque style actif \((\d+)\) — (.+)$/, "Regenerate every active style ($1) — $2"],
  [/^✂ Recadrer — (.+)$/, "✂ Crop — $1"],
  [/^zone : (\d+)×(\d+) px — glisser.*$/, "area: $1×$2 px — drag: move · corners: resize · wheel: grow/shrink · Enter: apply · Esc: cancel"],
  [/^✨ (\d+) images? ajoutées? à la catégorie Custom de (.+)$/, "✨ $1 image(s) added to $2's Custom category"],
  [/^🏆 Artistes les plus sélectionnés \((\d+) persos\) : $/, "🏆 Most picked artists ($1 characters): "],
  [/^👤 Fiche de l'artiste \((.+)\)$/, "👤 Artist sheet ($1)"],
  [/^(\d+) portraits d'origine restaurés dans le pack$/, "$1 original portraits restored into the pack"]
];

/* ---------------- moteur ---------------- */
window.PF_LANG = 'fr';
const _pfMap = new Map(Object.entries(PF_I18N_EN));

function _pfTr(s){
  if(!s) return s;
  const t = s.trim();
  if(!t) return s;
  const hit = _pfMap.get(t);
  if(hit !== undefined) return s.replace(t, hit);
  for(const [re, rep] of PF_I18N_RULES){
    if(re.test(t)) return s.replace(t, t.replace(re, rep));
  }
  return s;
}

/* traduit une chaîne hors DOM (confirm/alert), ligne par ligne */
function T(s){
  if(window.PF_LANG !== 'en' || !s) return s;
  return String(s).split('\n').map(_pfTr).join('\n');
}

const _PF_ATTRS = ['title', 'data-tip', 'placeholder'];
function _pfTransElem(el){
  for(const a of _PF_ATTRS){
    const v = el.getAttribute && el.getAttribute(a);
    if(v){
      const nv = _pfTr(v);
      if(nv !== v) el.setAttribute(a, nv);
    }
  }
}
function _pfWalk(root){
  if(root.nodeType === 3){
    const nv = _pfTr(root.nodeValue);
    if(nv !== root.nodeValue) root.nodeValue = nv;
    return;
  }
  if(root.nodeType !== 1) return;
  _pfTransElem(root);
  if(root.querySelectorAll){
    for(const el of root.querySelectorAll('[title],[data-tip],[placeholder]')) _pfTransElem(el);
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while((n = w.nextNode())){
    const nv = _pfTr(n.nodeValue);
    if(nv !== n.nodeValue) n.nodeValue = nv;
  }
}

function i18nInit(lang){
  window.PF_LANG = lang || 'fr';
  if(window.PF_LANG !== 'en') return;
  _pfWalk(document.body);
  new MutationObserver(muts => {
    for(const m of muts){
      if(m.type === 'childList'){
        for(const n of m.addedNodes) _pfWalk(n);
      }else if(m.type === 'characterData'){
        const nv = _pfTr(m.target.nodeValue);
        if(nv !== m.target.nodeValue) m.target.nodeValue = nv;
      }else if(m.type === 'attributes'){
        _pfTransElem(m.target);
      }
    }
  }).observe(document.body, {subtree: true, childList: true, characterData: true,
                             attributes: true, attributeFilter: _PF_ATTRS});
}
