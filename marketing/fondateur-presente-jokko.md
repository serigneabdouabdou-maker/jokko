# Vidéo « Fallou Cissé présente Jokko » (≈ 70 s, 9:16) — suivi

Demande de Fallou (11/11/2026, 06 h 13) : lui-même, fondateur, présente Jokko dans un bureau moderne hyper réaliste, en français, lèvres synchronisées, avec logo et fonctions animés (2D/3D), montage avancé, **Seedance 2.5** (pas 2.0). Gratuit = 480p, ≤ 30 s par plan.

Compte Higgsfield de l'essai ≠ ancien compte : les anciennes photos de son visage (mémoire « higgsfield-visage ») **n'existent pas ici** → photo demandée à Fallou (06 h 18).

| # | Plan | Voix (Gemini Charon, `galerie/accueil/voix/…`) | Inserts |
|---|---|---|---|
| 1 | Bureau, face caméra | `fond-1` « Je m'appelle Fallou Cissé, fondateur de Jokko, une solution de CFC, Cissé Family Company. » (7,1 s) | logo 3D |
| 2 | Vers la baie vitrée | `fond-2` « Au Sénégal, des milliers de commerçants tiennent encore leurs comptes dans un cahier. Le soir, personne ne sait vraiment combien il a gagné. » (9,5 s) | Modou la nuit, muet `7ece3871-dd4b-44e6-8251-378875d98dd7` |
| 3 | Montre son téléphone | `fond-3` « Alors j'ai créé Jokko : un assistant qui comprend le wolof et le français. Tu dis ta vente, Jokko la note. » (8,1 s) | vraie appli `app-vente.mp4` |
| 4 | Assis sur le bureau | `fond-4` « Ventes, stock, dettes, caisse du soir : tout est calculé. Et même à distance, le patron voit sa boutique. » (7,5 s) | `features.mp4` (cartes animées, branche `atelier-film` e77076b) |
| 5 | Les métiers | `fond-5` « Restaurant, boulangerie, tailleur, supérette avec scanner et tickets : chaque métier a son Jokko. » | plans du film : restaurant, supérette, tailleur |
| 6 | Appel final | `fond-6` « Essayez Jokko gratuitement pendant quatorze jours, sur jokkoapp point com. » + `fond-7` (wolof) « Jokko moo koy yor ! » | carte de fin |

Logo importé : media `9f11b97e-3491-466d-9038-1fec769de380`. Logo 3D : image à générer (refusée 2× pour limite de jobs simultanés : Higgsfield n'accepte qu'un job à la fois en ce moment).
Méthode lèvres : Seedance 2.5 `mode: omni_reference`, `image_references` = photo de Fallou + image clé du bureau, `audio_references` = voix `fond-N` importée (media_import_url de l'URL publique Supabase).

Voix importées dans Higgsfield (audio_references) : fond-1 `85c0f7f2-9bbf-4cc4-805c-26dce6504501`, fond-2 `4380ba8f-f650-49fb-a024-a9df6c7080b2`, fond-3 `d085a8a1-57cb-4a21-a92c-0aa4299f2477`, fond-4 `6fc29a9a-714e-4ffb-acbb-be96e27e4cdb`, fond-5 `fef8406d-9e87-480e-a3fb-ad8625b82633`, fond-6 `2801c579-ccb0-4dae-9483-d7e94a27de04`, fond-7 (wolof) `ef611b69-0cdf-4fbc-93aa-c35c3198a6ba`.
