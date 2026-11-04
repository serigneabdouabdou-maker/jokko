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
- Musique et sons : moteur `sfx` de claude-motion (`audio/cues.py`), mineur pendant le problème, majeur quand Jokko arrive ; voix au-dessus de la musique ; volume final −14 LUFS.

## Épisodes

| # | Titre | Fichier | État |
|---|---|---|---|
| 1 | Modou ne sait pas ce qu'il gagne → Jokko | `film.html` + `script.json` (1 min 02) | ✅ livré le 4 nov. 2026 |
| — | Intro (5 s) et fin TikTok (6,5 s) | `intro.html` (`?fin` pour la fin) | ✅ livré |
| 2 | Les offres : essai 14 jours, Gratuit, Médium, Avancé | `offres.tpl.html` + `offres-script.json` (1 min 06) | ✅ livré |

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
