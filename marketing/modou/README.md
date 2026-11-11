# Modou : le personnage des publicités Jokko

**Règle de CFC : toutes les publicités Jokko racontent l'histoire de Modou.** On fait des épisodes, l'un après l'autre, toujours avec le même Modou, la même boutique, le même ami et la même voix. Ne jamais changer son apparence.

## Fiche du personnage

| | |
|---|---|
| **Nom** | Modou |
| **Métier** | Commerçant, alimentation générale, « BOUTIQUE MODOU », à Dakar |
| **Peau** | `#6B4226` (brun chaud) |
| **Cheveux et barbe** | courts, noirs `#1A1410`, barbe courte autour du menton |
| **Habit** | grand boubou **bleu Jokko** `#2F7DC9`, col et broderie **jaune Jokko** `#F6B800` |
| **Caractère** | travailleur, honnête, un peu dépassé au début, puis serein et fier grâce à Jokko |
| **Expressions** | `face(p, t, { mood })` : `mood` de −1 (inquiet, sourcils relevés) à +1 (heureux, grand sourire) ; `talk` pour parler |

**Son ami : Ibou.** Peau `#4E2F1B`, boubou **vert** `#2B9A66` à col blanc, **kufi blanc** (calotte). C'est lui qui conseille Jokko (« Jéemal Jokko ! »).

**La boutique.** Étagères en bois avec sacs de **riz**, bidons d'**huile** jaunes, boîtes de **sucre** bleues, boîtes de **lait** ; comptoir orange avec le panneau noir « BOUTIQUE MODOU » ; porte ouverte sur la rue à droite ; lampe suspendue ; horloge. Version **nuit** (problèmes) et version **jour** (avec Jokko).

**La maison.** Mur crème, fenêtre de nuit avec la lune, tableau, canapé rouge, plateau d'attaya.

## Style et son

- Dessin plat (« flat »), couleurs Jokko : crème `#FFFDF7`, encre `#17191F`, jaune `#F6B800`, bleu nuit `#0A1F44`.
- Polices : Bricolage Grotesque (titres) et Instrument Serif italique (accents).
- Format **vertical 9:16** (1080 × 1920), 30 images par seconde.
- **Wolof en grand, un peu de français en petit** (sous-titres et textes à l'écran). Les nombres se disent en wolof (« fukk ak ñeent »). **L'argent se compte en dërëm** (1 dërëm = 5 F) : 4 000 F = « juróom ñetti téeméer », 8 000 F = « junni ak juróom benni téeméer » ; utiliser `francsToWolof()` de `src/assistant/wolofNumbers.ts`, puis redire le montant en français.
- Voix : Gemini TTS, voix **Sulafat**, enregistrée par la fonction Supabase `voix-accueil` ; chaque phrase validée en wolof par Fallou avant l'enregistrement.
- **Vrais sons (depuis le 4 nov. 2026)** : ambiances enregistrées de `remvze/moodist` (rue animée, village la nuit, grillons, horloge, foule ; CC0 / licence Pixabay), bruitages enregistrés de Kenney RPG Audio (`Boyquotes/kenney-rpg-audio-for-godot` : pièces, porte, pas, tissu, pages ; CC0) et bruitages de `wyzowl/sfx-kit` (caisse, billets, téléphone, notifications ; CC0). Fonctions `bed()` et `hit()` dans `audio/real.py`, exemple complet : `audio/cues_real.py`. Chaque scène a son ambiance.
- Musique et sons : moteur `sfx` de claude-motion (`audio/cues.py`), mineur pendant le problème, majeur quand Jokko arrive ; voix au-dessus de la musique ; volume final −14 LUFS.

## Épisodes

| # | Titre | Fichier | État |
|---|---|---|---|
| 1 | Modou ne sait pas ce qu'il gagne → Jokko | `film.html` + `script.json` (1 min 02) | ✅ livré le 4 nov. 2026 |
| — | Intro (5 s) et fin TikTok (6,5 s) | `intro.html` (`?fin` pour la fin) | ✅ livré |
| 3 | Pub de campagne « Wax rekk, Jokko bind » (A : Modou parle ; B : question), 9:16 et 4:5, bouton WhatsApp | `campagne.tpl.html` (`?b=1`) + `campagne-script.json` (24 s / 22 s) | ✅ livré |
| 2 | Les offres : essai 14 jours, Gratuit, Médium, Avancé | `offres.tpl.html` + `offres-script.json` (1 min 06) | ✅ livré |
| 4 | Modou présente Jokko métier par métier (photos IA de l'accueil) | `metiers.html` + `metiers-script.json` + `metiers-timing.json`, son : `audio/metiers_mix.py` (1 min 06) | ✅ livré le 9 nov. 2026, sur l'accueil (`public/media/jokko-metiers-v1.mp4`) |

Idées d'épisodes suivants : Modou et le vendeur qui oublie de noter (alertes à distance) · Modou et les dettes (relance WhatsApp) · Modou installe son stock avec une photo de facture · Modou ouvre une deuxième boutique · Modou paie par Wave et reçoit son reçu · Modou au marché, il voit sa boutique depuis son téléphone.

## Fabriquer un épisode

1. Écrire l'histoire (scènes + phrases wolof/français) dans `script.json`, la faire valider par Fallou.
2. Enregistrer la voix (`voix-accueil`, une phrase = un segment), mesurer les durées, remplir `timing.json`.
3. Dessiner les scènes dans une page avec `window.seek(t)` (réutiliser `person()`, `face()`, les produits et la boutique de `film.html`).
4. Vérifier des images fixes : `PAGE=film.html VW=1080 VH=1920 node render.mjs stills 2,10,20 st`.
5. Rendre : `node render.mjs video 0 30 out/a.mp4` (par moitiés en parallèle), coller avec `ffmpeg -f concat`, ajouter le son (`audio/build.py` puis mixage voix + musique).
6. Regarder la planche (1 image / 2 s) : pas de flash gris entre les scènes, sous-titres lisibles.

`render.mjs` utilise Playwright (Chromium) et ffmpeg.

**Outil vidéo installé à chaque génération : video-shotcraft** (https://github.com/Vincentwei1021/video-shotcraft) — skill `video-shotcraft-jokko`. Effets de plans (`references/shots/`), règles d'esthétique, calage sur le rythme ; idéal pour les démos avec les vrais écrans de l'application. Si Remotion ne s'installe pas, refaire l'effet dans la page `window.seek(t)`.

## Fabriquer sans accès direct au stockage (depuis le 9 nov. 2026)

L'atelier de Claude ne joint pas le stockage Supabase. Voix et photos passent par :
1. Fonction `accueil` (jeton `galerie_token`, appelée par SQL `net.http_post`) : `action: "voix"` → `galerie/accueil/voix/<slug>.wav` (Sulafat, 3 demandes à la fois au plus) ; sans action → photo 4:5 (une demande à la fois).
2. Workflow GitHub `assets` (lancé par l'API : `POST /actions/workflows/assets.yml/dispatches`, champ `paths`) : dépose les fichiers sur la branche `atelier`, que l'on clone.
3. Rendu : `node render.mjs` (Puppeteer + Chrome) ou `render.mjs` du dossier ; son : `python3 audio/metiers_mix.py <dossier voix> out.wav` (musique afro-pop maison, bruitages, voix au-dessus), puis `ffmpeg -af loudnorm=I=-14`.
4. Deux fichiers : HD 1080 × 1920 pour les réseaux, web 720 × 1280 (≈ 3 Mo, `preload="none"`) pour le site.

## Modou et Ibou en vrai (photoréaliste, Higgsfield, depuis le 11 nov. 2026)

Même fiche que ci-dessus, en version photo/vidéo réaliste. Toujours donner ces deux fiches comme `image_references` pour garder les mêmes visages :

| Personnage | Fiche (job Higgsfield) |
|---|---|
| Modou | `517618bf-87d4-4a08-a3e3-c25326d0331f` (boubou bleu `#2F7DC9`, broderie jaune, barbe courte) |
| Ibou | `65f50a3a-b813-4a89-a9a0-d3428bf0aa94` (boubou vert, col blanc, kufi blanc) |

- Vidéo test (15 s, 9:16, Seedance 2.0, 720p, sans paroles) : `7a5010a6-dc43-4623-b584-d9218b5a9f35`.
- Méthode : clips **sans paroles** (ambiance + musique) ; la voix wolof vient de Gemini (Sulafat) **après validation de Fallou**, puis est donnée à Seedance en `audio_references` pour faire parler les personnages.
- Essai gratuit Higgsfield (illimité) jusqu'au 13/11/2026 23 h 50 : Seedance 2.0 jusqu'à 720p et 15 s, Seedance 2.5 en 480p jusqu'à 30 s, images Nano Banana Pro 2K. Après : 10 crédits seulement, toujours annoncer le prix avant.
- L'atelier de Claude ne peut pas télécharger les fichiers Higgsfield (cloudfront bloqué) : Fallou les télécharge depuis son compte Higgsfield.
