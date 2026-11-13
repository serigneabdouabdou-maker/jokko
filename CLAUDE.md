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
- **Un numéro = une entreprise par métier, sauf points de vente voulus** (règle de Fallou, 10/11/2026) : changer le métier vers un métier déjà pris ouvre l'entreprise existante (`shopWithMetier`), et le serveur refuse ce doublon par erreur (`private.shop_plan_guard`, « une entreprise par métier », abandonné par la synchro). Avec l'offre Avancé, « Mes entreprises » permet une autre boutique du même métier en cochant « deuxième point de vente » (articles repris si voulu, stock à zéro). Plusieurs boutiques dans le même lieu : un seul compte patron + comptes vendeurs (écran Équipe). Chaque entreprise garde ses données à part (`shop_id`).
- Tailleur : Atelier couture (mesures à la voix, commandes, avance/reste, suivi, rappel « habit prêt ») + Studio d'essayage. Les images IA ne s'ouvrent qu'aux tailleurs **payants** (rien d'avancé par CFC) et entrent, avec leur accord, dans la galerie commune signée Jokko.

- **IA par métier (12/11/2026, règle de Fallou : « la couture ne se mélange pas avec l'alimentation »)** : `src/data/metierWords.ts`. `localizeInstruction` remplace les exemples d'alimentation des consignes (direct `LIVE_INSTRUCTION`, vocal/écrit `SYSTEM_INSTRUCTION` via `instructionFor`, descriptions des outils) par ceux du métier (bazin/fil/boutons, ciment/fer/peinture, paracétamol/sirop…) ; alimentation et restaurant inchangés. `offTopicRule` (« RESTE DANS LE MÉTIER ») dans chaque consigne. Garde-fou du code (`liveDesk`, `foreignArticle`) : un article d'un autre métier absent du stock (riz chez un tailleur, ciment en pharmacie) → statut `hors_metier`, Jokko demande ; `horsMetierConfirme` après le oui ; une dépense passe toujours ; « Autre activité » jamais bloquée. Test : `server/assistant/metier.test.ts` (aucun riz/huile/sucre dans les consignes d'un autre métier).
- **Métier obligatoire (13/11/2026, règle de Fallou : « si l'utilisateur ne dit pas son activité, le système doit l'obliger à la définir »)** : `activityDefined` (`metiers.ts`) = faux pour vide, « Autre activité », « autre », « rien »… Inscription, nouvelle entreprise et changement de métier refusent de continuer sans activité (« Autre » oblige à l'écrire). Boutique déjà créée sans activité : écran `MetierGate` (`App.tsx`) pour le patron avant d'entrer, métier deviné d'après le nom (« Dabakh couture » → Couture), données gardées dans la même boutique ; si ce métier a déjà son entreprise, Jokko propose de l'ouvrir. Le 13/11 : 6 boutiques sur 17 sans activité (5 « Autre activité », 1 vide).
- **Carnet de mots par boutique (12/11/2026)** : Gemini comprend un article avec un mot que le code ne connaît pas (« getzner bleu » pour Bazin riche) → le mot devient un « autre nom » de l'article (`learnedWord`, `products.aliases`, synchronisé), pour cette boutique seulement, seulement s'il est dans la phrase dite ; oublié si l'écriture est annulée (`revert`). Le patron le voit et l'enlève dans la fiche de l'article. Réponse de l'outil : `mot_appris`.
- **Couper la parole à Jokko (12/11/2026)** : direct en `START_OF_ACTIVITY_INTERRUPTS` ; pendant que Jokko parle (ou que sa réponse attend la vérification des chiffres), le micro n'envoie rien sauf une voix forte et proche ≈ 0,3 s (`BargeIn`, `listenFilter.ts` ; plus strict en boutique « très bruyante ») → Jokko se tait (`silenceJokko`), le reste de sa phrase est jeté, le commerçant est entendu dès le début de sa phrase (400 ms gardées). Consigne « SI LE COMMERÇANT TE COUPE LA PAROLE » : répondre d'abord, puis redire seulement l'info utile (montant, question), garder le fil. Écritures des appels d'outil annulés par la coupure : défaites (`cancelCalls`).

## Restauration et boulangerie (livrées le 10/11/2026)

- Métiers `restauration` (restaurant, dibiterie, fast-food, jus, petit-déjeuner) et `boulangerie` dans `src/data/metiers.ts` ; module `cuisine` (ajoutable à une autre boutique dans les réglages).
- Écran « Plats du jour » / « Fournées » (`Cuisine.tsx`, calculs `src/data/cuisine.ts`) : un plat = un article (unité plat, portion, verre, bouteille, baguette…) dont le stock = portions préparées qui restent ; un toucher = 1 portion vendue (`sellDish`) ; « Préparer / Fournée » ajoute ; « Combien me coûte un plat ? » (ingrédients ÷ portions → `cost`) ; classement 7 jours par bénéfice ; fin de service = restes frais en perte (`endService`, dépense `perte`).
- Catalogue Jokko (`src/data/catalogue.ts`, 36 articles : plats, jus, pains) : photos carrées dans le stockage public `vitrine/catalogue/<id>.jpg` (fonction `accueil`, action `plat`, file `private.catalogue_queue` + cron `jokko-catalogue-plats` une par minute, qui s'arrête seul) ; le commerçant touche, met SON prix (`addFromCatalogue` : photo, autres noms wolof, montré sur la vitrine).
- Commande en ticket : toucher les photos remplit la commande (`addToCart`), un seul encaissement espèces / Wave / Orange Money / crédit d'un habitué (`checkout`).
- Boulangerie, tournée du matin (`src/data/tournee.ts`, colonne `clients.tournee`) : quantité habituelle par boutique cliente, « Livré » = vente à crédit en un toucher, « Retour » = pain rendu (la livraison du jour et la dette baissent, le pain revient au stock puis en perte avec la fin de service).
- Gemini : noms de plats et de jus courants dans la consigne (ceebu jën, yassa, mafé, dibi, bissap, bouye…) ; vivres wolof aussi pour la restauration. Boulangerie : pain livré aux boutiques à crédit = vente à crédit (dette).
- Après un changement de `src/data/metiers.ts` : redéployer `assistant` avec le nouveau numéro de version GitHub dans ses imports (sinon Gemini garde l'ancienne liste des métiers).

## Tickets de caisse et ticket Z (livrés le 10/11/2026, tous les métiers)

- Chaque vente reçoit un numéro de ticket qui se suit dans la journée (`sales.ticket`, `nextTicket` dans `applyDraft`) ; un encaissement à plusieurs lignes (scanner, commande du restaurant) = un seul numéro (`checkout`).
- Ticket client (`src/data/tickets.ts` `receiptText`, 32 caractères, sans accents) : aperçu `Receipt.tsx` avec « Imprimante Bluetooth » (Android, appli gratuite RawBT, lien `intent:base64,…` en ESC/POS), « Imprimer » (impression du téléphone, page 58 mm) et « WhatsApp ». Ouvert après chaque encaissement (Scanner, Plats du jour) et par le bouton « Ticket » de chaque vente.
- Ticket Z (Caisse) : nombre de tickets, du n° au n°, **numéros manquants** (ticket effacé après coup = trou, signalé en rouge), totaux par paiement, ventes sans ticket, dépenses, espèces comptées et écart. Double contrôle papier / logiciel.
- Scanner (grandes boutiques, `ScanCheckout.tsx`) : douchette USB (câble OTG) ou Bluetooth en mode clavier (HID), codes-barres et QR ; une lecture = frappes très rapides + Entrée, reconnue même si le curseur est resté dans « Argent reçu » ou « Cherche » (horodatage des touches `e.timeStamp`, le champ est remis comme avant). Testé : 51 lectures d'affilée → 46 lignes, total juste, un seul ticket de 65 lignes. Monnaie : « Compte juste » + billets rapides, « Reçu / Rendu » imprimés sur le ticket.
- Articles retirés avant encaissement (livré le 10/11/2026) : Scanner et Plats du jour gardent la plus grande quantité vue par article (`src/data/voids.ts`, crochet `useCartVoids.ts`) ; à l'encaissement, à « Vider » ou en quittant l'écran, ce qui manque est noté dans `cart_voids` (qui, quoi, combien ; jamais modifiable ni effaçable, `created_by` = vrai compte). Ticket Z et écran Caisse : « 7 articles retirés (… F) : 6 par Awa » ; pour le patron, liste « Retraits du jour » (heure, vendeur, articles, somme ; un geste = une ligne, `voidEvents`). Chaque soir 20 h 31, `private.voids_watch()` (cron `jokko-retraits-soir`) prévient le patron si un vendeur retire ≥ 5 articles et > 3 × sa moyenne des 14 jours.
- Dettes remboursées (livré le 10/11/2026) : « Il a payé » (avec Espèces / Wave / Orange Money) et `debt_payment` à la voix notent un remboursement (`addRepayment`, table `debt_payments`, jamais plus que la dette). Espèces → caisse attendue (`dayRepaid` dans `expectedCash`, ligne « + Dettes remboursées ») ; ticket Z « Dettes remboursees » par paiement, écart juste. Corriger / effacer une dette n'est pas un paiement.
- Achat supprimé = stock juste (livré le 10/11/2026) : chaque achat (`applyPurchase`) et chaque perte à la voix gardent `expenses.product_id` + `qty` (unités de gros). `removeExpense` : achat → articles retirés du stock (jamais sous 0), perte → articles remis ; le message de confirmation le dit. Anciennes lignes sans article : le stock ne bouge pas.
- Imprimante conseillée : thermique Bluetooth 58 mm (≈ 15 000 à 25 000 F à Dakar, hypothèse) ; 80 mm pour les supérettes à gros débit.
- Papier 80 mm (kits de caisse CFC, 12/11/2026) : choix « Papier 58 mm / 80 mm » dans l'aperçu du ticket, gardé sur chaque appareil (`src/data/printer.ts`, clé `jokko.papier`) ; 80 mm = 48 caractères, page 80 mm, zone 72 mm (`paperPage`). Ticket client et ticket Z suivent la largeur (`receiptFor().build`, `zText(…, paper)`). Caisse tactile Windows/Android : Chrome + jokkoapp.com installé en appli, imprimante USB par « Imprimer » (pilote installé, tiroir-caisse ouvert par le pilote de l'imprimante).

## Atelier des réparateurs : pièce + main-d'œuvre (13/11/2026, demande de Fallou)

- Le réparateur achète souvent la pièce exprès (écran 5 000) et fait payer pièce + travail (15 000) : `repairBreakdown` (prix = pièces + main-d'œuvre), écrit en clair sur chaque réparation (`Breakdown` dans `Atelier.tsx`), en rouge si la pièce coûte plus que le prix.
- Dépôt : calcul « prix d'achat de la pièce + main-d'œuvre = prix pour le client » (prix rempli tout seul, modifiable).
- « Réparé » : pièces du stock (sortent du stock) et/ou « pièce achetée exprès » (nom + prix d'achat) ; « Payée avec l'argent de la caisse » (coché par défaut) → sortie de caisse `kind: achat` « Pièce pour R-001 (…) : … » (caisse juste, pas une dépense du bénéfice ; le prix d'achat compte au rendu).
- En haut de l'Atelier : ce mois, réparations rendues, encaissé, pièces, main-d'œuvre gagnée (`workshopMonth`).
- À la voix : « R-001 réparé, écran Tecno à 5 000 » → pièce achetée 5 000, Jokko dit la main-d'œuvre (`main_oeuvre`) ; pièce sans prix → Jokko demande combien elle a coûté.
- Services sans pièce (13/11/2026) : décodage, déblocage, flash, configuration, création de compte, maintenance, imprimante… Catalogue de prix `shops.services` (jsonb, `ServiceItem`), « Ajouter les services courants », un toucher → prix (modifiable) → paiement → « Encaisser » : vente « Service · … » (`sellService`, `src/data/services.ts`, écran `Services.tsx` en haut de l'Atelier). Tout est main-d'œuvre (`isServicePayment`). À la voix : « décodage 5 000 » → service du catalogue (liveDesk, avant le garde-fou hors métier). Mots-clés du métier réparation : informatique, décodage, déblocage, maintenance.
- Licences des outils (décodage) : `shops.licences` (jsonb, `Licence` : nom, prix, début, mois). Achat payé avec la caisse → sortie `achat` (caisse juste) ; dans les Bénéfices, `licenceCharge` répartit le prix : prix ÷ mois par mois de licence (90 000 F / 12 = 7 500 F), au prorata d'un mois entamé ; ligne « Licences (part) » et catégorie dans « Où part ton argent ». Un service lié à une licence marque la vente (`sales.licence_id`) : « Mes licences » montre fin, jours restants, services faits, rapporté, % remboursé, « Renouveler » (à la suite de l'ancienne) quand il reste ≤ 30 jours. Migration `20261113_services_licences.sql`.
- Fiches clients du réparateur (13/11/2026) : `src/data/clientFiles.ts` + écran `ClientFiles.tsx` (en bas de l'Atelier). Historique par client à partir des données déjà enregistrées (réparations : appareil, panne, pièces, prix, garantie ; services ; achats ; dettes), visites (jours de dépôt, récupération, achat, service), dépensé, appareils, sous garantie, reste dû. Client reconnu au dépôt par son numéro (9 derniers chiffres) puis son nom (`clientFor` exporté, `knownClient`) : encart « Client connu » dans le formulaire de dépôt. Service : client facultatif (nom/téléphone) pour l'entrer dans sa fiche. Classement (note /100 : fréquence, argent, fraîcheur, paiement) et groupes : Fidèles (≥ 3 visites), Bons (2), Nouveaux (1), À relancer (≥ 3 visites mais rien depuis 60 j), Mauvais payeurs (dette en retard). Campagne WhatsApp par groupe : offre facultative, message prêt (`campaignMessage`), un toucher par client (rien n'est envoyé sans le patron).

## Bénéfices (13/11/2026, demande de Fallou)

- Écran « Bénéfices » (ancien « Bilan », patron seulement, `Bilan.tsx`, calculs `src/data/report.ts`) : ventes − prix d'achat de ce qui est vendu (`sales.cost`) = bénéfice sur les ventes ; − dépenses − pertes = gagné (ou perdu). Les achats de marchandise (`kind: achat`) ne sont pas des dépenses : leur coût compte quand l'article est vendu.
- Périodes : aujourd'hui, ce mois, mois dernier, cette année, l'an dernier ; tableau « Mois par mois » de l'année avec total (`monthlyReport`) et meilleur mois ; « Où part ton argent » (`expenseBreakdown` : électricité, transport, loyer, salaires…) ; ligne de calcul écrite en clair ; « Envoyer ce bilan sur WhatsApp » (`reportText`).
- Paiements de couture et de réparation (`isServicePayment`, libellés « Couture C-… » / « Réparation R-… ») : main-d'œuvre sans prix d'achat, comptée en entier ; les pièces posées sont sur le paiement « rendu ».
- En haut des Dépenses (patron) : bandeau du mois « bénéfice − dépenses = gagné » qui ouvre Bénéfices (`ProfitStrip`).

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
- Démarrage (12/11/2026, constat : 10 inscrits sur 15 sans aucune vente) : carte « Premiers pas » en haut de l'écran Parler pour le patron (`FirstSteps.tsx`, `src/data/firstSteps.ts`) : choisir son métier (si « Autre activité »), dire sa première vente (exemple du métier), mettre ses articles (≥ 3), noter un client, recevoir le résumé du soir (notifications + `summary_hour` 20 h) ; chaque geste se coche tout seul, « Masquer » gardé sur l'appareil. `trial_watch` ajoute la raison `demarrage` dans « À appeler » (inscrit depuis 24 h à 7 jours, aucune vente ni commande) avec un message WhatsApp d'aide (pas d'offre) ; une relance d'essai remplace ensuite la ligne. Mesure : part des inscrits avec ≥ 1 vente et revenus un autre jour (12/11 : 5/15 et 2/15).
- Démo par métier (12/11/2026, règle de Fallou : « chaque activité a sa propre démo ») : `src/data/demo.ts` a une entreprise exemple par métier (alimentation, pharmacie avec péremptions, quincaillerie avec chantiers, couture avec commandes et mesures, réparation avec dépôts, vêtements, restaurant avec plats, boulangerie avec tournée, multiservice, autre = cosmétiques). « Essayer la démo » ouvre celle du métier de la boutique (`demoProfile`) ; l'invitation et le bandeau suivent le métier (`demoInfo`) ; dans le bandeau, une liste permet de montrer la démo d'un autre métier chez un commerçant. Jamais de riz ou d'huile hors alimentation (testé dans `demo.test.ts`).

## Vitrine (livrée le 09/11/2026, tous les métiers)

- Écran « Ma vitrine » (`Vitrine.tsx`, `src/data/vitrine.ts`) : le patron ouvre sa vitrine (`vitrine_save` crée le code court `nom-xxx`), choisit les articles montrés (`products.vitrine`, photo `products.photo_path` dans le stockage public `vitrine/<shop_id>/…`), et pour un tailleur les modèles du Studio (`vitrines.models`). Partage : statut WhatsApp, Facebook, lien à copier (bio TikTok / Instagram).
- Page publique `jokkoapp.com/?v=<code>` (`VitrinePublic.tsx`, fonction `vitrine_public`) : articles et modèles, détail avec photo qui tourne, « Commander sur WhatsApp » vers `shops.phone` (message prérempli). Sans compte.
- Aperçu des liens partagés (WhatsApp, Facebook, TikTok) : `worker/index.js` (Worker Cloudflare, `run_worker_first: ["/"]`) réécrit titre, description et image Open Graph pour `?v=` et `?modele=` (données via `vitrine_public` / `modele_public`, cache 5 min). Le reste du site reste servi tel quel depuis `dist`.

## Page d'accueil : diaporama des métiers (09/11/2026)

- En haut de la page d'accueil (`MetierSlides.tsx`, styles `.ms` dans `landing.css`, à la place de l'ancienne scène du comptoir ; en premier sur téléphone) : alimentation, restaurant et jus, pharmacie, couture, quincaillerie, vêtements et chaussures, boulangerie, réparation (8). Une photo IA par métier, phrase dite, 3 fonctions, bouton qui pré-choisit le métier ; photo seule 1,6 s puis panneau blanc transparent qui monte avec les textes en foncé (mot clé surligné à la couleur du métier) ; défile seul toutes les 7,5 s, se met en pause au toucher, glisser pour changer.
- Photos : fonction `accueil` (jeton `galerie_token`, appelée par SQL `net.http_post`) → `galerie/accueil/<métier>-v1.jpg` (4:5, 900 px, ≈ 200 Ko). **Une seule demande à la fois** (plusieurs = WORKER_RESOURCE_LIMIT). Pour changer une photo : nouvelle demande, puis `-v2` dans `MetierSlides.tsx`.

- Vidéo « Jokko en 1 minute » (`LandingVideo.tsx`, juste après le diaporama) : épisode 4 de Modou (`marketing/modou/metiers.html`), fichier `public/media/jokko-metiers-v2.mp4` (720p, ≈ 4 Mo, 1 min 21 : 8 métiers dont restaurant et boulangerie) + affiche `.jpg` ; rien n'est chargé avant le toucher ; le service worker ne garde jamais `/media/` ni les `.mp4`. Bouton « Partager sur WhatsApp » (lien `#video`).

## Affiches publicitaires photo (10/11/2026)

- Fonction `accueil`, action `affiche` (`id`, `prompt`, `ratio`) : le vrai logo (`brand/officiel/jokko-teams-icon-1024.png`, lu sur GitHub) est donné à Gemini comme modèle → `galerie/marketing/<id>.jpg` (2K, ≈ 3 Mo, sans retouche). Une demande à la fois. Récupérer avec le workflow `assets.yml` (chemins séparés par des **virgules**).
- Série 1 : car-rapide, boutique, ndiaga-ndiaye, moto, panneau, famille (4:5, slogan « Wax rekk, Jokko bind », commerçant en boubou bleu à broderie jaune comme Modou).

## À rappeler à Fallou (demandé le 09/11/2026)

- Tailleurs : « Ajouter mes modèles » (photos de ses créations dans sa galerie, essayables par ses clients).

## Routine hebdomadaire

1. Ouvrir l'onglet « Erreurs de Jokko » (7 jours) : taux wolof et français.
2. Corriger les phrases mal comprises qui reviennent (synonyme, modificateur, autre nom d'article, test dans `liveDesk.test.ts`). **Chaque phrase mal comprise entre dans l'examen de wolof** (`src/assistant/wolofExamen.json`) avec sa bonne réponse ; le score s'affiche à chaque CI et ne peut pas descendre sous le `seuil`.
3. Cocher « Corrigé », pousser, vérifier CI + Cloudflare, annoncer le nouveau taux à Fallou la semaine suivante.

## Publicités : toujours Modou

Toutes les publicités Jokko sont des épisodes de l'histoire de **Modou** (commerçant, boubou bleu à broderie jaune) et de son ami **Ibou** (boubou vert, kufi blanc). Fiche du personnage, style, voix et méthode : `marketing/modou/README.md`. Ne jamais changer leur apparence. Wolof en grand, un peu de français en petit ; nombres dits en wolof.

**Argent en wolof = dërëm (1 dërëm = 5 F)**, comme au comptoir et comme `francsToWolof()` : 4 000 F = « juróom ñetti téeméer », 8 000 F = « junni ak juróom benni téeméer ». Jamais « ñeenti junni » pour 4 000 F (= 20 000 F). Ajouter le montant en français (« mooy quatre mille francs »).
