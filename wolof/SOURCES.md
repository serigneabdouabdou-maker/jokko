# Le wolof de Jokko : sources et système

Jokko comprend le wolof grâce à **Gemini** (il écoute et comprend la phrase), puis le **code de Jokko** vérifie ce qui touche à l'argent et au stock. Chaque projet GitHub sur le wolof est analysé avec la même grille, puis rangé dans **une des 6 cases** ci-dessous. Rien n'entre dans Jokko sans licence compatible, et rien n'entre dans les consignes de Gemini sans validation de Fallou.

## Les 6 cases du système

| Case | Rôle | Fichier dans le projet | Qui l'utilise |
|---|---|---|---|
| 1. Vocabulaire | Mots du commerce que Gemini doit connaître (validés par Fallou) | `src/assistant/wolofLexicon.ts` | Gemini (consignes) |
| 2. Écritures | Même mot, écritures différentes (thieb = ceeb, soukar = suukar) | `src/assistant/wolofSpelling.ts`, `wolofNames.ts` | Code de Jokko |
| 3. Nombres et argent | Chiffres wolof, dërëm, variantes (ñatt, ñenti, fan-weer) | `src/assistant/wolofNumbers.ts` | Code de Jokko + Gemini |
| 4. Phrases de Jokko | Ce que Jokko a le droit de dire (validé) | `src/assistant/wolofPhrases.ts` | Gemini (consignes) |
| 5. Examen | Phrases réelles + bonne réponse, score à chaque CI | `src/assistant/wolofExamen.json` | CI |
| 6. Réserve | Utile plus tard (voix, reconnaissance, entraînement) : noté, pas branché | ce fichier | — |

Important : on ne réentraîne pas Gemini. Les corpus servent à **trouver des mots et des écritures**, et à **construire l'examen**. Un modèle wolof externe (reconnaissance vocale, traduction) ne remplace Gemini que si l'examen prouve qu'il fait mieux, sur de vraies phrases du comptoir.

## Grille d'analyse (pour chaque projet)

1. **Quoi** : données (texte, audio, dictionnaire), code, ou modèle ?
2. **Licence** : MIT / Apache / CC0 / CC-BY = OK. CC-BY-SA = OK pour mesurer, ne pas recopier dans le code. Non commercial ou sans licence = mesurer seulement en interne, jamais recopier.
3. **Qualité** : vérifié par des humains ? orthographe officielle (CLAD) ou à la française ? wolof de Dakar ?
4. **Lien avec la boutique** : argent, produits, quantités, dettes, clients ?
5. **Case** : 1 à 6, et ce qui est concrètement pris.
6. **Mesure** : score de l'examen avant / après.

## Projets analysés

| Projet | Contenu | Licence | Verdict | Case | Ce qui a été pris |
|---|---|---|---|---|---|
| [papasega/african-speech-mcp](https://github.com/papasega/african-speech-mcp) | Catalogue des corpus de wolof parlé | Apache-2.0 | ✅ Utile comme carte | 6 | Liste des corpus et de leurs licences |
| [getalp/ALFFA_PUBLIC](https://github.com/getalp/ALFFA_PUBLIC) | ~18 000 phrases lues + textes web | Recherche (non précisée) | 🟡 Mesure seulement | 2, 3 | Écritures des nombres (mesure, rien recopié) |
| [gauthelo/kallaama-speech-dataset](https://github.com/gauthelo/kallaama-speech-dataset) | Radio et interviews (agriculture), wolof spontané | CC-BY-4.0 | ✅ | 2, 3 | ñatti / ñenti / ñeen, fan-weer |
| [abdoukarim/wolbanking77](https://github.com/abdoukarim/wolbanking77) | Phrases wolof sur l'argent et la banque | CC-BY-4.0 | ✅ Très utile | 1, 5 | fay, phrases d'argent ; 9 791 phrases sur Kaggle à récupérer |
| [Galsenaicommunity/Wolof-Common-Voice](https://github.com/Galsenaicommunity/Wolof-Common-Voice) | Phrases à lire pour Common Voice | CC-BY-SA-4.0 | 🟡 Mesure seulement | 1 | Fréquence des mots |
| [dofbi/jolof](https://github.com/dofbi/jolof) | Données pour entraîner des IA en wolof | MIT | ✅ | 1 | Fréquence des mots |
| [khossdev/baatukaay](https://github.com/khossdev/baatukaay) | Site de dictionnaire wolof–français : seulement 17 mots (lettre « aa ») | MIT | ❌ Trop petit | — | Rien (seul « aaréen = arachide », déjà couvert par gerte) |
| [wolof/wolof-english-dictionary](https://github.com/wolof/wolof-english-dictionary) | Dictionnaire wolof–anglais scanné (~1 400 articles, fautes de lecture) | Non précisée | 🟡 Pistes seulement | 1 | Mots du commerce proposés à Fallou (jafe, jar, waxaale, wanteer, déggoo, jappandi, kiliyaan, mbaar, fayyul) ; rien recopié |
| [Galsenaicommunity/Wolof-TTS](https://github.com/Galsenaicommunity/Wolof-TTS) | Carnets pour entraîner une voix wolof (xTTS v2, Parler-TTS, Fish, Tortoise) sur le jeu Baamtu ; pas de voix prête dans le dépôt | MIT | 🟡 Réserve | 6 | Rien branché : il faut une carte graphique et un serveur payant. À ressortir si la voix Gemini (Sulafat) prononce mal le wolof ; l'examen de la voix se fera alors à l'oreille par Fallou |
| [WolofProcessing/online_wolof_data](https://github.com/WolofProcessing/online_wolof_data) | Catalogue des ressources wolof (textes, audio, sites, livres) | Aucune (liste de liens) | ✅ Utile comme carte | 6 | A mené à wolof-nlp et au jeu « Wolof Non Standard Orthography » |
| [maimouna-mbacke/wolof-nlp](https://github.com/maimouna-mbacke/wolof-nlp) | Boîte à outils : écritures informelles → orthographe officielle, 74 paires de mots | MIT | ✅ Intégré | 2, 5 | 3 règles de fin de mot (e muet, p final, h final) ; 26 paires dans l'examen. Paires reconnues : 53/74 → 63/74 |
| soynade-research/Wolof-Non-Standard-Orthography (Hugging Face) | 3 438 phrases : orthographe officielle ↔ écriture « WhatsApp » (fabriquées par une IA d'après de vrais commentaires) | CC-BY-SA-4.0 | 🟡 Mesure seulement | 2 | Rien recopié. Mesure mot à mot (19 120 mots) : 90,1 % → 91,5 % après 3 règles (h = x, c de client = k, ph = f) |
| soynade-research/Oolel-Corrector (Hugging Face) | IA qui corrige l'orthographe wolof (1,5 milliard de paramètres) | AGPL-3.0 | 🟡 Réserve | 6 | Trop lourd pour le téléphone ; licence AGPL contraignante ; Gemini fait déjà ce travail |
| [masakhane-io/masakhane-ner](https://github.com/masakhane-io/masakhane-ner) | Textes wolof avec les noms de personnes et de lieux repérés | À vérifier (dépôt) | ✅ Pistes | 2, 5 | Noms fréquents → table des prénoms et noms (Seex = Cheikh, Siise = Cissé…). Clients retrouvés : 3/18 → 18/18 |
| [masakhane-io/chatbots-african-languages](https://github.com/masakhane-io/chatbots-african-languages) (AfriWOZ) | Dialogues de service client (archive) | MIT | ⏳ À analyser | 5 | — |

Mots ajoutés au vocabulaire grâce aux corpus (validés par Fallou le 04/11/2026) : fay, marse, soxla, indi, yóbbu, tuuti, bari ; puis jafe, jar, waxaale, wanteer, déggoo, jappandi, kiliyaan, mbaar, fayyul (135 mots au total).
Score de l'examen : 70,2 % → 100 % (84 phrases) le 04/11/2026 ; 100 % sur 116 épreuves après l'ajout des écritures (wolof-nlp) ; 100 % sur 135 épreuves avec les clients (MasakhaNER).
