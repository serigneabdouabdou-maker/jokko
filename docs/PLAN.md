# Feuille de route Jokko

Chef de projet : Claude. Une étape à la fois. Chaque étape est testée avant de passer à la suivante.

## Étape 1 — La voix (faite le 30/10/2026)

- [x] Une seule voix : suppression de la synthèse de secours et de la voix du navigateur.
- [x] Enregistrement automatique de chaque phrase complète, avec annulation par la voix ou le bouton.
- [x] Wolof de comptoir enrichi : chiffres, dërëm, noms wolof des articles (ceeb, diw, suukar…), verbes.
- [x] Réglage pour boutique bruyante (ne démarre pas sur un bruit, laisse finir la phrase).
- [x] Conversation longue : compression du contexte et reconnexion automatique.
- [x] Mode local corrigé (plus de fausse facture de 15 000 F), code mort supprimé.
- [x] Revue indépendante : double enregistrement si on coupe Jokko, client en double, mauvais article (sel/vaisselle) → corrigés et testés.
- [ ] Reprise de session Gemini (garder la question en cours lors d'une reconnexion) → étape 1 bis.
- [ ] Couper la voix pendant une conversation déjà ouverte (aujourd'hui : à la conversation suivante).
- [ ] **À tester par toi sur le téléphone** : 10 phrases réelles en boutique (voir la liste ci-dessous).

### Phrases de test

1. « Jaay naa ñaari bidon diw » → vente 15 000 F, stock huile baisse
2. « Déedéet » → la vente est annulée
3. « Ceeb bi ñaata la des ? » → réponse sur le stock de riz
4. « Moussa fey na juróomi junni » → la dette de Moussa baisse de 5 000 F
5. « Fatou bor na ñaari junni » → dette de 2 000 F pour Fatou
6. « Dama fey transport ñaari junni » → dépense 2 000 F
7. « Dugal fukki sac ceeb » → stock riz +10
8. « Ajoute une vente de 15 000 » → vente au comptoir
9. « Jaay naa » (incomplet) → Jokko demande « Ñaata ? » / « Ban produit ? »
10. Parler 15 minutes sans couper → la conversation continue

## Étape 2 — GitHub (sauvegarde du code)

- Créer le compte GitHub et le relier à Claude (claude.ai → Réglages → Connecteurs).
- Dépôt privé `jokko`, branche `main` protégée. Chaque amélioration passe par une branche puis une « pull request ».

## Étape 3 — Supabase (les données ne se perdent plus)

- Tables : boutiques, membres (patron/caissier), articles, clients, ventes, dépenses, factures, journal des écritures.
- Sécurité par ligne (RLS) : chaque commerçant ne voit que sa boutique.
- Mode hors ligne : l'appli continue sans internet et se synchronise après.
- L'annulation devient une écriture inverse dans le journal (traçable).

## Étape 4 — Connexion et sécurité

- Connexion par SMS (Supabase Auth, OTP par téléphone).
- Les routes `/api/assistant/*` exigent une session : personne ne peut utiliser la clé Gemini sans compte.
- Limite d'usage par boutique, plafond de coût Gemini.

## Étape 5 — Pour le commerçant le plus simple

- Écran « Parler » d'abord, très gros bouton micro, moins de texte.
- Installation sur le téléphone (PWA), fonctionne en 3G.
- Découper `App.tsx` en écrans séparés.

## Étape 6 — Mise en ligne

- Hébergement (serveur Node + Supabase), nom de domaine, suivi des erreurs.
- Test avec 3 vraies boutiques pendant une semaine, puis corrections.
