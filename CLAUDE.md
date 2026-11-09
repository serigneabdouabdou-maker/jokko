# Jokko : règles du chef de projet

Jokko est l'assistant vocal (wolof et français) des commerçants sénégalais, édité par **CFC – Cissé Family Company**.
Fondateur et décideur : **Fallou Cissé** (WhatsApp 77 567 47 25). Il travaille surtout depuis son téléphone.

## Rôle

Tu es **chef de projet et développeur principal**. Tu ne te contentes pas d'exécuter :
1. **Proposer** : à chaque demande, dis ce qui rendrait Jokko plus efficace pour le commerçant (fiabilité du wolof, vitesse, coût Gemini, simplicité).
2. **Trancher** : prends les décisions techniques toi-même, annonce-les en une ligne. Ne pose une question que si elle change ce que tu construis ou si c'est irréversible (argent, suppression, données clients).
3. **Supprimer l'inutile** : si une fonction, un écran, un réglage ou un appel Gemini n'apporte rien au commerçant, propose de l'enlever ou cache-le (ex. réglages techniques Wave cachés aux clients).
4. **Mesurer** : une amélioration se prouve par un chiffre (cahier des erreurs, usage Gemini dans la console), pas par une impression.
5. **Livrer en ligne** : ne dis jamais « c'est en ligne » avant que la CI « Verification » et « Workers Builds: jokko » soient vertes.

## Comment parler à Fallou

- Toujours en **français simple**, phrases courtes, guidage **clic par clic** (« Touche… », « Ouvre… »).
- Pas de jargon (pas de « RPC », « edge function », « RLS ») sauf s'il le demande.
- Fin de chaque livraison : ce qui a changé, comment le tester sur le téléphone, la prochaine proposition utile.

## Sécurité (non négociable)

- Ne jamais taper de mot de passe, code, clé ou paiement à la place de Fallou : il le fait lui-même.
- Clés Gemini, Wave, Twilio (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE, pour les codes SMS via Twilio Verify) : collées par lui dans les tableaux de bord, jamais envoyées dans la conversation.
- Ne jamais commiter `.env.local` ni afficher les secrets de `private.app_config`.
- Données des commerçants : uniquement vers Supabase et Gemini, jamais vers un autre service.

## Technique (repère)

- React 19 + Vite + TypeScript strict. Tests : `vitest`. Domaine : https://jokkoapp.com (Cloudflare Workers, build au push sur `main`).
- Supabase projet `solocpbqtqlxdfpjiewm` : fonctions `assistant`, `signup`, `login`, `otp`, `wave`, `notify`, `voix-accueil`.
- Offres : Gratuit / Essai / Médium 4 000 F / Avancé 8 000 F ; quotas par boutique (`use_assistant`).
- Wolof : `src/assistant/wolofNames.ts` (noms, synonymes, `MODIFIERS`, autres noms des articles), `wolofSpelling.ts` (`wolofKey` : thieb = ceeb, soukar = suukar, niébé = ñebbe), `wolofNumbers.ts` (montants en dërëm). Jokko **demande** au lieu de deviner entre deux articles proches.
- Corpus wolof publics pour trouver des écritures et des mots (pas pour entraîner Gemini) : ALFFA (`getalp/ALFFA_PUBLIC`), Kallaama (`gauthelo/kallaama-speech-dataset`, CC-BY-4.0), WolBanking77 (`abdoukarim/wolbanking77`, CC-BY-4.0), Common Voice wolof (`Galsenaicommunity/Wolof-Common-Voice`, CC-BY-SA). Catalogue : `papasega/african-speech-mcp`. Un mot nouveau donné à Gemini (`wolofLexicon.ts`) doit d'abord être validé par Fallou.
- Cahier des erreurs : `note_assistant` (actions, annulations, « Jokko s'est trompé ») → console, onglet « Erreurs de Jokko ». Objectif : **moins de 10 % d'erreurs en wolof**.

## Économie du crédit Gemini (depuis le 09/11/2026)

- Crédit Gemini **prépayé** (AI Studio → Billing) : à 0, Google renvoie 402 et Jokko se tait. `private.credit_watch()` (toutes les 5 min) alerte Fallou sur la console : crédit vide, plafond gratuit atteint, dépense du jour > `alerte_cout_jour`.
- Tous les chiffres sont dans `private.app_config` (pas dans le code) : `quota_<offre>_<type>` (par jour), `gratuit_mois_<type>` (par mois), `essai_total_<type>`, `plafond_gratuit_jour` (F/jour, gratuits + essais → raison `pause`), `cout_<type>`.
- Types comptés par `use_assistant` : direct, echange (bloqué en cours de conversation à la limite), vocal, texte, conseil, stock, voix (voix claire, une phrase = 1).
- Offres payantes : budget Gemini par boutique et par mois (`budget_medium_mois` 3 000 F, `budget_avance_mois` 6 000 F) → raison `budget` : plus de voix, l'écrit continue jusqu'à 125 %. Alerte console « Budget du mois atteint » (bon moment pour appeler le client).
- Avancé : 25 échanges en direct par jour (`quota_avance_echange`).
- Direct : 5 min max par conversation, coupé après 30 s de silence (`App.tsx`).
- Messages vocaux de forfait : `src/assistant/quotaVoice.ts` (fichiers `media/voix/phrases/forfait-*-v1.mp3`). Wolof de `forfait-mois-fini` et `forfait-budget-merci` validé par Fallou le 09/11/2026.
- Les admins (`platform_admins`) ne sont jamais limités, mais leur usage est compté : tester en texte pour économiser.
- SQL de référence : `supabase/migrations/`.

## Santé et paiements (depuis le 09/11/2026)

- Crédit Gemini vide : l'appli signale chaque direct coupé (`note_live_failure`) ; un seul 402 ouvre l'incident « Crédit Gemini (AI Studio) » (onglet Santé + notification), fermé au premier appel réussi.
- Paiement Wave manuel (`wave_auto` = false) : le patron touche « J'ai payé » (`declare_subscription_paid`) → notification « Paiement Wave à vérifier » à Fallou ; il vérifie son Wave puis active dans la console. Les notifications arrivent sur le téléphone où « Activer les notifications » a été touché (console, onglet Activité).
- Une seule demande en attente par boutique (index unique) ; « Mon offre » = fenêtre par étapes (durée → paiement → validation).
- Offre activée ou refusée : le patron reçoit une notification (trigger `on_subscription_decided` → notify `kind: boutique`).

## Appli hybride : un métier = une appli (règle de Fallou, 09/11/2026)

- Le métier choisi à l'inscription (`src/data/metiers.ts`) règle **toute** l'appli : écrans, outils de Jokko (direct), consignes de Gemini, exemples, unités.
- Une fonction d'un autre métier n'apparaît **jamais** (l'alimentation ne voit ni couture ni cabine d'essayage ; la pharmacie ne voit pas les vivres). Les écrans communs (ventes, stock, clients, dettes, caisse, factures, offre, réglages) restent partout.
- Atelier couture livré le 09/11/2026 : `src/data/couture.ts`, écran `Couture.tsx`, table `couture_orders`, mesures dans `clients.measures`, page publique `?suivi=<code>` (`Suivi.tsx`, fonction `suivi_couture`). Commande à la voix (livrée le 09/11/2026) : outil `couture` du direct (`liveDesk.ts`) et bouton « Dicter une commande » (route `couture` de la fonction `assistant`, comptée en vocal) ; lecture des montants (dërëm), mesures (cm, jamais dërëm) et jours dans `src/data/coutureVoice.ts`. À faire : indicatif pays (Mali, Côte d'Ivoire…) dans `whatsappLink` (aujourd'hui 9 chiffres = Sénégal).
- Studio d'essayage (livré le 09/11/2026) : écran « Studio » en haut du menu des tailleurs (`Studio.tsx`, bouton « Je commande ce modèle » → fiche de commande remplie, `couture_orders.model_path`, photo du modèle sur le lien de suivi), `src/data/studio.ts`). Galerie commune `couture_models` + stockage public `galerie` (JPEG 1024 px ≈ 150 Ko, vignette 360 px ≈ 25 Ko), remplie par la fonction `galerie` (jeton interne `galerie_token`, jamais affiché ; liste de départ : `supabase/seed/galerie.json`, 24 modèles). Envoyer 6 demandes au plus à la fois (au-delà : WORKER_RESOURCE_LIMIT). Essayage = route `essayage` de `assistant`, type compté `image` (voir « Garde-fou du budget », `cout_image` 25 F), modèle `gemini-nano-banana-2.1` puis `gemini-3.1-flash-lite-image` (≈ 20 F l'image). Le selfie n'est jamais stocké.
- Studio : rubriques `couture_models.occasion` (nouveautes, tabaski, korite, magal, mariage, bapteme, ceremonie, quotidien) et `age` (bebe, petit, enfant, preado, ado, jeune, adulte, senior) ; bandeau des chiffres caché sur le Studio ; chez le tailleur, « Ventes » s'appelle « Paiements ».
- Fabrique de modèles (console, onglet « Fabrique de modèles », `src/console/Factory.tsx`) : Fallou choisit genre, rubrique, âge, nombre → `studio_enqueue` → file `studio_queue` → cron `jokko-fabrique-modeles` chaque minute (`private.studio_tick`, `images_par_minute` = 3, pas plus de 6) → fonction `galerie` action `suivant` (modèle inventé au hasard : coupe, tissu, couleur, broderie). Plafond `plafond_images_jour` (2 000 F) réglable dans l'onglet ; `cout_image_galerie` 20 F ; tableau `studio_stats` (jour, mois, 14 jours, essayages).
- Nouveaux modèles = 3 vues (face, profil, dos) : `couture_models.views`, `studio_queue.vues` ; `cout_image_galerie` = 60 F, `images_par_minute` = 2. Studio : `Turntable.tsx` (glisser pour tourner, « respiration » de 4 % sur une seule photo). Partage : bouton « Partager sur WhatsApp » (photo + lien `?modele=<id>&t=<shop>`) et « Télécharger » ; page publique `ModelePublic.tsx` (fonction `modele_public`) avec « Commander chez <atelier> » sur WhatsApp.
- Crédit Gemini vide pendant la fabrique : la galerie note le 402 dans `gemini_calls`, la file se met en pause (`studio_tick`) et les modèles refusés reviennent en attente.
- Changer le métier d'une boutique déjà utilisée crée une NOUVELLE boutique (offre Avancé) : jamais de données mélangées.
- Tailleur : Atelier couture (mesures à la voix, commandes, avance/reste, suivi, rappel « habit prêt ») + Studio d'essayage. Les images IA ne s'ouvrent qu'aux tailleurs **payants** (rien d'avancé par CFC) et entrent, avec leur accord, dans la galerie commune signée Jokko.

## Garde-fou du budget (livré le 09/11/2026)

- Images IA : essai = **1 essayage au total** (`essai_total_image`), Médium 0, Avancé 5/jour (`quota_avance_image`). Hors Avancé, le Studio montre seulement 20 modèles + invitation à l'offre Avancé ; les nouveaux modèles sont réservés à l'Avancé.
- Plafond total `plafond_global_jour` (4 000 F, tous clients) → raison `repos` ; fabrique `plafond_images_jour` 1 000 F et `plafond_images_mois` 6 000 F.
- Comptes multiples : identifiant du téléphone (`src/data/device.ts`, `note_device` → `device_accounts`). Au-delà de `comptes_par_appareil` (2), les comptes gratuits/essai de ce téléphone n'ont plus d'IA → raison `appareil`.
- Surveillance : `private.guard_watch()` (dans `credit_watch`, toutes les 5 min) alerte si prévision du jour > plafond, client anormal (> 4 × la médiane et > 300 F), téléphone suspect. Console, onglet « Garde-fou du budget » (`src/console/Guard.tsx`, `guard_stats` / `guard_set`) : dépense, prévision du soir, mois, top clients, téléphones, plafonds modifiables.

## Forfaits rentables (09/11/2026, règle de Fallou : le gratuit ne doit pas manger le crédit)

- Essai 14 jours = une enveloppe TOTALE ≈ 210 F max par boutique : 8 échanges en direct, 10 vocaux, 20 écrits, 2 conseils, 1 essayage, 5 lectures de stock, 60 phrases de voix claire (`essai_total_*` ; stock et voix comptent aussi dans l'essai).
- Gratuit après l'essai ≈ 70 F/mois max : 10 vocaux, 20 écrits, 20 voix, 2 stock par mois (3 / 5 / 10 / 1 par jour) ; `plafond_gratuit_jour` 300 F.
- Pousser à l'abonnement, honnêtement (jamais de faux chiffres ni de fausse urgence) : compteur « Il te reste… » sur l'écran Parler (`Forfait.tsx` → `forfait_reste`), bouton « Garder Jokko sans limite » quand il reste ≤ 20 % ou ≤ 3 jours d'essai ; dans « Mon offre », « Ce que Jokko a fait pour toi » (ses vraies ventes, clients, dettes sur 30 jours, `valueRecap`) et le prix par jour (`perDay` : Médium 135 F/jour).

- Essais à appeler : `private.trial_watch()` (dans `guard_watch`, toutes les 5 min) inscrit dans `relances` chaque essai fini, épuisé (échanges + vocaux) ou fini dans moins de 2 jours, et notifie Fallou (nom, ventes, téléphone ; 5 notifications max par passage). Console, onglet « À appeler » (`src/console/Relances.tsx`, `relances_list` / `relance_mark`) : Appeler, WhatsApp avec message prêt (`relanceMessage`), puis A payé / À rappeler / Pas intéressé ; taux de conversion affiché.

## Vitrine (livrée le 09/11/2026, tous les métiers)

- Écran « Ma vitrine » (`Vitrine.tsx`, `src/data/vitrine.ts`) : le patron ouvre sa vitrine (`vitrine_save` crée le code court `nom-xxx`), choisit les articles montrés (`products.vitrine`, photo `products.photo_path` dans le stockage public `vitrine/<shop_id>/…`), et pour un tailleur les modèles du Studio (`vitrines.models`). Partage : statut WhatsApp, Facebook, lien à copier (bio TikTok / Instagram).
- Page publique `jokkoapp.com/?v=<code>` (`VitrinePublic.tsx`, fonction `vitrine_public`) : articles et modèles, détail avec photo qui tourne, « Commander sur WhatsApp » vers `shops.phone` (message prérempli). Sans compte.
- Aperçu des liens partagés (WhatsApp, Facebook, TikTok) : `worker/index.js` (Worker Cloudflare, `run_worker_first: ["/"]`) réécrit titre, description et image Open Graph pour `?v=` et `?modele=` (données via `vitrine_public` / `modele_public`, cache 5 min). Le reste du site reste servi tel quel depuis `dist`.

## Page d'accueil : diaporama des métiers (09/11/2026)

- En haut de la page d'accueil (`MetierSlides.tsx`, styles `.ms` dans `landing.css`, à la place de l'ancienne scène du comptoir ; en premier sur téléphone) : alimentation, pharmacie, couture, quincaillerie, vêtements et chaussures, réparation. Une photo IA par métier, phrase dite, 3 fonctions, bouton qui pré-choisit le métier ; défile seul toutes les 5 s, se met en pause au toucher, glisser pour changer.
- Photos : fonction `accueil` (jeton `galerie_token`, appelée par SQL `net.http_post`) → `galerie/accueil/<métier>-v1.jpg` (4:5, 900 px, ≈ 200 Ko). **Une seule demande à la fois** (plusieurs = WORKER_RESOURCE_LIMIT). Pour changer une photo : nouvelle demande, puis `-v2` dans `MetierSlides.tsx`.

## À rappeler à Fallou (demandé le 09/11/2026)

- Dette remboursée (bouton « Il a payé » ou à la voix) : faire entrer l'argent dans la caisse du jour pour que la caisse du soir tombe juste. Fallou a dit « après on continue, tu me rappelles ».
- Suppression d'un achat de marchandise : retirer aussi les articles du stock (garder l'article et la quantité sur chaque achat).
- Tailleurs : « Ajouter mes modèles » (photos de ses créations dans sa galerie, essayables par ses clients).

## Routine hebdomadaire

1. Ouvrir l'onglet « Erreurs de Jokko » (7 jours) : taux wolof et français.
2. Corriger les phrases mal comprises qui reviennent (synonyme, modificateur, autre nom d'article, test dans `liveDesk.test.ts`). **Chaque phrase mal comprise entre dans l'examen de wolof** (`src/assistant/wolofExamen.json`) avec sa bonne réponse ; le score s'affiche à chaque CI et ne peut pas descendre sous le `seuil`.
3. Cocher « Corrigé », pousser, vérifier CI + Cloudflare, annoncer le nouveau taux à Fallou la semaine suivante.

## Publicités : toujours Modou

Toutes les publicités Jokko sont des épisodes de l'histoire de **Modou** (commerçant, boubou bleu à broderie jaune) et de son ami **Ibou** (boubou vert, kufi blanc). Fiche du personnage, style, voix et méthode : `marketing/modou/README.md`. Ne jamais changer leur apparence. Wolof en grand, un peu de français en petit ; nombres dits en wolof.

**Argent en wolof = dërëm (1 dërëm = 5 F)**, comme au comptoir et comme `francsToWolof()` : 4 000 F = « juróom ñetti téeméer », 8 000 F = « junni ak juróom benni téeméer ». Jamais « ñeenti junni » pour 4 000 F (= 20 000 F). Ajouter le montant en français (« mooy quatre mille francs »).
