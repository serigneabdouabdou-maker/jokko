# Film « Wax rekk, Jokko bind » (60 s, 9:16) — suivi de fabrication

Directeur artistique : Claude. Essai Higgsfield illimité jusqu'au 13/11/2026 23 h 50 (Seedance 2.0 720p ≤ 15 s, une vidéo à la fois ; images Nano Banana Pro 2K).

Personnages (toujours en `image_references`) : Modou `517618bf-87d4-4a08-a3e3-c25326d0331f`, Ibou `65f50a3a-b813-4a89-a9a0-d3428bf0aa94`.

| # | Plan | Paroles (wolof, à faire valider à l'oreille) | Image clé | Vidéo | État |
|---|---|---|---|---|---|
| 1 | Accroche : drone sur Sandaga, coup de sabar | — | `e6d37269-a0a4-4b27-950e-68b076c18ab2` | `968cd0d0-f91d-4b1d-b132-f4d2da4c93d0` | ✅ fait |
| 2 | Nuit, Modou et son cahier | « Cahier bi dafa ma sonal ! Xaalis bi du mat. » | — | `2b8ef018-85dc-4b93-97e2-f698535edc1f` (test paroles wolof natives) | ✅ fait, à écouter par Fallou |
| 3 | Ibou entre | « Modou, laisse le cahier. Jëlal Jokko : wax rekk, mu bind ! » | — | `1b3c23f6-5b45-42d0-9602-56d66e3671dd` | ✅ fait, à écouter |
| 4 | Modou parle au téléphone | « Jaay naa ñaari kilo sukar ak benn litre diw. » | — | `d17ca627-fbcc-43c4-b5ed-fa6314f55434` | ✅ fait, à écouter |
| 5 | Vraie appli : vente enregistrée | — | capture `app-vente.mp4` (branche `atelier-film`) → media `d328f13f-165e-419e-8e85-2deae5371cf0` | — | prêt |
| 6 | Restaurant : Awa encaisse, ticket | « Ñaari yassa, benn bissap… ticket bi génn na ! » | `3a173357-1de4-4263-ac05-a08390ed9d2e` | `5a0376c1-3d2c-4ba4-af03-9ba081a55bd7` | ✅ fait (sans paroles) |
| 7 | Supérette : scanner, ticket | — | `1be932e0-8b27-48ec-8bd1-7903ab1c613c` | `12dcb316-99a0-4094-94cd-4f5a74c5e33c` | ✅ fait |
| 8 | Tailleur : essayage sur selfie | « Waaw ! Moom laa bëgg ! » | `405127b7-fb15-476f-9b20-0cbeafc3dd49` | `b10016ce-4232-420f-8ad2-ac45d31d022b` | ✅ fait (sans paroles) |
| 9 | Rue : car rapide Jokko, moto | — | affiches importées : car rapide `f6d5565c-5a7f-43f8-876a-5ebeee0c588d`, moto `486e74eb-35ae-4cdf-bb32-aeba630ec698` | car rapide `4122d9ef-0c42-4cef-83b1-1eed7d6f3547` ✅, moto `5a0227be-6f44-4585-b76f-2282c7f10646` ✅ |
| 10 | Danse sabar devant la boutique | — | `eef0bf8b-019e-4649-ad59-7ac792fbbe2d` | `2fcb3682-b3ed-4dd9-8edc-1cff8860b67a` | ✅ fait |
| 11 | Appel final face caméra | « Jokko mooy sa caissier, sa comptable ak sa mémoire. Jéemal ko tey : essai 14 jours gratuit ! » | `4a4f9bbe-8df6-420d-bfc4-6c899aa29639` | `bcdf45c1-0ad2-4d1e-a58e-df208961a4e0` | ✅ fait, à écouter |
| 12 | Fin : logo, slogan, jokkoapp.com | — | — | — | à faire |

Notes
- Captures de l'appli : rendu de `Desk` en mode démo (dossier `harness/` temporaire, puppeteer), puis `media_import_url` via **jsDelivr** (`cdn.jsdelivr.net/gh/serigneabdouabdou-maker/jokko@atelier-film/…`) — raw.githubusercontent est refusé (type de fichier).
- Voix Gemini : crédit vide le 11/11 à 00 h 08 (402) → en attendant, test des paroles wolof natives de Seedance.

- Montage : workflow Higgsfield `video-montage` (ffmpeg dans `sandbox_exec`, côté Higgsfield ; l'assemblage n'est pas couvert par l'illimité → vérifier le coût avant).

## Montage v1 (11/11/2026, 06 h)

- Fichier : `jokko-film-wax-rekk.mp4`, 64 s, 720 × 1280, 24 i/s, −14 LUFS, ≈ 30 Mo. Média Higgsfield `3837f5ff-95ae-467c-a417-8fd73ef8cc9f`.
- Monté dans la sandbox Higgsfield (gratuite) : coupes franches, sous-titres wolof en grand (Montserrat ExtraBold) + français en jaune, vraie appli en accéléré ×2, carte de fin (logo, « Wax rekk, Jokko bind », « Essai 14 jours gratuit », jokkoapp.com).
- Musique : `bed.mp3` (afrobeat + sabar fabriqué en numpy, 112 BPM, branche `atelier-film`), baissée sous les paroles (4–22 s et 52–60 s).
- Paroles : voix wolof natives de Seedance. Contrôle Whisper : les phrases sont là, mais « 14 jours » de l'appel final sonne peu clair → le sous-titre l'écrit. **Wolof à valider à l'oreille par Fallou avant publication.**

## Version 2 : voix off française documentaire (11/11/2026, 06 h 10) — décision de Fallou

Fallou : « le wolof n'est pas bon » → voix off **française** façon documentaire (Gemini, voix **Charon**), personnages muets, et à la fin le slogan wolof dit par Fallou : **« Jokko moo koy yor »** (sur la carte de fin).

Texte (enregistré, `galerie/accueil/voix/doc-v1…v8.wav`) :
1. Dakar. Chaque matin, des milliers de commerçants ouvrent leur boutique.
2. Mais le soir, c'est toujours la même question : combien ai-je gagné aujourd'hui ? Le vieux cahier ne répond pas.
3. Alors, Ibou lui fait découvrir Jokko.
4. Modou parle simplement, en wolof ou en français. Et Jokko note tout : la vente, le stock, la caisse.
5. Au restaurant, à la supérette, chez le tailleur : chaque métier a son Jokko. Le ticket sort, le stock se met à jour, le client est servi.
6. Jokko est partout dans la ville.
7. Jokko, c'est ton caissier, ton comptable et ta mémoire. Essai gratuit de quatorze jours, sur jokkoapp point com.
8. (wolof) Jokko moo koy yor !

- v2 montée : média Higgsfield `cb4e1343-6aeb-42ab-96e9-d05a7f20cd04` (65,7 s), sous-titres français (images Pillow, ffmpeg 5.1 sans `text_align`).
- À refaire sans paroles (bouches fermées) : plan 2 nuit `7ece3871-dd4b-44e6-8251-378875d98dd7` (en cours), plan 11 appel final (à lancer) → v3.
- Défaut vu : l'écran du téléphone de la supérette affiche des prix en « $ » (image IA) — à corriger si on refait le plan 7.

## Version 3 (13/11/2026, 21 h 17)
- Plans 2 et 11 remplacés par les versions muettes (`7ece3871…`, `e4553c1e…`). Média Higgsfield `9dd57ce1-acfa-4874-b6e2-3d116332a594` (65,7 s). Script de montage complet : `film/build.sh` dans la sandbox Higgsfield (recopié ici si besoin de refaire).
- Reste connu : prix en « $ » sur l'écran du téléphone de la supérette (plan 7).
